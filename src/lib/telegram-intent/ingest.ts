import { redactPII } from './redactor';
import { passesPrefilter } from './prefilter';
import { computeAuthorHash } from './hasher';
import { classifySignal, SignalClassification } from './classifier';

export interface RawTelegramMessage {
  workspace_id: string;
  source_id: string;
  tg_chat_id: number | string;
  tg_message_id: number | string;
  tg_user_id: number | string;
  public_username?: string;
  display_name?: string;
  raw_text: string;
  posted_at: Date | string;
}

export interface IngestResult {
  processed: boolean;
  reason?: string;
  signalId?: string;
  tier?: string;
}

export async function processTelegramMessage(
  msg: RawTelegramMessage,
  dbClient: any
): Promise<IngestResult> {
  // Step 1: PII Redactor (§6.4)
  const { cleanedText, redactionApplied } = redactPII(msg.raw_text);

  // Step 2: Prefilter Gate (§6.1)
  if (!passesPrefilter(cleanedText)) {
    return { processed: false, reason: 'failed_prefilter' };
  }

  // Step 3: LLM Classification (§6.2 & §6.3)
  const classification = await classifySignal(cleanedText);
  if (!classification) {
    // T5 Noise or failed verbatim check -> DISCARDED immediately (§3 Architecture Flow)
    return { processed: false, reason: 'classified_noise_t5' };
  }

  // Step 4: Pseudonymous Author Hash (§4.2)
  const authorHash = computeAuthorHash(msg.tg_user_id);

  // Upsert Pseudonymous Author
  const { data: authorData, error: authorErr } = await dbClient
    .from('tg_authors')
    .upsert({
      workspace_id: msg.workspace_id,
      author_hash: authorHash,
      public_username: msg.public_username || null,
      display_name: msg.display_name || null,
      last_seen_at: new Date().toISOString()
    }, { onConflict: 'workspace_id,author_hash' })
    .select('id')
    .single();

  if (authorErr || !authorData) {
    console.error('[Ingest] Failed to upsert tg_author:', authorErr);
    return { processed: false, reason: 'author_upsert_failed' };
  }

  // Step 5: Save Signal (§4.3)
  const { data: signalData, error: signalErr } = await dbClient
    .from('tg_signals')
    .insert({
      workspace_id: msg.workspace_id,
      source_id: msg.source_id,
      author_id: authorData.id,
      tg_message_id: msg.tg_message_id,
      message_text: cleanedText,
      redaction_applied: redactionApplied,
      posted_at: new Date(msg.posted_at).toISOString(),
      intent_tier: classification.intent_tier,
      intent_category: classification.intent_category,
      confidence: classification.confidence,
      evidence_span: classification.evidence_span,
      classifier_version: classification.classifier_version,
      classifier_model: classification.classifier_model,
      status: 'new'
    })
    .select('id')
    .single();

  if (signalErr) {
    console.error('[Ingest] Failed to insert tg_signal:', signalErr);
    return { processed: false, reason: 'signal_insert_failed' };
  }

  return {
    processed: true,
    signalId: signalData.id,
    tier: classification.intent_tier
  };
}

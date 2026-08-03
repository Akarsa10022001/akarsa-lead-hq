import { callLLM } from '../llm';

export interface SignalClassification {
  intent_tier: 'T1' | 'T2' | 'T3' | 'T4';
  intent_category: 'explicit_request' | 'stated_problem' | 'dissatisfaction' | 'trigger_event';
  confidence: number;
  evidence_span: string;
  classifier_version: string;
  classifier_model: string;
}

const CLASSIFIER_VERSION = 'v1.0';
const CLASSIFIER_MODEL = 'groq-llama-3.3-70b';

const SYSTEM_PROMPT = `
You are the Intent Classifier for Akarsa Lead HQ. Your job is to classify Telegram community messages for commercial intent.

RUBRIC:
- T1: Explicit request for a provider (e.g. "Anyone know a good Meta ads agency?")
- T2: Stated in-domain problem, no ask (e.g. "ROAS 0.7 se upar nahi ja raha 2 months se")
- T3: Trigger event (e.g. New store launch, funding, hiring a marketer, expansion)
- T4: Weak / monitor only (Adjacent discussion with personal stake)
- T5: Noise / Not relevant -> Respond with {"intent_tier": "T5"}

CRITICAL ANTI-FABRICATION RULES:
1. "evidence_span" MUST be an EXACT VERBATIM SUBSTRING of the message text. Do NOT paraphrase.
2. Never infer budget, revenue, company size, headcount, or decision-making authority not stated in the message.
3. Ambiguity lowers confidence, never raises tier.
4. Output JSON strictly matching:
{
  "intent_tier": "T1" | "T2" | "T3" | "T4" | "T5",
  "intent_category": "explicit_request" | "stated_problem" | "dissatisfaction" | "trigger_event",
  "confidence": 0.85,
  "evidence_span": "<exact verbatim quote from input text>"
}
`;

export async function classifySignal(messageText: string): Promise<SignalClassification | null> {
  if (!messageText || messageText.length < 15) return null;

  try {
    const responseText = await callLLM({
      task: 'telegram_intent_classification',
      prompt: `${SYSTEM_PROMPT}\n\nClassify this message:\n"${messageText}"`
    });

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    // T5 Noise is DISCARDED immediately — never stored to disk
    if (!parsed.intent_tier || parsed.intent_tier === 'T5') {
      return null;
    }

    const evidenceSpan = parsed.evidence_span || '';

    // Enforce Verbatim Integrity Check (§4.3 DB constraint evidence_span_is_verbatim)
    let validSpan = evidenceSpan;
    if (!messageText.includes(validSpan)) {
      // Fallback: Find longest matching phrase if model paraphrased
      const words = validSpan.split(' ');
      let foundSub = '';
      for (let i = 0; i < words.length; i++) {
        for (let j = words.length; j > i; j--) {
          const sub = words.slice(i, j).join(' ');
          if (sub.length > 8 && messageText.includes(sub)) {
            if (sub.length > foundSub.length) foundSub = sub;
          }
        }
      }
      if (foundSub) {
        validSpan = foundSub;
      } else {
        // Drop signal if evidence span cannot be matched verbatim (Anti-Fabrication Rule 1)
        console.warn('[Classifier] Dropped signal: evidence_span is not verbatim substring');
        return null;
      }
    }

    return {
      intent_tier: parsed.intent_tier,
      intent_category: parsed.intent_category || 'explicit_request',
      confidence: Math.min(Math.max(Number(parsed.confidence) || 0.70, 0), 1),
      evidence_span: validSpan,
      classifier_version: CLASSIFIER_VERSION,
      classifier_model: CLASSIFIER_MODEL
    };
  } catch (err) {
    console.error('[Classifier] Error classifying signal:', err);
    return null;
  }
}

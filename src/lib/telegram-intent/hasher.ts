import { createHash } from 'crypto';

/**
 * Telegram Ingest Module — Pseudonymous Author Hasher (§4.2)
 * Computes sha256(pepper || tg_user_id) to store a stable pseudonym.
 * Never stores raw Telegram User IDs.
 */
export function computeAuthorHash(tgUserId: string | number): string {
  const pepper = process.env.TG_AUTHOR_PEPPER || 'akarsa_tg_pepper_default_2026';
  return createHash('sha256')
    .update(`${pepper}:${tgUserId}`)
    .digest('hex');
}

/**
 * Telegram Ingest Module — Prefilter Gate (§6.1)
 * Cheap regex/keyword gate before any LLM call.
 * Discards ~95% of noise — never persisted or billed.
 * Includes Hinglish & English seed terms.
 */

const PREFILTER_KEYWORDS = [
  'agency', 'freelancer', 'recommend', 'suggest koi', 'koi hai', 'looking for', 'need someone',
  'ads', 'meta ads', 'google ads', 'performance marketing', 'roas', 'cac', 'cpl', 'conversion',
  'not converting', 'waste ho raha', 'budget burn', 'leads nahi aa rahe',
  'scale karna hai', 'launch', 'funding', 'hiring marketer', 'developer chahiye',
  'website banana hai', 'designer chahiye', 'need website', 'looking for team', 'rfp'
];

const PREFILTER_REGEX = new RegExp(
  PREFILTER_KEYWORDS.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'i'
);

export function passesPrefilter(text: string): boolean {
  if (!text || text.trim().length < 15) return false;
  return PREFILTER_REGEX.test(text);
}

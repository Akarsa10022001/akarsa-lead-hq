/**
 * Telegram Ingest Module — PII Redactor (§6.4)
 * Strips phone and email patterns before anything is stored or sent to the classifier.
 */

// Phone pattern handles international numbers (+91 98765 43210, +1 (555) 000-0000, 10-digit numbers)
const PHONE_REGEX = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{2,5}\)?[\s.-]?\d{3,5}[\s.-]?\d{3,5}|\b\d{10}\b/g;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export interface RedactionResult {
  cleanedText: string;
  redactionApplied: boolean;
}

export function redactPII(text: string): RedactionResult {
  if (!text) return { cleanedText: '', redactionApplied: false };

  let redactionApplied = false;
  let cleanedText = text;

  // Use fresh regexes or reset lastIndex to avoid JS global regex state bug
  const phoneMatches = cleanedText.match(PHONE_REGEX);
  if (phoneMatches && phoneMatches.length > 0) {
    cleanedText = cleanedText.replace(PHONE_REGEX, '[REDACTED_PHONE]');
    redactionApplied = true;
  }

  const emailMatches = cleanedText.match(EMAIL_REGEX);
  if (emailMatches && emailMatches.length > 0) {
    cleanedText = cleanedText.replace(EMAIL_REGEX, '[REDACTED_EMAIL]');
    redactionApplied = true;
  }

  return { cleanedText, redactionApplied };
}

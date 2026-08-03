/**
 * Telegram Ingest Module — PII Redactor (§6.4)
 * Strips phone and email patterns before anything is stored or sent to the classifier.
 */

const PHONE_REGEX = /(\+?\d{1,3}[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}|\b\d{10}\b/g;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export interface RedactionResult {
  cleanedText: string;
  redactionApplied: boolean;
}

export function redactPII(text: string): RedactionResult {
  if (!text) return { cleanedText: '', redactionApplied: false };

  let redactionApplied = false;
  let cleanedText = text;

  if (PHONE_REGEX.test(cleanedText)) {
    cleanedText = cleanedText.replace(PHONE_REGEX, '[REDACTED_PHONE]');
    redactionApplied = true;
  }

  if (EMAIL_REGEX.test(cleanedText)) {
    cleanedText = cleanedText.replace(EMAIL_REGEX, '[REDACTED_EMAIL]');
    redactionApplied = true;
  }

  return { cleanedText, redactionApplied };
}

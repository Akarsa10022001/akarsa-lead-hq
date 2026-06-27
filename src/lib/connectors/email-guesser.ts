import dns from 'dns';

/**
 * Email Pattern Guesser + MX Verifier (100% Free)
 * 
 * Given a domain (e.g. "dominos.co.in"), generates common business email
 * patterns and verifies that the domain can receive email via MX record check.
 */

// Common business email patterns, ordered by likelihood
const COMMON_PREFIXES = [
  'info',
  'hello',
  'contact',
  'enquiry',
  'enquiries',
  'sales',
  'support',
  'office',
  'mail',
  'admin',
  'general',
  'business',
  'team',
  'help',
];

/**
 * Check if a domain has valid MX records (can receive email).
 * Returns the MX records if found, null if not.
 */
export async function checkMxRecords(domain: string): Promise<dns.MxRecord[] | null> {
  try {
    const records = await dns.promises.resolveMx(domain);
    if (records && records.length > 0) {
      return records.sort((a, b) => a.priority - b.priority);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Generate candidate email addresses for a domain.
 * Only returns emails if the domain has valid MX records.
 */
export async function guessEmails(domain: string): Promise<{
  candidates: string[];
  mx_verified: boolean;
  mx_records: string[];
}> {
  // First, verify the domain can receive email
  const mxRecords = await checkMxRecords(domain);

  if (!mxRecords) {
    return {
      candidates: [],
      mx_verified: false,
      mx_records: []
    };
  }

  // Domain has MX records — generate candidates
  const candidates = COMMON_PREFIXES.map(prefix => `${prefix}@${domain}`);

  return {
    candidates,
    mx_verified: true,
    mx_records: mxRecords.map(r => r.exchange)
  };
}

/**
 * Given a person's name and domain, generate personal email candidates.
 */
export function guessPersonalEmails(firstName: string, lastName: string, domain: string): string[] {
  const f = firstName.toLowerCase().trim();
  const l = lastName.toLowerCase().trim();

  if (!f || !domain) return [];

  const candidates = [
    `${f}@${domain}`,
  ];

  if (l) {
    candidates.push(
      `${f}.${l}@${domain}`,
      `${f}${l}@${domain}`,
      `${f[0]}${l}@${domain}`,
      `${f}_${l}@${domain}`,
      `${f[0]}.${l}@${domain}`,
    );
  }

  return candidates;
}

/**
 * Perform a comprehensive email verification:
 * 1. Syntax check
 * 2. MX record check on domain
 * Returns whether the email is likely valid.
 */
export async function verifyEmail(email: string): Promise<{
  valid: boolean;
  reason: string;
}> {
  // 1. Basic syntax check
  const syntaxRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  if (!syntaxRegex.test(email)) {
    return { valid: false, reason: 'Invalid syntax' };
  }

  // 2. Extract domain
  const domain = email.split('@')[1];
  if (!domain) {
    return { valid: false, reason: 'No domain found' };
  }

  // 3. Check for disposable email domains
  const disposableDomains = ['mailinator.com', 'tempmail.com', 'throwaway.email', 'guerrillamail.com', 'yopmail.com'];
  if (disposableDomains.includes(domain.toLowerCase())) {
    return { valid: false, reason: 'Disposable email domain' };
  }

  // 4. MX record check
  const mxRecords = await checkMxRecords(domain);
  if (!mxRecords) {
    return { valid: false, reason: 'Domain has no MX records (cannot receive email)' };
  }

  return { valid: true, reason: `MX verified via ${mxRecords[0].exchange}` };
}

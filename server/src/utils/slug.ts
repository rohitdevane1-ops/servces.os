import crypto from 'node:crypto';

/**
 * Converts Latin, Arabic, or general Unicode names into a normalized URL-safe slug,
 * falling back to a random hex suffix only if no letter/number characters remain.
 */
export function toUnicodeSlug(input: string, fallbackPrefix = 'item'): string {
  const cleaned = input
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90)
    .replace(/-+$/g, '');

  if (cleaned.length > 0) {
    return cleaned;
  }
  return `${fallbackPrefix}-${crypto.randomBytes(4).toString('hex')}`;
}

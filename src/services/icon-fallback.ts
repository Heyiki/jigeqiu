export type IconFallback =
  | { kind: 'han-pair'; first: string; second: string }
  | { kind: 'initial'; text: string }
  | { kind: 'generic' };

const han = /^\p{Script=Han}$/u;
const alphanumeric = /^[\p{L}\p{N}]/u;
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function getIconFallbackTone(title: string, url: string): number {
  let identity = title.trim().normalize('NFKC');
  try {
    const parsed = new URL(url);
    if (['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password) {
      identity = parsed.hostname.replace(/^www\./i, '');
    }
  } catch { /* A missing website uses its normalized title for a stable color. */ }
  let hash = 0;
  for (const character of identity) hash = (Math.imul(hash, 31) + character.codePointAt(0)!) >>> 0;
  return hash % 6;
}

export function getIconFallback(title: string, url: string): IconFallback {
  const characters = Array.from(segmenter.segment(title.trim().normalize('NFKC')), item => item.segment);
  const [first, second] = characters;
  if (first && han.test(first) && second && han.test(second)) return { kind: 'han-pair', first, second };
  if (first && alphanumeric.test(first)) {
    // Some uppercase mappings expand to multiple letters; keep a single initial.
    const text = Array.from(segmenter.segment(first.toLocaleUpperCase()), item => item.segment)[0];
    return { kind: 'initial', text };
  }
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) return { kind: 'generic' };
    const initial = parsed.hostname.replace(/^www\./i, '')[0];
    if (initial && alphanumeric.test(initial)) return { kind: 'initial', text: initial.toUpperCase() };
  } catch { /* Invalid or missing URLs use the generic fallback. */ }
  return { kind: 'generic' };
}

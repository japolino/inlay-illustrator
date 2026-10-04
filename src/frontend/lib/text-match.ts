/**
 * Text matching for search fields and $name mentions: NFKC + lower-case substring (AM `vf` 100556),
 * plus Hangul-aware matching (AM zoom mention search): NFD jamo prefix/substring ("서ㅇ" finds "서연")
 * and initial-consonant (chosung) search ("ㅎㅅㅇ" finds "한서연").
 */
const SYLLABLE_BASE = 0xac00;
const SYLLABLE_LAST = 0xd7a3;
const INITIALS = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
const MEDIALS = ["ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ", "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ"];
const FINALS = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
/** Compound jamo split so "ㄳ" / "ㅘ" compare piecewise. */
const COMPOUND: Record<string, string> = {
  "ㄳ": "ㄱㅅ", "ㄵ": "ㄴㅈ", "ㄶ": "ㄴㅎ", "ㄺ": "ㄹㄱ", "ㄻ": "ㄹㅁ", "ㄼ": "ㄹㅂ", "ㄽ": "ㄹㅅ", "ㄾ": "ㄹㅌ", "ㄿ": "ㄹㅍ", "ㅀ": "ㄹㅎ", "ㅄ": "ㅂㅅ",
  "ㅘ": "ㅗㅏ", "ㅙ": "ㅗㅐ", "ㅚ": "ㅗㅣ", "ㅝ": "ㅜㅓ", "ㅞ": "ㅜㅔ", "ㅟ": "ㅜㅣ", "ㅢ": "ㅡㅣ"
};
const INITIAL_SET = new Set(INITIALS);

/** NFKC turns compatibility jamo (ㅇ U+3147) into conjoining jamo (U+110B); map them back. */
function conjoiningToCompat(char: string): string {
  const code = char.codePointAt(0)!;
  if (code >= 0x1100 && code <= 0x1112) return INITIALS[code - 0x1100]!;
  if (code >= 0x1161 && code <= 0x1175) return MEDIALS[code - 0x1161]!;
  if (code >= 0x11a8 && code <= 0x11c2) return FINALS[code - 0x11a7]!;
  return char;
}

export function normalizeSearchText(value: string): string {
  const nfkc = value.normalize("NFKC").toLocaleLowerCase();
  return /[\u1100-\u11ff]/u.test(nfkc) ? Array.from(nfkc, conjoiningToCompat).join("") : nfkc;
}

/** Splits Hangul syllables into compatibility jamo (other characters unchanged). */
export function toJamo(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (code >= SYLLABLE_BASE && code <= SYLLABLE_LAST) {
      const index = code - SYLLABLE_BASE;
      const initial = INITIALS[Math.floor(index / 588)]!;
      const medial = MEDIALS[Math.floor((index % 588) / 28)]!;
      const final = FINALS[index % 28]!;
      out += initial + (COMPOUND[medial] ?? medial) + (COMPOUND[final] ?? final);
    } else {
      out += COMPOUND[char] ?? char;
    }
  }
  return out;
}

/** Initial consonants of Hangul syllables (other characters kept). */
export function toChosung(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0)!;
    out += code >= SYLLABLE_BASE && code <= SYLLABLE_LAST ? INITIALS[Math.floor((code - SYLLABLE_BASE) / 588)]! : char;
  }
  return out;
}

function isChosungOnly(token: string): boolean {
  for (const char of token) if (!INITIAL_SET.has(char)) return false;
  return token.length > 0;
}

/** True when one query token matches the (normalized) haystack. */
export function matchToken(token: string, haystack: string): boolean {
  if (!token) return true;
  if (haystack.includes(token)) return true;
  if (/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7a3]/u.test(token)) {
    if (isChosungOnly(token) && toChosung(haystack).includes(token)) return true;
    if (toJamo(haystack).includes(toJamo(token))) return true;
  }
  return false;
}

/** AM `vf`: every whitespace token of the query must match the joined fields. Empty query matches. */
export function matchesQuery(query: string, fields: ReadonlyArray<string | null | undefined>): boolean {
  const tokens = normalizeSearchText(query).split(/\s+/u).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = normalizeSearchText(fields.filter(Boolean).join(" "));
  return tokens.every((token) => matchToken(token, haystack));
}

/** Rank for mention suggestions: 0 prefix, 1 substring, 2 jamo/chosung, -1 no match. */
export function matchRank(query: string, candidate: string): number {
  const q = normalizeSearchText(query.trim());
  const c = normalizeSearchText(candidate);
  if (!q) return 0;
  if (c.startsWith(q)) return 0;
  if (c.includes(q)) return 1;
  return matchToken(q, c) ? 2 : -1;
}

// Shared ASCII name folding for cross-source player/team matching.
//
// NFD strips combining accents (é→e, ü→u…). But several Latin letters do NOT
// decompose to a-z and would otherwise be dropped — breaking matches between a
// provider's proper spelling and our ASCII-folded data:
//   Turkish ı/İ, Nordic ø/Ø, Polish ł/Ł, Croatian đ/Đ, Icelandic ð/Ð þ/Þ,
//   German ß, ligatures æ/œ, Maltese ħ, Sami ŋ, etc.
// These are folded explicitly so e.g. "Çakır" and "Cakir" both key to "cakir".

const FOLD: Record<string, string> = {
  ı: 'i', İ: 'i', ø: 'o', Ø: 'o', ł: 'l', Ł: 'l',
  đ: 'd', Đ: 'd', ð: 'd', Ð: 'd', þ: 'th', Þ: 'th',
  ß: 'ss', æ: 'ae', Æ: 'ae', œ: 'oe', Œ: 'oe',
  ħ: 'h', Ħ: 'h', ŋ: 'n', Ŋ: 'n', ĸ: 'k', ŉ: 'n',
}

/** NFD-strip diacritics, then fold non-decomposing Latin letters to ASCII. */
export function foldAscii(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[ıİøØłŁđĐðÐþÞßæÆœŒħĦŋŊĸŉ]/g, (c) => FOLD[c] ?? c)
}

/** Letters-only lowercase key for matching a person's name across data sources. */
export function nameKey(s: string): string {
  return foldAscii(s).toLowerCase().replace(/[^a-z]/g, '')
}

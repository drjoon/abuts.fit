const HANGUL_BASE = 0xac00;
const HANGUL_END = 0xd7a3;
const CHOSEONG = [
  "g",
  "kk",
  "n",
  "d",
  "tt",
  "r",
  "m",
  "b",
  "pp",
  "s",
  "ss",
  "",
  "j",
  "jj",
  "ch",
  "k",
  "t",
  "p",
  "h",
];
const JUNGSEONG = [
  "a",
  "ae",
  "ya",
  "yae",
  "eo",
  "e",
  "yeo",
  "ye",
  "o",
  "wa",
  "wae",
  "oe",
  "yo",
  "u",
  "wo",
  "we",
  "wi",
  "yu",
  "eu",
  "ui",
  "i",
];
const JONGSEONG = [
  "",
  "k",
  "k",
  "ks",
  "n",
  "nj",
  "nh",
  "t",
  "l",
  "lk",
  "lm",
  "lb",
  "ls",
  "lt",
  "lp",
  "lh",
  "m",
  "p",
  "ps",
  "t",
  "t",
  "ng",
  "t",
  "t",
  "k",
  "t",
  "p",
  "h",
];

const romanizeHangulSyllable = (ch) => {
  const code = ch.charCodeAt(0);
  if (code < HANGUL_BASE || code > HANGUL_END) return "";

  const sIndex = code - HANGUL_BASE;
  const cho = Math.floor(sIndex / (21 * 28));
  const jung = Math.floor((sIndex % (21 * 28)) / 28);
  const jong = sIndex % 28;

  return `${CHOSEONG[cho]}${JUNGSEONG[jung]}${JONGSEONG[jong]}`;
};

export function toAsciiSlug(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";

  let out = "";
  for (const ch of raw) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      out += romanizeHangulSyllable(ch);
      continue;
    }
    if ((code >= 97 && code <= 122) || (code >= 48 && code <= 57)) {
      out += ch;
      continue;
    }
    if (ch === " " || ch === "-" || ch === "_") {
      out += "-";
      continue;
    }
  }

  return out
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

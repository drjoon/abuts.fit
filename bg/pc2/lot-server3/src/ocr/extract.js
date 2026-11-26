// change-log:
// - 2026-11-23: 각인 로트는 영문 대문자 3글자. 백엔드 extractLotSuffix3 와 같은 규칙.
// related files:
// - bg/pc2/lot-server2/src/ocr/index.js
// - web/backend/controllers/ai/lotCapture.controller.js

/** @param {string | null | undefined} value */
export function extractLotSuffix3(value) {
  const s = String(value || "").toUpperCase();
  const match = s.match(/[A-Z]{3}(?!.*[A-Z])/);
  return match ? match[0] : "";
}

const RESERVED = new Set(["CAP", "AF", "LOT", "IMG", "JPG", "PNG", "USB"]);

/** OCR 원문에서 유효한 3글자만 고른다. */
export function pickLotFromOcrText(text) {
  const upper = String(text || "").toUpperCase();
  const standalone = [];
  for (const match of upper.matchAll(/(?:^|[^A-Z])([A-Z]{3})(?=[^A-Z]|$)/g)) {
    standalone.push(match[1]);
  }
  for (let i = standalone.length - 1; i >= 0; i -= 1) {
    if (!RESERVED.has(standalone[i])) return standalone[i];
  }
  const spaced = upper.match(/\b([A-Z])\s+([A-Z])\s+([A-Z])\b/);
  if (spaced) {
    const token = `${spaced[1]}${spaced[2]}${spaced[3]}`;
    if (!RESERVED.has(token)) return token;
  }
  const compacted = upper.replace(/[^A-Z]/g, "");
  if (compacted.length === 3 && !RESERVED.has(compacted)) return compacted;
  return extractLotSuffix3(upper);
}

export function isValidLot(lot) {
  return /^[A-Z]{3}$/.test(String(lot || "")) && !RESERVED.has(String(lot));
}

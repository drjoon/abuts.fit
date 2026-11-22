// change-log:
// - 2026-11-23: 로컬 OCR로 영문 대문자 3글자 로트를 읽는다. Gemini 등 외부 AI 호출 없음.
// related files:
// - bg/pc2/lot-server2/src/ocr/engine.js
// - bg/pc2/lot-server2/src/ocr/extract.js
// - bg/pc2/lot-server2/src/watch.js

import fs from "fs/promises";
import { runOcr } from "./engine.js";
import { isValidLot, pickLotFromOcrText } from "./extract.js";
import { buildOcrVariants } from "./preprocess.js";

/**
 * @param {Buffer | string} input 이미지 버퍼 또는 파일 경로
 * @returns {Promise<{
 *   success: boolean,
 *   lot: string,
 *   confidence: number,
 *   rawText: string,
 *   provider: "local-ocr",
 * }>}
 */
export async function recognizeLot(input) {
  const buffer =
    typeof input === "string" ? await fs.readFile(input) : Buffer.from(input);
  const variants = await buildOcrVariants(buffer);

  let best = {
    lot: "",
    confidence: 0,
    rawText: "",
  };

  for (const variant of variants) {
    const { text, confidence } = await runOcr(variant);
    const lot = pickLotFromOcrText(text);
    if (!isValidLot(lot)) continue;
    if (confidence >= best.confidence) {
      best = { lot, confidence, rawText: text };
    }
    if (confidence >= 70) break;
  }

  return {
    success: isValidLot(best.lot),
    lot: best.lot,
    confidence: best.confidence,
    rawText: best.rawText.trim(),
    provider: "local-ocr",
  };
}

export { extractLotSuffix3, isValidLot, pickLotFromOcrText } from "./extract.js";
export { disposeOcrWorker } from "./engine.js";

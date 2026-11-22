// change-log:
// - 2026-11-23: tesseract.js 워커를 내부 OCR 엔진으로 감싼다. 클라우드 AI 없음.
// related files:
// - bg/pc2/lot-server2/src/ocr/index.js

import { createWorker } from "tesseract.js";

/** @type {import('tesseract.js').Worker | null} */
let worker = null;
let starting = null;

export async function getOcrWorker() {
  if (worker) return worker;
  if (starting) return starting;
  starting = (async () => {
    const w = await createWorker("eng", 1, {
      logger: () => {},
    });
    await w.setParameters({
      tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      tessedit_pageseg_mode: "7",
    });
    worker = w;
    starting = null;
    return w;
  })();
  return starting;
}

/**
 * @param {Buffer} image
 * @returns {Promise<{ text: string, confidence: number }>}
 */
export async function runOcr(image) {
  const w = await getOcrWorker();
  const result = await w.recognize(image);
  const text = String(result?.data?.text || "");
  const confidence = Number(result?.data?.confidence || 0);
  return { text, confidence };
}

export async function disposeOcrWorker() {
  if (!worker) return;
  const w = worker;
  worker = null;
  await w.terminate().catch(() => {});
}

// change-log:
// - 2026-11-26: 글자 1개용 워커(psm 10) 추가. runOcr(image, { mode: "char" }).
// - 2026-11-26: 학습 데이터 캐시를 프로젝트 ocr-cache/로 고정(기동 폴더와 무관). LOT_OCR_LANG_PATH로 오프라인 경로 지정.
// - 2026-11-23: tesseract.js 워커를 내부 OCR 엔진으로 감싼다. 클라우드 AI 없음.
// related files:
// - bg/pc2/lot-server2/src/ocr/index.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createWorker } from "tesseract.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const OCR_CACHE_DIR = path.resolve(__dirname, "../../ocr-cache");

/** @type {Map<string, import('tesseract.js').Worker>} */
const workers = new Map();
/** @type {Map<string, Promise<import('tesseract.js').Worker>>} */
const starting = new Map();

// line: 한 줄(psm 7), char: 글자 하나(psm 10).
const PSM = { line: "7", char: "10" };

export async function getOcrWorker(mode = "line") {
  const key = PSM[mode] ? mode : "line";
  if (workers.has(key)) return workers.get(key);
  if (starting.has(key)) return starting.get(key);
  const promise = (async () => {
    fs.mkdirSync(OCR_CACHE_DIR, { recursive: true });
    const options = {
      logger: () => {},
      // 첫 실행에 eng.traineddata를 받아 여기 둔다. 이후 오프라인으로 동작.
      cachePath: OCR_CACHE_DIR,
    };
    if (process.env.LOT_OCR_LANG_PATH) options.langPath = process.env.LOT_OCR_LANG_PATH;
    const w = await createWorker("eng", 1, options);
    await w.setParameters({
      tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      tessedit_pageseg_mode: PSM[key],
    });
    workers.set(key, w);
    starting.delete(key);
    return w;
  })();
  starting.set(key, promise);
  // 실패하면 다음 호출에서 다시 시도한다.
  promise.catch(() => starting.delete(key));
  return promise;
}

/**
 * @param {Buffer} image
 * @returns {Promise<{ text: string, confidence: number }>}
 */
export async function runOcr(image, { mode = "line" } = {}) {
  const w = await getOcrWorker(mode);
  const result = await w.recognize(image);
  const text = String(result?.data?.text || "");
  const confidence = Number(result?.data?.confidence || 0);
  return { text, confidence };
}

export async function disposeOcrWorker() {
  const list = [...workers.values()];
  workers.clear();
  await Promise.all(list.map((w) => w.terminate().catch(() => {})));
}

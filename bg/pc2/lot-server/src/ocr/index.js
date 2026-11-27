// change-log:
// - 2026-11-27: 각인 전용 인식(src/engrave)을 먼저 쓴다. LOT_RECOGNIZER=engrave(기본)|tesseract|both.
//   engrave: 각인 모델만(모델 파일이 없을 때만 Tesseract). both: 각인이 못 읽으면(실패·모호) Tesseract로 다시(목록 밖 판독이면 거기서 멈춤).
//   profile(지그 프로필)은 opts.profile, 없으면 활성 프로필.
// - 2026-11-27: allowed(지금 세척.패킹 대기 목록의 3글자 코드)를 주면 1위 판독이 목록에 있을 때만 성공. 후보를 미리 거르지 않는다
//   (목록 밖 1위를 지우면 목록 안의 약한 2위가 올라와 엉뚱한 의뢰가 넘어갈 수 있다).
// - 2026-11-26: 1단계 글자 단위 판독(chars.js, 자리별 투표, 한 줄 판독 일치 가점, 180도 모호하면 미확정). 못 읽으면 2단계 한 줄 판독.
// - 2026-11-26: 후보 지연 생성. 같은 로트 2회(각 60↑) 또는 1회 90↑이면 조기 종료. 2위보다 확실히 앞설 때만 확정.
// - 2026-11-26: 후보별 결과를 신뢰도 합으로 투표. 최소 신뢰도(LOT_OCR_MIN_CONF) 미만은 버린다. 85 이상이면 조기 종료.
// - 2026-11-23: 로컬 OCR로 영문 대문자 3글자 로트를 읽는다. Gemini 등 외부 AI 호출 없음.
// related files:
// - bg/pc2/lot-server2/src/ocr/engine.js
// - bg/pc2/lot-server2/src/ocr/extract.js
// - bg/pc2/lot-server2/src/ocr/preprocess.js
// - bg/pc2/lot-server2/src/ocr/locate.js
// - bg/pc2/lot-server2/src/ocr/chars.js
// - bg/pc2/lot-server2/src/watch.js

import fs from "fs/promises";
import { runOcr } from "./engine.js";
import { isValidLot, pickLotFromOcrText } from "./extract.js";
import { readLotByChars } from "./chars.js";
import { cropVariantsFor, ocrVariants, textCrops } from "./preprocess.js";
import { recognizeEngraving } from "../engrave/recognize.js";
import { loadModel } from "../engrave/model-store.js";
import { activeProfile } from "../jig-profiles.js";

const EARLY_STOP_CONF = 90;
// 한 줄 판독이 같은 로트를 내면 신뢰도×이 값을 투표 점수에 더한다(글자 단위 점수는 8회×3자리 합).
const LINE_BONUS = 5;
const AGREE_CONF = 60;
// 이보다 낮은 판독은 투표에서 뺀다(잡음).
const VOTE_FLOOR = 25;

function minConfidence() {
  const n = Number(process.env.LOT_OCR_MIN_CONF);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50;
}

/**
 * 후보 판독 결과에서 로트를 고른다. 같은 로트의 신뢰도 합이 큰 것.
 * @param {{ lot: string, confidence: number, text?: string }[]} reads
 * @param {number} [minConf]
 */
export function pickBestRead(reads, minConf = minConfidence()) {
  const tally = new Map();
  for (const read of reads) {
    if (!isValidLot(read.lot) || read.confidence < VOTE_FLOOR) continue;
    const cur = tally.get(read.lot) || { lot: read.lot, sum: 0, count: 0, confidence: 0, rawText: "" };
    cur.sum += read.confidence;
    cur.count += 1;
    if (read.confidence >= cur.confidence) {
      cur.confidence = read.confidence;
      cur.rawText = read.text || read.lot;
    }
    tally.set(read.lot, cur);
  }
  const ranked = [...tally.values()].sort((a, b) => b.sum - a.sum);
  const best = ranked[0];
  if (!best || best.confidence < minConf) return null;
  const second = ranked[1];
  // 2위와 비슷하면 확정하지 않는다(오독 방지).
  if (second && best.sum < second.sum * 1.3) return null;
  return best;
}

const AMBIGUOUS = Symbol("ambiguous");

/**
 * 글자 단위 후보 중 하나. 다른 로트가 비슷한 점수(80% 이상)면 AMBIGUOUS.
 * @param {{ lot: string, score: number, confidence: number, angle: number }[]} cands
 */
export function pickCharCandidate(cands) {
  if (!cands.length) return null;
  const ranked = [...cands].sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (best.agree !== undefined && best.agree < 3) return null;
  const rival = ranked.find((c) => c.lot !== best.lot);
  if (rival && rival.score >= best.score * 0.8) return AMBIGUOUS;
  return best;
}

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
export function recognizerMode() {
  const m = String(process.env.LOT_RECOGNIZER || "engrave").toLowerCase();
  return ["engrave", "tesseract", "both"].includes(m) ? m : "engrave";
}

/**
 * @param {Buffer | string} input
 * @param {{ allowed?: Set<string> | string[] | null, profile?: object }} [opts] allowed가 있으면 1위가 목록에 있어야 성공(reason not_in_queue).
 */
export async function recognizeLot(input, { allowed = null, profile = null } = {}) {
  const buffer = typeof input === "string" ? await fs.readFile(input) : Buffer.from(input);
  const mode = recognizerMode();
  let engraved = null;
  if (mode !== "tesseract") {
    const loaded = (() => {
      try {
        return loadModel();
      } catch {
        return null;
      }
    })();
    if (loaded?.model) {
      engraved = await recognizeEngraving(buffer, { profile: profile || activeProfile(), allowed, model: loaded.model }).catch((e) => ({
        success: false,
        reason: `engrave-error: ${e.message}`,
        method: "engrave",
      }));
      const out = {
        ...engraved,
        lot: engraved.success ? engraved.lot : "",
        confidence: engraved.success ? engraved.confidence : 0,
        rawText: engraved.top || "",
        provider: "engrave-mlp",
        model: loaded.file ? loaded.file.split(/[\\/]/).pop() : "",
      };
      if (engraved.success || engraved.reason === "not_in_queue" || mode === "engrave") return out;
    }
  }
  const t = await recognizeLotTesseract(buffer, { allowed });
  return engraved ? { ...t, engrave: { top: engraved.top, reason: engraved.reason, confidence: engraved.confidence } } : t;
}

/**
 * 이전 방식(Tesseract). 각인 모델이 없거나 LOT_RECOGNIZER=tesseract|both일 때.
 */
export async function recognizeLotTesseract(input, { allowed = null } = {}) {
  const allow = allowed ? new Set([...allowed].map((v) => String(v).toUpperCase())) : null;
  const permitted = (lot) => isValidLot(lot) && (!allow || allow.has(lot));
  const buffer =
    typeof input === "string" ? await fs.readFile(input) : Buffer.from(input);
  // 1단계: 글자 단위. 방향(0/180/90/270)별 크롭을 모두 읽고 투표 점수로 고른다.
  const charCands = [];
  for await (const { crop, darkInk, angle } of textCrops(buffer)) {
    const cand = await readLotByChars(crop, darkInk).catch(() => null);
    if (!cand || !isValidLot(cand.lot) || cand.agree < 2) continue;
    charCands.push({ ...cand, angle, crop, darkInk });
  }
  // 상위 후보는 같은 크롭을 한 줄 모드로도 읽어 맞으면 가점(180도 뒤집힘 W/M·E 구분에 도움).
  const top = [...charCands].sort((a, b) => b.score - a.score).slice(0, 3);
  for (const cand of top) {
    let n = 0;
    for await (const variant of cropVariantsFor(cand.crop, cand.darkInk)) {
      if (n++ >= 2) break;
      const { text, confidence } = await runOcr(variant);
      if (pickLotFromOcrText(text) === cand.lot) cand.score += confidence * LINE_BONUS;
    }
  }
  for (const cand of charCands) {
    delete cand.crop;
  }
  const charBest = pickCharCandidate(charCands);
  if (charBest && charBest !== AMBIGUOUS && charBest.confidence >= minConfidence() && !permitted(charBest.lot)) {
    return { success: false, lot: "", confidence: 0, rawText: charBest.lot, provider: "local-ocr", method: "chars", reason: "not_in_queue", rejected: charBest.lot };
  }
  if (charBest && charBest.confidence >= minConfidence()) {
    return {
      success: true,
      lot: charBest.lot,
      confidence: charBest.confidence,
      rawText: charBest.lot,
      provider: "local-ocr",
      method: "chars",
      angle: charBest.angle,
    };
  }
  if (charBest === AMBIGUOUS) {
    // 180도 뒤집어도 글자처럼 읽히는 경우(W/M 등). 오독보다 실패가 낫다.
    return { success: false, lot: "", confidence: 0, rawText: "", provider: "local-ocr", method: "ambiguous" };
  }

  // 2단계: 한 줄 판독 후보 투표.
  const reads = [];
  for await (const variant of ocrVariants(buffer)) {
    const { text, confidence } = await runOcr(variant);
    const lot = pickLotFromOcrText(text);
    if (!isValidLot(lot)) continue;
    reads.push({ lot, confidence, text });
    if (confidence >= EARLY_STOP_CONF) break;
    const agree = reads.filter((r) => r.lot === lot && r.confidence >= AGREE_CONF).length;
    if (agree >= 2) break;
  }

  const best = pickBestRead(reads);
  if (best && !permitted(best.lot)) {
    return { success: false, lot: "", confidence: 0, rawText: String(best.rawText || "").trim(), provider: "local-ocr", method: "line", reason: "not_in_queue", rejected: best.lot };
  }
  return {
    success: Boolean(best),
    lot: best?.lot || "",
    confidence: best?.confidence || 0,
    rawText: String(best?.rawText || "").trim(),
    provider: "local-ocr",
    method: "line",
  };
}

export { extractLotSuffix3, isValidLot, pickLotFromOcrText } from "./extract.js";
export { disposeOcrWorker } from "./engine.js";

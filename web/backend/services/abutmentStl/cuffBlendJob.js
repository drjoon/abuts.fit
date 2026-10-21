// related files:
// - web/backend/services/abutmentStl/cuffBlend.worker.js (EBS 로컬 워커)
// - web/backend/services/abutmentStl/cuffBlendLambda.handler.js (람다)
// - web/backend/services/abutmentStl/postSmooth.js (커프 보정이 적용되면 이어서 포스트 계단 결 다듬기)
// - web/backend/services/abutmentStl/connectionTaperSmooth.js (마지막에 커넥션 11° 원뿔 면 다듬기)
//
// 커프 보정 한 건. 워커와 람다가 같은 함수를 쓴다.
import { blendCuffJunction, measureCuffConnection, proposeCuffRedesign, redesignCuffBowl } from "./cuffBlend.js";
import { smoothPostAboveFinishLine } from "./postSmooth.js";
import { smoothConnectionTaper } from "./connectionTaperSmooth.js";

/** measure: 스펙 미등록 샘플의 11° 원뿔 끝 높이만 잰다(cuffSpecSuggest.service.js). */
const measure = (input) => {
  const m = measureCuffConnection(input);
  return m ? { ok: true, status: "measured", detail: { measure: m } } : { ok: false, status: "failed", reason: "11° 원뿔 없음" };
};
const RUNNERS = { auto: blendCuffJunction, redesign: redesignCuffBowl, propose: proposeCuffRedesign, measure };
/** auto는 커프 보정이 안 돼도 포스트는 다듬는다. post는 커프 스펙이 없을 때 포스트만. */
const POST_ON_INPUT_MODES = new Set(["auto", "post"]);

/** 포스트 다듬기는 실패해도 커프 보정 결과(또는 입력)를 그대로 쓴다. */
function applyPostSmooth(result, source, finishLine) {
  const post = smoothPostAboveFinishLine(source, { finishLine });
  const d = post.detail || {};
  const postSmooth = {
    status: post.status,
    reason: post.reason || null,
    patchTriangles: d.patchTriangles ?? null,
    refinePasses: d.refinePasses ?? null,
    maxInwardUm: d.maxInwardUm ?? null,
    meanInwardUm: d.meanInwardUm ?? null,
    ms: d.ms ?? null,
  };
  return {
    ...result,
    buffer: post.ok && post.buffer ? post.buffer : result.buffer,
    detail: { ...(result.detail || {}), postSmooth },
  };
}

/** 커넥션 원뿔 다듬기도 실패하면 앞 단계 결과를 그대로 쓴다. */
function applyTaperSmooth(result, fallbackInput) {
  const source = result.buffer || fallbackInput;
  const t = smoothConnectionTaper(source);
  const taperSmooth = { status: t.status, reason: t.reason || null, ...(t.detail || {}) };
  return {
    ...result,
    buffer: t.ok && t.buffer ? t.buffer : result.buffer,
    detail: { ...(result.detail || {}), taperSmooth },
  };
}

/**
 * @param {Buffer} input filled STL
 * @param {"auto"|"redesign"|"propose"|"post"|"measure"} mode
 * @returns {{ ok: boolean, status: string, reason?: string, buffer?: Buffer|null, detail?: object }}
 */
export function runCuffBlendJob(input, mode = "auto", options = {}) {
  let result = mode === "post" ? { ok: false, status: "skipped", reason: null } : (RUNNERS[mode] || blendCuffJunction)(input, options);
  const cuffBuffer = result.ok && result.buffer ? result.buffer : null;
  if (cuffBuffer && mode !== "propose") {
    result = applyPostSmooth(result, cuffBuffer, options.finishLine || null);
  } else if (!cuffBuffer && POST_ON_INPUT_MODES.has(mode)) {
    result = applyPostSmooth({ ...result, buffer: null }, input, options.finishLine || null);
  }
  if (mode !== "propose" && mode !== "measure") result = applyTaperSmooth(result, input);
  return result;
}

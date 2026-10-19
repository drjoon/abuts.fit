// 커프 이음부 보정을 API 이벤트 루프 밖에서 돌린다.
// related files:
// - web/backend/services/abutmentStl/cuffBlend.js
// - web/backend/services/abutmentStl/cuffBlend.service.js
// - web/backend/services/abutmentStl/postSmooth.js (커프 보정이 적용되면 이어서 포스트 계단 결 다듬기)
import { parentPort, workerData } from "worker_threads";
import { blendCuffJunction, proposeCuffRedesign, redesignCuffBowl } from "./cuffBlend.js";
import { smoothPostAboveFinishLine } from "./postSmooth.js";

const RUNNERS = { auto: blendCuffJunction, redesign: redesignCuffBowl, propose: proposeCuffRedesign };
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

try {
  const input = Buffer.from(workerData.input.buffer, workerData.input.byteOffset, workerData.input.byteLength);
  const mode = workerData.mode || "auto";
  const options = workerData.options || {};
  let result = mode === "post" ? { ok: false, status: "skipped", reason: null } : (RUNNERS[mode] || blendCuffJunction)(input, options);
  const cuffBuffer = result.ok && result.buffer ? result.buffer : null;
  if (cuffBuffer && mode !== "propose") {
    result = applyPostSmooth(result, cuffBuffer, options.finishLine || null);
  } else if (!cuffBuffer && POST_ON_INPUT_MODES.has(mode)) {
    result = applyPostSmooth({ ...result, buffer: null }, input, options.finishLine || null);
  }
  if (result.buffer) {
    const out = result.buffer;
    const bytes = new Uint8Array(out.buffer, out.byteOffset, out.byteLength).slice();
    parentPort.postMessage({ result: { ...result, buffer: null }, output: bytes }, [bytes.buffer]);
  } else {
    parentPort.postMessage({ result });
  }
} catch (error) {
  parentPort.postMessage({ result: { ok: false, status: "failed", reason: String(error?.message || error) } });
}

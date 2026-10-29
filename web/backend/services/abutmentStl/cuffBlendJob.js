// related files:
// - web/backend/services/abutmentStl/cuffBlend.worker.js (EBS 로컬 워커)
// - web/backend/services/abutmentStl/cuffBlendLambda.handler.js (람다)
// - web/backend/services/abutmentStl/postSmooth.js (커프 보정이 적용되면 이어서 포스트 계단 결 다듬기)
// - web/backend/services/abutmentStl/connectionTaperSmooth.js (마지막에 커넥션 11° 원뿔 면 다듬기)
//
// 커프 보정 한 건. 워커와 람다가 같은 함수를 쓴다.
// 11° 목표 높이는 cuffConnectionSpecs.prcConeHeightMm(Regular RH는 덴티움 0.33·덴티스·메가젠 0.4·그 외 0.3). 람다 패키지가 이 파일을 그대로 묶는다.
import { blendCuffJunction, measureCuffConnection, proposeCuffRedesign, redesignCuffBowl } from "./cuffBlend.js";
import { smoothPostAboveFinishLine } from "./postSmooth.js";
import { smoothConnectionTaper } from "./connectionTaperSmooth.js";
import { parseStl, writeBinaryStl } from "./meshCore.js";

/**
 * 가장 짧은 변이 1e-6mm(≈float32 정밀도 한계) 미만인 퇴화 삼각형을 뺀다.
 * 커넥션 이음 링에서 본체 정점과 새 띠 정점이 사실상 같은 자리(서브 nm)에 겹치면 이런 면이 생기고,
 * ESPRIT이 STL을 솔리드로 인정하지 못해 PartProfileShadow가 빈 결과를 준다(2026-10-22 ZKCXTDQQ).
 * 구멍이 나도 폭이 1e-6mm 이하라 가공에는 영향이 없다.
 */
export function dropDegenerateTriangles(buffer) {
  if (!buffer?.length) return { buffer, dropped: 0 };
  const { positions, attributes } = parseStl(buffer);
  const triCount = Math.floor(positions.length / 9);
  const keptPos = [];
  const keptAttr = [];
  let dropped = 0;
  for (let t = 0; t < triCount; t += 1) {
    const p = t * 9;
    let minEdge2 = Infinity;
    for (let k = 0; k < 3; k += 1) {
      const a = p + k * 3;
      const b = p + ((k + 1) % 3) * 3;
      const dx = positions[b] - positions[a];
      const dy = positions[b + 1] - positions[a + 1];
      const dz = positions[b + 2] - positions[a + 2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < minEdge2) minEdge2 = d2;
    }
    if (minEdge2 < 1e-12) {
      dropped += 1;
      continue;
    }
    for (let k = 0; k < 9; k += 1) keptPos.push(positions[p + k]);
    keptAttr.push(attributes?.[t] || 0);
  }
  if (!dropped) return { buffer, dropped: 0 };
  return {
    buffer: writeBinaryStl({
      positions: Float64Array.from(keptPos),
      attributes: Uint16Array.from(keptAttr),
    }),
    dropped,
  };
}

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
  // 의뢰자가 디자인을 고르면 포스트 다듬기는 확인 전 보정 STL에 이미 있다. 그대로 가공을 고르면 여기서도 하지 않는다.
  if (!options.skipPostSmooth && cuffBuffer && mode !== "propose") {
    result = applyPostSmooth(result, cuffBuffer, options.finishLine || null);
  } else if (!options.skipPostSmooth && !cuffBuffer && POST_ON_INPUT_MODES.has(mode)) {
    result = applyPostSmooth({ ...result, buffer: null }, input, options.finishLine || null);
  }
  if (mode !== "propose" && mode !== "measure") result = applyTaperSmooth(result, input);
  if (result.buffer?.length) {
    const cleaned = dropDegenerateTriangles(result.buffer);
    if (cleaned.dropped > 0) {
      result = {
        ...result,
        buffer: cleaned.buffer,
        detail: { ...(result.detail || {}), degenerateDropped: cleaned.dropped },
      };
    }
  }
  return result;
}

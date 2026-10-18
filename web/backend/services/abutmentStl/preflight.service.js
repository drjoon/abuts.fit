// related files:
// - web/backend/services/abutmentStl/pipeline.js (JS 파이프라인 SSOT)
// - web/backend/services/abutmentStl/tightCorner.js (마진 코너 fillet R 검사)
// - web/backend/controllers/files/stlPreflight.controller.js
// - web/frontend/src/pages/requestor/new_request/hooks/useStlMachiningPreflight.ts
//
// 의뢰 접수 전, 의뢰자가 올린 커스텀어벗 STL로 JS 파이프라인을 바로 돌려
// 불완전가공(마진 코너 R < 공구 R)만 요약한다. filled STL·메타데이터는 저장하지 않는다.
import { resolveAbutmentStlInputs } from "./abutmentStlInputs.js";
import { runAbutmentStlPipelineInWorker } from "./runPipelineInWorker.js";
import { Mesh, writeBinaryStl, identity } from "./meshCore.js";
import {
  FINISH_BALL_RADIUS_MM,
  applyTightCornerCorrectionToMesh,
} from "./tightCorner.js";

/** 디자인 수정 권고 여유(mm). 공구 R에 이만큼 더한 값을 권한다. */
export const PREFLIGHT_FILLET_MARGIN_MM = 0.05;
/** 권고 R 올림 단위(mm). 0.60 + 0.05 = 0.65처럼 0.05 단위로 올린다. */
const SUGGEST_STEP_MM = 0.05;

const round2 = (v) => Math.round(v * 100) / 100;
const round3 = (v) => Math.round(v * 1000) / 1000;

/** 강체 4x4(행 우선)의 역행렬. R은 회전이라 전치로 되돌린다. */
export function invertRigidMatrix(m) {
  const src = Array.isArray(m) && m.length === 16 ? m : identity();
  const tx = src[3];
  const ty = src[7];
  const tz = src[11];
  const inv = [
    src[0], src[4], src[8], 0,
    src[1], src[5], src[9], 0,
    src[2], src[6], src[10], 0,
    0, 0, 0, 1,
  ];
  inv[3] = round3(-(inv[0] * tx + inv[1] * ty + inv[2] * tz));
  inv[7] = round3(-(inv[4] * tx + inv[5] * ty + inv[6] * tz));
  inv[11] = round3(-(inv[8] * tx + inv[9] * ty + inv[10] * tz));
  return inv;
}

function applyMatrix(m, p) {
  const x = Number(p?.[0]);
  const y = Number(p?.[1]);
  const z = Number(p?.[2]);
  if (![x, y, z].every((v) => Number.isFinite(v))) return null;
  return [
    round3(m[0] * x + m[1] * y + m[2] * z + m[3]),
    round3(m[4] * x + m[5] * y + m[6] * z + m[7]),
    round3(m[8] * x + m[9] * y + m[10] * z + m[11]),
  ];
}

function mapFlatPositions(flat, m) {
  const src = Array.isArray(flat) ? flat : [];
  const out = [];
  for (let i = 0; i + 2 < src.length; i += 3) {
    const p = applyMatrix(m, [src[i], src[i + 1], src[i + 2]]);
    if (!p) continue;
    out.push(p[0], p[1], p[2]);
  }
  return out;
}

/**
 * 정렬 좌표계의 불완전 가공 면을 원본 STL 좌표로 되돌린다.
 * 뷰어가 올린 파일 위에 그대로 얹을 수 있게 보정 면과 코너 점만 남긴다.
 * @param {object|null} [correctionSurface] 보정으로 옮긴 필렛 면. 생략하면 tightCorner.correctionSolid.
 */
export function tightCornerOverlayInOriginalFrame(tightCorner, alignMatrix, correctionSurface) {
  const tc = tightCorner && typeof tightCorner === "object" ? tightCorner : null;
  const solid = correctionSurface === undefined ? tc?.correctionSolid : correctionSurface;
  if (!(Number(tc?.tightCount) > 0) || !solid?.positions?.length || !solid?.indices?.length) {
    return null;
  }
  const inv = invertRigidMatrix(alignMatrix);
  const samples = (Array.isArray(tc.samples) ? tc.samples : [])
    .map((s) => {
      const cornerPoint = applyMatrix(inv, s?.cornerPoint);
      const filletRadiusMm = Number(s?.filletRadiusMm);
      if (!cornerPoint || !Number.isFinite(filletRadiusMm)) return null;
      return {
        sampleIndex: Number(s?.sampleIndex) || 0,
        filletRadiusMm: round3(filletRadiusMm),
        cornerPoint,
      };
    })
    .filter(Boolean);
  return {
    version: Number(tc.version) || 0,
    tightCount: Number(tc.tightCount) || 0,
    toolDiameterMm: Number(tc.toolDiameterMm) || FINISH_BALL_RADIUS_MM * 2,
    averageFilletRadiusMm:
      Number.isFinite(Number(tc.averageFilletRadiusMm)) ? round3(Number(tc.averageFilletRadiusMm)) : null,
    samples,
    correctionSolid: {
      filletRadiusMm: Number(solid.filletRadiusMm) || FINISH_BALL_RADIUS_MM,
      positions: mapFlatPositions(solid.positions, inv),
      indices: solid.indices.map((v) => Number(v)).filter((v) => Number.isFinite(v)),
    },
  };
}

export function suggestedFilletRadiusMm(toolRadiusMm) {
  const toolR = Number(toolRadiusMm) > 0 ? Number(toolRadiusMm) : FINISH_BALL_RADIUS_MM;
  const raw = toolR + PREFLIGHT_FILLET_MARGIN_MM;
  return round2(Math.ceil((raw - 1e-9) / SUGGEST_STEP_MM) * SUGGEST_STEP_MM);
}

/** tightCorner 메타에서 의뢰자 안내용 요약만 뽑는다(보정 솔리드 등 무거운 배열 제외). */
export function summarizeTightCorner(tightCorner) {
  const tc = tightCorner && typeof tightCorner === "object" ? tightCorner : null;
  const toolDiameterMm = Number(tc?.toolDiameterMm) > 0 ? Number(tc.toolDiameterMm) : FINISH_BALL_RADIUS_MM * 2;
  const toolRadiusMm = round2(toolDiameterMm / 2);
  const radii = (Array.isArray(tc?.samples) ? tc.samples : [])
    .map((s) => Number(s?.filletRadiusMm))
    .filter((v) => Number.isFinite(v) && v >= 0);
  const tightCount = Number(tc?.tightCount) > 0 ? Number(tc.tightCount) : radii.length;
  const averageFilletRadiusMm =
    Number(tc?.averageFilletRadiusMm) >= 0 && tc?.averageFilletRadiusMm != null
      ? round2(Number(tc.averageFilletRadiusMm))
      : radii.length
        ? round2(radii.reduce((a, b) => a + b, 0) / radii.length)
        : null;

  return {
    status: tightCount > 0 ? "tight" : "ok",
    tightCount,
    averageFilletRadiusMm,
    minFilletRadiusMm: radii.length ? round2(Math.min(...radii)) : averageFilletRadiusMm,
    toolDiameterMm: round2(toolDiameterMm),
    toolRadiusMm,
    suggestedFilletRadiusMm: suggestedFilletRadiusMm(toolRadiusMm),
  };
}

/**
 * 접수 전 가공 검사. 파이프라인이 실패해도 의뢰를 막지 않도록 unknown으로 돌려준다.
 * @param {{ buffer: Buffer, caseInfos?: object }} args
 */
/**
 * 업로드 STL에 타이트 코너 보정을 적용한 바이너리 STL(원본 좌표계).
 * @returns {Promise<{ ok: true, buffer: Buffer } | { ok: false, reason: string }>}
 */
export async function buildCorrectedDesignStlBuffer({ buffer, caseInfos } = {}) {
  if (!buffer?.length) return { ok: false, reason: "empty_file" };
  try {
    const inputs = await resolveAbutmentStlInputs(caseInfos || {});
    const js = await runAbutmentStlPipelineInWorker(buffer, {
      targetDiameter: inputs.targetDiameter,
      implantProfile: inputs.implantProfile,
    });
    if (!Array.isArray(js?.finishLine?.points) || js.finishLine.points.length < 4) {
      return { ok: false, reason: "finishline_missing" };
    }
    if (!(Number(js?.tightCorner?.tightCount) > 0)) {
      return { ok: false, reason: "no_tight_corners" };
    }
    const mesh = Mesh.fromStlBuffer(buffer);
    mesh.transform(js.alignMatrix);
    const corrected = applyTightCornerCorrectionToMesh(mesh, js.finishLine.points, {
      tiltAxisVector: js.stlMetadata?.tiltAxisVector,
    });
    if (!corrected) return { ok: false, reason: "correction_failed" };
    corrected.transform(invertRigidMatrix(js.alignMatrix));
    const outBuffer = writeBinaryStl({
      positions: corrected.toTriangleSoup(),
      attributes: null,
    });
    return { ok: true, buffer: outBuffer };
  } catch (error) {
    console.warn("[stl-corrected] failed:", error?.message || error);
    return { ok: false, reason: "pipeline_failed" };
  }
}

export async function runStlMachiningPreflight({ buffer, caseInfos } = {}) {
  if (!buffer?.length) {
    return { status: "unknown", reason: "empty_file", tightCount: 0 };
  }
  try {
    const inputs = await resolveAbutmentStlInputs(caseInfos || {});
    const js = await runAbutmentStlPipelineInWorker(buffer, {
      targetDiameter: inputs.targetDiameter,
      implantProfile: inputs.implantProfile,
      preflight: true,
    });
    if (!Array.isArray(js?.finishLine?.points) || js.finishLine.points.length < 4) {
      return { status: "unknown", reason: "finishline_missing", tightCount: 0 };
    }
    if (!js?.tightCorner) {
      return { status: "unknown", reason: "tightcorner_missing", tightCount: 0 };
    }
    const summary = summarizeTightCorner(js.tightCorner);
    const elapsed = Number(js?.perf?.total);
    if (Number.isFinite(elapsed) && elapsed > 2.5) {
      console.info("[stl-preflight] slow", js.perf);
    }
    if (summary.status !== "tight") return summary;
    const overlay = tightCornerOverlayInOriginalFrame(
      js.tightCorner,
      js.alignMatrix,
      js.filletSurface || null,
    );
    return overlay ? { ...summary, overlay } : summary;
  } catch (error) {
    console.warn("[stl-preflight] failed:", error?.message || error);
    return { status: "unknown", reason: "pipeline_failed", tightCount: 0 };
  }
}

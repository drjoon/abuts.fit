// related files:
// - web/backend/services/abutmentStl/shadow.service.js
// - web/backend/scripts/abutment-stl-js/compare-golden.js
// - web/backend/services/abutmentStl/compare.js
//
// 같은 1-stl을 JS로 돌려 Rhino 결과와 비교한 레코드를 만든다. 합격 판정은 하지 않는다.
import { Mesh } from "./meshCore.js";
import { compareWithRhino, finishLineDeviation, surfaceDeviation } from "./compare.js";
import { connectionDiameterAtOrigin, summarizeFilledStl } from "./qualityMetrics.js";
import { runAbutmentStlPipeline } from "./pipeline.js";
import { runAbutmentStlPipelineInWorker } from "./runPipelineInWorker.js";

const SAME_MM = 0.005;
const FINISHLINE_SAME_MM = 0.02;

function bodyMeshFromOutput(outputBuffer, bodyTriangleCount) {
  const all = Mesh.fromStlBuffer(outputBuffer);
  return all.subMesh(Array.from({ length: Math.min(bodyTriangleCount, all.faceCount) }, (_, i) => i));
}

function classifyAlign(body, rhinoMesh) {
  const dev = surfaceDeviation(body, rhinoMesh, { maxSamples: 6000 }).jsToRhino;
  if ((dev.p99 ?? Infinity) <= SAME_MM) return { kind: "same", zOffset: 0, bodyDeviation: dev };
  const zOffset = rhinoMesh.bbox().min[2] - body.bbox().min[2];
  const shifted = body.clone();
  shifted.float32 = false;
  shifted.translate(0, 0, zOffset);
  const devShift = surfaceDeviation(shifted, rhinoMesh, { maxSamples: 6000 }).jsToRhino;
  if ((devShift.p99 ?? Infinity) <= SAME_MM) {
    return { kind: "z_offset_only", zOffset, bodyDeviation: dev };
  }
  return { kind: "different", zOffset, bodyDeviation: dev, bodyDeviationAfterZShift: devShift };
}

function classifyFinishLine(js, rhino, alignInfo) {
  if (!js?.points?.length) return { kind: rhino?.points?.length ? "js_missing" : "both_missing" };
  if (!rhino?.points?.length) return { kind: "rhino_missing" };
  const dev = finishLineDeviation(js.points, rhino.points);
  if (dev.max <= FINISHLINE_SAME_MM) return { kind: "same", deviation: dev };
  if (alignInfo.kind === "z_offset_only") {
    const shifted = js.points.map((p) => [p[0], p[1], p[2] + alignInfo.zOffset]);
    const devShift = finishLineDeviation(shifted, rhino.points);
    if (devShift.max <= FINISHLINE_SAME_MM) {
      return { kind: "follows_align_offset", deviation: dev, deviationAfterZShift: devShift };
    }
  }
  return { kind: "different", deviation: dev };
}

/** Rhino 피니시라인 점이 메시 정점과 겹치면 edge 전략, 아니면 단면 추적이다(전략명은 DB에 없다). */
function inferRhinoFinishlineFamily(points, rhinoMesh) {
  if (!points?.length) return null;
  const key = (x, y, z) => `${Math.round(x * 1e3)},${Math.round(y * 1e3)},${Math.round(z * 1e3)}`;
  const set = new Set();
  const v = rhinoMesh.verts;
  for (let i = 0; i < v.length; i += 3) set.add(key(v[i], v[i + 1], v[i + 2]));
  const hit = points.filter((p) => set.has(key(p[0], p[1], p[2]))).length;
  return hit >= points.length * 0.9 ? "edge" : "section";
}

function jsFinishlineFamily(strategy) {
  if (!strategy) return null;
  return strategy.startsWith("C_") ? "edge" : strategy.startsWith("SECTION") ? "section" : "other";
}

/**
 * @param {{ inputBuffer: Buffer, rhinoFilledBuffer: Buffer, rhino: object, inputs: { targetDiameter, implantProfile }, screwholeParams?: object, useWorker?: boolean }} args
 */
export async function evaluateAgainstRhino(args) {
  const { inputBuffer, rhinoFilledBuffer, rhino, inputs, screwholeParams, useWorker = false } = args;
  const options = {
    targetDiameter: inputs?.targetDiameter ?? null,
    implantProfile: inputs?.implantProfile || {},
    ...(screwholeParams ? { screwholeParams } : {}),
  };
  let js;
  try {
    js = useWorker
      ? await runAbutmentStlPipelineInWorker(inputBuffer, options)
      : await runAbutmentStlPipeline(inputBuffer, options);
  } catch (error) {
    return { status: "js_failed", error: String(error?.message || error) };
  }

  const rhinoSummary = summarizeFilledStl(rhinoFilledBuffer);
  const jsMesh = Mesh.fromStlBuffer(js.outputBuffer);
  const body = bodyMeshFromOutput(js.outputBuffer, js.bodyTriangleCount);
  const alignInfo = classifyAlign(body, rhinoSummary.mesh);
  const finishInfo = classifyFinishLine(js.finishLine, rhino?.finishLine, alignInfo);
  finishInfo.jsFamily = jsFinishlineFamily(js.finishLine?.strategyUsed);
  finishInfo.rhinoFamily = inferRhinoFinishlineFamily(rhino?.finishLine?.points, rhinoSummary.mesh);
  const comparison = compareWithRhino(js, rhino, { jsMesh, rhinoMesh: rhinoSummary.mesh });
  const target = Number(inputs?.targetDiameter) || null;
  const jsConn = connectionDiameterAtOrigin(jsMesh);
  const rhinoConn = connectionDiameterAtOrigin(rhinoSummary.mesh);

  return {
    status: "ok",
    jsVersion: js.version,
    align: alignInfo,
    finishLine: finishInfo,
    comparison,
    quality: {
      targetDiameter: target,
      jsDiameterAtOrigin: jsConn?.diameter ?? null,
      rhinoDiameterAtOrigin: rhinoConn?.diameter ?? null,
      jsDiameterError: target && jsConn ? jsConn.diameter - target : null,
      rhinoDiameterError: target && rhinoConn ? rhinoConn.diameter - target : null,
    },
    counts: {
      bodyTriangles: js.bodyTriangleCount,
      jsAddedTriangles: jsMesh.faceCount - js.bodyTriangleCount,
      rhinoTriangles: rhinoSummary.triangleCount,
      rhinoHfPatchTriangles: rhinoSummary.hfPatchTriangles,
    },
    js: {
      finishLine: js.finishLine,
      hexRotation: js.hexRotation,
      diameter: js.diameter,
      screwhole: js.screwhole,
      screwholeParams: js.screwholeParams,
      fillSteps: js.fillSteps,
      stlMetadata: js.stlMetadata
        ? {
            maxDiameter: js.stlMetadata.maxDiameter,
            connectionDiameter: js.stlMetadata.connectionDiameter,
            totalLength: js.stlMetadata.totalLength,
            l1: js.stlMetadata.l1,
            taperAngle: js.stlMetadata.taperAngle,
            frontPoint: js.stlMetadata.frontPoint,
            lotEngravingSite: js.stlMetadata.lotEngravingSite,
          }
        : null,
      align: js.align,
      perf: js.perf,
    },
    outputBuffer: js.outputBuffer,
  };
}

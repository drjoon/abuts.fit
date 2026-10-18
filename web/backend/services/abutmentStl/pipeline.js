// related files:
// - bg/pc1/rhino-server/compute/scripts/process_abutment_stl.py (main, 순서 SSOT)
// - bg/pc1/rhino-server/compute/core/processing.py (메타 등록·connectionDiameter 덮어쓰기)
// - web/backend/services/abutmentStl/pipeline.worker.js
//
// Rhino 없이 1-stl → 2-filled를 만든다. 순서는 process_abutment_stl.main과 같다:
// import → align → finishline → 스크류홀 패치 → (explode/join: 기하 변화 없음) → 직경 → fill_steps → export → 메타.
import { Mesh, writeBinaryStl, parseStl, identity, multiply } from "./meshCore.js";
import { alignMeshToOrigin, ALIGN_MODULE_VERSION, JS_ALIGN_PORT_VERSION } from "./align.js";
import { detectFinishLine, finishlineZExtrema, sanitizeFinishlinePoints } from "./finishline.js";
import { buildScrewholePatch, SCREWHOLE_PARAMS } from "./fillScrewholes.js";
import { buildVerticalBandSolid } from "./fillSteps.js";
import { calculateStlMetadataFromBuffer, tiltAxisFromMesh } from "./stlMetadata.js";
import { correctTightCornerFillet, detectTightCorners, movedFilletSurface } from "./tightCorner.js";

export const ABUTMENT_STL_JS_VERSION = `abutment-stl-js-1+align-${ALIGN_MODULE_VERSION}+${JS_ALIGN_PORT_VERSION}`;

/**
 * align이 mesh.transform으로 쌓는 행렬. aligned = M * original.
 * 인스턴스 메서드만 감싸고, 끝나면 프로토타입으로 되돌린다.
 */
function alignWithMatrix(mesh, alignFn) {
  const orig = mesh.transform;
  let accum = identity();
  mesh.transform = function tracked(m) {
    const ok = orig.call(this, m);
    accum = multiply(m, accum);
    return ok;
  };
  try {
    return { align: alignFn(), alignMatrix: accum };
  } finally {
    delete mesh.transform;
  }
}

function finishLineFromStoredPoints(rawPoints, log) {
  if (!Array.isArray(rawPoints) || rawPoints.length < 3) return null;
  const pts = rawPoints
    .filter((p) => Array.isArray(p) && p.length >= 3)
    .map((p) => [Number(p[0]), Number(p[1]), Number(p[2])])
    .filter((p) => p.every((v) => Number.isFinite(v)));
  if (pts.length < 3) return null;
  log(`[finishline] reuse stored points n=${pts.length}`);
  return {
    version: 1,
    sectionCount: pts.length,
    maxStepDistance: 1,
    points: pts,
    source: "frontend-manual",
    strategyUsed: "STORED_MANUAL",
    ...finishlineZExtrema(pts),
  };
}

/** preflight.service invertRigidMatrix와 같다. 보정 STL을 원본 좌표로 되돌릴 때 쓴다. */
function invertRigidMatrix(m) {
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
  const r3 = (v) => Math.round(v * 1000) / 1000;
  inv[3] = r3(-(inv[0] * tx + inv[1] * ty + inv[2] * tz));
  inv[7] = r3(-(inv[4] * tx + inv[5] * ty + inv[6] * tz));
  inv[11] = r3(-(inv[8] * tx + inv[9] * ty + inv[10] * tz));
  return inv;
}

function appendTriangles(soup, tris) {
  const out = new Float64Array(soup.length + tris.length * 9);
  out.set(soup, 0);
  let o = soup.length;
  for (const t of tris) {
    for (const p of t) {
      out[o] = p[0];
      out[o + 1] = p[1];
      out[o + 2] = p[2];
      o += 3;
    }
  }
  return out;
}

/** diameter_analysis.analyze_diameters */
function analyzeDiameters(mesh) {
  const v = mesh.verts;
  const f = mesh.faces;
  let maxR = 0;
  for (let i = 0; i < v.length; i += 3) maxR = Math.max(maxR, Math.hypot(v[i], v[i + 1]));
  let connR = 0;
  for (let i = 0; i < mesh.faceCount; i += 1) {
    const idx = [f[i * 3], f[i * 3 + 1], f[i * 3 + 2]];
    for (let k = 0; k < 3; k += 1) {
      const a = idx[k] * 3;
      const b = idx[(k + 1) % 3] * 3;
      const za = v[a + 2];
      const zb = v[b + 2];
      if ((za > 0 && zb < 0) || (za < 0 && zb > 0)) {
        const denom = Math.abs(za - zb);
        if (denom === 0) continue;
        const t = Math.abs(za) / denom;
        connR = Math.max(connR, Math.hypot(v[a] + t * (v[b] - v[a]), v[a + 1] + t * (v[b + 1] - v[a + 1])));
      }
    }
  }
  if (connR === 0) connR = maxR;
  const round2 = (x) => Math.round(x * 100) / 100;
  return { max: round2(maxR * 2), connection: round2(connR * 2) };
}

/**
 * 접수 전 검사. filled STL·전체 메타는 만들지 않는다.
 * 타이트하면 필렛 면과, 원본 좌표의 보정 STL(outputBuffer)을 같이 돌려준다.
 * 확인 클릭이 파이프라인을 다시 돌리지 않게 부모가 이 버퍼를 캐시한다.
 */
function finishPreflight({ mesh, combined, finishLine, align, alignMatrix, logs, perf, mark, total0, log }) {
  const t0 = performance.now();
  let tiltAxisVector = null;
  let tightCorner = null;
  let filletSurface = null;
  let outputBuffer = Buffer.alloc(0);
  if (finishLine?.points?.length) {
    try {
      tiltAxisVector = tiltAxisFromMesh(combined, finishLine.points);
    } catch (error) {
      log(`[stl-preflight] tilt failed: ${error?.message || error}`);
    }
    try {
      tightCorner = detectTightCorners(combined, finishLine.points, {
        tiltAxisVector,
        solids: false,
      });
    } catch (error) {
      log(`[tight-corner] failed: ${error?.message || error}`);
    }
    if (Number(tightCorner?.tightCount) > 0) {
      log(`[tight-corner] flagged ${tightCorner.tightCount} samples`);
      try {
        const corrected = correctTightCornerFillet(mesh, finishLine.points, { tiltAxisVector });
        filletSurface = corrected ? movedFilletSurface(corrected) : null;
        if (corrected?.mesh) {
          corrected.mesh.transform(invertRigidMatrix(alignMatrix));
          outputBuffer = writeBinaryStl({
            positions: corrected.mesh.toTriangleSoup(),
            attributes: null,
          });
        }
      } catch (error) {
        log(`[stl-preflight] fillet surface failed: ${error?.message || error}`);
      }
    }
  } else {
    log("[stl-preflight] finishLine missing");
  }
  mark("inspect", t0);
  mark("total", total0);
  return {
    version: ABUTMENT_STL_JS_VERSION,
    outputBuffer,
    bodyTriangleCount: mesh.faceCount,
    align: { ok: align.ok, message: align.message },
    alignMatrix,
    finishLine,
    tightCorner,
    /** 정렬 좌표계의 보정 필렛 면. 없으면 null. */
    filletSurface,
    stlMetadata: tiltAxisVector ? { tiltAxisVector } : null,
    perf,
    logs,
    preflight: true,
  };
}

/**
 * @param {Buffer} inputBuffer 1-stl 원본
 * @param {{ targetDiameter?: number|null, implantProfile?: object, screwholeParams?: object, finishLinePoints?: number[][], preflight?: boolean, log?: Function }} options
 * finishLinePoints가 있으면 검출을 건너뛰고 그 점을 메타데이터에 쓴다.
 * preflight면 filled STL을 만들지 않고 불완전 가공만 검사한다.
 */
export async function runAbutmentStlPipeline(inputBuffer, options = {}) {
  const { targetDiameter = null, implantProfile = {}, screwholeParams = SCREWHOLE_PARAMS } = options;
  const logs = [];
  const log = (msg) => {
    logs.push(msg);
    options.log?.(msg);
  };
  const perf = {};
  const mark = (name, t0) => {
    perf[name] = Number(((performance.now() - t0) / 1000).toFixed(3));
  };
  const total0 = performance.now();

  let t0 = performance.now();
  const mesh = Mesh.fromTriangleSoup(parseStl(inputBuffer).positions);
  if (mesh.faceCount < 100) throw new Error("STL 삼각형이 너무 적습니다.");
  mark("import", t0);

  t0 = performance.now();
  const { align, alignMatrix } = alignWithMatrix(mesh, () =>
    alignMeshToOrigin(mesh, { targetDiameter, implantProfile, log }),
  );
  if (!align.ok) log(`[align] warning: ${align.message}; continue to finishline detection`);
  mark("align", t0);

  t0 = performance.now();
  let finishLine = finishLineFromStoredPoints(options.finishLinePoints, log);
  if (!finishLine) {
    try {
      const fl = detectFinishLine(mesh.unweldedByAngle(), { log });
      const pts = sanitizeFinishlinePoints(fl.points, log);
      finishLine = {
        version: 1,
        sectionCount: pts.length,
        maxStepDistance: 1,
        points: pts,
        pt0: fl.pt0,
        strategyUsed: fl.strategyUsed,
        ...finishlineZExtrema(pts),
      };
    } catch (error) {
      log(`Finishline failed: ${error?.message || error}`);
    }
  }
  mark("finishline", t0);

  t0 = performance.now();
  const screw = buildScrewholePatch(mesh, { params: screwholeParams, log });
  let soup = mesh.toTriangleSoup();
  if (screw.patch) soup = appendTriangles(soup, screw.patch);
  const combined = Mesh.fromTriangleSoup(soup);
  mark("screwhole", t0);

  if (options.preflight) {
    return finishPreflight({
      mesh,
      combined,
      finishLine,
      align,
      alignMatrix,
      logs,
      perf,
      mark,
      total0,
      log,
    });
  }

  t0 = performance.now();
  const diameter = analyzeDiameters(combined);
  mark("diameter", t0);

  t0 = performance.now();
  let fillSteps = null;
  try {
    const res = buildVerticalBandSolid(combined, { log });
    fillSteps = res.result;
    if (res.solid) soup = appendTriangles(soup, res.solid);
  } catch (error) {
    log(`[fill-steps] failed: ${error?.message || error}`);
  }
  mark("fill_steps", t0);

  t0 = performance.now();
  const outputBuffer = writeBinaryStl({ positions: soup, attributes: null });
  mark("export", t0);

  t0 = performance.now();
  let stlMetadata = null;
  let tightCorner = null;
  if (finishLine?.points?.length) {
    try {
      stlMetadata = await calculateStlMetadataFromBuffer(outputBuffer, finishLine.points);
      if (Number(targetDiameter) > 0) {
        stlMetadata.measuredConnectionDiameter = stlMetadata.connectionDiameter;
        stlMetadata.connectionDiameter = Number(targetDiameter);
      }
    } catch (error) {
      log(`[stl_metadata] failed: ${error?.message || error}`);
    }
    try {
      // 검사만 한다. 보정 솔리드는 메타데이터에만 담고 filled STL은 원본 그대로 둔다.
      tightCorner = detectTightCorners(combined, finishLine.points, {
        tiltAxisVector: stlMetadata?.tiltAxisVector,
        log,
      });
      if (tightCorner?.tightCount > 0) {
        log(`[tight-corner] flagged ${tightCorner.tightCount} samples`);
      }
    } catch (error) {
      log(`[tight-corner] failed: ${error?.message || error}`);
    }
  } else {
    log("[process_single_stl] finishLine missing; skipping STL metadata calculation");
  }
  mark("stl_metadata", t0);
  mark("total", total0);

  const hex = align.telemetry?.hexRotation;
  return {
    version: ABUTMENT_STL_JS_VERSION,
    outputBuffer,
    bodyTriangleCount: mesh.faceCount,
    screwholeParams,
    align: { ok: align.ok, message: align.message },
    /** 정렬 행렬. aligned = alignMatrix * original. 의뢰 메타에는 넣지 않는다. */
    alignMatrix,
    finishLine,
    hexRotation: hex
      ? {
          version: align.telemetry.version,
          moduleVersion: align.telemetry.moduleVersion,
          beforeToXDeg: hex.beforeToXDeg,
          appliedDeg: hex.appliedDeg,
          residualToXDeg: hex.residualToXDeg,
          method: hex.method,
          samples: hex.samples,
          aligned: hex.aligned,
          message: hex.message,
        }
      : null,
    diameter,
    screwhole: screw.result,
    fillSteps,
    stlMetadata,
    tightCorner,
    perf,
    logs,
  };
}

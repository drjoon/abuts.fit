// related files:
// - bg/pc1/rhino-server/compute/scripts/process_abutment_stl.py (main, 순서 SSOT)
// - bg/pc1/rhino-server/compute/core/processing.py (메타 등록·connectionDiameter 덮어쓰기)
// - web/backend/services/abutmentStl/pipeline.worker.js
//
// Rhino 없이 1-stl → 2-filled를 만든다. 순서는 process_abutment_stl.main과 같다:
// import → align → finishline → 스크류홀 패치 → (explode/join: 기하 변화 없음) → 직경 → fill_steps → export → 메타.
import { Mesh, writeBinaryStl, parseStl } from "./meshCore.js";
import { alignMeshToOrigin, ALIGN_MODULE_VERSION, JS_ALIGN_PORT_VERSION } from "./align.js";
import { detectFinishLine, finishlineZExtrema, sanitizeFinishlinePoints } from "./finishline.js";
import { buildScrewholePatch, SCREWHOLE_PARAMS } from "./fillScrewholes.js";
import { buildVerticalBandSolid } from "./fillSteps.js";
import { calculateStlMetadataFromBuffer } from "./stlMetadata.js";

export const ABUTMENT_STL_JS_VERSION = `abutment-stl-js-1+align-${ALIGN_MODULE_VERSION}+${JS_ALIGN_PORT_VERSION}`;

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
 * @param {Buffer} inputBuffer 1-stl 원본
 * @param {{ targetDiameter?: number|null, implantProfile?: object, screwholeParams?: object, log?: Function }} options
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
  const align = alignMeshToOrigin(mesh, { targetDiameter, implantProfile, log });
  if (!align.ok) log(`[align] warning: ${align.message}; continue to finishline detection`);
  mark("align", t0);

  t0 = performance.now();
  let finishLine = null;
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
  mark("finishline", t0);

  t0 = performance.now();
  const screw = buildScrewholePatch(mesh, { params: screwholeParams, log });
  let soup = mesh.toTriangleSoup();
  if (screw.patch) soup = appendTriangles(soup, screw.patch);
  mark("screwhole", t0);

  t0 = performance.now();
  const combined = Mesh.fromTriangleSoup(soup);
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
    perf,
    logs,
  };
}

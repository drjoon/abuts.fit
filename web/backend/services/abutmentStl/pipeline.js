// related files:
// - bg/pc1/rhino-server/compute/scripts/process_abutment_stl.py (main, 순서 SSOT)
// - bg/pc1/rhino-server/compute/core/processing.py (메타 등록·connectionDiameter 덮어쓰기)
// - web/backend/services/abutmentStl/pipeline.worker.js
//
// Rhino 없이 1-stl → 2-filled를 만든다. 순서는 process_abutment_stl.main과 같다:
// import → align → 11° 커넥션 추가·짧은 원뿔 연장·원점 재정렬 → finishline → 스크류홀 패치 → 직경 → fill_steps → export → 메타.
// preflight는 필레 검사만 한다. 마진 코너 정점은 옮기지 않는다.
// 커프·포스트 다듬기는 제조사 준비에서만 한다. 이미 보정된 STL(surfacePrepared)은 정렬만 한다.
import { Mesh, writeBinaryStl, parseStl, identity, multiply, translation } from "./meshCore.js";
import { applyConnectionTaper } from "./connectionTaperFill.js";
import { alignMeshToOrigin, ALIGN_MODULE_VERSION, JS_ALIGN_PORT_VERSION } from "./align.js";
import { detectFinishLine, finishlineZExtrema, sanitizeFinishlinePoints } from "./finishline.js";
import { buildScrewholePatch, SCREWHOLE_PARAMS } from "./fillScrewholes.js";
import { buildVerticalBandSolid } from "./fillSteps.js";
import { calculateStlMetadataFromBuffer, tiltAxisFromMesh } from "./stlMetadata.js";
import {
  correctMarginFillet,
  emptyMarginFilletReview,
  screenMarginFillet,
} from "./marginFilletReview.js";
import { detectTightCorners } from "./tightCorner.js";
import { runCuffBlendJob } from "./cuffBlendJob.js";
import { resolveCuffConnectionSpec } from "./cuffConnectionSpecs.js";
import { POST_SMOOTH_PATCH_ATTRIBUTE } from "./postSmooth.js";

export const ABUTMENT_STL_JS_VERSION = `abutment-stl-js-1+align-${ALIGN_MODULE_VERSION}+${JS_ALIGN_PORT_VERSION}+conn-taper-2`;

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

/** 면 attribute를 유지한 채 강체 변환한다. 용접하면 포스트 다듬기 표시가 사라진다. */
function transformStlBuffer(buffer, matrix) {
  const { positions, attributes } = parseStl(buffer);
  const out = new Float64Array(positions.length);
  const r = Math.fround;
  const m = Array.isArray(matrix) && matrix.length === 16 ? matrix : identity();
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    out[i] = r(m[0] * x + m[1] * y + m[2] * z + m[3]);
    out[i + 1] = r(m[4] * x + m[5] * y + m[6] * z + m[7]);
    out[i + 2] = r(m[8] * x + m[9] * y + m[10] * z + m[11]);
  }
  return writeBinaryStl({ positions: out, attributes });
}

/** 보정 STL을 원본 좌표로 되돌릴 때 쓴다. */
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
 * 업로드 직후 간이 검사. screenMarginFillet만 호출한다.
 * 스크류홀 패치·보정 STL·filled는 만들지 않는다.
 */
function finishPreflight({
  mesh,
  finishLine,
  align,
  alignMatrix,
  logs,
  perf,
  mark,
  total0,
  log,
  bodyTriangleCount,
}) {
  const t0 = performance.now();
  let tiltAxisVector = null;
  let tightCorner = null;
  let filletSurface = null;
  if (finishLine?.points?.length) {
    const tTilt = performance.now();
    try {
      tiltAxisVector = tiltAxisFromMesh(mesh, finishLine.points);
    } catch (error) {
      log(`[stl-preflight] tilt failed: ${error?.message || error}`);
    }
    mark("tilt", tTilt);
    const tScreen = performance.now();
    try {
      const screened = screenMarginFillet(mesh, finishLine.points, { tiltAxisVector });
      tightCorner = screened.tightCorner;
      filletSurface = screened.filletSurface;
    } catch (error) {
      log(`[tight-corner] failed: ${error?.message || error}`);
    }
    mark("screen", tScreen);
    if (Number(tightCorner?.tightCount) > 0) {
      log(`[tight-corner] flagged ${tightCorner.tightCount} samples`);
    }
  } else {
    log("[stl-preflight] finishLine missing");
  }
  mark("inspect", t0);
  mark("total", total0);
  // 포스트 길이 = 피니시라인 max_z → 정렬 bbox의 포스트 탑(+Z).
  const postTopZ = Number(mesh?.bbox?.().max?.[2]);
  return {
    version: ABUTMENT_STL_JS_VERSION,
    outputBuffer: Buffer.alloc(0),
    bodyTriangleCount: bodyTriangleCount ?? mesh.faceCount,
    align: { ok: align.ok, message: align.message },
    alignMatrix,
    finishLine,
    postTopZ: Number.isFinite(postTopZ) ? postTopZ : null,
    tightCorner,
    /** 정렬 좌표계의 표시용 필렛 띠. 보정 STL은 아니다. */
    filletSurface,
    stlMetadata: tiltAxisVector ? { tiltAxisVector } : null,
    perf,
    logs,
    preflight: true,
  };
}

/**
 * 날카로운 마진이 남아 있는 정렬 메시에 제조사 준비와 같은 순서로 커넥션·스크류홀·fill·커프·포스트를 적용한다.
 * 포스트 다듬기는 이 모서리를 기준으로 한다. 필레로 모서리를 없앤 뒤에 돌리면 표면이 거칠어진다.
 */
function prepareSharpMeshLikeManufacturer({ mesh, finishLine, alignMatrix, implantProfile, connection, screwholeParams, log }) {
  let matrix = alignMatrix;
  let fl = finishLine;
  try {
    const connectionTaper = applyConnectionTaper(mesh, { implantProfile, connection, log });
    if (connectionTaper?.applied && connectionTaper.zShift && fl?.points?.length) {
      const dz = connectionTaper.zShift;
      matrix = multiply(translation(0, 0, dz), matrix);
      const points = fl.points.map((p) => [p[0], p[1], p[2] + dz]);
      fl = { ...fl, points, ...finishlineZExtrema(points) };
    }
  } catch (error) {
    log(`[stl-correct] connection taper failed: ${error?.message || error}`);
  }

  let soup = mesh.toTriangleSoup();
  try {
    const screw = buildScrewholePatch(mesh, { params: screwholeParams, log });
    if (screw.patch) soup = appendTriangles(soup, screw.patch);
  } catch (error) {
    log(`[stl-correct] screwhole failed: ${error?.message || error}`);
  }
  const combined = Mesh.fromTriangleSoup(soup);
  try {
    const res = buildVerticalBandSolid(combined, { log });
    if (res.solid) soup = appendTriangles(soup, res.solid);
  } catch (error) {
    log(`[stl-correct] fill steps failed: ${error?.message || error}`);
  }

  let filledBuf = writeBinaryStl({ positions: soup, attributes: null });
  try {
    const { key, spec } = resolveCuffConnectionSpec(implantProfile || {});
    const blended = runCuffBlendJob(filledBuf, "auto", {
      spec,
      specKey: key,
      finishLine: fl,
      connectionPrcFileName: implantProfile?.connectionPrcFileName || "",
    });
    const post = blended?.detail?.postSmooth;
    log(
      `[stl-correct] cuff ${blended?.status || ""} ${blended?.reason || ""} post=${post?.status || ""}/${post?.reason || ""}`.trim(),
    );
    if (blended?.buffer?.length) filledBuf = blended.buffer;
  } catch (error) {
    log(`[stl-correct] cuff job failed: ${error?.message || error}`);
  }
  return { filledBuf, matrix, finishLine: fl };
}

/**
 * 확인 전 보정 STL. 포스트 다듬기는 필레 전, 날카로운 마진 모서리로 제조사 준비와 같이 돌린다.
 * 코너 필레는 그 뒤에 한다. 결과는 원본 CAD 좌표로 되돌린다. 제조사 준비는 이 파일을 다시 다듬지 않는다.
 */
function finishCorrectedDesign({
  mesh,
  finishLine,
  align,
  alignMatrix,
  implantProfile,
  connection,
  screwholeParams,
  logs,
  perf,
  mark,
  total0,
  log,
}) {
  const t0 = performance.now();
  let tiltAxisVector = null;
  let outputBuffer = Buffer.alloc(0);
  let tightCorner = null;
  let filletSurface = null;
  let correctionFailed = false;
  if (finishLine?.points?.length) {
    try {
      tiltAxisVector = tiltAxisFromMesh(mesh, finishLine.points);
    } catch (error) {
      log(`[stl-correct] tilt failed: ${error?.message || error}`);
    }
    try {
      const probe = mesh.clone();
      const built = correctMarginFillet(probe, finishLine.points, { tiltAxisVector });
      if (!built.corrected?.mesh) {
        log("[stl-correct] no vertex move");
      } else {
        filletSurface = built.filletSurface;
        tightCorner = built.tightCorner;
        const prepared = prepareSharpMeshLikeManufacturer({
          mesh,
          finishLine,
          alignMatrix,
          implantProfile,
          connection,
          screwholeParams,
          log,
        });
        const smoothed = parseStl(prepared.filledBuf);
        const filleted = Mesh.fromTriangleSoup(smoothed.positions);
        const after = correctMarginFillet(filleted, prepared.finishLine.points, { tiltAxisVector });
        const positions = after.corrected?.mesh
          ? after.corrected.mesh.toTriangleSoup()
          : filleted.toTriangleSoup();
        if (after.filletSurface) filletSurface = after.filletSurface;
        const attributes = new Uint16Array(positions.length / 9);
        if (smoothed.attributes?.some((a) => a === POST_SMOOTH_PATCH_ATTRIBUTE)) {
          attributes.fill(POST_SMOOTH_PATCH_ATTRIBUTE);
        }
        outputBuffer = transformStlBuffer(
          writeBinaryStl({ positions, attributes }),
          invertRigidMatrix(prepared.matrix),
        );
      }
    } catch (error) {
      correctionFailed = true;
      outputBuffer = Buffer.alloc(0);
      log(`[stl-correct] failed: ${error?.message || error}`);
    }
  } else {
    log("[stl-correct] finishLine missing");
  }
  mark("correct", t0);
  mark("total", total0);
  return {
    version: ABUTMENT_STL_JS_VERSION,
    outputBuffer,
    bodyTriangleCount: mesh.faceCount,
    align: { ok: align.ok, message: align.message },
    alignMatrix,
    finishLine,
    /** 보정으로 옮긴 코너만 담는다. 옮긴 정점이 없으면 null. */
    tightCorner,
    /** 정렬 좌표계의 보정 필렛 면. */
    filletSurface,
    correctionFailed,
    stlMetadata: tiltAxisVector ? { tiltAxisVector } : null,
    perf,
    logs,
    correctDesign: true,
  };
}

/**
 * @param {Buffer} inputBuffer 1-stl 원본
 * @param {{ targetDiameter?: number|null, implantProfile?: object, screwholeParams?: object, finishLinePoints?: number[][], preflight?: boolean, log?: Function }} options
 * finishLinePoints가 있으면 검출을 건너뛰고 그 점을 메타데이터에 쓴다.
 * preflight면 32곳 필레 검사만 한다.
 * correctDesign이면 날카로운 마진에서 제조사 준비와 같은 포스트 다듬기를 먼저 하고, 그다음 코너 필레를 한 뒤 원본 좌표로 되돌린다.
 * surfacePrepared면 그 보정본을 정렬만 하고 스크류홀·fill·커넥션·포스트를 다시 하지 않는다.
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
  const bodyTriangleCount = mesh.faceCount;
  mark("import", t0);

  t0 = performance.now();
  const aligned = alignWithMatrix(mesh, () =>
    alignMeshToOrigin(mesh, {
      targetDiameter,
      implantProfile,
      log,
      preflight: Boolean(options.preflight),
    }),
  );
  const align = aligned.align;
  let alignMatrix = aligned.alignMatrix;
  if (!align.ok) log(`[align] warning: ${align.message}; continue to finishline detection`);
  mark("align", t0);

  let connectionTaper = null;
  if (!options.preflight && !options.correctDesign && !options.surfacePrepared) {
    t0 = performance.now();
    try {
      connectionTaper = applyConnectionTaper(mesh, {
        implantProfile,
        connection: options.connection,
        log,
      });
      if (connectionTaper?.applied && connectionTaper.zShift) {
        alignMatrix = multiply(translation(0, 0, connectionTaper.zShift), alignMatrix);
      }
    } catch (error) {
      log(`[connection-taper] failed: ${error?.message || error}`);
    }
    mark("connection_taper", t0);
  }

  t0 = performance.now();
  let finishLine = finishLineFromStoredPoints(options.finishLinePoints, log);
  if (finishLine && connectionTaper?.applied && connectionTaper.zShift) {
    const dz = connectionTaper.zShift;
    finishLine.points = finishLine.points.map((p) => [p[0], p[1], p[2] + dz]);
    Object.assign(finishLine, finishlineZExtrema(finishLine.points));
  }
  if (!finishLine) {
    try {
      const fl = detectFinishLine(mesh.unweldedByAngle(), {
        log,
        // 정렬이 끝나면 삽입축은 Z다. 외형 주축은 치우친 크라운에서 기울어 마진을 놓친다.
        ...(align.ok ? { axis: [0, 0, 1] } : {}),
      });
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
      if (error?.reason === "finishline_timeout") throw error;
    }
  }
  mark("finishline", t0);

  if (options.preflight) {
    return finishPreflight({
      mesh,
      finishLine,
      align,
      alignMatrix,
      logs,
      perf,
      mark,
      total0,
      log,
      bodyTriangleCount,
    });
  }

  if (options.correctDesign) {
    return finishCorrectedDesign({
      mesh,
      finishLine,
      align,
      alignMatrix,
      implantProfile,
      connection: options.connection,
      targetDiameter,
      screwholeParams,
      logs,
      perf,
      mark,
      total0,
      log,
    });
  }

  t0 = performance.now();
  let screw = { patch: null, result: null };
  let soup = mesh.toTriangleSoup();
  let combined = mesh;
  if (!options.surfacePrepared) {
    screw = buildScrewholePatch(mesh, { params: screwholeParams, log });
    if (screw.patch) soup = appendTriangles(soup, screw.patch);
    combined = Mesh.fromTriangleSoup(soup);
  }
  mark("screwhole", t0);

  t0 = performance.now();
  const diameter = analyzeDiameters(combined);
  mark("diameter", t0);

  t0 = performance.now();
  let fillSteps = null;
  if (!options.surfacePrepared) {
    try {
      const res = buildVerticalBandSolid(combined, { log });
      fillSteps = res.result;
      if (res.solid) soup = appendTriangles(soup, res.solid);
    } catch (error) {
      log(`[fill-steps] failed: ${error?.message || error}`);
    }
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
      // 공구 R 필렛 보정(정점을 옮기는 일)은 의뢰자 동의 단계인 확인 전 보정 STL에서만 한다.
      // 제조사 재생성인 여기서는 보정 메시를 만들지 않고 타이트 여부만 잰다. 포스트를 임의로 바꾸지 않기 위해서다.
      // 의뢰 STL이 이미 그 보정이면 재지도 않는다.
      if (options.designAlreadyCorrected) {
        tightCorner = { ...emptyMarginFilletReview(), filletCorrectionApplied: true };
      } else {
        const measured = detectTightCorners(combined, finishLine.points, {
          tiltAxisVector: stlMetadata?.tiltAxisVector,
          solids: false,
          log,
        });
        tightCorner = {
          ...measured,
          needsCorrectionReview: Number(measured?.tightCount) > 0,
          filletCorrectionApplied: false,
        };
      }
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
    connectionTaper,
    stlMetadata,
    tightCorner,
    perf,
    logs,
  };
}

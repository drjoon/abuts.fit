// 자동 생성과 다른 조정값·검볼을 치아 단위로 남긴다.
// 부분 변형은 그 케이스 기록에만 있고, 다음 생성 규칙에는 넣지 않는다.
// related files:
// - web/backend/services/abutmentDesignLogic.service.js
// - web/frontend/src/shared/practice/abutmentDesignLogic.ts

const PARAM_LABEL = {
  occlusalClearanceMm: "대합 거리",
  postTaperDeg: "테이퍼",
  postTaperLink: "높이·테이퍼 연결",
  postLingualBevelMm: "설측 사면",
  postLabialBevelMm: "순측 사면",
  postYawDeg: "포스트 회전",
  postHeightOffsetMm: "포스트 높이",
  postWidthScale: "포스트 굵기",
  marginFilletRadiusMm: "마진 필레",
  marginShoulderMm: "마진 폭",
  marginDepthMm: "마진 깊이",
  marginSubgMinMm: "치은 연하 얕은 끝",
  marginSubgMaxMm: "치은 연하 깊은 끝",
  marginScallopMm: "마진 스캘럽",
  marginSizeScale: "마진 크기",
  crownContactMm: "크라운 접촉",
  minCrownThicknessMm: "크라운 두께",
  axisToOpposing: "대합 중심 반영",
  axisMaxDeg: "삽입축 최대 각도",
  axisTargetDeg: "삽입축 각도",
  axisSourceCode: "삽입축 기준",
  axisShiftLabialMm: "윗면 순측 이동",
  axisShiftMesialMm: "윗면 근심 이동",
};

const AXIS_SOURCE = {
  "-1": "자동",
  0: "악궁 교합",
  1: "대합치 중심",
  2: "인접 평행",
};

export function toothKindOf(toothNumber) {
  const digits = String(toothNumber || "").replace(/\D/g, "");
  if (!/^[1-4][1-8]$/.test(digits)) return null;
  const pos = Number(digits[1]);
  if (pos <= 2) return "incisor";
  if (pos === 3) return "canine";
  if (pos <= 5) return "premolar";
  return "molar";
}

function noiseOf(key) {
  if (/Scale$/.test(key)) return 0.008;
  if (/Deg$/.test(key) || key === "axisSourceCode") return 0.2;
  if (key === "postTaperLink" || key === "axisToOpposing") return 0.2;
  return 0.02;
}

function capOf(key) {
  if (key === "axisTargetDeg" || key === "axisMaxDeg") return 24;
  if (/Scale$/.test(key)) return 0.45;
  if (/Deg$/.test(key)) return 15;
  if (key === "axisSourceCode" || key === "postTaperLink") return 3;
  return 2.5;
}

function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

function roundStep(value, step) {
  const n = Math.round(value / step) * step;
  return Math.round(n * 1000) / 1000;
}

function finite(value, limit = 80) {
  const n = Number(value);
  if (!Number.isFinite(n) || Math.abs(n) > limit) return null;
  return n;
}

export function sanitizeParamMap(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!/^[A-Za-z][A-Za-z0-9]{0,40}$/.test(key)) continue;
    const n = finite(value);
    if (n == null) continue;
    out[key] = roundStep(n, 0.001);
  }
  return out;
}

function sanitizePartial(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw.slice(-24)) {
    if (!item || typeof item !== "object") continue;
    const grow = finite(item.grow, 2);
    if (grow == null || Math.abs(grow) < 0.01) continue;
    const z = finite(item.z, 30);
    const angle = finite(item.angle, 8);
    const reach = finite(item.reach, 12);
    if (z == null || angle == null || reach == null) continue;
    out.push({
      z: roundStep(z, 0.01),
      angle: roundStep(angle, 0.01),
      reach: roundStep(reach, 0.01),
      grow: roundStep(grow, 0.001),
    });
  }
  return out;
}

export function sanitizeGumball(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const scaleRaw = Array.isArray(raw.scale) ? raw.scale : [];
  const scale = [0, 1, 2].map((index) => {
    const n = finite(scaleRaw[index], 4);
    return n == null ? 1 : clamp(roundStep(n, 0.001), 0.4, 1.8);
  });
  const partial = sanitizePartial(raw.partial);
  const edit = {
    heightMm: clamp(roundStep(finite(raw.heightMm, 20) || 0, 0.01), -8, 8),
    shiftLabialMm: clamp(roundStep(finite(raw.shiftLabialMm, 20) || 0, 0.01), -6, 6),
    shiftMesialMm: clamp(roundStep(finite(raw.shiftMesialMm, 20) || 0, 0.01), -6, 6),
    yawDeg: clamp(roundStep(finite(raw.yawDeg, 50) || 0, 0.1), -40, 40),
    tiltLabialDeg: clamp(roundStep(finite(raw.tiltLabialDeg, 40) || 0, 0.1), -30, 30),
    tiltMesialDeg: clamp(roundStep(finite(raw.tiltMesialDeg, 40) || 0, 0.1), -30, 30),
    scale,
    partial,
  };
  const moved =
    Math.abs(edit.heightMm) >= 0.02 ||
    Math.abs(edit.shiftLabialMm) >= 0.02 ||
    Math.abs(edit.shiftMesialMm) >= 0.02 ||
    Math.abs(edit.yawDeg) >= 0.2 ||
    Math.abs(edit.tiltLabialDeg) >= 0.2 ||
    Math.abs(edit.tiltMesialDeg) >= 0.2 ||
    scale.some((value) => Math.abs(value - 1) >= 0.008) ||
    partial.length > 0;
  return moved ? edit : null;
}

function formatNum(value) {
  const n = roundStep(value, 0.01);
  return Number.isInteger(n) ? String(n) : String(n);
}

function unitOf(key) {
  if (/Scale$/.test(key)) return "배";
  if (/Deg$/.test(key)) return "°";
  if (key === "postTaperLink" || key === "axisToOpposing" || key === "axisSourceCode") return "";
  return "mm";
}

function formatParam(key, value) {
  if (key === "axisSourceCode") return AXIS_SOURCE[String(Math.round(value))] || formatNum(value);
  if (key === "postTaperLink") return value >= 0.5 ? "연결" : "개별";
  const unit = unitOf(key);
  return `${formatNum(value)}${unit}`;
}

function paramDiffs(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const diffs = [];
  for (const key of keys) {
    const b = finite(before[key]);
    const a = finite(after[key]);
    if (b == null || a == null) continue;
    if (Math.abs(a - b) < noiseOf(key)) continue;
    diffs.push({ key, before: b, after: a, delta: roundStep(a - b, /Deg$/.test(key) ? 0.1 : 0.01) });
  }
  return diffs;
}

function directionPhrase(value, positive, negative) {
  return value >= 0 ? positive : negative;
}

/**
 * 한 치아의 원점·최종을 비교해 기록용 줄과 생성 규칙 패치를 만든다.
 * 검볼 높이·굵기·회전·이동이 조정값에 이미 있으면 생성 규칙에 한 번만 넣는다.
 */
export function describeToothChange(tooth) {
  const toothNumber = String(tooth?.toothNumber || "").replace(/\D/g, "");
  const toothKind = toothKindOf(toothNumber);
  if (!toothKind) return null;
  const before = sanitizeParamMap(tooth?.baselineParams);
  const after = sanitizeParamMap(tooth?.finalParams);
  const gumball = sanitizeGumball(tooth?.gumball);
  const diffs = paramDiffs(before, after);
  const diffKeys = new Set(diffs.map((row) => row.key));
  const params = {};
  for (const row of diffs) params[row.key] = row.delta;

  const pose = {};
  if (gumball) {
    if (Math.abs(gumball.tiltLabialDeg) >= 0.2) pose.tiltLabialDeg = gumball.tiltLabialDeg;
    if (Math.abs(gumball.tiltMesialDeg) >= 0.2) pose.tiltMesialDeg = gumball.tiltMesialDeg;
    if (!diffKeys.has("postHeightOffsetMm") && Math.abs(gumball.heightMm) >= 0.02) {
      params.postHeightOffsetMm = roundStep(gumball.heightMm, 0.01);
    }
    if (!diffKeys.has("postYawDeg") && Math.abs(gumball.yawDeg) >= 0.2) {
      params.postYawDeg = roundStep(gumball.yawDeg, 0.1);
    }
    if (!diffKeys.has("axisShiftLabialMm") && Math.abs(gumball.shiftLabialMm) >= 0.02) {
      params.axisShiftLabialMm = roundStep(gumball.shiftLabialMm, 0.01);
    }
    if (!diffKeys.has("axisShiftMesialMm") && Math.abs(gumball.shiftMesialMm) >= 0.02) {
      params.axisShiftMesialMm = roundStep(gumball.shiftMesialMm, 0.01);
    }
    const radial = (gumball.scale[0] + gumball.scale[1]) / 2;
    if (!diffKeys.has("postWidthScale") && Math.abs(radial - 1) >= 0.008) {
      params.postWidthScale = roundStep(radial - 1, 0.01);
    }
    if (!diffKeys.has("postHeightOffsetMm") && !params.postHeightOffsetMm && Math.abs(gumball.scale[2] - 1) >= 0.008) {
      params.postHeightOffsetMm = roundStep((gumball.scale[2] - 1) * 4, 0.01);
    }
  }

  const lines = diffs.map(
    (row) =>
      `#${toothNumber} ${PARAM_LABEL[row.key] || row.key} ${formatParam(row.key, row.before)} → ${formatParam(row.key, row.after)}`,
  );
  if (pose.tiltLabialDeg) {
    const way = directionPhrase(pose.tiltLabialDeg, "순측", "설측");
    lines.push(`#${toothNumber} 기울기 ${way} ${formatNum(Math.abs(pose.tiltLabialDeg))}°`);
  }
  if (pose.tiltMesialDeg) {
    const way = directionPhrase(pose.tiltMesialDeg, "근심", "원심");
    lines.push(`#${toothNumber} 근원심 기울기 ${way} ${formatNum(Math.abs(pose.tiltMesialDeg))}°`);
  }
  if (!diffKeys.has("axisShiftLabialMm") && gumball && Math.abs(gumball.shiftLabialMm) >= 0.02) {
    const way = directionPhrase(gumball.shiftLabialMm, "순측", "설측");
    lines.push(`#${toothNumber} 윗면 ${way} ${formatNum(Math.abs(gumball.shiftLabialMm))}mm`);
  }
  if (!diffKeys.has("axisShiftMesialMm") && gumball && Math.abs(gumball.shiftMesialMm) >= 0.02) {
    const way = directionPhrase(gumball.shiftMesialMm, "근심", "원심");
    lines.push(`#${toothNumber} 윗면 ${way} ${formatNum(Math.abs(gumball.shiftMesialMm))}mm`);
  }
  if (!diffKeys.has("postYawDeg") && gumball && Math.abs(gumball.yawDeg) >= 0.2) {
    lines.push(`#${toothNumber} 포스트 회전 ${formatNum(gumball.yawDeg)}°`);
  }
  if (!diffKeys.has("postHeightOffsetMm") && gumball && Math.abs(gumball.heightMm) >= 0.02) {
    lines.push(`#${toothNumber} 높이 ${formatNum(gumball.heightMm)}mm`);
  }
  if (
    !diffKeys.has("postWidthScale") &&
    gumball &&
    (Math.abs(gumball.scale[0] - 1) >= 0.008 || Math.abs(gumball.scale[1] - 1) >= 0.008 || Math.abs(gumball.scale[2] - 1) >= 0.008)
  ) {
    lines.push(
      `#${toothNumber} 크기 ${formatNum(gumball.scale[0])} × ${formatNum(gumball.scale[1])} × ${formatNum(gumball.scale[2])}`,
    );
  }
  if (gumball?.partial.length) {
    lines.push(`#${toothNumber} 부분 변형 ${gumball.partial.length}곳`);
  }

  const patchParams = {};
  for (const [key, value] of Object.entries(params)) {
    if (!Number.isFinite(value) || value === 0) continue;
    patchParams[key] = value;
  }
  const patchPose = {};
  for (const key of ["tiltLabialDeg", "tiltMesialDeg"]) {
    if (!Number.isFinite(pose[key]) || pose[key] === 0) continue;
    patchPose[key] = pose[key];
  }
  if (lines.length === 0) return null;
  return {
    toothNumber,
    toothKind,
    baselineParams: before,
    finalParams: after,
    gumball,
    lines: lines.slice(0, 12),
    patch: {
      toothKind,
      params: patchParams,
      pose: patchPose,
    },
  };
}

export function summarizeChanges(teeth) {
  const rows = [];
  const lines = [];
  for (const tooth of Array.isArray(teeth) ? teeth.slice(0, 16) : []) {
    const described = describeToothChange(tooth);
    if (!described) continue;
    rows.push(described);
    for (const line of described.lines) {
      if (lines.length >= 30) break;
      lines.push(line);
    }
  }
  return { teeth: rows, lines };
}

function addCapped(current, delta, cap) {
  const base = Number(current);
  const add = Number(delta);
  const sum = (Number.isFinite(base) ? base : 0) + (Number.isFinite(add) ? add : 0);
  return roundStep(clamp(sum, -cap, cap), cap >= 8 ? 0.1 : 0.01);
}

/** 관리자가 고른 변경을 같은 치종 규칙에 더한다. */
export function mergeRulePatch(current, patch) {
  const params = { ...(current?.params && typeof current.params === "object" ? current.params : {}) };
  for (const [key, delta] of Object.entries(patch?.params || {})) {
    if (!Number.isFinite(Number(delta)) || Number(delta) === 0) continue;
    const next = addCapped(params[key], delta, capOf(key));
    if (next === 0) delete params[key];
    else params[key] = next;
  }
  const pose = { ...(current?.pose && typeof current.pose === "object" ? current.pose : {}) };
  for (const key of ["tiltLabialDeg", "tiltMesialDeg"]) {
    const delta = Number(patch?.pose?.[key]);
    if (!Number.isFinite(delta) || delta === 0) continue;
    const next = addCapped(pose[key], delta, 12);
    if (next === 0) delete pose[key];
    else pose[key] = next;
  }
  return { params, pose };
}

function averageNumbers(values) {
  const nums = values.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value !== 0);
  if (nums.length === 0) return 0;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

/** 같은 의뢰의 같은 치종은 한 번만 더한다. 치아마다 더하면 보정이 겹친다. */
export function combineToothPatches(teeth) {
  const byKind = new Map();
  for (const tooth of Array.isArray(teeth) ? teeth : []) {
    const patch = tooth?.patch;
    if (!patch?.toothKind) continue;
    const params = patch.params && typeof patch.params === "object" ? patch.params : {};
    const pose = patch.pose && typeof patch.pose === "object" ? patch.pose : {};
    const hasParam = Object.values(params).some((value) => Number.isFinite(Number(value)) && Number(value) !== 0);
    const hasPose = ["tiltLabialDeg", "tiltMesialDeg"].some(
      (key) => Number.isFinite(Number(pose[key])) && Number(pose[key]) !== 0,
    );
    if (!hasParam && !hasPose) continue;
    const list = byKind.get(patch.toothKind) || [];
    list.push({ params, pose });
    byKind.set(patch.toothKind, list);
  }
  const out = [];
  for (const [toothKind, patches] of byKind) {
    const params = {};
    const pose = {};
    const paramKeys = new Set(patches.flatMap((patch) => Object.keys(patch.params)));
    for (const key of paramKeys) {
      const next = averageNumbers(patches.map((patch) => patch.params[key]));
      if (next !== 0) params[key] = next;
    }
    for (const key of ["tiltLabialDeg", "tiltMesialDeg"]) {
      const next = averageNumbers(patches.map((patch) => patch.pose[key]));
      if (next !== 0) pose[key] = next;
    }
    if (Object.keys(params).length === 0 && Object.keys(pose).length === 0) continue;
    out.push({ toothKind, params, pose });
  }
  return out;
}

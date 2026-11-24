// 커스텀어벗 디자인 실시간 동기화.
// 조정값 메타에는 정점 버퍼를 싣지 않는다. 재생성 메시는 custom-abutment:live kind=mesh 로 따로 보낸다.
// related files:
// - web/backend/controllers/ai/customAbutmentDesignChat.controller.js
// - web/frontend/src/shared/practice/customAbutmentDesignCache.ts

const TOOTH_RE = /^[1-4][1-8]$/;
const FIXTURE_JSON_MAX = 80_000;

export const ABUTMENT_VARIANT_IDS = [
  "space_fill",
  "strict_subg",
  "space_moderate",
  "keep_subg_no_supra",
  "fixture_axis",
  "buccal_top_open",
  "buccal_shift",
];

const ABUTMENT_VARIANT_SET = new Set(ABUTMENT_VARIANT_IDS);

/** 정보 패널에서 손댄 필드. FE AbutmentInfoFieldKey 와 같다. */
export const ABUTMENT_INFO_FIELD_KEYS = [
  "marginSubgMm",
  "maxDiameterMm",
  "marginFilletRadiusMm",
  "postHeightMm",
  "postTaperDeg",
  "postTaperLink",
  "postLingualBevelMm",
  "postLabialBevelMm",
  "occlusalClearanceMm",
  "axisSource",
];

const ABUTMENT_INFO_FIELD_SET = new Set(ABUTMENT_INFO_FIELD_KEYS);

/** 정보 패널 편집 표시. 빈 배열도 남겨 상대 화면의 손댄 표시를 지운다. */
export function sanitizeEditedInfoFields(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const item of raw) {
    const key = String(item || "").trim();
    if (!ABUTMENT_INFO_FIELD_SET.has(key) || out.includes(key)) continue;
    out.push(key);
    if (out.length >= 16) break;
  }
  return out;
}

/** 재생성 후보 id·피커 상태. 메시 버퍼는 넣지 않는다. */
export function sanitizeAbutmentChoice(row) {
  if (!row || typeof row !== "object") return {};
  const variantId = ABUTMENT_VARIANT_SET.has(String(row.variantId || ""))
    ? String(row.variantId)
    : "";
  const candidates = [];
  if (Array.isArray(row.candidates)) {
    for (const item of row.candidates) {
      if (candidates.length >= 3 || !item || typeof item !== "object") continue;
      const id = ABUTMENT_VARIANT_SET.has(String(item.id || "")) ? String(item.id) : "";
      if (!id) continue;
      candidates.push({ id, label: String(item.label || "").trim().slice(0, 80) });
    }
  }
  const picker = row.picker === true && candidates.length >= 2;
  let candidateIndex = null;
  if (
    picker &&
    Number.isInteger(row.candidateIndex) &&
    row.candidateIndex >= 0 &&
    row.candidateIndex < candidates.length
  ) {
    candidateIndex = row.candidateIndex;
  }
  return {
    ...(variantId ? { variantId } : {}),
    ...(picker
      ? {
          picker: true,
          candidates,
          ...(candidateIndex != null ? { candidateIndex } : {}),
        }
      : {}),
  };
}

function poseMatrix(raw) {
  if (!Array.isArray(raw) || raw.length < 16) return null;
  const out = [];
  for (let i = 0; i < 16; i += 1) {
    const value = Number(raw[i]);
    if (!Number.isFinite(value) || Math.abs(value) > 1e6) return null;
    out.push(Math.round(value * 1e6) / 1e6);
  }
  return out;
}

function unitAxis(raw) {
  if (!Array.isArray(raw) || raw.length < 3) return null;
  const x = Number(raw[0]);
  const y = Number(raw[1]);
  const z = Number(raw[2]);
  const len = Math.hypot(x, y, z);
  if (!(len > 0.5) || len > 1.5) return null;
  const round = (value) => Math.round((value / len) * 1e4) / 1e4;
  return [round(x), round(y), round(z)];
}

function dotAxis(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * 교합 정렬이 잡은 모델 축.
 * 앞=전치(근심), 뒤=구치(원심), U의 좁은 쪽=설·구개, 바깥=협측.
 */
export function sanitizeArchFrame(raw) {
  if (!raw || typeof raw !== "object") return null;
  const up = unitAxis(raw.up);
  const anterior = unitAxis(raw.anterior);
  const right = unitAxis(raw.right);
  if (!up || !anterior || !right) return null;
  if (Math.abs(dotAxis(up, anterior)) > 0.25 || Math.abs(dotAxis(up, right)) > 0.25) return null;
  const expect = [
    anterior[1] * up[2] - anterior[2] * up[1],
    anterior[2] * up[0] - anterior[0] * up[2],
    anterior[0] * up[1] - anterior[1] * up[0],
  ];
  if (dotAxis(right, expect) < 0.8) return null;
  return { up, anterior, right };
}

/** 악궁 자세. 스캔 파일별 정점이 아니라 의뢰 세션의 상·하악 각 하나다. */
export function sanitizeJawPose(raw) {
  if (!raw || typeof raw !== "object") return null;
  const upper = poseMatrix(raw.upper);
  const lower = poseMatrix(raw.lower);
  if (!upper && !lower) return null;
  return {
    ...(upper ? { upper } : {}),
    ...(lower ? { lower } : {}),
  };
}

/** 교합 확정. 상대가 모달을 열 때 교합을 다시 묻지 않게 한다. */
export function sanitizeBiteCheck(raw) {
  if (!raw || typeof raw !== "object") return null;
  const checkedAt = Number(raw.checkedAt);
  if (!(checkedAt > 0)) return null;
  return {
    checkedAt: Math.min(Math.round(checkedAt), Date.now() + 2000),
    qualityOk: Boolean(raw.qualityOk),
    moved: Boolean(raw.moved),
    source: raw.source === "manual" ? "manual" : "auto",
  };
}

/** 서버에 더 나중 저장이 있으면, base 로 올린 쓰기는 덮어쓰지 않는다. */
export function isStaleDesignWrite(prevSavedAt, baseSavedAt) {
  const prev = Number(prevSavedAt) || 0;
  const base = Number(baseSavedAt) || 0;
  return prev > 0 && base < prev;
}

function plainJson(raw, maxLen) {
  if (!raw || typeof raw !== "object") return null;
  try {
    const text = JSON.stringify(raw);
    if (!text || text.length > maxLen) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function numberMap(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

/**
 * 치아 배열에서 실시간 동기화 메타만 고른다.
 * s3 키·정점 버퍼·마진 루프는 빠진다.
 * @returns {object | null}
 */
export function toDesignSyncMeta(source) {
  const rows = Array.isArray(source?.teeth) ? source.teeth : [];
  const teeth = [];
  for (const row of rows.slice(0, 16)) {
    const toothNumber = String(row?.toothNumber || "").trim();
    if (!TOOTH_RE.test(toothNumber)) continue;
    const fixture = plainJson(row?.fixture, FIXTURE_JSON_MAX);
    if (!fixture || (fixture.jaw !== "upper" && fixture.jaw !== "lower")) continue;
    const gumballEdit = plainJson(row?.gumballEdit, 20_000);
    const tooth = {
      toothNumber,
      fileName: String(row?.fileName || "").trim().slice(0, 180),
      fixture,
      overrides: numberMap(row?.overrides),
      params: numberMap(row?.params),
      metrics: numberMap(row?.metrics),
    };
    if (gumballEdit) tooth.gumballEdit = gumballEdit;
    const insertionAxisWorld = unitVec(row?.insertionAxisWorld);
    if (insertionAxisWorld) tooth.insertionAxisWorld = insertionAxisWorld;
    const baselineParams = numberMap(row?.baselineParams);
    if (Object.keys(baselineParams).length > 0) tooth.baselineParams = baselineParams;
    const baselineMetrics = numberMap(row?.baselineMetrics);
    if (Object.keys(baselineMetrics).length > 0) tooth.baselineMetrics = baselineMetrics;
    const gumballBaseParams = numberMap(row?.gumballBaseParams);
    if (Object.keys(gumballBaseParams).length > 0) tooth.gumballBaseParams = gumballBaseParams;
    const gumballBaseMetrics = numberMap(row?.gumballBaseMetrics);
    if (Object.keys(gumballBaseMetrics).length > 0) tooth.gumballBaseMetrics = gumballBaseMetrics;
    const proposalInput = numberMap(row?.proposalInput);
    if (Object.keys(proposalInput).length > 0) tooth.proposalInput = proposalInput;
    if (Array.isArray(row?.editedInfoFields)) {
      tooth.editedInfoFields = sanitizeEditedInfoFields(row.editedInfoFields) ?? [];
    }
    Object.assign(tooth, sanitizeAbutmentChoice(row));
    teeth.push(tooth);
  }
  if (teeth.length === 0) return null;
  const biteCheck = sanitizeBiteCheck(source?.biteCheck);
  const jawPose = sanitizeJawPose(source?.jawPose);
  const archFrame = sanitizeArchFrame(source?.archFrame);
  const mode = source?.mode === "confirmed" || source?.mode === "manual" ? source.mode : undefined;
  const choiceRaw = source?.choice;
  const choice =
    choiceRaw && typeof choiceRaw === "object"
      ? {
          cancelDeadlineAt: choiceRaw.cancelDeadlineAt
            ? new Date(choiceRaw.cancelDeadlineAt).toISOString()
            : null,
          gracePromoteAt: choiceRaw.gracePromoteAt
            ? new Date(choiceRaw.gracePromoteAt).toISOString()
            : null,
          labCheckedAt: choiceRaw.labCheckedAt
            ? new Date(choiceRaw.labCheckedAt).toISOString()
            : null,
        }
      : undefined;
  return {
    savedAt: Number(source?.savedAt) || 0,
    updatedBy: String(source?.updatedBy || "").trim(),
    version: Number(source?.version) || 0,
    fitVersion: Number(source?.fitVersion) || 0,
    teeth,
    ...(biteCheck ? { biteCheck } : {}),
    ...(jawPose ? { jawPose } : {}),
    ...(archFrame ? { archFrame } : {}),
    ...(mode ? { mode } : {}),
    ...(choice ? { choice } : {}),
  };
}

function finiteIn(raw, min, max) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) return null;
  return Math.round(value * 1e4) / 1e4;
}

export function unitVec(raw) {
  const row = vec(raw, 3, -2, 2);
  if (!row) return null;
  const len = Math.hypot(row[0], row[1], row[2]);
  if (len < 1e-6) return null;
  return row.map((value) => Math.round((value / len) * 1e4) / 1e4);
}

function vec(raw, count, min, max) {
  if (!Array.isArray(raw) || raw.length < count) return null;
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const value = finiteIn(raw[i], min, max);
    if (value == null) return null;
    out.push(value);
  }
  return out;
}

/** 치과·기공소가 공유하는 직교 카메라. 창 비율과 무관한 자세만 남긴다. */
export function sanitizeSharedDesignView(raw) {
  if (!raw || typeof raw !== "object") return null;
  const pos = vec(raw.pos, 3, -1e5, 1e5);
  const quat = vec(raw.quat, 4, -2, 2);
  const up = vec(raw.up, 3, -2, 2);
  const target = vec(raw.target, 3, -1e5, 1e5);
  const zoom = finiteIn(raw.zoom, 0.05, 40);
  const top = finiteIn(raw.top, -1e6, 1e6);
  const bottom = finiteIn(raw.bottom, -1e6, 1e6);
  const left = finiteIn(raw.left, -1e6, 1e6);
  const right = finiteIn(raw.right, -1e6, 1e6);
  if (!pos || !quat || !up || !target) return null;
  if (zoom == null || top == null || bottom == null || left == null || right == null) return null;
  if (!(top > bottom) || !(right > left)) return null;
  const qlen = Math.hypot(quat[0], quat[1], quat[2], quat[3]);
  if (qlen < 0.5 || qlen > 1.5) return null;
  const dx = pos[0] - target[0];
  const dy = pos[1] - target[1];
  const dz = pos[2] - target[2];
  if (dx * dx + dy * dy + dz * dz < 1e-6) return null;
  const upLen = Math.hypot(up[0], up[1], up[2]);
  if (upLen < 1e-4) return null;
  return {
    pos,
    quat: quat.map((n) => Math.round((n / qlen) * 1e4) / 1e4),
    up: up.map((n) => Math.round((n / upLen) * 1e4) / 1e4),
    target,
    zoom,
    top,
    bottom,
    left,
    right,
  };
}

export function sharedDesignViewForApi(stored) {
  const view = sanitizeSharedDesignView(stored);
  if (!view) return null;
  return {
    ...view,
    savedAt: Number(stored?.savedAt) || 0,
    updatedBy: String(stored?.updatedBy || "").trim(),
  };
}

function chromeTooth(raw) {
  const tooth = String(raw || "").trim();
  return /^[1-4][1-8]$/.test(tooth) ? tooth : "";
}

function chromeToothMap(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw)) {
    if (!chromeTooth(key) || Object.keys(out).length >= 32) continue;
    if (value === true || value === false) out[key] = value;
  }
  return out;
}

/** 상악 표시·선택·투명도처럼 치과·기공소가 같이 보는 화면. 카메라는 shared view. */
export function sanitizeSharedChrome(raw) {
  if (!raw || typeof raw !== "object") return null;
  const transparency = finiteIn(raw.scanTransparency, 0, 90);
  const guide = raw.centerGuide === "center" || raw.centerGuide === "grid" ? raw.centerGuide : "off";
  const selected = Array.isArray(raw.selectedTeeth)
    ? raw.selectedTeeth.map(chromeTooth).filter(Boolean).slice(0, 16)
    : [];
  return {
    showUpper: raw.showUpper !== false,
    showLower: raw.showLower !== false,
    scanTransparency: transparency == null ? 0 : transparency,
    showFinishLine: raw.showFinishLine !== false,
    showFixtureAnalog: raw.showFixtureAnalog !== false,
    gumballOn: raw.gumballOn !== false,
    colorMapping: raw.colorMapping !== false,
    centerGuide: guide,
    selectedTeeth: selected,
    visibleTeeth: chromeToothMap(raw.visibleTeeth),
    shownScanbodies: chromeToothMap(raw.shownScanbodies),
    shownPredictedCrowns: chromeToothMap(raw.shownPredictedCrowns),
    expandedTeeth: chromeToothMap(raw.expandedTeeth),
  };
}

export function sharedChromeForApi(stored) {
  const chrome = sanitizeSharedChrome(stored);
  if (!chrome) return null;
  return {
    ...chrome,
    savedAt: Number(stored?.savedAt) || 0,
    updatedBy: String(stored?.updatedBy || "").trim(),
  };
}

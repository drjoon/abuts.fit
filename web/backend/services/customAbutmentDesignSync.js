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
    const gumballBaseParams = numberMap(row?.gumballBaseParams);
    if (Object.keys(gumballBaseParams).length > 0) tooth.gumballBaseParams = gumballBaseParams;
    const gumballBaseMetrics = numberMap(row?.gumballBaseMetrics);
    if (Object.keys(gumballBaseMetrics).length > 0) tooth.gumballBaseMetrics = gumballBaseMetrics;
    const proposalInput = numberMap(row?.proposalInput);
    if (Object.keys(proposalInput).length > 0) tooth.proposalInput = proposalInput;
    Object.assign(tooth, sanitizeAbutmentChoice(row));
    teeth.push(tooth);
  }
  if (teeth.length === 0) return null;
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
    ...(mode ? { mode } : {}),
    ...(choice ? { choice } : {}),
  };
}

function finiteIn(raw, min, max) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) return null;
  return Math.round(value * 1e4) / 1e4;
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

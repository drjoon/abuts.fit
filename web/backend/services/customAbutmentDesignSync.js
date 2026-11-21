// 커스텀어벗 디자인 실시간 동기화. 소켓에는 픽스처·조정값·검볼만 싣고 메시는 싣지 않는다.
// related files:
// - web/backend/controllers/ai/customAbutmentDesignChat.controller.js
// - web/frontend/src/shared/practice/customAbutmentDesignCache.ts

const TOOTH_RE = /^[1-4][1-8]$/;
const FIXTURE_JSON_MAX = 80_000;

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

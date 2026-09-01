// related files:
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/backend/utils/practiceTransferStage.js
// - web/frontend/src/shared/practice/prosthesisFollowUp.ts
// - 2026-09-01: 임시치아 배송 후 동일 건에 크라운/브리지 후속 추가(어벗 재청구 없음).
import { isPracticeTransferDeletedStatus } from "./practiceTransferStage.js";

const TEMP_TYPES = new Set(["임시치아", "가철성임시치아"]);
const CA_TYPE = "커스텀어벗";
const FOLLOW_UP_PHASE = "followUp";

const normalizeCompact = (value) => String(value || "").trim().replace(/\s+/g, "");

/** FDI 표시 순(18..11 → 21..28 …). labFeeSchedule.toToothDecadeSortNumber과 동일. */
const toToothDecadeSortNumber = (toothNumber) => {
  const raw = String(toothNumber || "").trim();
  if (!/^[1-4][1-8]$/.test(raw)) return Number.MAX_SAFE_INTEGER;
  const tens = Number(raw[0]);
  const ones = Number(raw[1]);
  const decadeBase = (tens - 1) * 10;
  if (tens === 1 || tens === 3) return decadeBase + (8 - ones);
  return decadeBase + (ones - 1);
};

const sortTeethFdi = (teeth) =>
  [...teeth].sort((a, b) => toToothDecadeSortNumber(a) - toToothDecadeSortNumber(b));

export const isTemporaryToothProsthesisType = (prosthesisType) => {
  const compact = normalizeCompact(prosthesisType);
  return TEMP_TYPES.has(compact);
};

export const isCustomAbutmentProsthesisType = (prosthesisType) => {
  const compact = normalizeCompact(prosthesisType);
  return compact === CA_TYPE || /^(?:커스텀)?어벗디자인$/i.test(compact);
};

export const isFollowUpProsthesisPhase = (row) =>
  String(row?.prosthesisPhase || "").trim() === FOLLOW_UP_PHASE;

export const isFinalProsthesisType = (prosthesisType) => {
  const type = String(prosthesisType || "").trim();
  return type === "크라운" || type === "브리지" || type === "인레이";
};

const linkedTeethOf = (row) => {
  const self = String(row?.toothNumber || "").trim();
  const linked = Array.isArray(row?.bridgeLinkedTeeth)
    ? row.bridgeLinkedTeeth.map((t) => String(t || "").trim()).filter(Boolean)
    : [];
  if (!self) return linked;
  return sortTeethFdi(Array.from(new Set([self, ...linked])));
};

const spanKey = (teeth) => teeth.join("-");

/** 후속 보철 1단위(크라운·브리지 스팬) 식별 키 */
export const followUpRowSpanKey = (row) => spanKey(linkedTeethOf(row));

/** 임시치아 치아가 이미 후속 크라운/브리지로 추가됐는지 */
export const hasFollowUpProsthesisForTooth = (toothWorks, toothNumber) => {
  const tooth = String(toothNumber || "").trim();
  if (!tooth) return false;
  const rows = Array.isArray(toothWorks) ? toothWorks : [];
  return rows.some((row) => {
    if (!isFollowUpProsthesisPhase(row)) return false;
    if (!isFinalProsthesisType(row?.prosthesisType)) return false;
    const linked = linkedTeethOf(row);
    return linked.includes(tooth) || String(row?.toothNumber || "").trim() === tooth;
  });
};

/** 아직 후속 보철이 없는 임시치아 스팬/단독 치아 목록 */
export const listPendingFollowUpTempSpans = (toothWorks) => {
  const rows = Array.isArray(toothWorks) ? toothWorks : [];
  const tempRows = rows.filter(
    (row) =>
      isTemporaryToothProsthesisType(row?.prosthesisType) &&
      !isFollowUpProsthesisPhase(row) &&
      String(row?.toothNumber || "").trim(),
  );
  const seen = new Set();
  const spans = [];
  for (const row of tempRows) {
    const teeth = linkedTeethOf(row);
    const key = spanKey(teeth);
    if (seen.has(key)) continue;
    if (teeth.some((t) => hasFollowUpProsthesisForTooth(rows, t))) continue;
    seen.add(key);
    spans.push({ teeth, sourceRow: row });
  }
  return spans;
};

const cloneRowForFollowUp = (sourceRow, prosthesisType, bridgeLinkedTeeth) => {
  const sorted = sortTeethFdi(
    bridgeLinkedTeeth.map((t) => String(t || "").trim()).filter(Boolean),
  );
  const next = {
    toothNumber: sorted[0] || String(sourceRow?.toothNumber || "").trim(),
    prosthesisType,
    customAbutment: Boolean(sourceRow?.customAbutment),
    bridgeLinkedTeeth: sorted,
    prosthesisPhase: FOLLOW_UP_PHASE,
  };
  const copyKeys = [
    "abutmentProductMode",
    "implantManufacturer",
    "implantBrand",
    "implantFamily",
    "implantType",
    "implantAddRequest",
    "abutmentManufacturer",
    "abutmentDiameter",
    "abutmentHeight",
  ];
  for (const key of copyKeys) {
    if (sourceRow?.[key] != null && String(sourceRow[key]).trim() !== "") {
      next[key] = sourceRow[key];
    }
  }
  return next;
};

/** 임시치아 → 후속 크라운/브리지 초안(연결 스팬=브리지, 단독=크라운) */
export const buildFollowUpToothWorksDraft = (toothWorks) => {
  const pending = listPendingFollowUpTempSpans(toothWorks);
  const draft = [];
  for (const { teeth, sourceRow } of pending) {
    const prosthesisType = teeth.length >= 2 ? "브리지" : "크라운";
    draft.push(cloneRowForFollowUp(sourceRow, prosthesisType, teeth));
  }
  return draft;
};

export const normalizeFollowUpToothWorksInput = (rawRows) => {
  const rows = Array.isArray(rawRows) ? rawRows : [];
  return rows
    .map((row) => {
      const toothNumber = String(row?.toothNumber || "").trim();
      const prosthesisType = String(row?.prosthesisType || "").trim();
      if (!toothNumber || !isFinalProsthesisType(prosthesisType)) return null;
      const bridgeLinkedTeeth = Array.isArray(row?.bridgeLinkedTeeth)
        ? row.bridgeLinkedTeeth.map((t) => String(t || "").trim()).filter(Boolean)
        : [toothNumber];
      const linked =
        prosthesisType === "브리지"
          ? Array.from(new Set([toothNumber, ...bridgeLinkedTeeth])).sort()
          : [toothNumber];
      return {
        ...row,
        toothNumber,
        prosthesisType,
        bridgeLinkedTeeth: linked,
        prosthesisPhase: FOLLOW_UP_PHASE,
        customAbutment: Boolean(row?.customAbutment),
      };
    })
    .filter(Boolean);
};

export const mergeFollowUpToothWorks = (existing, followUpRows) => {
  const base = Array.isArray(existing) ? [...existing] : [];
  const add = Array.isArray(followUpRows) ? followUpRows : [];
  return [...base, ...add];
};

export const isPendingProsthesisFollowUpRecord = (
  record,
  requestorDownloadedAt = null,
) => {
  if (!record || typeof record !== "object") return false;
  if (record.canceledAt) return false;
  if (!record.labAcceptedAt) return true;
  const mainAcceptedAt = requestorDownloadedAt || null;
  const appendedAt = record.appendedAt;
  if (!appendedAt) return false;
  if (!mainAcceptedAt) return true;
  const mainMs = new Date(mainAcceptedAt).getTime();
  const appendMs = new Date(appendedAt).getTime();
  if (!Number.isFinite(mainMs) || !Number.isFinite(appendMs)) return false;
  // 최초 기공소 수락 이후 추가된 후속 제작은 별도 수락 전까지 pending
  return appendMs >= mainMs;
};

/** 기공소 수락 전(pending) 후속 제작 이력 */
export const getPendingProsthesisFollowUps = (
  followUps,
  requestorDownloadedAt = null,
) => {
  const list = Array.isArray(followUps) ? followUps : [];
  return list.filter((row) =>
    isPendingProsthesisFollowUpRecord(row, requestorDownloadedAt),
  );
};

export const stripFollowUpToothWorksForRecord = (toothWorks, followUpRecord) => {
  const teeth = new Set(
    (Array.isArray(followUpRecord?.toothNumbers)
      ? followUpRecord.toothNumbers
      : []
    )
      .map((t) => String(t || "").trim())
      .filter(Boolean),
  );
  if (teeth.size === 0) {
    return Array.isArray(toothWorks) ? [...toothWorks] : [];
  }
  return (Array.isArray(toothWorks) ? toothWorks : []).filter((row) => {
    if (!isFollowUpProsthesisPhase(row)) return true;
    const linked = linkedTeethOf(row);
    return !linked.some((t) => teeth.has(t));
  });
};

export const markPendingProsthesisFollowUpsAccepted = (followUps, acceptedAt = new Date()) => {
  const list = Array.isArray(followUps) ? followUps : [];
  const when = acceptedAt instanceof Date ? acceptedAt : new Date();
  return list.map((row) => {
    if (!isPendingProsthesisFollowUpRecord(row)) return row;
    return { ...row, labAcceptedAt: when };
  });
};

export const canManagePendingProsthesisFollowUp = (transferDoc) => {
  if (!transferDoc || typeof transferDoc !== "object") {
    return { ok: false, reason: "missing_transfer", message: "의뢰를 찾을 수 없습니다." };
  }
  if (isPracticeTransferDeletedStatus(transferDoc.status)) {
    return { ok: false, reason: "deleted", message: "삭제된 의뢰입니다." };
  }
  const pending = getPendingProsthesisFollowUps(
    transferDoc.prosthesisFollowUps,
    transferDoc.requestorDownloadedAt,
  );
  if (pending.length === 0) {
    return {
      ok: false,
      reason: "no_pending",
      message: "취소·변경할 수 있는 후속 제작이 없습니다.",
    };
  }
  return { ok: true, pending };
};

/**
 * 후속 보철 제작 가능 여부.
 * 출고·배송 완료 여부와 무관하게 기공소 수락 후 언제든 의뢰 가능.
 */
export const canAppendProsthesisFollowUp = (
  transferDoc,
  _options = {},
) => {
  if (!transferDoc || typeof transferDoc !== "object") {
    return { ok: false, reason: "missing_transfer", message: "의뢰를 찾을 수 없습니다." };
  }
  if (isPracticeTransferDeletedStatus(transferDoc.status)) {
    return { ok: false, reason: "deleted", message: "삭제된 의뢰입니다." };
  }
  if (!transferDoc.requestorDownloadedAt) {
    return {
      ok: false,
      reason: "not_accepted",
      message: "기공소 수락 후에 크라운/브리지 제작을 의뢰할 수 있습니다.",
    };
  }

  const toothWorks = Array.isArray(transferDoc.toothWorks) ? transferDoc.toothWorks : [];
  const hasTemp = toothWorks.some((row) =>
    isTemporaryToothProsthesisType(row?.prosthesisType),
  );
  if (!hasTemp) {
    return {
      ok: false,
      reason: "no_temp_teeth",
      message: "임시치아 의뢰가 없어 후속 보철을 추가할 수 없습니다.",
    };
  }

  const pending = listPendingFollowUpTempSpans(toothWorks);
  if (pending.length === 0) {
    return {
      ok: false,
      reason: "already_appended",
      message: "이미 모든 임시치아에 대한 후속 보철이 의뢰되었습니다.",
    };
  }

  return { ok: true, pendingSpans: pending };
};

export const validateFollowUpToothWorksAgainstSource = (
  sourceToothWorks,
  followUpRows,
) => {
  const pending = listPendingFollowUpTempSpans(sourceToothWorks);
  const pendingSpanKeys = new Set(pending.map(({ teeth }) => spanKey(teeth)));
  const rows = normalizeFollowUpToothWorksInput(followUpRows);
  if (rows.length === 0) {
    return {
      ok: false,
      message: "제작할 최종 보철 단위를 선택해주세요.",
    };
  }

  const seenKeys = new Set();
  for (const row of rows) {
    const linked = linkedTeethOf(row);
    const key = spanKey(linked);
    if (!pendingSpanKeys.has(key)) {
      const label = linked.join(", ");
      return {
        ok: false,
        message: `${label}은(는) 후속 보철 추가 대상이 아닙니다.`,
      };
    }
    if (seenKeys.has(key)) {
      return {
        ok: false,
        message: "같은 보철 단위가 중복 선택되었습니다.",
      };
    }
    seenKeys.add(key);
  }
  return { ok: true, rows };
};

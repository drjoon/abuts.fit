// related files:
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/backend/utils/practiceTransferStage.js
// - web/frontend/src/shared/practice/prosthesisFollowUp.ts
// - web/frontend/src/shared/practice/prosthesisFollowUpFeeStages.ts
// - 2026-09-15: prosthesisFeeStages — 단계별 불변 스냅샷(치식+견적). case billing·최종 feeQuote와 분리.
// - 2026-09-15: Stage SSOT — toothWorks/YMD 고정. UI는 case toothWorks focus 필터 대신 stage 조회.
// - 2026-09-15: 후속 스팬 = 인접 연결 연결요소(44-45 / 45-46 쪼개짐 방지). 기공비 차감은 스팬 치아 전원.
// - 2026-09-08: 진행 탭 채팅 payload에 임플란트·어벗 스펙 포함(serializeFollowUpToothWorksForChatPayload).
// - 2026-09-08: 후속 제작 시 원 임시치아 기공비 차감(브리지/크라운 순증분만 홀드).
// - 2026-09-08: 차트 표시 맵 — 후속+원 병존 시 형태는 후속, CA·스펙은 원 임시치아 행.
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

const getAdjacentTeeth = (toothNumber) => {
  const raw = String(toothNumber || "").trim();
  if (!/^[1-4][1-8]$/.test(raw)) return [];
  const tens = Number(raw[0]);
  const ones = Number(raw[1]);
  const out = [];
  if (ones > 1) out.push(`${tens}${ones - 1}`);
  if (ones < 8) out.push(`${tens}${ones + 1}`);
  if (ones === 1) {
    if (tens === 1) out.push("21");
    if (tens === 2) out.push("11");
    if (tens === 3) out.push("41");
    if (tens === 4) out.push("31");
  }
  return [...new Set(out)];
};

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

/** 행 집합 안에서 인접 브리지 연결(한쪽만 있어도 연결). */
const collectAdjacentLinksAmongRows = (rows, toothNumber) => {
  const tooth = String(toothNumber || "").trim();
  const adjacent = new Set(getAdjacentTeeth(tooth));
  const byTooth = new Map();
  for (const row of rows) {
    const other = String(row?.toothNumber || "").trim();
    if (other && !byTooth.has(other)) byTooth.set(other, row);
  }
  const links = new Set();
  const self = byTooth.get(tooth);
  for (const linked of Array.isArray(self?.bridgeLinkedTeeth)
    ? self.bridgeLinkedTeeth
    : []) {
    const other = String(linked || "").trim();
    if (adjacent.has(other) && byTooth.has(other)) links.add(other);
  }
  for (const [other, row] of byTooth) {
    if (!other || other === tooth || !adjacent.has(other)) continue;
    const otherLinks = Array.isArray(row?.bridgeLinkedTeeth)
      ? row.bridgeLinkedTeeth
      : [];
    if (otherLinks.some((value) => String(value || "").trim() === tooth)) {
      links.add(other);
    }
  }
  return [...links];
};

/**
 * 임시치아 행의 인접 연결을 연결요소(스팬)로 묶는다.
 * 치아별 bridgeLinkedTeeth가 인접만 저장돼도 44-45-46을 하나로 본다.
 */
const buildConnectedTempSpans = (tempRows) => {
  const byTooth = new Map();
  for (const row of Array.isArray(tempRows) ? tempRows : []) {
    const tooth = String(row?.toothNumber || "").trim();
    if (!/^[1-4][1-8]$/.test(tooth) || byTooth.has(tooth)) continue;
    byTooth.set(tooth, row);
  }
  const visited = new Set();
  const spans = [];
  for (const start of sortTeethFdi([...byTooth.keys()])) {
    if (visited.has(start)) continue;
    const component = [];
    const queue = [start];
    while (queue.length > 0) {
      const current = queue.shift();
      if (visited.has(current)) continue;
      visited.add(current);
      component.push(current);
      for (const neighbor of collectAdjacentLinksAmongRows(tempRows, current)) {
        if (!visited.has(neighbor) && byTooth.has(neighbor)) queue.push(neighbor);
      }
    }
    const teeth = sortTeethFdi(component);
    const sourceRow = byTooth.get(teeth[0]) || byTooth.get(start);
    spans.push({ teeth, sourceRow });
  }
  return spans;
};

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
  return buildConnectedTempSpans(tempRows).filter(
    ({ teeth }) => !teeth.some((t) => hasFollowUpProsthesisForTooth(rows, t)),
  );
};

/** 후속 보철에 원 임시치아 임플란트·어벗 스펙 상속 */
const FOLLOW_UP_SPEC_COPY_KEYS = [
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

const copyFollowUpSpecsFromSource = (target, sourceRow) => {
  for (const key of FOLLOW_UP_SPEC_COPY_KEYS) {
    if (sourceRow?.[key] != null && String(sourceRow[key]).trim() !== "") {
      target[key] = sourceRow[key];
    }
  }
  return target;
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
  return copyFollowUpSpecsFromSource(next, sourceRow);
};

/**
 * 진행 탭 시스템 채팅용 toothWorks — 차트에 임플란트/어벗이 보이도록 스펙 포함.
 * (의뢰 탭은 transfer.toothWorks를 직접 읽으므로 별도.)
 */
export const serializeFollowUpToothWorksForChatPayload = (rows) => {
  const list = Array.isArray(rows) ? rows : [];
  return list.map((row) => {
    const toothNumber = String(row?.toothNumber || "").trim();
    const prosthesisType = String(row?.prosthesisType || "").trim();
    const bridgeLinkedTeeth = Array.isArray(row?.bridgeLinkedTeeth)
      ? row.bridgeLinkedTeeth.map((t) => String(t || "").trim()).filter(Boolean)
      : [];
    return copyFollowUpSpecsFromSource(
      {
        toothNumber,
        prosthesisType,
        bridgeLinkedTeeth,
        customAbutment: Boolean(row?.customAbutment),
        prosthesisPhase: FOLLOW_UP_PHASE,
      },
      row,
    );
  });
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
          ? sortTeethFdi(
              Array.from(new Set([toothNumber, ...bridgeLinkedTeeth])),
            )
          : [toothNumber];
      return {
        ...row,
        toothNumber: linked[0] || toothNumber,
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

/** 어벗·임플란트 표시 필드 — 후속 행이 덮어도 원치아(임시치아) 입력을 유지 */
const DISPLAY_ABUTMENT_SPEC_KEYS = [
  "customAbutment",
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

/**
 * 같은 치아에 원 행+후속 행이 있으면 형태는 후속, CA·스펙은 원 행.
 * (FE `mergeToothWorkRowsForChartDisplay` SSOT 미러)
 */
export const mergeToothWorkRowsForChartDisplay = (rows) => {
  const list = (Array.isArray(rows) ? rows : []).filter((row) => {
    const tooth = String(row?.toothNumber || "").trim();
    return Boolean(row) && /^[1-4][1-8]$/.test(tooth);
  });
  if (list.length === 0) return null;
  if (list.length === 1) return { ...list[0] };

  const followUps = list.filter(
    (row) =>
      isFollowUpProsthesisPhase(row) &&
      isFinalProsthesisType(row?.prosthesisType),
  );
  const bases = list.filter((row) => !isFollowUpProsthesisPhase(row));
  const followUp = followUps.length > 0 ? followUps[followUps.length - 1] : null;
  const base = bases.length > 0 ? bases[bases.length - 1] : null;

  if (followUp && base) {
    const merged = {
      ...followUp,
      toothNumber: String(base.toothNumber || followUp.toothNumber || "").trim(),
    };
    for (const key of DISPLAY_ABUTMENT_SPEC_KEYS) {
      if (key === "customAbutment") {
        merged.customAbutment = Boolean(base.customAbutment);
        continue;
      }
      const value = base[key];
      if (value != null && String(value).trim() !== "") {
        merged[key] = value;
      }
    }
    return merged;
  }
  if (followUp) return { ...followUp };
  if (base) return { ...base };
  return { ...list[list.length - 1] };
};

export const buildToothWorkDisplayByTooth = (toothWorks) => {
  const ownByTooth = new Map();
  for (const row of Array.isArray(toothWorks) ? toothWorks : []) {
    const anchor = String(row?.toothNumber || "").trim();
    if (!/^[1-4][1-8]$/.test(anchor)) continue;
    const bucket = ownByTooth.get(anchor) || [];
    bucket.push(row);
    ownByTooth.set(anchor, bucket);
  }

  const map = new Map();
  for (const [tooth, rows] of ownByTooth) {
    const merged = mergeToothWorkRowsForChartDisplay(rows);
    if (merged) map.set(tooth, { ...merged, toothNumber: tooth });
  }

  for (const row of Array.isArray(toothWorks) ? toothWorks : []) {
    const linked = Array.isArray(row?.bridgeLinkedTeeth)
      ? row.bridgeLinkedTeeth.map((t) => String(t || "").trim()).filter(Boolean)
      : [];
    for (const tooth of linked) {
      if (!/^[1-4][1-8]$/.test(tooth) || map.has(tooth)) continue;
      const borrowed = mergeToothWorkRowsForChartDisplay([
        { ...row, toothNumber: tooth },
      ]);
      if (borrowed) map.set(tooth, { ...borrowed, toothNumber: tooth });
    }
  }
  return map;
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
      message: "기공소 작업시작 후에 크라운/브리지 제작을 의뢰할 수 있습니다.",
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

/**
 * 후속 선택 스팬에 대응하는 원 임시치아 행(어벗 제외 기공비 차감용).
 * 스팬에 속한 치아 행을 모두 포함 — 인접만 저장된 bridgeLinkedTeeth와도 매칭.
 */
export const pickSourceTempRowsForFollowUpCredit = (
  sourceToothWorks,
  followUpRows,
) => {
  const source = Array.isArray(sourceToothWorks) ? sourceToothWorks : [];
  const followUps = Array.isArray(followUpRows) ? followUpRows : [];
  if (source.length === 0 || followUps.length === 0) return [];

  const followTeeth = new Set();
  for (const row of followUps) {
    if (!isFollowUpProsthesisPhase(row)) continue;
    if (!isFinalProsthesisType(row?.prosthesisType)) continue;
    for (const tooth of linkedTeethOf(row)) followTeeth.add(tooth);
  }
  if (followTeeth.size === 0) return [];

  const out = [];
  const seen = new Set();
  for (const row of source) {
    if (!isTemporaryToothProsthesisType(row?.prosthesisType)) continue;
    if (isFollowUpProsthesisPhase(row)) continue;
    const tooth = String(row?.toothNumber || "").trim();
    if (!tooth || !followTeeth.has(tooth) || seen.has(tooth)) continue;
    seen.add(tooth);
    out.push(row);
  }
  return out;
};

/**
 * 후속 최종 보철 견적에서 원 임시치아 기공비를 차감한 순증분.
 * 원 홀드(임시치아)는 유지하고 follow-up 홀드만 (final − temp)로 잡으면
 * 합계가 브리지/크라운 기공비가 된다.
 */
export const applyProsthesisFollowUpTempCredit = ({
  finalLabFeeTotal = 0,
  finalTotal = 0,
  tempCreditLabFeeTotal = 0,
} = {}) => {
  const finalLab = Math.max(0, Math.round(Number(finalLabFeeTotal || 0)));
  const finalTot = Math.max(
    0,
    Math.round(Number(finalTotal != null ? finalTotal : finalLabFeeTotal) || 0),
  );
  const credit = Math.max(0, Math.round(Number(tempCreditLabFeeTotal || 0)));
  const appliedCredit = Math.min(credit, finalLab);
  const netLab = Math.max(0, finalLab - appliedCredit);
  const netTotal = Math.max(0, finalTot - appliedCredit);
  return {
    finalLabFeeTotal: finalLab,
    finalTotal: finalTot,
    tempCreditLabFeeTotal: appliedCredit,
    labFeeTotal: netLab,
    total: netTotal,
  };
};

/** 후속 행 제외 — 임시치아 단계 스냅샷용 */
export const baseToothWorksWithoutFollowUp = (toothWorks) =>
  (Array.isArray(toothWorks) ? toothWorks : []).filter(
    (row) => !isFollowUpProsthesisPhase(row),
  );

export const hasTemporaryProsthesisRows = (toothWorks) =>
  (Array.isArray(toothWorks) ? toothWorks : []).some(
    (row) =>
      isTemporaryToothProsthesisType(row?.prosthesisType) &&
      !isFollowUpProsthesisPhase(row),
  );

/** 견적 라인 스냅샷 — 표시·재계산에 필요한 필드만 */
export const normalizeProsthesisFeeLines = (lines) =>
  (Array.isArray(lines) ? lines : [])
    .map((line) => {
      if (!line || typeof line !== "object") return null;
      const toothNumber = String(line.toothNumber || "").trim();
      const prosthesisType = String(line.prosthesisType || "").trim();
      if (!toothNumber && !prosthesisType) return null;
      const out = {
        toothNumber,
        prosthesisType,
        labFee: Math.max(0, Math.round(Number(line.labFee || 0))),
        labAbutmentFee: Math.max(
          0,
          Math.round(Number(line.labAbutmentFee || 0)),
        ),
        abutmentRetail: Math.max(
          0,
          Math.round(Number(line.abutmentRetail || 0)),
        ),
      };
      if (line.labFeeMin != null && Number.isFinite(Number(line.labFeeMin))) {
        out.labFeeMin = Math.max(0, Math.round(Number(line.labFeeMin)));
      }
      if (line.labAbutmentPending) out.labAbutmentPending = true;
      if (line.abutmentRetailNote) {
        out.abutmentRetailNote = String(line.abutmentRetailNote).trim();
      }
      return out;
    })
    .filter(Boolean);

/** Stage 치식 스냅샷 — 표시에 필요한 필드만 평문 복사 */
export const cloneToothWorksForStageSnapshot = (toothWorks) =>
  (Array.isArray(toothWorks) ? toothWorks : [])
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const plain =
        typeof row.toObject === "function" ? row.toObject() : { ...row };
      const toothNumber = String(plain.toothNumber || "").trim();
      const prosthesisType = String(plain.prosthesisType || "").trim();
      if (!toothNumber && !prosthesisType) return null;
      const linked = Array.isArray(plain.bridgeLinkedTeeth)
        ? plain.bridgeLinkedTeeth.map((t) => String(t || "").trim()).filter(Boolean)
        : [];
      const out = {
        toothNumber,
        prosthesisType,
        customAbutment: Boolean(plain.customAbutment),
        bridgeLinkedTeeth: linked,
      };
      if (String(plain.prosthesisPhase || "").trim()) {
        out.prosthesisPhase = String(plain.prosthesisPhase).trim();
      }
      for (const key of FOLLOW_UP_SPEC_COPY_KEYS) {
        if (plain[key] != null && String(plain[key]).trim() !== "") {
          out[key] = plain[key];
        }
      }
      return out;
    })
    .filter(Boolean);

const normalizeStageYmd = (raw) => {
  const ymd = String(raw || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : "";
};

export const PROSTHESIS_FEE_STAGE_TEMP_KEY = "temp";

export const zirconiaProsthesisFeeStageKey = (followUpIndex) =>
  `zirconia-${Math.max(0, Math.floor(Number(followUpIndex) || 0))}`;

export const getProsthesisFeeStageByKey = (stages, key) => {
  const want = String(key || "").trim();
  if (!want) return null;
  return (
    listProsthesisFeeStages(stages).find(
      (row) => String(row?.key || "").trim() === want,
    ) || null
  );
};

/**
 * 단계별 불변 스냅샷 1건.
 * - temp: 원 임시치아(+CA) 수가 + toothWorks
 * - zirconia-N: 해당 후속 브리지/크라운 수가(차감 전). net*는 홀드용 순증분.
 */
export const buildProsthesisFeeStageRecord = ({
  key,
  followUpIndex = -1,
  title = "",
  fees = null,
  toothWorks = null,
  netLabFeeTotal = null,
  netTotal = null,
  tempCreditLabFeeTotal = 0,
  quotedAt = null,
  orderYmd = "",
  arrivalYmd = "",
  previousOrderYmd = "",
  previousArrivalYmd = "",
} = {}) => {
  const labFeeTotal = Math.max(
    0,
    Math.round(Number(fees?.labFeeTotal ?? fees?.total ?? 0)),
  );
  const total = Math.max(
    0,
    Math.round(Number(fees?.total != null ? fees.total : labFeeTotal)),
  );
  const idx =
    followUpIndex == null || !Number.isFinite(Number(followUpIndex))
      ? -1
      : Math.floor(Number(followUpIndex));
  const snapshotToothWorks = cloneToothWorksForStageSnapshot(toothWorks);
  const record = {
    key: String(key || "").trim() || (idx < 0 ? PROSTHESIS_FEE_STAGE_TEMP_KEY : zirconiaProsthesisFeeStageKey(idx)),
    followUpIndex: idx,
    title:
      String(title || "").trim() ||
      (idx < 0
        ? "임시치아 단계"
        : `지르 보철 단계${idx > 0 ? ` ${idx + 1}` : ""}`.trim()),
    labFeeTotal,
    total,
    lines: normalizeProsthesisFeeLines(fees?.lines),
    quotedAt: quotedAt instanceof Date ? quotedAt : quotedAt ? new Date(quotedAt) : new Date(),
    orderYmd: normalizeStageYmd(orderYmd),
    arrivalYmd: normalizeStageYmd(arrivalYmd),
    previousOrderYmd: normalizeStageYmd(previousOrderYmd),
    previousArrivalYmd: normalizeStageYmd(previousArrivalYmd),
  };
  if (snapshotToothWorks.length > 0) {
    record.toothWorks = snapshotToothWorks;
  }
  if (idx >= 0) {
    record.netLabFeeTotal = Math.max(
      0,
      Math.round(
        Number(netLabFeeTotal != null ? netLabFeeTotal : labFeeTotal),
      ),
    );
    record.netTotal = Math.max(
      0,
      Math.round(Number(netTotal != null ? netTotal : total)),
    );
    record.tempCreditLabFeeTotal = Math.max(
      0,
      Math.round(Number(tempCreditLabFeeTotal || 0)),
    );
  }
  return record;
};

export const listProsthesisFeeStages = (stages) =>
  (Array.isArray(stages) ? stages : [])
    .map((row) => (row && typeof row.toObject === "function" ? row.toObject() : row))
    .filter((row) => row && typeof row === "object" && String(row.key || "").trim());

/** 같은 key면 교체하지 않고 유지(이미 저장된 단계 덮어쓰기 방지). force=true면 교체. */
export const upsertProsthesisFeeStage = (
  stages,
  stage,
  { force = false } = {},
) => {
  const list = listProsthesisFeeStages(stages);
  const nextStage =
    stage && typeof stage === "object" ? { ...stage } : null;
  if (!nextStage || !String(nextStage.key || "").trim()) return list;
  const key = String(nextStage.key).trim();
  const idx = list.findIndex((row) => String(row?.key || "").trim() === key);
  if (idx >= 0) {
    if (!force) return list;
    const copy = [...list];
    copy[idx] = { ...list[idx], ...nextStage, key };
    return copy;
  }
  return [...list, nextStage];
};

/**
 * 지르 단계 arrivalYmd만 갱신(치식·견적 불변). key 없으면 no-op.
 */
export const patchProsthesisFeeStageArrivalYmd = (stages, followUpIndex, arrivalYmd) => {
  const list = listProsthesisFeeStages(stages);
  const idx = Math.max(0, Math.floor(Number(followUpIndex) || 0));
  const key = zirconiaProsthesisFeeStageKey(idx);
  const ymd = normalizeStageYmd(arrivalYmd);
  if (!ymd) return list;
  const at = list.findIndex((row) => String(row?.key || "").trim() === key);
  if (at < 0) return list;
  const copy = [...list];
  copy[at] = { ...list[at], arrivalYmd: ymd };
  return copy;
};

export const removeProsthesisFeeStagesByFollowUpIndexes = (
  stages,
  followUpIndexes,
) => {
  const drop = new Set(
    (Array.isArray(followUpIndexes) ? followUpIndexes : [])
      .map((n) => Math.max(0, Math.floor(Number(n))))
      .filter((n) => Number.isFinite(n)),
  );
  if (drop.size === 0) return listProsthesisFeeStages(stages);
  return listProsthesisFeeStages(stages).filter((row) => {
    const idx = Math.floor(Number(row?.followUpIndex));
    if (!Number.isFinite(idx) || idx < 0) return true;
    return !drop.has(idx);
  });
};

const followUpToothWorksFromCase = (toothWorks, record) => {
  const rows = Array.isArray(toothWorks) ? toothWorks : [];
  const teeth = new Set(
    (Array.isArray(record?.toothNumbers) ? record.toothNumbers : [])
      .map((t) => String(t || "").trim())
      .filter(Boolean),
  );
  const followUps = rows.filter(
    (row) =>
      isFollowUpProsthesisPhase(row) &&
      isFinalProsthesisType(row?.prosthesisType),
  );
  if (teeth.size === 0) return followUps;
  return followUps.filter((row) => {
    const anchor = String(row?.toothNumber || "").trim();
    if (anchor && teeth.has(anchor)) return true;
    return linkedTeethOf(row).some((t) => teeth.has(t));
  });
};

/**
 * 레거시(치식 스냅샷 없는 feeStages / stages 없음) → 표시용 Stage hydrate.
 * 저장은 호출측에서 선택. 기존 key의 fee·lines는 덮지 않고 toothWorks/YMD만 채움.
 */
export const hydrateProsthesisFeeStages = ({
  prosthesisFeeStages,
  prosthesisFollowUps,
  toothWorks,
  orderYmd = "",
  arrivalYmd = "",
} = {}) => {
  const caseRows = Array.isArray(toothWorks) ? toothWorks : [];
  const baseRows = baseToothWorksWithoutFollowUp(caseRows);
  const followUps = (Array.isArray(prosthesisFollowUps) ? prosthesisFollowUps : [])
    .map((row) => (row && typeof row.toObject === "function" ? row.toObject() : row))
    .filter((row) => row && !String(row?.canceledAt || "").trim());

  let stages = listProsthesisFeeStages(prosthesisFeeStages);
  const hasTemp = stages.some(
    (row) => String(row?.key || "").trim() === PROSTHESIS_FEE_STAGE_TEMP_KEY,
  );
  if (!hasTemp && hasTemporaryProsthesisRows(caseRows)) {
    stages = upsertProsthesisFeeStage(
      stages,
      buildProsthesisFeeStageRecord({
        key: PROSTHESIS_FEE_STAGE_TEMP_KEY,
        followUpIndex: -1,
        title: "임시치아 단계",
        toothWorks: baseRows,
        orderYmd,
        arrivalYmd,
        fees: { labFeeTotal: 0, total: 0, lines: [] },
      }),
    );
  }

  stages = stages.map((row) => {
    const key = String(row?.key || "").trim();
    const next = { ...row };
    if (
      key === PROSTHESIS_FEE_STAGE_TEMP_KEY &&
      (!Array.isArray(next.toothWorks) || next.toothWorks.length === 0) &&
      baseRows.length > 0
    ) {
      next.toothWorks = cloneToothWorksForStageSnapshot(baseRows);
    }
    if (!next.orderYmd && orderYmd) next.orderYmd = normalizeStageYmd(orderYmd);
    if (!next.arrivalYmd && arrivalYmd && key === PROSTHESIS_FEE_STAGE_TEMP_KEY) {
      next.arrivalYmd = normalizeStageYmd(arrivalYmd);
    }
    return next;
  });

  for (const fu of followUps) {
    const idx = Math.max(0, Math.floor(Number(fu?.followUpIndex || 0)));
    const key = zirconiaProsthesisFeeStageKey(idx);
    const existing = stages.find((row) => String(row?.key || "").trim() === key);
    const zirRows = followUpToothWorksFromCase(caseRows, fu);
    const delta = fu?.billingDelta && typeof fu.billingDelta === "object"
      ? fu.billingDelta
      : {};
    if (!existing) {
      stages = upsertProsthesisFeeStage(
        stages,
        buildProsthesisFeeStageRecord({
          key,
          followUpIndex: idx,
          title: idx > 0 ? `지르 보철 단계 ${idx + 1}` : "지르 보철 단계",
          toothWorks: zirRows,
          fees: {
            labFeeTotal: delta.finalLabFeeTotal ?? delta.labFeeTotal,
            total: delta.finalTotal ?? delta.total,
            lines: delta.lines,
          },
          netLabFeeTotal: delta.labFeeTotal,
          netTotal: delta.total,
          tempCreditLabFeeTotal: delta.tempCreditLabFeeTotal || 0,
          orderYmd: fu.orderYmd,
          arrivalYmd: fu.arrivalYmd,
          previousOrderYmd: fu.previousOrderYmd,
          previousArrivalYmd: fu.previousArrivalYmd,
        }),
      );
      continue;
    }
    const at = stages.findIndex((row) => String(row?.key || "").trim() === key);
    if (at < 0) continue;
    const patched = { ...stages[at] };
    if (
      (!Array.isArray(patched.toothWorks) || patched.toothWorks.length === 0) &&
      zirRows.length > 0
    ) {
      patched.toothWorks = cloneToothWorksForStageSnapshot(zirRows);
    }
    if (!patched.orderYmd) patched.orderYmd = normalizeStageYmd(fu.orderYmd);
    if (!patched.arrivalYmd) patched.arrivalYmd = normalizeStageYmd(fu.arrivalYmd);
    if (!patched.previousOrderYmd) {
      patched.previousOrderYmd = normalizeStageYmd(fu.previousOrderYmd);
    }
    if (!patched.previousArrivalYmd) {
      patched.previousArrivalYmd = normalizeStageYmd(fu.previousArrivalYmd);
    }
    stages = [...stages];
    stages[at] = patched;
  }

  return stages;
};

export const serializeProsthesisFeeStagesForApi = (stages) =>
  listProsthesisFeeStages(stages).map((row) => ({
    key: String(row.key || "").trim(),
    followUpIndex:
      row.followUpIndex != null && Number.isFinite(Number(row.followUpIndex))
        ? Math.floor(Number(row.followUpIndex))
        : -1,
    title: String(row.title || "").trim(),
    labFeeTotal: Math.max(0, Math.round(Number(row.labFeeTotal || 0))),
    total: Math.max(0, Math.round(Number(row.total || 0))),
    lines: normalizeProsthesisFeeLines(row.lines),
    quotedAt: row.quotedAt || null,
    toothWorks: cloneToothWorksForStageSnapshot(row.toothWorks),
    orderYmd: normalizeStageYmd(row.orderYmd),
    arrivalYmd: normalizeStageYmd(row.arrivalYmd),
    previousOrderYmd: normalizeStageYmd(row.previousOrderYmd),
    previousArrivalYmd: normalizeStageYmd(row.previousArrivalYmd),
    ...(row.followUpIndex != null && Number(row.followUpIndex) >= 0
      ? {
          netLabFeeTotal: Math.max(
            0,
            Math.round(Number(row.netLabFeeTotal ?? row.labFeeTotal ?? 0)),
          ),
          netTotal: Math.max(
            0,
            Math.round(Number(row.netTotal ?? row.total ?? 0)),
          ),
          tempCreditLabFeeTotal: Math.max(
            0,
            Math.round(Number(row.tempCreditLabFeeTotal || 0)),
          ),
        }
      : {}),
  }));

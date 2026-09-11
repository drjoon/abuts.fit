// related files:
// - web/backend/services/practiceTransferBilling.service.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/backend/controllers/requests/designHandoff.controller.js
// - web/backend/utils/labFeeSchedule.js
// - 2026-09-10: 리메이크 hold 직후 기공소 ESCROW_RELEASE(정산 누락 수정).
// - 2026-09-10: Mutation UX — assert 중복 GL 제거. quote slim. timing 로그.
// - 2026-09-10: lab_charge=보철+CA 수동 청구. ca_reupload=CA만(이미 청구면 skip).
// - 2026-09-09: 동일 PTX 리메이크 청구(기공소 버튼·CA STL 재업로드).
// - 2026-09-09: remakeCharges 부위(index+prosthesis|CA) 중복 hold 금지.
// - 2026-09-09: (legacy) lab_charge=보철만 — 2026-09-10부터 CA 수동 청구 허용.

import PracticeTransfer from "../models/practiceTransfer.model.js";
import {
  buildPracticeTransferQuote,
  holdPracticeTransferRemakeChargeCredits,
  releasePracticeTransferRemakeChargeCredits,
  settleUnreleasedRemakeChargesForTransfer,
  cancelPracticeTransferRemakeChargeCredits,
} from "./practiceTransferBilling.service.js";
import {
  buildRemakeToothWorksFromSelectedParts,
  countCustomAbutmentWorks,
} from "../utils/labFeeSchedule.js";
import { practiceTransferNotDeletedMongoFilter } from "../utils/practiceTransferStage.js";

/** FDI 10→20→30→40 — 18→11→21→28→38→31→41→48 (toToothDecadeSortNumber와 동일) */
const REMAKE_ARCH_TOOTH_ORDER = [
  "18",
  "17",
  "16",
  "15",
  "14",
  "13",
  "12",
  "11",
  "21",
  "22",
  "23",
  "24",
  "25",
  "26",
  "27",
  "28",
  "38",
  "37",
  "36",
  "35",
  "34",
  "33",
  "32",
  "31",
  "41",
  "42",
  "43",
  "44",
  "45",
  "46",
  "47",
  "48",
];
const REMAKE_ARCH_TOOTH_INDEX = new Map(
  REMAKE_ARCH_TOOTH_ORDER.map((tooth, index) => [tooth, index]),
);

const remakeToothSortIndex = (tooth) =>
  REMAKE_ARCH_TOOTH_INDEX.get(String(tooth || "").trim()) ??
  Number.MAX_SAFE_INTEGER;

/** 전체가 한 연속 구간이면 17-15, 아니면 17,15 (부분 구간 혼용 금지) */
export function formatCompactToothNumbers(teeth) {
  const sorted = [
    ...new Set(
      (Array.isArray(teeth) ? teeth : [])
        .map((t) => String(t || "").trim())
        .filter((t) => /^[1-4][1-8]$/.test(t)),
    ),
  ].sort((a, b) => remakeToothSortIndex(a) - remakeToothSortIndex(b));
  if (sorted.length === 0) return "";

  const runs = [];
  for (const tooth of sorted) {
    const prevRun = runs[runs.length - 1];
    const prev = prevRun?.[prevRun.length - 1];
    const prevIdx = prev != null ? REMAKE_ARCH_TOOTH_INDEX.get(prev) : undefined;
    const curIdx = REMAKE_ARCH_TOOTH_INDEX.get(tooth);
    if (
      prevRun &&
      prevIdx != null &&
      curIdx != null &&
      curIdx === prevIdx + 1
    ) {
      prevRun.push(tooth);
      continue;
    }
    runs.push([tooth]);
  }

  // 파닉 포함 브리지처럼 한 스팬만 있을 때만 `-`. 어벗 등 띄엄띄엄이면 전부 `,`.
  if (runs.length === 1 && runs[0].length >= 2) {
    const run = runs[0];
    return `${run[0]}-${run[run.length - 1]}`;
  }
  return sorted.join(",");
}

/** 보철(치식 순) 먼저, 어벗 마지막 */
function formatRemakeSummaryFromGroups(teethByType) {
  const types = Array.from(teethByType.keys());
  const prosthesisTypes = types.filter((type) => type !== "어벗");
  const hasAbutment = types.includes("어벗");

  const minToothIndex = (typeLabel) => {
    const teeth = teethByType.get(typeLabel) || [];
    if (teeth.length === 0) return Number.MAX_SAFE_INTEGER;
    return Math.min(...teeth.map((tooth) => remakeToothSortIndex(tooth)));
  };

  prosthesisTypes.sort((a, b) => {
    const diff = minToothIndex(a) - minToothIndex(b);
    if (diff !== 0) return diff;
    return String(a).localeCompare(String(b), "ko");
  });

  const ordered = hasAbutment
    ? [...prosthesisTypes, "어벗"]
    : prosthesisTypes;

  return ordered
    .map((typeLabel) => {
      const teethLabel = formatCompactToothNumbers(
        teethByType.get(typeLabel) || [],
      );
      return teethLabel ? `${teethLabel} ${typeLabel}` : typeLabel;
    })
    .filter(Boolean)
    .join(", ");
}

/**
 * selectedParts → `17-15 브리지, 14 크라운, 17,15,14 어벗`
 * @param {unknown[]} toothWorks
 * @param {Array<{ index?: unknown, prosthesis?: unknown, customAbutment?: unknown, includeCustomAbutment?: unknown, ca?: unknown }>} selectedParts
 */
export function buildRemakePartsSummaryLabel(toothWorks, selectedParts) {
  const rows = Array.isArray(toothWorks) ? toothWorks : [];
  const parts = Array.isArray(selectedParts) ? selectedParts : [];
  const teethByType = new Map();

  const push = (typeLabel, tooth) => {
    const type = String(typeLabel || "").trim() || "보철";
    if (!teethByType.has(type)) teethByType.set(type, []);
    const n = String(tooth || "").trim();
    if (n) teethByType.get(type).push(n);
  };

  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const index = Math.trunc(Number(part.index));
    if (!Number.isFinite(index) || index < 0) continue;
    const row = rows[index] || {};
    const tooth = String(row?.toothNumber || row?.tooth || "").trim();
    if (part.prosthesis === true) {
      const type = String(row?.prosthesisType || "보철").trim() || "보철";
      push(type === "커스텀어벗" ? "어벗" : type, tooth);
    }
    const wantCa = Boolean(
      part.customAbutment === true ||
        part.includeCustomAbutment === true ||
        part.ca === true,
    );
    if (wantCa) push("어벗", tooth);
  }

  return formatRemakeSummaryFromGroups(teethByType);
}

export function getCaDesignUploadCountForTooth(transferDoc, tooth) {
  const key = String(tooth || "").trim();
  if (!key) return 0;
  const map = transferDoc?.production?.caDesignUploadCountByTooth;
  if (!map) return 0;
  if (typeof map.get === "function") {
    return Math.max(0, Math.round(Number(map.get(key) || 0)));
  }
  if (typeof map === "object") {
    return Math.max(0, Math.round(Number(map[key] || 0)));
  }
  return 0;
}

export function isCaDesignRemakeReupload(transferDoc, tooth) {
  return getCaDesignUploadCountForTooth(transferDoc, tooth) >= 1;
}

/** remakeCharges selectedParts → "index:prosthesis" | "index:ca" */
export function remakeChargePartKey(index, kind) {
  const i = Math.trunc(Number(index));
  const k = kind === "ca" ? "ca" : "prosthesis";
  if (!Number.isFinite(i) || i < 0) return "";
  return `${i}:${k}`;
}

/**
 * remakeCharges 이력에서 이미 청구된 부위 키 Set.
 * @param {Array<{ selectedParts?: unknown }>|null|undefined} remakeCharges
 * @returns {Set<string>}
 */
export function collectChargedRemakePartKeys(remakeCharges) {
  const out = new Set();
  const rows = Array.isArray(remakeCharges) ? remakeCharges : [];
  for (const row of rows) {
    const parts = Array.isArray(row?.selectedParts) ? row.selectedParts : [];
    for (const part of parts) {
      const index = Math.trunc(Number(part?.index));
      if (!Number.isFinite(index) || index < 0) continue;
      if (part?.prosthesis === true) {
        const key = remakeChargePartKey(index, "prosthesis");
        if (key) out.add(key);
      }
      const wantCa = Boolean(
        part?.customAbutment === true ||
          part?.includeCustomAbutment === true ||
          part?.ca === true,
      );
      if (wantCa) {
        const key = remakeChargePartKey(index, "ca");
        if (key) out.add(key);
      }
    }
  }
  return out;
}

/**
 * 요청 selectedParts에서 이미 청구된 보철/CA 플래그를 제거.
 * @returns {{ remainingParts: Array, removedKeys: string[], allSkipped: boolean }}
 */
export function filterUnchargedRemakeSelectedParts(
  selectedParts,
  remakeCharges,
) {
  const charged = collectChargedRemakePartKeys(remakeCharges);
  const parts = Array.isArray(selectedParts) ? selectedParts : [];
  const remainingParts = [];
  const removedKeys = [];

  for (const part of parts) {
    const index = Math.trunc(Number(part?.index));
    if (!Number.isFinite(index) || index < 0) continue;

    let prosthesis = Boolean(part?.prosthesis);
    let customAbutment = Boolean(
      part?.customAbutment === true ||
        part?.includeCustomAbutment === true ||
        part?.ca === true,
    );

    if (prosthesis) {
      const key = remakeChargePartKey(index, "prosthesis");
      if (charged.has(key)) {
        removedKeys.push(key);
        prosthesis = false;
      }
    }
    if (customAbutment) {
      const key = remakeChargePartKey(index, "ca");
      if (charged.has(key)) {
        removedKeys.push(key);
        customAbutment = false;
      }
    }
    if (!prosthesis && !customAbutment) continue;
    remainingParts.push({ index, prosthesis, customAbutment });
  }

  return {
    remainingParts,
    removedKeys,
    allSkipped: remainingParts.length === 0,
  };
}

/**
 * @deprecated 2026-09-10 — lab_charge에 CA 포함. 테스트·호환용으로 유지.
 * @returns {{ parts: Array, strippedCa: boolean }}
 */
export function stripCaFromLabChargeSelectedParts(selectedParts) {
  const parts = Array.isArray(selectedParts) ? selectedParts : [];
  let strippedCa = false;
  const out = [];
  for (const part of parts) {
    const index = Math.trunc(Number(part?.index));
    if (!Number.isFinite(index) || index < 0) continue;
    const prosthesis = Boolean(part?.prosthesis);
    const wantCa = Boolean(
      part?.customAbutment === true ||
        part?.includeCustomAbutment === true ||
        part?.ca === true,
    );
    if (wantCa) strippedCa = true;
    if (!prosthesis) continue;
    out.push({ index, prosthesis: true, customAbutment: false });
  }
  return { parts: out, strippedCa };
}

/**
 * 동일 PracticeTransfer에 리메이크 수가 hold + remakeCharges 기록.
 * lab_charge = 보철+CA 수동 청구 / ca_reupload = CA만(재업로드, 이미 청구면 skip).
 * @returns {{ ok: true, updated, chargeRecord, fees, skipped? } | { ok: false, statusCode, message, reason?, payload? }}
 */
export async function applyPracticeTransferRemakeCharge({
  transferDoc,
  remakeToothWorks,
  selectedParts = [],
  summaryLabel = "",
  source = "lab_charge",
  actorUserId = null,
  displayLabel = "리메이크 청구",
}) {
  const t0 = Date.now();
  const mark = (label) => {
    console.log(
      `[remakeCharge] ${label}=${Date.now() - t0}ms total=${Date.now() - t0}ms`,
    );
  };

  const doc = transferDoc;
  if (!doc?._id) {
    return {
      ok: false,
      statusCode: 404,
      message: "전송 내역을 찾을 수 없습니다.",
    };
  }

  const chargeSource = String(source || "lab_charge").trim() || "lab_charge";
  const isCaReupload = chargeSource === "ca_reupload";

  const sourceToothWorks = Array.isArray(doc.toothWorks) ? doc.toothWorks : [];
  const existingCharges = Array.isArray(doc.remakeCharges)
    ? doc.remakeCharges
    : [];

  let parts = Array.isArray(selectedParts) ? selectedParts : [];
  let works = Array.isArray(remakeToothWorks) ? remakeToothWorks : [];

  if (parts.length > 0) {
    // ca_reupload는 CA만 유지(보철 플래그 제거)
    if (isCaReupload) {
      parts = parts
        .map((part) => {
          const index = Math.trunc(Number(part?.index));
          if (!Number.isFinite(index) || index < 0) return null;
          const customAbutment = Boolean(
            part?.customAbutment === true ||
              part?.includeCustomAbutment === true ||
              part?.ca === true,
          );
          if (!customAbutment) return null;
          return { index, prosthesis: false, customAbutment: true };
        })
        .filter(Boolean);
    } else {
      parts = parts
        .map((part) => {
          const index = Math.trunc(Number(part?.index));
          if (!Number.isFinite(index) || index < 0) return null;
          const prosthesis = Boolean(part?.prosthesis);
          const customAbutment = Boolean(
            part?.customAbutment === true ||
              part?.includeCustomAbutment === true ||
              part?.ca === true,
          );
          if (!prosthesis && !customAbutment) return null;
          return { index, prosthesis, customAbutment };
        })
        .filter(Boolean);
    }

    if (parts.length === 0) {
      return {
        ok: false,
        statusCode: 400,
        message: "리메이크 청구할 보철·커스텀어벗을 선택해 주세요.",
        reason: "no_parts_selected",
      };
    }

    const filtered = filterUnchargedRemakeSelectedParts(parts, existingCharges);
    if (filtered.allSkipped) {
      return {
        ok: true,
        skipped: true,
        reason: "already_charged",
        updated: doc,
        chargeRecord: null,
        fees: null,
        removedKeys: filtered.removedKeys,
      };
    }
    parts = filtered.remainingParts;
    const rebuilt = buildRemakeToothWorksFromSelectedParts(
      sourceToothWorks,
      parts,
    );
    works = Array.isArray(rebuilt) ? rebuilt : [];
  }

  if (works.length === 0) {
    return {
      ok: false,
      statusCode: 400,
      message: "리메이크 청구할 보철·커스텀어벗을 선택해 주세요.",
    };
  }

  const practiceAnchorId = doc.practiceBusinessAnchorId || null;
  const labAnchorId = doc.targetLabAnchorId || null;
  if (!practiceAnchorId || !labAnchorId) {
    return {
      ok: false,
      statusCode: 400,
      message: "치과·기공소 정보가 없는 의뢰입니다.",
    };
  }

  // 청구 금액만 필요 — partner/budget/catalog 조회 생략. hold가 잔액 SSOT.
  const quote = await buildPracticeTransferQuote({
    practiceAnchorId,
    labAnchorId,
    toothWorks: works,
    remake: true,
    relationshipKind: "none",
    labTradingPartnerId: null,
    autoMatchBudget: null,
    catalog: null,
  });
  mark("quote");
  const fees = quote?.fees || {};
  const deltaLabFee = Math.max(0, Math.round(Number(fees.labFeeTotal || 0)));
  const deltaTotal = Math.max(
    0,
    Math.round(Number(fees.total != null ? fees.total : fees.labFeeTotal || 0)),
  );

  if (deltaLabFee <= 0) {
    return {
      ok: false,
      statusCode: 409,
      message:
        "리메이크 수가가 0원입니다. 설정 → 기공비에서 리메이크 단가를 확인해 주세요.",
      reason: "remake_fee_zero",
      missingFeeNames: quote?.missingFeeNames || [],
    };
  }

  const chargeIndex = existingCharges.length;

  let holdResult;
  try {
    // assert(사전 GL) 생략 — hold 트랜잭션이 잔액·보류 SSOT (Mutation UX).
    holdResult = await holdPracticeTransferRemakeChargeCredits({
      transfer: doc,
      chargeIndex,
      deltaFees: { labFeeTotal: deltaLabFee, total: deltaTotal },
      actorUserId,
      displayLabel,
    });
  } catch (creditErr) {
    mark("hold_fail");
    return {
      ok: false,
      statusCode: Number(creditErr?.statusCode || 402),
      message:
        creditErr?.message || "리메이크 청구 전 유료크레딧 확인에 실패했습니다.",
      payload: creditErr?.payload || {},
    };
  }
  mark("hold");
  if (
    !holdResult.held &&
    holdResult.reason !== "already_held" &&
    holdResult.reason !== "zero_fee"
  ) {
    return {
      ok: false,
      statusCode: 402,
      message: "크레딧 보류에 실패했습니다.",
      reason: holdResult.reason || "hold_failed",
    };
  }

  // 작업시작 후 청구 — hold만 두면 이미 labSettledAt 건은 정산 미러에서 빠짐 → 즉시 기공소 적립.
  let releaseResult = null;
  try {
    releaseResult = await releasePracticeTransferRemakeChargeCredits({
      transfer: doc,
      chargeIndex,
      deltaFees: { labFeeTotal: deltaLabFee, total: deltaTotal },
      holdMeta: holdResult,
      actorUserId,
      displayLabel,
    });
  } catch (releaseErr) {
    mark("release_fail");
    console.error("[remakeCharge] release failed", releaseErr?.message || releaseErr);
    return {
      ok: false,
      statusCode: Number(releaseErr?.statusCode || 500),
      message:
        releaseErr?.message ||
        "리메이크 청구 보류 후 기공소 정산에 실패했습니다.",
      payload: releaseErr?.payload || {},
    };
  }
  mark("release");

  const toothNumbers = Array.from(
    new Set(
      works.flatMap((row) => {
        const linked = Array.isArray(row?.bridgeLinkedTeeth)
          ? row.bridgeLinkedTeeth
          : [row?.toothNumber || row?.tooth];
        return linked.map((t) => String(t || "").trim()).filter(Boolean);
      }),
    ),
  );

  const chargeRecord = {
    chargedAt: new Date(),
    chargedBy: actorUserId || null,
    source: chargeSource,
    toothNumbers,
    summaryLabel:
      buildRemakePartsSummaryLabel(sourceToothWorks, parts) ||
      String(summaryLabel || "").trim(),
    selectedParts: parts,
    billingDelta: {
      labFeeTotal: deltaLabFee,
      total: deltaTotal,
    },
    chargeIndex,
  };

  const prevBilling =
    doc.billing && typeof doc.billing === "object" ? doc.billing : {};
  const releasedLabNet = Math.max(
    0,
    Math.round(Number(releaseResult?.labSettlementAmount || 0)),
  );
  const nextBilling = {
    ...prevBilling,
    labFeeTotal:
      Math.max(0, Math.round(Number(prevBilling.labFeeTotal || 0))) +
      deltaLabFee,
    total:
      Math.max(0, Math.round(Number(prevBilling.total || 0))) + deltaTotal,
    heldTotal:
      Math.max(0, Math.round(Number(prevBilling.heldTotal || 0))) +
      Math.max(0, Math.round(Number(holdResult.heldTotal || deltaTotal))),
    heldLabTotal:
      Math.max(0, Math.round(Number(prevBilling.heldLabTotal || 0))) +
      Math.max(0, Math.round(Number(holdResult.heldLabTotal || deltaLabFee))),
    holdFromPaid:
      Math.max(0, Math.round(Number(prevBilling.holdFromPaid || 0))) +
      Math.max(0, Math.round(Number(holdResult.fromPaid || 0))),
    holdFromFreeRequest:
      Math.max(0, Math.round(Number(prevBilling.holdFromFreeRequest || 0))) +
      Math.max(0, Math.round(Number(holdResult.fromFreeRequest || 0))),
    holdFromFreeShipping:
      Math.max(0, Math.round(Number(prevBilling.holdFromFreeShipping || 0))) +
      Math.max(0, Math.round(Number(holdResult.fromFreeShipping || 0))),
    labSettlementAmount:
      Math.max(0, Math.round(Number(prevBilling.labSettlementAmount || 0))) +
      releasedLabNet,
  };

  const updated = await PracticeTransfer.findOneAndUpdate(
    { _id: doc._id, ...practiceTransferNotDeletedMongoFilter() },
    {
      $set: { billing: nextBilling },
      $push: { remakeCharges: chargeRecord },
    },
    {
      new: true,
      projection: {
        _id: 1,
        transferId: 1,
        billing: 1,
        remakeCharges: 1,
        practiceBusinessAnchorId: 1,
        practiceUserId: 1,
        targetLabAnchorId: 1,
      },
    },
  );
  mark("save");
  if (!updated) {
    return {
      ok: false,
      statusCode: 409,
      message: "리메이크 청구를 반영하지 못했습니다.",
    };
  }

  return {
    ok: true,
    updated,
    chargeRecord,
    fees,
    holdResult,
    releaseResult,
    caCount: countCustomAbutmentWorks(works),
    selectedParts: parts,
  };
}

export { settleUnreleasedRemakeChargesForTransfer };

/**
 * 기공소 리메이크 청구 취소 — GL 삭제 + remakeCharges 제거 + billing 되돌림.
 */
export async function cancelPracticeTransferRemakeCharge({
  transferDoc,
  chargeIndex,
  actorUserId = null,
}) {
  const doc = transferDoc;
  if (!doc?._id) {
    return {
      ok: false,
      statusCode: 404,
      message: "전송 내역을 찾을 수 없습니다.",
    };
  }

  const idx = Math.trunc(Number(chargeIndex));
  if (!Number.isFinite(idx) || idx < 0) {
    return {
      ok: false,
      statusCode: 400,
      message: "청구 인덱스가 필요합니다.",
      reason: "invalid_charge_index",
    };
  }

  const charges = Array.isArray(doc.remakeCharges) ? [...doc.remakeCharges] : [];
  const foundAt = charges.findIndex((row) => {
    const rowIdx = Number.isFinite(Math.trunc(Number(row?.chargeIndex)))
      ? Math.trunc(Number(row.chargeIndex))
      : -1;
    return rowIdx === idx;
  });
  if (foundAt < 0) {
    return {
      ok: false,
      statusCode: 404,
      message: "해당 리메이크 청구를 찾을 수 없습니다.",
      reason: "charge_not_found",
    };
  }

  const charge = charges[foundAt];
  const deltaLab = Math.max(
    0,
    Math.round(
      Number(charge?.billingDelta?.labFeeTotal ?? charge?.billingDelta?.total ?? 0),
    ),
  );
  const deltaTotal = Math.max(
    0,
    Math.round(Number(charge?.billingDelta?.total ?? deltaLab)),
  );

  const cancelGl = await cancelPracticeTransferRemakeChargeCredits({
    transfer: doc,
    chargeIndex: idx,
  });
  if (!cancelGl.canceled && cancelGl.reason !== "no_journals") {
    return {
      ok: false,
      statusCode: 409,
      message: "리메이크 청구 원장 취소에 실패했습니다.",
      reason: cancelGl.reason || "cancel_gl_failed",
    };
  }

  const nextCharges = charges.filter((_, i) => i !== foundAt);
  const prevBilling =
    doc.billing && typeof doc.billing === "object" ? doc.billing : {};
  const releasedNetGuess = deltaLab; // 수수료 0 가정 복원; 실수수료는 GL 삭제로 잔액 SSOT
  const nextBilling = {
    ...prevBilling,
    labFeeTotal: Math.max(
      0,
      Math.round(Number(prevBilling.labFeeTotal || 0)) - deltaLab,
    ),
    total: Math.max(
      0,
      Math.round(Number(prevBilling.total || 0)) - deltaTotal,
    ),
    heldTotal: Math.max(
      0,
      Math.round(Number(prevBilling.heldTotal || 0)) - deltaTotal,
    ),
    heldLabTotal: Math.max(
      0,
      Math.round(Number(prevBilling.heldLabTotal || 0)) - deltaLab,
    ),
    labSettlementAmount: Math.max(
      0,
      Math.round(Number(prevBilling.labSettlementAmount || 0)) - releasedNetGuess,
    ),
  };

  const updated = await PracticeTransfer.findOneAndUpdate(
    { _id: doc._id, ...practiceTransferNotDeletedMongoFilter() },
    {
      $set: {
        remakeCharges: nextCharges,
        billing: nextBilling,
      },
    },
    {
      new: true,
      projection: {
        _id: 1,
        transferId: 1,
        billing: 1,
        remakeCharges: 1,
        practiceBusinessAnchorId: 1,
        practiceUserId: 1,
        targetLabAnchorId: 1,
      },
    },
  );
  if (!updated) {
    return {
      ok: false,
      statusCode: 409,
      message: "리메이크 청구 취소를 반영하지 못했습니다.",
    };
  }

  return {
    ok: true,
    updated,
    canceledCharge: charge,
    chargeIndex: idx,
    billingDelta: { labFeeTotal: -deltaLab, total: -deltaTotal },
    actorUserId,
  };
}

export async function applyCaReuploadRemakeCharge({
  transferDoc,
  tooth,
  actorUserId = null,
}) {
  const toothKey = String(tooth || "").trim();
  if (!toothKey || !transferDoc) {
    return { ok: false, statusCode: 400, message: "치아번호가 필요합니다." };
  }

  const rows = Array.isArray(transferDoc.toothWorks)
    ? transferDoc.toothWorks
    : [];
  const index = rows.findIndex((row) => {
    const n = String(row?.toothNumber || row?.tooth || "").trim();
    if (n === toothKey) return true;
    const linked = Array.isArray(row?.bridgeLinkedTeeth)
      ? row.bridgeLinkedTeeth
      : [];
    return linked.some((t) => String(t || "").trim() === toothKey);
  });
  if (index < 0) {
    return {
      ok: false,
      statusCode: 404,
      message: `치아 #${toothKey} 치식을 찾지 못했습니다.`,
    };
  }

  const charged = collectChargedRemakePartKeys(transferDoc.remakeCharges);
  const caKey = remakeChargePartKey(index, "ca");
  if (caKey && charged.has(caKey)) {
    return {
      ok: true,
      skipped: true,
      reason: "already_charged",
      updated: transferDoc,
      chargeRecord: null,
      fees: null,
    };
  }

  const remakeToothWorks = buildRemakeToothWorksFromSelectedParts(rows, [
    { index, prosthesis: false, customAbutment: true },
  ]);
  if (!remakeToothWorks?.length) {
    return {
      ok: false,
      statusCode: 409,
      message: "커스텀어벗 리메이크 대상으로 변환하지 못했습니다.",
    };
  }

  return applyPracticeTransferRemakeCharge({
    transferDoc,
    remakeToothWorks,
    selectedParts: [{ index, prosthesis: false, customAbutment: true }],
    summaryLabel: toothKey ? `${toothKey} 어벗` : "어벗",
    source: "ca_reupload",
    actorUserId,
    displayLabel: "커스텀어벗 리메이크",
  });
}

export async function bumpCaDesignUploadCount({ transferId, tooth }) {
  const id = String(transferId || "").trim();
  const toothKey = String(tooth || "").trim();
  if (!id || !toothKey) return null;
  const path = `production.caDesignUploadCountByTooth.${toothKey}`;
  return PracticeTransfer.findOneAndUpdate(
    { _id: id, ...practiceTransferNotDeletedMongoFilter() },
    { $inc: { [path]: 1 } },
    { new: true },
  );
}

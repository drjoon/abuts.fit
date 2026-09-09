// related files:
// - web/backend/services/practiceTransferBilling.service.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/backend/controllers/requests/designHandoff.controller.js
// - web/backend/utils/labFeeSchedule.js
// - 2026-09-09: 동일 PTX 리메이크 청구(기공소 버튼·CA STL 재업로드).
// - 2026-09-09: remakeCharges 부위(index+prosthesis|CA) 중복 hold 금지.
// - 2026-09-09: lab_charge=보철만 / ca_reupload=CA만(재업로드·제조 재주문 SSOT).

import PracticeTransfer from "../models/practiceTransfer.model.js";
import {
  assertPracticeTransferPaidCreditSufficient,
  buildPracticeTransferQuote,
  holdPracticeTransferRemakeChargeCredits,
} from "./practiceTransferBilling.service.js";
import {
  buildRemakeToothWorksFromSelectedParts,
  countCustomAbutmentWorks,
  stripCustomAbutmentFromToothWorks,
} from "../utils/labFeeSchedule.js";
import { practiceTransferNotDeletedMongoFilter } from "../utils/practiceTransferStage.js";

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
 * 기공소 수동 청구(lab_charge)는 보철만 — CA는 STL 재업로드(ca_reupload) SSOT.
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
 * lab_charge = 보철만 / ca_reupload = CA만(재업로드 SSOT).
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
  const doc = transferDoc;
  if (!doc?._id) {
    return {
      ok: false,
      statusCode: 404,
      message: "전송 내역을 찾을 수 없습니다.",
    };
  }

  const chargeSource = String(source || "lab_charge").trim() || "lab_charge";
  const isLabManualCharge = chargeSource === "lab_charge";

  const sourceToothWorks = Array.isArray(doc.toothWorks) ? doc.toothWorks : [];
  const existingCharges = Array.isArray(doc.remakeCharges)
    ? doc.remakeCharges
    : [];

  let parts = Array.isArray(selectedParts) ? selectedParts : [];
  let works = Array.isArray(remakeToothWorks) ? remakeToothWorks : [];

  if (isLabManualCharge && parts.length > 0) {
    const stripped = stripCaFromLabChargeSelectedParts(parts);
    parts = stripped.parts;
    if (parts.length === 0) {
      return {
        ok: false,
        statusCode: 400,
        message: stripped.strippedCa
          ? "커스텀어벗 리메이크비는 CA 디자인 재업로드 시 자동 청구됩니다. 보철 리메이크만 선택해 주세요."
          : "리메이크 청구할 보철을 선택해 주세요.",
        reason: stripped.strippedCa
          ? "ca_charge_via_reupload_only"
          : "no_prosthesis_selected",
      };
    }
  }

  if (parts.length > 0) {
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
    if (isLabManualCharge) {
      parts = parts.map((p) => ({
        index: p.index,
        prosthesis: true,
        customAbutment: false,
      }));
    }
    const rebuilt = buildRemakeToothWorksFromSelectedParts(
      sourceToothWorks,
      parts,
    );
    works = Array.isArray(rebuilt) ? rebuilt : [];
  } else if (works.length > 0) {
    if (isLabManualCharge) {
      // selectedParts 없이 toothWorks만 온 경우에도 CA 제외
      works = stripCustomAbutmentFromToothWorks(works) || [];
    }
  }

  if (works.length === 0) {
    return {
      ok: false,
      statusCode: 400,
      message: isLabManualCharge
        ? "리메이크 청구할 보철을 선택해 주세요."
        : "리메이크 청구할 보철·커스텀어벗을 선택해 주세요.",
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

  const quote = await buildPracticeTransferQuote({
    practiceAnchorId,
    labAnchorId,
    toothWorks: works,
    remake: true,
  });
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

  try {
    await assertPracticeTransferPaidCreditSufficient({
      practiceAnchorId,
      labAnchorId,
      toothWorks: works,
      remake: true,
      fees,
    });
  } catch (creditErr) {
    return {
      ok: false,
      statusCode: Number(creditErr?.statusCode || 402),
      message:
        creditErr?.message || "리메이크 청구 전 유료크레딧 확인에 실패했습니다.",
      payload: creditErr?.payload || {},
    };
  }

  const chargeIndex = existingCharges.length;

  const holdResult = await holdPracticeTransferRemakeChargeCredits({
    transfer: doc,
    chargeIndex,
    deltaFees: { labFeeTotal: deltaLabFee, total: deltaTotal },
    actorUserId,
    displayLabel,
  });
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
    summaryLabel: String(summaryLabel || "").trim(),
    selectedParts: parts,
    billingDelta: {
      labFeeTotal: deltaLabFee,
      total: deltaTotal,
    },
    chargeIndex,
  };

  const prevBilling =
    doc.billing && typeof doc.billing === "object" ? doc.billing : {};
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
  };

  const updated = await PracticeTransfer.findOneAndUpdate(
    { _id: doc._id, ...practiceTransferNotDeletedMongoFilter() },
    {
      $set: { billing: nextBilling },
      $push: { remakeCharges: chargeRecord },
    },
    { new: true },
  );
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
    caCount: countCustomAbutmentWorks(works),
    selectedParts: parts,
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
    summaryLabel: `#${toothKey} · 커스텀어벗`,
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

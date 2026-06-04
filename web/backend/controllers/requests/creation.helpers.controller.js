import CreditLedger from "../../models/creditLedger.model.js";

// [정책] uploadToRhinoServer / uploadS3ToRhinoServer 제거
// 백엔드가 rhino-server에 직접 STL을 전송하던 방식 삭제.
// rhino-server가 /api/rhino/process-file 호출 시 /bg/original-file → S3에서 직접 다운로드함.

/**
 * STL 파일명을 표준 형식으로 생성하는 헬퍼
 * 형식: {requestId}-{clinicName}-{patientName}-{tooth}{ext}
 */
export function buildStandardStlFileName({
  requestId,
  clinicName,
  patientName,
  tooth,
  originalFileName,
}) {
  const ext = originalFileName?.includes(".")
    ? `.${originalFileName.split(".").pop().toLowerCase()}`
    : ".stl";
  return `${requestId}-${clinicName}-${patientName}-${tooth}${ext}`;
}

export async function getBusinessCreditBalanceBreakdown({
  businessAnchorId,
  session,
}) {
  const rows = await CreditLedger.find({ businessAnchorId })
    .sort({ createdAt: 1, _id: 1 })
    .select({ type: 1, amount: 1, refType: 1, hasFreeRequest: 1 })
    .session(session || null)
    .lean();

  let paid = 0;
  let bonusRequest = 0;
  let bonusShipping = 0;

  for (const r of rows) {
    const type = String(r?.type || "");
    const amount = Number(r?.amount || 0);
    const refType = String(r?.refType || "");
    if (!Number.isFinite(amount)) continue;

    if (type === "CHARGE") {
      paid += amount;
      continue;
    }
    if (type === "BONUS") {
      if (refType === "FREE_SHIPPING_CREDIT") {
        bonusShipping += amount;
      } else {
        bonusRequest += amount;
      }
      continue;
    }
    if (type === "REFUND") {
      paid += amount;
      continue;
    }
    if (type === "ADJUST") {
      paid += amount;
      continue;
    }
    if (type === "SPEND") {
      let spend = Math.abs(amount);
      if (refType === "SHIPPING_PACKAGE" || refType === "SHIPPING_FEE") {
        const canUseFreeShipping = r?.hasFreeRequest !== false;
        if (canUseFreeShipping) {
          const fromBonusShipping = Math.min(bonusShipping, spend);
          bonusShipping -= fromBonusShipping;
          spend -= fromBonusShipping;
        }
      } else {
        const fromBonusRequest = Math.min(bonusRequest, spend);
        bonusRequest -= fromBonusRequest;
        spend -= fromBonusRequest;
      }
      paid -= spend;
    }
  }

  const paidCredit = Math.max(0, Math.round(paid));
  const bonusRequestCredit = Math.max(0, Math.round(bonusRequest));
  const bonusShippingCredit = Math.max(0, Math.round(bonusShipping));
  return {
    balance: paidCredit + bonusRequestCredit + bonusShippingCredit,
    paidCredit,
    bonusRequestCredit,
    bonusShippingCredit,
  };
}

export const isDuplicateKeyError = (err) => {
  const code = err?.code;
  const name = String(err?.name || "");
  const msg = String(err?.message || "");
  return (
    code === 11000 || name === "MongoServerError" || msg.includes("E11000")
  );
};

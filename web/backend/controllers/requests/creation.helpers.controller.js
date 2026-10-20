// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/modules/requests/request.routes.js
// - web/backend/controllers/requests/common.review.controller.js
// - web/backend/controllers/requests/common.requests.controller.js
import { getBusinessCreditBalanceSnapshot } from "../../services/creditBalance.service.js";
import { resolveExpressHoldAmount } from "../../services/requestCreditHold.service.js";
import { resolveMachiningSpendAmount } from "./designPrice.utils.js";
import { isSignupFreeTestPriceRule } from "./signupFreeTest.utils.js";

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
  skipDemoSettlement = false,
}) {
  const snapshot = await getBusinessCreditBalanceSnapshot({
    businessAnchorId,
    session,
    upsertIfMissing: true,
    skipDemoSettlement,
  });

  return {
    balance: Number(snapshot?.balance || 0),
    spendableBalance: Number(
      snapshot?.spendableBalance ??
        Number(snapshot?.balance || 0) + Number(snapshot?.settlementCredit || 0),
    ),
    paidCredit: Number(snapshot?.paidCredit || 0),
    freeRequestCredit: Number(snapshot?.freeRequestCredit || 0),
    freeShippingCredit: Number(snapshot?.freeShippingCredit || 0),
    settlementCredit: Number(snapshot?.settlementCredit || 0),
  };
}

function resolvePerCaseMachiningFeeForCreditGate(item, designFeePerTooth) {
  if (isSignupFreeTestPriceRule(item?.computedPrice?.rule)) {
    return 0;
  }
  const ci = item?.caseInfosWithFile || item?.caseInfos || {};
  const machining = resolveMachiningSpendAmount({
    price: item?.computedPrice,
    caseInfos: ci,
    designFeePerTooth,
  });
  const express = resolveExpressHoldAmount({
    shippingMode: item?.shippingMode || "normal",
    price: item?.computedPrice,
    caseInfos: ci,
  });
  return (
    Math.max(0, Math.round(Number(machining) || 0)) +
    Math.max(0, Math.round(Number(express) || 0))
  );
}

/**
 * 의뢰비→배송비 순 배정(402 선검사)과 동일하게, 잔액으로 몇 건까지 제출 가능한지 계산.
 */
export function countAffordableRequestSubmissions({
  cases,
  totalAvailable,
  totalShippingFee,
  designFeePerTooth = 5000,
}) {
  const list = Array.isArray(cases) ? cases : [];
  const available = Math.max(0, Math.round(Number(totalAvailable) || 0));
  const shippingFee = Math.max(0, Math.round(Number(totalShippingFee) || 0));
  if (!list.length || available <= 0) return 0;

  let budget = available;
  if (shippingFee > 0) {
    if (budget < shippingFee) return 0;
    budget -= shippingFee;
  }

  let count = 0;
  for (const item of list) {
    const fee = resolvePerCaseMachiningFeeForCreditGate(item, designFeePerTooth);
    if (fee <= 0) {
      count += 1;
      continue;
    }
    if (budget >= fee) {
      budget -= fee;
      count += 1;
    } else {
      break;
    }
  }
  return count;
}

/** 402 — 잔액 대비 제출 건수 초과 시 사용자 안내 문구 */
export function buildInsufficientCreditSubmissionAdvice({
  requestCount,
  affordableRequestCount,
  totalAvailable,
}) {
  const submitted = Math.max(0, Math.round(Number(requestCount) || 0));
  const affordable = Math.max(
    0,
    Math.round(Number(affordableRequestCount) || 0),
  );
  const available = Math.max(0, Math.round(Number(totalAvailable) || 0));
  if (submitted <= 0 || affordable >= submitted) return null;

  const availableLabel = available.toLocaleString("ko-KR");
  if (affordable <= 0) {
    return `현재 잔액 ${availableLabel}원으로는 이번 제출(${submitted}건)을 진행할 수 없습니다. 제출 건수를 줄이거나 크레딧을 충전해주세요.`;
  }
  return `현재 잔액 ${availableLabel}원으로는 ${affordable}건까지 의뢰할 수 있습니다. ${submitted}건을 제출하셨으니, 제출 건수를 ${affordable}건 이하로 줄인 뒤 다시 시도해주세요.`;
}

export const isDuplicateKeyError = (err) => {
  const code = err?.code;
  const name = String(err?.name || "");
  const msg = String(err?.message || "");
  return (
    code === 11000 || name === "MongoServerError" || msg.includes("E11000")
  );
};

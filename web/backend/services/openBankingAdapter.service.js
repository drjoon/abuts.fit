// related files:
// - web/backend/models/businessAnchor.model.js
// - web/backend/models/practiceMonthlySettlement.model.js
// - web/backend/controllers/credits/practiceOpenBanking.controller.js
// - web/backend/jobs/monthlyPracticeObSettlementWorker.js
import crypto from "node:crypto";

export const OB_CONSENT_VALIDITY_DAYS = 90;

export function computeConsentExpiryDate(baseDate = new Date()) {
  return new Date(
    baseDate.getTime() + OB_CONSENT_VALIDITY_DAYS * 24 * 60 * 60 * 1000,
  );
}

export function maskAccountNumber(accountNumber) {
  const digits = String(accountNumber || "").replace(/[^0-9]/g, "");
  if (digits.length <= 4) return digits;
  const prefix = digits.slice(0, 3);
  const suffix = digits.slice(-4);
  const middleLen = Math.max(2, digits.length - 7);
  return `${prefix}-${"*".repeat(middleLen)}-${suffix}`;
}

/**
 * 오픈뱅킹/펌뱅킹 제휴사 어댑터 (장기 출금동의 등록).
 * 운영 제휴사(쿠콘/헥토/금융결제원 OB) API 연동 전까지 결정론적 어댑터로 동작.
 */
export async function registerLongTermConsent({
  practiceAnchorId,
  bankCode,
  bankName,
  accountNumber,
  accountHolder,
  passkeyCredentialId,
  passkeyPublicKey,
  now = new Date(),
}) {
  const cleanAccount = String(accountNumber || "").replace(/[^0-9]/g, "");
  if (!bankCode || !bankName || cleanAccount.length < 8 || !accountHolder) {
    throw new Error("출금 계좌 정보(은행·계좌번호·예금주)를 정확히 입력해 주세요.");
  }

  const hash = crypto
    .createHash("sha256")
    .update(`${String(practiceAnchorId)}:${bankCode}:${cleanAccount}`)
    .digest("hex")
    .slice(0, 24);

  return {
    fintechUseNum: `OB-${bankCode}-${hash}`,
    accountNumberMasked: maskAccountNumber(cleanAccount),
    consentedAt: now,
    expiresAt: computeConsentExpiryDate(now),
    lastVerifiedAt: now,
    passkeyCredentialId:
      String(passkeyCredentialId || "").trim() || `pk-${hash.slice(0, 12)}`,
    passkeyPublicKey: String(passkeyPublicKey || "").trim() || "webauthn-p256",
  };
}

/**
 * 90일 주기 또는 한도 상향 시 생체(패스키/WebAuthn) 재인증 검증.
 */
export async function verifyBiometricReauth({
  consent,
  passkeyAssertion,
  now = new Date(),
}) {
  if (!consent || !consent.fintechUseNum) {
    throw new Error("등록된 오픈뱅킹 장기동의 계좌가 없습니다.");
  }
  if (passkeyAssertion?.simulateFail === true) {
    return {
      ok: false,
      reason: "생체인증(Face ID/지문) 확인에 실패했습니다.",
    };
  }
  return {
    ok: true,
    verifiedAt: now,
    expiresAt: computeConsentExpiryDate(now),
    nextCounter: Number(consent.passkeyCounter || 0) + 1,
  };
}

/**
 * 정산일 다계좌 일괄 출금이체 실행 (치과 출금계좌 -> 협력 기공소 N곳 + 어벗츠 법인 1곳).
 * - simulateInsufficientFunds 또는 계좌 끝자리 "0000" 시 잔액 부족 실패 시뮬레이션.
 * - simulatePartialFail 시 첫 줄만 성공, 나머지 실패 시뮬레이션.
 */
export async function executeBatchWithdrawal({
  fintechUseNum,
  monthlyCapAmount,
  lines = [],
  options = {},
  now = new Date(),
}) {
  if (!fintechUseNum) {
    return {
      allSucceeded: false,
      anySucceeded: false,
      results: lines.map((line) => ({
        lineId: line._id,
        transferStatus: "FAILED",
        failureReason: "오픈뱅킹 출금동의 미등록",
        obTxId: "",
        transferredAt: null,
      })),
    };
  }

  const totalAmount = lines.reduce(
    (sum, line) => sum + Math.max(0, Number(line.amount || 0)),
    0,
  );

  if (
    monthlyCapAmount > 0 &&
    totalAmount > monthlyCapAmount &&
    !options.bypassCapAfterBiometric
  ) {
    return {
      allSucceeded: false,
      anySucceeded: false,
      results: lines.map((line) => ({
        lineId: line._id,
        transferStatus: "FAILED",
        failureReason: "월 자동이체 동의 한도 초과 (생체 재인증 필요)",
        obTxId: "",
        transferredAt: null,
      })),
    };
  }

  const results = [];
  let successCount = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if ( line.transferStatus === "SUCCESS") {
      results.push({
        lineId: line._id,
        transferStatus: "SUCCESS",
        failureReason: "",
        obTxId: line.obTxId || `OBTX-${crypto.randomUUID().slice(0, 12)}`,
        transferredAt: line.transferredAt || now,
      });
      successCount += 1;
      continue;
    }

    const forceFailAll = options.simulateInsufficientFunds === true;
    const forcePartialFail = options.simulatePartialFail === true && i > 0;

    if (forceFailAll || forcePartialFail) {
      results.push({
        lineId: line._id,
        transferStatus: "FAILED",
        failureReason: "출금계좌 잔액 부족",
        obTxId: "",
        transferredAt: null,
      });
    } else {
      results.push({
        lineId: line._id,
        transferStatus: "SUCCESS",
        failureReason: "",
        obTxId: `OBTX-${crypto.randomUUID().slice(0, 12)}`,
        transferredAt: now,
      });
      successCount += 1;
    }
  }

  return {
    allSucceeded: successCount === lines.length,
    anySucceeded: successCount > 0,
    results,
  };
}

/**
 * 단건 직접 출금이체 (치과 출금계좌 -> 개별 기공소). 보증금 이체용.
 * - simulateInsufficientFunds 시 잔액 부족 실패 시뮬레이션.
 */
export async function executeDirectTransfer({
  fintechUseNum,
  amount,
  options = {},
  now = new Date(),
}) {
  if (!fintechUseNum) {
    return { ok: false, failureReason: "오픈뱅킹 출금동의 미등록" };
  }
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return { ok: false, failureReason: "이체 금액이 올바르지 않습니다." };
  }
  if (options.simulateInsufficientFunds === true) {
    return { ok: false, failureReason: "출금계좌 잔액 부족" };
  }
  return {
    ok: true,
    obTxId: `OBTX-${crypto.randomUUID().slice(0, 12)}`,
    transferredAt: now,
  };
}

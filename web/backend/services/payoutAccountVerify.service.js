// related files:
// - web/backend/utils/popbill.util.js
// - web/backend/utils/bankCodes.js
// - web/backend/controllers/businesses/business.update.controller.js
// change-log:
// - 2026-09-16: 팝빌 예금주 성명/실명조회로 정산 계좌 검증.
import {
  accountHoldersMatch,
  resolvePopbillBank,
} from "../utils/bankCodes.js";
import {
  checkPopbillAccountInfo,
  checkPopbillDepositorInfo,
  isPopbillAccountCheckConfigured,
} from "../utils/popbill.util.js";

const SUCCESS_RESULT = 100;

function toResultCode(raw) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {{
 *   bankName?: string,
 *   bankCode?: string,
 *   accountNumber?: string,
 *   holderName?: string,
 *   businessNumber?: string,
 * }} input
 */
export async function verifyPayoutAccount(input = {}) {
  if (!isPopbillAccountCheckConfigured()) {
    return {
      verified: false,
      skipped: true,
      method: null,
      message:
        "팝빌 예금주조회가 설정되지 않아 계좌 확인을 건너뛰었습니다. 입력값을 수동으로 확인해주세요.",
      accountName: "",
      bankCode: "",
      bankName: "",
      result: null,
      resultMessage: "",
    };
  }

  const accountNumber = String(input.accountNumber || "").replace(/\D/g, "");
  const holderName = String(input.holderName || "").trim();
  const businessNumber = String(input.businessNumber || "").replace(/\D/g, "");
  const resolved =
    resolvePopbillBank(input.bankCode || "") ||
    resolvePopbillBank(input.bankName || "");

  if (!resolved?.code) {
    return {
      verified: false,
      skipped: false,
      method: null,
      message: "은행명을 확인할 수 없습니다. 은행을 다시 선택·입력해주세요.",
      accountName: "",
      bankCode: "",
      bankName: String(input.bankName || "").trim(),
      result: null,
      resultMessage: "",
    };
  }

  if (accountNumber.length < 7 || accountNumber.length > 14) {
    return {
      verified: false,
      skipped: false,
      method: null,
      message: "계좌번호는 숫자 7~14자리여야 합니다.",
      accountName: "",
      bankCode: resolved.code,
      bankName: resolved.name,
      result: null,
      resultMessage: "",
    };
  }

  // 사업자번호가 있으면 실명조회(계좌+사업자번호 일치) 우선.
  if (businessNumber.length === 10) {
    try {
      const res = await checkPopbillDepositorInfo({
        bankCode: resolved.code,
        accountNumber,
        identityNumType: "B",
        identityNum: businessNumber,
      });
      const result = toResultCode(res?.result);
      const accountName = String(res?.accountName || "").trim();
      const verified = result === SUCCESS_RESULT;
      return {
        verified,
        skipped: false,
        method: "depositor",
        message: verified
          ? `계좌 확인 완료 · 예금주 ${accountName || holderName || "(확인됨)"}`
          : String(res?.resultMessage || "사업자번호와 계좌가 일치하지 않습니다."),
        accountName,
        bankCode: resolved.code,
        bankName: resolved.name,
        result,
        resultMessage: String(res?.resultMessage || ""),
      };
    } catch (err) {
      console.warn(
        "[payoutAccountVerify] checkDepositorInfo failed, fallback to accountInfo",
        err?.code || err?.message || err,
      );
    }
  }

  try {
    const res = await checkPopbillAccountInfo({
      bankCode: resolved.code,
      accountNumber,
    });
    const result = toResultCode(res?.result);
    const accountName = String(res?.accountName || "").trim();
    const lookupOk = result === SUCCESS_RESULT && Boolean(accountName);
    const nameOk = holderName
      ? accountHoldersMatch(holderName, accountName)
      : true;
    const verified = lookupOk && nameOk;

    let message;
    if (!lookupOk) {
      message = String(
        res?.resultMessage || "계좌를 조회하지 못했습니다. 계좌번호를 확인해주세요.",
      );
    } else if (!nameOk) {
      message = `예금주 불일치 · 은행 등록명: ${accountName}`;
    } else {
      message = `계좌 확인 완료 · 예금주 ${accountName}`;
    }

    return {
      verified,
      skipped: false,
      method: "account",
      message,
      accountName,
      bankCode: resolved.code,
      bankName: resolved.name,
      result,
      resultMessage: String(res?.resultMessage || ""),
    };
  } catch (err) {
    const code = err?.code;
    const msg = String(err?.message || err || "").trim();
    console.error("[payoutAccountVerify] checkAccountInfo error", code, msg);
    return {
      verified: false,
      skipped: false,
      method: "account",
      message: msg || "팝빌 계좌 조회 중 오류가 발생했습니다.",
      accountName: "",
      bankCode: resolved.code,
      bankName: resolved.name,
      result: code ?? null,
      resultMessage: msg,
    };
  }
}

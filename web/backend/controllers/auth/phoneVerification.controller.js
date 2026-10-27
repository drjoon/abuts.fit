// related files:
// - web/backend/rules.md
// - web/backend/utils/popbill.util.js
// - web/backend/modules/credits/credit.routes.js
// - web/backend/modules/manufacturer/manufacturer.routes.js
// change-log:
// - 2026-10-27: 인증 문자는 큐가 아니라 팝빌 즉시 전송(sendPopbillXMS).
import { sendPopbillXMS } from "../../utils/popbill.util.js";
import { pruneTtlMap } from "../../utils/boundedTtlMap.js";

const verificationCodes = new Map();
const CODE_EXPIRY_MS = 5 * 60 * 1000;
const VERIFICATION_CODE_MAX_ENTRIES = 500;

function rememberVerificationCode(phone, entry) {
  if (verificationCodes.has(phone)) verificationCodes.delete(phone);
  verificationCodes.set(phone, entry);
  pruneTtlMap(verificationCodes, VERIFICATION_CODE_MAX_ENTRIES);
}

function generateVerificationCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function cleanPhoneNumber(phone) {
  const cleaned = String(phone || "").replace(/[^0-9+]/g, "");
  if (cleaned.startsWith("+82")) {
    return "0" + cleaned.substring(3);
  }
  return cleaned;
}

export async function sendVerificationCode(req, res) {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "전화번호를 입력해주세요.",
      });
    }

    const cleanedPhone = cleanPhoneNumber(phone);
    if (cleanedPhone.length < 10) {
      return res.status(400).json({
        success: false,
        message: "올바른 전화번호를 입력해주세요.",
      });
    }

    const code = generateVerificationCode();
    const expiresAt = Date.now() + CODE_EXPIRY_MS;
    const message = `[어벗츠] 인증번호는 ${code}입니다. 5분 내에 입력해주세요.`;

    await sendPopbillXMS({
      to: cleanedPhone,
      content: message,
      subject: "인증번호",
    });

    rememberVerificationCode(cleanedPhone, {
      code,
      expiresAt,
      attempts: 0,
    });

    return res.status(200).json({
      success: true,
      message: "인증번호가 발송되었습니다.",
      method: "SMS",
      expiresIn: CODE_EXPIRY_MS / 1000,
    });
  } catch (error) {
    console.error("인증번호 발송 실패:", error);
    return res.status(500).json({
      success: false,
      message: "인증번호 발송에 실패했습니다.",
      error: error.message,
    });
  }
}

export async function verifyCode(req, res) {
  try {
    const { phone, code } = req.body;

    if (!phone || !code) {
      return res.status(400).json({
        success: false,
        message: "전화번호와 인증번호를 입력해주세요.",
      });
    }

    const cleanedPhone = cleanPhoneNumber(phone);
    pruneTtlMap(verificationCodes, VERIFICATION_CODE_MAX_ENTRIES);
    const stored = verificationCodes.get(cleanedPhone);

    if (!stored) {
      return res.status(400).json({
        success: false,
        message: "인증번호가 발송되지 않았거나 만료되었습니다.",
      });
    }

    if (Date.now() > stored.expiresAt) {
      verificationCodes.delete(cleanedPhone);
      return res.status(400).json({
        success: false,
        message: "인증번호가 만료되었습니다. 다시 발송해주세요.",
      });
    }

    if (stored.attempts >= 5) {
      verificationCodes.delete(cleanedPhone);
      return res.status(400).json({
        success: false,
        message: "인증 시도 횟수를 초과했습니다. 다시 발송해주세요.",
      });
    }

    stored.attempts += 1;

    if (stored.code !== String(code).trim()) {
      return res.status(400).json({
        success: false,
        message: "인증번호가 일치하지 않습니다.",
        remainingAttempts: 5 - stored.attempts,
      });
    }

    verificationCodes.delete(cleanedPhone);

    return res.status(200).json({
      success: true,
      message: "전화번호 인증이 완료되었습니다.",
    });
  } catch (error) {
    console.error("인증번호 확인 실패:", error);
    return res.status(500).json({
      success: false,
      message: "인증번호 확인에 실패했습니다.",
      error: error.message,
    });
  }
}

export default {
  sendVerificationCode,
  verifyCode,
};

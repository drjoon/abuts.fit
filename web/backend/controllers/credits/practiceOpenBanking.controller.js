// related files:
// - web/backend/services/practiceObBilling.service.js
// - web/backend/services/openBankingAdapter.service.js
// - web/backend/modules/practiceBilling/practiceBilling.routes.js
// - web/frontend/src/features/settings/tabs/PracticeObBillingTab.tsx
import { Types } from "mongoose";
import {
  confirmPracticeMonthlySettlement,
  getKstYearMonth,
  getPracticeObBillingOverview,
  listPracticeLabDeposits,
  transferPracticeLabDeposit,
  reauthenticatePracticeOpenBanking,
  runPracticeMonthlySettlementTransfer,
  setupPracticeOpenBankingConsent,
} from "../../services/practiceObBilling.service.js";

function resolvePracticeAnchorId(req) {
  const raw = req.user?.businessAnchorId || req.query?.businessAnchorId;
  return raw && Types.ObjectId.isValid(String(raw))
    ? new Types.ObjectId(String(raw))
    : null;
}

export async function getPracticeBillingOverviewApi(req, res) {
  try {
    const practiceAnchorId = resolvePracticeAnchorId(req);
    if (!practiceAnchorId) {
      return res.status(400).json({
        success: false,
        message: "사업자 정보를 확인할 수 없습니다.",
      });
    }
    const data = await getPracticeObBillingOverview({ practiceAnchorId });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("[practiceOpenBanking.getOverview] error", error);
    return res.status(500).json({
      success: false,
      message: error.message || "자동정산 정보를 불러오지 못했습니다.",
    });
  }
}

export async function registerPracticeObConsentApi(req, res) {
  try {
    const practiceAnchorId = resolvePracticeAnchorId(req);
    if (!practiceAnchorId) {
      return res.status(400).json({
        success: false,
        message: "사업자 정보를 확인할 수 없습니다.",
      });
    }
    const {
      bankCode,
      bankName,
      accountNumber,
      accountHolder,
      passkeyCredentialId,
      passkeyPublicKey,
    } = req.body || {};

    const consent = await setupPracticeOpenBankingConsent({
      practiceAnchorId,
      bankCode,
      bankName,
      accountNumber,
      accountHolder,
      passkeyCredentialId,
      passkeyPublicKey,
    });

    return res.status(200).json({
      success: true,
      data: { openBankingConsent: consent },
      message: "오픈뱅킹 장기동의 및 생체인증(Face ID/지문) 등록이 완료되었습니다.",
    });
  } catch (error) {
    console.error("[practiceOpenBanking.registerConsent] error", error);
    return res.status(400).json({
      success: false,
      message: error.message || "오픈뱅킹 장기동의 등록에 실패했습니다.",
    });
  }
}

export async function reauthPracticeObConsentApi(req, res) {
  try {
    const practiceAnchorId = resolvePracticeAnchorId(req);
    if (!practiceAnchorId) {
      return res.status(400).json({
        success: false,
        message: "사업자 정보를 확인할 수 없습니다.",
      });
    }

    const result = await reauthenticatePracticeOpenBanking({
      practiceAnchorId,
      passkeyAssertion: req.body?.passkeyAssertion || {},
    });

    return res.status(200).json({
      success: true,
      data: result,
      message: "생체인증 재확인이 완료되어 정기동의 기간이 90일 연장되었습니다.",
    });
  } catch (error) {
    console.error("[practiceOpenBanking.reauth] error", error);
    return res.status(400).json({
      success: false,
      message: error.message || "생체인증 재확인에 실패했습니다.",
    });
  }
}

export async function retryPracticeSettlementApi(req, res) {
  try {
    const practiceAnchorId = resolvePracticeAnchorId(req);
    if (!practiceAnchorId) {
      return res.status(400).json({
        success: false,
        message: "사업자 정보를 확인할 수 없습니다.",
      });
    }
    const settlementId = String(req.params.settlementId || "").trim();
    if (!Types.ObjectId.isValid(settlementId)) {
      return res.status(400).json({
        success: false,
        message: "정산 ID가 올바르지 않습니다.",
      });
    }

    // 생체인증(Face ID/지문) 1탭 확인과 동시에 장기동의 갱신 및 즉시 재이체
    await reauthenticatePracticeOpenBanking({
      practiceAnchorId,
      passkeyAssertion: req.body?.passkeyAssertion || {},
    });

    const settlement = await runPracticeMonthlySettlementTransfer({
      settlementId,
      options: {
        biometricVerified: true,
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        id: String(settlement._id),
        status: settlement.status,
      },
      message:
        settlement.status === "COMPLETED"
          ? "생체인증 승인 및 일괄 이체가 완료되어 의뢰 제한(Hold)이 해제되었습니다."
          : "일부 이체가 실패했습니다. 출금계좌 잔액을 확인해 주세요.",
    });
  } catch (error) {
    console.error("[practiceOpenBanking.retrySettlement] error", error);
    return res.status(400).json({
      success: false,
      message: error.message || "일괄 이체 재시도 중 오류가 발생했습니다.",
    });
  }
}

export async function triggerCurrentMonthSettlementConfirmApi(req, res) {
  try {
    const practiceAnchorId = resolvePracticeAnchorId(req);
    if (!practiceAnchorId) {
      return res.status(400).json({
        success: false,
        message: "사업자 정보를 확인할 수 없습니다.",
      });
    }
    const yearMonth =
      String(req.body?.yearMonth || "").trim() || getKstYearMonth().yearMonth;
    const settlement = await confirmPracticeMonthlySettlement({
      practiceAnchorId,
      yearMonth,
    });
    return res.status(200).json({
      success: true,
      data: { id: String(settlement._id), yearMonth: settlement.yearMonth },
    });
  } catch (error) {
    console.error("[practiceOpenBanking.triggerConfirm] error", error);
    return res.status(500).json({
      success: false,
      message: error.message || "월간 정산서 생성에 실패했습니다.",
    });
  }
}

export async function listPracticeLabDepositsApi(req, res) {
  try {
    const practiceAnchorId = resolvePracticeAnchorId(req);
    if (!practiceAnchorId) {
      return res.status(400).json({ success: false, message: "사업자 정보를 확인할 수 없습니다." });
    }
    const items = await listPracticeLabDeposits({ practiceAnchorId });
    return res.status(200).json({ success: true, data: { items } });
  } catch (error) {
    console.error("[practiceOpenBanking.listDeposits] error", error);
    return res.status(500).json({ success: false, message: "보증금 내역을 불러오지 못했습니다." });
  }
}

export async function transferPracticeLabDepositApi(req, res) {
  try {
    const practiceAnchorId = resolvePracticeAnchorId(req);
    if (!practiceAnchorId) {
      return res.status(400).json({ success: false, message: "사업자 정보를 확인할 수 없습니다." });
    }
    const labAnchorId = String(req.body?.labAnchorId || "").trim();
    if (!Types.ObjectId.isValid(labAnchorId)) {
      return res.status(400).json({ success: false, message: "기공소를 선택해 주세요." });
    }
    const deposit = await transferPracticeLabDeposit({
      practiceAnchorId,
      labAnchorId,
      amount: req.body?.amount,
      passkeyAssertion: req.body?.passkeyAssertion || {},
    });
    return res.status(200).json({
      success: true,
      data: { id: String(deposit._id), status: deposit.status },
      message: "보증금이 기공소 계좌로 이체되었습니다.",
    });
  } catch (error) {
    console.error("[practiceOpenBanking.transferDeposit] error", error);
    return res.status(400).json({ success: false, message: error.message || "보증금 이체에 실패했습니다." });
  }
}

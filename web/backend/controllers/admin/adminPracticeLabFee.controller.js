// related files:
// - web/backend/services/practiceObBilling.service.js
// - web/backend/modules/admin/admin.routes.js
// - web/frontend/src/pages/admin/finance/AdminPracticeLabFeeTab.tsx
import { Types } from "mongoose";
import {
  listPracticeLabFeeWorklist,
  markPracticeSettlementLabPayout,
  markPracticeSettlementPartialPayment,
  markPracticeSettlementPaymentReceived,
  summarizePracticeLabFeeDelinquency,
} from "../../services/practiceObBilling.service.js";

export async function adminListPracticeLabFees(_req, res) {
  try {
    const items = await listPracticeLabFeeWorklist();
    return res.status(200).json({ success: true, data: { items } });
  } catch (error) {
    console.error("[adminPracticeLabFee.list] error", error);
    return res.status(500).json({
      success: false,
      message: "기공료 정산 목록을 불러오지 못했습니다.",
    });
  }
}

export async function adminPracticeLabFeeDelinquency(_req, res) {
  try {
    const data = await summarizePracticeLabFeeDelinquency();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("[adminPracticeLabFee.delinquency] error", error);
    return res.status(500).json({
      success: false,
      message: "미납 치과를 불러오지 못했습니다.",
    });
  }
}

export async function adminRecordPracticeLabFeePartial(req, res) {
  try {
    const settlementId = String(req.params.id || "").trim();
    if (!Types.ObjectId.isValid(settlementId)) {
      return res.status(400).json({ success: false, message: "정산 ID가 올바르지 않습니다." });
    }
    const settlement = await markPracticeSettlementPartialPayment({
      settlementId,
      amountReceived: req.body?.amountReceived,
    });
    const amount = Math.round(Number(settlement.amountReceived) || 0);
    return res.status(200).json({
      success: true,
      data: { id: String(settlement._id), amountReceived: amount },
      message: amount > 0 ? "일부 입금을 기록했습니다." : "일부 입금 기록을 지웠습니다.",
    });
  } catch (error) {
    console.error("[adminPracticeLabFee.partial] error", error);
    return res.status(400).json({
      success: false,
      message: error.message || "일부 입금 기록에 실패했습니다.",
    });
  }
}

export async function adminReceivePracticeLabFee(req, res) {
  try {
    const settlementId = String(req.params.id || "").trim();
    if (!Types.ObjectId.isValid(settlementId)) {
      return res.status(400).json({ success: false, message: "정산 ID가 올바르지 않습니다." });
    }
    const settlement = await markPracticeSettlementPaymentReceived({ settlementId });
    return res.status(200).json({
      success: true,
      data: { id: String(settlement._id), status: settlement.status },
      message: "입금을 확인했습니다. 새 기공의뢰를 다시 보낼 수 있습니다.",
    });
  } catch (error) {
    console.error("[adminPracticeLabFee.receive] error", error);
    return res.status(400).json({
      success: false,
      message: error.message || "입금 확인에 실패했습니다.",
    });
  }
}

export async function adminPayPracticeLabFee(req, res) {
  try {
    const settlementId = String(req.params.id || "").trim();
    if (!Types.ObjectId.isValid(settlementId)) {
      return res.status(400).json({ success: false, message: "정산 ID가 올바르지 않습니다." });
    }
    const settlement = await markPracticeSettlementLabPayout({ settlementId });
    return res.status(200).json({
      success: true,
      data: { id: String(settlement._id) },
      message: "기공소 입금을 기록했습니다.",
    });
  } catch (error) {
    console.error("[adminPracticeLabFee.pay] error", error);
    return res.status(400).json({
      success: false,
      message: error.message || "기공소 입금 기록에 실패했습니다.",
    });
  }
}

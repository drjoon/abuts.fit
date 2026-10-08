// change-log:
// - 2026-10-08: 영업팀 거래처 가격 승인(본사). 승인 시 dealerUnitPrice 반영 + 거래 가능.
// related files:
// - web/backend/controllers/salesman/salesman.controller.js
// - web/backend/utils/creditLock.util.js
// - web/backend/models/businessAnchor.model.js
import { Types } from "mongoose";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import { validateDealerUnitPrice } from "../../utils/requestorUnitPricePolicy.js";
import { invalidateRequestorUnitPriceCache } from "../../services/requestorUnitPrice.service.js";

export async function listPriceApprovals(req, res) {
  try {
    const rows = await BusinessAnchor.find({ "dealerPriceApproval.status": "pending" })
      .select("+dealerPriceApproval")
      .select({ _id: 1, name: 1, requestorKind: 1, referredByAnchorId: 1, dealerUnitPrice: 1 })
      .populate({ path: "referredByAnchorId", select: "name" })
      .sort({ "dealerPriceApproval.requestedAt": 1 })
      .lean();
    return res.status(200).json({
      success: true,
      data: {
        items: rows.map((r) => ({
          anchorId: String(r._id),
          name: r.name || "",
          requestorKind: r.requestorKind || null,
          referrerName: r.referredByAnchorId?.name || "",
          currentPrice: r.dealerUnitPrice ?? null,
          requestedPrice: r.dealerPriceApproval?.requestedPrice ?? null,
          requestedAt: r.dealerPriceApproval?.requestedAt || null,
        })),
      },
    });
  } catch (error) {
    console.error("[admin.listPriceApprovals] error", error);
    return res.status(500).json({ success: false, message: "가격 승인 목록 조회 중 오류가 발생했습니다." });
  }
}

export async function decidePriceApproval(req, res) {
  try {
    const anchorId = String(req.params.anchorId || "").trim();
    if (!Types.ObjectId.isValid(anchorId)) {
      return res.status(400).json({ success: false, message: "거래처 ID가 올바르지 않습니다." });
    }
    const approve = req.body?.approve === true;
    const anchor = await BusinessAnchor.findOne({ _id: anchorId, "dealerPriceApproval.status": "pending" })
      .select("+dealerPriceApproval")
      .select({ _id: 1 })
      .lean();
    if (!anchor) {
      return res.status(404).json({ success: false, message: "승인 대기 중인 요청이 없습니다." });
    }
    const set = {
      "dealerPriceApproval.status": approve ? "approved" : "rejected",
      "dealerPriceApproval.decidedBy": req.user._id,
      "dealerPriceApproval.decidedAt": new Date(),
      "dealerPriceApproval.rejectReason": approve ? "" : String(req.body?.reason || "").trim().slice(0, 200),
    };
    if (approve) {
      const checked = validateDealerUnitPrice(anchor.dealerPriceApproval.requestedPrice);
      if (!checked.ok) {
        return res.status(400).json({ success: false, message: checked.message });
      }
      // 기본가(15,000)는 별도 가격 없음(null)
      set.dealerUnitPrice = checked.price >= 15000 ? null : checked.price;
    }
    await BusinessAnchor.updateOne({ _id: anchorId }, { $set: set });
    invalidateRequestorUnitPriceCache(anchorId);
    return res.status(200).json({ success: true, data: { anchorId, status: approve ? "approved" : "rejected" } });
  } catch (error) {
    console.error("[admin.decidePriceApproval] error", error);
    return res.status(500).json({ success: false, message: "가격 승인 처리 중 오류가 발생했습니다." });
  }
}

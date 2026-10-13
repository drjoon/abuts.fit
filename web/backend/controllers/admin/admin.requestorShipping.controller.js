// change-log:
// - 2026-10-13: 관리자 대시보드 — 의뢰자별 배송 방식(택배/딜리버리) 조회·지정.
// related files:
// - web/backend/services/requestorShipping.service.js
// - web/frontend/src/pages/admin/dashboard/RequestorShippingModeCard.tsx
import { Types } from "mongoose";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import {
  loadMonthlyRequestCounts,
  normalizeShippingMode,
  setRequestorShippingMode,
} from "../../services/requestorShipping.service.js";

const LIST_LIMIT = 300;

const escapeRegex = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function listRequestorShipping(req, res) {
  try {
    const q = String(req.query?.q || "").trim().slice(0, 40);
    const filter = { businessType: "requestor", status: { $ne: "merged" } };
    if (q) filter.name = { $regex: escapeRegex(q), $options: "i" };
    if (req.query?.mode === "express") filter["shippingPolicy.defaultShippingMode"] = "express";
    if (req.query?.mode === "normal") filter["shippingPolicy.defaultShippingMode"] = { $ne: "express" };

    const rows = await BusinessAnchor.find(filter)
      .select({
        _id: 1,
        name: 1,
        requestorKind: 1,
        referredByAnchorId: 1,
        "shippingPolicy.defaultShippingMode": 1,
      })
      .populate({ path: "referredByAnchorId", select: "name" })
      .sort({ name: 1 })
      .limit(LIST_LIMIT)
      .lean();
    const monthly = await loadMonthlyRequestCounts(rows.map((r) => r._id));
    const items = rows.map((r) => ({
      anchorId: String(r._id),
      name: r.name || "",
      requestorKind: r.requestorKind || null,
      referrerName: r.referredByAnchorId?.name || "",
      shippingMode: normalizeShippingMode(r.shippingPolicy?.defaultShippingMode),
      monthlyRequestCount: monthly.get(String(r._id))?.thisMonth ?? 0,
      prevMonthRequestCount: monthly.get(String(r._id))?.prevMonth ?? 0,
    }));
    // 딜리버리 지정 거래처를 위로, 그 안에서는 월 의뢰 많은 순.
    items.sort(
      (a, b) =>
        Number(b.shippingMode === "express") - Number(a.shippingMode === "express") ||
        b.monthlyRequestCount - a.monthlyRequestCount ||
        a.name.localeCompare(b.name, "ko"),
    );
    return res.status(200).json({ success: true, data: { items, limit: LIST_LIMIT } });
  } catch (error) {
    console.error("[admin.listRequestorShipping] error", error);
    return res.status(500).json({ success: false, message: "배송 방식 목록 조회 중 오류가 발생했습니다." });
  }
}

export async function setRequestorShipping(req, res) {
  try {
    const anchorId = String(req.params.anchorId || "").trim();
    if (!Types.ObjectId.isValid(anchorId)) {
      return res.status(400).json({ success: false, message: "거래처 ID가 올바르지 않습니다." });
    }
    const raw = req.body?.shippingMode;
    if (raw !== "normal" && raw !== "express") {
      return res.status(400).json({ success: false, message: "배송 방식이 올바르지 않습니다." });
    }
    const saved = await setRequestorShippingMode({ filter: { _id: anchorId }, mode: raw });
    if (!saved) {
      return res.status(404).json({ success: false, message: "의뢰자를 찾을 수 없습니다." });
    }
    return res.status(200).json({ success: true, data: saved });
  } catch (error) {
    console.error("[admin.setRequestorShipping] error", error);
    return res.status(500).json({ success: false, message: "배송 방식 저장 중 오류가 발생했습니다." });
  }
}

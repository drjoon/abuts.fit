// change-log:
// - 2026-10-13: 거래처 배송 방식(택배 normal / 딜리버리 express). 딜러·영업팀·관리자가 지정, 거래처 본인은 변경 불가.
// related files:
// - web/backend/controllers/salesman/salesman.controller.js
// - web/backend/controllers/admin/admin.requestorShipping.controller.js
// - web/backend/controllers/requests/expressSelectable.utils.js
// - web/backend/models/businessAnchor.model.js
import BusinessAnchor from "../models/businessAnchor.model.js";
import Request from "../models/request.model.js";
import { getTodayYmdInKst } from "../utils/krBusinessDays.js";

/** 딜리버리 배송 적용 기준(월 의뢰 건수). 안내용이며 지정 자체는 막지 않는다. */
export const DELIVERY_SHIPPING_MIN_MONTHLY_REQUESTS = 100;

export function normalizeShippingMode(raw) {
  return raw === "express" ? "express" : "normal";
}

/** KST 기준 이번 달·지난 달 경계. */
function resolveMonthRangesKst(todayYmd = getTodayYmdInKst()) {
  const [y, m] = String(todayYmd).split("-").map(Number);
  const pad = (n) => String(n).padStart(2, "0");
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const at = (yy, mm) => new Date(`${yy}-${pad(mm)}-01T00:00:00+09:00`);
  return { prevStart: at(py, pm), thisStart: at(y, m), nextStart: at(ny, nm) };
}

/** anchorId(string) → { thisMonth, prevMonth }. 취소 건 제외. */
export async function loadMonthlyRequestCounts(anchorIds) {
  const ids = (anchorIds || []).filter(Boolean);
  const out = new Map(ids.map((id) => [String(id), { thisMonth: 0, prevMonth: 0 }]));
  if (!ids.length) return out;
  const { prevStart, thisStart, nextStart } = resolveMonthRangesKst();
  const rows = await Request.aggregate([
    {
      $match: {
        businessAnchorId: { $in: ids },
        createdAt: { $gte: prevStart, $lt: nextStart },
        manufacturerStage: { $ne: "취소" },
      },
    },
    {
      $group: {
        _id: "$businessAnchorId",
        thisMonth: { $sum: { $cond: [{ $gte: ["$createdAt", thisStart] }, 1, 0] } },
        prevMonth: { $sum: { $cond: [{ $lt: ["$createdAt", thisStart] }, 1, 0] } },
      },
    },
  ]);
  for (const r of rows) {
    out.set(String(r._id), { thisMonth: r.thisMonth, prevMonth: r.prevMonth });
  }
  return out;
}

/** 조건(filter)에 맞는 거래처 1곳의 배송 방식을 바꾼다. 없으면 null. */
export async function setRequestorShippingMode({ filter, mode }) {
  const next = normalizeShippingMode(mode);
  const updated = await BusinessAnchor.findOneAndUpdate(
    { ...filter, businessType: "requestor" },
    { $set: { "shippingPolicy.defaultShippingMode": next, "shippingPolicy.updatedAt": new Date() } },
    { new: true },
  )
    .select({ _id: 1 })
    .lean();
  return updated ? { anchorId: String(updated._id), shippingMode: next } : null;
}

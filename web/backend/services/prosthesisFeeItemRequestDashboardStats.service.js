// related files:
// - web/backend/models/prosthesisFeeItemRequest.model.js
// - web/backend/controllers/admin/admin.dashboard.controller.js
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx
// change-log:
// - 2026-09-05: 신규 보철물(기공수가) 요청 관리자 대시보드 집계.
// - 2026-09-05: approved(관리자 승인·Off 시드) 집계 추가.
import ProsthesisFeeItemRequest from "../models/prosthesisFeeItemRequest.model.js";

const DETAIL_ITEM_LIMIT = 100;

/**
 * @returns {Promise<{
 *   pending: number,
 *   approved: number,
 *   adopted: number,
 *   dismissed: number,
 *   total: number,
 *   items: Array<Record<string, unknown>>,
 * }>}
 */
export async function buildProsthesisFeeItemRequestDashboardStats() {
  const [countRows, requestDocs] = await Promise.all([
    ProsthesisFeeItemRequest.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]),
    ProsthesisFeeItemRequest.find({})
      .sort({ status: 1, createdAt: -1 })
      .limit(DETAIL_ITEM_LIMIT)
      .lean(),
  ]);

  let pending = 0;
  let approved = 0;
  let adopted = 0;
  let dismissed = 0;
  for (const row of countRows) {
    const status = String(row?._id || "").trim();
    const count = Number(row?.count || 0);
    if (status === "pending") pending = count;
    else if (status === "approved") approved = count;
    else if (status === "adopted") adopted = count;
    else if (status === "dismissed") dismissed = count;
  }

  const items = (Array.isArray(requestDocs) ? requestDocs : []).map((doc) => {
    const labTargets = Array.isArray(doc.labTargets)
      ? doc.labTargets
          .map((row) => {
            const labAnchorId = row?.labAnchorId
              ? String(row.labAnchorId).trim()
              : "";
            if (!labAnchorId) return null;
            return {
              labAnchorId,
              labName: String(row?.labName || "").trim(),
            };
          })
          .filter(Boolean)
      : [];
    const legacyId = doc.labAnchorId ? String(doc.labAnchorId) : null;
    const resolvedTargets =
      labTargets.length > 0
        ? labTargets
        : legacyId
          ? [
              {
                labAnchorId: legacyId,
                labName: String(doc.labName || "").trim(),
              },
            ]
          : [];
    const primary = resolvedTargets[0] || null;
    return {
      id: String(doc._id),
      practiceAnchorId: doc.practiceAnchorId
        ? String(doc.practiceAnchorId)
        : null,
      practiceName: String(doc.practiceName || "").trim(),
      labAnchorId: primary?.labAnchorId || null,
      labName: primary?.labName || "",
      labTargets: resolvedTargets,
      name: String(doc.name || "").trim(),
      nameKey: String(doc.nameKey || "").trim(),
      status: String(doc.status || "pending"),
      source: String(doc.source || "extra_request"),
      applyScope: doc.applyScope ? String(doc.applyScope) : null,
      createdAt: doc.createdAt || null,
      approvedAt: doc.approvedAt || null,
      adoptedAt: doc.adoptedAt || null,
    };
  });

  return {
    pending,
    approved,
    adopted,
    dismissed,
    total: pending + approved + adopted + dismissed,
    items,
  };
}

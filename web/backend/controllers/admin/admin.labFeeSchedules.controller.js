// related files:
// - web/backend/modules/admin/admin.routes.js
// - web/backend/utils/labFeeSchedule.js
// - web/backend/utils/practiceTransferAutoMatch.js
// - web/frontend/src/features/settings/tabs/AdminLabFeeSchedulesTab.tsx
// - web/frontend/src/pages/admin/system/AdminPlatformSettingsPage.tsx
// - 2026-08-16: 수가 ON 기공소 상단 정렬.
import BusinessAnchor from "../../models/businessAnchor.model.js";
import {
  isLabFeeScheduleConfigured,
  normalizeLabFeeItems,
} from "../../utils/labFeeSchedule.js";
import { requestorKindCapableAnchorFilter } from "../../utils/requestorCapabilities.js";

const PAGE_LIMIT_DEFAULT = 15;
const PAGE_LIMIT_MAX = 50;

const escapeRegex = (value) =>
  String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const formatAddress = (metadata) => {
  const base = String(metadata?.address || "").trim();
  const detail = String(metadata?.addressDetail || "").trim();
  return [base, detail].filter(Boolean).join(" ");
};

/** 수가 ON(configured) — countDocuments / $match용 쿼리 */
const LAB_FEE_ON_MATCH = {
  $or: [
    { "labFeeSchedule.active": true },
    {
      "labFeeSchedule.active": { $exists: false },
      "labFeeSchedule.updatedAt": { $exists: true, $ne: null },
    },
  ],
};

/** 수가 ON — aggregate $addFields용 표현식 (쿼리 연산자 불가) */
const LAB_FEE_ON_EXPR = {
  $or: [
    { $eq: ["$labFeeSchedule.active", true] },
    {
      $and: [
        { $eq: [{ $type: "$labFeeSchedule.active" }, "missing"] },
        { $ne: [{ $type: "$labFeeSchedule.updatedAt" }, "missing"] },
        { $ne: ["$labFeeSchedule.updatedAt", null] },
      ],
    },
  ],
};

const toListRow = (row) => {
  const schedule = row?.labFeeSchedule || null;
  const configured = isLabFeeScheduleConfigured(schedule);
  const items = configured ? normalizeLabFeeItems(schedule) : [];
  return {
    _id: row._id,
    name: row.name || row?.metadata?.companyName || "",
    businessNumberNormalized: row.businessNumberNormalized || "",
    status: row.status || "",
    representativeName: String(row?.metadata?.representativeName || "").trim(),
    address: formatAddress(row?.metadata),
    verified: String(row.status || "").trim() === "verified",
    configured,
    active: configured,
    items,
    updatedAt: schedule?.updatedAt || null,
  };
};

/**
 * GET /api/admin/settings/lab-fee-schedules?q=&page=1&limit=15
 * 기공소 목록 + 기공비 수가. 수가 ON이 먼저.
 */
export async function listLabFeeSchedules(req, res) {
  try {
    const q = String(req.query?.q || "").trim();
    const page =
      Math.max(1, Number.parseInt(String(req.query?.page || "1"), 10) || 1);
    const rawLimit = Number.parseInt(
      String(req.query?.limit || PAGE_LIMIT_DEFAULT),
      10,
    );
    const limit = Math.min(
      PAGE_LIMIT_MAX,
      Math.max(1, Number.isFinite(rawLimit) ? rawLimit : PAGE_LIMIT_DEFAULT),
    );
    const skip = (page - 1) * limit;

    const kindFilter = requestorKindCapableAnchorFilter("lab");
    const filter = {
      businessType: "requestor",
      status: { $ne: "merged" },
      ...(kindFilter || {}),
    };

    if (q) {
      const re = new RegExp(escapeRegex(q), "i");
      filter.$and = [
        ...(Array.isArray(filter.$and) ? filter.$and : []),
        {
          $or: [
            { name: re },
            { businessNumberNormalized: re },
            { "metadata.companyName": re },
            { "metadata.representativeName": re },
            { "metadata.address": re },
          ],
        },
      ];
    }

    const configuredFilter = {
      ...filter,
      $and: [
        ...(Array.isArray(filter.$and) ? filter.$and : []),
        LAB_FEE_ON_MATCH,
      ],
    };

    const [total, configuredCount, rows] = await Promise.all([
      BusinessAnchor.countDocuments(filter),
      BusinessAnchor.countDocuments(configuredFilter),
      BusinessAnchor.aggregate([
        { $match: filter },
        {
          $addFields: {
            _feeOn: {
              $cond: [LAB_FEE_ON_EXPR, 1, 0],
            },
          },
        },
        { $sort: { _feeOn: -1, status: -1, name: 1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $project: {
            name: 1,
            businessNumberNormalized: 1,
            status: 1,
            labFeeSchedule: 1,
            "metadata.companyName": 1,
            "metadata.representativeName": 1,
            "metadata.address": 1,
            "metadata.addressDetail": 1,
          },
        },
      ]),
    ]);

    return res.json({
      success: true,
      data: rows.map(toListRow),
      pagination: {
        page,
        limit,
        total,
        hasMore: skip + rows.length < total,
      },
      configuredCount,
    });
  } catch (error) {
    console.error("[labFeeSchedules] list failed", error);
    return res.status(500).json({
      success: false,
      message: "기공소 수가 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
};

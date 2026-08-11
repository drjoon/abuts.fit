// related files:
// - web/backend/utils/designAccess.js
// - web/backend/models/businessAnchor.model.js
// - web/backend/modules/devops/designAccess.routes.js
import { Types } from "mongoose";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import {
  invalidateDesignAccessCache,
  isDesignAccessEnabled,
} from "../../utils/designAccess.js";
import { invalidateMyBusinessCache } from "../businesses/business.controller.js";

const PAGE_LIMIT_DEFAULT = 15;
const PAGE_LIMIT_MAX = 50;

const escapeRegex = (value) =>
  String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const formatAddress = (metadata) => {
  const base = String(metadata?.address || "").trim();
  const detail = String(metadata?.addressDetail || "").trim();
  return [base, detail].filter(Boolean).join(" ");
};

const toListRow = (row) => ({
  _id: row._id,
  name: row.name || row?.metadata?.companyName || "",
  businessNumberNormalized: row.businessNumberNormalized || "",
  status: row.status || "",
  representativeName: String(row?.metadata?.representativeName || "").trim(),
  address: formatAddress(row?.metadata),
  designAccessEnabled: isDesignAccessEnabled(row),
});

/**
 * GET /api/devops/design-access?q=&page=1&limit=15
 * 검증된 의뢰자 목록 + designAccessEnabled (페이지네이션)
 */
export async function listDesignAccess(req, res) {
  try {
    const q = String(req.query?.q || "").trim();
    const page = Math.max(1, Number.parseInt(String(req.query?.page || "1"), 10) || 1);
    const rawLimit = Number.parseInt(String(req.query?.limit || PAGE_LIMIT_DEFAULT), 10);
    const limit = Math.min(
      PAGE_LIMIT_MAX,
      Math.max(1, Number.isFinite(rawLimit) ? rawLimit : PAGE_LIMIT_DEFAULT),
    );
    const skip = (page - 1) * limit;

    // 검증된 의뢰자만 디자이너 지정 대상
    const filter = {
      businessType: "requestor",
      status: "verified",
    };

    if (q) {
      const re = new RegExp(escapeRegex(q), "i");
      filter.$or = [
        { name: re },
        { businessNumberNormalized: re },
        { "metadata.companyName": re },
        { "metadata.representativeName": re },
        { "metadata.address": re },
      ];
    }

    const [total, enabledCount, rows] = await Promise.all([
      BusinessAnchor.countDocuments(filter),
      BusinessAnchor.countDocuments({ ...filter, designAccessEnabled: true }),
      BusinessAnchor.find(filter)
        .select({
          name: 1,
          businessNumberNormalized: 1,
          status: 1,
          designAccessEnabled: 1,
          "metadata.companyName": 1,
          "metadata.representativeName": 1,
          "metadata.address": 1,
          "metadata.addressDetail": 1,
        })
        .sort({ designAccessEnabled: -1, name: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
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
      enabledCount,
    });
  } catch (error) {
    console.error("[designAccess] list failed", error);
    return res.status(500).json({
      success: false,
      message: "검증된 디자이너 지정 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * PATCH /api/devops/design-access/:anchorId
 * body: { enabled: boolean }
 */
export async function patchDesignAccess(req, res) {
  try {
    const anchorId = String(req.params?.anchorId || "").trim();
    if (!Types.ObjectId.isValid(anchorId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 사업자 ID입니다.",
      });
    }

    if (typeof req.body?.enabled !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "enabled(boolean)가 필요합니다.",
      });
    }

    const enabled = Boolean(req.body.enabled);

    const existing = await BusinessAnchor.findOne({
      _id: anchorId,
      businessType: "requestor",
    })
      .select({ status: 1 })
      .lean();

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "의뢰자 사업자를 찾을 수 없습니다.",
      });
    }

    if (enabled && String(existing.status || "").trim() !== "verified") {
      return res.status(400).json({
        success: false,
        message: "검증된 의뢰자만 디자이너로 지정할 수 있습니다.",
      });
    }

    const updated = await BusinessAnchor.findOneAndUpdate(
      { _id: anchorId, businessType: "requestor" },
      { $set: { designAccessEnabled: enabled } },
      {
        new: true,
        projection: {
          name: 1,
          businessNumberNormalized: 1,
          status: 1,
          designAccessEnabled: 1,
          "metadata.companyName": 1,
          "metadata.representativeName": 1,
          "metadata.address": 1,
          "metadata.addressDetail": 1,
        },
      },
    ).lean();

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "의뢰자 사업자를 찾을 수 없습니다.",
      });
    }

    invalidateDesignAccessCache(anchorId);
    invalidateMyBusinessCache(anchorId);

    return res.json({
      success: true,
      data: toListRow(updated),
    });
  } catch (error) {
    console.error("[designAccess] patch failed", error);
    return res.status(500).json({
      success: false,
      message: "검증된 디자이너 지정 저장 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

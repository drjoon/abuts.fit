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

const escapeRegex = (value) =>
  String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * GET /api/devops/design-access?q=
 * 의뢰자 사업자 목록 + designAccessEnabled
 */
export async function listDesignAccess(req, res) {
  try {
    const q = String(req.query?.q || "").trim();
    const filter = {
      businessType: "requestor",
      status: { $ne: "merged" },
    };

    if (q) {
      const re = new RegExp(escapeRegex(q), "i");
      filter.$or = [
        { name: re },
        { businessNumberNormalized: re },
        { "metadata.companyName": re },
      ];
    }

    const rows = await BusinessAnchor.find(filter)
      .select({
        name: 1,
        businessNumberNormalized: 1,
        status: 1,
        designAccessEnabled: 1,
        "metadata.companyName": 1,
      })
      .sort({ designAccessEnabled: -1, name: 1 })
      .limit(100)
      .lean();

    return res.json({
      success: true,
      data: rows.map((row) => ({
        _id: row._id,
        name: row.name || row?.metadata?.companyName || "",
        businessNumberNormalized: row.businessNumberNormalized || "",
        status: row.status || "",
        designAccessEnabled: isDesignAccessEnabled(row),
      })),
    });
  } catch (error) {
    console.error("[designAccess] list failed", error);
    return res.status(500).json({
      success: false,
      message: "디자이너지정 목록 조회 중 오류가 발생했습니다.",
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
    const updated = await BusinessAnchor.findOneAndUpdate(
      { _id: anchorId, businessType: "requestor" },
      { $set: { designAccessEnabled: enabled } },
      { new: true, projection: { name: 1, businessNumberNormalized: 1, status: 1, designAccessEnabled: 1, "metadata.companyName": 1 } },
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
      data: {
        _id: updated._id,
        name: updated.name || updated?.metadata?.companyName || "",
        businessNumberNormalized: updated.businessNumberNormalized || "",
        status: updated.status || "",
        designAccessEnabled: isDesignAccessEnabled(updated),
      },
    });
  } catch (error) {
    console.error("[designAccess] patch failed", error);
    return res.status(500).json({
      success: false,
      message: "디자이너지정 저장 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

// related files:
// - web/backend/utils/practiceTransferAutoMatch.js
// - web/backend/models/businessAnchor.model.js
// - web/backend/modules/devops/practiceTransferAutoMatch.routes.js
import { Types } from "mongoose";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import { isPracticeTransferAutoMatchEnabled } from "../../utils/practiceTransferAutoMatch.js";
import {
  canReceivePracticeTransfer,
  resolveRequestorProfile,
} from "../../utils/requestorCapabilities.js";
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

const toListRow = (row) => {
  const profile = resolveRequestorProfile({
    anchorKind: row.requestorKind,
    anchorServices: row.requestorServices,
    anchorCaps: row.requestorCapabilities,
    businessVerified: String(row.status || "").trim() === "verified",
  });
  return {
    _id: row._id,
    name: row.name || row?.metadata?.companyName || "",
    businessNumberNormalized: row.businessNumberNormalized || "",
    status: row.status || "",
    requestorKind: row.requestorKind || profile.kind || "",
    representativeName: String(row?.metadata?.representativeName || "").trim(),
    address: formatAddress(row?.metadata),
    practiceTransferAutoMatchEnabled: isPracticeTransferAutoMatchEnabled(row),
    canReceivePracticeTransfer: canReceivePracticeTransfer(profile),
    verified: String(row.status || "").trim() === "verified",
  };
};

/**
 * GET /api/devops/practice-transfer-auto-match?q=&page=1&limit=15
 * 기공소(requestor lab) 목록 + practiceTransferAutoMatchEnabled
 */
export async function listPracticeTransferAutoMatch(req, res) {
  try {
    const q = String(req.query?.q || "").trim();
    const page = Math.max(1, Number.parseInt(String(req.query?.page || "1"), 10) || 1);
    const rawLimit = Number.parseInt(String(req.query?.limit || PAGE_LIMIT_DEFAULT), 10);
    const limit = Math.min(
      PAGE_LIMIT_MAX,
      Math.max(1, Number.isFinite(rawLimit) ? rawLimit : PAGE_LIMIT_DEFAULT),
    );
    const skip = (page - 1) * limit;

    const filter = {
      businessType: "requestor",
      requestorKind: "lab",
      status: { $ne: "merged" },
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
      BusinessAnchor.countDocuments({
        ...filter,
        practiceTransferAutoMatchEnabled: true,
      }),
      BusinessAnchor.find(filter)
        .select({
          name: 1,
          businessNumberNormalized: 1,
          status: 1,
          requestorKind: 1,
          requestorServices: 1,
          requestorCapabilities: 1,
          practiceTransferAutoMatchEnabled: 1,
          "metadata.companyName": 1,
          "metadata.representativeName": 1,
          "metadata.address": 1,
          "metadata.addressDetail": 1,
        })
        .sort({ practiceTransferAutoMatchEnabled: -1, status: -1, name: 1 })
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
    console.error("[practiceTransferAutoMatch] list failed", error);
    return res.status(500).json({
      success: false,
      message: "기공의뢰 자동매칭 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * PATCH /api/devops/practice-transfer-auto-match/:anchorId
 * body: { enabled: boolean }
 */
export async function patchPracticeTransferAutoMatch(req, res) {
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
      {
        _id: anchorId,
        businessType: "requestor",
        requestorKind: "lab",
      },
      { $set: { practiceTransferAutoMatchEnabled: enabled } },
      {
        new: true,
        projection: {
          name: 1,
          businessNumberNormalized: 1,
          status: 1,
          requestorKind: 1,
          requestorServices: 1,
          requestorCapabilities: 1,
          practiceTransferAutoMatchEnabled: 1,
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
        message: "기공소 사업자를 찾을 수 없습니다.",
      });
    }

    invalidateMyBusinessCache(anchorId);

    return res.json({
      success: true,
      data: toListRow(updated),
    });
  } catch (error) {
    console.error("[practiceTransferAutoMatch] patch failed", error);
    return res.status(500).json({
      success: false,
      message: "기공의뢰 자동매칭 설정 저장 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

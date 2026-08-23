// related files:
// - web/backend/utils/designSoftwareHex.js
// - web/backend/models/businessAnchor.model.js
// - web/backend/models/user.model.js
// - web/backend/modules/admin/admin.routes.js
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx
// change-log:
// - 2026-08-23: ExoCAD 확정 계정도 목록에 포함(보기/수정). pendingCount·confirmedCount 분리.
// - 2026-08-21: pending SSOT = 관리자 hexVerificationResultHex 미확정
// - 2026-08-21: ExoCAD 헥스 확인 진행중 목록·관리자 완료 API

import { Types } from "mongoose";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import User from "../../models/user.model.js";
import Request from "../../models/request.model.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import {
  normalizeExoCadVersion,
  normalizeHexVerificationResultHex,
  isHexVerificationPending,
  resolveAdminVerifiedHexFromSettings,
  HEX_VERIFICATION_RESULT_VALUES,
} from "../../utils/designSoftwareHex.js";

const REQUESTOR_ORG_TYPES = ["requestor", "lab", "internalLab"];

const pickBusinessName = (anchor) => {
  const meta = anchor?.metadata && typeof anchor.metadata === "object"
    ? anchor.metadata
    : {};
  return (
    String(meta.clinicName || "").trim() ||
    String(meta.labName || "").trim() ||
    String(meta.businessName || "").trim() ||
    String(anchor?.name || "").trim() ||
    String(anchor?._id || "")
  );
};

/**
 * ExoCAD BusinessAnchor 목록(진행중 + 확정).
 * pending SSOT: hexVerificationResultHex 없음.
 * GET /api/admin/hex-verification/in-progress
 */
export const listHexVerificationInProgress = asyncHandler(async (_req, res) => {
  const anchors = await BusinessAnchor.find({
    businessType: { $in: REQUESTOR_ORG_TYPES },
    "requestSettings.designSoftware": "ExoCAD",
  })
    .select({
      name: 1,
      metadata: 1,
      businessType: 1,
      requestSettings: 1,
      updatedAt: 1,
    })
    .sort({ updatedAt: -1 })
    .limit(500)
    .lean();

  const anchorIds = (anchors || [])
    .map((a) => a?._id)
    .filter((id) => id && Types.ObjectId.isValid(id));

  const [owners, recentSamples] = await Promise.all([
    anchorIds.length
      ? User.find({
          role: "requestor",
          businessAnchorId: { $in: anchorIds },
          subRole: "owner",
        })
          .select({
            _id: 1,
            name: 1,
            email: 1,
            businessAnchorId: 1,
            "requestSettings.hexVerificationResultHex": 1,
            "requestSettings.hexVerificationCompletedAt": 1,
            "requestSettings.defaultManufacturerHexRotation": 1,
            "requestSettings.designSoftware": 1,
            "requestSettings.exoCadVersion": 1,
          })
          .lean()
      : [],
    anchorIds.length
      ? Request.find({
          businessAnchorId: { $in: anchorIds },
          "caseInfos.hexVerificationSample": true,
          manufacturerStage: { $nin: ["취소"] },
        })
          .select({
            requestId: 1,
            businessAnchorId: 1,
            manufacturerStage: 1,
            createdAt: 1,
          })
          .sort({ createdAt: -1 })
          .lean()
      : [],
  ]);

  const ownerByAnchor = new Map();
  for (const u of owners || []) {
    const key = String(u.businessAnchorId || "");
    if (!key || ownerByAnchor.has(key)) continue;
    ownerByAnchor.set(key, u);
  }

  const sampleByAnchor = new Map();
  for (const sample of recentSamples || []) {
    const key = String(sample.businessAnchorId || "");
    if (!key || sampleByAnchor.has(key)) continue;
    sampleByAnchor.set(key, sample);
  }

  const items = (anchors || [])
    .map((anchor) => {
      const anchorId = String(anchor._id);
      const owner = ownerByAnchor.get(anchorId) || null;
      const sample = sampleByAnchor.get(anchorId) || null;
      const rs = anchor.requestSettings || {};
      const ownerRs = owner?.requestSettings || {};
      const adminVerifiedHex = resolveAdminVerifiedHexFromSettings(
        ownerRs,
        rs,
      );
      const designSoftware =
        String(ownerRs.designSoftware || "").trim() ||
        String(rs.designSoftware || "").trim() ||
        "ExoCAD";
      if (designSoftware !== "ExoCAD") return null;

      const pending = isHexVerificationPending({
        designSoftware,
        adminVerifiedHex,
      });
      const completedAtRaw =
        ownerRs.hexVerificationCompletedAt || rs.hexVerificationCompletedAt;
      const completedAt =
        completedAtRaw instanceof Date
          ? completedAtRaw
          : completedAtRaw
            ? new Date(completedAtRaw)
            : null;

      return {
        businessAnchorId: anchorId,
        businessName: pickBusinessName(anchor),
        businessType: anchor.businessType || null,
        ownerUserId: owner?._id ? String(owner._id) : null,
        ownerName: String(owner?.name || "").trim() || null,
        ownerEmail: String(owner?.email || "").trim() || null,
        designSoftware: "ExoCAD",
        exoCadVersion:
          normalizeExoCadVersion(ownerRs.exoCadVersion) ||
          normalizeExoCadVersion(rs.exoCadVersion),
        status: pending ? "pending" : "confirmed",
        hexVerificationSamplePending: pending,
        manufacturerDefaultHex:
          String(
            ownerRs.defaultManufacturerHexRotation ||
              rs.defaultManufacturerHexRotation ||
              "",
          ).trim() || null,
        adminVerifiedHex,
        completedAt:
          completedAt && !Number.isNaN(completedAt.getTime())
            ? completedAt
            : null,
        sampleRequestId: sample?.requestId || null,
        sampleStage: sample?.manufacturerStage || null,
        sampleCreatedAt: sample?.createdAt || null,
      };
    })
    .filter(Boolean);

  // 진행중(미확정)을 위에, 확정은 완료 시각 최신순.
  items.sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === "pending" ? -1 : 1;
    }
    if (a.status === "confirmed") {
      const aAt = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const bAt = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return bAt - aAt;
    }
    return 0;
  });

  const pendingCount = items.filter((i) => i.status === "pending").length;
  const confirmedCount = items.filter((i) => i.status === "confirmed").length;

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        {
          count: pendingCount,
          pendingCount,
          confirmedCount,
          items,
        },
        "ExoCAD 헥스 확인 목록",
      ),
    );
});

/**
 * 관리자 헥스 확인 완료(또는 확정값 수정).
 * POST /api/admin/hex-verification/:businessAnchorId/complete
 * body: { hexRotation: "STL모델대로" | "헥스30도회전" }
 */
export const completeHexVerification = asyncHandler(async (req, res) => {
  const businessAnchorId = String(req.params.businessAnchorId || "").trim();
  if (!Types.ObjectId.isValid(businessAnchorId)) {
    throw new ApiError(400, "유효하지 않은 사업자 ID입니다.");
  }

  const hexRotation = normalizeHexVerificationResultHex(req.body?.hexRotation);
  if (!hexRotation || !HEX_VERIFICATION_RESULT_VALUES.includes(hexRotation)) {
    throw new ApiError(
      400,
      `hexRotation은 ${HEX_VERIFICATION_RESULT_VALUES.join(" | ")} 중 하나여야 합니다.`,
    );
  }

  const anchor = await BusinessAnchor.findById(businessAnchorId).select({
    name: 1,
    metadata: 1,
    businessType: 1,
    requestSettings: 1,
  });
  if (!anchor) {
    throw new ApiError(404, "사업자를 찾을 수 없습니다.");
  }

  const designSoftware = String(
    anchor.requestSettings?.designSoftware || "",
  ).trim();
  if (designSoftware !== "ExoCAD") {
    throw new ApiError(400, "ExoCAD 계정만 헥스 확인을 완료할 수 있습니다.");
  }

  const now = new Date();
  const actorId = req.user?._id || null;
  const setPayload = {
    "requestSettings.hexVerificationResultHex": hexRotation,
    "requestSettings.hexVerificationCompletedAt": now,
    "requestSettings.hexVerificationCompletedBy": actorId,
    "requestSettings.updatedAt": now,
  };

  await BusinessAnchor.updateOne(
    { _id: anchor._id },
    { $set: setPayload },
  );

  const owners = await User.find({
    role: "requestor",
    businessAnchorId: anchor._id,
    subRole: "owner",
  }).select({ _id: 1 });

  if (owners.length) {
    await User.updateMany(
      { _id: { $in: owners.map((u) => u._id) } },
      { $set: setPayload },
    );
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        businessAnchorId: String(anchor._id),
        businessName: pickBusinessName(anchor),
        hexRotation,
        completedAt: now,
        completedBy: actorId ? String(actorId) : null,
        updatedOwnerCount: owners.length,
      },
      "헥스 확인이 저장되었습니다.",
    ),
  );
});

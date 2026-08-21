// related files:
// - web/backend/utils/designSoftwareHex.js
// - web/backend/models/businessAnchor.model.js
// - web/backend/models/user.model.js
// - web/backend/modules/admin/admin.routes.js
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx
// change-log:
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
 * ExoCAD 설정 + 관리자 헥스 확인 미완료 BusinessAnchor 목록.
 * GET /api/admin/hex-verification/in-progress
 */
export const listHexVerificationInProgress = asyncHandler(async (_req, res) => {
  const anchors = await BusinessAnchor.find({
    businessType: { $in: REQUESTOR_ORG_TYPES },
    "requestSettings.designSoftware": "ExoCAD",
    $or: [
      { "requestSettings.hexVerificationCompletedAt": null },
      { "requestSettings.hexVerificationCompletedAt": { $exists: false } },
    ],
  })
    .select({
      name: 1,
      metadata: 1,
      businessType: 1,
      requestSettings: 1,
      updatedAt: 1,
    })
    .sort({ updatedAt: -1 })
    .limit(200)
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
            "requestSettings.hexVerificationSamplePending": 1,
            "requestSettings.hexVerificationResultHex": 1,
            "requestSettings.defaultManufacturerHexRotation": 1,
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

  const items = (anchors || []).map((anchor) => {
    const anchorId = String(anchor._id);
    const owner = ownerByAnchor.get(anchorId) || null;
    const sample = sampleByAnchor.get(anchorId) || null;
    const rs = anchor.requestSettings || {};
    const ownerRs = owner?.requestSettings || {};
    const pending =
      ownerRs.hexVerificationSamplePending === true ||
      rs.hexVerificationSamplePending === true;

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
      hexVerificationSamplePending: pending,
      manufacturerDefaultHex:
        String(
          ownerRs.defaultManufacturerHexRotation ||
            rs.defaultManufacturerHexRotation ||
            "",
        ).trim() || null,
      adminVerifiedHex:
        normalizeHexVerificationResultHex(ownerRs.hexVerificationResultHex) ||
        normalizeHexVerificationResultHex(rs.hexVerificationResultHex),
      sampleRequestId: sample?.requestId || null,
      sampleStage: sample?.manufacturerStage || null,
      sampleCreatedAt: sample?.createdAt || null,
    };
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { count: items.length, items },
        "헥스 확인 진행중 목록",
      ),
    );
});

/**
 * 관리자 헥스 확인 완료.
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
      "헥스 확인이 완료되었습니다.",
    ),
  );
});

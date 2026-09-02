// related files:
// - web/backend/utils/designSoftwareHex.js
// - web/backend/models/user.model.js
// - web/backend/modules/admin/admin.routes.js
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx
// change-log:
// - 2026-09-03: ExoCAD 3.0 이하 User를 BA 카드로 그룹. 임플란트 제조사별 applyHex30/확정 API.
// - 2026-08-25: 관리자 확정 → 미확인(pending) 되돌리기 API
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
  CNC_HEX_IMPLANT_MANUFACTURERS,
  EXOCAD_VERSION_LE_3_0,
  HEX_VERIFICATION_RESULT_VALUES,
  findHexByImplantManufacturerEntry,
  hexModeFromApplyHex30,
  normalizeExoCadVersion,
  normalizeHexVerificationResultHex,
  normalizeImplantManufacturerKey,
  upsertHexByImplantManufacturerRow,
} from "../../utils/designSoftwareHex.js";

const REQUESTOR_ROLES = ["requestor", "internalLab"];

const pickBusinessName = (anchor) => {
  const meta =
    anchor?.metadata && typeof anchor.metadata === "object"
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

const buildManufacturerStatusRows = (userRs, sampleByManufacturer) => {
  const legacyVerified = normalizeHexVerificationResultHex(
    userRs?.hexVerificationResultHex,
  );
  return CNC_HEX_IMPLANT_MANUFACTURERS.map((manufacturer) => {
    const entry = findHexByImplantManufacturerEntry(userRs, manufacturer);
    const verifiedHex =
      normalizeHexVerificationResultHex(entry?.verifiedHex) || legacyVerified;
    const applyHex30 =
      entry && typeof entry.applyHex30 === "boolean" ? entry.applyHex30 : true;
    const sample = sampleByManufacturer.get(manufacturer) || null;
    const status = verifiedHex ? "confirmed" : "pending";
    return {
      manufacturer,
      applyHex30,
      verifiedHex,
      status,
      verifiedAt: entry?.verifiedAt || null,
      samplePending: status === "pending" && Boolean(sample),
      sampleRequestId: sample?.requestId || null,
      sampleStage: sample?.manufacturerStage || null,
      sampleCreatedAt: sample?.createdAt || null,
      seedHex: verifiedHex || hexModeFromApplyHex30(applyHex30),
    };
  });
};

/**
 * ExoCAD 3.0 이하 사용자를 BA별로 그룹.
 * GET /api/admin/hex-verification/in-progress
 */
export const listHexVerificationInProgress = asyncHandler(async (_req, res) => {
  const users = await User.find({
    role: { $in: REQUESTOR_ROLES },
    "requestSettings.designSoftware": "ExoCAD",
    $or: [
      { "requestSettings.exoCadVersion": EXOCAD_VERSION_LE_3_0 },
      { "requestSettings.exoCadVersion": { $exists: false } },
      { "requestSettings.exoCadVersion": null },
      { "requestSettings.exoCadVersion": "" },
    ],
  })
    .select({
      _id: 1,
      name: 1,
      email: 1,
      role: 1,
      subRole: 1,
      businessAnchorId: 1,
      requestSettings: 1,
      updatedAt: 1,
    })
    .sort({ updatedAt: -1 })
    .limit(1000)
    .lean();

  const le30Users = (users || []).filter((u) => {
    const v = normalizeExoCadVersion(u?.requestSettings?.exoCadVersion);
    // 미지정도 레거시 3.0 취급
    return v !== "ge_3_2";
  });

  const anchorIds = [
    ...new Set(
      le30Users
        .map((u) => String(u.businessAnchorId || "").trim())
        .filter((id) => id && Types.ObjectId.isValid(id)),
    ),
  ];

  const userIds = le30Users.map((u) => u._id).filter(Boolean);

  const [anchors, recentSamples] = await Promise.all([
    anchorIds.length
      ? BusinessAnchor.find({ _id: { $in: anchorIds } })
          .select({ name: 1, metadata: 1, businessType: 1, updatedAt: 1 })
          .lean()
      : [],
    userIds.length
      ? Request.find({
          requestor: { $in: userIds },
          "caseInfos.hexVerificationSample": true,
          manufacturerStage: { $nin: ["취소"] },
        })
          .select({
            requestId: 1,
            requestor: 1,
            manufacturerStage: 1,
            createdAt: 1,
            "caseInfos.implantManufacturer": 1,
            "caseInfos.hexVerificationSampleManufacturer": 1,
          })
          .sort({ createdAt: -1 })
          .lean()
      : [],
  ]);

  const anchorById = new Map(
    (anchors || []).map((a) => [String(a._id), a]),
  );

  /** userId|manufacturer → latest sample */
  const sampleByUserManufacturer = new Map();
  for (const sample of recentSamples || []) {
    const uid = String(sample.requestor || "");
    const mfr = normalizeImplantManufacturerKey(
      sample?.caseInfos?.hexVerificationSampleManufacturer ||
        sample?.caseInfos?.implantManufacturer,
    );
    if (!uid || !mfr) continue;
    const key = `${uid}|${mfr}`;
    if (sampleByUserManufacturer.has(key)) continue;
    sampleByUserManufacturer.set(key, sample);
  }

  const groups = new Map();
  for (const user of le30Users) {
    const anchorId = String(user.businessAnchorId || "").trim() || "none";
    if (!groups.has(anchorId)) groups.set(anchorId, []);
    groups.get(anchorId).push(user);
  }

  const items = [];
  let pendingManufacturerCount = 0;
  let confirmedManufacturerCount = 0;

  for (const [anchorId, groupUsers] of groups.entries()) {
    const anchor = anchorId !== "none" ? anchorById.get(anchorId) : null;
    const employees = groupUsers.map((user) => {
      const uid = String(user._id);
      const sampleMap = new Map();
      for (const mfr of CNC_HEX_IMPLANT_MANUFACTURERS) {
        const sample = sampleByUserManufacturer.get(`${uid}|${mfr}`);
        if (sample) sampleMap.set(mfr, sample);
      }
      const manufacturers = buildManufacturerStatusRows(
        user.requestSettings,
        sampleMap,
      );
      for (const row of manufacturers) {
        if (row.status === "pending") pendingManufacturerCount += 1;
        else confirmedManufacturerCount += 1;
      }
      const pendingCount = manufacturers.filter(
        (m) => m.status === "pending",
      ).length;
      return {
        userId: uid,
        name: String(user.name || "").trim() || null,
        email: String(user.email || "").trim() || null,
        role: user.role || null,
        subRole: user.subRole || null,
        designSoftware: "ExoCAD",
        exoCadVersion:
          normalizeExoCadVersion(user.requestSettings?.exoCadVersion) ||
          EXOCAD_VERSION_LE_3_0,
        pendingManufacturerCount: pendingCount,
        status: pendingCount > 0 ? "pending" : "confirmed",
        manufacturers,
      };
    });

    employees.sort((a, b) => {
      if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
      return String(a.name || "").localeCompare(String(b.name || ""), "ko");
    });

    const pendingUsers = employees.filter((e) => e.status === "pending").length;
    items.push({
      businessAnchorId: anchorId === "none" ? null : anchorId,
      businessName: anchor ? pickBusinessName(anchor) : "소속 없음",
      businessType: anchor?.businessType || null,
      employeeCount: employees.length,
      pendingUserCount: pendingUsers,
      status: pendingUsers > 0 ? "pending" : "confirmed",
      employees,
    });
  }

  items.sort((a, b) => {
    if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
    return String(a.businessName || "").localeCompare(
      String(b.businessName || ""),
      "ko",
    );
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        count: pendingManufacturerCount,
        pendingCount: pendingManufacturerCount,
        confirmedCount: confirmedManufacturerCount,
        businessCount: items.length,
        manufacturers: [...CNC_HEX_IMPLANT_MANUFACTURERS],
        items,
      },
      "ExoCAD 3.0 이하 헥스 관리 목록",
    ),
  );
});

/**
 * 임플란트 제조사별 applyHex30 토글 (관리자).
 * POST /api/admin/hex-verification/users/:userId/manufacturers/:manufacturer/apply-hex30
 * body: { applyHex30: boolean }
 */
export const updateHexApplyHex30 = asyncHandler(async (req, res) => {
  const userId = String(req.params.userId || "").trim();
  const manufacturer = normalizeImplantManufacturerKey(req.params.manufacturer);
  if (!Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "유효하지 않은 사용자 ID입니다.");
  }
  if (!manufacturer || !CNC_HEX_IMPLANT_MANUFACTURERS.includes(manufacturer)) {
    throw new ApiError(400, "유효하지 않은 임플란트 제조사입니다.");
  }
  if (typeof req.body?.applyHex30 !== "boolean") {
    throw new ApiError(400, "applyHex30는 boolean이어야 합니다.");
  }

  const user = await User.findById(userId).select({
    role: 1,
    requestSettings: 1,
  });
  if (!user) throw new ApiError(404, "사용자를 찾을 수 없습니다.");
  if (!REQUESTOR_ROLES.includes(String(user.role || ""))) {
    throw new ApiError(400, "의뢰자·기공소 계정만 관리할 수 있습니다.");
  }

  const rows = upsertHexByImplantManufacturerRow(
    user.requestSettings?.hexByImplantManufacturer,
    manufacturer,
    { applyHex30: req.body.applyHex30 },
  );
  user.requestSettings = user.requestSettings || {};
  user.requestSettings.hexByImplantManufacturer = rows;
  user.requestSettings.updatedAt = new Date();
  user.markModified("requestSettings");
  await user.save();

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        userId,
        manufacturer,
        applyHex30: req.body.applyHex30,
        seedHex: hexModeFromApplyHex30(req.body.applyHex30),
      },
      "헥스 30° 적용 설정이 저장되었습니다.",
    ),
  );
});

/**
 * 사용자×임플란트 제조사 헥스 확정.
 * POST /api/admin/hex-verification/users/:userId/manufacturers/:manufacturer/complete
 * body: { hexRotation: "STL모델대로" | "헥스30도회전" }
 */
export const completeHexVerificationForManufacturer = asyncHandler(
  async (req, res) => {
    const userId = String(req.params.userId || "").trim();
    const manufacturer = normalizeImplantManufacturerKey(
      req.params.manufacturer,
    );
    if (!Types.ObjectId.isValid(userId)) {
      throw new ApiError(400, "유효하지 않은 사용자 ID입니다.");
    }
    if (!manufacturer || !CNC_HEX_IMPLANT_MANUFACTURERS.includes(manufacturer)) {
      throw new ApiError(400, "유효하지 않은 임플란트 제조사입니다.");
    }

    const hexRotation = normalizeHexVerificationResultHex(req.body?.hexRotation);
    if (!hexRotation || !HEX_VERIFICATION_RESULT_VALUES.includes(hexRotation)) {
      throw new ApiError(
        400,
        `hexRotation은 ${HEX_VERIFICATION_RESULT_VALUES.join(" | ")} 중 하나여야 합니다.`,
      );
    }

    const user = await User.findById(userId).select({
      role: 1,
      name: 1,
      requestSettings: 1,
    });
    if (!user) throw new ApiError(404, "사용자를 찾을 수 없습니다.");
    if (!REQUESTOR_ROLES.includes(String(user.role || ""))) {
      throw new ApiError(400, "의뢰자·기공소 계정만 관리할 수 있습니다.");
    }

    const now = new Date();
    const actorId = req.user?._id || null;
    const applyHex30 = hexRotation === "헥스30도회전";
    const rows = upsertHexByImplantManufacturerRow(
      user.requestSettings?.hexByImplantManufacturer,
      manufacturer,
      {
        applyHex30,
        verifiedHex: hexRotation,
        verifiedAt: now,
        verifiedBy: actorId,
      },
    );
    user.requestSettings = user.requestSettings || {};
    user.requestSettings.hexByImplantManufacturer = rows;
    user.requestSettings.updatedAt = now;
    user.markModified("requestSettings");
    await user.save();

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          userId,
          manufacturer,
          hexRotation,
          completedAt: now,
          completedBy: actorId ? String(actorId) : null,
        },
        "헥스 확인이 저장되었습니다.",
      ),
    );
  },
);

/**
 * 사용자×임플란트 제조사 확정 되돌리기.
 * POST /api/admin/hex-verification/users/:userId/manufacturers/:manufacturer/revert
 */
export const revertHexVerificationForManufacturer = asyncHandler(
  async (req, res) => {
    const userId = String(req.params.userId || "").trim();
    const manufacturer = normalizeImplantManufacturerKey(
      req.params.manufacturer,
    );
    if (!Types.ObjectId.isValid(userId)) {
      throw new ApiError(400, "유효하지 않은 사용자 ID입니다.");
    }
    if (!manufacturer || !CNC_HEX_IMPLANT_MANUFACTURERS.includes(manufacturer)) {
      throw new ApiError(400, "유효하지 않은 임플란트 제조사입니다.");
    }

    const user = await User.findById(userId).select({
      role: 1,
      requestSettings: 1,
    });
    if (!user) throw new ApiError(404, "사용자를 찾을 수 없습니다.");
    if (!REQUESTOR_ROLES.includes(String(user.role || ""))) {
      throw new ApiError(400, "의뢰자·기공소 계정만 관리할 수 있습니다.");
    }

    const now = new Date();
    const rows = upsertHexByImplantManufacturerRow(
      user.requestSettings?.hexByImplantManufacturer,
      manufacturer,
      {
        verifiedHex: null,
        verifiedAt: null,
        verifiedBy: null,
      },
    );
    user.requestSettings = user.requestSettings || {};
    user.requestSettings.hexByImplantManufacturer = rows;
    // 레거시 계정 단일 확정이 있으면 제조사별 미확정이 가려지므로 제거
    if (user.requestSettings.hexVerificationResultHex) {
      user.requestSettings.hexVerificationResultHex = null;
      user.requestSettings.hexVerificationCompletedAt = null;
      user.requestSettings.hexVerificationCompletedBy = null;
    }
    user.requestSettings.updatedAt = now;
    user.markModified("requestSettings");
    await user.save();

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          userId,
          manufacturer,
          status: "pending",
        },
        "헥스 확인이 미확인으로 되돌려졌습니다.",
      ),
    );
  },
);

/**
 * @deprecated BA 단위 확정 — 하위 호환. 새 UI는 manufacturer complete 사용.
 */
export const completeHexVerification = asyncHandler(async (req, res) => {
  throw new ApiError(
    410,
    "사업자 단위 헥스 확정은 폐기되었습니다. 사용자·임플란트 제조사별 확정 API를 사용하세요.",
  );
});

/**
 * @deprecated
 */
export const revertHexVerification = asyncHandler(async (req, res) => {
  throw new ApiError(
    410,
    "사업자 단위 헥스 되돌리기는 폐기되었습니다. 사용자·임플란트 제조사별 되돌리기 API를 사용하세요.",
  );
});

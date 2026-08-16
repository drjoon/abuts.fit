// related files:
// - web/backend/utils/practiceTransferAutoMatch.js
// - web/backend/utils/abutsLabCertification.js
// - web/backend/models/businessAnchor.model.js
// - web/backend/modules/devops/practiceTransferAutoMatch.routes.js
// - web/backend/services/labAutoMatchParticipation.service.js
// change-log:
// - 2026-08-16: certFilter 5단(미신청/신청중/테스트중/인증/인증보류).
// - 2026-08-16: 인증 신청·테스트·메모 필드 + 관리자 패치.
// - 2026-08-16: certFilter(미신청/테스트중/인증) 목록 필터.
import { Types } from "mongoose";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import {
  isPracticeTransferAutoMatchEnabled,
  verifiedLabCapableAnchorFilter,
} from "../../utils/practiceTransferAutoMatch.js";
import { toAbutsLabCertificationApi } from "../../utils/abutsLabCertification.js";
import {
  canReceivePracticeTransfer,
  legacyCapabilitiesFromProfile,
  requestorProfilePersistFields,
  resolveRequestorProfile,
} from "../../utils/requestorCapabilities.js";
import { invalidateMyBusinessCache } from "../businesses/business.controller.js";
import { applyAdminAbutsLabCertificationPatch } from "../../services/labAutoMatchParticipation.service.js";

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
    businessType: row.businessType || "",
    requestorKind: row.requestorKind || profile.kind || "",
    representativeName: String(row?.metadata?.representativeName || "").trim(),
    address: formatAddress(row?.metadata),
    practiceTransferAutoMatchEnabled: isPracticeTransferAutoMatchEnabled(row),
    abutsLabCertification: toAbutsLabCertificationApi(row),
    canReceivePracticeTransfer:
      String(row.businessType || "").trim() === "internalLab" ||
      canReceivePracticeTransfer(profile),
    verified: String(row.status || "").trim() === "verified",
  };
};

/**
 * GET /api/devops/practice-transfer-auto-match?q=&certFilter=none|testing|certified&page=1&limit=15
 * 기공소 목록 + 어벗츠 인증/테스트 상태
 */
export async function listPracticeTransferAutoMatch(req, res) {
  try {
    const q = String(req.query?.q || "").trim();
    const certFilter = String(req.query?.certFilter || req.query?.status || "")
      .trim()
      .toLowerCase();
    const page = Math.max(1, Number.parseInt(String(req.query?.page || "1"), 10) || 1);
    const rawLimit = Number.parseInt(String(req.query?.limit || PAGE_LIMIT_DEFAULT), 10);
    const limit = Math.min(
      PAGE_LIMIT_MAX,
      Math.max(1, Number.isFinite(rawLimit) ? rawLimit : PAGE_LIMIT_DEFAULT),
    );
    const skip = (page - 1) * limit;

    const filter = {
      ...verifiedLabCapableAnchorFilter(),
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

    // 미신청 | 신청중 | 테스트중 | 인증 | 인증보류
    if (certFilter === "none" || certFilter === "미신청") {
      filter.$and = [
        ...(Array.isArray(filter.$and) ? filter.$and : []),
        {
          $or: [
            { "abutsLabCertification.status": "none" },
            { "abutsLabCertification.status": { $exists: false } },
            { "abutsLabCertification.status": null },
            { "abutsLabCertification.status": "" },
          ],
        },
        {
          $or: [
            { practiceTransferAutoMatchEnabled: { $ne: true } },
            { practiceTransferAutoMatchEnabled: { $exists: false } },
          ],
        },
      ];
    } else if (certFilter === "applied" || certFilter === "신청중") {
      filter.$and = [
        ...(Array.isArray(filter.$and) ? filter.$and : []),
        { "abutsLabCertification.status": "applied" },
        {
          $or: [
            { practiceTransferAutoMatchEnabled: { $ne: true } },
            { practiceTransferAutoMatchEnabled: { $exists: false } },
          ],
        },
      ];
    } else if (certFilter === "testing" || certFilter === "테스트중") {
      filter.$and = [
        ...(Array.isArray(filter.$and) ? filter.$and : []),
        { "abutsLabCertification.status": "testing" },
        {
          $or: [
            { practiceTransferAutoMatchEnabled: { $ne: true } },
            { practiceTransferAutoMatchEnabled: { $exists: false } },
          ],
        },
      ];
    } else if (certFilter === "rejected" || certFilter === "인증보류") {
      filter.$and = [
        ...(Array.isArray(filter.$and) ? filter.$and : []),
        { "abutsLabCertification.status": "rejected" },
        {
          $or: [
            { practiceTransferAutoMatchEnabled: { $ne: true } },
            { practiceTransferAutoMatchEnabled: { $exists: false } },
          ],
        },
      ];
    } else if (certFilter === "certified" || certFilter === "인증") {
      filter.$and = [
        ...(Array.isArray(filter.$and) ? filter.$and : []),
        {
          $or: [
            { "abutsLabCertification.status": "certified" },
            { practiceTransferAutoMatchEnabled: true },
          ],
        },
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
          abutsLabCertification: 1,
          businessType: 1,
          "metadata.companyName": 1,
          "metadata.representativeName": 1,
          "metadata.address": 1,
          "metadata.addressDetail": 1,
        })
        .sort({
          "abutsLabCertification.status": -1,
          practiceTransferAutoMatchEnabled: -1,
          status: -1,
          name: 1,
        })
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
      message: "인증 기공소 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * PATCH /api/devops/practice-transfer-auto-match/:anchorId
 * body: { enabled?: boolean, status?: string, testStatus?: string, memo?: string }
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

    const body = req.body || {};
    const hasEnabled = typeof body.enabled === "boolean";
    const hasStatus = body.status != null && String(body.status).trim() !== "";
    const hasTest =
      body.testStatus != null && String(body.testStatus).trim() !== "";
    const hasMemo = body.memo !== undefined;
    if (!hasEnabled && !hasStatus && !hasTest && !hasMemo) {
      return res.status(400).json({
        success: false,
        message: "enabled, status, testStatus, memo 중 하나 이상이 필요합니다.",
      });
    }

    const existing = await BusinessAnchor.findOne({
      _id: anchorId,
      ...verifiedLabCapableAnchorFilter(),
    })
      .select({
        status: 1,
        businessType: 1,
        requestorKind: 1,
        requestorServices: 1,
        requestorCapabilities: 1,
        practiceTransferAutoMatchEnabled: 1,
        abutsLabCertification: 1,
        autoMatchParticipationCancelAtPeriodEnd: 1,
        autoMatchParticipationNextBillingAt: 1,
        autoMatchParticipationStartedAt: 1,
      })
      .lean();

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "기공소 사업자를 찾을 수 없습니다.",
      });
    }

    const enabling =
      (hasEnabled && body.enabled === true) ||
      String(body.status || "").trim() === "certified" ||
      String(body.testStatus || "").trim() === "passed";

    if (enabling && String(existing.status || "").trim() !== "verified") {
      return res.status(400).json({
        success: false,
        message: "검증된 기공소만 인증할 수 있습니다.",
      });
    }

    const profile = resolveRequestorProfile({
      anchorKind: existing.requestorKind,
      anchorServices: existing.requestorServices,
      anchorCaps: existing.requestorCapabilities,
      businessVerified: true,
    });

    if (enabling) {
      const isInternalLab =
        String(existing.businessType || "").trim() === "internalLab";
      if (!isInternalLab && !canReceivePracticeTransfer(profile)) {
        return res.status(400).json({
          success: false,
          message: "기공의뢰를 수신할 수 있는 기공소만 인증할 수 있습니다.",
        });
      }
    }

    await applyAdminAbutsLabCertificationPatch(existing, {
      enabled: hasEnabled ? Boolean(body.enabled) : undefined,
      status: hasStatus ? body.status : undefined,
      testStatus: hasTest ? body.testStatus : undefined,
      memo: hasMemo ? body.memo : undefined,
    });

    if (enabling && !String(existing.requestorKind || "").trim()) {
      await BusinessAnchor.updateOne(
        { _id: anchorId },
        {
          $set: {
            ...requestorProfilePersistFields(profile),
            requestorCapabilities: legacyCapabilitiesFromProfile(profile),
          },
        },
      );
    }

    const updated = await BusinessAnchor.findOne({
      _id: anchorId,
      ...verifiedLabCapableAnchorFilter(),
    })
      .select({
        name: 1,
        businessNumberNormalized: 1,
        status: 1,
        requestorKind: 1,
        requestorServices: 1,
        requestorCapabilities: 1,
        practiceTransferAutoMatchEnabled: 1,
        abutsLabCertification: 1,
        businessType: 1,
        "metadata.companyName": 1,
        "metadata.representativeName": 1,
        "metadata.address": 1,
        "metadata.addressDetail": 1,
      })
      .lean();

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
      message: "인증 기공소 설정 저장 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

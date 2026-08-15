// related files:
// - web/backend/utils/practiceTransferStage.js
// - web/backend/utils/practiceTransferAutoMatch.js
// - web/backend/controllers/requests/dashboard.controller.js
// - web/frontend/src/pages/requestor/dashboard/RequestorDashboardPage.tsx
import { Types } from "mongoose";
import PracticeTransfer from "../models/practiceTransfer.model.js";
import User from "../models/user.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";
import {
  buildReceivedScopeWithAutoMatch,
  isLabAnchorAutoMatchEligible,
} from "../utils/practiceTransferAutoMatch.js";
import { resolveRequestorProfile } from "../utils/requestorCapabilities.js";
import {
  emptyPracticeTransferDashboardStats,
  resolvePracticeTransferManufacturerStage,
  toPracticeTransferDashboardBucket,
} from "../utils/practiceTransferStage.js";
import { toKstYmd } from "../controllers/requests/utils.js";

export { emptyPracticeTransferDashboardStats };
const buildCreatedAtDateFilter = (period) => {
  const now = new Date();
  const normalized = String(period || "30d").trim() || "30d";

  if (!normalized || normalized === "all") return {};

  if (normalized === "thisMonth" || normalized === "lastMonth") {
    const nowKst = toKstYmd(now);
    const [year, month] = nowKst.split("-").map(Number);
    const startOfThisMonth = new Date(
      `${year}-${String(month).padStart(2, "0")}-01T00:00:00+09:00`,
    );
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const startOfNextMonth = new Date(
      `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00+09:00`,
    );

    if (normalized === "thisMonth") {
      return { createdAt: { $gte: startOfThisMonth, $lt: startOfNextMonth } };
    }

    const lastMonth = month === 1 ? 12 : month - 1;
    const lastYear = month === 1 ? year - 1 : year;
    const startOfLastMonth = new Date(
      `${lastYear}-${String(lastMonth).padStart(2, "0")}-01T00:00:00+09:00`,
    );
    return { createdAt: { $gte: startOfLastMonth, $lt: startOfThisMonth } };
  }

  let days = 30;
  if (normalized === "7d") days = 7;
  else if (normalized === "90d") days = 90;

  const todayKst = toKstYmd(now);
  const fromDate = new Date(todayKst);
  fromDate.setDate(fromDate.getDate() - days);
  const fromKst = new Date(`${toKstYmd(fromDate)}T00:00:00+09:00`);
  return { createdAt: { $gte: fromKst } };
};

const resolvePracticePeerUserIds = async (anchorId) => {
  const raw = String(anchorId || "").trim();
  if (!raw || !Types.ObjectId.isValid(raw)) return [];

  const users = await User.find({
    businessAnchorId: new Types.ObjectId(raw),
    role: { $in: ["practice", "requestor"] },
    active: true,
  })
    .select({ _id: 1 })
    .lean();

  return users
    .map((u) => String(u?._id || "").trim())
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));
};

const buildPracticeOwnedScope = async (businessAnchorId) => {
  const anchorId = String(businessAnchorId || "").trim();
  if (!anchorId || !Types.ObjectId.isValid(anchorId)) return null;

  const practiceUserObjectIds = await resolvePracticePeerUserIds(anchorId);
  return {
    $or: [
      { practiceBusinessAnchorId: new Types.ObjectId(anchorId) },
      {
        practiceBusinessAnchorId: null,
        practiceUserId: {
          $in: practiceUserObjectIds.length ? practiceUserObjectIds : [],
        },
      },
    ],
  };
};

const buildLabReceivedScope = async (businessAnchorId) => {
  const labAnchorId = String(businessAnchorId || "").trim();
  if (!labAnchorId || !Types.ObjectId.isValid(labAnchorId)) return null;

  const autoMatchEligible = await isLabAnchorAutoMatchEligible(labAnchorId);
  return buildReceivedScopeWithAutoMatch({
    labAnchorId,
    autoMatchEligible,
  });
};

/**
 * 의뢰자 대시보드 기공 행 집계.
 * practice=발신(내 치과 앵커), lab=수신(내 기공소 앵커 + 자동매칭 공개 풀).
 */
export async function getPracticeTransferDashboardStats({
  businessAnchorId,
  period = "30d",
  kind = null,
} = {}) {
  const empty = emptyPracticeTransferDashboardStats();
  const anchorId = String(businessAnchorId || "").trim();
  if (!anchorId || !Types.ObjectId.isValid(anchorId)) return empty;

  let resolvedKind = kind === "practice" || kind === "lab" ? kind : null;
  if (!resolvedKind) {
    const anchor = await BusinessAnchor.findById(anchorId)
      .select({
        status: 1,
        requestorKind: 1,
        requestorServices: 1,
        requestorCapabilities: 1,
      })
      .lean();
    resolvedKind =
      resolveRequestorProfile({
        anchorKind: anchor?.requestorKind,
        anchorServices: anchor?.requestorServices,
        anchorCaps: anchor?.requestorCapabilities,
        businessVerified: String(anchor?.status || "").trim() === "verified",
      })?.kind || null;
  }

  if (resolvedKind !== "practice" && resolvedKind !== "lab") {
    return empty;
  }

  const ownershipScope =
    resolvedKind === "lab"
      ? await buildLabReceivedScope(anchorId)
      : await buildPracticeOwnedScope(anchorId);

  if (!ownershipScope) return empty;

  const dateFilter = buildCreatedAtDateFilter(period);
  const docs = await PracticeTransfer.find({
    $and: [ownershipScope, dateFilter],
  })
    .select({
      status: 1,
      matchingMode: 1,
      autoMatch: 1,
      production: 1,
      requestorDownloadedAt: 1,
      requestorReadAt: 1,
      workCanceledAt: 1,
      targetLabAnchorId: 1,
      labRejectedAt: 1,
      labRejectedByLabAnchorId: 1,
    })
    .lean();

  const stats = emptyPracticeTransferDashboardStats();
  const stageOptions =
    resolvedKind === "lab" ? { viewerLabAnchorId: anchorId } : {};
  for (const doc of docs) {
    const stage = resolvePracticeTransferManufacturerStage(doc, stageOptions);
    const bucket = toPracticeTransferDashboardBucket(stage);
    if (!bucket) continue;
    stats[bucket] += 1;
  }

  return stats;
}

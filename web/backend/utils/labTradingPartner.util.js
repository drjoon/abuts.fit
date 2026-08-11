// related files:
// - web/backend/rules.md
// - web/backend/models/labTradingPartner.model.js
// - web/backend/controllers/requests/utils.js
// - web/backend/utils/labFeeSchedule.js
import crypto from "crypto";
import { Types } from "mongoose";
import LabTradingPartner from "../models/labTradingPartner.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";
import { resolveRequestorPricingBaseDate } from "../controllers/requests/utils.js";
import { toKstYmd } from "./krBusinessDays.js";
import { LAB_TRADING_PARTNER_WINDOW_DAYS } from "./labFeeSchedule.js";
import { normalizeRequestorKind } from "./requestorCapabilities.js";

function diffKstDays(fromDate, toDate = new Date()) {
  const startYmd = toKstYmd(fromDate);
  const todayYmd = toKstYmd(toDate);
  if (!startYmd || !todayYmd) return null;
  const start = new Date(`${startYmd}T00:00:00+09:00`);
  const today = new Date(`${todayYmd}T00:00:00+09:00`);
  const diffMs = today.getTime() - start.getTime();
  if (!Number.isFinite(diffMs)) return null;
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export async function resolveLabTradingPartnerWindow({ labAnchorId }) {
  const baseDate = await resolveRequestorPricingBaseDate({
    requestorOrgId: labAnchorId,
  });
  const elapsedDays = baseDate ? diffKstDays(baseDate) : null;
  const remainingDays =
    elapsedDays == null
      ? null
      : Math.max(0, LAB_TRADING_PARTNER_WINDOW_DAYS - elapsedDays);
  return {
    pricingBaseDate: baseDate,
    elapsedDays,
    remainingDays,
    windowDays: LAB_TRADING_PARTNER_WINDOW_DAYS,
    canInvite: remainingDays != null && remainingDays > 0,
  };
}

export function createInviteToken() {
  return crypto.randomBytes(24).toString("hex");
}

export async function assertLabAnchor(labAnchorId) {
  const id = String(labAnchorId || "").trim();
  if (!id || !Types.ObjectId.isValid(id)) return null;
  const anchor = await BusinessAnchor.findById(id)
    .select({
      _id: 1,
      businessType: 1,
      requestorKind: 1,
      name: 1,
      status: 1,
      labFeeSchedule: 1,
    })
    .lean();
  if (!anchor) return null;
  if (String(anchor.businessType || "") !== "requestor") return null;
  if (normalizeRequestorKind(anchor.requestorKind) !== "lab") return null;
  return anchor;
}

export async function findActiveTradingPartner({
  labAnchorId,
  practiceAnchorId,
}) {
  const labId = String(labAnchorId || "").trim();
  const practiceId = String(practiceAnchorId || "").trim();
  if (
    !labId ||
    !practiceId ||
    !Types.ObjectId.isValid(labId) ||
    !Types.ObjectId.isValid(practiceId)
  ) {
    return null;
  }
  return LabTradingPartner.findOne({
    labAnchorId: new Types.ObjectId(labId),
    practiceAnchorId: new Types.ObjectId(practiceId),
    status: "active",
  }).lean();
}

/**
 * 사업자 검증 완료 시 초대 토큰 → active 바인딩.
 */
export async function activateLabTradingPartnerInvite({
  inviteToken,
  practiceAnchorId,
  practiceKind,
}) {
  const token = String(inviteToken || "").trim();
  const practiceId = String(practiceAnchorId || "").trim();
  if (!token || !practiceId || !Types.ObjectId.isValid(practiceId)) {
    return { activated: false, reason: "invalid_input" };
  }
  if (practiceKind && practiceKind !== "practice") {
    return { activated: false, reason: "not_practice" };
  }

  const invite = await LabTradingPartner.findOne({ inviteToken: token });
  if (!invite) return { activated: false, reason: "invite_not_found" };
  if (invite.status === "canceled" || invite.status === "expired") {
    return { activated: false, reason: `invite_${invite.status}` };
  }
  if (invite.status === "active") {
    if (
      invite.practiceAnchorId &&
      String(invite.practiceAnchorId) === practiceId
    ) {
      return { activated: true, reason: "already_active", partner: invite };
    }
    return { activated: false, reason: "invite_already_bound" };
  }

  const existing = await LabTradingPartner.findOne({
    labAnchorId: invite.labAnchorId,
    practiceAnchorId: new Types.ObjectId(practiceId),
    status: "active",
    _id: { $ne: invite._id },
  }).lean();
  if (existing) {
    return { activated: false, reason: "already_partner_with_lab" };
  }

  invite.practiceAnchorId = new Types.ObjectId(practiceId);
  invite.status = "active";
  invite.activatedAt = new Date();
  await invite.save();
  return { activated: true, reason: "activated", partner: invite };
}

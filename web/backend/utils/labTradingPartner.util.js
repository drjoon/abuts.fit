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

/**
 * 거래 치과 등록 기능 출시일(KST).
 * 가입일이 이보다 이르면 창 시작일을 출시일로 올려, 기존 기공소도 30일을 받는다.
 */
export const LAB_TRADING_PARTNER_FEATURE_START_YMD = "2026-08-11";

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

function laterKstYmd(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return a >= b ? a : b;
}

export async function resolveLabTradingPartnerWindow({ labAnchorId }) {
  const pricingBaseDate = await resolveRequestorPricingBaseDate({
    requestorOrgId: labAnchorId,
  });
  const pricingYmd = pricingBaseDate ? toKstYmd(pricingBaseDate) : null;
  const windowStartYmd = laterKstYmd(
    pricingYmd,
    LAB_TRADING_PARTNER_FEATURE_START_YMD,
  );
  const windowStartDate = windowStartYmd
    ? new Date(`${windowStartYmd}T00:00:00+09:00`)
    : null;
  const elapsedDays = windowStartDate ? diffKstDays(windowStartDate) : null;
  const remainingDays =
    elapsedDays == null
      ? null
      : Math.max(0, LAB_TRADING_PARTNER_WINDOW_DAYS - elapsedDays);
  return {
    pricingBaseDate,
    windowStartYmd,
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
 * 사업자 연결: 가입·사업자 저장 시 pending, 검증 완료 시 active.
 * verified=false → pending (가입 진행중), verified=true → active (등록 완료).
 */
export async function activateLabTradingPartnerInvite({
  inviteToken,
  practiceAnchorId,
  practiceKind,
  verified = true,
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
  if (invite.status === "pending") {
    if (
      invite.practiceAnchorId &&
      String(invite.practiceAnchorId) === practiceId
    ) {
      if (verified) {
        invite.status = "active";
        invite.activatedAt = new Date();
        await invite.save();
        return { activated: true, reason: "activated", partner: invite };
      }
      return { activated: true, reason: "already_pending", partner: invite };
    }
    return { activated: false, reason: "invite_already_bound" };
  }

  const existing = await LabTradingPartner.findOne({
    labAnchorId: invite.labAnchorId,
    practiceAnchorId: new Types.ObjectId(practiceId),
    status: { $in: ["pending", "active"] },
    _id: { $ne: invite._id },
  }).lean();
  if (existing) {
    return { activated: false, reason: "already_partner_with_lab" };
  }

  const now = new Date();
  invite.practiceAnchorId = new Types.ObjectId(practiceId);
  if (!invite.boundAt) invite.boundAt = now;

  if (verified) {
    invite.status = "active";
    invite.activatedAt = now;
    await invite.save();
    return { activated: true, reason: "activated", partner: invite };
  }

  invite.status = "pending";
  await invite.save();
  return { activated: true, reason: "pending", partner: invite };
}

/**
 * 사업자 검증 완료 시, 해당 치과의 pending 초대를 active로 승격.
 * (토큰이 sessionStorage에서 유실된 경우 대비)
 */
export async function activatePendingLabTradingPartnersForPractice({
  practiceAnchorId,
}) {
  const practiceId = String(practiceAnchorId || "").trim();
  if (!practiceId || !Types.ObjectId.isValid(practiceId)) {
    return { activated: false, count: 0 };
  }
  const now = new Date();
  const result = await LabTradingPartner.updateMany(
    {
      practiceAnchorId: new Types.ObjectId(practiceId),
      status: "pending",
    },
    {
      $set: {
        status: "active",
        activatedAt: now,
      },
    },
  );
  const count = Number(result?.modifiedCount || result?.nModified || 0);
  return { activated: count > 0, count };
}

// related files:
// - web/backend/controllers/chats/chat.controller.js
// - web/backend/models/chatRoom.model.js
// - web/backend/models/labTradingPartner.model.js
// - web/backend/utils/requestorCapabilities.js
// change-log:
// - 2026-09-07: 목록·유저 해석 병렬화·req.user 재사용(저지연).
// - 2026-09-07: 기공소↔치과 의뢰건 무관 채팅 — 거래처·이력이 있는 앵커 쌍만 허용.
import { Types } from "mongoose";
import LabTradingPartner from "../models/labTradingPartner.model.js";
import PracticeTransfer from "../models/practiceTransfer.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";
import User from "../models/user.model.js";
import {
  normalizeRequestorKind,
  resolveRequestorProfile,
} from "./requestorCapabilities.js";

const PARTNER_CHAT_STATUSES = ["pending", "active", "referred"];

export const isPartnerChatRoom = (room) =>
  Boolean(room?.relatedLabAnchorId) && Boolean(room?.relatedPracticeAnchorId);

const toObjectId = (raw) => {
  const id = String(raw || "").trim();
  if (!id || !Types.ObjectId.isValid(id)) return null;
  return new Types.ObjectId(id);
};

const anchorDisplayName = (anchor) =>
  String(anchor?.name || "").trim() ||
  String(anchor?.metadata?.companyName || "").trim() ||
  "";

/**
 * 호출자 사업자 앵커 + kind(practice|lab).
 * req.user에 이미 있으면 User/Anchor 재조회를 건너뛴다.
 */
export async function resolveCallerPartnerChatContext(req) {
  const userId = req.user?._id;
  if (!userId) return null;

  const role = String(req.user?.role || "").trim();
  const reqAnchorId = String(req.user?.businessAnchorId || "").trim();
  const reqKind = normalizeRequestorKind(req.user?.requestorKind);

  // Fast path: JWT/세션에 앵커·kind가 있으면 DB 왕복 생략
  if (reqAnchorId && Types.ObjectId.isValid(reqAnchorId)) {
    if (role === "practice") {
      return {
        userId: String(userId),
        role,
        kind: "practice",
        anchorId: reqAnchorId,
        anchorName: String(req.user?.business || req.user?.companyName || "").trim(),
      };
    }
    if (role === "internalLab") {
      return {
        userId: String(userId),
        role,
        kind: "lab",
        anchorId: reqAnchorId,
        anchorName: String(req.user?.business || req.user?.companyName || "").trim(),
      };
    }
    if (role === "requestor" && (reqKind === "practice" || reqKind === "lab")) {
      return {
        userId: String(userId),
        role,
        kind: reqKind,
        anchorId: reqAnchorId,
        anchorName: String(req.user?.business || req.user?.companyName || "").trim(),
      };
    }
  }

  const freshUser = await User.findById(userId)
    .select({
      businessAnchorId: 1,
      requestorKind: 1,
      requestorServices: 1,
      requestorCapabilities: 1,
      role: 1,
      business: 1,
    })
    .lean();

  const resolvedRole = String(freshUser?.role || role || "").trim();
  const anchorId = String(
    freshUser?.businessAnchorId || req.user?.businessAnchorId || "",
  ).trim();
  if (!anchorId || !Types.ObjectId.isValid(anchorId)) return null;

  const anchor = await BusinessAnchor.findById(anchorId)
    .select({
      _id: 1,
      name: 1,
      status: 1,
      businessType: 1,
      requestorKind: 1,
      requestorServices: 1,
      requestorCapabilities: 1,
      metadata: 1,
    })
    .lean();
  if (!anchor) return null;

  if (resolvedRole === "practice") {
    return {
      userId: String(userId),
      role: resolvedRole,
      kind: "practice",
      anchorId,
      anchorName: anchorDisplayName(anchor),
    };
  }

  if (resolvedRole === "internalLab") {
    return {
      userId: String(userId),
      role: resolvedRole,
      kind: "lab",
      anchorId,
      anchorName: anchorDisplayName(anchor),
    };
  }

  if (resolvedRole !== "requestor" && resolvedRole !== "admin") return null;

  const profile = resolveRequestorProfile({
    anchorKind: anchor.requestorKind,
    anchorServices: anchor.requestorServices,
    anchorCaps: anchor.requestorCapabilities,
    userKind: freshUser?.requestorKind,
    userServices: freshUser?.requestorServices,
    userCaps: freshUser?.requestorCapabilities,
    userRole: resolvedRole,
    businessVerified: String(anchor.status || "").trim() === "verified",
  });
  const kind = normalizeRequestorKind(profile?.kind);
  if (kind !== "practice" && kind !== "lab") return null;

  return {
    userId: String(userId),
    role: resolvedRole,
    kind,
    anchorId,
    anchorName: anchorDisplayName(anchor),
  };
}

export async function hasPartnerChatRelationship({
  labAnchorId,
  practiceAnchorId,
}) {
  const labId = toObjectId(labAnchorId);
  const practiceId = toObjectId(practiceAnchorId);
  if (!labId || !practiceId) return false;

  const [partner, transfer] = await Promise.all([
    LabTradingPartner.findOne({
      labAnchorId: labId,
      practiceAnchorId: practiceId,
      status: { $in: PARTNER_CHAT_STATUSES },
    })
      .select({ _id: 1 })
      .lean(),
    PracticeTransfer.findOne({
      practiceBusinessAnchorId: practiceId,
      $or: [{ targetLabAnchorId: labId }, { assigneeLabAnchorId: labId }],
    })
      .select({ _id: 1 })
      .lean(),
  ]);

  return Boolean(partner?._id || transfer?._id);
}

/**
 * 기공소/치과 쪽 대표 사용자(채팅 참여자) 해석.
 * primaryContact → owners → members → 앵커 소속 active user.
 * User 조회는 최대 2회로 제한.
 */
export async function resolveAnchorChatUserId(anchorId, { preferRoles = [] } = {}) {
  const id = toObjectId(anchorId);
  if (!id) return "";

  const roles = Array.isArray(preferRoles)
    ? preferRoles.map((r) => String(r || "").trim()).filter(Boolean)
    : [];

  const anchor = await BusinessAnchor.findById(id)
    .select({ primaryContactUserId: 1, owners: 1, members: 1 })
    .lean();
  if (!anchor) return "";

  const toValidUserIds = (rows) =>
    (Array.isArray(rows) ? rows : [])
      .map((raw) => String(raw || "").trim())
      .filter((raw) => Types.ObjectId.isValid(raw));

  const orderedIds = [
    String(anchor.primaryContactUserId || "").trim(),
    ...toValidUserIds(anchor.owners),
    ...toValidUserIds(anchor.members),
  ].filter((raw, idx, arr) => raw && arr.indexOf(raw) === idx);

  if (orderedIds.length > 0) {
    const users = await User.find({
      _id: { $in: orderedIds.map((raw) => new Types.ObjectId(raw)) },
      active: true,
    })
      .select({ _id: 1, role: 1 })
      .lean();
    const byId = new Map(users.map((u) => [String(u._id), u]));
    for (const uid of orderedIds) {
      const u = byId.get(uid);
      if (!u) continue;
      if (roles.length === 0 || roles.includes(String(u.role || "").trim())) {
        return uid;
      }
    }
    for (const uid of orderedIds) {
      if (byId.has(uid)) return uid;
    }
  }

  const filter = {
    businessAnchorId: id,
    active: true,
  };
  if (roles.length > 0) filter.role = { $in: roles };

  const anchorUser = await User.findOne(filter).select({ _id: 1 }).lean();
  return String(anchorUser?._id || "").trim();
}

/**
 * 채팅 가능한 상대 앵커 목록(거래처 + 의뢰 이력).
 * 거래처·이력을 병렬로 모은 뒤 앵커 이름만 1회 조회.
 */
export async function listPartnerChatCounterpartAnchors({ kind, anchorId }) {
  const myId = toObjectId(anchorId);
  if (!myId) return [];

  const counterpartIds = new Set();

  if (kind === "lab") {
    const [partners, transferPracticeIds, assigneePracticeIds] =
      await Promise.all([
        LabTradingPartner.find({
          labAnchorId: myId,
          practiceAnchorId: { $type: "objectId" },
          status: { $in: PARTNER_CHAT_STATUSES },
        })
          .select({ practiceAnchorId: 1 })
          .lean(),
        PracticeTransfer.distinct("practiceBusinessAnchorId", {
          targetLabAnchorId: myId,
          practiceBusinessAnchorId: { $type: "objectId" },
        }),
        PracticeTransfer.distinct("practiceBusinessAnchorId", {
          assigneeLabAnchorId: myId,
          practiceBusinessAnchorId: { $type: "objectId" },
        }),
      ]);
    for (const row of partners) {
      const id = String(row?.practiceAnchorId || "").trim();
      if (id) counterpartIds.add(id);
    }
    for (const id of [...transferPracticeIds, ...assigneePracticeIds]) {
      const raw = String(id || "").trim();
      if (raw) counterpartIds.add(raw);
    }
  } else if (kind === "practice") {
    const [partners, targetLabIds, assigneeLabIds] = await Promise.all([
      LabTradingPartner.find({
        practiceAnchorId: myId,
        labAnchorId: { $type: "objectId" },
        status: { $in: PARTNER_CHAT_STATUSES },
      })
        .select({ labAnchorId: 1 })
        .lean(),
      PracticeTransfer.distinct("targetLabAnchorId", {
        practiceBusinessAnchorId: myId,
        targetLabAnchorId: { $type: "objectId" },
      }),
      PracticeTransfer.distinct("assigneeLabAnchorId", {
        practiceBusinessAnchorId: myId,
        assigneeLabAnchorId: { $type: "objectId" },
      }),
    ]);
    for (const row of partners) {
      const id = String(row?.labAnchorId || "").trim();
      if (id) counterpartIds.add(id);
    }
    for (const id of [...targetLabIds, ...assigneeLabIds]) {
      const raw = String(id || "").trim();
      if (raw) counterpartIds.add(raw);
    }
  }

  const ids = [...counterpartIds]
    .filter((id) => Types.ObjectId.isValid(id))
    .slice(0, 300);
  if (ids.length === 0) return [];

  const anchors = await BusinessAnchor.find({
    _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
  })
    .select({ _id: 1, name: 1, metadata: 1, status: 1 })
    .lean();

  return anchors.map((a) => ({
    anchorId: String(a._id),
    name: anchorDisplayName(a) || "이름 없음",
    status: String(a.status || "").trim() || null,
  }));
}

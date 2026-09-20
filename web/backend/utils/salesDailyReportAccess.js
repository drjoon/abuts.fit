// related files:
// - web/backend/controllers/salesTeam/salesTeam.controller.js
// - web/backend/models/sales/salesDailyReport.model.js
// change-log:
// - 2026-09-21: 딜러 일일보고는 딜러사 대표·담당자만 열람, 어벗츠 관계자 조회 금지.
import { Types } from "mongoose";
import User from "../models/user.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";

/** FE·API 공통 안내 문구 SSOT */
export const DEALER_DAILY_REPORT_PRIVACY_NOTE =
  "딜러 일일보고는 딜러사 대표·담당자만 열람할 수 있으며, 어벗츠 관계자는 조회할 수 없습니다.";

/** 어벗츠 측 역할 — 딜러(salesman) 일일보고 열람 불가 */
export const ABUTS_PERSONNEL_ROLES = new Set([
  "admin",
  "salesTeam",
  "devops",
  "labTeam",
  "internalLab",
  "manufacturer",
]);

function oid(value) {
  const s = String(value || "").trim();
  return Types.ObjectId.isValid(s) ? new Types.ObjectId(s) : null;
}

function membershipIdFromEntry(entry) {
  if (entry == null) return "";
  if (typeof entry === "string" || typeof entry === "number") {
    return String(entry).trim();
  }
  if (typeof entry === "object") {
    return String(entry.userId || entry._id || entry.id || "").trim();
  }
  return "";
}

export function isAbutsPersonnelRole(role) {
  return ABUTS_PERSONNEL_ROLES.has(String(role || "").trim());
}

/** 딜러사 대표: primaryContact 또는 owners */
export function isDealerBaRepresentative(anchor, userId) {
  const meId = String(userId || "").trim();
  if (!anchor || !meId) return false;
  if (String(anchor.primaryContactUserId || "").trim() === meId) return true;
  if (
    Array.isArray(anchor.owners) &&
    anchor.owners.some((o) => membershipIdFromEntry(o) === meId)
  ) {
    return true;
  }
  return false;
}

/**
 * 딜러(salesman)가 작성한 일일보고 열람 가능 여부.
 * - 담당자(작성자 본인) · 같은 BA 대표만 허용
 * - 어벗츠 관계자(admin/salesTeam/devops 등)는 항상 거부
 * - 비딜러 작성분(영업본부 등)은 작성자 본인만
 */
export async function canViewDailyReportAuthor({ viewer, authorUserId }) {
  const viewerId = String(viewer?._id || "").trim();
  const authorId = String(authorUserId || "").trim();
  if (!viewerId || !authorId || !Types.ObjectId.isValid(authorId)) {
    return { ok: false, code: "bad_request" };
  }

  const author = await User.findById(authorId)
    .select({ role: 1, businessAnchorId: 1, subRole: 1 })
    .lean();
  if (!author) return { ok: false, code: "not_found" };

  const authorRole = String(author.role || "");

  // 영업본부·관리자 등 비딜러 보고: 본인만
  if (authorRole !== "salesman") {
    if (viewerId === authorId) return { ok: true, scope: "self" };
    return { ok: false, code: "forbidden" };
  }

  // 딜러 보고: 어벗츠 관계자 차단
  if (isAbutsPersonnelRole(viewer?.role)) {
    return {
      ok: false,
      code: "forbidden_abuts",
      message: DEALER_DAILY_REPORT_PRIVACY_NOTE,
    };
  }

  // 담당자(작성자)
  if (viewerId === authorId) {
    return { ok: true, scope: "author" };
  }

  const anchorId = author.businessAnchorId;
  if (!anchorId) return { ok: false, code: "forbidden" };

  const [anchor, viewerLean] = await Promise.all([
    BusinessAnchor.findById(anchorId)
      .select({ primaryContactUserId: 1, owners: 1 })
      .lean(),
    viewer?.role != null &&
    viewer?.businessAnchorId !== undefined &&
    viewer?.subRole !== undefined
      ? Promise.resolve(viewer)
      : User.findById(viewerId)
          .select({ businessAnchorId: 1, role: 1, subRole: 1 })
          .lean(),
  ]);

  if (!anchor) return { ok: false, code: "forbidden" };

  const viewerRole = String(viewerLean?.role || viewer?.role || "");
  const viewerSub = String(viewerLean?.subRole || viewer?.subRole || "").trim();
  const viewerBa = String(viewerLean?.businessAnchorId || "").trim();

  if (isDealerBaRepresentative(anchor, viewerId)) {
    return { ok: true, scope: "representative" };
  }

  // subRole=owner 폴백: 같은 딜러사 BA일 때만
  if (
    viewerRole === "salesman" &&
    viewerSub === "owner" &&
    viewerBa &&
    viewerBa === String(anchorId)
  ) {
    return { ok: true, scope: "representative" };
  }

  return { ok: false, code: "forbidden" };
}

/**
 * 목록 조회용: 열람 가능한 authorUserId 목록.
 * 딜러 대표면 같은 BA 소속 딜러 전원, 그 외는 본인만.
 */
export async function listVisibleDailyReportAuthorIds(viewer) {
  const viewerId = oid(viewer?._id);
  if (!viewerId) return [];

  const me =
    viewer?.role != null &&
    viewer?.businessAnchorId !== undefined &&
    viewer?.subRole !== undefined
      ? viewer
      : await User.findById(viewerId)
          .select({ role: 1, businessAnchorId: 1, subRole: 1 })
          .lean();
  if (!me) return [];

  const role = String(me.role || "");
  const ids = [viewerId];

  if (role !== "salesman") return ids;
  if (isAbutsPersonnelRole(role)) return ids;

  const baId = me.businessAnchorId;
  if (!baId) return ids;

  const anchor = await BusinessAnchor.findById(baId)
    .select({ primaryContactUserId: 1, owners: 1 })
    .lean();
  const sub = String(me.subRole || "").trim();
  const isRep =
    (anchor && isDealerBaRepresentative(anchor, viewerId)) || sub === "owner";
  if (!isRep) {
    return ids;
  }

  const teammates = await User.find({
    role: "salesman",
    businessAnchorId: baId,
  })
    .select({ _id: 1 })
    .lean();

  const out = [];
  const seen = new Set();
  for (const row of teammates) {
    const id = oid(row?._id);
    if (!id) continue;
    const key = String(id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(id);
  }
  return out.length > 0 ? out : ids;
}

export function dailyReportPrivacyPayload(viewerRole) {
  if (String(viewerRole || "") !== "salesman") return null;
  return {
    note: DEALER_DAILY_REPORT_PRIVACY_NOTE,
    viewersLabel: "딜러사 대표·담당자",
    hiddenFromLabel: "어벗츠 관계자",
  };
}

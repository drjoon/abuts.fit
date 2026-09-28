// related files:
// - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
// - web/backend/modules/caseShares/caseShare.routes.js
// - web/backend/models/practiceTransferShareLink.model.js
// - web/backend/utils/practiceTransferCaseView.js
// - web/frontend/src/shared/share/PracticeTransferShareDialog.tsx
// - web/frontend/src/pages/public/CaseSharePage.tsx
// - 2026-09-28: 케이스 3D 공유 — 플랫폼 내(의뢰 참여자) 뷰 + 공유 링크.
// - 2026-09-28: 공유 링크 공개 범위(누구나·지정 계정·관계자)·유효 기간·차단·삭제는 소유자만 바꾼다.
import { randomBytes } from "crypto";
import { Types } from "mongoose";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import PracticeTransferShareLink, {
  CASE_SHARE_VISIBILITIES,
} from "../../models/practiceTransferShareLink.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import User from "../../models/user.model.js";
import s3Utils from "../../utils/s3.utils.js";
import { pipeStreamToResponse } from "../../utils/pipeStreamToResponse.js";
import {
  PRACTICE_TRANSFER_CASE_VIEW_SELECT,
  buildPracticeTransferCaseView,
  buildTransferLookupFilter,
  isPracticeTransferRemoved,
  listPracticeTransferCaseFiles,
  resolveCaseShareAccess,
  resolvePracticeTransferCaseViewerSide,
} from "../../utils/practiceTransferCaseView.js";

const DEFAULT_SHARE_DAYS = 7;
const MAX_SHARE_DAYS = 30;
const MAX_ALLOWED_ACCOUNTS = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

const ACCESS_DENIED_MESSAGE = {
  not_found: "공유 링크를 찾을 수 없습니다.",
  blocked: "소유자가 공유를 막은 링크입니다.",
  expired: "유효 기간이 지난 링크입니다.",
  removed: "삭제된 의뢰입니다.",
  login_required: "로그인한 뒤 볼 수 있는 링크입니다.",
  not_allowed: "이 계정으로는 볼 수 없는 링크입니다.",
};

const loadAccessibleTransfer = async (req, res) => {
  const filter = buildTransferLookupFilter(req.params?.transferId);
  if (!filter) {
    res.status(400).json({ success: false, message: "의뢰 ID가 필요합니다." });
    return null;
  }
  const transferDoc = await PracticeTransfer.findOne(filter)
    .select(PRACTICE_TRANSFER_CASE_VIEW_SELECT)
    .lean();
  if (!transferDoc) {
    res.status(404).json({ success: false, message: "의뢰를 찾을 수 없습니다." });
    return null;
  }
  const side = await resolvePracticeTransferCaseViewerSide(req.user, transferDoc);
  if (!side) {
    res.status(403).json({
      success: false,
      message: "이 의뢰에 참여한 치과·기공소만 볼 수 있습니다.",
    });
    return null;
  }
  return { transferDoc, side };
};

const isLinkOwner = (req, link) =>
  String(req.user?.role || "") === "admin" ||
  String(link?.createdBy || "") === String(req.user?._id || "");

const linkStatus = (link, now = Date.now()) => {
  if (link.blockedAt) return "blocked";
  if (new Date(link.expiresAt).getTime() <= now) return "expired";
  return "active";
};

const loadUsersById = async (ids) => {
  const valid = [...new Set(ids.map((id) => String(id || "")).filter(Boolean))].filter(
    (id) => Types.ObjectId.isValid(id),
  );
  if (valid.length === 0) return new Map();
  const users = await User.find({ _id: { $in: valid } })
    .select({ _id: 1, name: 1, email: 1 })
    .lean();
  return new Map(users.map((u) => [String(u._id), u]));
};

const toShareLinkPublic = (req, link, usersById) => {
  const owner = isLinkOwner(req, link);
  const creator = usersById.get(String(link.createdBy || ""));
  return {
    token: String(link.token || ""),
    visibility: String(link.visibility || "public"),
    status: linkStatus(link),
    expiresAt: link.expiresAt || null,
    createdAt: link.createdAt || null,
    createdBySide: String(link.createdBySide || ""),
    createdByName: String(creator?.name || "").trim(),
    isOwner: owner,
    viewCount: Number(link.viewCount || 0),
    lastViewedAt: link.lastViewedAt || null,
    allowedAccounts: owner
      ? (link.allowedUserIds || [])
          .map((id) => usersById.get(String(id)))
          .filter(Boolean)
          .map((u) => ({ email: String(u.email || ""), name: String(u.name || "") }))
      : [],
  };
};

const respondLinks = async (req, res, links, status = 200, extra = {}) => {
  const ids = links.flatMap((l) => [l.createdBy, ...(l.allowedUserIds || [])]);
  const usersById = await loadUsersById(ids);
  return res.status(status).json({
    success: true,
    data: { items: links.map((l) => toShareLinkPublic(req, l, usersById)), ...extra },
  });
};

const parseExpiresInDays = (raw) => {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(MAX_SHARE_DAYS, Math.max(1, Math.floor(n)));
};

/** 「지정한 계정만」 이메일 → 가입 계정. 없는 이메일이 있으면 error. */
const resolveAllowedAccounts = async (rawEmails) => {
  const emails = [
    ...new Set(
      (Array.isArray(rawEmails) ? rawEmails : [])
        .map((e) => String(e || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (emails.length === 0) {
    return { error: "볼 수 있는 계정의 이메일을 하나 이상 넣어 주세요." };
  }
  if (emails.length > MAX_ALLOWED_ACCOUNTS) {
    return { error: `계정은 ${MAX_ALLOWED_ACCOUNTS}개까지 지정할 수 있습니다.` };
  }
  const users = await User.find({ email: { $in: emails }, active: true })
    .select({ _id: 1, email: 1 })
    .lean();
  const found = new Set(users.map((u) => String(u.email || "").toLowerCase()));
  const missing = emails.filter((e) => !found.has(e));
  if (missing.length > 0) {
    return { error: `가입된 계정을 찾지 못했습니다: ${missing.join(", ")}` };
  }
  return { userIds: users.map((u) => u._id) };
};

/**
 * GET /api/practice/transfers/:transferId/case-view
 * 의뢰 참여자(치과·원청·협력·하청) 전용 3D 케이스 뷰.
 */
export async function getPracticeTransferCaseView(req, res) {
  try {
    const loaded = await loadAccessibleTransfer(req, res);
    if (!loaded) return;
    const { transferDoc, side } = loaded;

    const anchorId = String(transferDoc.practiceBusinessAnchorId || "").trim();
    const practiceAnchor =
      anchorId && Types.ObjectId.isValid(anchorId)
        ? await BusinessAnchor.findById(anchorId).select({ name: 1 }).lean()
        : null;

    return res.status(200).json({
      success: true,
      data: {
        ...buildPracticeTransferCaseView(transferDoc, {
          mode: "internal",
          practiceName: practiceAnchor?.name || "",
        }),
        viewerSide: side,
      },
    });
  } catch (error) {
    console.error("[practiceTransferShare] getPracticeTransferCaseView", error);
    return res.status(500).json({
      success: false,
      message: "케이스를 불러오지 못했습니다.",
    });
  }
}

/**
 * GET /api/practice/transfers/:transferId/share-links
 * 이 의뢰의 공유 링크(차단·만료 포함). 관계자는 모두 보고, 설정은 소유자만 바꾼다.
 */
export async function listPracticeTransferShareLinks(req, res) {
  try {
    const loaded = await loadAccessibleTransfer(req, res);
    if (!loaded) return;
    const links = await PracticeTransferShareLink.find({
      transferMongoId: loaded.transferDoc._id,
    })
      .sort({ createdAt: -1 })
      .lean();
    return respondLinks(req, res, links);
  } catch (error) {
    console.error("[practiceTransferShare] listPracticeTransferShareLinks", error);
    return res.status(500).json({
      success: false,
      message: "공유 링크를 불러오지 못했습니다.",
    });
  }
}

/**
 * POST /api/practice/transfers/:transferId/share-links
 * body: { visibility, allowedEmails?: string[], expiresInDays?: number(1~30, 기본 7) }
 */
export async function createPracticeTransferShareLink(req, res) {
  try {
    const loaded = await loadAccessibleTransfer(req, res);
    if (!loaded) return;
    const { transferDoc, side } = loaded;
    if (isPracticeTransferRemoved(transferDoc)) {
      return res.status(409).json({
        success: false,
        message: "삭제된 의뢰는 공유할 수 없습니다.",
      });
    }
    const hasModel = listPracticeTransferCaseFiles(transferDoc).some((row) => row.isModel);
    if (!hasModel) {
      return res.status(409).json({ success: false, message: "공유할 3D 파일이 없습니다." });
    }

    const visibility = String(req.body?.visibility || "public");
    if (!CASE_SHARE_VISIBILITIES.includes(visibility)) {
      return res.status(400).json({ success: false, message: "공개 범위를 골라 주세요." });
    }
    let allowedUserIds = [];
    if (visibility === "accounts") {
      const resolved = await resolveAllowedAccounts(req.body?.allowedEmails);
      if (resolved.error) {
        return res.status(400).json({ success: false, message: resolved.error });
      }
      allowedUserIds = resolved.userIds;
    }
    const days = parseExpiresInDays(req.body?.expiresInDays) ?? DEFAULT_SHARE_DAYS;

    const anchorId = String(req.user?.businessAnchorId || "").trim();
    const created = await PracticeTransferShareLink.create({
      token: randomBytes(32).toString("base64url"),
      transferMongoId: transferDoc._id,
      transferId: String(transferDoc.transferId || "").trim(),
      createdBy: req.user._id,
      createdByAnchorId: Types.ObjectId.isValid(anchorId) ? anchorId : null,
      createdBySide: side,
      visibility,
      allowedUserIds,
      expiresAt: new Date(Date.now() + days * DAY_MS),
    });
    return respondLinks(req, res, [created.toObject()], 201);
  } catch (error) {
    console.error("[practiceTransferShare] createPracticeTransferShareLink", error);
    return res.status(500).json({
      success: false,
      message: "공유 링크를 만들지 못했습니다.",
    });
  }
}

const loadOwnedLink = async (req, res) => {
  const loaded = await loadAccessibleTransfer(req, res);
  if (!loaded) return null;
  const token = String(req.params?.token || "").trim();
  const link = token
    ? await PracticeTransferShareLink.findOne({
        token,
        transferMongoId: loaded.transferDoc._id,
      }).lean()
    : null;
  if (!link) {
    res.status(404).json({ success: false, message: "공유 링크를 찾을 수 없습니다." });
    return null;
  }
  if (!isLinkOwner(req, link)) {
    res.status(403).json({
      success: false,
      message: "링크를 만든 사람만 바꿀 수 있습니다.",
    });
    return null;
  }
  return { ...loaded, link };
};

/**
 * PATCH /api/practice/transfers/:transferId/share-links/:token (소유자)
 * body: { visibility?, allowedEmails?, expiresInDays?(지금부터 다시 계산), blocked? }
 */
export async function updatePracticeTransferShareLink(req, res) {
  try {
    const owned = await loadOwnedLink(req, res);
    if (!owned) return;
    const { link } = owned;
    const $set = {};

    if (req.body?.visibility !== undefined) {
      const visibility = String(req.body.visibility || "");
      if (!CASE_SHARE_VISIBILITIES.includes(visibility)) {
        return res.status(400).json({ success: false, message: "공개 범위를 골라 주세요." });
      }
      $set.visibility = visibility;
    }
    const nextVisibility = $set.visibility || link.visibility;
    if (nextVisibility === "accounts" && req.body?.allowedEmails !== undefined) {
      const resolved = await resolveAllowedAccounts(req.body.allowedEmails);
      if (resolved.error) {
        return res.status(400).json({ success: false, message: resolved.error });
      }
      $set.allowedUserIds = resolved.userIds;
    } else if (nextVisibility === "accounts" && !(link.allowedUserIds || []).length) {
      return res.status(400).json({
        success: false,
        message: "볼 수 있는 계정의 이메일을 하나 이상 넣어 주세요.",
      });
    }
    if (req.body?.expiresInDays !== undefined) {
      const days = parseExpiresInDays(req.body.expiresInDays);
      if (days == null) {
        return res.status(400).json({ success: false, message: "유효 기간을 골라 주세요." });
      }
      $set.expiresAt = new Date(Date.now() + days * DAY_MS);
    }
    if (req.body?.blocked !== undefined) {
      $set.blockedAt = req.body.blocked === true ? new Date() : null;
    }

    const updated = await PracticeTransferShareLink.findOneAndUpdate(
      { _id: link._id },
      { $set },
      { new: true },
    ).lean();
    return respondLinks(req, res, [updated]);
  } catch (error) {
    console.error("[practiceTransferShare] updatePracticeTransferShareLink", error);
    return res.status(500).json({
      success: false,
      message: "공유 링크를 바꾸지 못했습니다.",
    });
  }
}

/**
 * DELETE /api/practice/transfers/:transferId/share-links/:token (소유자)
 */
export async function deletePracticeTransferShareLink(req, res) {
  try {
    const owned = await loadOwnedLink(req, res);
    if (!owned) return;
    await PracticeTransferShareLink.deleteOne({ _id: owned.link._id });
    return res.status(200).json({ success: true, data: { token: owned.link.token } });
  } catch (error) {
    console.error("[practiceTransferShare] deletePracticeTransferShareLink", error);
    return res.status(500).json({
      success: false,
      message: "공유 링크를 삭제하지 못했습니다.",
    });
  }
}

const loadViewableShare = async (req, res) => {
  const token = String(req.params?.token || "").trim();
  const link =
    token && token.length <= 128
      ? await PracticeTransferShareLink.findOne({ token }).lean()
      : null;
  const transferDoc = link
    ? await PracticeTransfer.findById(link.transferMongoId)
        .select(PRACTICE_TRANSFER_CASE_VIEW_SELECT)
        .lean()
    : null;
  const access = await resolveCaseShareAccess({ link, transferDoc, user: req.user || null });
  if (!access.ok) {
    res.setHeader("Cache-Control", "no-store");
    res.status(access.status).json({
      success: false,
      reason: access.reason,
      message: ACCESS_DENIED_MESSAGE[access.reason] || "볼 수 없는 링크입니다.",
    });
    return null;
  }
  return { link, transferDoc, access };
};

/**
 * GET /api/case-shares/:token (로그인 선택)
 */
export async function getPublicCaseShare(req, res) {
  try {
    const loaded = await loadViewableShare(req, res);
    if (!loaded) return;
    const { link, transferDoc, access } = loaded;
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      success: true,
      data: {
        ...buildPracticeTransferCaseView(transferDoc, {
          mode: "public",
          maskPatient: access.maskPatient,
        }),
        visibility: String(link.visibility || "public"),
        expiresAt: link.expiresAt,
      },
    });
    void PracticeTransferShareLink.updateOne(
      { _id: link._id },
      { $inc: { viewCount: 1 }, $set: { lastViewedAt: new Date() } },
    ).catch((error) =>
      console.warn("[practiceTransferShare] viewCount update failed", error?.message),
    );
  } catch (error) {
    console.error("[practiceTransferShare] getPublicCaseShare", error);
    return res.status(500).json({
      success: false,
      message: "공유 케이스를 불러오지 못했습니다.",
    });
  }
}

/**
 * GET /api/case-shares/:token/files/:fileKey (로그인 선택)
 * 서버가 S3에서 받아 흘려준다. S3 키·presigned URL은 밖으로 내보내지 않는다.
 */
export async function streamPublicCaseShareFile(req, res) {
  try {
    const loaded = await loadViewableShare(req, res);
    if (!loaded) return;
    const fileKey = String(req.params?.fileKey || "").trim();
    const target = listPracticeTransferCaseFiles(loaded.transferDoc).find(
      (row) => row.fileKey === fileKey,
    );
    if (!target) {
      return res.status(404).json({ success: false, message: "파일을 찾을 수 없습니다." });
    }

    const { body, contentType, contentLength, eTag } =
      await s3Utils.getObjectStreamFromS3(target.s3Key);
    if (!body) {
      return res.status(404).json({ success: false, message: "파일을 찾을 수 없습니다." });
    }
    const safeName = target.fileName.replace(/[\\/:*?"<>|]/g, "_");
    res.setHeader("Content-Type", contentType || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(safeName)}`,
    );
    if (Number.isFinite(contentLength) && contentLength > 0) {
      res.setHeader("Content-Length", String(Math.floor(contentLength)));
    }
    if (eTag) res.setHeader("ETag", eTag);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Robots-Tag", "noindex");
    await pipeStreamToResponse(body, res, {
      label: "practiceTransferShare",
      key: target.s3Key,
    });
  } catch (error) {
    console.error("[practiceTransferShare] streamPublicCaseShareFile", error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: "파일을 불러오지 못했습니다." });
    }
  }
}

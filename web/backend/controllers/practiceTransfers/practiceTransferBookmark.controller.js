// related files:
// - web/backend/models/practiceTransferBookmark.model.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
// - web/frontend/src/shared/components/practice/PracticeTransferBookmarkControl.tsx
// - 2026-09-14: 의뢰 북마크 CRUD — 별도 컬렉션. 본문 hydrate는 /my·/received?transferMongoIds.
import { Types } from "mongoose";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import PracticeTransferBookmark from "../../models/practiceTransferBookmark.model.js";
import {
  buildReceivedScopeWithAutoMatch,
  isLabAnchorAutoMatchEligible,
  isPracticeTransferLabReceiverRole,
} from "../../utils/practiceTransferAutoMatch.js";
import { getRequestPerfCacheValue, setRequestPerfCacheValue } from "../../services/requestDashboardCache.service.js";
import User from "../../models/user.model.js";

const isSenderRole = (role) => {
  const r = String(role || "").trim();
  return r === "practice" || r === "requestor" || r === "admin";
};

const resolveBookmarkSide = (req) => {
  const role = String(req.user?.role || "").trim();
  const explicit = String(req.query?.side || req.body?.side || "").trim();
  if (explicit === "send" || explicit === "receive") return explicit;
  if (isPracticeTransferLabReceiverRole(role) && !isSenderRole(role)) {
    return "receive";
  }
  if (isSenderRole(role) && !isPracticeTransferLabReceiverRole(role)) {
    return "send";
  }
  // requestor는 발신·수신 둘 다 가능 — 기본 send, 명시 side 권장
  if (isPracticeTransferLabReceiverRole(role)) return "receive";
  if (isSenderRole(role)) return "send";
  return null;
};

const resolvePracticePeerUserIds = async (practiceBusinessAnchorId) => {
  const anchorId = String(practiceBusinessAnchorId || "").trim();
  if (!anchorId || !Types.ObjectId.isValid(anchorId)) return [];
  const users = await User.find({
    businessAnchorId: new Types.ObjectId(anchorId),
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

const buildOwnedScope = async (req) => {
  const role = String(req.user?.role || "").trim();
  if (role === "admin") return {};
  const practiceUserId = req.user?._id || null;
  const practiceBusinessAnchorId = String(req.user?.businessAnchorId || "").trim();
  if (practiceBusinessAnchorId && Types.ObjectId.isValid(practiceBusinessAnchorId)) {
    const peerIds = await resolvePracticePeerUserIds(practiceBusinessAnchorId);
    const practiceUserObjectIds = Array.from(
      new Set(
        [String(practiceUserId || "").trim(), ...peerIds.map(String)].filter(Boolean),
      ),
    )
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    return {
      $or: [
        {
          practiceBusinessAnchorId: new Types.ObjectId(practiceBusinessAnchorId),
        },
        {
          practiceBusinessAnchorId: null,
          practiceUserId: {
            $in: practiceUserObjectIds.length
              ? practiceUserObjectIds
              : practiceUserId
                ? [practiceUserId]
                : [],
          },
        },
      ],
    };
  }
  return { practiceUserId };
};

const buildLabReceivedScope = async (req) => {
  const role = String(req.user?.role || "").trim();
  if (role === "admin") {
    return { scope: {}, labAnchorId: null };
  }
  const labAnchorId = String(req.user?.businessAnchorId || "").trim();
  if (!labAnchorId || !Types.ObjectId.isValid(labAnchorId)) {
    return { scope: null, labAnchorId: null };
  }
  const eligibleCacheKey = `auto-match-eligible-lab:${labAnchorId}`;
  const cachedEligible = getRequestPerfCacheValue(eligibleCacheKey);
  const autoMatchEligible =
    typeof cachedEligible === "boolean"
      ? cachedEligible
      : await (async () => {
          const eligible = await isLabAnchorAutoMatchEligible(labAnchorId);
          setRequestPerfCacheValue(eligibleCacheKey, eligible, 60 * 1000);
          return eligible;
        })();
  return {
    scope: buildReceivedScopeWithAutoMatch({
      labAnchorId,
      autoMatchEligible,
    }),
    labAnchorId,
  };
};

const buildTransferIdFilter = (rawTransferId) => {
  const value = String(rawTransferId || "").trim();
  if (!value) return null;
  if (Types.ObjectId.isValid(value)) {
    return {
      $or: [{ transferId: value }, { _id: new Types.ObjectId(value) }],
    };
  }
  return { transferId: value };
};

const assertTransferAccessible = async (req, transferDoc, side) => {
  if (!transferDoc) return false;
  if (String(req.user?.role || "").trim() === "admin") return true;
  if (side === "send") {
    const scope = await buildOwnedScope(req);
    const owned = await PracticeTransfer.findOne({
      _id: transferDoc._id,
      ...scope,
    })
      .select({ _id: 1 })
      .lean();
    return Boolean(owned);
  }
  const { scope } = await buildLabReceivedScope(req);
  if (!scope) return false;
  const received = await PracticeTransfer.findOne({
    _id: transferDoc._id,
    ...scope,
  })
    .select({ _id: 1 })
    .lean();
  return Boolean(received);
};

const toBookmarkPublic = (doc) => ({
  transferMongoId: String(doc?.transferMongoId || ""),
  transferId: String(doc?.transferId || "").trim(),
  side: String(doc?.side || "").trim(),
  createdAt: doc?.createdAt || null,
});

/**
 * GET /api/practice/transfers/bookmarks?side=send|receive
 * 북마크 ID 목록만(전기간). 본문은 /my|/received?transferMongoIds= 로 hydrate.
 */
export async function listPracticeTransferBookmarks(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
    }
    const side = resolveBookmarkSide(req);
    if (!side) {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }
    if (side === "send" && !isSenderRole(req.user?.role)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }
    if (side === "receive" && !isPracticeTransferLabReceiverRole(req.user?.role)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const rows = await PracticeTransferBookmark.find({
      userId,
      side,
    })
      .sort({ createdAt: -1, _id: -1 })
      .select({ transferMongoId: 1, transferId: 1, side: 1, createdAt: 1 })
      .lean();

    const items = rows.map(toBookmarkPublic).filter((row) => row.transferMongoId);

    return res.status(200).json({
      success: true,
      data: {
        side,
        items,
        count: items.length,
      },
    });
  } catch (error) {
    console.error("[practiceTransfers] listPracticeTransferBookmarks", error);
    return res.status(500).json({
      success: false,
      message: "북마크 목록 조회 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

/**
 * POST /api/practice/transfers/:transferId/bookmark
 * body: { side?: 'send'|'receive' }
 */
export async function addPracticeTransferBookmark(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
    }
    const side = resolveBookmarkSide(req);
    if (!side) {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }
    if (side === "send" && !isSenderRole(req.user?.role)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }
    if (side === "receive" && !isPracticeTransferLabReceiverRole(req.user?.role)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const transferIdFilter = buildTransferIdFilter(req.params?.transferId);
    if (!transferIdFilter) {
      return res.status(400).json({
        success: false,
        message: "의뢰 ID가 필요합니다.",
      });
    }

    const transferDoc = await PracticeTransfer.findOne(transferIdFilter)
      .select({ _id: 1, transferId: 1 })
      .lean();
    if (!transferDoc) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }

    const allowed = await assertTransferAccessible(req, transferDoc, side);
    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "이 의뢰를 북마크할 권한이 없습니다.",
      });
    }

    const transferMongoId = transferDoc._id;
    const transferId = String(transferDoc.transferId || "").trim();
    const existing = await PracticeTransferBookmark.findOne({
      userId,
      transferMongoId,
    }).lean();
    if (existing) {
      return res.status(200).json({
        success: true,
        message: "이미 북마크된 의뢰입니다.",
        data: {
          bookmarked: true,
          bookmark: toBookmarkPublic(existing),
        },
      });
    }

    const created = await PracticeTransferBookmark.create({
      userId,
      side,
      transferMongoId,
      transferId,
    });

    return res.status(200).json({
      success: true,
      message: "북마크에 추가했습니다.",
      data: {
        bookmarked: true,
        bookmark: toBookmarkPublic(created),
      },
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(200).json({
        success: true,
        message: "이미 북마크된 의뢰입니다.",
        data: { bookmarked: true },
      });
    }
    console.error("[practiceTransfers] addPracticeTransferBookmark", error);
    return res.status(500).json({
      success: false,
      message: "북마크 추가 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

/**
 * DELETE /api/practice/transfers/:transferId/bookmark
 */
export async function removePracticeTransferBookmark(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
    }

    const transferIdFilter = buildTransferIdFilter(req.params?.transferId);
    if (!transferIdFilter) {
      return res.status(400).json({
        success: false,
        message: "의뢰 ID가 필요합니다.",
      });
    }

    const transferDoc = await PracticeTransfer.findOne(transferIdFilter)
      .select({ _id: 1, transferId: 1 })
      .lean();
    if (!transferDoc) {
      // 의뢰가 없어도 북마크 행은 정리
      const raw = String(req.params?.transferId || "").trim();
      const or = [];
      if (Types.ObjectId.isValid(raw)) {
        or.push({ transferMongoId: new Types.ObjectId(raw) });
      }
      or.push({ transferId: raw });
      await PracticeTransferBookmark.deleteMany({ userId, $or: or });
      return res.status(200).json({
        success: true,
        message: "북마크를 해제했습니다.",
        data: { bookmarked: false },
      });
    }

    await PracticeTransferBookmark.deleteOne({
      userId,
      transferMongoId: transferDoc._id,
    });

    return res.status(200).json({
      success: true,
      message: "북마크를 해제했습니다.",
      data: {
        bookmarked: false,
        transferMongoId: String(transferDoc._id),
        transferId: String(transferDoc.transferId || "").trim(),
      },
    });
  } catch (error) {
    console.error("[practiceTransfers] removePracticeTransferBookmark", error);
    return res.status(500).json({
      success: false,
      message: "북마크 해제 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

/** 쿼리 transferMongoIds=comma|JSON 파싱. 목록 hydrate용. */
export function parseTransferMongoIdsQuery(query) {
  const raw = query?.transferMongoIds ?? query?.ids ?? null;
  if (raw == null || raw === "") return null;
  let parts = [];
  if (Array.isArray(raw)) {
    parts = raw.map((v) => String(v || "").trim());
  } else {
    const text = String(raw || "").trim();
    if (text.startsWith("[")) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          parts = parsed.map((v) => String(v || "").trim());
        }
      } catch {
        parts = text.split(/[,\s]+/);
      }
    } else {
      parts = text.split(/[,\s]+/);
    }
  }
  const ids = [
    ...new Set(
      parts.filter((id) => id && Types.ObjectId.isValid(id)),
    ),
  ].map((id) => new Types.ObjectId(id));
  return ids.length ? ids : null;
}

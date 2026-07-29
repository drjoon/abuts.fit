// related files:
// - web/backend/modules/chat/chat.routes.js
// - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
// - web/frontend/src/shared/hooks/useChatRooms.ts
// - web/frontend/src/shared/hooks/useChatMessages.ts
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
import { Types } from "mongoose";
import ChatRoom from "../../models/chatRoom.model.js";
import Chat from "../../models/chat.model.js";
import User from "../../models/user.model.js";
import Request from "../../models/request.model.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";

const __chatPerfCache = new Map();
const __chatInFlight = new Map();

const getChatPerfCacheValue = (key) => {
  const hit = __chatPerfCache.get(key);
  if (!hit) return null;
  if (typeof hit.expiresAt !== "number" || hit.expiresAt <= Date.now()) {
    __chatPerfCache.delete(key);
    return null;
  }
  return hit.value;
};

const setChatPerfCacheValue = (key, value, ttlMs) => {
  __chatPerfCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
  return value;
};

const withChatInFlight = async (key, factory) => {
  const existing = __chatInFlight.get(key);
  if (existing) return existing;

  const promise = Promise.resolve()
    .then(factory)
    .finally(() => {
      if (__chatInFlight.get(key) === promise) {
        __chatInFlight.delete(key);
      }
    });

  __chatInFlight.set(key, promise);
  return promise;
};

const invalidateChatPerfCacheByPrefix = (prefix) => {
  const p = String(prefix || "").trim();
  if (!p) return;

  for (const key of __chatPerfCache.keys()) {
    if (String(key).startsWith(p)) {
      __chatPerfCache.delete(key);
    }
  }
};

const invalidateChatPerfForUsers = (userIds) => {
  const ids = (Array.isArray(userIds) ? userIds : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean);

  ids.forEach((id) => {
    __chatPerfCache.delete(`rooms:${id}`);
    invalidateChatPerfCacheByPrefix(`practice-transfer-room:${id}:`);
  });
};

const extractLabNameFromPracticeMessage = (message) => {
  const raw = String(message || "").trim();
  const matched = raw.match(/\[\s*기공소\s*:\s*([^\]]+)\]/i);
  return String(matched?.[1] || "").trim();
};

const resolveManufacturerUserIdByAnchor = async (anchorId) => {
  if (!anchorId || !Types.ObjectId.isValid(anchorId)) return "";

  const anchor = await BusinessAnchor.findById(anchorId)
    .select({ primaryContactUserId: 1, owners: 1, members: 1, businessType: 1 })
    .lean();
  if (!anchor || anchor.businessType !== "manufacturer") return "";

  const primaryId = String(anchor.primaryContactUserId || "").trim();
  if (primaryId && Types.ObjectId.isValid(primaryId)) {
    const primaryUser = await User.findOne({
      _id: new Types.ObjectId(primaryId),
      role: "manufacturer",
      active: true,
    })
      .select({ _id: 1 })
      .lean();
    if (primaryUser?._id) return String(primaryUser._id);
  }

  const ownerIds = Array.isArray(anchor.owners)
    ? anchor.owners
        .map((id) => String(id || "").trim())
        .filter((id) => Types.ObjectId.isValid(id))
    : [];
  if (ownerIds.length > 0) {
    const ownerUser = await User.findOne({
      _id: { $in: ownerIds.map((id) => new Types.ObjectId(id)) },
      role: "manufacturer",
      active: true,
    })
      .select({ _id: 1 })
      .lean();
    if (ownerUser?._id) return String(ownerUser._id);
  }

  const memberIds = Array.isArray(anchor.members)
    ? anchor.members
        .map((id) => String(id || "").trim())
        .filter((id) => Types.ObjectId.isValid(id))
    : [];
  if (memberIds.length > 0) {
    const memberUser = await User.findOne({
      _id: { $in: memberIds.map((id) => new Types.ObjectId(id)) },
      role: "manufacturer",
      active: true,
    })
      .select({ _id: 1 })
      .lean();
    if (memberUser?._id) return String(memberUser._id);
  }

  const anyUser = await User.findOne({
    businessAnchorId: new Types.ObjectId(anchorId),
    role: "manufacturer",
    active: true,
  })
    .select({ _id: 1 })
    .lean();

  return String(anyUser?._id || "").trim();
};

const resolveManufacturerAnchorIdByName = async (name) => {
  const n = String(name || "").trim();
  if (!n) return "";
  const anchor = await BusinessAnchor.findOne({
    businessType: "manufacturer",
    name: n,
  })
    .select({ _id: 1 })
    .lean();
  return String(anchor?._id || "").trim();
};

const resolvePracticeLabUserIdByAnchor = async (anchorId) => {
  if (!anchorId || !Types.ObjectId.isValid(anchorId)) return "";

  const anchor = await BusinessAnchor.findById(anchorId)
    .select({ primaryContactUserId: 1, owners: 1, members: 1 })
    .lean();
  if (!anchor) return "";

  const toValidUserIds = (rows) =>
    (Array.isArray(rows) ? rows : [])
      .map((id) => String(id || "").trim())
      .filter((id) => Types.ObjectId.isValid(id));

  const orderedIds = [
    String(anchor.primaryContactUserId || "").trim(),
    ...toValidUserIds(anchor.owners),
    ...toValidUserIds(anchor.members),
  ].filter((id, idx, arr) => id && Types.ObjectId.isValid(id) && arr.indexOf(id) === idx);

  if (orderedIds.length > 0) {
    const preferred = await User.findOne({
      _id: { $in: orderedIds.map((id) => new Types.ObjectId(id)) },
      role: "requestor",
      active: true,
    })
      .select({ _id: 1 })
      .lean();
    if (preferred?._id) return String(preferred._id);

    const fallback = await User.findOne({
      _id: { $in: orderedIds.map((id) => new Types.ObjectId(id)) },
      active: true,
    })
      .select({ _id: 1 })
      .lean();
    if (fallback?._id) return String(fallback._id);
  }

  const anchorUser = await User.findOne({
    businessAnchorId: new Types.ObjectId(anchorId),
    role: "requestor",
    active: true,
  })
    .select({ _id: 1 })
    .lean();
  if (anchorUser?._id) return String(anchorUser._id);

  const anyAnchorUser = await User.findOne({
    businessAnchorId: new Types.ObjectId(anchorId),
    active: true,
  })
    .select({ _id: 1 })
    .lean();

  return String(anyAnchorUser?._id || "").trim();
};

const resolvePracticeLabAnchorIdByName = async (name) => {
  const n = String(name || "").trim();
  if (!n) return "";

  const requestorAnchor = await BusinessAnchor.findOne({
    businessType: "requestor",
    name: n,
  })
    .select({ _id: 1 })
    .lean();

  return String(requestorAnchor?._id || "").trim();
};

/**
 * 내 채팅방 목록 조회
 * @route GET /api/chats/rooms
 */
export async function getMyChatRooms(req, res) {
  try {
    const userId = req.user._id;
    const cacheKey = `rooms:${String(userId || "")}`;
    const cached = getChatPerfCacheValue(cacheKey);
    if (cached) {
      return res.status(200).json({
        success: true,
        data: cached,
        cached: true,
      });
    }

    const rooms = await ChatRoom.find({
      participants: userId,
      isArchived: false,
    })
      .populate("participants", "name email role business")
      .populate("relatedRequestId", "requestId title")
      .populate("relatedPracticeTransferId", "transferId")
      .sort({ lastMessageAt: -1 })
      .lean();

    if (rooms.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
      });
    }

    const roomIds = rooms.map((r) => r._id);

    // 모든 채팅방의 통계를 한 번의 집계 쿼리로 조회
    const statsMap = new Map();
    const stats = await Chat.aggregate([
      { $match: { roomId: { $in: roomIds }, isDeleted: false } },
      {
        $group: {
          _id: "$roomId",
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$sender", userId] },
                    { $not: { $in: [userId, "$readBy.userId"] } },
                  ],
                },
                1,
                0,
              ],
            },
          },
          lastMessage: { $last: "$$ROOT" },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "lastMessage.sender",
          foreignField: "_id",
          as: "lastMessage.sender",
        },
      },
      {
        $unwind: {
          path: "$lastMessage.sender",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 1,
          unreadCount: 1,
          "lastMessage._id": 1,
          "lastMessage.content": 1,
          "lastMessage.createdAt": 1,
          "lastMessage.sender._id": 1,
          "lastMessage.sender.name": 1,
          "lastMessage.sender.role": 1,
        },
      },
    ]);

    stats.forEach((stat) => {
      statsMap.set(stat._id.toString(), {
        unreadCount: stat.unreadCount || 0,
        lastMessage: stat.lastMessage || null,
      });
    });

    const roomsWithUnread = rooms.map((room) => {
      const stat = statsMap.get(room._id.toString()) || {
        unreadCount: 0,
        lastMessage: null,
      };
      return {
        ...room,
        unreadCount: stat.unreadCount,
        lastMessage: stat.lastMessage,
      };
    });

    setChatPerfCacheValue(cacheKey, roomsWithUnread, 3000);

    res.status(200).json({
      success: true,
      data: roomsWithUnread,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "채팅방 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 고객지원 채팅방(어벗츠.핏) 조회/생성
 * @route GET /api/chats/support-room
 */
export async function getSupportRoom(req, res) {
  try {
    const userId = req.user._id;
    const roomCacheKey = `support-room:${String(userId || "")}`;
    const cachedRoom = getChatPerfCacheValue(roomCacheKey);
    if (cachedRoom) {
      return res.status(200).json({
        success: true,
        data: cachedRoom,
        cached: true,
      });
    }

    const enriched = await withChatInFlight(roomCacheKey, async () => {
      let admin = getChatPerfCacheValue("support-room:admin");
      if (!admin) {
        admin = await User.findOne({ role: "admin", active: true })
          .select({ _id: 1 })
          .lean();
        if (admin?._id) {
          setChatPerfCacheValue("support-room:admin", admin, 5 * 60 * 1000);
        }
      }

      if (!admin?._id) {
        const error = new Error(
          "지원 채팅을 위한 관리자 계정을 찾을 수 없습니다.",
        );
        error.statusCode = 404;
        throw error;
      }

      const participants = [userId, admin._id];

      const existing = await ChatRoom.findOne({
        participants: { $all: participants, $size: 2 },
        roomType: "direct",
        isArchived: false,
      })
        .populate("participants", "name email role business")
        .lean();

      const enrichRoom = async (room) => {
        const [stats] = await Chat.aggregate([
          { $match: { roomId: room._id, isDeleted: false } },
          {
            $facet: {
              unread: [
                {
                  $match: {
                    sender: { $ne: userId },
                    "readBy.userId": { $ne: userId },
                  },
                },
                { $count: "count" },
              ],
              lastMessage: [
                { $sort: { createdAt: -1 } },
                { $limit: 1 },
                {
                  $lookup: {
                    from: "users",
                    localField: "sender",
                    foreignField: "_id",
                    as: "sender",
                  },
                },
                { $unwind: "$sender" },
                {
                  $project: {
                    _id: 1,
                    content: 1,
                    createdAt: 1,
                    "sender._id": 1,
                    "sender.name": 1,
                    "sender.role": 1,
                  },
                },
              ],
            },
          },
        ]);

        return {
          ...room,
          unreadCount: stats?.unread?.[0]?.count || 0,
          lastMessage: stats?.lastMessage?.[0] || null,
        };
      };

      if (existing) {
        const enrichedExisting = await enrichRoom(existing);
        setChatPerfCacheValue(roomCacheKey, enrichedExisting, 15 * 1000);
        return enrichedExisting;
      }

      const room = await ChatRoom.create({
        participants,
        roomType: "direct",
        title: "어벗츠.핏 고객지원",
        status: "active",
      });

      const populated = await ChatRoom.findById(room._id)
        .populate("participants", "name email role business")
        .lean();

      const enrichedCreated = await enrichRoom(populated);
      setChatPerfCacheValue(roomCacheKey, enrichedCreated, 15 * 1000);
      return enrichedCreated;
    });

    return res.status(200).json({
      success: true,
      data: enriched,
    });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({
      success: false,
      message:
        error?.statusCode && error?.message
          ? error.message
          : "지원 채팅방 생성/조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 의뢰(request) 기준 채팅방 조회/생성
 * related files:
 * - web/backend/modules/chat/chat.routes.js
 * - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
 * @route GET /api/chats/request-room/:requestId
 */
export async function getOrCreateRequestChatRoom(req, res) {
  try {
    const rawRequestId = String(req.params?.requestId || "").trim();
    const currentUserId = String(req.user?._id || "").trim();

    if (!rawRequestId) {
      return res.status(400).json({
        success: false,
        message: "requestId가 필요합니다.",
      });
    }

    const requestFilter =
      Types.ObjectId.isValid(rawRequestId)
        ? {
            $or: [
              { requestId: rawRequestId },
              { _id: new Types.ObjectId(rawRequestId) },
            ],
          }
        : { requestId: rawRequestId };

    const targetRequest = await Request.findOne(requestFilter)
      .select({
        _id: 1,
        requestId: 1,
        requestor: 1,
        caManufacturer: 1,
        "caseInfos.practiceRouting.targetLabAnchorId": 1,
        "caseInfos.practiceRouting.targetLabName": 1,
        "caseInfos.newSystemRequest.tag": 1,
        "caseInfos.newSystemRequest.manufacturer": 1,
        "caseInfos.newSystemRequest.message": 1,
      })
      .lean();

    if (!targetRequest) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }

    const requestorId = String(targetRequest.requestor || "").trim();
    const currentManufacturerId = String(targetRequest.caManufacturer || "").trim();

    const nsrTag = String(targetRequest?.caseInfos?.newSystemRequest?.tag || "").trim();
    const isPracticeRouteTag =
      nsrTag === "practice_dropzone" || nsrTag === "practice_file_transfer";
    const isPracticeOnlyRoute = String(req.originalUrl || "").includes(
      "/api/chats/practice/request-room/",
    );

    if (isPracticeOnlyRoute && !isPracticeRouteTag) {
      return res.status(403).json({
        success: false,
        message: "practice 전용 채팅 라우트에서는 practice 의뢰만 접근할 수 있습니다.",
      });
    }

    const usePracticeRouting = isPracticeOnlyRoute || isPracticeRouteTag;

    // related files:
    // - web/backend/models/request.model.js
    // - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
    // - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
    // - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
    // 분리 원칙:
    // - practice(치과->기공소): caseInfos.practiceRouting.* 사용
    // - 기존 의뢰자(기공소->제조사): caseInfos.newSystemRequest.manufacturer 사용
    const labAnchorIdFromPracticeRouting = String(
      targetRequest?.caseInfos?.practiceRouting?.targetLabAnchorId || "",
    ).trim();
    const labNameFromPracticeRouting = String(
      targetRequest?.caseInfos?.practiceRouting?.targetLabName || "",
    ).trim();

    const legacyManufacturerRaw = String(
      targetRequest?.caseInfos?.newSystemRequest?.manufacturer || "",
    ).trim();

    // 레거시/운영 데이터 대응: 메시지의 [기공소: ...] 텍스트로 anchor를 역조회
    const messageRaw = String(
      targetRequest?.caseInfos?.newSystemRequest?.message || "",
    ).trim();
    const labNameFromMessage = extractLabNameFromPracticeMessage(messageRaw);

    let counterpartUserId = "";

    if (usePracticeRouting) {
      // practice(치과->기공소): requestor 사용자만 상대 후보로 인정
      if (currentManufacturerId && Types.ObjectId.isValid(currentManufacturerId)) {
        const existingCounterpart = await User.findOne({
          _id: new Types.ObjectId(currentManufacturerId),
          role: "requestor",
          active: true,
        })
          .select({ _id: 1 })
          .lean();
        counterpartUserId = String(existingCounterpart?._id || "").trim();
      }

      if (!counterpartUserId && labAnchorIdFromPracticeRouting) {
        counterpartUserId = await resolvePracticeLabUserIdByAnchor(
          labAnchorIdFromPracticeRouting,
        );
      }
    } else {
      counterpartUserId = currentManufacturerId;
    }

    if (!counterpartUserId && !usePracticeRouting && legacyManufacturerRaw) {
      // 기존 루트 보존: 의뢰자(기공소)->제조사 경로는 manufacturer 필드를 우선 사용
      if (Types.ObjectId.isValid(legacyManufacturerRaw)) {
        counterpartUserId = await resolveManufacturerUserIdByAnchor(
          legacyManufacturerRaw,
        );
      } else {
        const legacyAnchorId = await resolveManufacturerAnchorIdByName(
          legacyManufacturerRaw,
        );
        if (legacyAnchorId) {
          counterpartUserId = await resolveManufacturerUserIdByAnchor(legacyAnchorId);
        }
      }
    }

    if (!counterpartUserId) {
      if (usePracticeRouting) {
        const anchorIdFromName =
          (await resolvePracticeLabAnchorIdByName(labNameFromPracticeRouting)) ||
          (await resolvePracticeLabAnchorIdByName(labNameFromMessage));
        if (anchorIdFromName) {
          counterpartUserId = await resolvePracticeLabUserIdByAnchor(anchorIdFromName);
        }
      } else {
        const anchorIdFromName =
          (await resolveManufacturerAnchorIdByName(labNameFromPracticeRouting)) ||
          (await resolveManufacturerAnchorIdByName(labNameFromMessage));
        if (anchorIdFromName) {
          counterpartUserId = await resolveManufacturerUserIdByAnchor(anchorIdFromName);
        }
      }
    }

    if (!requestorId || !counterpartUserId) {
      return res.status(409).json({
        success: false,
        message: "아직 연결 가능한 기공소가 지정되지 않았습니다.",
      });
    }

    // 기존 데이터 호환: caManufacturer가 비어 있으면 상대 사용자 id를 고정 저장한다.
    if (!currentManufacturerId && counterpartUserId) {
      await Request.updateOne(
        { _id: targetRequest._id, caManufacturer: null },
        { $set: { caManufacturer: new Types.ObjectId(counterpartUserId) } },
      ).catch(() => {
        // ignore
      });
    }

    const canAccess =
      req.user?.role === "admin" ||
      currentUserId === requestorId ||
      currentUserId === counterpartUserId;

    if (!canAccess) {
      return res.status(403).json({
        success: false,
        message: "이 의뢰 채팅방에 접근할 권한이 없습니다.",
      });
    }

    const participantObjectIds = [requestorId, counterpartUserId].map(
      (id) => new Types.ObjectId(id),
    );

    let room = await ChatRoom.findOne({
      relatedRequestId: targetRequest._id,
      isArchived: false,
    })
      .populate("participants", "name email role business")
      .populate("relatedRequestId", "requestId title");

    if (!room) {
      room = await ChatRoom.findOne({
        participants: {
          $all: participantObjectIds,
          $size: participantObjectIds.length,
        },
        relatedRequestId: targetRequest._id,
        isArchived: false,
      })
        .populate("participants", "name email role business")
        .populate("relatedRequestId", "requestId title");
    }

    if (!room) {
      const title = `의뢰 ${String(targetRequest.requestId || "").trim() || ""} 소통`;
      const created = await ChatRoom.create({
        participants: participantObjectIds,
        roomType: "direct",
        title,
        relatedRequestId: targetRequest._id,
        status: "active",
      });

      room = await ChatRoom.findById(created._id)
        .populate("participants", "name email role business")
        .populate("relatedRequestId", "requestId title");
    }

    const [unreadCount, lastMessage] = await Promise.all([
      Chat.countDocuments({
        roomId: room._id,
        isDeleted: false,
        sender: { $ne: req.user._id },
        "readBy.userId": { $ne: req.user._id },
      }),
      Chat.findOne({ roomId: room._id, isDeleted: false })
        .sort({ createdAt: -1 })
        .populate("sender", "name role")
        .lean(),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        ...room.toObject(),
        unreadCount: unreadCount || 0,
        lastMessage: lastMessage || null,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "의뢰 채팅방 조회/생성 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * practice 전송(PracticeTransfer) 기준 채팅방 조회/생성
 * related files:
 * - web/backend/models/practiceTransfer.model.js
 * - web/backend/models/chatRoom.model.js
 * - web/backend/modules/chat/chat.routes.js
 * - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
 * @route GET /api/chats/practice/transfer-room/:transferId
 */
export async function getOrCreatePracticeTransferChatRoom(req, res) {
  try {
    const rawTransferId = String(req.params?.transferId || "").trim();
    if (!rawTransferId) {
      return res.status(400).json({ success: false, message: "transferId가 필요합니다." });
    }

    const currentUserId = String(req.user?._id || "").trim();
    const responseCacheKey = `practice-transfer-room:${currentUserId}:${rawTransferId}`;
    const cached = getChatPerfCacheValue(responseCacheKey);
    if (cached) {
      return res.status(200).json({ success: true, data: cached, cached: true });
    }

    const transferFilter = Types.ObjectId.isValid(rawTransferId)
      ? {
          $or: [
            { transferId: rawTransferId },
            { _id: new Types.ObjectId(rawTransferId) },
          ],
        }
      : { transferId: rawTransferId };

    const transferDoc = await PracticeTransfer.findOne(transferFilter)
      .select({
        _id: 1,
        transferId: 1,
        practiceUserId: 1,
        targetLabAnchorId: 1,
        targetLabName: 1,
        status: 1,
      })
      .lean();

    if (!transferDoc) {
      return res.status(404).json({ success: false, message: "전송 내역을 찾을 수 없습니다." });
    }

    if (String(transferDoc?.status || "") === "canceled") {
      return res.status(409).json({ success: false, message: "취소된 전송 내역입니다." });
    }

    const practiceUserId = String(transferDoc?.practiceUserId || "").trim();
    const targetLabAnchorId = String(transferDoc?.targetLabAnchorId || "").trim();

    let counterpartUserId = "";
    if (targetLabAnchorId && Types.ObjectId.isValid(targetLabAnchorId)) {
      const counterpartCacheKey = `practice-lab-user:${targetLabAnchorId}`;
      const cachedCounterpart = getChatPerfCacheValue(counterpartCacheKey);
      if (cachedCounterpart) {
        counterpartUserId = String(cachedCounterpart || "").trim();
      } else {
        counterpartUserId = await withChatInFlight(counterpartCacheKey, async () => {
          const resolved = await resolvePracticeLabUserIdByAnchor(targetLabAnchorId);
          if (resolved) {
            setChatPerfCacheValue(counterpartCacheKey, resolved, 3 * 60 * 1000);
          }
          return resolved;
        });
      }
    }

    if (!counterpartUserId) {
      const targetLabName = String(transferDoc?.targetLabName || "").trim();
      const fallbackAnchorCacheKey = `practice-lab-anchor-name:${targetLabName}`;
      const cachedFallbackAnchor = getChatPerfCacheValue(fallbackAnchorCacheKey);
      let fallbackAnchorId = cachedFallbackAnchor
        ? String(cachedFallbackAnchor || "").trim()
        : "";

      if (!fallbackAnchorId && targetLabName) {
        fallbackAnchorId = await withChatInFlight(fallbackAnchorCacheKey, async () => {
          const resolved = await resolvePracticeLabAnchorIdByName(targetLabName);
          if (resolved) {
            setChatPerfCacheValue(fallbackAnchorCacheKey, resolved, 3 * 60 * 1000);
          }
          return resolved;
        });
      }

      if (fallbackAnchorId) {
        const counterpartCacheKey = `practice-lab-user:${fallbackAnchorId}`;
        const cachedCounterpart = getChatPerfCacheValue(counterpartCacheKey);
        if (cachedCounterpart) {
          counterpartUserId = String(cachedCounterpart || "").trim();
        } else {
          counterpartUserId = await withChatInFlight(counterpartCacheKey, async () => {
            const resolved = await resolvePracticeLabUserIdByAnchor(fallbackAnchorId);
            if (resolved) {
              setChatPerfCacheValue(counterpartCacheKey, resolved, 3 * 60 * 1000);
            }
            return resolved;
          });
        }
      }
    }

    if (!practiceUserId || !counterpartUserId) {
      return res.status(409).json({
        success: false,
        message: "아직 연결 가능한 기공소가 지정되지 않았습니다.",
      });
    }

    const canAccess =
      req.user?.role === "admin" ||
      currentUserId === practiceUserId ||
      currentUserId === counterpartUserId;

    if (!canAccess) {
      return res.status(403).json({
        success: false,
        message: "이 전송 채팅방에 접근할 권한이 없습니다.",
      });
    }

    const participantObjectIds = [practiceUserId, counterpartUserId].map(
      (id) => new Types.ObjectId(id),
    );

    let roomMeta = await ChatRoom.findOne({
      relatedPracticeTransferId: transferDoc._id,
      isArchived: false,
    })
      .select({ _id: 1 })
      .lean();

    if (!roomMeta) {
      const created = await ChatRoom.create({
        participants: participantObjectIds,
        roomType: "direct",
        title: `전송 ${String(transferDoc.transferId || "")} 소통`,
        relatedPracticeTransferId: transferDoc._id,
        status: "active",
      });
      roomMeta = { _id: created._id };
      invalidateChatPerfForUsers([practiceUserId, counterpartUserId]);
    }

    const room = await ChatRoom.findById(roomMeta._id)
      .populate("participants", "name role business")
      .populate("relatedPracticeTransferId", "transferId")
      .lean();

    const [unreadCount, lastMessage] = await Promise.all([
      Chat.countDocuments({
        roomId: roomMeta._id,
        isDeleted: false,
        sender: { $ne: req.user._id },
        "readBy.userId": { $ne: req.user._id },
      }),
      Chat.findOne({ roomId: roomMeta._id, isDeleted: false })
        .sort({ createdAt: -1 })
        .select({ _id: 1, content: 1, createdAt: 1, sender: 1 })
        .populate("sender", "name role")
        .lean(),
    ]);

    const payload = {
      ...(room || {}),
      unreadCount: unreadCount || 0,
      lastMessage: lastMessage || null,
    };

    setChatPerfCacheValue(responseCacheKey, payload, 5000);

    return res.status(200).json({
      success: true,
      data: payload,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "practice 전송 채팅방 조회/생성 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 채팅방 생성 또는 기존 채팅방 조회
 * @route POST /api/chats/rooms
 */
export async function createOrGetChatRoom(req, res) {
  try {
    const { participantIds, title, relatedRequestId } = req.body;
    const currentUserId = req.user._id;
    const currentUserRole = req.user.role;

    // 참여자 배열에 현재 사용자 포함
    let allParticipants = [currentUserId.toString(), ...(participantIds || [])];
    allParticipants = [...new Set(allParticipants)]; // 중복 제거

    // 권한 검증: Admin이 아닌 경우 Admin과만 채팅방 생성 가능
    if (currentUserRole !== "admin") {
      const otherParticipants = allParticipants.filter(
        (id) => id !== currentUserId.toString(),
      );

      const otherUsers = await User.find({
        _id: { $in: otherParticipants },
      }).select("role");

      const hasNonAdmin = otherUsers.some((user) => user.role !== "admin");

      if (hasNonAdmin) {
        return res.status(403).json({
          success: false,
          message: "Admin과만 채팅방을 생성할 수 있습니다.",
        });
      }
    }

    // ObjectId로 변환
    const participantObjectIds = allParticipants.map(
      (id) => new Types.ObjectId(id),
    );

    // 기존 채팅방 찾기 (같은 참여자 조합)
    const existingRoom = await ChatRoom.findOne({
      participants: {
        $all: participantObjectIds,
        $size: participantObjectIds.length,
      },
      isArchived: false,
    })
      .populate("participants", "name email role business")
      .populate("relatedRequestId", "requestId title");

    if (existingRoom) {
      return res.status(200).json({
        success: true,
        data: existingRoom,
        message: "기존 채팅방을 찾았습니다.",
      });
    }

    // 새 채팅방 생성
    const newRoom = new ChatRoom({
      participants: participantObjectIds,
      roomType: participantObjectIds.length > 2 ? "group" : "direct",
      title: title || "",
      relatedRequestId: relatedRequestId || null,
      status: "active",
    });

    await newRoom.save();

    const populatedRoom = await ChatRoom.findById(newRoom._id)
      .populate("participants", "name email role business")
      .populate("relatedRequestId", "requestId title");

    res.status(201).json({
      success: true,
      data: populatedRoom,
      message: "채팅방이 성공적으로 생성되었습니다.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "채팅방 생성 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 특정 채팅방의 메시지 목록 조회
 * @route GET /api/chats/rooms/:roomId/messages
 */
export async function getChatMessages(req, res) {
  try {
    const { roomId } = req.params;
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // ObjectId 유효성 검사
    if (!Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 채팅방 ID입니다.",
      });
    }

    // 채팅방 존재 및 참여자 확인
    const room = await ChatRoom.findById(roomId)
      .select({ participants: 1 })
      .lean();
    if (!room) {
      return res.status(404).json({
        success: false,
        message: "채팅방을 찾을 수 없습니다.",
      });
    }

    const isParticipant = room.participants.some(
      (p) => p.toString() === userId.toString(),
    );

    if (!isParticipant && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "이 채팅방에 접근할 권한이 없습니다.",
      });
    }

    const cacheKey = `room-messages:${String(roomId)}:u:${String(userId)}:p:${page}:l:${limit}`;
    const cachedMessages = page === 1 ? getChatPerfCacheValue(cacheKey) : null;

    const loaded = cachedMessages
      ? cachedMessages
      : await Chat.find({ roomId, isDeleted: false })
          .select({
            _id: 1,
            roomId: 1,
            sender: 1,
            content: 1,
            attachments: 1,
            createdAt: 1,
            updatedAt: 1,
          })
          .populate("sender", "name role")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit + 1)
          .lean();

    const hasMore = loaded.length > limit;
    const messages = hasMore ? loaded.slice(0, limit) : loaded;

    if (!cachedMessages && page === 1) {
      setChatPerfCacheValue(cacheKey, loaded, 1500);
    }

    setImmediate(async () => {
      try {
        await Chat.updateMany(
          {
            roomId,
            sender: { $ne: userId },
            "readBy.userId": { $ne: userId },
          },
          {
            $addToSet: {
              readBy: {
                userId,
                readAt: new Date(),
              },
            },
          },
        );

        __chatPerfCache.delete(`rooms:${String(userId)}`);
      } catch (error) {
        console.error("Error updating chat read state:", error);
      }
    });

    res.status(200).json({
      success: true,
      data: {
        messages: messages.reverse(), // 오래된 것부터 표시
        pagination: {
          total: skip + messages.length + (hasMore ? 1 : 0),
          page,
          limit,
          pages: hasMore ? page + 1 : page,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "메시지 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 채팅방에 메시지 전송
 * @route POST /api/chats/rooms/:roomId/messages
 */
export async function sendChatMessage(req, res) {
  try {
    const { roomId } = req.params;
    const { content, attachments } = req.body;
    const userId = req.user._id;
    const userRole = req.user.role;

    const normalizedContent = String(content || "").trim();
    const normalizedAttachments = Array.isArray(attachments)
      ? attachments
          .map((row) => ({
            fileId: row?.fileId || null,
            fileName: String(row?.fileName || "").trim(),
            fileType: String(row?.fileType || "application/octet-stream").trim(),
            fileSize: Number(row?.fileSize || 0),
            s3Key: String(row?.s3Key || "").trim(),
            s3Url: String(row?.s3Url || "").trim(),
          }))
          .filter((row) => row.fileName && row.s3Key)
      : [];

    // 텍스트 또는 첨부 중 하나는 필수
    if (!normalizedContent && normalizedAttachments.length === 0) {
      return res.status(400).json({
        success: false,
        message: "메시지 내용 또는 첨부 파일이 필요합니다.",
      });
    }

    // ObjectId 유효성 검사
    if (!Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 채팅방 ID입니다.",
      });
    }

    // 채팅방 존재 및 참여자 확인
    const room = await ChatRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: "채팅방을 찾을 수 없습니다.",
      });
    }

    const isParticipant = room.participants.some(
      (p) => p.toString() === userId.toString(),
    );

    if (!isParticipant && userRole !== "admin") {
      return res.status(403).json({
        success: false,
        message: "이 채팅방에 메시지를 보낼 권한이 없습니다.",
      });
    }

    // 채팅방 상태 확인
    if (room.status === "suspended" && userRole !== "admin") {
      return res.status(403).json({
        success: false,
        message: "이 채팅방은 일시정지 상태입니다.",
      });
    }

    // 메시지 생성
    const newMessage = new Chat({
      roomId,
      sender: userId,
      content: normalizedContent || "[파일 첨부]",
      attachments: normalizedAttachments,
      readBy: [{ userId, readAt: new Date() }],
    });

    await newMessage.save();

    const populatedMessage = await Chat.findById(newMessage._id)
      .select({
        _id: 1,
        roomId: 1,
        sender: 1,
        content: 1,
        attachments: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      .populate("sender", "name role")
      .lean();

    const participantIds = Array.isArray(room.participants)
      ? room.participants.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    invalidateChatPerfForUsers(participantIds);
    invalidateChatPerfCacheByPrefix(`room-messages:${String(roomId)}:`);

    res.status(201).json({
      success: true,
      data: populatedMessage,
      message: "메시지가 성공적으로 전송되었습니다.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "메시지 전송 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 채팅방 상태 변경 (Admin 전용)
 * @route PATCH /api/chats/rooms/:roomId/status
 */
export async function updateChatRoomStatus(req, res) {
  try {
    const { roomId } = req.params;
    const { status } = req.body;

    if (!["active", "suspended", "monitored"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 상태입니다.",
      });
    }

    const room = await ChatRoom.findByIdAndUpdate(
      roomId,
      { status },
      { new: true },
    )
      .populate("participants", "name email role business")
      .populate("relatedRequestId", "requestId title");

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "채팅방을 찾을 수 없습니다.",
      });
    }

    res.status(200).json({
      success: true,
      data: room,
      message: "채팅방 상태가 변경되었습니다.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "채팅방 상태 변경 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 모든 채팅방 조회 (Admin 전용)
 * @route GET /api/chats/rooms/all
 */
export async function getAllChatRooms(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const status = req.query.status;

    const filter = { isArchived: false };
    if (status) {
      filter.status = status;
    }

    const rooms = await ChatRoom.find(filter)
      .populate("participants", "name email role business")
      .populate("relatedRequestId", "requestId title")
      .sort({ lastMessageAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await ChatRoom.countDocuments(filter);

    // 각 채팅방의 미읽음 메시지 및 마지막 메시지 조회
    const roomsWithDetails = await Promise.all(
      rooms.map(async (room) => {
        const totalMessages = await Chat.countDocuments({
          roomId: room._id,
          isDeleted: false,
        });

        const lastMessage = await Chat.findOne({ roomId: room._id })
          .sort({ createdAt: -1 })
          .populate("sender", "name role")
          .lean();

        return {
          ...room,
          totalMessages,
          lastMessage,
        };
      }),
    );

    res.status(200).json({
      success: true,
      data: {
        rooms: roomsWithDetails,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "채팅방 목록 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 사용자 검색 (채팅 상대 찾기)
 * @route GET /api/chats/search-users
 */
export async function searchUsers(req, res) {
  try {
    const { query, role } = req.query;
    const currentUserId = req.user._id;
    const currentUserRole = req.user.role;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "검색어는 최소 2자 이상이어야 합니다.",
      });
    }

    const filter = {
      _id: { $ne: currentUserId },
      active: true,
      $or: [
        { name: { $regex: query, $options: "i" } },
        { email: { $regex: query, $options: "i" } },
        { business: { $regex: query, $options: "i" } },
      ],
    };

    // Admin이 아닌 경우 Admin만 검색 가능
    if (currentUserRole !== "admin") {
      filter.role = "admin";
    } else if (role) {
      filter.role = role;
    }

    const users = await User.find(filter)
      .select("name email role business")
      .limit(20)
      .lean();

    res.status(200).json({
      success: true,
      data: users,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "사용자 검색 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export default {
  getMyChatRooms,
  getSupportRoom,
  getOrCreateRequestChatRoom,
  getOrCreatePracticeTransferChatRoom,
  createOrGetChatRoom,
  getChatMessages,
  sendChatMessage,
  updateChatRoomStatus,
  getAllChatRooms,
  searchUsers,
};

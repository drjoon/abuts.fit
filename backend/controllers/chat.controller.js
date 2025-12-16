import { Types } from "mongoose";
import ChatRoom from "../models/chatRoom.model.js";
import Chat from "../models/chat.model.js";
import User from "../models/user.model.js";

/**
 * 내 채팅방 목록 조회
 * @route GET /api/chats/rooms
 */
export async function getMyChatRooms(req, res) {
  try {
    const userId = req.user._id;

    const rooms = await ChatRoom.find({
      participants: userId,
      isArchived: false,
    })
      .populate("participants", "name email role organization")
      .populate("relatedRequestId", "requestId title")
      .sort({ lastMessageAt: -1 })
      .lean();

    // 각 채팅방의 미읽음 메시지 수 계산
    const roomsWithUnread = await Promise.all(
      rooms.map(async (room) => {
        const unreadCount = await Chat.countDocuments({
          roomId: room._id,
          sender: { $ne: userId },
          readBy: { $not: { $elemMatch: { userId } } },
        });

        // 마지막 메시지 조회
        const lastMessage = await Chat.findOne({ roomId: room._id })
          .sort({ createdAt: -1 })
          .populate("sender", "name role")
          .lean();

        return {
          ...room,
          unreadCount,
          lastMessage,
        };
      })
    );

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
        (id) => id !== currentUserId.toString()
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
      (id) => new Types.ObjectId(id)
    );

    // 기존 채팅방 찾기 (같은 참여자 조합)
    const existingRoom = await ChatRoom.findOne({
      participants: {
        $all: participantObjectIds,
        $size: participantObjectIds.length,
      },
      isArchived: false,
    })
      .populate("participants", "name email role organization")
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
      .populate("participants", "name email role organization")
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
    const room = await ChatRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: "채팅방을 찾을 수 없습니다.",
      });
    }

    const isParticipant = room.participants.some(
      (p) => p.toString() === userId.toString()
    );

    if (!isParticipant && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "이 채팅방에 접근할 권한이 없습니다.",
      });
    }

    // 메시지 조회
    const messages = await Chat.find({ roomId, isDeleted: false })
      .populate("sender", "name email role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Chat.countDocuments({ roomId, isDeleted: false });

    // 메시지 읽음 처리
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
      }
    );

    res.status(200).json({
      success: true,
      data: {
        messages: messages.reverse(), // 오래된 것부터 표시
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

    // 메시지 내용 유효성 검사
    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: "메시지 내용은 필수입니다.",
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
      (p) => p.toString() === userId.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: "이 채팅방에 메시지를 보낼 권한이 없습니다.",
      });
    }

    // 채팅방 상태 확인
    if (room.status === "suspended") {
      return res.status(403).json({
        success: false,
        message: "이 채팅방은 일시정지 상태입니다.",
      });
    }

    // 메시지 생성
    const newMessage = new Chat({
      roomId,
      sender: userId,
      content: content.trim(),
      attachments: attachments || [],
      readBy: [{ userId, readAt: new Date() }],
    });

    await newMessage.save();

    const populatedMessage = await Chat.findById(newMessage._id)
      .populate("sender", "name email role")
      .lean();

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
      { new: true }
    )
      .populate("participants", "name email role organization")
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
      .populate("participants", "name email role organization")
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
      })
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
        { organization: { $regex: query, $options: "i" } },
      ],
    };

    // Admin이 아닌 경우 Admin만 검색 가능
    if (currentUserRole !== "admin") {
      filter.role = "admin";
    } else if (role) {
      filter.role = role;
    }

    const users = await User.find(filter)
      .select("name email role organization")
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

/**
 * Request 채팅에서 파일 첨부하여 메시지 추가
 * @route POST /api/requests/:id/messages/with-files
 */
export async function addRequestMessageWithFiles(req, res) {
  try {
    const requestId = req.params.id;
    const { content, attachments } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: "메시지 내용은 필수입니다.",
      });
    }

    if (!Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 의뢰 ID입니다.",
      });
    }

    const Request = (await import("../models/request.model.js")).default;
    const request = await Request.findById(requestId).populate(
      "requestor",
      "organizationId"
    );

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }

    // 접근 권한 확인
    const isRequestor =
      req.user.role === "requestor" &&
      (request.requestor._id.toString() === req.user._id.toString() ||
        (req.user.organizationId &&
          request.requestor.organizationId &&
          request.requestor.organizationId.toString() ===
            req.user.organizationId.toString()));

    const isManufacturer =
      req.user.role === "manufacturer" &&
      request.manufacturer &&
      request.manufacturer.toString() === req.user._id.toString();

    const isAdmin = req.user.role === "admin";

    if (!isRequestor && !isManufacturer && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "이 의뢰에 메시지를 추가할 권한이 없습니다.",
      });
    }

    // 메시지 추가
    const newMessage = {
      sender: req.user._id,
      content: content.trim(),
      attachments: attachments || [],
      isRead: false,
      createdAt: Date.now(),
    };

    request.messages.push(newMessage);
    const updatedRequest = await request.save();

    // 메시지 populate
    await updatedRequest.populate("messages.sender", "name email role");

    res.status(201).json({
      success: true,
      message: "메시지가 성공적으로 추가되었습니다.",
      data: updatedRequest,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "메시지 추가 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export default {
  getMyChatRooms,
  createOrGetChatRoom,
  getChatMessages,
  sendChatMessage,
  updateChatRoomStatus,
  getAllChatRooms,
  searchUsers,
  addRequestMessageWithFiles,
};

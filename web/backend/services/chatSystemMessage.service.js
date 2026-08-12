// related files:
// - web/backend/models/chat.model.js
// - web/backend/models/chatRoom.model.js
// - web/backend/controllers/chats/chat.controller.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
import { Types } from "mongoose";
import Chat from "../models/chat.model.js";
import ChatRoom from "../models/chatRoom.model.js";
import { emitAppEventToUser, emitToUser } from "../socket.js";

const CHAT_MESSAGE_LIST_SELECT = {
  _id: 1,
  roomId: 1,
  sender: 1,
  messageKind: 1,
  systemEvent: 1,
  content: 1,
  attachments: 1,
  replyTo: 1,
  reactions: 1,
  createdAt: 1,
  updatedAt: 1,
};

const populateChatMessageRelations = (query) =>
  query
    .populate("sender", "name role")
    .populate({
      path: "replyTo",
      select: "_id content sender isDeleted",
      populate: { path: "sender", select: "name role" },
    });

const emitChatMessageCreated = ({
  participantIds,
  senderId,
  roomId,
  message,
  relatedPracticeTransferId,
}) => {
  const ids = (Array.isArray(participantIds) ? participantIds : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean);
  if (!ids.length) return;

  const normalizedSenderId = String(senderId || "").trim();
  const payload = {
    roomId: String(roomId || "").trim(),
    senderId: normalizedSenderId,
    relatedPracticeTransferId: String(relatedPracticeTransferId || "").trim() || null,
    message: message || null,
    timestamp: new Date().toISOString(),
  };

  ids.forEach((participantId) => {
    emitAppEventToUser(participantId, "chat:message-created", payload);
    if (participantId !== normalizedSenderId) {
      emitToUser(participantId, "notification", {
        type: "new-message",
        roomId: payload.roomId,
        message: payload.message,
        timestamp: new Date(),
      });
    }
  });
};

/**
 * PracticeTransfer 채팅방에 시스템 이벤트 메시지를 남긴다.
 * 유저 말풍선이 아니라 상태 변경 기록(작업취소 등)용.
 * @returns {Promise<object|null>}
 */
export async function postPracticeTransferSystemChatMessage({
  transferMongoId,
  senderUserId,
  content,
  systemEvent,
}) {
  try {
    const transferId = String(transferMongoId || "").trim();
    const senderId = String(senderUserId || "").trim();
    const text = String(content || "").trim();
    const eventKey = String(systemEvent || "").trim();
    if (
      !transferId ||
      !Types.ObjectId.isValid(transferId) ||
      !senderId ||
      !Types.ObjectId.isValid(senderId) ||
      !text ||
      !eventKey
    ) {
      return null;
    }

    const room = await ChatRoom.findOne({
      relatedPracticeTransferId: new Types.ObjectId(transferId),
      isArchived: false,
    })
      .select({ _id: 1, participants: 1, relatedPracticeTransferId: 1, status: 1 })
      .lean();
    if (!room?._id) return null;

    const roomId = room._id;
    const newMessage = new Chat({
      roomId,
      sender: new Types.ObjectId(senderId),
      messageKind: "system",
      systemEvent: eventKey,
      content: text,
      attachments: [],
      replyTo: null,
      reactions: [],
      readBy: [{ userId: new Types.ObjectId(senderId), readAt: new Date() }],
    });
    await newMessage.save();

    const now = new Date();
    await ChatRoom.updateOne({ _id: roomId }, { $set: { lastMessageAt: now } });

    const populatedMessage = await populateChatMessageRelations(
      Chat.findById(newMessage._id).select(CHAT_MESSAGE_LIST_SELECT),
    ).lean();

    const participantIds = Array.isArray(room.participants)
      ? room.participants.map((id) => String(id || "").trim()).filter(Boolean)
      : [];

    emitChatMessageCreated({
      participantIds,
      senderId,
      roomId,
      message: populatedMessage,
      relatedPracticeTransferId: room.relatedPracticeTransferId,
    });

    return populatedMessage;
  } catch (error) {
    console.warn(
      "[chat] postPracticeTransferSystemChatMessage failed",
      String(transferMongoId || ""),
      error?.message || error,
    );
    return null;
  }
}

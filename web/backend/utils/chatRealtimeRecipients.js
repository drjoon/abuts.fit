// related files:
// - web/backend/controllers/chats/chat.controller.js
// - web/backend/services/chatSystemMessage.service.js
// - web/backend/utils/practiceTransferChatAccess.js
import { Types } from "mongoose";
import User from "../models/user.model.js";
import PracticeTransfer from "../models/practiceTransfer.model.js";

const resolvePracticeUserIdsByAnchor = async (anchorId) => {
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
    .filter(Boolean);
};

const resolveRequestorUserIdsByAnchor = async (anchorId) => {
  const raw = String(anchorId || "").trim();
  if (!raw || !Types.ObjectId.isValid(raw)) return [];

  const users = await User.find({
    businessAnchorId: new Types.ObjectId(raw),
    role: { $in: ["requestor", "internalLab"] },
    active: true,
  })
    .select({ _id: 1 })
    .lean();

  return users
    .map((u) => String(u?._id || "").trim())
    .filter(Boolean);
};

/**
 * practice 전송 채팅 실시간 이벤트 수신 대상.
 * room.participants 외에 동일 치과·기공소(하청 포함) 접속 계정 전체를 포함한다.
 */
export async function resolveChatEventRecipientUserIds({
  participantIds = [],
  relatedPracticeTransferId = null,
}) {
  const idSet = new Set(
    (Array.isArray(participantIds) ? participantIds : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean),
  );

  const transferId = String(relatedPracticeTransferId || "").trim();
  if (!transferId || !Types.ObjectId.isValid(transferId)) {
    return [...idSet];
  }

  const transferDoc = await PracticeTransfer.findById(transferId)
    .select({
      practiceBusinessAnchorId: 1,
      targetLabAnchorId: 1,
      assigneeLabAnchorId: 1,
      practiceUserId: 1,
      requestorDownloadedBy: 1,
      requestorReadBy: 1,
    })
    .lean();
  if (!transferDoc) return [...idSet];

  const practiceAnchorId = String(transferDoc.practiceBusinessAnchorId || "").trim();
  const labAnchorIds = [
    String(transferDoc.targetLabAnchorId || "").trim(),
    String(transferDoc.assigneeLabAnchorId || "").trim(),
  ].filter((id) => id && Types.ObjectId.isValid(id));

  const [practiceUserIds, ...labUserIdGroups] = await Promise.all([
    practiceAnchorId ? resolvePracticeUserIdsByAnchor(practiceAnchorId) : Promise.resolve([]),
    ...[...new Set(labAnchorIds)].map((anchorId) => resolveRequestorUserIdsByAnchor(anchorId)),
  ]);

  for (const id of practiceUserIds) idSet.add(id);
  for (const group of labUserIdGroups) {
    for (const id of group) idSet.add(id);
  }

  for (const id of [
    transferDoc.practiceUserId,
    transferDoc.requestorDownloadedBy,
    transferDoc.requestorReadBy,
  ]) {
    const normalized = String(id || "").trim();
    if (normalized) idSet.add(normalized);
  }

  return [...idSet];
}

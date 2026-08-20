// related files:
// - web/backend/controllers/chats/chat.controller.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/backend/utils/requestorCapabilities.js
// change-log:
// - 2026-08-20: 기공소 변경 후 이전 기공소는 채팅방 목록·사이드바 unread에서 제외.
import { Types } from "mongoose";

/** 레거시 practice + 신규 requestor(치과 발신) 모두 전송 채팅 치과측으로 본다. */
export const isPracticeTransferChatPracticeSideRole = (role) => {
  const r = String(role || "").trim();
  return r === "practice" || r === "requestor";
};

export const isSameObjectIdText = (a, b) => {
  const left = String(a || "").trim();
  const right = String(b || "").trim();
  return Boolean(left) && left === right;
};

/**
 * 지정된 기공소(requestor businessAnchor) 구성원이면 primaryContact 해석 실패해도 채팅 참여 가능.
 * - 수행 기공소(하청 assignee) 또는 원청(targetLab, 어벗츠)
 * - internalLab(어벗츠기공소) 팀원도 원청으로 참여
 */
export const canJoinPracticeTransferAsLabPeer = ({
  currentUserId,
  currentUserRole,
  currentUserBusinessAnchorId,
  transferDoc,
}) => {
  const role = String(currentUserRole || "").trim();
  if (role !== "requestor" && role !== "internalLab") return false;

  const userId = String(currentUserId || "").trim();
  if (!userId) return false;

  const userAnchorId = String(currentUserBusinessAnchorId || "").trim();
  if (!userAnchorId || !Types.ObjectId.isValid(userAnchorId)) return false;

  const targetLabAnchorId = String(transferDoc?.targetLabAnchorId || "").trim();
  const assigneeLabAnchorId = String(
    transferDoc?.assigneeLabAnchorId || "",
  ).trim();
  if (assigneeLabAnchorId && Types.ObjectId.isValid(assigneeLabAnchorId)) {
    if (userAnchorId === assigneeLabAnchorId) return true;
  }
  if (!targetLabAnchorId || !Types.ObjectId.isValid(targetLabAnchorId)) {
    return false;
  }

  return userAnchorId === targetLabAnchorId;
};

/**
 * 동일 치과 구성원이면 전송 작성자가 아니어도 채팅 참여 가능.
 * - 작성자 본인(practiceUserId)
 * - transfer.practiceBusinessAnchorId 일치
 * - 또는 레거시(앵커 미기입) 전송의 practiceUserId가 동일 치과 멤버
 *
 * peerIds: 현재 사용자 앵커의 치과/requestor 동료 userId 목록
 */
export const canJoinPracticeTransferAsPracticePeer = ({
  currentUserId,
  currentUserRole,
  currentUserBusinessAnchorId,
  transferDoc,
  peerIds = [],
}) => {
  if (!isPracticeTransferChatPracticeSideRole(currentUserRole)) return false;

  const userId = String(currentUserId || "").trim();
  const practiceUserId = String(transferDoc?.practiceUserId || "").trim();
  if (!userId) return false;
  if (userId === practiceUserId) return true;

  const userAnchorId = String(currentUserBusinessAnchorId || "").trim();
  if (!userAnchorId || !Types.ObjectId.isValid(userAnchorId)) return false;

  const transferAnchorId = String(transferDoc?.practiceBusinessAnchorId || "").trim();
  if (transferAnchorId && transferAnchorId === userAnchorId) return true;

  if (!practiceUserId) return false;
  const ids = Array.isArray(peerIds) ? peerIds.map((id) => String(id || "").trim()) : [];
  return ids.includes(practiceUserId);
};

/**
 * 기존 방 접근: 작성자·수락 기공소 담당자·동일 치과/기공소 동료.
 * 수락 후 targetLabAnchorId가 채워진 방도 이 판정으로 합류한다.
 */
export const canAccessPracticeTransferChat = ({
  currentUserId,
  currentUserRole,
  currentUserBusinessAnchorId,
  transferDoc,
  peerIds = [],
}) => {
  const userId = String(currentUserId || "").trim();
  if (!userId || !transferDoc) return false;

  if (isSameObjectIdText(transferDoc.practiceUserId, userId)) return true;
  if (isSameObjectIdText(transferDoc.requestorDownloadedBy, userId)) return true;
  if (isSameObjectIdText(transferDoc.requestorReadBy, userId)) return true;

  return (
    canJoinPracticeTransferAsPracticePeer({
      currentUserId: userId,
      currentUserRole,
      currentUserBusinessAnchorId,
      transferDoc,
      peerIds,
    }) ||
    canJoinPracticeTransferAsLabPeer({
      currentUserId: userId,
      currentUserRole,
      currentUserBusinessAnchorId,
      transferDoc,
    })
  );
};

/**
 * 채팅방 목록/사이드바 unread용.
 * 기공소 변경 후 이전 기공소는 치과·현재 수신 기공소만 보이도록 제외한다
 * (participants에 남아도 목록·배지에서 뺀다).
 */
export const shouldListPracticeTransferChatRoomForUser = ({
  currentUserId,
  currentUserRole,
  currentUserBusinessAnchorId,
  transferDoc,
  peerIds = [],
}) => {
  if (!transferDoc) return false;

  return (
    canJoinPracticeTransferAsPracticePeer({
      currentUserId,
      currentUserRole,
      currentUserBusinessAnchorId,
      transferDoc,
      peerIds,
    }) ||
    canJoinPracticeTransferAsLabPeer({
      currentUserId,
      currentUserRole,
      currentUserBusinessAnchorId,
      transferDoc,
    }) ||
    isSameObjectIdText(transferDoc.practiceUserId, currentUserId)
  );
};

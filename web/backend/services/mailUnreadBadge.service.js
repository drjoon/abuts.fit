// related files:
// - web/backend/controllers/admin/adminCommBadges.controller.js
// - web/backend/controllers/admin/adminInboundEmail.controller.js
// - web/backend/controllers/notifications/mail.controller.js
// - web/backend/services/adminCommBadge.service.js
// change-log:
// - 2026-10-22: 관리자 메일 배지 = 수신함·스팸함 inbound 미읽음 SSOT.
import Mail from "../models/mail.model.js";
import { emitMailUnreadBadge } from "./adminCommBadge.service.js";

/** comm-badges·소켓 mail 키에 잡히는 미읽음 조건 */
export const MAIL_UNREAD_BADGE_QUERY = {
  folder: { $in: ["inbox", "spam"] },
  isRead: false,
  $or: [
    { direction: "inbound" },
    { direction: { $exists: false } },
    { direction: null },
  ],
};

export function isMailUnreadBadgeMail(mail) {
  if (!mail || mail.isRead === true) return false;
  const folder = mail.folder;
  if (folder !== "inbox" && folder !== "spam") return false;
  const dir = mail.direction;
  return dir == null || dir === "inbound";
}

export async function countMailUnreadBadge() {
  return Mail.countDocuments(MAIL_UNREAD_BADGE_QUERY);
}

/** prev/next 스냅샷으로 ±1 emit (폴더 이동·읽음 토글 SSOT) */
export function emitMailUnreadBadgeFromTransition(prev, next) {
  const was = isMailUnreadBadgeMail(prev);
  const now = isMailUnreadBadgeMail(next);
  if (!was && now) emitMailUnreadBadge(1);
  else if (was && !now) emitMailUnreadBadge(-1);
}

// related files:
// - web/frontend/src/features/chat/components/ChatMessageBubble.tsx
// - web/frontend/src/features/chat/components/chatReactions.ts
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/backend/controllers/chats/chat.controller.js

import {
  getModelExtLower,
  isModelPreviewExt,
} from "@/shared/files/modelPreviewFile";

/** 채팅 리메이크 태그 — 리액션 이모지와 동일 (BE ALLOWED_CHAT_REACTION_EMOJIS 동기화) */
export const CHAT_REMAKE_REACTION_EMOJI = "🔁" as const;

const isChatModelFileName = (fileName: unknown) =>
  isModelPreviewExt(getModelExtLower(String(fileName || "")));

export function chatAttachmentsHave3dModel(
  attachments: Array<{ fileName?: string }> | null | undefined,
): boolean {
  if (!Array.isArray(attachments) || attachments.length === 0) return false;
  return attachments.some((file) => isChatModelFileName(file?.fileName));
}

export function chatUploadItemsHave3dModel(
  items: Array<{ file?: { name?: string } }> | null | undefined,
): boolean {
  if (!Array.isArray(items) || items.length === 0) return false;
  return items.some((item) => isChatModelFileName(item?.file?.name));
}

export function messageHasRemakeReaction(
  reactions: Array<{ emoji?: string }> | null | undefined,
): boolean {
  if (!Array.isArray(reactions)) return false;
  return reactions.some(
    (row) => String(row?.emoji || "").trim() === CHAT_REMAKE_REACTION_EMOJI,
  );
}

/** 3Shape Communicate로 스캔을 보낸 뒤 플랫폼에 메타만 남길 때 채팅 안내 문구 */
export function buildChatRemakeMetaNotice(input: {
  arrivalYmd: string;
  includeCustomAbutment?: boolean;
  summaryLabel?: string;
  remakeFeeTotal?: number;
}): string {
  const arrival = String(input.arrivalYmd || "").trim();
  const parts = ["리메이크입니다."];
  const summary = String(input.summaryLabel || "").trim();
  if (summary) parts.push(`범위: ${summary}.`);
  parts.push("구강 스캔은 3Shape Communicate로 전송했습니다.");
  if (/^\d{4}-\d{2}-\d{2}$/.test(arrival)) {
    parts.push(`(도착일 ${arrival})`);
  }
  const fee = Math.max(0, Math.round(Number(input.remakeFeeTotal || 0)));
  if (fee > 0) {
    parts.push(`리메이크비 ${fee.toLocaleString("ko-KR")}원.`);
  }
  return parts.join(" ");
}

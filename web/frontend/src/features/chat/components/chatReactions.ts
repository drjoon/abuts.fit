// related files:
// - web/frontend/src/features/chat/components/ChatMessageBubble.tsx
// - web/backend/controllers/chats/chat.controller.js

/** 카톡형 간단 리액션 허용 목록 (백엔드 ALLOWED_CHAT_REACTION_EMOJIS와 동기화) */
export const CHAT_REACTION_EMOJIS = ["❤️", "👍", "👌", "😄", "😮", "😢"] as const;

export type ChatReactionEmoji = (typeof CHAT_REACTION_EMOJIS)[number];

type ReactionNameSource = {
  _id?: string;
  name?: string;
};

type ReactionMessageNameSource = {
  sender?: ReactionNameSource | null;
};

/** 채팅방 참가자·메시지 발신자에서 리액션 사용자 이름 lookup */
export function buildChatReactionUserNameById(input: {
  participants?: ReactionNameSource[];
  messages?: ReactionMessageNameSource[];
}): Record<string, string> {
  const map: Record<string, string> = {};
  for (const row of input.participants || []) {
    const id = String(row?._id || "").trim();
    const name = String(row?.name || "").trim();
    if (id && name) map[id] = name;
  }
  for (const row of input.messages || []) {
    const id = String(row?.sender?._id || "").trim();
    const name = String(row?.sender?.name || "").trim();
    if (id && name && !map[id]) map[id] = name;
  }
  return map;
}

/** 리액션 툴팁용 — 본인은 "나", 미확인은 "알 수 없음" */
export function formatReactionUserNames(
  userIds: string[],
  nameById: Record<string, string>,
  currentUserId?: string | null,
): string {
  const myId = String(currentUserId || "").trim();
  const seen = new Set<string>();
  const labels: string[] = [];

  for (const uid of userIds) {
    const id = String(uid || "").trim();
    if (!id) continue;
    const label =
      myId && id === myId
        ? "나"
        : String(nameById[id] || "").trim() || "알 수 없음";
    if (seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }

  return labels.join(", ");
}

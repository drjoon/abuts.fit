// related files:
// - web/frontend/src/features/chat/components/ChatMessageBubble.tsx
// - web/backend/controllers/chats/chat.controller.js

/** 카톡형 간단 리액션 허용 목록 (백엔드 ALLOWED_CHAT_REACTION_EMOJIS와 동기화) */
export const CHAT_REACTION_EMOJIS = ["❤️", "👍", "👌", "😄", "😮", "😢"] as const;

export type ChatReactionEmoji = (typeof CHAT_REACTION_EMOJIS)[number];

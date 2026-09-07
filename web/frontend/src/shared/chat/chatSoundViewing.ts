// related files:
// - web/frontend/src/shared/chat/chatSoundPrefs.ts
// - web/frontend/src/shared/hooks/useChatMessageSound.ts
// - web/frontend/src/features/chat/components/NewChatWidget.tsx
// change-log:
// - 2026-09-07: 보고 있는 채팅방 등록 — 해당 방 알림음 생략.

const viewingTargets = new Set<string>();

const normalize = (raw: unknown): string => String(raw || "").trim();

/** 현재 포커스/열람 중인 채팅 대상 등록·해제 */
export const setChatSoundViewingTarget = (
  targetId: string | null | undefined,
  viewing: boolean,
) => {
  const id = normalize(targetId);
  if (!id) return;
  if (viewing) viewingTargets.add(id);
  else viewingTargets.delete(id);
};

export const isChatSoundViewingTarget = (targetId: string): boolean => {
  const id = normalize(targetId);
  if (!id) return false;
  return viewingTargets.has(id);
};

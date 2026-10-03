// related files:
// - web/frontend/src/shared/chat/chatSoundPrefs.ts
// - web/frontend/src/shared/hooks/useChatMessageSound.ts
// - web/frontend/src/features/chat/components/NewChatWidget.tsx
// change-log:
// - 2026-10-03: 다른 창을 보고 있으면(포커스 없음) 열람 중이어도 알림음.

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
  if (!viewingTargets.has(id)) return false;
  if (typeof document === "undefined") return false;
  if (document.hidden) return false;
  if (typeof document.hasFocus === "function" && !document.hasFocus()) {
    return false;
  }
  return true;
};

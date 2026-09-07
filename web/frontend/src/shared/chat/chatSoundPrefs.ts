// related files:
// - web/frontend/src/shared/chat/chatSoundPlayer.ts
// - web/frontend/src/shared/hooks/useChatMessageSound.ts
// - web/frontend/src/features/settings/tabs/NotificationsTab.tsx
// change-log:
// - 2026-09-07: 채팅 알림음 — 전체 on/off · 방별 음소거(localStorage).

export type ChatSoundPrefs = {
  /** 전체 채팅 알림음. 기본 true */
  enabled: boolean;
  /** 음소거된 roomId / remote-support:{sessionId} */
  mutedTargets: string[];
};

const STORAGE_KEY = "abuts.fit.chatSound.v1";
export const CHAT_SOUND_PREFS_CHANGED_EVENT = "abuts:chat-sound-prefs";

const DEFAULT_PREFS: ChatSoundPrefs = {
  enabled: true,
  mutedTargets: [],
};

const normalizeTarget = (raw: unknown): string => String(raw || "").trim();

const sanitize = (raw: unknown): ChatSoundPrefs => {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const muted = Array.isArray(obj.mutedTargets)
    ? Array.from(
        new Set(
          obj.mutedTargets
            .map(normalizeTarget)
            .filter(Boolean)
            .slice(0, 500),
        ),
      )
    : [];
  return {
    enabled: obj.enabled === false ? false : true,
    mutedTargets: muted,
  };
};

let cache: ChatSoundPrefs | null = null;

const readFromStorage = (): ChatSoundPrefs => {
  if (typeof window === "undefined") return { ...DEFAULT_PREFS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return sanitize(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PREFS };
  }
};

export const getChatSoundPrefs = (): ChatSoundPrefs => {
  if (!cache) cache = readFromStorage();
  return cache;
};

const persist = (next: ChatSoundPrefs) => {
  cache = next;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota
  }
  window.dispatchEvent(
    new CustomEvent(CHAT_SOUND_PREFS_CHANGED_EVENT, { detail: next }),
  );
};

export const setChatSoundEnabled = (enabled: boolean): ChatSoundPrefs => {
  const prev = getChatSoundPrefs();
  const next = { ...prev, enabled: Boolean(enabled) };
  persist(next);
  return next;
};

export const setChatSoundTargetMuted = (
  targetId: string,
  muted: boolean,
): ChatSoundPrefs => {
  const id = normalizeTarget(targetId);
  const prev = getChatSoundPrefs();
  if (!id) return prev;
  const set = new Set(prev.mutedTargets);
  if (muted) set.add(id);
  else set.delete(id);
  const next = { ...prev, mutedTargets: Array.from(set) };
  persist(next);
  return next;
};

export const isChatSoundTargetMuted = (targetId: string): boolean => {
  const id = normalizeTarget(targetId);
  if (!id) return false;
  return getChatSoundPrefs().mutedTargets.includes(id);
};

export const shouldPlayChatSound = (targetId: string): boolean => {
  const prefs = getChatSoundPrefs();
  if (!prefs.enabled) return false;
  const id = normalizeTarget(targetId);
  if (!id) return false;
  if (prefs.mutedTargets.includes(id)) return false;
  return true;
};

export const remoteSupportChatSoundTarget = (sessionId: string): string => {
  const id = normalizeTarget(sessionId);
  return id ? `remote-support:${id}` : "";
};

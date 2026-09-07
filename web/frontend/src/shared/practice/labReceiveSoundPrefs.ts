// related files:
// - web/frontend/src/shared/chat/chatSoundPlayer.ts
// - web/frontend/src/shared/hooks/useLabReceiveUnreadSound.ts
// - web/frontend/src/pages/practice/components/LabReceiveUnreadNotice.tsx
// change-log:
// - 2026-09-08: 기공의뢰수신 미확인 도착 알림음 on/off (localStorage).

export type LabReceiveSoundPrefs = {
  /** 미확인 의뢰 도착 알림음. 기본 true */
  enabled: boolean;
};

const STORAGE_KEY = "abuts.fit.labReceiveSound.v1";
export const LAB_RECEIVE_SOUND_PREFS_CHANGED_EVENT =
  "abuts:lab-receive-sound-prefs";

const DEFAULT_PREFS: LabReceiveSoundPrefs = {
  enabled: true,
};

const sanitize = (raw: unknown): LabReceiveSoundPrefs => {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    enabled: obj.enabled === false ? false : true,
  };
};

let cache: LabReceiveSoundPrefs | null = null;

const readFromStorage = (): LabReceiveSoundPrefs => {
  if (typeof window === "undefined") return { ...DEFAULT_PREFS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return sanitize(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PREFS };
  }
};

export const getLabReceiveSoundPrefs = (): LabReceiveSoundPrefs => {
  if (!cache) cache = readFromStorage();
  return cache;
};

const persist = (next: LabReceiveSoundPrefs) => {
  cache = next;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota
  }
  window.dispatchEvent(
    new CustomEvent(LAB_RECEIVE_SOUND_PREFS_CHANGED_EVENT, { detail: next }),
  );
};

export const setLabReceiveSoundEnabled = (
  enabled: boolean,
): LabReceiveSoundPrefs => {
  const next = { enabled: Boolean(enabled) };
  persist(next);
  return next;
};

export const shouldPlayLabReceiveSound = (): boolean => {
  return getLabReceiveSoundPrefs().enabled;
};

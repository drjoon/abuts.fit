// related files:
// - web/frontend/src/shared/chat/chatSoundPlayer.ts
// - web/frontend/src/shared/hooks/useLabReceiveUnreadSound.ts
// - web/frontend/src/pages/practice/components/LabReceiveUnreadNotice.tsx
// - web/frontend/src/shared/components/practice/LabReceiveAlarmSettingsButton.tsx
// change-log:
// - 2026-10-03: 전체 on/off + 치과별 mutedPracticeIds (헬퍼 PC 알람과 공유).
// - 2026-09-08: 기공의뢰수신 미확인 도착 알림음 on/off (localStorage).

export type LabReceiveSoundPrefs = {
  /** 전체(모든 치과) 알림. 기본 true */
  enabled: boolean;
  /** 알림 끈 치과 businessAnchorId */
  mutedPracticeIds: string[];
};

const STORAGE_KEY = "abuts.fit.labReceiveSound.v1";
export const LAB_RECEIVE_SOUND_PREFS_CHANGED_EVENT =
  "abuts:lab-receive-sound-prefs";

const DEFAULT_PREFS: LabReceiveSoundPrefs = {
  enabled: true,
  mutedPracticeIds: [],
};

const normalizeId = (raw: unknown): string => String(raw || "").trim();

const sanitize = (raw: unknown): LabReceiveSoundPrefs => {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const muted = Array.isArray(obj.mutedPracticeIds)
    ? Array.from(
        new Set(
          obj.mutedPracticeIds
            .map(normalizeId)
            .filter(Boolean)
            .slice(0, 500),
        ),
      )
    : [];
  return {
    enabled: obj.enabled === false ? false : true,
    mutedPracticeIds: muted,
  };
};

let cache: LabReceiveSoundPrefs | null = null;

const readFromStorage = (): LabReceiveSoundPrefs => {
  if (typeof window === "undefined") return { ...DEFAULT_PREFS, mutedPracticeIds: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS, mutedPracticeIds: [] };
    return sanitize(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PREFS, mutedPracticeIds: [] };
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
  const prev = getLabReceiveSoundPrefs();
  const next = { ...prev, enabled: Boolean(enabled) };
  persist(next);
  return next;
};

export const setLabReceivePracticeMuted = (
  practiceId: string,
  muted: boolean,
): LabReceiveSoundPrefs => {
  const id = normalizeId(practiceId);
  const prev = getLabReceiveSoundPrefs();
  if (!id) return prev;
  const set = new Set(prev.mutedPracticeIds);
  if (muted) set.add(id);
  else set.delete(id);
  const next = { ...prev, mutedPracticeIds: Array.from(set) };
  persist(next);
  return next;
};

export const isLabReceivePracticeMuted = (practiceId: string): boolean => {
  const id = normalizeId(practiceId);
  if (!id) return false;
  return getLabReceiveSoundPrefs().mutedPracticeIds.includes(id);
};

export const shouldPlayLabReceiveSound = (
  practiceBusinessAnchorId?: string | null,
): boolean => {
  const prefs = getLabReceiveSoundPrefs();
  if (!prefs.enabled) return false;
  const id = normalizeId(practiceBusinessAnchorId);
  if (id && prefs.mutedPracticeIds.includes(id)) return false;
  return true;
};

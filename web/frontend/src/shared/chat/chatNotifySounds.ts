// related files:
// - web/frontend/src/shared/chat/chatSoundPlayer.ts
// - web/frontend/src/shared/practice/labReceiveSoundPrefs.ts
// - web/frontend/src/shared/components/practice/LabReceiveAlarmSettingsButton.tsx
// - bg/lab-cad-helper/win/Notify.cs
// - bg/lab-cad-helper/mac/AbutsLabHelper.swift
// change-log:
// - 2026-10-04: 알림음 샘플 5종(브라우저·헬퍼 공통 id).

export const CHAT_NOTIFY_SOUND_IDS = [
  "chime",
  "sparkle",
  "drop",
  "bell",
  "breeze",
] as const;

export type ChatNotifySoundId = (typeof CHAT_NOTIFY_SOUND_IDS)[number];

export const DEFAULT_CHAT_NOTIFY_SOUND_ID: ChatNotifySoundId = "chime";

export type ChatNotifySoundOption = {
  id: ChatNotifySoundId;
  label: string;
};

export const CHAT_NOTIFY_SOUND_OPTIONS: readonly ChatNotifySoundOption[] = [
  { id: "chime", label: "맑은 차임" },
  { id: "sparkle", label: "반짝임" },
  { id: "drop", label: "물방울" },
  { id: "bell", label: "부드러운 종" },
  { id: "breeze", label: "바람결" },
] as const;

type ToneNote = {
  freq: number;
  when: number;
  dur: number;
  peak: number;
};

/** Web Audio · 헬퍼 WAV가 같은 id·톤 스케치를 쓴다. */
export const CHAT_NOTIFY_SOUND_NOTES: Record<ChatNotifySoundId, ToneNote[]> = {
  chime: [
    { freq: 1567.98, when: 0, dur: 0.15, peak: 0.2 },
    { freq: 2349.32, when: 0.07, dur: 0.28, peak: 0.14 },
  ],
  sparkle: [
    { freq: 2093.0, when: 0, dur: 0.09, peak: 0.15 },
    { freq: 2637.02, when: 0.05, dur: 0.11, peak: 0.12 },
    { freq: 3135.96, when: 0.1, dur: 0.22, peak: 0.1 },
  ],
  drop: [
    { freq: 1174.66, when: 0, dur: 0.2, peak: 0.22 },
    { freq: 880.0, when: 0.11, dur: 0.34, peak: 0.1 },
  ],
  bell: [
    { freq: 1318.51, when: 0, dur: 0.34, peak: 0.17 },
    { freq: 1975.53, when: 0.02, dur: 0.4, peak: 0.11 },
  ],
  breeze: [
    { freq: 987.77, when: 0, dur: 0.16, peak: 0.13 },
    { freq: 1480.0, when: 0.08, dur: 0.2, peak: 0.15 },
    { freq: 1760.0, when: 0.17, dur: 0.3, peak: 0.1 },
  ],
};

export const normalizeChatNotifySoundId = (
  raw: unknown,
): ChatNotifySoundId => {
  const id = String(raw || "")
    .trim()
    .toLowerCase();
  return (CHAT_NOTIFY_SOUND_IDS as readonly string[]).includes(id)
    ? (id as ChatNotifySoundId)
    : DEFAULT_CHAT_NOTIFY_SOUND_ID;
};

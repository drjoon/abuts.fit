// related files:
// - web/frontend/src/shared/chat/chatSoundPrefs.ts
// - web/frontend/src/shared/hooks/useChatMessageSound.ts
// - web/frontend/src/shared/hooks/useLabReceiveUnreadSound.ts
// - web/frontend/src/shared/files/labHelperClient.ts
// change-log:
// - 2026-10-03: 탭 숨김 시 헬퍼 PC 알람(/notify). 보이면 브라우저 Audio.
// - 2026-09-08: 미확인 의뢰 도착음도 동일 플레이어 사용(채팅과 중복 방지).
// - 2026-09-07: 채팅 알림음 재생(부드러운 완료음) + AudioContext unlock.

import { notifyLabHelperAlarm } from "@/shared/files/labHelperClient";

const SOUND_URL = "/sounds/chat-notify.mp3";
/** 채팅·미확인 의뢰가 거의 동시에 올 때 한 번만 울리기 */
const MIN_INTERVAL_MS = 900;

let audioEl: HTMLAudioElement | null = null;
let unlocked = false;
let lastPlayedAt = 0;
let unlockBound = false;

const getAudio = (): HTMLAudioElement | null => {
  if (typeof window === "undefined") return null;
  if (!audioEl) {
    audioEl = new Audio(SOUND_URL);
    audioEl.preload = "auto";
    audioEl.volume = 0.55;
  }
  return audioEl;
};

/** 브라우저 autoplay 정책 — 첫 사용자 제스처에서 unlock */
export const unlockChatSound = () => {
  if (unlocked) return;
  const audio = getAudio();
  if (!audio) return;
  const prev = audio.volume;
  audio.volume = 0;
  const p = audio.play();
  if (p && typeof p.then === "function") {
    void p
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = prev;
        unlocked = true;
      })
      .catch(() => {
        audio.volume = prev;
      });
  } else {
    audio.pause();
    audio.currentTime = 0;
    audio.volume = prev;
    unlocked = true;
  }
};

export const bindChatSoundUnlockOnGesture = () => {
  if (typeof window === "undefined" || unlockBound) return;
  unlockBound = true;
  const once = () => {
    unlockChatSound();
    window.removeEventListener("pointerdown", once, true);
    window.removeEventListener("keydown", once, true);
  };
  window.addEventListener("pointerdown", once, true);
  window.addEventListener("keydown", once, true);
};

export type PlayChatNotifySoundOpts = {
  title?: string;
  body?: string;
};

export const playChatNotifySound = (opts?: PlayChatNotifySoundOpts) => {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastPlayedAt < MIN_INTERVAL_MS) return;
  lastPlayedAt = now;

  const hidden = typeof document !== "undefined" && document.hidden;
  if (hidden) {
    void notifyLabHelperAlarm({
      title: opts?.title || "어벗츠",
      body: opts?.body || "새 알림",
    }).then((ok) => {
      if (ok) return;
      // 헬퍼 없으면 브라우저 Audio로라도 시도
      playBrowserChatSound();
    });
    return;
  }

  playBrowserChatSound();
};

const playBrowserChatSound = () => {
  const audio = getAudio();
  if (!audio) return;

  try {
    audio.currentTime = 0;
    const p = audio.play();
    if (p && typeof p.catch === "function") {
      void p.catch(() => {
        // autoplay blocked — wait for next gesture unlock
        unlocked = false;
        bindChatSoundUnlockOnGesture();
        void notifyLabHelperAlarm({ title: "어벗츠", body: "새 알림" });
      });
    }
  } catch {
    unlocked = false;
    bindChatSoundUnlockOnGesture();
    void notifyLabHelperAlarm({ title: "어벗츠", body: "새 알림" });
  }
};

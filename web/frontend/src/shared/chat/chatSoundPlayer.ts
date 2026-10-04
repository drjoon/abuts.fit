// related files:
// - web/frontend/src/shared/chat/chatSoundPrefs.ts
// - web/frontend/src/shared/chat/chatNotifySounds.ts
// - web/frontend/src/shared/practice/labReceiveSoundPrefs.ts
// - web/frontend/src/shared/hooks/useChatMessageSound.ts
// - web/frontend/src/shared/hooks/useLabReceiveUnreadSound.ts
// - web/frontend/src/shared/files/labHelperClient.ts
// change-log:
// - 2026-10-04: 알림음 샘플 5종 + prefs.soundId. 산뜻한 톤 스케치.
// - 2026-10-03: 탁한 mp3·주파수 스윕 대신 고음 두 음 차임(유리 종).
// - 2026-10-03: HTMLAudio muted unlock 대신 AudioContext. 제스처 전에 헬퍼 /notify.
// - 2026-10-03: 포커스 없는 창은 헬퍼 OS 알림(치과·기공소 서로 다른 창).
// - 2026-09-08: 미확인 의뢰 도착음도 동일 플레이어 사용(채팅과 중복 방지).
// - 2026-09-07: 채팅 알림음 재생(부드러운 완료음) + AudioContext unlock.

import {
  CHAT_NOTIFY_SOUND_NOTES,
  DEFAULT_CHAT_NOTIFY_SOUND_ID,
  normalizeChatNotifySoundId,
  type ChatNotifySoundId,
} from "@/shared/chat/chatNotifySounds";
import { notifyLabHelperAlarm } from "@/shared/files/labHelperClient";
import { getLabReceiveSoundPrefs } from "@/shared/practice/labReceiveSoundPrefs";

/** 채팅·미확인 의뢰가 거의 동시에 올 때 한 번만 울리기 */
const MIN_INTERVAL_MS = 900;

type AudioContextCtor = typeof AudioContext;

let audioCtx: AudioContext | null = null;
let lastPlayedAt = 0;
let unlockBound = false;

const AudioContextImpl = (): AudioContextCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as Window & { webkitAudioContext?: AudioContextCtor };
  return window.AudioContext || w.webkitAudioContext || null;
};

const getCtx = (): AudioContext | null => {
  const Ctor = AudioContextImpl();
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  return audioCtx;
};

/** 브라우저 autoplay 정책 — 첫 사용자 제스처에서 AudioContext resume */
export const unlockChatSound = () => {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
};

export const bindChatSoundUnlockOnGesture = () => {
  if (typeof window === "undefined" || unlockBound) return;
  unlockBound = true;
  const once = () => {
    unlockChatSound();
  };
  window.addEventListener("pointerdown", once, true);
  window.addEventListener("keydown", once, true);
  window.addEventListener("touchend", once, true);
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) unlockChatSound();
    });
  }
};

export type PlayChatNotifySoundOpts = {
  title?: string;
  body?: string;
  href?: string;
  /** 설정 미리듣기 — 간격 제한 무시 */
  force?: boolean;
  /** 미리듣기·강제 지정. 없으면 prefs.soundId */
  soundId?: ChatNotifySoundId | string;
};

const resolveSoundId = (opts?: PlayChatNotifySoundOpts): ChatNotifySoundId => {
  if (opts?.soundId != null && String(opts.soundId).trim()) {
    return normalizeChatNotifySoundId(opts.soundId);
  }
  return normalizeChatNotifySoundId(getLabReceiveSoundPrefs().soundId);
};

const helperOpts = (opts?: PlayChatNotifySoundOpts, soundId?: ChatNotifySoundId) => ({
  title: opts?.title || "어벗츠",
  body: opts?.body || "새 알림",
  href: String(opts?.href || "").trim(),
  soundId: soundId || DEFAULT_CHAT_NOTIFY_SOUND_ID,
});

/** 고음 짧은 방 — 스윕·저음 없이 산뜻하게. */
const ping = (
  ctx: AudioContext,
  freq: number,
  when: number,
  dur: number,
  peak: number,
) => {
  const master = ctx.createGain();
  master.connect(ctx.destination);
  master.gain.setValueAtTime(0.0001, when);
  master.gain.exponentialRampToValueAtTime(peak, when + 0.008);
  master.gain.exponentialRampToValueAtTime(0.0001, when + dur);

  const partial = (ratio: number, level: number) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq * ratio;
    const g = ctx.createGain();
    g.gain.value = level;
    osc.connect(g);
    g.connect(master);
    osc.start(when);
    osc.stop(when + dur);
  };
  partial(1, 1);
  partial(2, 0.18);
  partial(3, 0.05);
};

const playTone = (ctx: AudioContext, soundId: ChatNotifySoundId) => {
  const now = ctx.currentTime;
  const notes = CHAT_NOTIFY_SOUND_NOTES[soundId] || CHAT_NOTIFY_SOUND_NOTES.chime;
  for (const note of notes) {
    ping(ctx, note.freq, now + note.when, note.dur, note.peak);
  }
};

const playBrowserChatSound = (
  opts: PlayChatNotifySoundOpts | undefined,
  soundId: ChatNotifySoundId,
) => {
  const ctx = getCtx();
  if (!ctx) {
    return;
  }

  const start = () => {
    const live = getCtx();
    if (!live || live.state !== "running") return;
    try {
      playTone(live, soundId);
    } catch {
      // autoplay/context
    }
  };

  if (ctx.state === "running") {
    start();
    return;
  }

  bindChatSoundUnlockOnGesture();
  void ctx.resume().then(() => {
    if (ctx.state === "running") start();
  });
};

export const playChatNotifySound = (opts?: PlayChatNotifySoundOpts) => {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (!opts?.force && now - lastPlayedAt < MIN_INTERVAL_MS) return;
  lastPlayedAt = now;

  const soundId = resolveSoundId(opts);
  const hidden = typeof document !== "undefined" && document.hidden;
  const unfocused =
    typeof document !== "undefined" &&
    typeof document.hasFocus === "function" &&
    !document.hasFocus();
  if (hidden || unfocused) {
    void notifyLabHelperAlarm(helperOpts(opts, soundId)).then((ok) => {
      if (ok) return;
      playBrowserChatSound(opts, soundId);
    });
    return;
  }

  playBrowserChatSound(opts, soundId);
};

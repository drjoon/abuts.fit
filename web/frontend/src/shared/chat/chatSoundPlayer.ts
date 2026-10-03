// related files:
// - web/frontend/src/shared/chat/chatSoundPrefs.ts
// - web/frontend/src/shared/hooks/useChatMessageSound.ts
// - web/frontend/src/shared/hooks/useLabReceiveUnreadSound.ts
// - web/frontend/src/shared/files/labHelperClient.ts
// change-log:
// - 2026-10-03: 탁한 mp3·주파수 스윕 대신 고음 두 음 차임(유리 종).
// - 2026-10-03: HTMLAudio muted unlock 대신 AudioContext. 제스처 전에 헬퍼 /notify.
// - 2026-10-03: 포커스 없는 창은 헬퍼 OS 알림(치과·기공소 서로 다른 창).
// - 2026-09-08: 미확인 의뢰 도착음도 동일 플레이어 사용(채팅과 중복 방지).
// - 2026-09-07: 채팅 알림음 재생(부드러운 완료음) + AudioContext unlock.

import { notifyLabHelperAlarm } from "@/shared/files/labHelperClient";

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
};

const helperOpts = (opts?: PlayChatNotifySoundOpts) => ({
  title: opts?.title || "어벗츠",
  body: opts?.body || "새 알림",
  href: String(opts?.href || "").trim(),
});

/** 고음 두 방 — 스윕·저음 없이 유리 종처럼 짧게. */
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
  master.gain.exponentialRampToValueAtTime(peak, when + 0.005);
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
  partial(2, 0.22);
  partial(3, 0.06);
};

const playTone = (ctx: AudioContext) => {
  const now = ctx.currentTime;
  ping(ctx, 1396.91, now, 0.13, 0.22);
  ping(ctx, 2093.0, now + 0.08, 0.26, 0.16);
};

const playBrowserChatSound = (opts?: PlayChatNotifySoundOpts) => {
  const ctx = getCtx();
  if (!ctx) {
    return;
  }

  const start = () => {
    const live = getCtx();
    if (!live || live.state !== "running") return;
    try {
      playTone(live);
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

  const hidden = typeof document !== "undefined" && document.hidden;
  const unfocused =
    typeof document !== "undefined" &&
    typeof document.hasFocus === "function" &&
    !document.hasFocus();
  if (hidden || unfocused) {
    void notifyLabHelperAlarm(helperOpts(opts)).then((ok) => {
      if (ok) return;
      playBrowserChatSound(opts);
    });
    return;
  }

  playBrowserChatSound(opts);
};

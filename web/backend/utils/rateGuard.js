// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/utils/boundedTtlMap.js
// 간단한 인메모리 Rate Guard
// key(예: service + 세부 식별자)별로 짧은 시간 내 과도 호출을 감지해 차단한다.

import { pruneStampListMap } from "./boundedTtlMap.js";

const WINDOW_MS = 1000; // 1초
const MAX_CALLS = 3; // 윈도 내 최대 허용 호출 수

// Gemini parseFilenames 전용 설정 (더 타이트한 제한)
const GEMINI_WINDOW_MS = 5000; // 5초
const GEMINI_MAX_CALLS = 2; // 5초당 최대 2회
const MAX_KEYS = 2000;

const history = new Map(); // key -> number[] (timestamps)

function remember(key, windowMs) {
  const now = Date.now();
  const prev = history.get(key) || [];
  const recent = prev.filter((t) => now - t <= windowMs);
  recent.push(now);
  if (history.has(key)) history.delete(key);
  history.set(key, recent);
  pruneStampListMap(history, GEMINI_WINDOW_MS, MAX_KEYS, now);
  return recent.length;
}

export function registerExternalCall(key) {
  const count = remember(key, WINDOW_MS);
  const allowed = count <= MAX_CALLS;
  return { allowed, count };
}

export function shouldBlockExternalCall(key) {
  // Gemini parseFilenames는 더 타이트한 제한 적용
  if (String(key || "").startsWith("gemini-parseFilenames:")) {
    const count = remember(key, GEMINI_WINDOW_MS);
    const blocked = count > GEMINI_MAX_CALLS;
    return { blocked, count };
  }

  const { allowed, count } = registerExternalCall(key);
  return { blocked: !allowed, count };
}

export default {
  registerExternalCall,
  shouldBlockExternalCall,
};

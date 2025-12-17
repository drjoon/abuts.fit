// 간단한 인메모리 Rate Guard
// key(예: service + 세부 식별자)별로 짧은 시간 내 과도 호출을 감지해 차단한다.

const WINDOW_MS = 1000; // 1초
const MAX_CALLS = 3; // 윈도 내 최대 허용 호출 수

// Gemini parseFilenames 전용 설정 (더 타이트한 제한)
const GEMINI_WINDOW_MS = 5000; // 5초
const GEMINI_MAX_CALLS = 2; // 5초당 최대 2회

const history = new Map(); // key -> number[] (timestamps)

export function registerExternalCall(key) {
  const now = Date.now();
  const prev = history.get(key) || [];
  const recent = prev.filter((t) => now - t <= WINDOW_MS);
  recent.push(now);
  history.set(key, recent);
  const allowed = recent.length <= MAX_CALLS;
  return { allowed, count: recent.length };
}

export function shouldBlockExternalCall(key) {
  // Gemini parseFilenames는 더 타이트한 제한 적용
  if (key.startsWith("gemini-parseFilenames:")) {
    const now = Date.now();
    const prev = history.get(key) || [];
    const recent = prev.filter((t) => now - t <= GEMINI_WINDOW_MS);
    recent.push(now);
    history.set(key, recent);
    const blocked = recent.length > GEMINI_MAX_CALLS;
    return { blocked, count: recent.length };
  }

  const { allowed, count } = registerExternalCall(key);
  return { blocked: !allowed, count };
}

export default {
  registerExternalCall,
  shouldBlockExternalCall,
};

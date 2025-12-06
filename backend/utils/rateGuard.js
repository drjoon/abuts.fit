// 간단한 인메모리 Rate Guard
// key(예: service + 세부 식별자)별로 짧은 시간 내 과도 호출을 감지해 차단한다.

const WINDOW_MS = 1000; // 1초
const MAX_CALLS = 3; // 윈도 내 최대 허용 호출 수

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
  const { allowed, count } = registerExternalCall(key);
  return { blocked: !allowed, count };
}

export default {
  registerExternalCall,
  shouldBlockExternalCall,
};

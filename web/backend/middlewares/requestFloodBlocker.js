const MAX_RECENT = 100;
const WINDOW_MS = 5000;
const MAX_REPEAT = 5;

const recentCalls = [];

/**
 * 최근 100개 API 호출 기록을 유지하며,
 * 동일 (method + path) 호출이 5초 내 5회 이상이면 차단.
 */
export function requestFloodBlocker(req, res, next) {
  const now = Date.now();
  const key = `${req.method}:${req.path}`;

  // 오래된 기록 제거 (윈도우 기준)
  while (recentCalls.length && now - recentCalls[0].ts > WINDOW_MS) {
    recentCalls.shift();
  }

  // 현재 요청 이전의 동일 key 카운트
  const recentSame = recentCalls.filter(
    (item) => item.key === key && now - item.ts <= WINDOW_MS
  );

  if (recentSame.length >= MAX_REPEAT - 1) {
    return res.status(429).json({
      message: "동일 요청이 과도하게 발생했습니다. 잠시 후 다시 시도해주세요.",
    });
  }

  // 기록 추가
  recentCalls.push({ key, ts: now });

  // 최대 100개 초과 시 앞에서 제거
  if (recentCalls.length > MAX_RECENT) {
    recentCalls.splice(0, recentCalls.length - MAX_RECENT);
  }

  next();
}

const MAX_RECENT = 300;
const WINDOW_MS = 10000; // 10초
const MAX_REPEAT = 12; // 동일 요청은 10초 내 12회까지 허용

const recentCalls = [];

function buildNormalizedQueryKey(req) {
  if (req.method !== "GET") return "";
  const entries = Object.entries(req.query || {})
    .map(([k, v]) => {
      if (Array.isArray(v)) return [k, v.map((x) => String(x))];
      return [k, String(v ?? "")];
    })
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return JSON.stringify(entries);
}

/**
 * 최근 API 호출 기록을 유지하며,
 * 동일 사용자/클라이언트 기준으로 동일 요청 반복을 단기 차단한다.
 * - key: requester + method + path + normalized query(GET)
 */
export function requestFloodBlocker(req, res, next) {
  const now = Date.now();
  const requester = String(req.user?._id || req.ip || "anonymous");
  const queryKey = buildNormalizedQueryKey(req);
  const key = `${requester}:${req.method}:${req.path}:${queryKey}`;

  // 오래된 기록 제거 (윈도우 기준)
  while (recentCalls.length && now - recentCalls[0].ts > WINDOW_MS) {
    recentCalls.shift();
  }

  // 현재 요청 이전의 동일 key 카운트
  const recentSame = recentCalls.filter(
    (item) => item.key === key && now - item.ts <= WINDOW_MS,
  );

  if (recentSame.length >= MAX_REPEAT - 1) {
    return res.status(429).json({
      message: "동일 요청이 과도하게 발생했습니다. 잠시 후 다시 시도해주세요.",
    });
  }

  // 기록 추가
  recentCalls.push({ key, ts: now });

  // 최대 N개 초과 시 앞에서 제거
  if (recentCalls.length > MAX_RECENT) {
    recentCalls.splice(0, recentCalls.length - MAX_RECENT);
  }

  next();
}

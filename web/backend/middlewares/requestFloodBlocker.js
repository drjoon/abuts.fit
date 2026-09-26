// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/utils/jwt.utils.js
import { verifyToken } from "../utils/jwt.utils.js";

const MAX_RECENT = 800;
const WINDOW_MS = 10000; // 10초
// 같은 계정으로 여러 탭이 대시보드를 동시에 열면 엔드포인트당 10회를 넘긴다.
// 40이면 탭 폭주는 통과하고, 초당 4회를 넘는 반복만 막는다.
const MAX_REPEAT = 40;

const recentCalls = [];

/**
 * 이 미들웨어는 라우트 `authenticate`보다 앞에 붙어 req.user가 비어 있다.
 * IP만 쓰면 로컬·같은 NAT의 여러 계정이 한 버킷을 공유해
 * GET /api/credits/settings 같은 대시보드 조회가 429가 된다.
 */
function resolveRequesterId(req) {
  if (req.user?._id) return String(req.user._id);

  const authHeader = req.headers?.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    if (token) {
      try {
        const decoded = verifyToken(token);
        const userId = decoded?.userId || decoded?.id;
        if (userId && !Array.isArray(userId)) return String(userId);
      } catch {
        // 서명 실패·만료는 익명(IP) 버킷으로 센다.
      }
    }
  }

  return String(req.ip || "anonymous");
}

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
  const requester = resolveRequesterId(req);
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

  if (recentSame.length >= MAX_REPEAT) {
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

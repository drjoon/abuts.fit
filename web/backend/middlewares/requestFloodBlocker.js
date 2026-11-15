// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/utils/jwt.utils.js
import { verifyToken } from "../utils/jwt.utils.js";
import {
  bindDdosIpBanApply,
  saveDdosIpBan,
  warnDdosIpBanSaveFailure,
} from "../services/ddosIpBan.store.js";

const MAX_RECENT = 800;
const WINDOW_MS = 10000; // 10초
const BURST_MS = 1000;
// 같은 계정으로 여러 탭이 대시보드를 동시에 열면 엔드포인트당 10회를 넘긴다.
// 10초 40회는 탭 폭주를 통과시키고, 1초 8회는 렌더·효과 루프만 막는다.
const MAX_REPEAT = 40;
const BURST_MAX = 8;

const IP_MAX = 2000;
const VOLUME_WINDOW_MS = 10000;
const VOLUME_MAX = 1200;
const STRIKE_GAP_MS = 10000;
const STRIKE_WINDOW_MS = 10 * 60 * 1000;
const STRIKES_TO_BAN = 3;
const BAN_STEPS_MS = [60 * 60 * 1000, 6 * 60 * 60 * 1000, 24 * 60 * 60 * 1000];
const LOOPBACK_BAN_MS = 2 * 60 * 1000;

const loopGuardLoggedAt = new Map();
const recentCalls = [];

export function clientIp(req) {
  return String(req.ip || "")
    .trim()
    .replace(/^::ffff:/i, "");
}

export function isLoopbackIp(ip) {
  return ip === "127.0.0.1" || ip === "::1" || ip === "localhost";
}

function emptyIpRow(now) {
  return {
    strikes: [],
    volumeStart: now,
    volumeCount: 0,
    banUntil: 0,
    banLevel: 0,
    lastSeen: now,
    banMs: 0,
    reason: "",
  };
}

/**
 * IP 등록부. 같은 주소의 짧은 반복, 또는 주소 전체의 과다 요청이 쌓이면
 * 그 IP를 남기고 오래 막는다. 맵 크기는 IP_MAX를 넘기지 않는다.
 */
export function createAbuseRegistry() {
  const ips = new Map();

  function prune(now) {
    if (ips.size <= IP_MAX) return;
    for (const [ip, row] of ips) {
      if (row.banUntil <= now && now - row.lastSeen > STRIKE_WINDOW_MS) ips.delete(ip);
    }
    if (ips.size <= IP_MAX) return;
    const idle = [];
    for (const [ip, row] of ips) {
      if (row.banUntil <= now) idle.push([ip, row.lastSeen]);
    }
    idle.sort((a, b) => a[1] - b[1]);
    const extra = ips.size - IP_MAX;
    for (let i = 0; i < extra && i < idle.length; i += 1) ips.delete(idle[i][0]);
  }

  function startBan(row, now, reason, loopback) {
    if (row.banUntil > now) return false;
    const step = Math.min(row.banLevel, BAN_STEPS_MS.length - 1);
    const banMs = loopback ? LOOPBACK_BAN_MS : BAN_STEPS_MS[step];
    row.banUntil = now + banMs;
    row.banLevel += 1;
    row.banMs = banMs;
    row.reason = reason;
    row.strikes = [];
    row.volumeCount = 0;
    row.volumeStart = now;
    return true;
  }

  return {
    get size() {
      return ips.size;
    },
    apply(ip, { banUntilMs = 0, banLevel = 0, reason = "" } = {}, now = Date.now()) {
      const key = String(ip || "").trim();
      if (!key || isLoopbackIp(key)) return;
      prune(now);
      let row = ips.get(key);
      if (!row) {
        row = emptyIpRow(now);
        ips.set(key, row);
      }
      row.banLevel = Math.max(row.banLevel, Number(banLevel) || 0);
      const until = Number(banUntilMs) || 0;
      if (until > row.banUntil) {
        row.banUntil = until;
        row.banMs = Math.max(0, until - now);
        if (reason) row.reason = String(reason);
      }
      row.lastSeen = now;
    },
    /**
     * @returns {{ block: boolean, justBanned: boolean, banMs: number, banLevel: number, reason: string }}
     */
    observe(ip, now, { floodTrip = false, countVolume = false, loopback = false } = {}) {
      const key = String(ip || "").trim();
      if (!key) return { block: false, justBanned: false, banMs: 0, banLevel: 0, reason: "" };
      prune(now);
      let row = ips.get(key);
      if (!row) {
        row = emptyIpRow(now);
        ips.set(key, row);
      }
      row.lastSeen = now;
      if (row.banUntil > now) {
        return {
          block: true,
          justBanned: false,
          banMs: row.banUntil - now,
          banLevel: row.banLevel,
          reason: row.reason,
        };
      }

      let justBanned = false;
      if (countVolume) {
        if (now - row.volumeStart > VOLUME_WINDOW_MS) {
          row.volumeStart = now;
          row.volumeCount = 0;
        }
        row.volumeCount += 1;
        if (row.volumeCount >= VOLUME_MAX) justBanned = startBan(row, now, "volume", loopback);
      }

      if (!justBanned && floodTrip) {
        const last = row.strikes.length ? row.strikes[row.strikes.length - 1] : 0;
        if (now - last >= STRIKE_GAP_MS) row.strikes.push(now);
        row.strikes = row.strikes.filter((ts) => now - ts <= STRIKE_WINDOW_MS);
        if (row.strikes.length > STRIKES_TO_BAN) {
          row.strikes.length = STRIKES_TO_BAN;
        }
        if (row.strikes.length >= STRIKES_TO_BAN) justBanned = startBan(row, now, "repeat", loopback);
      }

      if (row.banUntil > now) {
        return {
          block: true,
          justBanned,
          banMs: row.banMs,
          banLevel: row.banLevel,
          reason: row.reason,
        };
      }
      return { block: false, justBanned: false, banMs: 0, banLevel: row.banLevel, reason: "" };
    },
  };
}

const abuseRegistry = createAbuseRegistry();

/**
 * 이 미들웨어는 라우트 `authenticate`보다 앞에 붙어 req.user가 비어 있다.
 * 같은 API 반복은 계정(토큰)으로 센다. IP만 쓰면 로컬·같은 NAT의 여러 계정이
 * 한 버킷을 공유해 대시보드 조회가 429가 된다.
 * IP 장시간 차단은 로그인 없는 대량·반복만 본다.
 * 유효한 사용자 토큰은 IP 등록·차단에서 뺀다. 프론트 버그로 의뢰자가 잠기지 않게 한다.
 */
const AUTH_RECOVERY_PATHS = new Set([
  "/auth/login",
  "/auth/practice/login",
  "/auth/refresh-token",
  "/auth/forgot-password",
  "/auth/practice/password/find",
]);

function isAuthRecoveryPath(path) {
  const value = String(path || "");
  if (AUTH_RECOVERY_PATHS.has(value)) return true;
  return value.startsWith("/auth/reset-password/");
}

function resolveUserId(req) {
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
        // 서명 실패·만료는 익명이다.
      }
    }
  }
  return "";
}

function resolveRequesterId(req) {
  return resolveUserId(req) || String(req.ip || "anonymous");
}

function rememberBan(ip, result, now, loopback) {
  if (!result?.justBanned || !ip || loopback) return;
  console.warn(
    `[ddos-guard] registered ${ip} blocked ${Math.round(result.banMs / 60000)}min (${result.reason})`,
  );
  void saveDdosIpBan({
    ip,
    banUntilMs: now + result.banMs,
    banLevel: result.banLevel,
    reason: result.reason,
  }).catch(warnDdosIpBanSaveFailure);
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

function sendBlocked(res, banMs) {
  const seconds = Math.max(1, Math.ceil((banMs || WINDOW_MS) / 1000));
  res.set("Retry-After", String(seconds));
  return res.status(429).json({
    message: "요청이 많아 잠시 접속을 제한했습니다.",
  });
}

/**
 * 최근 API 호출 기록을 유지하며,
 * 동일 사용자/클라이언트 기준으로 동일 요청 반복을 단기 차단한다.
 * 같은 IP가 반복 위반하거나 짧은 시간에 요청이 너무 많으면 그 IP를 등록하고 오래 막는다.
 * - key: requester + method + path + normalized query(GET)
 */
export function requestFloodBlocker(req, res, next) {
  // 기공소 PC 헬퍼 장기 폴링 — 반복 차단에서 제외
  if (String(req.path || "").startsWith("/lab-helper/")) {
    return next();
  }
  const now = Date.now();
  const ip = clientIp(req);
  const loopback = isLoopbackIp(ip);
  const userId = resolveUserId(req);
  if (!userId) {
    const activeBan = abuseRegistry.observe(ip, now, { countVolume: true, loopback });
    rememberBan(ip, activeBan, now, loopback);
    if (activeBan.block && !isAuthRecoveryPath(req.path)) {
      return sendBlocked(res, activeBan.banMs);
    }
  }

  const requester = userId || resolveRequesterId(req);
  const queryKey = buildNormalizedQueryKey(req);
  const key = `${requester}:${req.method}:${req.path}:${queryKey}`;

  // 오래된 기록 제거 (윈도우 기준). recentCalls는 시간순이라 앞만 본다.
  let dropped = 0;
  while (recentCalls.length && now - recentCalls[0].ts > WINDOW_MS && dropped < MAX_RECENT) {
    recentCalls.shift();
    dropped += 1;
  }

  // 현재 요청 이전의 동일 key 카운트
  const recentSame = recentCalls.filter(
    (item) => item.key === key && now - item.ts <= WINDOW_MS,
  );
  const burstSame = recentSame.filter((item) => now - item.ts <= BURST_MS);

  if (recentSame.length >= MAX_REPEAT || burstSame.length >= BURST_MAX) {
    const loggedAt = loopGuardLoggedAt.get(key) || 0;
    const floodTrip = now - loggedAt > WINDOW_MS;
    if (floodTrip) {
      loopGuardLoggedAt.set(key, now);
      console.warn(
        `[loop-guard] blocked ${req.method} ${req.originalUrl || req.path}`,
      );
    }
    const strike = userId
      ? { block: false, banMs: WINDOW_MS }
      : abuseRegistry.observe(ip, now, { floodTrip, loopback });
    if (!userId) rememberBan(ip, strike, now, loopback);
    return sendBlocked(res, strike.block ? strike.banMs : WINDOW_MS);
  }

  // 기록 추가
  recentCalls.push({ key, ts: now });

  // 최대 N개 초과 시 앞에서 제거
  if (recentCalls.length > MAX_RECENT) {
    recentCalls.splice(0, recentCalls.length - MAX_RECENT);
  }

  next();
}

bindDdosIpBanApply((rows) => {
  const now = Date.now();
  for (const row of rows) {
    abuseRegistry.apply(
      row.ip,
      {
        banUntilMs: new Date(row.banUntil).getTime(),
        banLevel: row.banLevel,
        reason: row.reason,
      },
      now,
    );
  }
});

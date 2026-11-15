// related files:
// - web/frontend/rules.md
// - web/frontend/src/main.tsx
// - web/backend/middlewares/requestFloodBlocker.js
// 같은 API가 짧은 시간에 반복되면 네트워크로 나가지 않게 끊는다.
// 효과·렌더가 다시 그려져도 서버 로그가 같은 줄로 쌓이지 않게 하는 장치다.

const WINDOW_MS = 1000;
const MAX_CALLS = 8;
const BLOCK_MS = 8000;
const SCAN_MS = 5000;

type Bucket = {
  times: number[];
  blockedUntil: number;
  reportedAt: number;
};

const buckets = new Map<string, Bucket>();

export function fetchGuardKey(url: string, method: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url, "http://local");
  } catch {
    return null;
  }
  if (!parsed.pathname.startsWith("/api/")) return null;
  const verb = (method || "GET").toUpperCase();
  return `${verb} ${parsed.pathname}${parsed.search}`;
}

/** 호출 기록을 보고 막아야 하면 true. 주기 점검도 이 함수를 쓴다. */
export function noteFetchGuard(key: string, now = Date.now()): boolean {
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { times: [], blockedUntil: 0, reportedAt: 0 };
    buckets.set(key, bucket);
  }
  if (bucket.blockedUntil > now) return true;

  bucket.times = bucket.times.filter((ts) => now - ts <= WINDOW_MS);
  if (bucket.times.length >= MAX_CALLS) {
    bucket.blockedUntil = now + BLOCK_MS;
    if (now - bucket.reportedAt > BLOCK_MS) {
      bucket.reportedAt = now;
      console.error(
        `[loop-guard] blocked ${key} (${bucket.times.length} calls / ${WINDOW_MS}ms)`,
      );
    }
    return true;
  }
  bucket.times.push(now);
  return false;
}

function scanFetchGuard(now = Date.now()) {
  for (const [key, bucket] of buckets) {
    bucket.times = bucket.times.filter((ts) => now - ts <= WINDOW_MS);
    if (bucket.times.length >= MAX_CALLS) noteFetchGuard(key, now);
    if (bucket.blockedUntil <= now && bucket.times.length === 0) buckets.delete(key);
  }
}

function blockedResponse(): Response {
  return new Response(
    JSON.stringify({ message: "같은 요청이 반복되어 잠시 멈췄습니다." }),
    { status: 429, headers: { "Content-Type": "application/json" } },
  );
}

export function installFetchGuard() {
  if (typeof window === "undefined" || typeof window.fetch !== "function") return;
  const win = window as Window & { __FETCH_GUARD_INSTALLED__?: boolean };
  if (win.__FETCH_GUARD_INSTALLED__) return;
  win.__FETCH_GUARD_INSTALLED__ = true;

  const originalFetch = window.fetch.bind(window);
  window.setInterval(() => scanFetchGuard(), SCAN_MS);

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" || input instanceof URL
        ? String(input)
        : input instanceof Request
          ? input.url
          : "";
    const method =
      init?.method || (input instanceof Request ? input.method : "GET");
    const key = url ? fetchGuardKey(url, method) : null;
    if (key && noteFetchGuard(key)) return blockedResponse();
    return originalFetch(input, init);
  }) as typeof window.fetch;
}

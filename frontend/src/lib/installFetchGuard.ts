import { toast } from "@/shared/hooks/use-toast";

const WINDOW_MS = 1000; // 1초
const MAX_CALLS = 3; // 윈도 내 최대 허용 호출 수

// 과도 호출을 감시할 경로 목록 (부분 문자열 매칭)
const GUARDED_PATHS = ["/api/ai/parse-filenames"]; // 필요 시 추가

const callHistory = new Map<string, number[]>();

function shouldGuard(url: string): boolean {
  try {
    const u = new URL(url, window.location.origin);
    return GUARDED_PATHS.some((p) => u.pathname.includes(p));
  } catch {
    return GUARDED_PATHS.some((p) => url.includes(p));
  }
}

function registerCall(key: string): { allowed: boolean; count: number } {
  const now = Date.now();
  const prev = callHistory.get(key) || [];
  const recent = prev.filter((t) => now - t <= WINDOW_MS);
  recent.push(now);
  callHistory.set(key, recent);
  return { allowed: recent.length <= MAX_CALLS, count: recent.length };
}

export function installFetchGuard() {
  if (typeof window === "undefined" || typeof window.fetch !== "function") {
    return;
  }

  const originalFetch = window.fetch.bind(window);

  if ((window as any).__FETCH_GUARD_INSTALLED__) {
    return;
  }
  (window as any).__FETCH_GUARD_INSTALLED__ = true;

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" || input instanceof URL
        ? String(input)
        : String((input as Request).url);

    if (shouldGuard(url)) {
      const { allowed, count } = registerCall(url);
      if (!allowed) {
        const message = `짧은 시간 내 동일 AI API 호출이 ${count}회 이상 감지되어 차단되었습니다.`;
        console.error("[Guard] Rapid external API calls blocked", {
          url,
          count,
        });
        toast({
          title: "외부 AI API 과도 호출 감지",
          description: message,
          variant: "destructive",
        });
        return Promise.reject(new Error("Too many rapid external API calls"));
      }
    }

    return originalFetch(input as any, init as any);
  }) as typeof window.fetch;
}

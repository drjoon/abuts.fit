// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// NOTE: Legacy mock header injection removed. Standard Authorization handling only.
// change-log:
// - 2026-09-20: fetch 옵션에서 body를 rest 뒤에 두어 jsonBody가 덮어씌워지지 않게 수정.

const IN_FLIGHT = new Map<string, Promise<ApiResponse<any>>>();
const SHORT_CACHE = new Map<string, { ts: number; value: ApiResponse<any> }>();
const SHORT_CACHE_TTL_MS = 1000;
const SHORT_CACHE_MAX = 100;

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiRequestOptions extends RequestInit {
  method?: HttpMethod;
  /**
   * API base path 기준 상대 경로.
   * 예: "/api/requests/my" , "/api/ai/parse-filenames"
   */
  path: string;
  /**
   * Bearer 토큰. 전달되면 자동으로 Authorization 헤더에 붙습니다.
   */
  token?: string | null;
  /**
   * JSON body를 보낼 때 사용. 객체를 넘기면 JSON.stringify + Content-Type 설정까지 처리합니다.
   */
  jsonBody?: unknown;
  /**
   * GET 1초 캐시·동일 요청 in-flight 재사용을 건너뜁니다.
   * 방금 변이한 목록을 다시 읽을 때 사용합니다.
   */
  skipCache?: boolean;
}

export function invalidateApiGetCache(pathSubstring: string) {
  const needle = String(pathSubstring || "").trim();
  if (!needle) return;
  for (const key of Array.from(SHORT_CACHE.keys())) {
    if (key.includes(needle)) SHORT_CACHE.delete(key);
  }
  for (const key of Array.from(IN_FLIGHT.keys())) {
    if (key.includes(needle)) IN_FLIGHT.delete(key);
  }
}

export interface ApiResponse<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  raw: Response;
}

export async function apiFetch<T = any>(
  options: ApiRequestOptions,
): Promise<ApiResponse<T>> {
  const {
    path,
    method = "GET",
    token,
    jsonBody,
    headers,
    skipCache = false,
    body: rawBody,
    ...rest
  } = options;

  // path가 절대 URL이면 그대로 사용, 아니면 /api 접두사 추가
  const url = path.startsWith("http")
    ? path
    : path.startsWith("/api")
      ? path
      : `/api${path}`;

  const finalHeaders: HeadersInit = {
    ...(headers || {}),
  };

  // 토큰이 명시적으로 전달되지 않으면 localStorage에서 읽기
  let effectiveToken = token;
  if (!effectiveToken) {
    try {
      effectiveToken = localStorage.getItem("abuts_auth_token") || undefined;
    } catch {
      // ignore
    }
  }

  if (effectiveToken) {
    (finalHeaders as any)["Authorization"] = `Bearer ${effectiveToken}`;
  }

  // jsonBody가 있으면 JSON으로 보내고, 아니면 호출자가 넘긴 body를 사용.
  // body는 rest에서 분리해 아래에서 마지막에 지정한다(...rest가 body를 덮어쓰지 않게).
  let body: BodyInit | undefined = rawBody as BodyInit | undefined;

  if (jsonBody !== undefined) {
    (finalHeaders as any)["Content-Type"] =
      (finalHeaders as any)["Content-Type"] || "application/json";
    body = JSON.stringify(jsonBody);
  } else if (
    body != null &&
    typeof body === "object" &&
    !(typeof Blob !== "undefined" && body instanceof Blob) &&
    !(typeof FormData !== "undefined" && body instanceof FormData) &&
    !(typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) &&
    !(typeof ArrayBuffer !== "undefined" && body instanceof ArrayBuffer) &&
    !(typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(body)) &&
    !(typeof ReadableStream !== "undefined" && body instanceof ReadableStream)
  ) {
    // 평문 객체를 body로 넘긴 호출 방어. fetch는 객체를 거절하거나 "[object Object]"로 깨진다.
    (finalHeaders as any)["Content-Type"] =
      (finalHeaders as any)["Content-Type"] || "application/json";
    body = JSON.stringify(body);
  }

  const bodyKey =
    typeof body === "string" ? body : body ? "__non_string_body__" : "";
  const requestKey = `${method}:${url}:${String(effectiveToken || "")}:${bodyKey}`;

  const isDedupeEligible =
    method === "GET" || bodyKey !== "__non_string_body__";

  const now = Date.now();
  if (method === "GET" && !skipCache) {
    const cached = SHORT_CACHE.get(requestKey);
    if (cached && now - cached.ts <= SHORT_CACHE_TTL_MS) {
      return cached.value as ApiResponse<T>;
    }
  }

  if (isDedupeEligible && !skipCache) {
    const existing = IN_FLIGHT.get(requestKey);
    if (existing) {
      return (await existing) as ApiResponse<T>;
    }
  }

  const exec = (async () => {
    const response = await fetch(url, {
      ...rest,
      method,
      headers: finalHeaders,
      cache: rest.cache ?? "no-store",
      body,
    });

    let data: any = null;
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      // response.clone()을 사용하여 원본 스트림을 보존함으로써 호출자가 raw body를 필요로 할 때 대응할 수 있게 함
      data = await response
        .clone()
        .json()
        .catch(() => null);
    }

    const out: ApiResponse<T> = {
      ok: response.ok,
      status: response.status,
      data: data as T | null,
      raw: response,
    };

    if (method === "GET" && response.ok) {
      SHORT_CACHE.set(requestKey, {
        ts: Date.now(),
        value: out as ApiResponse<any>,
      });
      if (SHORT_CACHE.size > SHORT_CACHE_MAX) {
        const keys = Array.from(SHORT_CACHE.keys());
        for (let i = 0; i < keys.length - SHORT_CACHE_MAX; i += 1) {
          SHORT_CACHE.delete(keys[i]);
        }
      }
    }

    return out;
  })();

  if (isDedupeEligible && !skipCache) {
    IN_FLIGHT.set(requestKey, exec as Promise<ApiResponse<any>>);
  }
  try {
    return (await exec) as ApiResponse<T>;
  } finally {
    if (isDedupeEligible && !skipCache) {
      IN_FLIGHT.delete(requestKey);
    }
  }
}

/**
 * 새 코드에서는 fetch 직접 사용 대신 apiFetch를 사용합니다.
 * 점진적으로 기존 fetch 호출도 apiFetch로 마이그레이션합니다.
 */
export const request = apiFetch;

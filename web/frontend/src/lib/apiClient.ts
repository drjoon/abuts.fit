import { useAuthStore } from "@/store/useAuthStore";

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
}

export interface ApiResponse<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  raw: Response;
}

export async function apiFetch<T = any>(
  options: ApiRequestOptions
): Promise<ApiResponse<T>> {
  const { path, method = "GET", token, jsonBody, headers, ...rest } = options;

  const url = path.startsWith("http") ? path : path;

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

  if (effectiveToken === "MOCK_DEV_TOKEN") {
    try {
      const stateUser = useAuthStore.getState().user;

      const role =
        stateUser?.role ||
        sessionStorage.getItem("abuts_mock_role") ||
        localStorage.getItem("abuts_mock_role") ||
        "";
      const email =
        stateUser?.email ||
        sessionStorage.getItem("abuts_mock_email") ||
        localStorage.getItem("abuts_mock_email") ||
        "";
      const name =
        stateUser?.name ||
        sessionStorage.getItem("abuts_mock_name") ||
        localStorage.getItem("abuts_mock_name") ||
        "";
      const organization =
        stateUser?.companyName ||
        sessionStorage.getItem("abuts_mock_organization") ||
        localStorage.getItem("abuts_mock_organization") ||
        "";
      const phone =
        sessionStorage.getItem("abuts_mock_phone") ||
        localStorage.getItem("abuts_mock_phone") ||
        "";
      const userId =
        stateUser?.mockUserId ||
        sessionStorage.getItem("abuts_mock_user_id") ||
        localStorage.getItem("abuts_mock_user_id") ||
        "";

      if (!(finalHeaders as any)["x-mock-role"] && role)
        (finalHeaders as any)["x-mock-role"] = role;
      if (!(finalHeaders as any)["x-mock-email"] && email)
        (finalHeaders as any)["x-mock-email"] = email;
      if (!(finalHeaders as any)["x-mock-name"] && name)
        (finalHeaders as any)["x-mock-name"] = name;
      if (!(finalHeaders as any)["x-mock-organization"] && organization)
        (finalHeaders as any)["x-mock-organization"] = organization;
      if (!(finalHeaders as any)["x-mock-phone"] && phone)
        (finalHeaders as any)["x-mock-phone"] = phone;
      if (!(finalHeaders as any)["x-mock-user-id"] && userId)
        (finalHeaders as any)["x-mock-user-id"] = userId;
    } catch {
      // ignore
    }
  }

  for (const [k, v] of Object.entries(finalHeaders as any)) {
    if (!k.toLowerCase().startsWith("x-mock-")) continue;
    if (typeof v !== "string") continue;
    (finalHeaders as any)[k] = encodeURIComponent(v);
  }

  if (effectiveToken) {
    (finalHeaders as any)["Authorization"] = `Bearer ${effectiveToken}`;
  }

  let body: BodyInit | undefined = rest.body as BodyInit | undefined;

  if (jsonBody !== undefined) {
    (finalHeaders as any)["Content-Type"] =
      (finalHeaders as any)["Content-Type"] || "application/json";
    body = JSON.stringify(jsonBody);
  }

  const bodyKey =
    typeof body === "string" ? body : body ? "__non_string_body__" : "";
  const requestKey = `${method}:${url}:${String(effectiveToken || "")}:
${bodyKey}`;

  const now = Date.now();
  if (method === "GET") {
    const cached = SHORT_CACHE.get(requestKey);
    if (cached && now - cached.ts <= SHORT_CACHE_TTL_MS) {
      return cached.value as ApiResponse<T>;
    }
  }

  const existing = IN_FLIGHT.get(requestKey);
  if (existing) {
    return (await existing) as ApiResponse<T>;
  }

  const exec = (async () => {
    const response = await fetch(url, {
      method,
      headers: finalHeaders,
      body,
      cache: rest.cache ?? "no-store",
      ...rest,
    });

    let data: any = null;
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      data = await response.json().catch(() => null);
    }

    const out: ApiResponse<T> = {
      ok: response.ok,
      status: response.status,
      data: data as T | null,
      raw: response,
    };

    if (method === "GET") {
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

  IN_FLIGHT.set(requestKey, exec as Promise<ApiResponse<any>>);
  try {
    return (await exec) as ApiResponse<T>;
  } finally {
    IN_FLIGHT.delete(requestKey);
  }
}

/**
 * 새 코드에서는 fetch 직접 사용 대신 apiFetch를 사용합니다.
 * 점진적으로 기존 fetch 호출도 apiFetch로 마이그레이션합니다.
 */
export const request = apiFetch;

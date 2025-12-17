import { useAuthStore } from "@/store/useAuthStore";

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

  if (token === "MOCK_DEV_TOKEN") {
    try {
      const stateUser = useAuthStore.getState().user;

      const role =
        stateUser?.role ||
        sessionStorage.getItem("abuts_mock_role") ||
        localStorage.getItem("abuts_mock_role") ||
        "";
      const position =
        stateUser?.position ||
        sessionStorage.getItem("abuts_mock_position") ||
        localStorage.getItem("abuts_mock_position") ||
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
      if (!(finalHeaders as any)["x-mock-position"] && position)
        (finalHeaders as any)["x-mock-position"] = position;
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

  if (token) {
    (finalHeaders as any)["Authorization"] = `Bearer ${token}`;
  }

  let body: BodyInit | undefined = rest.body as BodyInit | undefined;

  if (jsonBody !== undefined) {
    (finalHeaders as any)["Content-Type"] =
      (finalHeaders as any)["Content-Type"] || "application/json";
    body = JSON.stringify(jsonBody);
  }

  const response = await fetch(url, {
    method,
    headers: finalHeaders,
    body,
    ...rest,
  });

  let data: any = null;
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    data = await response.json().catch(() => null);
  }

  return {
    ok: response.ok,
    status: response.status,
    data: data as T | null,
    raw: response,
  };
}

/**
 * 새 코드에서는 fetch 직접 사용 대신 apiFetch를 사용합니다.
 * 점진적으로 기존 fetch 호출도 apiFetch로 마이그레이션합니다.
 */
export const request = apiFetch;

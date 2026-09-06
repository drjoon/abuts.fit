// related files:
// - web/backend/modules/remoteSupport/remoteSupport.routes.js
import { apiFetch } from "@/shared/api/apiClient";

type ApiOk<T> = { success?: boolean; data?: T; message?: string };

async function rsFetch<T>(
  token: string | null | undefined,
  path: string,
  init?: { method?: string; jsonBody?: unknown; skipCache?: boolean },
): Promise<T> {
  const res = await apiFetch<ApiOk<T>>({
    path,
    method:
      (init?.method as "GET" | "POST" | "PATCH" | "PUT" | "DELETE") || "GET",
    token,
    jsonBody: init?.jsonBody,
    skipCache: init?.skipCache,
  });
  if (!res.ok) {
    throw new Error(
      (res.data as ApiOk<T>)?.message || "요청에 실패했습니다.",
    );
  }
  return (res.data as ApiOk<T>)?.data as T;
}

export type RemoteSupportStatus =
  | "pending"
  | "accepted"
  | "active"
  | "ended"
  | "cancelled"
  | "declined";

export type RemoteSupportSession = {
  _id: string;
  status: RemoteSupportStatus;
  initiatedBy: "staff" | "admin";
  requesterId:
    | string
    | { _id: string; name?: string; email?: string; role?: string; requestorKind?: string };
  adminId?:
    | string
    | null
    | { _id: string; name?: string; email?: string; role?: string };
  requesterSnapshot?: {
    name?: string;
    role?: string;
    requestorKind?: "practice" | "lab" | null;
    businessAnchorId?: string | null;
    businessName?: string;
  };
  requestedAt?: string;
  acceptedAt?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  durationMs?: number | null;
  notes?: string;
  ideaTags?: string[];
  messages?: RemoteSupportMessage[];
  endedBy?: "requester" | "admin" | "system" | null;
};

export type RemoteSupportMessage = {
  _id?: string;
  sessionId?: string;
  senderId:
    | string
    | { _id: string; name?: string; role?: string };
  content: string;
  createdAt?: string;
};

export type RemoteSupportStats = {
  totals: {
    count: number;
    totalDurationMs: number;
    avgDurationMs: number;
  };
  byAdmin: Array<{
    adminId: string;
    adminName?: string;
    count: number;
    totalDurationMs: number;
    avgDurationMs: number;
  }>;
  ideaTags: Array<{ tag: string; count: number }>;
};

export function sessionUserId(
  ref: RemoteSupportSession["requesterId"] | RemoteSupportSession["adminId"],
): string {
  if (!ref) return "";
  if (typeof ref === "string") return ref;
  return String(ref._id || "");
}

export function sessionUserName(
  ref: RemoteSupportSession["requesterId"] | RemoteSupportSession["adminId"],
  fallback = "",
): string {
  if (!ref || typeof ref === "string") return fallback;
  return String(ref.name || fallback);
}

export const remoteSupportApi = {
  iceConfig: (token: string | null) =>
    rsFetch<{ iceServers: RTCIceServer[] }>(token, "/api/remote-support/ice-config", {
      skipCache: true,
    }),

  createSession: (token: string | null) =>
    rsFetch<RemoteSupportSession>(token, "/api/remote-support/sessions", {
      method: "POST",
    }),

  invite: (token: string | null, userId: string) =>
    rsFetch<RemoteSupportSession>(token, "/api/remote-support/sessions/invite", {
      method: "POST",
      jsonBody: { userId },
    }),

  accept: (token: string | null, id: string) =>
    rsFetch<RemoteSupportSession>(
      token,
      `/api/remote-support/sessions/${id}/accept`,
      { method: "POST" },
    ),

  decline: (token: string | null, id: string) =>
    rsFetch<RemoteSupportSession>(
      token,
      `/api/remote-support/sessions/${id}/decline`,
      { method: "POST" },
    ),

  start: (token: string | null, id: string) =>
    rsFetch<RemoteSupportSession>(
      token,
      `/api/remote-support/sessions/${id}/start`,
      { method: "POST" },
    ),

  end: (
    token: string | null,
    id: string,
    body?: { notes?: string; ideaTags?: string[] },
  ) =>
    rsFetch<RemoteSupportSession>(
      token,
      `/api/remote-support/sessions/${id}/end`,
      { method: "POST", jsonBody: body },
    ),

  updateNotes: (
    token: string | null,
    id: string,
    body: { notes?: string; ideaTags?: string[] },
  ) =>
    rsFetch<RemoteSupportSession>(token, `/api/remote-support/sessions/${id}`, {
      method: "PATCH",
      jsonBody: body,
    }),

  list: (
    token: string | null,
    query?: { status?: string; q?: string; from?: string; to?: string; limit?: number },
  ) => {
    const params = new URLSearchParams();
    if (query?.status) params.set("status", query.status);
    if (query?.q) params.set("q", query.q);
    if (query?.from) params.set("from", query.from);
    if (query?.to) params.set("to", query.to);
    if (query?.limit) params.set("limit", String(query.limit));
    const qs = params.toString();
    return rsFetch<RemoteSupportSession[]>(
      token,
      `/api/remote-support/sessions${qs ? `?${qs}` : ""}`,
      { skipCache: true },
    );
  },

  mine: (token: string | null) =>
    rsFetch<RemoteSupportSession[]>(token, "/api/remote-support/sessions/mine", {
      skipCache: true,
    }),

  get: (token: string | null, id: string) =>
    rsFetch<RemoteSupportSession>(
      token,
      `/api/remote-support/sessions/${id}`,
      { skipCache: true },
    ),

  postMessage: (token: string | null, id: string, content: string) =>
    rsFetch<RemoteSupportMessage>(
      token,
      `/api/remote-support/sessions/${id}/messages`,
      { method: "POST", jsonBody: { content } },
    ),

  stats: (token: string | null, query?: { from?: string; to?: string }) => {
    const params = new URLSearchParams();
    if (query?.from) params.set("from", query.from);
    if (query?.to) params.set("to", query.to);
    const qs = params.toString();
    return rsFetch<RemoteSupportStats>(
      token,
      `/api/remote-support/stats${qs ? `?${qs}` : ""}`,
      { skipCache: true },
    );
  },

  searchUsers: (token: string | null, q: string) =>
    rsFetch<
      Array<{
        _id: string;
        name?: string;
        email?: string;
        role?: string;
        requestorKind?: string;
      }>
    >(
      token,
      `/api/remote-support/users/search?q=${encodeURIComponent(q)}`,
      { skipCache: true },
    ),
};

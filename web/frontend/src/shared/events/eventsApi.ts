// related files:
// - web/backend/modules/events/event.routes.js
// - web/backend/modules/admin/admin.routes.js
import { apiFetch } from "@/shared/api/apiClient";

type ApiOk<T> = { success?: boolean; data?: T; message?: string };

async function eventsFetch<T>(
  path: string,
  init?: {
    method?: string;
    jsonBody?: unknown;
    token?: string | null;
  },
): Promise<T> {
  const res = await apiFetch<ApiOk<T>>({
    path,
    method:
      (init?.method as "GET" | "POST" | "PATCH" | "PUT" | "DELETE") || "GET",
    token: init?.token,
    jsonBody: init?.jsonBody,
  });
  if (!res.ok) {
    throw new Error((res.data as ApiOk<T>)?.message || "요청에 실패했습니다.");
  }
  return (res.data as ApiOk<T>)?.data as T;
}

export type EventPlaceSuggest = {
  source: "kakao";
  name: string;
  kind: "practice" | "dealer" | "lab";
  representativeName?: string;
  phone?: string;
  address?: string;
  lat?: number | null;
  lng?: number | null;
  label?: string;
};

export type EventPlaceFields = {
  name: string;
  representativeName: string;
  phone: string;
  address: string;
  lat: number | null;
  lng: number | null;
};

export type MarketingEvent = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  status: "draft" | "open" | "closed";
  startsAt?: string | null;
  endsAt?: string | null;
  coverImageUrl?: string;
  formConfig: {
    requirePractice: boolean;
    requireDealer: boolean;
    dealerHelpText: string;
  };
  applicationCount?: number;
  sortOrder?: number;
};

export type EventApplication = {
  id: string;
  eventId: string;
  eventSlug: string;
  practice: EventPlaceFields;
  directorName: string;
  dealer: EventPlaceFields;
  usesOralScan?: boolean;
  applicantPhone: string;
  applicantEmail: string;
  memo: string;
  status: "received" | "reviewed" | "fulfilled" | "rejected";
  adminNote: string;
  practiceRegistered?: boolean;
  dealerRegistered?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type EventApplicationStats = {
  total: number;
  withDealer: number;
  oralScanYes: number;
  oralScanRate: number;
  practiceRegistered: number;
  practiceSignupRate: number;
  dealerRegistered: number;
  dealerSignupRate: number;
};

export const eventsApi = {
  listPublic: () =>
    eventsFetch<{ items: MarketingEvent[] }>("/api/events"),

  getPublic: (slug: string) =>
    eventsFetch<MarketingEvent>(`/api/events/${encodeURIComponent(slug)}`),

  suggestPlaces: (q: string, kind: "practice" | "dealer") => {
    const sp = new URLSearchParams();
    sp.set("q", q);
    sp.set("kind", kind);
    return eventsFetch<{
      items: EventPlaceSuggest[];
      authError?: boolean;
      keyMissing?: boolean;
    }>(`/api/events/places/suggest?${sp.toString()}`);
  },

  apply: (
    slug: string,
    body: {
      practice: Partial<EventPlaceFields>;
      directorName: string;
      dealer: Partial<EventPlaceFields>;
      applicantPhone?: string;
      applicantEmail?: string;
      memo?: string;
      usesOralScan: boolean;
    },
    token?: string | null,
  ) =>
    eventsFetch<EventApplication>(
      `/api/events/${encodeURIComponent(slug)}/applications`,
      { method: "POST", jsonBody: body, token },
    ),

  myApplication: (slug: string, token: string | null) =>
    eventsFetch<{
      applied: boolean;
      application: EventApplication | null;
      event: MarketingEvent;
    }>(`/api/events/${encodeURIComponent(slug)}/my-application`, { token }),

  adminList: (token: string | null) =>
    eventsFetch<{ items: MarketingEvent[] }>("/api/admin/events", { token }),

  adminUpdate: (
    token: string | null,
    id: string,
    body: Partial<{
      title: string;
      summary: string;
      description: string;
      status: MarketingEvent["status"];
      formConfig: Partial<MarketingEvent["formConfig"]>;
    }>,
  ) =>
    eventsFetch<MarketingEvent>(`/api/admin/events/${encodeURIComponent(id)}`, {
      method: "PATCH",
      token,
      jsonBody: body,
    }),

  adminListApplications: (
    token: string | null,
    eventId: string,
    params?: { q?: string; status?: string },
  ) => {
    const sp = new URLSearchParams();
    if (params?.q) sp.set("q", params.q);
    if (params?.status) sp.set("status", params.status);
    const qs = sp.toString();
    return eventsFetch<{
      event: MarketingEvent;
      items: EventApplication[];
      stats?: EventApplicationStats;
    }>(
      `/api/admin/events/${encodeURIComponent(eventId)}/applications${
        qs ? `?${qs}` : ""
      }`,
      { token },
    );
  },

  adminUpdateApplication: (
    token: string | null,
    applicationId: string,
    body: Partial<{ status: EventApplication["status"]; adminNote: string }>,
  ) =>
    eventsFetch<EventApplication>(
      `/api/admin/events/applications/${encodeURIComponent(applicationId)}`,
      { method: "PATCH", token, jsonBody: body },
    ),
};

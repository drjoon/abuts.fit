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
  visitCount?: number;
  sortOrder?: number;
};

export type EventApplication = {
  id: string;
  eventId: string;
  eventSlug: string;
  practice: EventPlaceFields;
  directorName: string;
  dealer: EventPlaceFields;
  usesOralScan?: boolean | null;
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

export type EventVisitReport = {
  eventId: string;
  slug: string;
  days: number;
  from: string;
  to: string;
  summary: {
    pageViews: number;
    sessions: number;
    uniqueVisitors: number;
    returning: number;
    applications: number;
    conversionRate: number;
    avgDwellMs: number;
    bounces: number;
  };
  funnel: {
    sessions: number;
    reachedApply: number;
    formStarted: number;
    converted: number;
  };
  hours: {
    hour: number;
    pageViews: number;
    sessions: number;
    applications: number;
    rate: number;
  }[];
  daily: {
    date: string;
    pageViews: number;
    sessions: number;
    applications: number;
    converted: number;
    rate: number;
  }[];
  regions: { label: string; country: string; sessions: number; converted: number }[];
  sources: { label: string; sessions: number; converted: number }[];
  devices: { device: string; sessions: number }[];
  pages: { label: string; sessions: number }[];
  routes: { path: string; label: string; sessions: number }[];
  recent: {
    id: string;
    startedAt?: string;
    dwellMs: number;
    place: string;
    device: string;
    source: string;
    stage: string;
    returning: boolean;
    visits: number;
    pages: string[];
    routes: string[];
  }[];
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

  signupApply: (
    slug: string,
    body: {
      email: string;
      password: string;
      directorName: string;
      phone: string;
      clinicName: string;
      address: string;
      lat: number | null;
      lng: number | null;
      usesOralScan: boolean;
      /** 카카오에서 주소를 찾지 못해 직접 입력한 경우 */
      manualAddress?: boolean;
      visitSessionId?: string;
    },
  ) =>
    eventsFetch<{ token: string; refreshToken?: string | null }>(
      `/api/events/${encodeURIComponent(slug)}/signup-apply`,
      { method: "POST", jsonBody: body },
    ),

  apply: (
    slug: string,
    body: {
      practice: Partial<EventPlaceFields>;
      directorName: string;
      dealer: Partial<EventPlaceFields>;
      applicantPhone?: string;
      applicantEmail?: string;
      memo?: string;
      /**
       * 프로필·사업자에 구강 스캔 값이 없을 때만 전달.
       * 있으면 신청 시 스냅샷.
       */
      usesOralScan?: boolean;
      visitSessionId?: string;
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
      /** 저장된 구강 스캔 값. 없으면 null — 신청 폼은 항상 표시하고 이 값으로 기본 선택 */
      usesOralScan?: boolean | null;
      /** 로그인 치과 사업자(BA) 이름. 신청 치과명으로 저장한다. */
      businessName?: string;
      /** 프로필 주소가 없으면 사업자 주소. 있으면 그 주소로 검색을 생략한다. */
      businessAddress?: string;
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

  adminVisits: (
    token: string | null,
    eventId: string,
    days: 1 | 7 | 30,
  ) => {
    const sp = new URLSearchParams();
    sp.set("days", String(days));
    const qs = sp.toString();
    return eventsFetch<EventVisitReport>(
      `/api/admin/events/${encodeURIComponent(eventId)}/visits${
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

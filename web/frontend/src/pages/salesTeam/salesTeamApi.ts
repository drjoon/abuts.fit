// related files:
// - web/backend/modules/salesTeam/salesTeam.routes.js
import { apiFetch } from "@/shared/api/apiClient";

type ApiOk<T> = { success?: boolean; data?: T; message?: string };

async function salesFetch<T>(
  token: string | null | undefined,
  path: string,
  init?: { method?: string; jsonBody?: unknown },
): Promise<T> {
  const res = await apiFetch<ApiOk<T>>({
    path,
    method: (init?.method as "GET" | "POST" | "PATCH" | "PUT" | "DELETE") || "GET",
    token,
    jsonBody: init?.jsonBody,
  });
  if (!res.ok) {
    throw new Error(
      (res.data as ApiOk<T>)?.message || "요청에 실패했습니다.",
    );
  }
  return (res.data as ApiOk<T>)?.data as T;
}

export type SalesAccount = {
  _id: string;
  kind: "practice" | "lab";
  name: string;
  representativeName?: string;
  phone?: string;
  address?: string;
  lat?: number | null;
  lng?: number | null;
  memo?: string;
  businessAnchorId?: string | null;
  ownerUserId?: string;
  teamVisible?: boolean;
  updatedAt?: string;
};

export type SalesVisit = {
  _id: string;
  accountId:
    | SalesAccount
    | string
    | null;
  assigneeUserId?: string;
  plannedAt: string;
  commitment: "confirmed" | "around" | "askBefore";
  status: "planned" | "done" | "canceled" | "noShow";
  memo?: string;
  completedAt?: string | null;
};

export type SalesDailyReport = {
  _id?: string;
  reportYmd: string;
  visitSummary?: string;
  issues?: string;
  tomorrowPlan?: string;
  submittedAt?: string;
};

export type SalesPlaceSuggest = {
  source: "account" | "platform" | "kakao";
  accountId?: string | null;
  businessAnchorId?: string | null;
  name: string;
  kind: "practice" | "lab";
  representativeName?: string;
  phone?: string;
  address?: string;
  lat?: number | null;
  lng?: number | null;
  label?: string;
};

export const salesTeamApi = {
  home: (token: string | null) =>
    salesFetch<{
      todayYmd: string;
      todayVisits: SalesVisit[];
      dailyReportSubmitted: boolean;
      weekReferralSignups: number;
      referralCode: string | null;
    }>(token, "/api/sales-team/home"),

  listAccounts: (
    token: string | null,
    params?: { q?: string; kind?: string; join?: string },
  ) => {
    const sp = new URLSearchParams();
    if (params?.q) sp.set("q", params.q);
    if (params?.kind) sp.set("kind", params.kind);
    if (params?.join) sp.set("join", params.join);
    const qs = sp.toString();
    return salesFetch<{ items: SalesAccount[] }>(
      token,
      `/api/sales-team/accounts${qs ? `?${qs}` : ""}`,
    );
  },

  getAccount: (token: string | null, id: string) =>
    salesFetch<SalesAccount>(token, `/api/sales-team/accounts/${id}`),

  createAccount: (token: string | null, body: Partial<SalesAccount>) =>
    salesFetch<SalesAccount>(token, "/api/sales-team/accounts", {
      method: "POST",
      jsonBody: body,
    }),

  updateAccount: (
    token: string | null,
    id: string,
    body: Partial<SalesAccount>,
  ) =>
    salesFetch<SalesAccount>(token, `/api/sales-team/accounts/${id}`, {
      method: "PATCH",
      jsonBody: body,
    }),

  deleteAccount: (token: string | null, id: string) =>
    salesFetch<unknown>(token, `/api/sales-team/accounts/${id}`, {
      method: "DELETE",
    }),

  listVisits: (
    token: string | null,
    params?: { fromYmd?: string; toYmd?: string; status?: string },
  ) => {
    const sp = new URLSearchParams();
    if (params?.fromYmd) sp.set("fromYmd", params.fromYmd);
    if (params?.toYmd) sp.set("toYmd", params.toYmd);
    if (params?.status) sp.set("status", params.status);
    const qs = sp.toString();
    return salesFetch<{ items: SalesVisit[] }>(
      token,
      `/api/sales-team/visits${qs ? `?${qs}` : ""}`,
    );
  },

  createVisit: (
    token: string | null,
    body: {
      accountId: string;
      plannedAt: string;
      commitment?: string;
      memo?: string;
    },
  ) =>
    salesFetch<SalesVisit>(token, "/api/sales-team/visits", {
      method: "POST",
      jsonBody: body,
    }),

  updateVisit: (
    token: string | null,
    id: string,
    body: Partial<{
      plannedAt: string;
      commitment: string;
      status: string;
      memo: string;
    }>,
  ) =>
    salesFetch<SalesVisit>(token, `/api/sales-team/visits/${id}`, {
      method: "PATCH",
      jsonBody: body,
    }),

  deleteVisit: (token: string | null, id: string) =>
    salesFetch<unknown>(token, `/api/sales-team/visits/${id}`, {
      method: "DELETE",
    }),

  getDailyReport: (token: string | null, ymd: string) =>
    salesFetch<{
      report: SalesDailyReport | null;
      visits: SalesVisit[];
      reportYmd: string;
    }>(token, `/api/sales-team/daily-reports/${ymd}`),

  listDailyReports: (token: string | null) =>
    salesFetch<{ items: SalesDailyReport[] }>(
      token,
      "/api/sales-team/daily-reports",
    ),

  upsertDailyReport: (
    token: string | null,
    body: {
      reportYmd?: string;
      visitSummary?: string;
      issues?: string;
      tomorrowPlan?: string;
    },
  ) =>
    salesFetch<SalesDailyReport>(token, "/api/sales-team/daily-reports", {
      method: "PUT",
      jsonBody: body,
    }),

  stats: (token: string | null, period = "30d") =>
    salesFetch<{
      visitDoneCount: number;
      visits: SalesVisit[];
      workDayCount: number;
      reportSubmittedCount: number;
      reportSubmitRate: number;
      referralSignupCount: number;
      practiceSignupCount: number;
      labSignupCount: number;
      referralOrgs: Array<{
        _id: string;
        name?: string;
        requestorKind?: string;
        createdAt?: string;
      }>;
    }>(token, `/api/sales-team/stats?period=${encodeURIComponent(period)}`),

  referral: (token: string | null) =>
    salesFetch<{
      referralCode: string;
      policyNote: string;
      organizations: Array<{
        _id: string;
        name?: string;
        requestorKind?: string;
        createdAt?: string;
      }>;
    }>(token, "/api/sales-team/referral"),

  optimizeRoute: (
    token: string | null,
    body: {
      ymd?: string;
      includeAround?: boolean;
      extraName?: string;
      extraAddress?: string;
      startAddress?: string;
      startLat?: number;
      startLng?: number;
    },
  ) =>
    salesFetch<{
      ymd: string;
      ordered: Array<{
        visitId: string | null;
        accountId: string | null;
        name: string;
        address: string;
        lat: number | null;
        lng: number | null;
        commitment: string;
        isExtra?: boolean;
        isStart?: boolean;
      }>;
      totalKm: number;
      missingCoordsCount: number;
      mapUrl: string | null;
      geocodeConfigured: boolean;
    }>(token, "/api/sales-team/route/optimize", {
      method: "POST",
      jsonBody: body,
    }),

  searchPlatformBusinesses: (token: string | null, q: string) =>
    salesFetch<{
      items: Array<{
        _id: string;
        name?: string;
        requestorKind?: string;
        representativeName?: string;
      }>;
    }>(
      token,
      `/api/sales-team/platform-businesses?q=${encodeURIComponent(q)}`,
    ),

  suggestPlaces: (token: string | null, q: string) =>
    salesFetch<{ items: SalesPlaceSuggest[]; geocodeConfigured: boolean }>(
      token,
      `/api/sales-team/places/suggest?q=${encodeURIComponent(q)}`,
    ),

  listRequirements: (token: string | null, status?: string) => {
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    return salesFetch<{ items: CustomerRequirement[] }>(
      token,
      `/api/sales-team/requirements${qs}`,
    );
  },

  getRequirement: (token: string | null, id: string) =>
    salesFetch<CustomerRequirement>(
      token,
      `/api/sales-team/requirements/${id}`,
    ),

  createRequirement: (
    token: string | null,
    body: {
      title: string;
      body?: string;
      customerName?: string;
      targetRoles: CustomerRequirementTargetRole[];
      accountId?: string | null;
    },
  ) =>
    salesFetch<CustomerRequirement>(token, "/api/sales-team/requirements", {
      method: "POST",
      jsonBody: body,
    }),

  updateRequirement: (
    token: string | null,
    id: string,
    body: Partial<{
      title: string;
      body: string;
      customerName: string;
      targetRoles: CustomerRequirementTargetRole[];
      status: CustomerRequirementDocStatus;
    }>,
  ) =>
    salesFetch<CustomerRequirement>(
      token,
      `/api/sales-team/requirements/${id}`,
      { method: "PATCH", jsonBody: body },
    ),

  updateRequirementWork: (
    token: string | null,
    id: string,
    body: { status: CustomerRequirementWorkStatus; note?: string },
  ) =>
    salesFetch<CustomerRequirement>(
      token,
      `/api/sales-team/requirements/${id}/work`,
      { method: "PUT", jsonBody: body },
    ),

  deleteRequirement: (token: string | null, id: string) =>
    salesFetch<unknown>(token, `/api/sales-team/requirements/${id}`, {
      method: "DELETE",
    }),
};

export type CustomerRequirementTargetRole =
  | "admin"
  | "internalLab"
  | "devops"
  | "salesTeam";

export type CustomerRequirementDocStatus =
  | "open"
  | "inProgress"
  | "done"
  | "canceled";

export type CustomerRequirementWorkStatus = "todo" | "inProgress" | "done";

export type CustomerRequirementWorkUpdate = {
  _id?: string;
  role: CustomerRequirementTargetRole;
  userId: string;
  userName?: string;
  status: CustomerRequirementWorkStatus;
  note?: string;
  updatedAt?: string;
};

export type CustomerRequirement = {
  _id: string;
  title: string;
  body?: string;
  customerName?: string;
  accountId?: string | null;
  targetRoles: CustomerRequirementTargetRole[];
  status: CustomerRequirementDocStatus;
  createdByUserId?: string;
  createdByName?: string;
  workUpdates?: CustomerRequirementWorkUpdate[];
  createdAt?: string;
  updatedAt?: string;
};

export function visitAccountName(visit: SalesVisit): string {
  const acc = visit.accountId;
  if (acc && typeof acc === "object" && "name" in acc) {
    return String(acc.name || "거래처");
  }
  return "거래처";
}

export const COMMITMENT_LABEL: Record<string, string> = {
  confirmed: "확정",
  around: "그쯤",
  askBefore: "문의 전",
};

export const KIND_LABEL: Record<string, string> = {
  practice: "치과",
  lab: "기공소",
};

export const REQUIREMENT_TARGET_LABEL: Record<
  CustomerRequirementTargetRole,
  string
> = {
  admin: "관리자",
  internalLab: "기공사업부",
  devops: "개발운영팀",
  salesTeam: "영업본부",
};

export const REQUIREMENT_DOC_STATUS_LABEL: Record<
  CustomerRequirementDocStatus,
  string
> = {
  open: "접수",
  inProgress: "진행중",
  done: "완료",
  canceled: "취소",
};

export const REQUIREMENT_WORK_STATUS_LABEL: Record<
  CustomerRequirementWorkStatus,
  string
> = {
  todo: "대기",
  inProgress: "진행중",
  done: "완료",
};

export const REQUIREMENT_TARGET_OPTIONS: CustomerRequirementTargetRole[] = [
  "admin",
  "internalLab",
  "devops",
  "salesTeam",
];

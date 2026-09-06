// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { request } from "@/shared/api/apiClient";

export type BusinessRegistrationInquiry = {
  _id: string;
  type?: string;
  subject?: string;
  message?: string;
  targetRoles?: string[];
  user?: {
    _id?: string;
    name?: string;
    email?: string;
    role?: string;
    business?: string;
  } | null;
  userSnapshot?: {
    name?: string;
    email?: string;
    role?: string;
    business?: string;
  } | null;
  businessAnchorId?: string | null;
  status?: "open" | "resolved";
  adminNote?: string;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  reason?: string;
  payload?: {
    role?: string;
    ownerForm?: Record<string, any> | null;
    license?: {
      fileId?: string | null;
      s3Key?: string | null;
      originalName?: string | null;
    } | null;
    errorMessage?: string;
  } | null;
  createdAt?: string;
  updatedAt?: string;
};

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  message?: string;
};

export type InquiryInboxMode = "admin" | "salesTeam";

function inboxListPath(mode: InquiryInboxMode) {
  return mode === "salesTeam"
    ? "/api/sales-team/inquiries"
    : "/api/admin/business-registration-inquiries";
}

function inboxUpdatePath(mode: InquiryInboxMode, id: string) {
  return mode === "salesTeam"
    ? `/api/sales-team/inquiries/${id}`
    : `/api/admin/business-registration-inquiries/${id}`;
}

export async function fetchBusinessRegistrationInquiries(
  params?: {
    status?: "open" | "resolved";
    type?: string;
    limit?: number;
    target?: string;
  },
  mode: InquiryInboxMode = "admin",
) {
  const search = new URLSearchParams();
  if (params?.status) search.append("status", params.status);
  if (params?.type) search.append("type", params.type);
  if (params?.limit) search.append("limit", String(params.limit));
  if (params?.target && mode === "admin") search.append("target", params.target);

  const res = await request<ApiEnvelope<BusinessRegistrationInquiry[]>>({
    path: `${inboxListPath(mode)}?${search.toString()}`,
    method: "GET",
  });

  if (!res.ok) {
    throw new Error(res.data?.message || "문의 목록을 불러오지 못했습니다.");
  }

  return res.data!.data;
}

export async function updateBusinessRegistrationInquiry(
  id: string,
  payload: { status?: "open" | "resolved"; adminNote?: string },
  mode: InquiryInboxMode = "admin",
) {
  const res = await request<ApiEnvelope<BusinessRegistrationInquiry>>({
    path: inboxUpdatePath(mode, id),
    method: "PATCH",
    jsonBody: payload,
  });

  if (!res.ok) {
    throw new Error(res.data?.message || "문의 업데이트에 실패했습니다.");
  }

  return res.data!.data;
}

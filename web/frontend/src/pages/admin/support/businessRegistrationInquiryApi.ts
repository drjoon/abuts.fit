import { request } from "@/shared/api/apiClient";

export type BusinessRegistrationInquiry = {
  _id: string;
  type?: "general" | "business_registration" | "user_registration";
  subject?: string;
  message?: string;
  user?: {
    _id?: string;
    name?: string;
    email?: string;
    role?: string;
    organization?: string;
  } | null;
  userSnapshot?: {
    name?: string;
    email?: string;
    role?: string;
    organization?: string;
  } | null;
  organizationType?: string | null;
  organizationId?: string | null;
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

export async function fetchBusinessRegistrationInquiries(params?: {
  status?: "open" | "resolved";
  type?: "general" | "business_registration" | "user_registration";
  limit?: number;
}) {
  const search = new URLSearchParams();
  if (params?.status) search.append("status", params.status);
  if (params?.type) search.append("type", params.type);
  if (params?.limit) search.append("limit", String(params.limit));

  const res = await request<ApiEnvelope<BusinessRegistrationInquiry[]>>({
    path: `/api/admin/business-registration-inquiries?${search.toString()}`,
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
) {
  const res = await request<ApiEnvelope<BusinessRegistrationInquiry>>({
    path: `/api/admin/business-registration-inquiries/${id}`,
    method: "PATCH",
    jsonBody: payload,
  });

  if (!res.ok) {
    throw new Error(res.data?.message || "문의 업데이트에 실패했습니다.");
  }

  return res.data!.data;
}

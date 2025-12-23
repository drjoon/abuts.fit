import { request } from "@/lib/apiClient";

export type MailAttachment = {
  filename?: string;
  contentType?: string;
  size?: number;
  s3Key?: string;
};

export type MailItem = {
  _id: string;
  direction: "inbound" | "outbound";
  status: "pending" | "sent" | "failed" | "received";
  from?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
  attachments?: MailAttachment[];
  s3RawKey?: string;
  messageId?: string;
  receivedAt?: string;
  sentAt?: string;
  createdAt?: string;
};

export type MailListResponse = {
  data: MailItem[];
  nextCursor: { cursorCreatedAt: string; cursorId: string } | null;
};

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  message?: string;
  nextCursor?: any;
};

export async function fetchMails(params: {
  direction?: "inbound" | "outbound";
  q?: string;
  from?: string;
  to?: string;
  startDate?: string;
  endDate?: string;
  cursorCreatedAt?: string;
  cursorId?: string;
  limit?: number;
}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") {
      search.append(k, String(v));
    }
  });

  const res = await request<
    ApiEnvelope<MailItem[]> & {
      nextCursor: { cursorCreatedAt: string; cursorId: string } | null;
    }
  >({
    path: `/api/admin/mails?${search.toString()}`,
    method: "GET",
  });

  if (!res.ok) throw new Error(res.data?.message || "메일 조회 실패");
  return {
    data: res.data!.data,
    nextCursor: (res.data as any).nextCursor ?? null,
  } satisfies MailListResponse;
}

export async function fetchMail(id: string) {
  const res = await request<ApiEnvelope<MailItem>>({
    path: `/api/admin/mails/${id}`,
    method: "GET",
  });
  if (!res.ok) throw new Error(res.data?.message || "메일 조회 실패");
  return res.data!.data;
}

export async function createUploadUrl(payload: {
  filename: string;
  contentType?: string;
}) {
  const res = await request<ApiEnvelope<{ url: string; key: string }>>({
    path: "/api/admin/mails/upload-url",
    method: "POST",
    jsonBody: payload,
  });
  if (!res.ok) throw new Error(res.data?.message || "업로드 URL 발급 실패");
  return res.data!.data;
}

export async function createDownloadUrl(payload: {
  s3Key: string;
  expires?: number;
}) {
  const res = await request<ApiEnvelope<{ url: string }>>({
    path: "/api/admin/mails/download-url",
    method: "POST",
    jsonBody: payload,
  });
  if (!res.ok) throw new Error(res.data?.message || "다운로드 URL 발급 실패");
  return res.data!.data;
}

export async function sendMail(payload: {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  attachments?: MailAttachment[];
}) {
  const res = await request<ApiEnvelope<any>>({
    path: "/api/admin/mails/send",
    method: "POST",
    jsonBody: payload,
  });
  if (!res.ok) throw new Error(res.data?.message || "메일 발송 실패");
  return res.data;
}

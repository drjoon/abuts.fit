// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { request } from "@/shared/api/apiClient";

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
  folder?: "inbox" | "sent" | "trash" | "spam";
  isRead?: boolean;
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
  scheduledSendAt?: string | null;
  trashedAt?: string;
  readAt?: string;
  createdAt?: string;
};

export type MailListCursor =
  | { cursorCreatedAt: string; cursorId: string }
  | { cursorScheduledSendAt: string; cursorId: string };

export type MailListResponse = {
  data: MailItem[];
  nextCursor: MailListCursor | null;
};

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  message?: string;
  nextCursor?: any;
};

export async function fetchMails(params: {
  direction?: "inbound" | "outbound";
  folder?: "inbox" | "sent" | "trash" | "spam";
  scheduled?: boolean;
  q?: string;
  from?: string;
  to?: string;
  startDate?: string;
  endDate?: string;
  cursorCreatedAt?: string;
  cursorScheduledSendAt?: string;
  cursorId?: string;
  limit?: number;
}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    if (k === "scheduled") {
      if (v === true) search.append("scheduled", "1");
      return;
    }
    search.append(k, String(v));
  });

  const res = await request<
    ApiEnvelope<MailItem[]> & {
      nextCursor: MailListCursor | null;
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

export async function fetchScheduledMailCount() {
  const res = await request<ApiEnvelope<{ count: number }>>({
    path: "/api/admin/mails/scheduled/count",
    method: "GET",
  });
  if (!res.ok) throw new Error(res.data?.message || "예약 발송 건수 조회 실패");
  return res.data!.data.count;
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

export async function trashMail(id: string) {
  const res = await request<ApiEnvelope<MailItem>>({
    path: `/api/admin/mails/${id}/trash`,
    method: "POST",
  });
  if (!res.ok) throw new Error(res.data?.message || "휴지통 이동 실패");
  return res.data!.data;
}

export async function emptyTrash(permanently = true) {
  const res = await request<ApiEnvelope<{ deletedCount: number }>>({
    path: "/api/admin/mails/trash/empty",
    method: "POST",
    jsonBody: { permanently },
  });
  if (!res.ok) throw new Error(res.data?.message || "휴지통 비우기 실패");
  return res.data!.data;
}

export async function emptySpam(permanently = true) {
  const res = await request<ApiEnvelope<{ deletedCount: number }>>({
    path: "/api/admin/mails/spam/empty",
    method: "POST",
    jsonBody: { permanently },
  });
  if (!res.ok) throw new Error(res.data?.message || "스팸함 비우기 실패");
  return res.data!.data;
}

export async function emptySent(permanently = true) {
  const res = await request<ApiEnvelope<{ deletedCount: number }>>({
    path: "/api/admin/mails/sent/empty",
    method: "POST",
    jsonBody: { permanently },
  });
  if (!res.ok) throw new Error(res.data?.message || "발신함 비우기 실패");
  return res.data!.data;
}

export async function markAsRead(id: string) {
  const res = await request<ApiEnvelope<MailItem>>({
    path: `/api/admin/mails/${id}/read`,
    method: "POST",
  });
  if (!res.ok) throw new Error(res.data?.message || "읽음 처리 실패");
  return res.data!.data;
}

export async function markAsUnread(id: string) {
  const res = await request<ApiEnvelope<MailItem>>({
    path: `/api/admin/mails/${id}/unread`,
    method: "POST",
  });
  if (!res.ok) throw new Error(res.data?.message || "안읽음 처리 실패");
  return res.data!.data;
}

export async function moveToSpam(id: string) {
  const res = await request<ApiEnvelope<MailItem>>({
    path: `/api/admin/mails/${id}/spam`,
    method: "POST",
  });
  if (!res.ok) throw new Error(res.data?.message || "스팸 이동 실패");
  return res.data!.data;
}

export async function restoreToSent(id: string) {
  const res = await request<ApiEnvelope<MailItem>>({
    path: `/api/admin/mails/${id}/restore-to-sent`,
    method: "POST",
  });
  if (!res.ok) throw new Error(res.data?.message || "발신함 복원 실패");
  return res.data!.data;
}

export async function restoreToInbox(id: string) {
  const res = await request<ApiEnvelope<MailItem>>({
    path: `/api/admin/mails/${id}/restore-to-inbox`,
    method: "POST",
  });
  if (!res.ok) throw new Error(res.data?.message || "수신함 이동 실패");
  return res.data!.data;
}

export type InboundMailUnreadStats = {
  inbox: number;
  spam: number;
  trash: number;
  total: number;
};

export async function fetchInboundMailUnreadStats() {
  const res = await request<ApiEnvelope<InboundMailUnreadStats>>({
    path: "/api/admin/inbound-email/stats/unread",
    method: "GET",
  });
  if (!res.ok) throw new Error(res.data?.message || "미읽음 통계 조회 실패");
  const data = res.data!.data;
  return {
    inbox: Math.max(0, Number(data.inbox || 0)),
    spam: Math.max(0, Number(data.spam || 0)),
    trash: Math.max(0, Number(data.trash || 0)),
    total: Math.max(0, Number(data.total || 0)),
  };
}

export async function sendMail(payload: {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  attachments?: MailAttachment[];
  scheduledSendAt?: string | null;
}) {
  const res = await request<ApiEnvelope<any>>({
    path: "/api/admin/mails/send",
    method: "POST",
    jsonBody: payload,
  });
  if (!res.ok) throw new Error(res.data?.message || "메일 발송 실패");
  return res.data;
}

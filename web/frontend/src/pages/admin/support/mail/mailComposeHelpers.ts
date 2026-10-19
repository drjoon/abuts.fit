import type { MailItem } from "@/features/admin/mail/mailApi";
import { escapeHtmlText } from "./mailHtml.util";
import { formatDateTime } from "./mailUi";

export type MailComposeDraft = {
  to?: string;
  cc?: string;
  subject?: string;
  body?: string;
  bodyHtml?: string;
};

const KST_TZ = "Asia/Seoul";

export function extractEmailAddress(raw?: string | null): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  const angled = s.match(/<([^>]+)>/);
  if (angled?.[1]) return angled[1].trim();
  if (s.includes("@")) return s;
  return s;
}

export function buildReplySubject(subject?: string | null): string {
  const s = String(subject || "").trim();
  if (!s) return "Re: ";
  if (/^re:\s*/i.test(s)) return s;
  return `Re: ${s}`;
}

function stripHtml(html?: string | null): string {
  if (!html) return "";
  return String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

export function buildReplyDraft(mail: MailItem): MailComposeDraft {
  const when = formatDateTime(
    mail.receivedAt || mail.createdAt || mail.sentAt,
  );
  const fromLine = mail.from || "-";
  const htmlOriginal = mail.bodyHtml?.trim();
  if (htmlOriginal) {
    const quoteHeader = `<p><br></p><hr><p><strong>${escapeHtmlText(when)} ${escapeHtmlText(fromLine)}:</strong></p>`;
    return {
      to: extractEmailAddress(mail.from),
      subject: buildReplySubject(mail.subject),
      bodyHtml: `${quoteHeader}${htmlOriginal}`,
    };
  }

  const original =
    mail.bodyText?.trim() || stripHtml(mail.bodyHtml) || "(본문 없음)";

  return {
    to: extractEmailAddress(mail.from),
    subject: buildReplySubject(mail.subject),
    body: `\n\n---\n${when} ${fromLine}:\n${original}`,
  };
}

/** datetime-local 값(캘린더 시각)을 KST ISO로 해석한다. */
export function kstDatetimeLocalToIso(local: string): string | null {
  const m = String(local || "")
    .trim()
    .match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/);
  if (!m) return null;
  return `${m[1]}T${m[2]}:00+09:00`;
}

export function kstNowDatetimeLocalValue(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const y = pick("year");
  const mo = pick("month");
  const d = pick("day");
  let h = pick("hour");
  if (h === "24") h = "00";
  const mi = pick("minute");
  return `${y}-${mo}-${d}T${h}:${mi}`;
}

export function formatKstScheduledLabel(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR", {
    timeZone: KST_TZ,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

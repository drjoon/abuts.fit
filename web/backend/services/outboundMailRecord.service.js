// related files:
// - web/backend/models/mail.model.js
// - web/backend/utils/email.util.js
// - web/backend/controllers/notifications/mail.controller.js
import Mail from "../models/mail.model.js";
import { sendEmailWithAttachments } from "../utils/email.util.js";

function resolveFromAddress() {
  return String(
    process.env.EMAIL_FROM || process.env.SES_FROM || process.env.SES_FROM_EMAIL || "",
  ).trim();
}

/**
 * 발신함(Mail folder=sent)에 기록한 뒤 Brevo 등으로 전송한다.
 */
export async function sendLoggedOutboundMail({
  to,
  cc = [],
  bcc = [],
  subject,
  bodyHtml = "",
  bodyText = "",
  attachments = [],
  sentAt = new Date(),
}) {
  const normalizedTo = (Array.isArray(to) ? to : [to])
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  if (!normalizedTo.length) {
    throw new Error("수신자 이메일이 없습니다.");
  }
  const normalizedCc = (Array.isArray(cc) ? cc : [cc])
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  const normalizedBcc = (Array.isArray(bcc) ? bcc : [bcc])
    .map((v) => String(v || "").trim())
    .filter(Boolean);

  const mailDoc = await Mail.create({
    folder: "sent",
    direction: "outbound",
    status: "pending",
    from: resolveFromAddress(),
    to: normalizedTo,
    cc: normalizedCc,
    bcc: normalizedBcc,
    subject: String(subject || ""),
    bodyHtml: String(bodyHtml || ""),
    bodyText: String(bodyText || ""),
    attachments,
    sentAt,
    isRead: true,
  });

  try {
    await sendEmailWithAttachments({
      to: normalizedTo,
      cc: normalizedCc,
      bcc: normalizedBcc,
      subject,
      html: bodyHtml,
      text: bodyText,
      attachments,
    });
    mailDoc.status = "sent";
    await mailDoc.save();
    return mailDoc;
  } catch (error) {
    mailDoc.status = "failed";
    mailDoc.error = error?.message || String(error);
    await mailDoc.save();
    throw error;
  }
}

/** 이미 전송된 메일을 발신함에만 기록(백필용). */
export async function recordSentOutboundMailOnly({
  to,
  cc = [],
  bcc = [],
  subject,
  bodyHtml = "",
  bodyText = "",
  sentAt = new Date(),
}) {
  const normalizedTo = (Array.isArray(to) ? to : [to])
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  return Mail.create({
    folder: "sent",
    direction: "outbound",
    status: "sent",
    from: resolveFromAddress(),
    to: normalizedTo,
    cc: (Array.isArray(cc) ? cc : [cc]).filter(Boolean),
    bcc: (Array.isArray(bcc) ? bcc : [bcc]).filter(Boolean),
    subject: String(subject || ""),
    bodyHtml: String(bodyHtml || ""),
    bodyText: String(bodyText || ""),
    attachments: [],
    sentAt,
    isRead: true,
  });
}

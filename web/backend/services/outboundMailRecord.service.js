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

export async function dispatchOutboundMailDocument(mailDoc) {
  await sendEmailWithAttachments({
    to: mailDoc.to,
    cc: mailDoc.cc || [],
    bcc: mailDoc.bcc || [],
    subject: mailDoc.subject,
    html: mailDoc.bodyHtml,
    text: mailDoc.bodyText,
    attachments: mailDoc.attachments || [],
  });
  mailDoc.status = "sent";
  mailDoc.sentAt = new Date();
  await mailDoc.save();
  return mailDoc;
}

/**
 * 발신함(Mail folder=sent)에 기록한 뒤 Brevo 등으로 전송한다.
 * scheduledSendAt이 미래면 pending으로 두고 워커가 전송한다.
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
  scheduledSendAt = null,
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

  const scheduleDate =
    scheduledSendAt != null && scheduledSendAt !== ""
      ? new Date(scheduledSendAt)
      : null;
  const isScheduled =
    scheduleDate &&
    !Number.isNaN(scheduleDate.getTime()) &&
    scheduleDate.getTime() > Date.now();

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
    sentAt: isScheduled ? null : sentAt,
    scheduledSendAt: isScheduled ? scheduleDate : null,
    isRead: true,
  });

  if (isScheduled) {
    return mailDoc;
  }

  try {
    return await dispatchOutboundMailDocument(mailDoc);
  } catch (error) {
    mailDoc.status = "failed";
    mailDoc.error = error?.message || String(error);
    await mailDoc.save();
    throw error;
  }
}

/** 예약 시각이 지난 발신 대기 메일을 전송한다. */
export async function processDueScheduledOutboundMails({ limit = 20 } = {}) {
  const now = new Date();
  const due = await Mail.find({
    direction: "outbound",
    folder: "sent",
    status: "pending",
    scheduledSendAt: { $ne: null, $lte: now },
  })
    .sort({ scheduledSendAt: 1 })
    .limit(Math.max(1, Number(limit) || 20));

  let sentCount = 0;
  for (const mailDoc of due) {
    try {
      await dispatchOutboundMailDocument(mailDoc);
      sentCount += 1;
    } catch (error) {
      mailDoc.status = "failed";
      mailDoc.error = error?.message || String(error);
      await mailDoc.save();
      console.error("[scheduledOutboundMail] send failed", mailDoc._id, error);
    }
  }
  return { scanned: due.length, sentCount };
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

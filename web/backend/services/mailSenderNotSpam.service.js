// related files:
// - web/backend/models/mailSenderNotSpam.model.js
// - web/backend/controllers/admin/adminInboundEmail.controller.js
// - web/backend/controllers/notifications/mail.controller.js
import MailSenderNotSpam from "../models/mailSenderNotSpam.model.js";

const SPAM_SCORE_THRESHOLD = 5;

/** Brevo From.Address 또는 RFC5322 "Name <a@b.c>" */
export function normalizeInboundMailAddress(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const angle = s.match(/<([^>]+)>/);
  const email = (angle ? angle[1] : s).trim().toLowerCase();
  return email.includes("@") ? email : "";
}

export async function isMailSenderNotSpamAllowed(fromAddress) {
  const address = normalizeInboundMailAddress(fromAddress);
  if (!address) return false;
  const row = await MailSenderNotSpam.findOne({ address }).select("_id").lean();
  return Boolean(row);
}

export async function recordMailSenderAsNotSpam(fromAddress, opts = {}) {
  const address = normalizeInboundMailAddress(fromAddress);
  if (!address) return null;
  const now = new Date();
  return MailSenderNotSpam.findOneAndUpdate(
    { address },
    {
      $set: {
        lastMarkedAt: now,
        ...(opts.sourceMailId ? { sourceMailId: opts.sourceMailId } : {}),
      },
      $setOnInsert: { address },
    },
    { upsert: true, new: true },
  );
}

/** Brevo SpamScore와 발신자 허용 목록으로 수신함/스팸함 결정 */
export async function resolveInboundMailFolder({ fromAddress, spamScore }) {
  if (await isMailSenderNotSpamAllowed(fromAddress)) {
    return "inbox";
  }
  return Number(spamScore) > SPAM_SCORE_THRESHOLD ? "spam" : "inbox";
}

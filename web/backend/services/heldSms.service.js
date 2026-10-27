// related files:
// - web/backend/models/heldSms.model.js
// - web/backend/utils/popbill.util.js
// - web/backend/controllers/admin/adminHeldSms.controller.js
import crypto from "crypto";
import HeldSms from "../models/heldSms.model.js";

const MAX_RECIPIENTS = 2000;

export const HELD_SMS_REASON_ORDER = ["SMS_LOOP", "SMS_PHONE_BURST", "SMS_SAME_CONTENT"];

export function heldSmsReasonLabel(reason) {
  if (reason === "SMS_LOOP") return "10초 100건";
  if (reason === "SMS_PHONE_BURST") return "번호 반복";
  if (reason === "SMS_SAME_CONTENT") return "같은 내용";
  return "기타";
}

function fingerprintOf(reason, recipients) {
  const body = recipients
    .map((row) => `${row.phone}\n${row.content}`)
    .sort()
    .join("\n---\n");
  return crypto.createHash("sha256").update(`${reason}\n${body}`).digest("hex");
}

export async function recordHeldSms({ reason, subject, messages }) {
  const code = String(reason || "SMS_LOOP");
  const recipients = (Array.isArray(messages) ? messages : [])
    .map((row) => ({
      phone: String(row?.Receiver || row?.phone || ""),
      name: String(row?.ReceiverName || row?.name || "").trim(),
      content: String(row?.Contents || row?.content || ""),
    }))
    .filter((row) => row.phone && row.content)
    .slice(0, MAX_RECIPIENTS);
  if (!recipients.length) return null;

  const fingerprint = fingerprintOf(code, recipients);
  const now = new Date();
  try {
    return await HeldSms.create({
      reason: code,
      fingerprint,
      subject: String(subject || "알림"),
      recipients,
      status: "held",
      hitCount: 1,
      lastSeenAt: now,
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    await HeldSms.updateOne(
      { fingerprint, status: "held" },
      { $inc: { hitCount: 1 }, $set: { lastSeenAt: now } },
    );
    return null;
  }
}

function summarizeBatch(doc) {
  const groups = new Map();
  for (const row of doc.recipients || []) {
    const content = String(row.content || "");
    const list = groups.get(content) || [];
    list.push(row);
    groups.set(content, list);
  }
  return {
    id: String(doc._id),
    reason: doc.reason,
    label: heldSmsReasonLabel(doc.reason),
    subject: doc.subject || "알림",
    createdAt: doc.createdAt,
    lastSeenAt: doc.lastSeenAt || doc.createdAt,
    hitCount: doc.hitCount || 1,
    recipientCount: (doc.recipients || []).length,
    contents: [...groups.entries()].map(([content, people]) => ({
      content,
      count: people.length,
      phones: people.slice(0, 8).map((row) => ({
        phone: row.phone,
        name: row.name || "",
      })),
      more: Math.max(0, people.length - 8),
    })),
  };
}

export async function listHeldSms() {
  const rows = await HeldSms.find({ status: "held" })
    .sort({ createdAt: -1 })
    .limit(80)
    .lean();
  const grouped = new Map();
  for (const row of rows) {
    const reason = row.reason || "SMS_LOOP";
    const list = grouped.get(reason) || [];
    list.push(summarizeBatch(row));
    grouped.set(reason, list);
  }
  const reasons = [
    ...HELD_SMS_REASON_ORDER.filter((reason) => grouped.has(reason)),
    ...[...grouped.keys()].filter((reason) => !HELD_SMS_REASON_ORDER.includes(reason)),
  ];
  const groups = reasons.map((reason) => {
    const batches = grouped.get(reason) || [];
    return {
      reason,
      label: heldSmsReasonLabel(reason),
      batchCount: batches.length,
      recipientCount: batches.reduce((sum, batch) => sum + batch.recipientCount, 0),
      batches,
    };
  });
  return {
    pendingCount: rows.length,
    recipientCount: groups.reduce((sum, group) => sum + group.recipientCount, 0),
    groups,
  };
}

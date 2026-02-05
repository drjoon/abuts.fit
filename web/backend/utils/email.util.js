import axios from "axios";
import { extname } from "path";
import { randomBytes } from "crypto";
import { getObjectBufferFromS3 } from "./s3.utils.js";

const logMockEmail = ({ to, subject, html, text }) => {
  console.warn(
    "[sendEmail] SES 미설정 상태이므로 이메일 전송 대신 로그에 출력합니다.",
  );
  console.info(
    `[MOCK EMAIL]\nTo: ${
      Array.isArray(to) ? to.join(", ") : to
    }\nSubject: ${subject}\nText: ${text || ""}\nHTML:\n${html}`,
  );
};

const normalizeRecipients = (value) => {
  const list = Array.isArray(value) ? value : [value];
  return list.map((item) => String(item || "").trim()).filter(Boolean);
};

const getFromAddress = () =>
  String(process.env.EMAIL_FROM || process.env.SES_FROM || "").trim();

const getFromName = () => String(process.env.EMAIL_FROM_NAME || "").trim();

const resolveAttachmentsPayload = async (attachments = []) => {
  const payload = [];
  for (const attachment of attachments) {
    if (!attachment) continue;
    const { s3Key, filename, contentType } = attachment;
    if (!s3Key) continue;
    const buffer = await getObjectBufferFromS3(s3Key);
    const safeName =
      filename ||
      `attachment-${randomBytes(6).toString("hex")}${extname(s3Key || "")}`;
    payload.push({
      content: buffer.toString("base64"),
      name: safeName,
      type: contentType || "application/octet-stream",
    });
  }
  return payload;
};

const shouldMock = () => !getFromAddress();

const getProvider = () =>
  String(process.env.EMAIL_PROVIDER || process.env.EMAIL_SERVICE || "brevo")
    .trim()
    .toLowerCase();

const brevoPost = async (payload) => {
  const apiKey = String(process.env.BREVO_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("BREVO_API_KEY가 설정되지 않았습니다.");
  }
  await axios.post("https://api.brevo.com/v3/smtp/email", payload, {
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
  });
};

const sendViaBrevo = async ({
  to,
  cc,
  bcc,
  subject,
  html,
  text,
  attachments,
}) => {
  const fromAddress = getFromAddress();
  const fromName = getFromName();
  const payload = {
    sender: {
      email: fromAddress,
      ...(fromName ? { name: fromName } : {}),
    },
    to: to.map((email) => ({ email })),
    subject,
    htmlContent: html,
    textContent: text,
  };
  if (cc.length) payload.cc = cc.map((email) => ({ email }));
  if (bcc.length) payload.bcc = bcc.map((email) => ({ email }));
  if (attachments.length) {
    payload.attachment = attachments.map((item) => ({
      name: item.name,
      content: item.content,
      type: item.type,
    }));
  }
  await brevoPost(payload);
};

const logMockIfNeeded = ({ to, subject, html, text }) => {
  if (process.env.NODE_ENV !== "production") {
    logMockEmail({ to, subject, html, text });
    return true;
  }
  return false;
};

const sendEmailBase = async ({
  to,
  cc = [],
  bcc = [],
  subject,
  html,
  text,
  attachments = [],
}) => {
  const provider = getProvider();
  const toList = normalizeRecipients(to);
  if (!toList.length) {
    throw new Error("수신자 이메일이 없습니다.");
  }
  const ccList = normalizeRecipients(cc);
  const bccList = normalizeRecipients(bcc);

  if (shouldMock()) {
    logMockEmail({ to: toList, subject, html, text });
    return;
  }

  const resolvedAttachments = await resolveAttachmentsPayload(attachments);

  switch (provider) {
    case "brevo":
      await sendViaBrevo({
        to: toList,
        cc: ccList,
        bcc: bccList,
        subject,
        html,
        text,
        attachments: resolvedAttachments,
      });
      break;
    default:
      throw new Error(`지원하지 않는 이메일 공급자 '${provider}'입니다.`);
  }
};

export async function sendEmail({ to, subject, html, text }) {
  await sendEmailBase({ to, subject, html, text });
}

export async function sendEmailWithAttachments({
  to,
  cc = [],
  bcc = [],
  subject,
  html,
  text,
  attachments = [],
}) {
  await sendEmailBase({ to, cc, bcc, subject, html, text, attachments });
}

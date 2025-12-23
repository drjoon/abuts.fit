import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { simpleParser } from "mailparser";
import fetch from "node-fetch";

const s3 = new S3Client({ region: process.env.AWS_REGION || "ap-northeast-2" });
const EMAIL_BUCKET = process.env.EMAIL_BUCKET;
const RAW_PREFIX = process.env.RAW_PREFIX || "emails/raw/";
const ATTACH_PREFIX = process.env.ATTACH_PREFIX || "emails/attachments/";
const WEBHOOK_URL = process.env.WEBHOOK_URL; // e.g. https://api.example.com/api/webhooks/mail
const WEBHOOK_SECRET = process.env.MAIL_WEBHOOK_SECRET;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

const putObject = async ({ key, body, contentType }) => {
  await s3.send(
    new PutObjectCommand({
      Bucket: EMAIL_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
};

const fetchJson = async (url, payload) => {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Webhook error ${res.status}: ${text}`);
  }
  return res.json();
};

const postSlack = async (text) => {
  if (!SLACK_WEBHOOK_URL) return;
  try {
    await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    console.error("Slack notify failed", err);
  }
};

export const handler = async (event) => {
  if (!EMAIL_BUCKET) throw new Error("EMAIL_BUCKET is not set");
  if (!WEBHOOK_URL) throw new Error("WEBHOOK_URL is not set");

  for (const record of event.Records || []) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

    if (bucket !== EMAIL_BUCKET) {
      console.warn(`Skip different bucket: ${bucket}`);
      continue;
    }

    // 1) 원본 EML 읽기
    const obj = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    const rawBuffer = await streamToBuffer(obj.Body);

    // 2) 파싱
    const parsed = await simpleParser(rawBuffer);

    // 3) 첨부 저장
    const attachments = [];
    if (parsed.attachments?.length) {
      for (const att of parsed.attachments) {
        const attKey = `${ATTACH_PREFIX}${Date.now()}-${
          att.filename || "attachment"
        }`;
        await putObject({
          key: attKey,
          body: att.content,
          contentType: att.contentType || "application/octet-stream",
        });
        attachments.push({
          filename: att.filename,
          contentType: att.contentType,
          size: att.size,
          s3Key: attKey,
        });
      }
    }

    // 4) 원본을 지정한 prefix로 보관 (필요 시 prefix만 변경)
    let rawKey = key;
    if (!key.startsWith(RAW_PREFIX)) {
      const newKey = `${RAW_PREFIX}${key.split("/").pop()}`;
      await putObject({
        key: newKey,
        body: rawBuffer,
        contentType: "message/rfc822",
      });
      rawKey = newKey;
    }

    // 5) 백엔드 웹훅 호출
    const payload = {
      from: parsed.from?.text,
      to: parsed.to?.value?.map((v) => v.address) || [],
      cc: parsed.cc?.value?.map((v) => v.address) || [],
      bcc: parsed.bcc?.value?.map((v) => v.address) || [],
      subject: parsed.subject,
      bodyText: parsed.text,
      bodyHtml: parsed.html,
      attachments,
      s3RawKey: rawKey,
      receivedAt: parsed.date || new Date().toISOString(),
      messageId: parsed.messageId,
      secret: WEBHOOK_SECRET,
    };

    try {
      await fetchJson(WEBHOOK_URL, payload);
    } catch (err) {
      console.error("Webhook post failed", err);
      throw err;
    }

    const slackText = `Inbound mail\nFrom: ${
      payload.from
    }\nTo: ${payload.to.join(", ")}\nSubject: ${
      payload.subject || "(no subject)"
    }\nAttachments: ${attachments.length}`;
    await postSlack(slackText);
  }

  return { status: "ok" };
};

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";
import { simpleParser } from "mailparser";
import fetch from "node-fetch";

const AWS_REGION = process.env.AWS_REGION || "ap-northeast-2";
const s3 = new S3Client({ region: AWS_REGION });
const EMAIL_BUCKET = process.env.EMAIL_BUCKET;
const RAW_PREFIX = process.env.RAW_PREFIX || "emails/raw/";
const ATTACH_PREFIX = process.env.ATTACH_PREFIX || "emails/attachments/";
const WEBHOOK_URL = process.env.WEBHOOK_URL; // e.g. https://api.example.com/api/webhooks/mail
const WEBHOOK_URL_LOCAL = process.env.WEBHOOK_URL_LOCAL; // e.g. http://localhost:5173/api/webhooks/mail
const USE_LOCAL_WEBHOOK =
  String(process.env.USE_LOCAL_WEBHOOK || "").toLowerCase() === "true";
const WEBHOOK_SECRET = process.env.MAIL_WEBHOOK_SECRET;
const PUSHOVER_TOKEN =
  process.env.PUSHOVER_TOKEN || process.env.MAIL_PUSHOVER_TOKEN;
const PUSHOVER_USER =
  process.env.PUSHOVER_USER || process.env.MAIL_PUSHOVER_USER;
const PUSHOVER_DEVICE =
  process.env.PUSHOVER_DEVICE || process.env.MAIL_PUSHOVER_DEVICE || "";
const PUSHOVER_PRIORITY =
  process.env.PUSHOVER_PRIORITY || process.env.MAIL_PUSHOVER_PRIORITY;

const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

const ensureBucketExists = async (bucket, region) => {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    return;
  } catch (err) {
    if (
      err?.$metadata?.httpStatusCode !== 404 &&
      err?.name !== "NotFound" &&
      err?.Code !== "NoSuchBucket"
    ) {
      // 다른 에러는 그대로 던짐
      throw err;
    }
  }

  const params =
    region === "us-east-1"
      ? { Bucket: bucket }
      : {
          Bucket: bucket,
          CreateBucketConfiguration: { LocationConstraint: region },
        };

  try {
    await s3.send(new CreateBucketCommand(params));
    console.log(`Bucket created: ${bucket} (${region})`);
  } catch (err) {
    if (err?.name === "BucketAlreadyOwnedByYou") return;
    throw err;
  }
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

const postPushover = async ({ title, message }) => {
  if (!PUSHOVER_TOKEN || !PUSHOVER_USER) return;
  const body = new URLSearchParams({
    token: PUSHOVER_TOKEN,
    user: PUSHOVER_USER,
    title: title || "Mail inbound",
    message,
  });
  if (PUSHOVER_DEVICE) body.append("device", PUSHOVER_DEVICE);
  if (PUSHOVER_PRIORITY !== undefined && PUSHOVER_PRIORITY !== null)
    body.append("priority", String(PUSHOVER_PRIORITY));

  try {
    await fetch("https://api.pushover.net/1/messages.json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch (err) {
    console.error("Pushover notify failed", err);
  }
};

export const handler = async (event) => {
  if (!EMAIL_BUCKET) throw new Error("EMAIL_BUCKET is not set");
  const webhookUrl =
    USE_LOCAL_WEBHOOK && WEBHOOK_URL_LOCAL ? WEBHOOK_URL_LOCAL : WEBHOOK_URL;
  if (!webhookUrl) throw new Error("WEBHOOK_URL is not set");

  if (!event?.Records?.length) {
    console.warn("No Records in event, skipping");
    return { status: "skipped", reason: "no-records" };
  }

  await ensureBucketExists(EMAIL_BUCKET, AWS_REGION);

  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

    // 람다가 원본을 RAW_PREFIX로 복사하거나 첨부를 저장하면서 생성한 오브젝트로 인해
    // 재귀 호출되는 것을 방지
    if (key.startsWith(RAW_PREFIX) || key.startsWith(ATTACH_PREFIX)) {
      console.warn(`Skip self-generated object: ${key}`);
      continue;
    }

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
      await fetchJson(webhookUrl, payload);
    } catch (err) {
      console.error("Webhook post failed", err);
      throw err;
    }

    const pushText = `Inbound mail\nFrom: ${
      payload.from
    }\nTo: ${payload.to.join(", ")}\nSubject: ${
      payload.subject || "(no subject)"
    }\nAttachments: ${attachments.length}`;
    await postPushover({ title: "Inbound mail", message: pushText });
  }

  return { status: "ok" };
};

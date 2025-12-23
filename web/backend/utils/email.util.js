import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { extname } from "path";
import { randomBytes } from "crypto";
import { getObjectBufferFromS3 } from "./s3.utils.js";

let sesClient = null;

const getSesConfig = () => {
  const region =
    String(process.env.AWS_REGION || "").trim() || "ap-northeast-2";
  const accessKeyId = String(process.env.AWS_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(
    process.env.AWS_SECRET_ACCESS_KEY || ""
  ).trim();
  const sessionToken = String(process.env.AWS_SESSION_TOKEN || "").trim();

  if ((accessKeyId && !secretAccessKey) || (!accessKeyId && secretAccessKey)) {
    throw new Error(
      "SES 설정이 불완전합니다. AWS_ACCESS_KEY_ID와 AWS_SECRET_ACCESS_KEY를 모두 설정하거나 모두 비워주세요."
    );
  }

  return {
    region,
    credentials:
      accessKeyId && secretAccessKey
        ? {
            accessKeyId,
            secretAccessKey,
            ...(sessionToken ? { sessionToken } : {}),
          }
        : undefined,
  };
};

export const getSesClient = () => {
  if (sesClient) return sesClient;
  sesClient = new SESv2Client(getSesConfig());
  return sesClient;
};

const logMockEmail = ({ to, subject, html, text }) => {
  console.warn(
    "[sendEmail] SES 미설정 상태이므로 이메일 전송 대신 로그에 출력합니다."
  );
  console.info(
    `[MOCK EMAIL]\nTo: ${
      Array.isArray(to) ? to.join(", ") : to
    }\nSubject: ${subject}\nText: ${text || ""}\nHTML:\n${html}`
  );
};

export async function sendEmail({ to, subject, html, text }) {
  const fromAddress = String(
    process.env.SES_FROM_EMAIL || process.env.SES_FROM || ""
  ).trim();

  if (!fromAddress) {
    if (process.env.NODE_ENV !== "production") {
      logMockEmail({ to, subject, html, text });
      return;
    }
    throw new Error(
      "SES 발신자(SER_FROM_EMAIL 또는 SES_FROM)가 설정되지 않았습니다."
    );
  }

  let client = null;
  try {
    client = getSesClient();
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[sendEmail] SES 클라이언트 생성 실패, 개발 모드이므로 mock 전송으로 대체합니다.",
        error.message || error
      );
      logMockEmail({ to, subject, html, text });
      return;
    }
    throw error;
  }

  const command = new SendEmailCommand({
    FromEmailAddress: fromAddress,
    Destination: {
      ToAddresses: Array.isArray(to) ? to : [to],
    },
    Content: {
      Simple: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: html, Charset: "UTF-8" },
          Text: { Data: text || "", Charset: "UTF-8" },
        },
      },
    },
  });

  try {
    await client.send(command);
  } catch (error) {
    console.error("[sendEmail] SES send failed:", error);
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[sendEmail] 개발 모드이므로 SES 오류 시 mock 전송으로 대체합니다."
      );
      logMockEmail({ to, subject, html, text });
      return;
    }
    throw error;
  }
}

const buildMimeMessage = async ({
  from,
  to,
  cc,
  bcc,
  subject,
  html,
  text,
  attachments = [],
}) => {
  const boundary = `----=_Part_${randomBytes(8).toString("hex")}`;
  const headers = [
    `From: ${from}`,
    `To: ${(to || []).join(", ")}`,
    cc?.length ? `Cc: ${cc.join(", ")}` : null,
    bcc?.length ? `Bcc: ${bcc.join(", ")}` : null,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ]
    .filter(Boolean)
    .join("\r\n");

  const parts = [];

  const alternativeBoundary = `${boundary}-alt`;
  const textPart = text
    ? [
        `--${alternativeBoundary}`,
        "Content-Type: text/plain; charset=utf-8",
        "Content-Transfer-Encoding: 7bit",
        "",
        text,
      ].join("\r\n")
    : null;
  const htmlPart = html
    ? [
        `--${alternativeBoundary}`,
        "Content-Type: text/html; charset=utf-8",
        "Content-Transfer-Encoding: 7bit",
        "",
        html,
      ].join("\r\n")
    : null;

  const bodyMixedStart = [
    `--${boundary}`,
    `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
    "",
  ].join("\r\n");
  const bodyMixedParts = [bodyMixedStart];
  if (textPart) bodyMixedParts.push(textPart);
  if (htmlPart) bodyMixedParts.push(htmlPart);
  bodyMixedParts.push(`--${alternativeBoundary}--`, "");
  parts.push(bodyMixedParts.join("\r\n"));

  for (const attachment of attachments) {
    const { s3Key, filename, contentType } = attachment;
    if (!s3Key) continue;
    const buffer = await getObjectBufferFromS3(s3Key);
    const safeName =
      filename ||
      `attachment-${randomBytes(6).toString("hex")}${extname(s3Key || "")}`;
    const type = contentType || "application/octet-stream";
    parts.push(
      [
        `--${boundary}`,
        `Content-Type: ${type}`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${safeName}"`,
        "",
        buffer.toString("base64"),
        "",
      ].join("\r\n")
    );
  }

  parts.push(`--${boundary}--`, "");
  const mime = `${headers}\r\n\r\n${parts.join("\r\n")}`;
  return Buffer.from(mime, "utf-8");
};

export async function sendEmailWithAttachments({
  to,
  cc = [],
  bcc = [],
  subject,
  html,
  text,
  attachments = [],
}) {
  const fromAddress = String(
    process.env.SES_FROM_EMAIL || process.env.SES_FROM || ""
  ).trim();

  if (!fromAddress) {
    if (process.env.NODE_ENV !== "production") {
      logMockEmail({ to, subject, html, text });
      return;
    }
    throw new Error(
      "SES 발신자(SER_FROM_EMAIL 또는 SES_FROM)가 설정되지 않았습니다."
    );
  }

  let client = null;
  try {
    client = getSesClient();
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[sendEmailWithAttachments] SES 클라이언트 생성 실패, 개발 모드이므로 mock 전송으로 대체합니다.",
        error.message || error
      );
      logMockEmail({ to, subject, html, text });
      return;
    }
    throw error;
  }

  const mimeBuffer = await buildMimeMessage({
    from: fromAddress,
    to: Array.isArray(to) ? to : [to],
    cc,
    bcc,
    subject,
    html,
    text,
    attachments,
  });

  const command = new SendEmailCommand({
    Content: {
      Raw: {
        Data: mimeBuffer,
      },
    },
  });

  try {
    await client.send(command);
  } catch (error) {
    console.error("[sendEmailWithAttachments] SES send failed:", error);
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[sendEmailWithAttachments] 개발 모드이므로 SES 오류 시 mock 전송으로 대체합니다."
      );
      logMockEmail({ to, subject, html, text });
      return;
    }
    throw error;
  }
}

import {
  enqueueNotificationKakao,
  enqueueNotificationSMS,
  enqueueNotificationLMS,
} from "./queueClient.js";

export async function sendNotificationViaQueue({
  type = "SMS",
  to,
  content,
  subject = "",
  templateCode = null,
  priority = 0,
}) {
  const receiptKey = `${type.toLowerCase()}:${Date.now()}:${Math.random()
    .toString(36)
    .slice(2)}`;

  const payload = {
    to: Array.isArray(to) ? to : [to],
    content,
    subject,
    templateCode,
    timestamp: new Date().toISOString(),
  };

  switch (type.toUpperCase()) {
    case "KAKAO":
      return await enqueueNotificationKakao({ receiptKey, payload, priority });
    case "SMS":
      return await enqueueNotificationSMS({ receiptKey, payload, priority });
    case "LMS":
      return await enqueueNotificationLMS({ receiptKey, payload, priority });
    default:
      throw new Error(`Unknown notification type: ${type}`);
  }
}

export async function sendKakaoOrSMSViaQueue({
  to,
  content,
  templateCode = null,
  priority = 0,
}) {
  const type = content.length > 90 ? "LMS" : templateCode ? "KAKAO" : "SMS";
  return await sendNotificationViaQueue({
    type,
    to,
    content,
    subject: type === "LMS" ? "알림" : "",
    templateCode,
    priority,
  });
}

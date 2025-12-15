import crypto from "crypto";
import { httpJson } from "./httpJson.js";

function getTossBaseUrl() {
  return process.env.TOSS_API_BASE_URL || "https://api.tosspayments.com";
}

function getBasicAuthHeader() {
  const secretKey = String(process.env.TOSS_SECRET_KEY || "").trim();
  if (!secretKey) {
    throw new Error("TOSS_SECRET_KEY가 설정되어 있지 않습니다.");
  }
  const encoded = Buffer.from(`${secretKey}:`).toString("base64");
  return `Basic ${encoded}`;
}

export function makeIdempotencyKey(prefix) {
  const rand = crypto.randomBytes(12).toString("hex");
  return `${prefix}-${Date.now()}-${rand}`;
}

export function makeDeterministicIdempotencyKey(prefix, raw) {
  const base = `${prefix}:${String(raw || "")}`;
  const digest = crypto.createHash("sha256").update(base).digest("hex");
  return `${prefix}-${digest.slice(0, 32)}`;
}

export async function tossConfirmPayment({ paymentKey, orderId, amount }) {
  const url = `${getTossBaseUrl()}/v1/payments/confirm`;
  const { status, data } = await httpJson({
    url,
    method: "POST",
    headers: {
      Authorization: getBasicAuthHeader(),
      "Content-Type": "application/json",
    },
    body: { paymentKey, orderId, amount },
  });

  if (status < 200 || status >= 300) {
    const msg =
      (data && typeof data === "object" && data.message) ||
      `토스 결제 승인 실패 (status=${status})`;
    const err = new Error(msg);
    err.statusCode = status;
    err.data = data;
    throw err;
  }

  return data;
}

export async function tossCancelPayment({
  paymentKey,
  cancelReason,
  cancelAmount,
  refundReceiveAccount,
  idempotencyKey,
}) {
  const url = `${getTossBaseUrl()}/v1/payments/${encodeURIComponent(
    paymentKey
  )}/cancel`;

  const headers = {
    Authorization: getBasicAuthHeader(),
    "Content-Type": "application/json",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  const body = {
    cancelReason,
  };
  if (typeof cancelAmount === "number") body.cancelAmount = cancelAmount;
  if (refundReceiveAccount) body.refundReceiveAccount = refundReceiveAccount;

  const { status, data } = await httpJson({
    url,
    method: "POST",
    headers,
    body,
  });

  if (status < 200 || status >= 300) {
    const msg =
      (data && typeof data === "object" && data.message) ||
      `토스 결제 취소 실패 (status=${status})`;
    const err = new Error(msg);
    err.statusCode = status;
    err.data = data;
    throw err;
  }

  return data;
}

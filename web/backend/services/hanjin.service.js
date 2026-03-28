import crypto from "crypto";
import axios from "axios";

const clientId = String(process.env.HANJIN_CLIENT_ID || "").trim();
const apiKey = String(process.env.HANJIN_API_KEY || "").trim();
const secretKey = String(process.env.HANJIN_SECRET_KEY || "").trim();

const DEFAULT_TIMEOUT_MS = Number(process.env.HANJIN_TIMEOUT_MS || 30000);

function sanitizeForLog(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(sanitizeForLog);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        /secret|signature|authorization|api[-_]?key/i.test(key)
          ? "[redacted]"
          : sanitizeForLog(nestedValue),
      ]),
    );
  }
  return value;
}

const baseUrls = {
  // 운송장 출력(라벨) API – Swagger: swagger-print-wbl.html
  print: (
    process.env.HANJIN_PRINT_BASE_URL || "https://ebbapd.hjt.co.kr"
  ).replace(/\/+$/, ""),
  // 주문/배송 API – Swagger: swagger-pd-order.html
  order: (
    process.env.HANJIN_ORDER_BASE_URL || "https://api-stg.hanjin.com"
  ).replace(/\/+$/, ""),
  // 고객/계약 등 기타 API – Swagger: swagger-pd-customer.html
  customer: (
    process.env.HANJIN_CUSTOMER_BASE_URL || "https://api-stg.hanjin.com"
  ).replace(/\/+$/, ""),
};

function ensureConfigured() {
  if (!clientId || !apiKey || !secretKey) {
    throw new Error(
      "HANJIN_CLIENT_ID / HANJIN_API_KEY / HANJIN_SECRET_KEY must be configured.",
    );
  }
  return true;
}

function formatKstTimestamp(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}${map.month}${map.day}${map.hour}${map.minute}${map.second}`;
}

function canonicalizeQuery(params) {
  if (!params) return "";
  const searchParams = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(params)) {
    if (rawValue == null) continue;
    if (Array.isArray(rawValue)) {
      for (const item of rawValue) {
        if (item == null) continue;
        searchParams.append(key, String(item));
      }
      continue;
    }
    searchParams.append(key, String(rawValue));
  }
  return searchParams.toString();
}

function buildSignature({ method, timestamp, params }) {
  ensureConfigured();
  const queryString = canonicalizeQuery(params);
  const canonical = `${timestamp}${String(method || "GET").toUpperCase()}${queryString}${secretKey}`;
  return crypto.createHmac("sha256", secretKey).update(canonical).digest("hex");
}

function buildAuthorizationHeader({ method, timestamp, params }) {
  const signature = buildSignature({ method, timestamp, params });
  return `client_id=${clientId} timestamp=${timestamp} signature=${signature}`;
}

function resolveUrl(baseUrl, path = "/") {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(normalizedPath, `${baseUrl}/`);
  return {
    url: url.toString(),
    canonicalPath: url.pathname + (url.search || ""),
  };
}

async function requestHanjin({
  baseUrl,
  path,
  method = "POST",
  data = undefined,
  params = undefined,
  headers = undefined,
  timeout = DEFAULT_TIMEOUT_MS,
}) {
  ensureConfigured();
  const { url, canonicalPath } = resolveUrl(baseUrl, path);
  const now = new Date();
  const timestamp = formatKstTimestamp(now);
  const authorization = buildAuthorizationHeader({
    method,
    timestamp,
    params,
  });

  const startTime = Date.now();
  console.log("[hanjin] outbound request", {
    clientId,
    method,
    url,
    canonicalPath,
    timestamp,
    params: sanitizeForLog(params),
    data: sanitizeForLog(data),
  });

  try {
    const response = await axios({
      url,
      method,
      data,
      params,
      timeout,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "x-api-key": apiKey,
        Authorization: authorization,
        ...headers,
      },
    });
    const elapsedMs = Date.now() - startTime;
    console.log("[hanjin] outbound response", {
      clientId,
      method,
      url,
      status: response.status,
      elapsedMs,
      elapsedSec: (elapsedMs / 1000).toFixed(2),
      data: sanitizeForLog(response.data),
    });
    return response.data;
  } catch (error) {
    const status = error.response?.status;
    const payload = error.response?.data;
    const message =
      payload?.message || error.message || "hanjin request failed";
    console.error("[hanjin] outbound error", {
      clientId,
      method,
      url,
      canonicalPath,
      status,
      timestamp,
      data: sanitizeForLog(data),
      response: sanitizeForLog(payload),
      message,
    });
    const enriched = new Error(`[hanjin] ${message}`);
    enriched.status = status;
    enriched.data = payload;
    enriched.meta = {
      url,
      method,
      timestamp,
    };
    throw enriched;
  }
}

export const hanjinService = {
  isConfigured: () => Boolean(clientId && apiKey && secretKey),
  getConfig: () => ({ clientId, apiKey, baseUrls: { ...baseUrls } }),
  buildAuthorizationHeader,
  request: requestHanjin,
  requestPrintApi: (options) =>
    requestHanjin({ baseUrl: baseUrls.print, ...options }),
  requestOrderApi: (options) =>
    requestHanjin({ baseUrl: baseUrls.order, ...options }),
  requestCustomerApi: (options) =>
    requestHanjin({ baseUrl: baseUrls.customer, ...options }),
};

export default hanjinService;

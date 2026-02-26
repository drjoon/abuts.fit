import crypto from "crypto";
import axios from "axios";

const clientId = String(process.env.HANJIN_CLIENT_ID || "").trim();
const apiKey = String(process.env.HANJIN_API_KEY || "").trim();
const secretKey = String(process.env.HANJIN_SECRET_KEY || "").trim();

const DEFAULT_TIMEOUT_MS = Number(process.env.HANJIN_TIMEOUT_MS || 15000);

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

function canonicalizeBody(body) {
  if (body == null) return "";
  if (typeof body === "string") return body;
  return JSON.stringify(body);
}

function buildSignature({ method, path, timestamp, body }) {
  ensureConfigured();
  const canonical = [
    method.toUpperCase(),
    path,
    timestamp,
    canonicalizeBody(body),
  ].join("\n");
  return crypto
    .createHmac("sha256", secretKey)
    .update(canonical)
    .digest("base64");
}

function buildAuthorizationHeader({ method, path, timestamp, body }) {
  const signature = buildSignature({ method, path, timestamp, body });
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
  const timestamp = formatKstTimestamp();
  const authorization = buildAuthorizationHeader({
    method,
    path: canonicalPath,
    timestamp,
    body: data,
  });

  try {
    const response = await axios({
      url,
      method,
      data,
      params,
      timeout,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        Authorization: authorization,
        ...headers,
      },
    });
    return response.data;
  } catch (error) {
    const status = error.response?.status;
    const payload = error.response?.data;
    const message =
      payload?.message || error.message || "hanjin request failed";
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

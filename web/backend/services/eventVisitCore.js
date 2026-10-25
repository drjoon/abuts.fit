// related files:
// - web/backend/services/eventVisitLog.service.js
// - web/backend/controllers/events/eventVisit.controller.js
// - web/backend/tests/unit/eventVisitCore.test.js

const KST = "Asia/Seoul";
const MAX_DWELL_MS = 6 * 60 * 60 * 1000;
const SESSION_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GeoIP region code → 시·도. geoip-lite·CloudFront 코드 공통. */
const KR_REGION = {
  11: "서울",
  26: "부산",
  27: "대구",
  28: "인천",
  29: "광주",
  30: "대전",
  31: "울산",
  41: "경기",
  42: "강원",
  43: "충북",
  44: "충남",
  45: "전북",
  46: "전남",
  47: "경북",
  48: "경남",
  49: "제주",
  50: "세종",
};

const COUNTRY_KO = {
  KR: "대한민국",
  US: "미국",
  JP: "일본",
  CN: "중국",
  VN: "베트남",
  TW: "대만",
  HK: "홍콩",
  SG: "싱가포르",
  TH: "태국",
  DE: "독일",
  GB: "영국",
  FR: "프랑스",
  AU: "호주",
  CA: "캐나다",
};

export function kstParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value]),
  );
  const hour = Number(parts.hour);
  return {
    kstDate: `${parts.year}-${parts.month}-${parts.day}`,
    kstHour: Number.isFinite(hour) ? hour % 24 : 0,
  };
}

/** 달력 날짜(YYYY-MM-DD)를 KST 기준으로 days만큼 이동. */
export function shiftKstDate(ymd, days) {
  const [y, m, d] = String(ymd || "")
    .split("-")
    .map((n) => Number(n));
  if (!y || !m || !d) return "";
  const utc = new Date(Date.UTC(y, m - 1, d, 12));
  utc.setUTCDate(utc.getUTCDate() + Number(days || 0));
  const yy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(utc.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function isKstDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

export function classifyDevice(ua) {
  const s = String(ua || "");
  if (/iPad|Tablet|SM-T|Kindle/i.test(s)) return "tablet";
  if (/Mobile|Android|iPhone|iPod/i.test(s)) return "mobile";
  return "desktop";
}

export function classifyBrowser(ua) {
  const s = String(ua || "");
  if (/Edg\//.test(s)) return "Edge";
  if (/OPR\/|Opera/.test(s)) return "Opera";
  if (/Chrome\//.test(s) && !/Edg\//.test(s)) return "Chrome";
  if (/Firefox\//.test(s)) return "Firefox";
  if (/Safari\//.test(s)) return "Safari";
  return "Other";
}

export function regionName(country, code, headerName) {
  const named = String(headerName || "").trim();
  if (named) return named.slice(0, 80);
  const c = String(code || "").trim();
  if (String(country || "").toUpperCase() === "KR" && KR_REGION[c]) {
    return KR_REGION[c];
  }
  return c.slice(0, 80);
}

export function countryLabel(code) {
  const c = String(code || "").trim().toUpperCase();
  return COUNTRY_KO[c] || c;
}

export function placeLabel({ country, regionName: region, city }) {
  const nation = countryLabel(country);
  const area = String(region || "").trim();
  const cityName = String(city || "").trim();
  if (String(country || "").toUpperCase() === "KR") {
    if (area && cityName) return `${area} · ${cityName}`;
    return area || nation || "알 수 없음";
  }
  const parts = [nation, area, cityName].filter(Boolean);
  return parts.join(" · ") || "알 수 없음";
}

function clip(value, max) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function num(value, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(max, Math.round(n));
}

export function referrerHost(referrer) {
  const raw = clip(referrer, 500);
  if (!raw) return "";
  try {
    const host = new URL(raw).hostname.replace(/^www\./, "");
    return host.slice(0, 120);
  } catch {
    return "";
  }
}

/**
 * 공개 방문 핑 바디. 실패 시 `{ ok:false }`.
 * @returns {{ ok: true, value: object } | { ok: false, message: string }}
 */
export function sanitizeVisitBody(body) {
  const src = body && typeof body === "object" ? body : {};
  const sessionId = String(src.sessionId || "").trim();
  if (!SESSION_RE.test(sessionId)) {
    return { ok: false, message: "sessionId가 필요합니다." };
  }
  const rawType = String(src.type || "").trim();
  const type = rawType === "ping" ? "progress" : rawType;
  if (type !== "enter" && type !== "progress" && type !== "leave") {
    return { ok: false, message: "type이 올바르지 않습니다." };
  }
  const visitorRaw = String(src.visitorId || "").trim();
  return {
    ok: true,
    value: {
      sessionId,
      type,
      dwellMs: num(src.dwellMs, MAX_DWELL_MS),
      scrollPct: num(src.scrollPct, 100),
      referrerHost: referrerHost(src.referrer),
      lang: clip(src.lang, 40),
      utmSource: clip(src.utmSource, 80),
      utmMedium: clip(src.utmMedium, 80),
      utmCampaign: clip(src.utmCampaign, 80),
      visitorId: SESSION_RE.test(visitorRaw) ? visitorRaw : "",
      returning: Boolean(src.returning),
      reachedApply: Boolean(src.reachedApply),
      formStarted: Boolean(src.formStarted),
    },
  };
}

export function clientIp(req) {
  const forwarded = req?.headers?.["x-forwarded-for"];
  const raw = Array.isArray(forwarded)
    ? forwarded[0]
    : String(forwarded || "");
  const first = raw.split(",")[0].trim();
  const ip = (first || String(req?.ip || "")).replace(/^::ffff:/, "");
  return ip.slice(0, 64);
}

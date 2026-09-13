// related files:
// - web/backend/modules/salesTeam/salesTeam.routes.js
// - web/backend/models/sales/salesAccount.model.js
// - web/backend/models/sales/salesVisit.model.js
// - web/backend/models/sales/salesDailyReport.model.js
import { Types } from "mongoose";
import SalesAccount from "../../models/sales/salesAccount.model.js";
import SalesVisit from "../../models/sales/salesVisit.model.js";
import SalesDailyReport from "../../models/sales/salesDailyReport.model.js";
import User from "../../models/user.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import { toKstYmd } from "../../utils/krBusinessDays.js";
import {
  ensureSalesTeamReferralCode,
  resolveSalesTeamReferralAnchorId,
} from "../../utils/salesTeamReferral.util.js";
import { getPlatformSocialProof } from "../../services/platformGrowthStats.service.js";
import { listNoOrderAlerts } from "../../services/noOrderAlerts.service.js";

const COMMITMENTS = new Set(["confirmed", "around", "askBefore"]);
const VISIT_STATUSES = new Set([
  "planned",
  "done",
  "canceled",
  "noShow",
  "postponed",
]);
const ACCOUNT_KINDS = new Set(["practice", "lab"]);

function oid(value) {
  const s = String(value || "").trim();
  return Types.ObjectId.isValid(s) ? new Types.ObjectId(s) : null;
}

function parseYmd(raw) {
  const s = String(raw || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** KST civil day → UTC Date range [start, end) */
function kstYmdToUtcRange(ymd) {
  const parsed = parseYmd(ymd);
  if (!parsed) return null;
  const start = new Date(`${parsed}T00:00:00+09:00`);
  const endExclusive = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end: endExclusive };
}

function periodToRange(period, fromYmd, toYmd) {
  const now = new Date();
  const todayYmd = toKstYmd(now);
  if (fromYmd && toYmd) {
    const fromR = kstYmdToUtcRange(fromYmd);
    const toR = kstYmdToUtcRange(toYmd);
    if (fromR && toR) return { start: fromR.start, end: toR.end };
  }
  const p = String(period || "30d").trim();
  const days =
    p === "7d" ? 7 : p === "90d" ? 90 : p === "thisMonth" ? null : 30;
  if (p === "thisMonth" && todayYmd) {
    const [y, m] = todayYmd.split("-");
    const fromR = kstYmdToUtcRange(`${y}-${m}-01`);
    const toR = kstYmdToUtcRange(todayYmd);
    if (fromR && toR) return { start: fromR.start, end: toR.end };
  }
  const end = now;
  const start = new Date(now.getTime() - (days || 30) * 24 * 60 * 60 * 1000);
  return { start, end };
}

function haversineKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 단거리(0.05km 등)가 0으로 보이지 않게 */
function roundRouteKm(km) {
  const n = Number(km);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n < 1) return Math.round(n * 100) / 100;
  return Math.round(n * 10) / 10;
}

/** Nearest-neighbor TSP from optional start; returns ordered indices into points */
function nearestNeighborOrder(points, startIndex = 0) {
  const n = points.length;
  if (n === 0) return [];
  const used = new Array(n).fill(false);
  const order = [];
  let cur = Math.max(0, Math.min(n - 1, startIndex));
  for (let step = 0; step < n; step += 1) {
    used[cur] = true;
    order.push(cur);
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < n; i += 1) {
      if (used[i]) continue;
      const d = haversineKm(points[cur], points[i]);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    if (best < 0) break;
    cur = best;
  }
  return order;
}

function pathLengthKm(points, order) {
  let total = 0;
  for (let i = 1; i < order.length; i += 1) {
    total += haversineKm(points[order[i - 1]], points[order[i]]);
  }
  return total;
}

/** 2-opt improvement on an index order (straight-line km). */
function twoOptImprove(points, order) {
  if (order.length < 4) return order.slice();
  let best = order.slice();
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < best.length - 2; i += 1) {
      for (let k = i + 1; k < best.length - 1; k += 1) {
        const next = best
          .slice(0, i)
          .concat(best.slice(i, k + 1).reverse())
          .concat(best.slice(k + 1));
        if (pathLengthKm(points, next) + 1e-9 < pathLengthKm(points, best)) {
          best = next;
          improved = true;
        }
      }
    }
  }
  return best;
}

function nearestIndexToPoint(points, from) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const d = haversineKm(from, points[i]);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/** KST civil calendar: add delta days to YYYY-MM-DD. */
function addDaysYmd(ymd, delta) {
  const parsed = parseYmd(ymd);
  if (!parsed) return null;
  const [y, m, d] = parsed.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta, 12));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function optimizePointsOrder(points) {
  if (!points.length) return { order: [], totalKm: 0 };
  if (points.length === 1) return { order: [0], totalKm: 0 };
  const order = twoOptImprove(points, nearestNeighborOrder(points, 0));
  return { order, totalKm: roundRouteKm(pathLengthKm(points, order)) };
}

function kakaoMapUrlForStops(stops) {
  const mapStops = (stops || []).filter(
    (s) =>
      s.lat != null &&
      s.lng != null &&
      Number.isFinite(s.lat) &&
      Number.isFinite(s.lng),
  );
  if (mapStops.length < 1) return null;
  return `https://map.kakao.com/?map_type=TYPE_MAP&target=car&rt=${mapStops
    .map((s) => `${s.lng},${s.lat}`)
    .join(",")}`;
}

function formatKstHm(date) {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function clampBusinessHm(hm) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(hm || "").trim());
  if (!m) return "10:00";
  let minutes = Number(m[1]) * 60 + Number(m[2]);
  const min = 9 * 60;
  const max = 18 * 60;
  if (minutes < min) minutes = min;
  if (minutes > max) minutes = max;
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function hmToMinutes(hm) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(hm || "").trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function minutesToHm(total) {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(total)));
  const hh = String(Math.floor(clamped / 60)).padStart(2, "0");
  const mm = String(clamped % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function addMinutesHm(hm, deltaMin) {
  const base = hmToMinutes(hm);
  if (base == null) return clampBusinessHm("10:00");
  return clampBusinessHm(minutesToHm(base + deltaMin));
}

/** Round to nearest 15 minutes within business hours. */
function roundHmToStep(hm, stepMin = 15) {
  const base = hmToMinutes(clampBusinessHm(hm));
  if (base == null) return "10:00";
  const rounded = Math.round(base / stepMin) * stepMin;
  return clampBusinessHm(minutesToHm(rounded));
}

/**
 * 기예약 → 목표 이동 간격(분).
 * 수도권: 5km당 1시간, 지방: 20km당 1시간 + 미팅·대기 1시간.
 */
function travelGapMinutes(from, to) {
  const km = Math.max(0, haversineKm(from, to));
  const metro = isCapitalRegion(from) && isCapitalRegion(to);
  const kmPerHour = metro ? METRO_KM_PER_HOUR : PROVINCIAL_KM_PER_HOUR;
  const driveMin = Math.ceil((km / kmPerHour) * 60);
  return driveMin + SUGGEST_MEETING_MIN;
}

/**
 * 수도권(서울·인천·경기) 여부. 주소 우선, 없으면 대략 bbox.
 */
function isCapitalRegion(point) {
  const addr = String(point?.address || "");
  if (/서울|인천|경기/.test(addr)) return true;
  if (
    /부산|대구|광주|대전|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주|거제|통영|창원|김해|진주/.test(
      addr,
    )
  ) {
    return false;
  }
  const lat = Number(point?.lat);
  const lng = Number(point?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= 36.9 && lat <= 38.35 && lng >= 126.4 && lng <= 127.9;
}

/**
 * 최적 동선 순서에서 목표 스톱 앞/뒤 기예약을 보고
 * 이동 거리를 반영한 시각을 제안. 기존 시각과 겹치지 않게 밀어냄.
 */
function suggestTimeForTarget(stops, targetPoint, orderedWithTarget) {
  if (!stops?.length) {
    return { suggestedTime: "10:00", anchorName: "", anchorTime: null };
  }

  const extraIdx = (orderedWithTarget || []).findIndex((s) => s.isExtra);
  let prev = null;
  let next = null;
  if (extraIdx >= 0 && orderedWithTarget?.length) {
    for (let i = extraIdx - 1; i >= 0; i -= 1) {
      if (!orderedWithTarget[i].isExtra) {
        prev = orderedWithTarget[i];
        break;
      }
    }
    for (let i = extraIdx + 1; i < orderedWithTarget.length; i += 1) {
      if (!orderedWithTarget[i].isExtra) {
        next = orderedWithTarget[i];
        break;
      }
    }
  }
  if (!prev && !next) {
    // 폴백: 50km → 100km 안 최근접
    let nearest = null;
    let nearestKm = Infinity;
    for (const s of stops) {
      const d = haversineKm(targetPoint, s);
      if (d < nearestKm) {
        nearestKm = d;
        nearest = s;
      }
    }
    if (nearest && nearestKm <= ROUTE_NEARBY_SECONDARY_KM) {
      prev = nearest;
    } else {
      return { suggestedTime: "10:00", anchorName: "", anchorTime: null };
    }
  }

  const occupied = new Set();
  for (const s of stops) {
    const hm = formatKstHm(s.plannedAt);
    if (hm) occupied.add(hm);
  }

  const trySlot = (rawHm) => {
    let hm = roundHmToStep(rawHm);
    let guard = 0;
    while (occupied.has(hm) && guard < 32) {
      hm = addMinutesHm(hm, 15);
      guard += 1;
    }
    return hm;
  };

  let suggestedTime = "10:00";
  let anchorName = "";
  let anchorTime = null;

  if (prev && next) {
    const prevHm = formatKstHm(prev.plannedAt) || "10:00";
    const nextHm = formatKstHm(next.plannedAt) || "15:00";
    const gapAfterPrev = travelGapMinutes(prev, targetPoint);
    const gapBeforeNext = travelGapMinutes(targetPoint, next);
    const afterPrev = addMinutesHm(prevHm, gapAfterPrev);
    const beforeNext = addMinutesHm(nextHm, -gapBeforeNext);
    const afterMin = hmToMinutes(afterPrev) ?? 10 * 60;
    const beforeMin = hmToMinutes(beforeNext) ?? 15 * 60;
    if (afterMin <= beforeMin) {
      suggestedTime = trySlot(
        minutesToHm(Math.round((afterMin + beforeMin) / 2)),
      );
    } else {
      suggestedTime = trySlot(afterPrev);
    }
    anchorName = prev.name || "";
    anchorTime = prevHm;
  } else if (prev) {
    const prevHm = formatKstHm(prev.plannedAt) || "10:00";
    const gap = travelGapMinutes(prev, targetPoint);
    suggestedTime = trySlot(addMinutesHm(prevHm, gap));
    anchorName = prev.name || "";
    anchorTime = prevHm;
  } else if (next) {
    const nextHm = formatKstHm(next.plannedAt) || "15:00";
    const gap = travelGapMinutes(targetPoint, next);
    suggestedTime = trySlot(addMinutesHm(nextHm, -gap));
    anchorName = next.name || "";
    anchorTime = nextHm;
  }

  return {
    suggestedTime: clampBusinessHm(suggestedTime),
    anchorName,
    anchorTime,
  };
}

function ymdDiffDays(a, b) {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const aUtc = Date.UTC(ay, am - 1, ad, 12);
  const bUtc = Date.UTC(by, bm - 1, bd, 12);
  return Math.round((aUtc - bUtc) / (24 * 60 * 60 * 1000));
}

/** KST civil YYYY-MM-DD → that week's Monday (Mon-start week). */
function startOfWeekMondayYmd(ymd) {
  const parsed = parseYmd(ymd);
  if (!parsed) return null;
  const [y, m, d] = parsed.split("-").map(Number);
  // UTC noon weekday avoids TZ drift; Sun=0 … Sat=6
  const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  const sinceMon = (dow + 6) % 7;
  return addDaysYmd(parsed, -sinceMon);
}

/**
 * 선택일 기준 「전주 월요일 ~ 다음주 금요일」.
 * 생성일(오늘) 다음 날부터만 포함.
 */
function suggestDaysWindow(anchorYmd, createYmd) {
  const weekMon = startOfWeekMondayYmd(anchorYmd);
  if (!weekMon || !createYmd) return null;
  const windowStart = addDaysYmd(weekMon, -7);
  const windowEnd = addDaysYmd(weekMon, 11); // next week Friday
  const earliest = addDaysYmd(createYmd, 1);
  if (!windowStart || !windowEnd || !earliest) return null;
  let fromYmd = windowStart;
  if (ymdDiffDays(fromYmd, earliest) < 0) fromYmd = earliest;
  if (ymdDiffDays(fromYmd, windowEnd) > 0) {
    return {
      fromYmd,
      toYmd: windowEnd,
      windowStart,
      windowEnd,
      earliest,
      empty: true,
    };
  }
  return {
    fromYmd,
    toYmd: windowEnd,
    windowStart,
    windowEnd,
    earliest,
    empty: false,
  };
}

/** 1차 50km / 2차 100km 이내 기예약과 뭉침 */
const ROUTE_NEARBY_PRIMARY_KM = 50;
const ROUTE_NEARBY_SECONDARY_KM = 100;
/** 같은 날 우회가 이하면 2차(100km)도 효율로 인정 */
const ROUTE_EFFICIENT_DETOUR_KM = 25;
/** 수도권 5km/h, 지방 20km/h + 미팅·대기 1시간 */
const METRO_KM_PER_HOUR = 5;
const PROVINCIAL_KM_PER_HOUR = 20;
const SUGGEST_MEETING_MIN = 60;

/**
 * Kakao Local / keyword APIs use the REST API key (`KakaoAK …`).
 * In this project the OAuth client id is typically that same REST key.
 */
function kakaoRestApiKey() {
  return String(
    process.env.KAKAO_REST_API_KEY || process.env.KAKAO_CLIENT_ID || "",
  ).trim();
}

/** True when a REST key string is present (may still be unauthorized for Local). */
function hasKakaoRestKeyConfigured() {
  return Boolean(kakaoRestApiKey());
}

function isKakaoLocalAuthError(status, json) {
  if (status === 401 || status === 403) return true;
  const code = String(json?.code || json?.errorType || "").toLowerCase();
  return (
    code.includes("notauthorized") ||
    code.includes("accessdenied") ||
    code.includes("unauthorized")
  );
}

/**
 * OpenStreetMap Nominatim address → coords (Kakao Local 미활성 시 폴백).
 * Low volume sales geocode only; identify app via User-Agent.
 */
async function geocodeAddressNominatim(address) {
  const addr = String(address || "").trim();
  if (!addr) return null;
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", addr);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "kr");
    const resp = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "abuts.fit-sales/1.0 (geocode; contact=ops@abuts.fit)",
      },
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    const doc = Array.isArray(json) ? json[0] : null;
    if (!doc) return null;
    const lat = Number(doc.lat);
    const lng = Number(doc.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      lat,
      lng,
      address: String(doc.display_name || addr).trim() || addr,
      provider: "nominatim",
    };
  } catch {
    return null;
  }
}

/**
 * Geocode via Kakao Local when authorized; otherwise Nominatim.
 * Returns null when neither provider can resolve the address.
 */
async function geocodeAddress(address) {
  const addr = String(address || "").trim();
  if (!addr) return null;
  const key = kakaoRestApiKey();
  if (key) {
    try {
      const url = new URL("https://dapi.kakao.com/v2/local/search/address.json");
      url.searchParams.set("query", addr);
      const resp = await fetch(url.toString(), {
        headers: { Authorization: `KakaoAK ${key}` },
      });
      const json = await resp.json().catch(() => ({}));
      if (resp.ok) {
        const doc = json?.documents?.[0];
        if (doc) {
          const lat = Number(doc.y);
          const lng = Number(doc.x);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            return {
              lat,
              lng,
              address: doc.address_name || addr,
              provider: "kakao",
            };
          }
        }
      } else if (isKakaoLocalAuthError(resp.status, json)) {
        console.warn(
          "[salesTeam.geocodeAddress] Kakao Local unauthorized; falling back to Nominatim",
          { status: resp.status, errorType: json?.errorType || json?.code },
        );
      }
    } catch (e) {
      console.warn("[salesTeam.geocodeAddress] Kakao request failed", e?.message || e);
    }
  }
  return geocodeAddressNominatim(addr);
}

/**
 * Kakao place → practice(치과) | lab(기공소) | null(그 외 제외).
 * category_name / place_name 기준. 수목원·도로명 등 일반 POI는 null.
 */
function inferDentalPlaceKind(category, placeName) {
  const hay = `${String(category || "")}\n${String(placeName || "")}`;
  if (/기공|denture|dental\s*lab/i.test(hay)) return "lab";
  if (/치과|치의원|dental|dentist/i.test(hay)) return "practice";
  return null;
}

/** 카카오 키워드 지역 팬아웃 — 정확도 상위 45건에 안 잡히는 전국 지점 회수 */
const KAKAO_DENTAL_REGION_PREFIXES = [
  "서울",
  "부산",
  "대구",
  "인천",
  "광주",
  "대전",
  "울산",
  "세종",
  "경기",
  "강원",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남",
  "제주",
  "거제",
  "창원",
  "김해",
  "진주",
  "통영",
  "고현",
  "수원",
  "성남",
  "용인",
  "고양",
  "화성",
  "청주",
  "천안",
  "전주",
  "포항",
];

const KAKAO_REGION_TOKEN_SET = new Set(KAKAO_DENTAL_REGION_PREFIXES);

/**
 * 「거제 서울미소」「서울미소 거제」처럼 띄어쓰기 → 지역 + 상호.
 * 토큰 단위로만 지역을 인정(「서울미소」는 지역 아님).
 */
function parseRegionNameQuery(query) {
  const raw = String(query || "").trim().replace(/\s+/g, " ");
  if (!raw) return { region: "", name: "", raw: "" };
  if (!/\s/.test(raw)) return { region: "", name: raw, raw };

  const parts = raw.split(" ");
  const regionHead = [];
  let i = 0;
  while (i < parts.length - 1 && KAKAO_REGION_TOKEN_SET.has(parts[i])) {
    regionHead.push(parts[i]);
    i += 1;
  }
  if (regionHead.length > 0 && i < parts.length) {
    return {
      region: regionHead.join(" "),
      name: parts.slice(i).join(" "),
      raw,
    };
  }

  const last = parts[parts.length - 1];
  if (parts.length >= 2 && KAKAO_REGION_TOKEN_SET.has(last)) {
    return {
      region: last,
      name: parts.slice(0, -1).join(" "),
      raw,
    };
  }

  return { region: "", name: raw, raw };
}

function addressMatchesRegion(address, region) {
  const addr = String(address || "");
  const reg = String(region || "").trim();
  if (!addr || !reg) return false;
  const tokens = reg.split(/\s+/).filter(Boolean);
  return tokens.every((t) => addr.includes(t));
}

function placeMatchesRegion(it, region) {
  if (!region) return true;
  return (
    addressMatchesRegion(it.address, region) ||
    addressMatchesRegion(it.addressMatch, region)
  );
}

function mapKakaoDentalDoc(doc) {
  const lat = Number(doc.y);
  const lng = Number(doc.x);
  const category = String(doc.category_name || "");
  const name = String(doc.place_name || "").trim();
  const kind = inferDentalPlaceKind(category, name);
  if (!kind || !name) return null;
  return {
    source: "kakao",
    name,
    address: String(doc.road_address_name || doc.address_name || "").trim(),
    phone: String(doc.phone || "").trim(),
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    kind,
    category,
  };
}

function dentalPlaceDedupeKey(it) {
  return `${String(it.name || "")}|${String(it.address || "")}`.toLowerCase();
}

/**
 * 카카오맵 웹 검색(Local REST에 없는 POI 보완).
 * 예: 거제 고현 서울미소치과의원 — Map에는 있고 dapi Local에는 없음.
 */
async function kakaoMapWebKeywordSearch(query, { limit = 15 } = {}) {
  const q = String(query || "").trim();
  if (!q) return { items: [] };
  const cap = Math.min(30, Math.max(1, Number(limit) || 15));
  try {
    const url = new URL("https://search.map.kakao.com/mapsearch/map.daum");
    url.searchParams.set("q", q);
    url.searchParams.set("msFlag", "S");
    url.searchParams.set("page", "1");
    const resp = await fetch(url.toString(), {
      headers: {
        Accept: "application/json, text/javascript, */*",
        Referer: "https://map.kakao.com/",
        "User-Agent":
          "Mozilla/5.0 (compatible; abuts.fit-sales/1.0; +https://abuts.fit)",
      },
    });
    const raw = await resp.text();
    if (!resp.ok) return { items: [] };
    let json = null;
    try {
      const stripped = raw
        .replace(/^\s*\/\*\*\/\s*/, "")
        .replace(/^jQuery\d*_\d*\(/, "")
        .replace(/^jQuery\(/, "")
        .replace(/\)\s*;?\s*$/, "");
      json = JSON.parse(stripped);
    } catch {
      return { items: [] };
    }
    const places = Array.isArray(json?.place) ? json.place : [];
    const items = [];
    const seen = new Set();
    for (const p of places) {
      const name = String(p.name || "").trim();
      const category = [
        p.cate_name_depth1,
        p.cate_name_depth2,
        p.cate_name_depth3,
        p.last_cate_name,
      ]
        .filter(Boolean)
        .join(" > ");
      const kind = inferDentalPlaceKind(category, name);
      if (!kind || !name) continue;
      const lat = Number(p.lat);
      const lng = Number(p.lon);
      const road = String(p.new_address || p.road_address || "").trim();
      const jibun = String(p.address || "").trim();
      // 도로명에 동명이 없을 수 있어(거제중앙로 vs 고현동) 매칭용으로 둘 다 보관
      const address = road || jibun;
      const row = {
        source: "kakao",
        name,
        address,
        addressMatch: `${road} ${jibun}`.trim(),
        phone: String(p.tel || "").trim(),
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
        kind,
        category,
      };
      const key = dentalPlaceDedupeKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(row);
      if (items.length >= cap) break;
    }
    return { items };
  } catch (e) {
    console.warn(
      "[salesTeam.kakaoMapWebKeywordSearch]",
      e?.message || e,
    );
    return { items: [] };
  }
}

/** 모호한 지역명 → 지오코딩 후보 (고현=영주/거제 충돌 등) */
function regionGeocodeCandidates(region) {
  const r = String(region || "").trim();
  if (!r) return [];
  const extras = {
    고현: ["거제시 고현동", "경남 거제 고현", "영주시 고현동"],
  };
  const list = extras[r] || [];
  return [...new Set([r, ...list, `경남 ${r}`, `경북 ${r}`])];
}

async function geocodeRegionHint(region) {
  for (const cand of regionGeocodeCandidates(region)) {
    const geo = await geocodeAddress(cand);
    if (geo && Number.isFinite(geo.lat) && Number.isFinite(geo.lng)) {
      return geo;
    }
  }
  return null;
}

/** 상호 일치도 + (있으면) 지역 주소 일치로 정렬 */
function rankDentalKakaoItems(items, query, region = "") {
  const parsed = parseRegionNameQuery(query);
  const nameQ = (parsed.name || String(query || "").trim()).toLowerCase();
  const qCompact = nameQ.replace(/\s+/g, "");
  const reg = String(region || parsed.region || "").trim();
  const score = (it) => {
    const name = String(it.name || "").toLowerCase();
    const compact = name.replace(/\s+/g, "");
    let s = 0;
    if (qCompact) {
      if (compact === qCompact) s += 300;
      else if (compact.startsWith(qCompact)) s += 200;
      else if (compact.includes(qCompact)) s += 100;
      else if (name.includes(nameQ)) s += 50;
    }
    if (reg && placeMatchesRegion(it, reg)) s += 400;
    return s;
  };
  return [...items].sort((a, b) => score(b) - score(a));
}

/**
 * Kakao Local keyword search for place autosuggest.
 * 치과·기공소만 반환한다 (category/상호 휴리스틱).
 * @returns {{ items: Array, authError: boolean, truncated: boolean }}
 */
async function kakaoKeywordSearch(
  query,
  { limit = 8, maxPages = 1, x, y, radius, sort } = {},
) {
  const q = String(query || "").trim();
  const key = kakaoRestApiKey();
  if (!q || !key) return { items: [], authError: false, truncated: false };
  const pages = Math.min(3, Math.max(1, Number(maxPages) || 1));
  const cap = Math.min(45, Math.max(1, Number(limit) || 8));
  const seen = new Set();
  const items = [];
  let authError = false;
  let truncated = false;
  try {
    for (let page = 1; page <= pages; page += 1) {
      const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
      url.searchParams.set("query", q);
      // 필터 후 부족할 수 있어 API size는 상한(15)까지 요청
      url.searchParams.set("size", "15");
      url.searchParams.set("page", String(page));
      if (x != null && y != null) {
        url.searchParams.set("x", String(x));
        url.searchParams.set("y", String(y));
        if (radius != null) url.searchParams.set("radius", String(radius));
        if (sort) url.searchParams.set("sort", String(sort));
      }
      const resp = await fetch(url.toString(), {
        headers: { Authorization: `KakaoAK ${key}` },
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        authError = isKakaoLocalAuthError(resp.status, json);
        if (authError) {
          console.warn(
            "[salesTeam.kakaoKeywordSearch] Kakao Local unauthorized",
            { status: resp.status, errorType: json?.errorType || json?.code },
          );
        }
        break;
      }
      const docs = Array.isArray(json?.documents) ? json.documents : [];
      for (const doc of docs) {
        const row = mapKakaoDentalDoc(doc);
        if (!row) continue;
        const keyRow = dentalPlaceDedupeKey(row);
        if (seen.has(keyRow)) continue;
        seen.add(keyRow);
        items.push(row);
        if (items.length >= cap) break;
      }
      const meta = json?.meta || {};
      const isEnd = Boolean(meta.is_end);
      const pageable = Number(meta.pageable_count) || 0;
      const total = Number(meta.total_count) || 0;
      if (!isEnd && (pageable >= 45 || total > items.length)) truncated = true;
      if (isEnd || items.length >= cap || docs.length === 0) break;
    }
    return { items: items.slice(0, cap), authError, truncated };
  } catch {
    return { items: [], authError: false, truncated: false };
  }
}

/**
 * 치과·기공소 회수율.
 * - 띄어쓰기 「지역 + 상호」→ 상호로 검색 + 지역 좌표 편향·주소 우선
 * - 지역 없으면 원문·보강 검색 + 광역 팬아웃
 */
async function searchDentalKakaoPlaces(query, { limit = 40 } = {}) {
  const q = String(query || "").trim();
  if (!q) return { items: [], authError: false };
  const cap = Math.min(60, Math.max(1, Number(limit) || 40));
  const { region, name } = parseRegionNameQuery(q);
  const nameQ = (name || q).trim();
  if (!nameQ) return { items: [], authError: false };

  const nameQueries = [nameQ];
  if (!/치과|기공/.test(nameQ)) {
    nameQueries.push(`${nameQ} 치과`, `${nameQ} 기공소`);
  }

  let authError = false;
  let needsFanout = false;
  const seen = new Set();
  const items = [];
  const pushAll = (res) => {
    if (res.authError) authError = true;
    if (res.truncated) needsFanout = true;
    for (const it of res.items || []) {
      const key = dentalPlaceDedupeKey(it);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(it);
    }
  };

  if (region) {
    // 1) 카카오맵 웹 검색(Local REST 누락 POI 보완) + 2) Local 키워드 + 3) 지역 좌표 반경
    const combinedQueries = [q, `${region} ${nameQ}`];
    if (!/치과|기공/.test(nameQ)) {
      combinedQueries.push(
        `${region} ${nameQ} 치과`,
        `${region} ${nameQ} 기공소`,
        `${q} 치과`,
      );
    }
    const uniqueCombined = [...new Set(combinedQueries.filter(Boolean))];
    const geo = await geocodeRegionHint(region);
    const biased =
      geo && Number.isFinite(geo.lng) && Number.isFinite(geo.lat)
        ? { x: geo.lng, y: geo.lat, radius: 40000, sort: "distance" }
        : null;

    const parallel = await Promise.all([
      ...uniqueCombined.map((qq) => kakaoMapWebKeywordSearch(qq, { limit: 15 })),
      ...uniqueCombined.map((qq) =>
        kakaoKeywordSearch(qq, { limit: Math.min(45, cap), maxPages: 2 }),
      ),
      ...nameQueries.map((qq) =>
        kakaoKeywordSearch(qq, { limit: Math.min(45, cap), maxPages: 3 }),
      ),
      ...(biased
        ? nameQueries.map((qq) =>
            kakaoKeywordSearch(qq, {
              limit: 15,
              maxPages: 1,
              ...biased,
            }),
          )
        : []),
    ]);
    for (const res of parallel) pushAll(res);

    // 지역 지정 시 해당 지역 주소만(전국 동명 오탐 방지). 없으면 빈 목록.
    const regional = items.filter((it) => placeMatchesRegion(it, region));
    return {
      items: rankDentalKakaoItems(regional, nameQ, region).slice(0, cap),
      authError,
    };
  }

  const primary = await Promise.all([
    ...nameQueries.map((qq) =>
      kakaoKeywordSearch(qq, { limit: Math.min(45, cap), maxPages: 3 }),
    ),
    // Local에 없는 상호 보완(전국 쿼리도 맵 웹 1회)
    kakaoMapWebKeywordSearch(nameQ, { limit: 15 }),
    ...(!/치과|기공/.test(nameQ)
      ? [kakaoMapWebKeywordSearch(`${nameQ} 치과`, { limit: 15 })]
      : []),
  ]);
  for (const res of primary) pushAll(res);

  if (needsFanout || items.length >= 12) {
    const base = /치과|기공/.test(nameQ) ? nameQ : `${nameQ} 치과`;
    const fanout = await Promise.all(
      KAKAO_DENTAL_REGION_PREFIXES.map((r) =>
        kakaoKeywordSearch(`${r} ${base}`, { limit: 15, maxPages: 1 }),
      ),
    );
    for (const res of fanout) pushAll(res);
  }

  return {
    items: rankDentalKakaoItems(items, nameQ).slice(0, cap),
    authError,
  };
}

/** Meta for FE: address geocode has Nominatim fallback; keyword needs Kakao Local. */
function placeGeoMeta({ kakaoAuthError = false } = {}) {
  return {
    geocodeConfigured: true,
    kakaoLocalConfigured: hasKakaoRestKeyConfigured(),
    kakaoLocalAuthError: Boolean(kakaoAuthError),
  };
}

/**
 * Try name-only first (Kakao often fails on "상호 + 전체주소"), then combined.
 */
async function searchKakaoPlaceCandidates(name, address, { limit = 10 } = {}) {
  const nameQ = String(name || "").trim();
  const addrQ = String(address || "").trim();
  const combined = [nameQ, addrQ].filter(Boolean).join(" ");
  const queries = [];
  if (nameQ) queries.push(nameQ);
  if (combined && combined !== nameQ) queries.push(combined);
  if (addrQ && addrQ !== nameQ && addrQ !== combined) queries.push(addrQ);

  let authError = false;
  const seen = new Set();
  const items = [];
  for (const q of queries) {
    const res = await kakaoKeywordSearch(q, { limit });
    if (res.authError) authError = true;
    for (const it of res.items) {
      const key = `${it.name}|${it.address}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(it);
      if (items.length >= limit) break;
    }
    if (items.length >= limit || authError) break;
  }
  return { items: items.slice(0, limit), authError };
}

function parseCoord(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function hasValidCoords(lat, lng) {
  return (
    lat != null &&
    lng != null &&
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng))
  );
}

function placeKindFromBa(ba) {
  return ba?.requestorKind === "lab" ? "lab" : "practice";
}

function baAddressLine(ba) {
  const meta = ba?.metadata || {};
  return [meta.address, meta.addressDetail].filter(Boolean).join(" ").trim();
}

/**
 * Mirror SalesAccount coords (+ empty BA address) onto linked BusinessAnchor.
 * Does not overwrite an existing BA address text.
 */
async function mirrorCoordsToBusinessAnchor(account) {
  const baId = oid(account?.businessAnchorId);
  if (!baId) return;
  const lat = parseCoord(account.lat);
  const lng = parseCoord(account.lng);
  if (!hasValidCoords(lat, lng)) return;
  const ba = await BusinessAnchor.findById(baId);
  if (!ba) return;
  if (!ba.metadata) ba.metadata = {};
  ba.metadata.lat = lat;
  ba.metadata.lng = lng;
  const existingAddr = String(ba.metadata.address || "").trim();
  const accountAddr = String(account.address || "").trim();
  if (!existingAddr && accountAddr) {
    ba.metadata.address = accountAddr;
  }
  ba.markModified("metadata");
  await ba.save();
}

/** Fill lat/lng from address when missing. Prefer explicit coords from place picker. */
async function applyGeocodeToAccountFields(fields, { addressChanged = false } = {}) {
  const address = String(fields.address || "").trim();
  if (!address) {
    if (addressChanged && !hasValidCoords(fields.lat, fields.lng)) {
      fields.lat = null;
      fields.lng = null;
    }
    return fields;
  }
  if (hasValidCoords(fields.lat, fields.lng)) return fields;
  const geo = await geocodeAddress(address);
  if (geo) {
    fields.lat = geo.lat;
    fields.lng = geo.lng;
  }
  return fields;
}

function accountVisibilityFilter(userId, role) {
  if (String(role || "") === "admin") return {};
  const uid = oid(userId);
  return {
    $or: [{ ownerUserId: uid }, { teamVisible: true }],
  };
}

function buildAccountListFilter(userId, role, { q, kind, join } = {}) {
  const parts = [accountVisibilityFilter(userId, role)];
  if (ACCOUNT_KINDS.has(kind)) parts.push({ kind });
  if (join === "joined") {
    parts.push({ businessAnchorId: { $ne: null } });
  } else if (join === "unjoined") {
    parts.push({
      $or: [{ businessAnchorId: null }, { businessAnchorId: { $exists: false } }],
    });
  }
  if (q) {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, "i");
    parts.push({
      $or: [{ name: re }, { representativeName: re }, { phone: re }],
    });
  }
  const nonempty = parts.filter((p) => Object.keys(p).length > 0);
  if (nonempty.length === 0) return {};
  return nonempty.length === 1 ? nonempty[0] : { $and: nonempty };
}

export async function getSalesHome(req, res) {
  try {
    const userId = req.user._id;
    const todayYmd = toKstYmd(new Date());
    const range = kstYmdToUtcRange(todayYmd);
    const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [todayVisits, report, me, weekSignups] = await Promise.all([
      range
        ? SalesVisit.find({
            assigneeUserId: userId,
            plannedAt: { $gte: range.start, $lt: range.end },
            status: { $ne: "canceled" },
          })
            .populate("accountId", "name kind address phone")
            .sort({ plannedAt: 1 })
            .lean()
        : [],
      SalesDailyReport.findOne({
        authorUserId: userId,
        reportYmd: todayYmd,
      }).lean(),
      User.findById(userId)
        .select({ referralCode: 1, businessAnchorId: 1 })
        .lean(),
      (async () => {
        const me = await User.findById(userId)
          .select({ businessAnchorId: 1, role: 1 })
          .lean();
        const anchorId = await resolveSalesTeamReferralAnchorId(me);
        if (!anchorId) return 0;
        return BusinessAnchor.countDocuments({
          referredByAnchorId: anchorId,
          businessType: "requestor",
          createdAt: { $gte: weekStart },
        });
      })(),
    ]);

    return res.json({
      success: true,
      data: {
        todayYmd,
        todayVisits,
        dailyReportSubmitted: Boolean(report),
        dailyReport: report || null,
        weekReferralSignups: weekSignups,
        referralCode: me?.referralCode || null,
      },
    });
  } catch (error) {
    console.error("[salesTeam.getSalesHome]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "홈 조회에 실패했습니다.",
    });
  }
}

/** CRM 가입 거래처(BA 연결) 중 3·6개월 무주문 알람 */
export async function getSalesTeamNoOrderAlerts(req, res) {
  try {
    const filter = {
      ...accountVisibilityFilter(req.user._id, req.user.role),
      businessAnchorId: { $ne: null },
    };
    const accounts = await SalesAccount.find(filter)
      .select({ businessAnchorId: 1 })
      .lean();

    const data = await listNoOrderAlerts({
      anchorIds: (accounts || []).map((a) => a?.businessAnchorId),
    });

    return res.json({ success: true, data });
  } catch (error) {
    console.error("[salesTeam.getSalesTeamNoOrderAlerts]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "무주문 의뢰자 알람 조회에 실패했습니다.",
    });
  }
}

export async function listAccounts(req, res) {
  try {
    const q = String(req.query.q || "").trim();
    const kind = String(req.query.kind || "").trim();
    const join = String(req.query.join || "").trim();
    const filter = buildAccountListFilter(req.user._id, req.user.role, {
      q,
      kind,
      join,
    });

    const items = await SalesAccount.find(filter)
      .sort({ updatedAt: -1 })
      .limit(200)
      .lean();

    return res.json({ success: true, data: { items } });
  } catch (error) {
    console.error("[salesTeam.listAccounts]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "거래처 목록 조회에 실패했습니다.",
    });
  }
}

export async function getAccount(req, res) {
  try {
    const id = oid(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: "잘못된 ID입니다." });
    }
    const item = await SalesAccount.findOne({
      _id: id,
      ...accountVisibilityFilter(req.user._id, req.user.role),
    }).lean();
    if (!item) {
      return res.status(404).json({ success: false, message: "거래처를 찾을 수 없습니다." });
    }
    return res.json({ success: true, data: item });
  } catch (error) {
    console.error("[salesTeam.getAccount]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "거래처 조회에 실패했습니다.",
    });
  }
}

export async function createAccount(req, res) {
  try {
    const body = req.body || {};
    const kind = String(body.kind || "").trim();
    const name = String(body.name || "").trim();
    if (!ACCOUNT_KINDS.has(kind) || !name) {
      return res.status(400).json({
        success: false,
        message: "유형(치과/기공소)과 이름은 필수입니다.",
      });
    }
    const baId = oid(body.businessAnchorId);
    const fields = {
      kind,
      name,
      representativeName: String(body.representativeName || "").trim(),
      phone: String(body.phone || "").trim(),
      address: String(body.address || "").trim(),
      lat: parseCoord(body.lat),
      lng: parseCoord(body.lng),
      memo: String(body.memo || "").trim(),
      businessAnchorId: baId,
      ownerUserId: oid(body.ownerUserId) || req.user._id,
      teamVisible: body.teamVisible !== false,
      createdByUserId: req.user._id,
    };
    await applyGeocodeToAccountFields(fields, { addressChanged: true });
    const doc = await SalesAccount.create(fields);
    void mirrorCoordsToBusinessAnchor(doc).catch((err) =>
      console.error("[salesTeam.createAccount] BA mirror", err),
    );
    return res.status(201).json({ success: true, data: doc.toObject() });
  } catch (error) {
    console.error("[salesTeam.createAccount]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "거래처 생성에 실패했습니다.",
    });
  }
}

export async function updateAccount(req, res) {
  try {
    const id = oid(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: "잘못된 ID입니다." });
    }
    const existing = await SalesAccount.findOne({
      _id: id,
      ...accountVisibilityFilter(req.user._id, req.user.role),
    });
    if (!existing) {
      return res.status(404).json({ success: false, message: "거래처를 찾을 수 없습니다." });
    }
    const body = req.body || {};
    if (body.kind != null) {
      const kind = String(body.kind).trim();
      if (!ACCOUNT_KINDS.has(kind)) {
        return res.status(400).json({ success: false, message: "유형이 올바르지 않습니다." });
      }
      existing.kind = kind;
    }
    if (body.name != null) {
      const name = String(body.name).trim();
      if (!name) {
        return res.status(400).json({ success: false, message: "이름은 필수입니다." });
      }
      existing.name = name;
    }
    if (body.representativeName != null)
      existing.representativeName = String(body.representativeName).trim();
    if (body.phone != null) existing.phone = String(body.phone).trim();
    let addressChanged = false;
    if (body.address != null) {
      const nextAddress = String(body.address).trim();
      addressChanged = nextAddress !== String(existing.address || "").trim();
      existing.address = nextAddress;
    }
    if (body.memo != null) existing.memo = String(body.memo).trim();
    if (body.teamVisible != null) existing.teamVisible = Boolean(body.teamVisible);
    if (body.lat !== undefined) {
      existing.lat = parseCoord(body.lat);
    }
    if (body.lng !== undefined) {
      existing.lng = parseCoord(body.lng);
    }
    if (body.businessAnchorId !== undefined) {
      existing.businessAnchorId = oid(body.businessAnchorId);
    }
    if (body.ownerUserId != null) {
      const owner = oid(body.ownerUserId);
      if (owner) existing.ownerUserId = owner;
    }
    const geoFields = {
      address: existing.address,
      lat: existing.lat,
      lng: existing.lng,
    };
    await applyGeocodeToAccountFields(geoFields, { addressChanged });
    existing.lat = geoFields.lat;
    existing.lng = geoFields.lng;
    await existing.save();
    void mirrorCoordsToBusinessAnchor(existing).catch((err) =>
      console.error("[salesTeam.updateAccount] BA mirror", err),
    );
    return res.json({ success: true, data: existing.toObject() });
  } catch (error) {
    console.error("[salesTeam.updateAccount]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "거래처 수정에 실패했습니다.",
    });
  }
}

export async function deleteAccount(req, res) {
  try {
    const id = oid(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: "잘못된 ID입니다." });
    }
    const existing = await SalesAccount.findOne({
      _id: id,
      ownerUserId: req.user._id,
    });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "본인 담당 거래처만 삭제할 수 있습니다.",
      });
    }
    await SalesVisit.deleteMany({ accountId: id });
    await existing.deleteOne();
    return res.json({ success: true });
  } catch (error) {
    console.error("[salesTeam.deleteAccount]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "거래처 삭제에 실패했습니다.",
    });
  }
}

export async function listVisits(req, res) {
  try {
    const fromYmd = parseYmd(req.query.fromYmd);
    const toYmd = parseYmd(req.query.toYmd);
    const filter = { assigneeUserId: req.user._id };
    if (fromYmd && toYmd) {
      const fromR = kstYmdToUtcRange(fromYmd);
      const toR = kstYmdToUtcRange(toYmd);
      if (fromR && toR) {
        filter.plannedAt = { $gte: fromR.start, $lt: toR.end };
      }
    } else if (fromYmd) {
      const fromR = kstYmdToUtcRange(fromYmd);
      if (fromR) filter.plannedAt = { $gte: fromR.start };
    }
    const status = String(req.query.status || "").trim();
    if (VISIT_STATUSES.has(status)) filter.status = status;

    const items = await SalesVisit.find(filter)
      .populate("accountId", "name kind address phone lat lng businessAnchorId")
      .sort({ plannedAt: 1 })
      .limit(500)
      .lean();

    return res.json({ success: true, data: { items } });
  } catch (error) {
    console.error("[salesTeam.listVisits]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "일정 조회에 실패했습니다.",
    });
  }
}

/**
 * 당일 기예약 동선에 맞춰 목표 좌표의 방문 시각(HH:mm)을 계산.
 * 좌표 없거나 기예약 없으면 preferredHm / 10:00.
 */
async function resolveRouteAwareVisitHm({
  assigneeUserId,
  visitYmd,
  targetLat,
  targetLng,
  targetAddress = "",
  preferredHm,
  includeAround = true,
  excludeVisitId = null,
}) {
  const fallback = clampBusinessHm(preferredHm || "10:00");
  if (
    targetLat == null ||
    targetLng == null ||
    !Number.isFinite(targetLat) ||
    !Number.isFinite(targetLng)
  ) {
    return fallback;
  }
  const range = kstYmdToUtcRange(visitYmd);
  if (!range) return fallback;

  const commitments = includeAround
    ? ["confirmed", "around"]
    : ["confirmed"];
  const filter = {
    assigneeUserId,
    plannedAt: { $gte: range.start, $lt: range.end },
    status: "planned",
    commitment: { $in: commitments },
  };
  if (excludeVisitId) filter._id = { $ne: excludeVisitId };

  const visits = await SalesVisit.find(filter)
    .populate("accountId", "name address lat lng")
    .lean();

  const stops = [];
  for (const v of visits) {
    const acc = v.accountId;
    if (!acc) continue;
    let lat = acc.lat != null ? Number(acc.lat) : null;
    let lng = acc.lng != null ? Number(acc.lng) : null;
    if (
      (lat == null ||
        lng == null ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng)) &&
      String(acc.address || "").trim()
    ) {
      const geo = await geocodeAddress(acc.address);
      if (geo) {
        lat = geo.lat;
        lng = geo.lng;
      }
    }
    if (
      lat == null ||
      lng == null ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      continue;
    }
    stops.push({
      visitId: String(v._id),
      name: acc.name || "",
      address: acc.address || "",
      lat,
      lng,
      plannedAt: v.plannedAt,
      isExtra: false,
    });
  }

  if (!stops.length) return fallback;

  const targetPoint = {
    lat: targetLat,
    lng: targetLng,
    address: targetAddress || "",
  };
  // 100km 밖만 있으면 기본 시각 유지(뭉칠 대상 없음)
  const nearestKm = Math.min(
    ...stops.map((s) => haversineKm(targetPoint, s)),
  );
  if (!Number.isFinite(nearestKm) || nearestKm > ROUTE_NEARBY_SECONDARY_KM) {
    return fallback;
  }

  const points = stops.map((s) => ({ lat: s.lat, lng: s.lng }));
  const withTarget = optimizePointsOrder([...points, targetPoint]);
  const extraStop = {
    visitId: null,
    name: "",
    address: targetAddress || "",
    lat: targetLat,
    lng: targetLng,
    plannedAt: null,
    isExtra: true,
  };
  const ordered = withTarget.order.map((i) =>
    i < stops.length ? stops[i] : extraStop,
  );
  const hint = suggestTimeForTarget(stops, targetPoint, ordered);
  return hint.suggestedTime || fallback;
}

export async function createVisit(req, res) {
  try {
    const body = req.body || {};
    const accountId = oid(body.accountId);
    let plannedAt = body.plannedAt ? new Date(body.plannedAt) : null;
    const commitment = String(body.commitment || "confirmed").trim();
    if (!accountId || !plannedAt || Number.isNaN(plannedAt.getTime())) {
      return res.status(400).json({
        success: false,
        message: "거래처와 방문 일시는 필수입니다.",
      });
    }
    if (!COMMITMENTS.has(commitment)) {
      return res.status(400).json({ success: false, message: "확정 상태가 올바르지 않습니다." });
    }
    const account = await SalesAccount.findOne({
      _id: accountId,
      ...accountVisibilityFilter(req.user._id, req.user.role),
    }).lean();
    if (!account) {
      return res.status(404).json({ success: false, message: "거래처를 찾을 수 없습니다." });
    }

    const assigneeUserId = oid(body.assigneeUserId) || req.user._id;
    const visitYmd = toKstYmd(plannedAt);
    const preferredHm = formatKstHm(plannedAt) || "10:00";
    // 그쯤(around): 동선·이동거리 기준으로 시각 재배치. 확정은 요청 시각 유지.
    const autoSchedule =
      body.autoScheduleTime === true ||
      (body.autoScheduleTime !== false && commitment === "around");
    if (autoSchedule && visitYmd) {
      let lat = account.lat != null ? Number(account.lat) : null;
      let lng = account.lng != null ? Number(account.lng) : null;
      if (
        (lat == null ||
          lng == null ||
          !Number.isFinite(lat) ||
          !Number.isFinite(lng)) &&
        String(account.address || "").trim()
      ) {
        const geo = await geocodeAddress(account.address);
        if (geo) {
          lat = geo.lat;
          lng = geo.lng;
        }
      }
      const hm = await resolveRouteAwareVisitHm({
        assigneeUserId,
        visitYmd,
        targetLat: lat,
        targetLng: lng,
        targetAddress: account.address || "",
        preferredHm,
        includeAround: true,
      });
      plannedAt = new Date(`${visitYmd}T${hm}:00+09:00`);
    }

    const doc = await SalesVisit.create({
      accountId,
      assigneeUserId,
      plannedAt,
      windowStartAt: body.windowStartAt ? new Date(body.windowStartAt) : null,
      windowEndAt: body.windowEndAt ? new Date(body.windowEndAt) : null,
      commitment,
      status: "planned",
      memo: String(body.memo || "").trim(),
      createdByUserId: req.user._id,
    });
    const populated = await SalesVisit.findById(doc._id)
      .populate("accountId", "name kind address phone lat lng businessAnchorId")
      .lean();
    return res.status(201).json({ success: true, data: populated });
  } catch (error) {
    console.error("[salesTeam.createVisit]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "일정 생성에 실패했습니다.",
    });
  }
}

export async function updateVisit(req, res) {
  try {
    const id = oid(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: "잘못된 ID입니다." });
    }
    const existing = await SalesVisit.findOne({
      _id: id,
      assigneeUserId: req.user._id,
    });
    if (!existing) {
      return res.status(404).json({ success: false, message: "일정을 찾을 수 없습니다." });
    }
    const body = req.body || {};
    if (body.plannedAt != null) {
      const plannedAt = new Date(body.plannedAt);
      if (Number.isNaN(plannedAt.getTime())) {
        return res.status(400).json({ success: false, message: "일시가 올바르지 않습니다." });
      }
      existing.plannedAt = plannedAt;
    }
    if (body.commitment != null) {
      const commitment = String(body.commitment).trim();
      if (!COMMITMENTS.has(commitment)) {
        return res.status(400).json({ success: false, message: "확정 상태가 올바르지 않습니다." });
      }
      existing.commitment = commitment;
    }

    const nextCommitment = existing.commitment;
    const autoSchedule =
      body.autoScheduleTime === true ||
      (body.autoScheduleTime !== false &&
        nextCommitment === "around" &&
        body.plannedAt != null);
    if (autoSchedule) {
      const visitYmd = toKstYmd(existing.plannedAt);
      const preferredHm = formatKstHm(existing.plannedAt) || "10:00";
      const acc = await SalesAccount.findById(existing.accountId)
        .select({ lat: 1, lng: 1, address: 1 })
        .lean();
      let lat = acc?.lat != null ? Number(acc.lat) : null;
      let lng = acc?.lng != null ? Number(acc.lng) : null;
      if (
        (lat == null ||
          lng == null ||
          !Number.isFinite(lat) ||
          !Number.isFinite(lng)) &&
        String(acc?.address || "").trim()
      ) {
        const geo = await geocodeAddress(acc.address);
        if (geo) {
          lat = geo.lat;
          lng = geo.lng;
        }
      }
      if (visitYmd) {
        const hm = await resolveRouteAwareVisitHm({
          assigneeUserId: existing.assigneeUserId,
          visitYmd,
          targetLat: lat,
          targetLng: lng,
          targetAddress: acc?.address || "",
          preferredHm,
          includeAround: true,
          excludeVisitId: existing._id,
        });
        existing.plannedAt = new Date(`${visitYmd}T${hm}:00+09:00`);
      }
    }

    if (body.status != null) {
      const status = String(body.status).trim();
      if (!VISIT_STATUSES.has(status)) {
        return res.status(400).json({ success: false, message: "상태가 올바르지 않습니다." });
      }
      if (status === "done") {
        const visitYmd = toKstYmd(existing.plannedAt);
        const todayYmd = toKstYmd(new Date());
        if (visitYmd && todayYmd && visitYmd > todayYmd) {
          return res.status(400).json({
            success: false,
            message: "미래 일정은 완료할 수 없습니다. 방문 당일 또는 지난 날만 가능합니다.",
          });
        }
      }
      existing.status = status;
      if (status === "done" && !existing.completedAt) {
        existing.completedAt = new Date();
      }
      if (status !== "done") existing.completedAt = null;
    }
    if (body.memo != null) existing.memo = String(body.memo).trim();
    if (body.windowStartAt !== undefined) {
      existing.windowStartAt = body.windowStartAt
        ? new Date(body.windowStartAt)
        : null;
    }
    if (body.windowEndAt !== undefined) {
      existing.windowEndAt = body.windowEndAt ? new Date(body.windowEndAt) : null;
    }
    if (body.accountId != null) {
      const accountId = oid(body.accountId);
      if (accountId) existing.accountId = accountId;
    }
    await existing.save();
    const populated = await SalesVisit.findById(existing._id)
      .populate("accountId", "name kind address phone lat lng businessAnchorId")
      .lean();
    return res.json({ success: true, data: populated });
  } catch (error) {
    console.error("[salesTeam.updateVisit]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "일정 수정에 실패했습니다.",
    });
  }
}

export async function deleteVisit(req, res) {
  try {
    const id = oid(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: "잘못된 ID입니다." });
    }
    const result = await SalesVisit.deleteOne({
      _id: id,
      assigneeUserId: req.user._id,
    });
    if (!result.deletedCount) {
      return res.status(404).json({ success: false, message: "일정을 찾을 수 없습니다." });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error("[salesTeam.deleteVisit]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "일정 삭제에 실패했습니다.",
    });
  }
}

export async function listDailyReports(req, res) {
  try {
    const limit = Math.min(90, Math.max(1, Number(req.query.limit) || 30));
    const items = await SalesDailyReport.find({ authorUserId: req.user._id })
      .sort({ reportYmd: -1 })
      .limit(limit)
      .lean();
    return res.json({ success: true, data: { items } });
  } catch (error) {
    console.error("[salesTeam.listDailyReports]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "일일보고 목록 조회에 실패했습니다.",
    });
  }
}

export async function getDailyReport(req, res) {
  try {
    const ymd = parseYmd(req.params.ymd) || toKstYmd(new Date());
    const [report, range] = await Promise.all([
      SalesDailyReport.findOne({
        authorUserId: req.user._id,
        reportYmd: ymd,
      }).lean(),
      Promise.resolve(kstYmdToUtcRange(ymd)),
    ]);
    let visits = [];
    if (range) {
      visits = await SalesVisit.find({
        assigneeUserId: req.user._id,
        plannedAt: { $gte: range.start, $lt: range.end },
        status: { $ne: "canceled" },
      })
        .populate("accountId", "name kind")
        .sort({ plannedAt: 1 })
        .lean();
    }
    return res.json({
      success: true,
      data: { report: report || null, visits, reportYmd: ymd },
    });
  } catch (error) {
    console.error("[salesTeam.getDailyReport]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "일일보고 조회에 실패했습니다.",
    });
  }
}

export async function upsertDailyReport(req, res) {
  try {
    const body = req.body || {};
    const ymd = parseYmd(body.reportYmd) || toKstYmd(new Date());
    if (!ymd) {
      return res.status(400).json({ success: false, message: "날짜가 올바르지 않습니다." });
    }
    const payload = {
      visitSummary: String(body.visitSummary || "").trim(),
      issues: String(body.issues || "").trim(),
      tomorrowPlan: String(body.tomorrowPlan || "").trim(),
      submittedAt: new Date(),
    };
    const doc = await SalesDailyReport.findOneAndUpdate(
      { authorUserId: req.user._id, reportYmd: ymd },
      { $set: payload, $setOnInsert: { authorUserId: req.user._id, reportYmd: ymd } },
      { upsert: true, new: true },
    ).lean();
    return res.json({ success: true, data: doc });
  } catch (error) {
    console.error("[salesTeam.upsertDailyReport]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "일일보고 저장에 실패했습니다.",
    });
  }
}

export async function getSalesStats(req, res) {
  try {
    const { start, end } = periodToRange(
      req.query.period,
      req.query.fromYmd,
      req.query.toYmd,
    );
    const userId = req.user._id;
    const meLean = await User.findById(userId)
      .select({ businessAnchorId: 1, role: 1 })
      .lean();
    const anchorId = await resolveSalesTeamReferralAnchorId(meLean);

    const [doneVisits, plannedDays, submittedReports, referralOrgs] =
      await Promise.all([
        SalesVisit.find({
          assigneeUserId: userId,
          status: "done",
          completedAt: { $gte: start, $lte: end },
        })
          .populate("accountId", "name kind")
          .sort({ completedAt: -1 })
          .lean(),
        (async () => {
          const visits = await SalesVisit.find({
            assigneeUserId: userId,
            plannedAt: { $gte: start, $lte: end },
            status: { $ne: "canceled" },
          })
            .select({ plannedAt: 1 })
            .lean();
          const days = new Set();
          for (const v of visits) {
            const ymd = toKstYmd(v.plannedAt);
            if (ymd) days.add(ymd);
          }
          return days;
        })(),
        SalesDailyReport.find({
          authorUserId: userId,
          reportYmd: {
            $gte: toKstYmd(start) || "1970-01-01",
            $lte: toKstYmd(end) || "9999-12-31",
          },
        })
          .select({ reportYmd: 1, submittedAt: 1 })
          .lean(),
        anchorId
          ? BusinessAnchor.find({
              referredByAnchorId: anchorId,
              businessType: "requestor",
              createdAt: { $gte: start, $lte: end },
            })
              .select({
                name: 1,
                requestorKind: 1,
                createdAt: 1,
              })
              .sort({ createdAt: -1 })
              .lean()
          : [],
      ]);

    const workDayCount = plannedDays.size || 0;
    const submittedCount = submittedReports.length;
    const submitRate =
      workDayCount > 0
        ? Math.round((submittedCount / workDayCount) * 1000) / 10
        : submittedCount > 0
          ? 100
          : 0;

    const practiceSignups = referralOrgs.filter(
      (o) => String(o.requestorKind || "") === "practice",
    ).length;
    const labSignups = referralOrgs.filter(
      (o) => String(o.requestorKind || "") === "lab",
    ).length;

    return res.json({
      success: true,
      data: {
        visitDoneCount: doneVisits.length,
        visits: doneVisits,
        workDayCount,
        reportSubmittedCount: submittedCount,
        reportSubmitRate: submitRate,
        referralSignupCount: referralOrgs.length,
        practiceSignupCount: practiceSignups,
        labSignupCount: labSignups,
        referralOrgs,
      },
    });
  } catch (error) {
    console.error("[salesTeam.getSalesStats]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "실적 조회에 실패했습니다.",
    });
  }
}

export async function getReferralInfo(req, res) {
  try {
    const me = await User.findById(req.user._id);
    if (!me) {
      return res.status(404).json({ success: false, message: "사용자를 찾을 수 없습니다." });
    }
    const referralCode = await ensureSalesTeamReferralCode(me);
    const anchorId = await resolveSalesTeamReferralAnchorId(me);
    const orgs = anchorId
      ? await BusinessAnchor.find({
          referredByAnchorId: anchorId,
          businessType: "requestor",
        })
          .select({ name: 1, requestorKind: 1, createdAt: 1 })
          .sort({ createdAt: -1 })
          .limit(100)
          .lean()
      : [];

    return res.json({
      success: true,
      data: {
        referralCode,
        policyNote:
          "판매·세금계산서는 플랫폼 가입 사업자만 가능합니다. 소개코드로 가입한 거래처가 담당 실적으로 집계됩니다.",
        organizations: orgs,
      },
    });
  } catch (error) {
    console.error("[salesTeam.getReferralInfo]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "소개 정보 조회에 실패했습니다.",
    });
  }
}

/** 고객 대면용 소셜 프루프 (매출 제외) */
export async function getPlatformPitch(req, res) {
  try {
    const data = await getPlatformSocialProof();
    return res.json({ success: true, data });
  } catch (error) {
    console.error("[salesTeam.getPlatformPitch]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "플랫폼 소개 통계 조회에 실패했습니다.",
    });
  }
}

export async function optimizeRoute(req, res) {
  try {
    const body = req.body || {};
    const ymd = parseYmd(body.ymd) || toKstYmd(new Date());
    const includeAround = body.includeAround !== false;
    const extraName = String(body.extraName || "").trim();
    const extraAddress = String(body.extraAddress || "").trim();
    const startAddress = String(body.startAddress || "").trim();
    const startLatIn = parseCoord(body.startLat);
    const startLngIn = parseCoord(body.startLng);
    const range = kstYmdToUtcRange(ymd);
    if (!range) {
      return res.status(400).json({ success: false, message: "날짜가 올바르지 않습니다." });
    }

    const commitments = includeAround
      ? ["confirmed", "around"]
      : ["confirmed"];

    const visits = await SalesVisit.find({
      assigneeUserId: req.user._id,
      plannedAt: { $gte: range.start, $lt: range.end },
      status: "planned",
      commitment: { $in: commitments },
    })
      .populate(
        "accountId",
        "name kind address lat lng phone businessAnchorId",
      )
      .lean();

    const visitCandidates = visits.filter((v) => v.accountId);

    const [visitResolved, extraGeo, startGeo] = await Promise.all([
      Promise.all(
        visitCandidates.map(async (v) => {
          const acc = v.accountId;
          let lat = acc.lat != null ? Number(acc.lat) : null;
          let lng = acc.lng != null ? Number(acc.lng) : null;
          if (
            (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) &&
            String(acc.address || "").trim()
          ) {
            const geo = await geocodeAddress(acc.address);
            if (geo) {
              lat = geo.lat;
              lng = geo.lng;
              void SalesAccount.updateOne(
                { _id: acc._id },
                { $set: { lat, lng } },
              ).catch(() => {});
            }
          }
          return {
            visitId: String(v._id),
            accountId: String(acc._id),
            businessAnchorId: acc.businessAnchorId
              ? String(acc.businessAnchorId)
              : null,
            name: acc.name,
            address: acc.address || "",
            lat: Number.isFinite(lat) ? lat : null,
            lng: Number.isFinite(lng) ? lng : null,
            commitment: v.commitment,
            plannedAt: v.plannedAt,
          };
        }),
      ),
      (async () => {
        if (!extraName) return null;
        if (extraAddress) {
          const geo = await geocodeAddress(extraAddress);
          if (geo) {
            return {
              lat: geo.lat,
              lng: geo.lng,
              address: geo.address || extraAddress,
            };
          }
        }
        if (!extraAddress) {
          const geo = await geocodeAddress(extraName);
          if (geo) {
            return {
              lat: geo.lat,
              lng: geo.lng,
              address: geo.address || extraName,
            };
          }
        }
        return { lat: null, lng: null, address: extraAddress };
      })(),
      (async () => {
        if (startLatIn != null && startLngIn != null) {
          return {
            lat: startLatIn,
            lng: startLngIn,
            address: startAddress,
          };
        }
        if (startAddress) {
          const geo = await geocodeAddress(startAddress);
          if (geo) {
            return {
              lat: geo.lat,
              lng: geo.lng,
              address: geo.address || startAddress,
            };
          }
        }
        return null;
      })(),
    ]);

    const stops = [...visitResolved];
    if (extraName) {
      stops.push({
        visitId: null,
        accountId: null,
        name: extraName,
        address: extraGeo?.address || extraAddress,
        lat: extraGeo?.lat ?? null,
        lng: extraGeo?.lng ?? null,
        commitment: "confirmed",
        plannedAt: null,
        isExtra: true,
      });
    }

    const withCoords = stops.filter(
      (s) =>
        s.lat != null &&
        s.lng != null &&
        Number.isFinite(s.lat) &&
        Number.isFinite(s.lng),
    );
    const withoutCoords = stops.filter(
      (s) =>
        s.lat == null ||
        s.lng == null ||
        !Number.isFinite(s.lat) ||
        !Number.isFinite(s.lng),
    );

    const points = withCoords.map((s) => ({ lat: s.lat, lng: s.lng }));
    const startPoint =
      startGeo &&
      startGeo.lat != null &&
      startGeo.lng != null &&
      Number.isFinite(startGeo.lat) &&
      Number.isFinite(startGeo.lng)
        ? { lat: startGeo.lat, lng: startGeo.lng }
        : null;

    let orderIdx = [];
    if (points.length > 0) {
      const startIndex = startPoint
        ? nearestIndexToPoint(points, startPoint)
        : 0;
      orderIdx = twoOptImprove(
        points,
        nearestNeighborOrder(points, startIndex),
      );
    }

    const orderedVisits = orderIdx.map((i) => withCoords[i]);
    const startStop = startPoint
      ? {
          visitId: null,
          accountId: null,
          name: "출발",
          address: startGeo.address || startAddress || "",
          lat: startPoint.lat,
          lng: startPoint.lng,
          commitment: "confirmed",
          plannedAt: null,
          isStart: true,
        }
      : null;

    const ordered = (startStop ? [startStop] : [])
      .concat(orderedVisits)
      .concat(withoutCoords);

    let totalKm = 0;
    const pathForKm = startStop
      ? [startStop, ...orderedVisits]
      : orderedVisits;
    for (let i = 1; i < pathForKm.length; i += 1) {
      totalKm += haversineKm(pathForKm[i - 1], pathForKm[i]);
    }

    const mapUrl = kakaoMapUrlForStops(ordered);

    return res.json({
      success: true,
      data: {
        ymd,
        ordered,
        totalKm: roundRouteKm(totalKm),
        missingCoordsCount: withoutCoords.length,
        mapUrl,
        ...placeGeoMeta(),
      },
    });
  } catch (error) {
    console.error("[salesTeam.optimizeRoute]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "동선 최적화에 실패했습니다.",
    });
  }
}

/**
 * 치과명(+좌표)을 넣으면 선택일 전주 월~다음주 금(생성일 다음날~) 확정·그쯤
 * 일정을 훑어 가까운 기예약과 뭉치는 날·시각을 추천.
 */
export async function suggestRouteDays(req, res) {
  try {
    const body = req.body || {};
    const name = String(body.name || body.extraName || "").trim();
    if (!name) {
      return res.status(400).json({
        success: false,
        message: "치과·기공소 상호를 입력하세요.",
      });
    }

    const address = String(body.address || body.extraAddress || "").trim();
    const accountId = oid(body.accountId);
    const excludeVisitId = oid(body.excludeVisitId);
    const includeAround = body.includeAround !== false;
    const createYmd = toKstYmd(new Date());
    const anchorYmd =
      parseYmd(body.anchorYmd) ||
      parseYmd(body.fromYmd) ||
      createYmd ||
      null;
    if (!anchorYmd || !createYmd) {
      return res.status(400).json({
        success: false,
        message: "시작 날짜가 올바르지 않습니다.",
      });
    }
    const window = suggestDaysWindow(anchorYmd, createYmd);
    if (!window) {
      return res.status(400).json({
        success: false,
        message: "날짜 범위가 올바르지 않습니다.",
      });
    }
    const { fromYmd, toYmd, windowStart, windowEnd, earliest } = window;
    const horizonDays = Math.max(0, ymdDiffDays(toYmd, fromYmd) + 1);

    if (window.empty) {
      return res.json({
        success: true,
        data: {
          target: {
            name,
            address,
            lat: null,
            lng: null,
          },
          anchorYmd,
          createYmd,
          earliestYmd: earliest,
          windowStart,
          windowEnd,
          fromYmd,
          toYmd,
          horizonDays: 0,
          efficientDetourKm: ROUTE_EFFICIENT_DETOUR_KM,
          efficientNeighborKm: ROUTE_NEARBY_PRIMARY_KM,
          nearbyKm: ROUTE_NEARBY_PRIMARY_KM,
          nearbySecondaryKm: ROUTE_NEARBY_SECONDARY_KM,
          metroKmPerHour: METRO_KM_PER_HOUR,
          provincialKmPerHour: PROVINCIAL_KM_PER_HOUR,
          meetingMin: SUGGEST_MEETING_MIN,
          suggestions: [],
          efficientCount: 0,
          adjacentCount: 0,
          needsManualPick: true,
          scannedDayCount: 0,
          message:
            "제안 가능한 날짜가 없습니다. 위에서 날짜를 직접 선택하세요.",
          ...placeGeoMeta(),
        },
      });
    }

    const fromRange = kstYmdToUtcRange(fromYmd);
    const toRange = kstYmdToUtcRange(toYmd);
    if (!fromRange || !toRange) {
      return res.status(400).json({
        success: false,
        message: "날짜 범위가 올바르지 않습니다.",
      });
    }

    const commitments = includeAround
      ? ["confirmed", "around"]
      : ["confirmed"];

    let targetLat = parseCoord(body.lat ?? body.extraLat);
    let targetLng = parseCoord(body.lng ?? body.extraLng);
    let targetAddress = address;

    if (
      (targetLat == null || targetLng == null) &&
      accountId
    ) {
      const acc = await SalesAccount.findById(accountId)
        .select({ lat: 1, lng: 1, address: 1, name: 1 })
        .lean();
      if (acc) {
        if (acc.lat != null && acc.lng != null) {
          targetLat = Number(acc.lat);
          targetLng = Number(acc.lng);
        }
        if (!targetAddress && acc.address) targetAddress = String(acc.address);
      }
    }

    if (
      (targetLat == null ||
        targetLng == null ||
        !Number.isFinite(targetLat) ||
        !Number.isFinite(targetLng)) &&
      (targetAddress || name)
    ) {
      const geo =
        (targetAddress ? await geocodeAddress(targetAddress) : null) ||
        (await geocodeAddress(name));
      if (geo) {
        targetLat = geo.lat;
        targetLng = geo.lng;
        if (!targetAddress && geo.address) targetAddress = geo.address;
      }
    }

    if (
      targetLat == null ||
      targetLng == null ||
      !Number.isFinite(targetLat) ||
      !Number.isFinite(targetLng)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "위치를 확인할 수 없습니다. 주소를 지정하거나 거래처에 좌표를 저장한 뒤 다시 시도하세요.",
        data: {
          target: { name, address: targetAddress, lat: null, lng: null },
          ...placeGeoMeta(),
        },
      });
    }

    const visitFilter = {
      assigneeUserId: req.user._id,
      plannedAt: { $gte: fromRange.start, $lt: toRange.end },
      status: "planned",
      commitment: { $in: commitments },
    };
    if (excludeVisitId) visitFilter._id = { $ne: excludeVisitId };

    const visits = await SalesVisit.find(visitFilter)
      .populate(
        "accountId",
        "name kind address lat lng phone businessAnchorId",
      )
      .lean();

    const byYmd = new Map();
    await Promise.all(
      visits
        .filter((v) => v.accountId)
        .map(async (v) => {
          const ymd = toKstYmd(v.plannedAt);
          if (!ymd) return;
          const acc = v.accountId;
          let lat = acc.lat != null ? Number(acc.lat) : null;
          let lng = acc.lng != null ? Number(acc.lng) : null;
          if (
            (lat == null ||
              lng == null ||
              !Number.isFinite(lat) ||
              !Number.isFinite(lng)) &&
            String(acc.address || "").trim()
          ) {
            const geo = await geocodeAddress(acc.address);
            if (geo) {
              lat = geo.lat;
              lng = geo.lng;
              void SalesAccount.updateOne(
                { _id: acc._id },
                { $set: { lat, lng } },
              ).catch(() => {});
            }
          }
          if (
            lat == null ||
            lng == null ||
            !Number.isFinite(lat) ||
            !Number.isFinite(lng)
          ) {
            return;
          }
          const stop = {
            visitId: String(v._id),
            accountId: String(acc._id),
            businessAnchorId: acc.businessAnchorId
              ? String(acc.businessAnchorId)
              : null,
            name: acc.name,
            address: acc.address || "",
            lat,
            lng,
            commitment: v.commitment,
            plannedAt: v.plannedAt,
            isExtra: false,
          };
          const list = byYmd.get(ymd) || [];
          list.push(stop);
          byYmd.set(ymd, list);
        }),
    );

    const targetPoint = {
      lat: targetLat,
      lng: targetLng,
      address: targetAddress || "",
    };
    const extraStopBase = {
      visitId: null,
      accountId: accountId ? String(accountId) : null,
      name,
      address: targetAddress || "",
      lat: targetLat,
      lng: targetLng,
      commitment: "confirmed",
      plannedAt: null,
      isExtra: true,
    };

    /** @type {Map<string, object>} ymd → same-day score */
    const dayScores = new Map();
    const nearbyAnchors = []; // { ymd, stop, km, tier }

    for (const [ymd, stops] of byYmd.entries()) {
      const points = stops.map((s) => ({ lat: s.lat, lng: s.lng }));
      const baseline = optimizePointsOrder(points);
      const withTargetPoints = [...points, targetPoint];
      const withTarget = optimizePointsOrder(withTargetPoints);
      const detourKm = roundRouteKm(
        Math.max(0, withTarget.totalKm - baseline.totalKm),
      );

      let nearestKm = Infinity;
      let nearestName = "";
      let nearestStop = null;
      for (const s of stops) {
        const d = haversineKm(targetPoint, s);
        if (d < nearestKm) {
          nearestKm = d;
          nearestName = s.name;
          nearestStop = s;
        }
        if (d <= ROUTE_NEARBY_PRIMARY_KM) {
          nearbyAnchors.push({
            ymd,
            stop: s,
            km: roundRouteKm(d),
            tier: 1,
          });
        } else if (d <= ROUTE_NEARBY_SECONDARY_KM) {
          nearbyAnchors.push({
            ymd,
            stop: s,
            km: roundRouteKm(d),
            tier: 2,
          });
        }
      }
      nearestKm = nearestKm === Infinity ? null : roundRouteKm(nearestKm);

      // 1차 50km 안이면 효율. 2차 100km는 우회가 작을 때만.
      const efficient =
        nearestKm != null &&
        (nearestKm <= ROUTE_NEARBY_PRIMARY_KM ||
          (nearestKm <= ROUTE_NEARBY_SECONDARY_KM &&
            detourKm <= ROUTE_EFFICIENT_DETOUR_KM));

      const ordered = withTarget.order.map((i) =>
        i < stops.length ? stops[i] : { ...extraStopBase },
      );
      const timeHint = suggestTimeForTarget(stops, targetPoint, ordered);

      dayScores.set(ymd, {
        ymd,
        efficient,
        nearTier:
          nearestKm == null
            ? 9
            : nearestKm <= ROUTE_NEARBY_PRIMARY_KM
              ? 1
              : nearestKm <= ROUTE_NEARBY_SECONDARY_KM
                ? 2
                : 9,
        visitCount: stops.length,
        baselineKm: baseline.totalKm,
        totalKm: withTarget.totalKm,
        detourKm,
        nearestKm,
        nearestName,
        ordered,
        mapUrl: kakaoMapUrlForStops(ordered),
        suggestedTime: timeHint.suggestedTime,
        anchorTime: timeHint.anchorTime || null,
        stops,
        nearestStop,
      });
    }

    // 1순위: 같은 날 효율 동선 (50km 우선, 그다음 100km)
    const rank1 = [...dayScores.values()]
      .filter((d) => d.efficient)
      .sort((a, b) => {
        if (a.nearTier !== b.nearTier) return a.nearTier - b.nearTier;
        if (a.detourKm !== b.detourKm) return a.detourKm - b.detourKm;
        const na = a.nearestKm ?? 1e9;
        const nb = b.nearestKm ?? 1e9;
        if (na !== nb) return na - nb;
        return a.ymd.localeCompare(b.ymd);
      })
      .map((d) => {
        const gapMin =
          d.nearestStop != null
            ? travelGapMinutes(d.nearestStop, targetPoint)
            : SUGGEST_MEETING_MIN;
        const regionLabel =
          isCapitalRegion(targetPoint) &&
          d.nearestStop &&
          isCapitalRegion(d.nearestStop)
            ? "수도권"
            : "지방";
        return {
          ymd: d.ymd,
          rank: 1,
          tier: "sameDayEfficient",
          tierLabel:
            d.nearTier === 1 ? "1순위 · 50km" : "1순위 · 100km",
          efficient: true,
          visitCount: d.visitCount,
          baselineKm: d.baselineKm,
          totalKm: d.totalKm,
          detourKm: d.detourKm,
          nearestKm: d.nearestKm,
          nearestName: d.nearestName,
          suggestedTime: d.suggestedTime,
          reason:
            d.nearestKm != null
              ? `${d.nearestName || "기예약"} ${d.nearestKm}km(${regionLabel}) · 이동+미팅 약 ${gapMin}분 · ${d.suggestedTime}`
              : `기존 ${d.visitCount}곳 동선 · ${d.suggestedTime}`,
          ordered: d.ordered,
          mapUrl: d.mapUrl,
          adjacentToYmd: null,
        };
      });

    const rank1Ymds = new Set(rank1.map((s) => s.ymd));

    // 2순위: 근처 기예약과 ±1일 (같은 날 효율이 아닌 날만)
    const adjacentCandidates = new Map(); // ymd → best candidate
    for (const anchor of nearbyAnchors) {
      for (const delta of [-1, 1]) {
        const adjYmd = addDaysYmd(anchor.ymd, delta);
        if (!adjYmd) continue;
        if (ymdDiffDays(adjYmd, fromYmd) < 0) continue;
        if (ymdDiffDays(adjYmd, toYmd) > 0) continue;
        if (rank1Ymds.has(adjYmd)) continue;

        const existing = dayScores.get(adjYmd);
        let detourKm = null;
        let totalKm = null;
        let baselineKm = null;
        let ordered = [{ ...extraStopBase }];
        let visitCount = 0;
        let suggestedTime = formatKstHm(anchor.stop.plannedAt) || "10:00";
        suggestedTime = clampBusinessHm(suggestedTime);

        if (existing) {
          visitCount = existing.visitCount;
          detourKm = existing.detourKm;
          totalKm = existing.totalKm;
          baselineKm = existing.baselineKm;
          ordered = existing.ordered;
          suggestedTime = existing.suggestedTime;
        }

        const score =
          (anchor.tier || 2) * 1000 +
          anchor.km +
          (detourKm != null ? detourKm * 0.3 : 0);
        const prev = adjacentCandidates.get(adjYmd);
        if (prev && prev._score <= score) continue;

        adjacentCandidates.set(adjYmd, {
          ymd: adjYmd,
          rank: 2,
          tier: "adjacentDay",
          tierLabel:
            anchor.tier === 1 ? "2순위 · 50km 인접" : "2순위 · 100km 인접",
          efficient: false,
          visitCount,
          baselineKm,
          totalKm,
          detourKm,
          nearestKm: anchor.km,
          nearestName: anchor.stop.name || "",
          suggestedTime,
          reason: `${formatKstHm(anchor.stop.plannedAt) ? `${anchor.ymd} ${formatKstHm(anchor.stop.plannedAt)}` : anchor.ymd} ${anchor.stop.name || "확정"}과 하루 차이 · 약 ${anchor.km}km`,
          ordered,
          mapUrl: kakaoMapUrlForStops(ordered),
          adjacentToYmd: anchor.ymd,
          _score: score,
        });
      }
    }

    const rank2 = [...adjacentCandidates.values()]
      .sort((a, b) => a._score - b._score || a.ymd.localeCompare(b.ymd))
      .slice(0, 5)
      .map(({ _score, ...rest }) => rest);

    // 1순위가 없을 때만 비효율 same-day를 약하게 참고용으로 넣지 않음 — 3순위는 수동
    const suggestions = [...rank1, ...rank2].slice(0, 8);
    const needsManualPick = rank1.length === 0;

    let message = null;
    if (rank1.length > 0) {
      message =
        rank2.length > 0
          ? `같은 날 효율 동선 ${rank1.length}건 · 인접일 ${rank2.length}건을 제안합니다.`
          : `같은 날 효율 동선 ${rank1.length}건을 제안합니다. 카드를 누르면 날짜·시간이 채워집니다.`;
    } else if (rank2.length > 0) {
      message =
        "같은 날 효율 동선은 없습니다. 근처 기예약과 하루 차이 나는 날을 제안합니다.";
    } else if (byYmd.size === 0) {
      message =
        `${fromYmd}~${toYmd}에 확정·그쯤 일정이 없습니다. 날짜를 직접 선택하세요.`;
    } else {
      message =
        "근처 기예약과 붙일 효율 동선·인접일을 찾지 못했습니다. 날짜를 직접 선택하세요.";
    }

    return res.json({
      success: true,
      data: {
        target: {
          name,
          address: targetAddress || "",
          lat: targetLat,
          lng: targetLng,
        },
        anchorYmd,
        createYmd,
        earliestYmd: earliest,
        windowStart,
        windowEnd,
        fromYmd,
        toYmd,
        horizonDays,
        efficientDetourKm: ROUTE_EFFICIENT_DETOUR_KM,
        efficientNeighborKm: ROUTE_NEARBY_PRIMARY_KM,
        nearbyKm: ROUTE_NEARBY_PRIMARY_KM,
        nearbySecondaryKm: ROUTE_NEARBY_SECONDARY_KM,
        metroKmPerHour: METRO_KM_PER_HOUR,
        provincialKmPerHour: PROVINCIAL_KM_PER_HOUR,
        meetingMin: SUGGEST_MEETING_MIN,
        suggestions,
        efficientCount: rank1.length,
        adjacentCount: rank2.length,
        needsManualPick,
        scannedDayCount: byYmd.size,
        message,
        ...placeGeoMeta(),
      },
    });
  } catch (error) {
    console.error("[salesTeam.suggestRouteDays]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "동선 제안에 실패했습니다.",
    });
  }
}

export async function searchPlatformBusinesses(req, res) {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) {
      return res.json({ success: true, data: { items: [] } });
    }
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const items = await BusinessAnchor.find({
      businessType: "requestor",
      $or: [
        { name: re },
        { "metadata.companyName": re },
        { "metadata.representativeName": re },
      ],
    })
      .select({
        name: 1,
        requestorKind: 1,
        "metadata.representativeName": 1,
        "metadata.phoneNumber": 1,
        "metadata.address": 1,
      })
      .limit(20)
      .lean();
    return res.json({
      success: true,
      data: {
        items: items.map((it) => ({
          _id: it._id,
          name: it.name,
          requestorKind: it.requestorKind,
          representativeName: it.metadata?.representativeName || "",
          phone: it.metadata?.phoneNumber || "",
          address: it.metadata?.address || "",
        })),
      },
    });
  } catch (error) {
    console.error("[salesTeam.searchPlatformBusinesses]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "사업자 검색에 실패했습니다.",
    });
  }
}

/** 상호 정규화: 「향기로운치과」↔「향기로운치과의원」동일 취급 */
function normalizePlaceName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(
      /(치과의원|치과병원|치과기공소|기공소|치의원|의원|병원|clinic|lab)/gi,
      "",
    );
}

function normalizePlaceAddress(address) {
  return String(address || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/대한민국/g, "")
    .replace(/서울특별시/g, "서울")
    .replace(/부산광역시/g, "부산")
    .replace(/대구광역시/g, "대구")
    .replace(/인천광역시/g, "인천")
    .replace(/광주광역시/g, "광주")
    .replace(/대전광역시/g, "대전")
    .replace(/울산광역시/g, "울산")
    .replace(/세종특별자치시/g, "세종")
    .replace(/경기도/g, "경기")
    .replace(/강원특별자치도|강원도/g, "강원")
    .replace(/충청북도/g, "충북")
    .replace(/충청남도/g, "충남")
    .replace(/전북특별자치도|전라북도/g, "전북")
    .replace(/전라남도/g, "전남")
    .replace(/경상북도/g, "경북")
    .replace(/경상남도/g, "경남")
    .replace(/제주특별자치도/g, "제주");
}

function placeExactKey(name, address) {
  return `${String(name || "").toLowerCase().trim()}|${normalizePlaceAddress(address)}`;
}

/**
 * Unified place autosuggest for mobile-friendly account/visit entry.
 * Sources: sales accounts → platform requestors → Kakao Local keyword.
 * 등록(계정·플랫폼)과 주소/상호가 겹치는 카카오 결과는 숨긴다.
 */
export async function suggestPlaces(req, res) {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) {
      return res.json({ success: true, data: { items: [] } });
    }
    const { region, name } = parseRegionNameQuery(q);
    const nameQ = (name || q).trim();
    const nameEscaped = nameQ.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nameRe = new RegExp(nameEscaped, "i");
    const visibility = accountVisibilityFilter(req.user._id, req.user.role);
    const textMatch = {
      $or: [
        { name: nameRe },
        { representativeName: nameRe },
        { phone: nameRe },
      ],
    };
    const accountFilter =
      Object.keys(visibility).length > 0
        ? { $and: [visibility, textMatch] }
        : textMatch;

    const [accounts, platform, kakaoRes] = await Promise.all([
      SalesAccount.find(accountFilter).sort({ updatedAt: -1 }).limit(16).lean(),
      BusinessAnchor.find({
        businessType: "requestor",
        $or: [
          { name: nameRe },
          { "metadata.companyName": nameRe },
          { "metadata.representativeName": nameRe },
        ],
      })
        .select({
          name: 1,
          requestorKind: 1,
          "metadata.representativeName": 1,
          "metadata.phoneNumber": 1,
          "metadata.address": 1,
          "metadata.addressDetail": 1,
          "metadata.lat": 1,
          "metadata.lng": 1,
        })
        .limit(16)
        .lean(),
      searchDentalKakaoPlaces(q, { limit: 40 }),
    ]);

    const items = [];
    const seenExact = new Set();
    const registeredAddrs = new Set();
    const registeredNamesNoAddr = new Set();

    const pushUnique = (row, { trackRegistered = false } = {}) => {
      if (!row.name) return;
      const exact = placeExactKey(row.name, row.address);
      if (seenExact.has(exact)) return;
      const addr = normalizePlaceAddress(row.address);
      const nm = normalizePlaceName(row.name);
      // 등록과 같은 주소 → 카카오 숨김. 상호만 같고 주소가 다르면 다른 지점으로 유지.
      if (row.source === "kakao") {
        if (addr && registeredAddrs.has(addr)) return;
        if (nm && !addr && registeredNamesNoAddr.has(nm)) return;
      }
      seenExact.add(exact);
      if (trackRegistered) {
        if (addr) registeredAddrs.add(addr);
        else if (nm) registeredNamesNoAddr.add(nm);
      }
      items.push(row);
    };

    const accountRows = [];
    for (const acc of accounts) {
      accountRows.push({
        source: "account",
        accountId: String(acc._id),
        businessAnchorId: acc.businessAnchorId
          ? String(acc.businessAnchorId)
          : null,
        name: acc.name,
        kind: acc.kind === "lab" ? "lab" : "practice",
        representativeName: acc.representativeName || "",
        phone: acc.phone || "",
        address: acc.address || "",
        lat: acc.lat ?? null,
        lng: acc.lng ?? null,
        label: acc.businessAnchorId ? "등록·가입" : "등록 거래처",
      });
    }
    const platformRows = [];
    for (const it of platform) {
      const addr = baAddressLine(it);
      const lat = parseCoord(it.metadata?.lat);
      const lng = parseCoord(it.metadata?.lng);
      const hasCoords = hasValidCoords(lat, lng);
      platformRows.push({
        source: "platform",
        accountId: null,
        businessAnchorId: String(it._id),
        name: it.name,
        kind: placeKindFromBa(it),
        representativeName: it.metadata?.representativeName || "",
        phone: it.metadata?.phoneNumber || "",
        address: addr,
        lat: hasCoords ? lat : null,
        lng: hasCoords ? lng : null,
        label: addr
          ? hasCoords
            ? "플랫폼 · 위치확인"
            : "플랫폼 · 주소있음"
          : "플랫폼 가입",
      });
    }

    const preferRegion = (rows) => {
      if (!region) return rows;
      return rows.filter((r) => {
        if (!nameRe.test(String(r.name || ""))) return false;
        const addr = String(r.address || "").trim();
        // 주소 없으면 상호만 매칭(이후 위치 픽), 있으면 지역 일치만
        return !addr || addressMatchesRegion(addr, region);
      });
    };

    for (const row of preferRegion(accountRows)) {
      pushUnique(row, { trackRegistered: true });
    }
    for (const row of preferRegion(platformRows)) {
      pushUnique(row, { trackRegistered: true });
    }

    for (const it of kakaoRes.items) {
      pushUnique({
        source: "kakao",
        accountId: null,
        businessAnchorId: null,
        name: it.name,
        kind: it.kind,
        representativeName: "",
        phone: it.phone || "",
        address: it.address || "",
        lat: it.lat,
        lng: it.lng,
        label: "지도 검색",
      });
    }

    return res.json({
      success: true,
      data: {
        items: items.slice(0, 40),
        ...placeGeoMeta({ kakaoAuthError: kakaoRes.authError }),
      },
    });
  } catch (error) {
    console.error("[salesTeam.suggestPlaces]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "장소 제안에 실패했습니다.",
    });
  }
}

/**
 * Resolve a place for map confirm:
 * - BA with coords → return immediately
 * - BA/account with address → geocode (Kakao → Nominatim); on success return single place
 * - else Kakao keyword candidates (needsPick)
 */
export async function resolvePlace(req, res) {
  try {
    const body = req.body || {};
    const baId = oid(body.businessAnchorId);
    const nameHint = String(body.name || "").trim();
    const addressHint = String(body.address || "").trim();

    const toKakaoItems = (docs) =>
      docs.map((it) => ({
        source: "kakao",
        accountId: null,
        businessAnchorId: baId ? String(baId) : null,
        name: it.name,
        kind: it.kind,
        representativeName: "",
        phone: it.phone || "",
        address: it.address || "",
        lat: it.lat,
        lng: it.lng,
        label: "지도 검색",
      }));

    if (baId) {
      const ba = await BusinessAnchor.findById(baId)
        .select({
          name: 1,
          requestorKind: 1,
          "metadata.representativeName": 1,
          "metadata.phoneNumber": 1,
          "metadata.address": 1,
          "metadata.addressDetail": 1,
          "metadata.lat": 1,
          "metadata.lng": 1,
        })
        .lean();
      if (!ba) {
        return res.status(404).json({
          success: false,
          message: "플랫폼 사업자를 찾을 수 없습니다.",
        });
      }
      const baName = String(ba.name || nameHint || "").trim();
      const baAddr = baAddressLine(ba) || addressHint;
      const lat = parseCoord(ba.metadata?.lat);
      const lng = parseCoord(ba.metadata?.lng);
      if (hasValidCoords(lat, lng)) {
        return res.json({
          success: true,
          data: {
            needsPick: false,
            place: {
              source: "ba",
              accountId: null,
              businessAnchorId: String(ba._id),
              name: baName,
              kind: placeKindFromBa(ba),
              representativeName: ba.metadata?.representativeName || "",
              phone: ba.metadata?.phoneNumber || "",
              address: baAddr,
              lat,
              lng,
              label: "플랫폼 · 위치확인",
            },
            candidates: [],
            ...placeGeoMeta(),
          },
        });
      }
      if (baAddr) {
        const geo = await geocodeAddress(baAddr);
        if (geo) {
          return res.json({
            success: true,
            data: {
              needsPick: false,
              place: {
                source: "ba",
                accountId: null,
                businessAnchorId: String(ba._id),
                name: baName,
                kind: placeKindFromBa(ba),
                representativeName: ba.metadata?.representativeName || "",
                phone: ba.metadata?.phoneNumber || "",
                address: baAddr,
                lat: geo.lat,
                lng: geo.lng,
                label: "플랫폼 · 주소지오코딩",
              },
              candidates: [],
              ...placeGeoMeta(),
            },
          });
        }
      }
      const kakao = await searchKakaoPlaceCandidates(baName || nameHint, baAddr, {
        limit: 10,
      });
      return res.json({
        success: true,
        data: {
          needsPick: true,
          place: null,
          candidates: toKakaoItems(kakao.items).map((c) => ({
            ...c,
            businessAnchorId: String(ba._id),
            kind: c.kind || placeKindFromBa(ba),
          })),
          ...placeGeoMeta({ kakaoAuthError: kakao.authError }),
        },
      });
    }

    if (!nameHint && !addressHint) {
      return res.status(400).json({
        success: false,
        message: "상호명 또는 businessAnchorId가 필요합니다.",
      });
    }

    // Address-only (or name+address): try geocode before keyword.
    if (addressHint) {
      const geo = await geocodeAddress(addressHint);
      if (geo) {
        return res.json({
          success: true,
          data: {
            needsPick: false,
            place: {
              source: "geocode",
              accountId: null,
              businessAnchorId: null,
              name: nameHint || geo.address,
              kind: "practice",
              representativeName: "",
              phone: "",
              address: addressHint,
              lat: geo.lat,
              lng: geo.lng,
              label: "주소 지오코딩",
            },
            candidates: [],
            ...placeGeoMeta(),
          },
        });
      }
    }

    const kakao = await searchKakaoPlaceCandidates(nameHint, addressHint, {
      limit: 10,
    });
    return res.json({
      success: true,
      data: {
        needsPick: true,
        place: null,
        candidates: toKakaoItems(kakao.items),
        ...placeGeoMeta({ kakaoAuthError: kakao.authError }),
      },
    });
  } catch (error) {
    console.error("[salesTeam.resolvePlace]", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "장소 확인에 실패했습니다.",
    });
  }
}

// related files:
// - web/backend/services/eventVisitCore.js
// - web/backend/models/marketingEventVisit.model.js
// - web/backend/models/marketingEventVisitChunk.model.js
// - web/backend/models/marketingEvent.model.js
// - web/backend/utils/s3.utils.js
// - web/backend/controllers/events/eventVisit.controller.js
// - web/backend/server.js
import { createHash, randomBytes } from "crypto";
import { gzipSync } from "zlib";
import { Types } from "mongoose";
import MarketingEvent from "../models/marketingEvent.model.js";
import MarketingEventApplication from "../models/marketingEventApplication.model.js";
import MarketingEventVisit from "../models/marketingEventVisit.model.js";
import MarketingEventVisitChunk from "../models/marketingEventVisitChunk.model.js";
import { putObjectToS3 } from "../utils/s3.utils.js";
import { verifyToken } from "../utils/jwt.utils.js";
import {
  classifyBrowser,
  classifyDevice,
  clientIp,
  countryLabel,
  kstParts,
  placeLabel,
  regionName,
  routeLabel,
  sanitizeVisitBody,
  shiftKstDate,
} from "./eventVisitCore.js";

const EVENT_CACHE_MS = 60_000;
const MISS_CACHE_MS = 15_000;
const MONGO_PROGRESS_GAP_MS = 60_000;
const SESSION_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FLUSH_MS = 20_000;
const FLUSH_LINES = 80;
const QUEUE_CAP = 2000;
const INSTANCE_ID = randomBytes(3).toString("hex");

const eventCache = new Map();
const lastMongoWrite = new Map();
const rawQueue = [];
const archivedSessions = new Set();
let flushing = false;
let flushTimer = null;
let flushSeq = 0;
let geoipMod;

function header(req, name) {
  const value = req?.headers?.[name];
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

function decodeHeader(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    return raw;
  }
}

function hashIp(ip) {
  if (!ip) return "";
  return createHash("sha256")
    .update(`abuts-event-visit|${ip}`)
    .digest("hex")
    .slice(0, 24);
}

function optionalActor(req) {
  const auth = header(req, "authorization");
  if (!auth.startsWith("Bearer ")) return { userId: "", role: "" };
  try {
    const decoded = verifyToken(auth.slice("Bearer ".length).trim());
    const userId = decoded?.userId;
    if (!userId || Array.isArray(userId)) return { userId: "", role: "" };
    if (!Types.ObjectId.isValid(String(userId))) {
      return { userId: "", role: "" };
    }
    return {
      userId: String(userId),
      role: String(decoded?.role || "").slice(0, 40),
    };
  } catch {
    return { userId: "", role: "" };
  }
}

async function lookupGeoip(ip) {
  if (!ip || ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168.")) {
    return null;
  }
  if (geoipMod === undefined) {
    try {
      const mod = await import("geoip-lite");
      geoipMod = mod.default || mod;
    } catch (error) {
      console.warn("[eventVisit] geoip-lite unavailable", error?.message || error);
      geoipMod = null;
    }
  }
  if (!geoipMod?.lookup) return null;
  try {
    return geoipMod.lookup(ip);
  } catch {
    return null;
  }
}

async function resolveGeo(req, ip) {
  const country = (
    header(req, "cloudfront-viewer-country") ||
    header(req, "cf-ipcountry") ||
    ""
  )
    .toUpperCase()
    .slice(0, 8);
  const headerRegion = decodeHeader(
    header(req, "cloudfront-viewer-country-region-name"),
  );
  const headerRegionCode = header(req, "cloudfront-viewer-country-region");
  const headerCity = decodeHeader(header(req, "cloudfront-viewer-city"));
  if (country) {
    return {
      country,
      regionName: regionName(country, headerRegionCode, headerRegion).slice(0, 80),
      city: headerCity.slice(0, 80),
    };
  }
  const hit = await lookupGeoip(ip);
  if (!hit) return { country: "", regionName: "", city: "" };
  const code = String(hit.country || "").toUpperCase();
  return {
    country: code.slice(0, 8),
    regionName: regionName(code, hit.region, "").slice(0, 80),
    city: String(hit.city || "").slice(0, 80),
  };
}

async function findEventBySlug(slug) {
  const key = String(slug || "").trim().toLowerCase();
  const cached = eventCache.get(key);
  if (cached && cached.exp > Date.now()) return cached.event;
  const event = key
    ? await MarketingEvent.findOne({ slug: key }).select("_id slug").lean()
    : null;
  eventCache.set(key, {
    event: event || null,
    exp: Date.now() + (event ? EVENT_CACHE_MS : MISS_CACHE_MS),
  });
  return event;
}

function keepOr(field, value) {
  const next = String(value || "");
  if (!next) return undefined;
  return {
    $cond: [
      { $gt: [{ $strLenCP: { $ifNull: [`$${field}`, ""] } }, 0] },
      `$${field}`,
      next,
    ],
  };
}

function rememberMongoWrite(key) {
  lastMongoWrite.set(key, Date.now());
  if (lastMongoWrite.size <= 4000) return;
  const cutoff = Date.now() - 10 * 60_000;
  for (const [id, ts] of lastMongoWrite) {
    if (ts < cutoff) lastMongoWrite.delete(id);
  }
}

function archiveOnce(sessionKey, line) {
  if (!sessionKey || archivedSessions.has(sessionKey)) return;
  archivedSessions.add(sessionKey);
  if (archivedSessions.size > 4000) archivedSessions.clear();
  enqueueRaw(line);
}

function enqueueRaw(line) {
  rawQueue.push(line);
  if (rawQueue.length > QUEUE_CAP) {
    rawQueue.splice(0, rawQueue.length - QUEUE_CAP);
  }
  if (process.env.NODE_ENV === "test") return;
  if (rawQueue.length >= FLUSH_LINES) {
    void flushEventVisitRaw();
    return;
  }
  if (!flushTimer) {
    flushTimer = setInterval(() => {
      void flushEventVisitRaw();
    }, FLUSH_MS);
    flushTimer.unref?.();
  }
}

export async function flushEventVisitRaw() {
  if (flushing || rawQueue.length === 0) return { flushed: 0 };
  flushing = true;
  const batch = rawQueue.splice(0, 400);
  try {
    const ndjson = `${batch.map((line) => JSON.stringify(line)).join("\n")}\n`;
    const body = gzipSync(Buffer.from(ndjson));
    const now = new Date();
    const { kstDate } = kstParts(now);
    const [year, month, day] = kstDate.split("-");
    const key = `analytics/event-visits/${year}/${month}/${day}/${INSTANCE_ID}-${Date.now()}-${flushSeq}.ndjson.gz`;
    flushSeq += 1;
    await putObjectToS3(key, body, {
      contentType: "application/x-ndjson",
      contentEncoding: "gzip",
    });
    const slugs = [
      ...new Set(batch.map((line) => String(line.slug || "")).filter(Boolean)),
    ].slice(0, 20);
    await MarketingEventVisitChunk.create({
      s3Key: key,
      bytes: body.length,
      lineCount: batch.length,
      kstDate,
      slugs,
      flushedAt: now,
    });
    return { flushed: batch.length, s3Key: key };
  } catch (error) {
    console.error("[eventVisit] s3 flush failed", error?.message || error);
    rawQueue.unshift(...batch);
    if (rawQueue.length > QUEUE_CAP) {
      rawQueue.splice(0, rawQueue.length - QUEUE_CAP);
    }
    return { flushed: 0 };
  } finally {
    flushing = false;
    if (rawQueue.length === 0 && flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
  }
}

async function upsertSession({ event, visit, geo, actor, ipHash, now }) {
  const { kstDate, kstHour } = kstParts(now);
  const set = {
    eventId: event._id,
    sessionId: visit.sessionId,
    eventSlug: event.slug,
    lastSeenAt: now,
    device: classifyDevice(visit.userAgent),
    browser: classifyBrowser(visit.userAgent),
    dwellMs: {
      $max: [{ $ifNull: ["$dwellMs", 0] }, visit.dwellMs],
    },
    scrollMax: {
      $max: [{ $ifNull: ["$scrollMax", 0] }, visit.scrollPct],
    },
    pageViews: {
      $add: [
        { $ifNull: ["$pageViews", visit.type === "enter" ? 0 : 1] },
        visit.type === "enter" ? 1 : 0,
      ],
    },
    startedAt: { $ifNull: ["$startedAt", now] },
    kstDate: { $ifNull: ["$kstDate", kstDate] },
    kstHour: { $ifNull: ["$kstHour", kstHour] },
  };
  if (visit.lang) set.lang = visit.lang;
  if (visit.utmSource) set.utmSource = { $ifNull: ["$utmSource", visit.utmSource] };
  if (visit.utmMedium) set.utmMedium = { $ifNull: ["$utmMedium", visit.utmMedium] };
  if (visit.utmCampaign) {
    set.utmCampaign = { $ifNull: ["$utmCampaign", visit.utmCampaign] };
  }
  const country = keepOr("country", geo.country);
  const region = keepOr("regionName", geo.regionName);
  const city = keepOr("city", geo.city);
  const ref = keepOr("referrerHost", visit.referrerHost);
  const hashed = keepOr("ipHash", ipHash);
  if (country) set.country = country;
  if (region) set.regionName = region;
  if (city) set.city = city;
  if (ref) set.referrerHost = ref;
  if (hashed) set.ipHash = hashed;
  if (actor.userId) {
    set.userId = {
      $ifNull: ["$userId", new Types.ObjectId(actor.userId)],
    };
  }
  if (actor.role) set.actorRole = { $ifNull: ["$actorRole", actor.role] };
  const visitor = keepOr("visitorId", visit.visitorId);
  if (visitor) set.visitorId = visitor;
  set.returning = { $ifNull: ["$returning", Boolean(visit.returning)] };
  if (visit.reachedApply) set.reachedApply = true;
  if (visit.formStarted) set.formStarted = true;
  if (visit.converted) set.converted = true;
  if (visit.pages?.length) {
    set.pages = {
      $cond: [
        {
          $gt: [
            visit.pages.length,
            { $size: { $ifNull: ["$pages", []] } },
          ],
        },
        { $literal: visit.pages },
        { $ifNull: ["$pages", []] },
      ],
    };
  }
  if (visit.routes?.length) {
    set.routes = {
      $cond: [
        {
          $gt: [
            visit.routes.length,
            { $size: { $ifNull: ["$routes", []] } },
          ],
        },
        { $literal: visit.routes },
        { $ifNull: ["$routes", []] },
      ],
    };
  }

  const filter = { eventId: event._id, sessionId: visit.sessionId };
  const pipeline = [{ $set: set }];
  try {
    await MarketingEventVisit.updateOne(filter, pipeline, { upsert: true });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    await MarketingEventVisit.updateOne(filter, pipeline);
  }
}

function summaryLine({ event, visit, geo, now }) {
  return {
    t: now.toISOString(),
    slug: event.slug,
    sid: visit.sessionId,
    type: visit.type,
    dwellMs: visit.dwellMs,
    scroll: visit.scrollPct,
    refHost: visit.referrerHost,
    lang: visit.lang,
    utmSource: visit.utmSource,
    utmMedium: visit.utmMedium,
    utmCampaign: visit.utmCampaign,
    device: classifyDevice(visit.userAgent),
    browser: classifyBrowser(visit.userAgent),
    country: geo.country,
    region: geo.regionName,
    city: geo.city,
    reachedApply: Boolean(visit.reachedApply),
    formStarted: Boolean(visit.formStarted),
    converted: Boolean(visit.converted),
    returning: Boolean(visit.returning),
    visitorId: visit.visitorId || "",
    pages: (visit.pages || []).map((page) => page.label),
    routes: (visit.routes || []).map((route) => route.path),
  };
}

/**
 * 공개 이벤트 페이지 방문 1건.
 * Mongo는 세션 1건을 갱신한다. S3에는 세션이 끝날 때 요약 한 줄만 올린다.
 */
export async function ingestEventVisit(req) {
  const slug = String(req.params?.slug || "")
    .trim()
    .toLowerCase();
  const parsed = sanitizeVisitBody(req.body);
  if (!parsed.ok) return { ok: false, status: 400, message: parsed.message };
  const event = await findEventBySlug(slug);
  if (!event) return { ok: false, status: 404, message: "이벤트를 찾을 수 없습니다." };

  const visit = parsed.value;
  visit.userAgent = header(req, "user-agent").slice(0, 400);
  const now = new Date();
  const ip = clientIp(req);
  const ipHash = hashIp(ip);
  const actor = optionalActor(req);
  const sessionKey = `${event._id}:${visit.sessionId}`;
  const recent = lastMongoWrite.get(sessionKey) || 0;
  const funnel =
    visit.reachedApply ||
    visit.formStarted ||
    visit.pageStep ||
    visit.routeStep ||
    visit.type === "leave";
  const skipMongo =
    !funnel &&
    visit.type === "progress" &&
    now.getTime() - recent < MONGO_PROGRESS_GAP_MS;
  if (skipMongo) return { ok: true };

  const geo = await resolveGeo(req, ip);
  await upsertSession({ event, visit, geo, actor, ipHash, now });
  rememberMongoWrite(sessionKey);
  if (visit.type === "leave") {
    archiveOnce(sessionKey, summaryLine({ event, visit, geo, now }));
  }
  return { ok: true };
}

/** 신청 접수 시 그 세션을 전환으로 표시. 방문 문서가 없으면 만들지 않는다. */
export async function markEventVisitConverted(eventId, sessionId) {
  const sid = String(sessionId || "").trim();
  if (!SESSION_RE.test(sid) || !Types.ObjectId.isValid(String(eventId))) return;
  const now = new Date();
  const doc = await MarketingEventVisit.findOneAndUpdate(
    { eventId, sessionId: sid },
    {
      $set: {
        converted: true,
        formStarted: true,
        reachedApply: true,
        lastSeenAt: now,
      },
    },
    { new: true },
  ).lean();
  if (!doc) return;
  archiveOnce(`${eventId}:${sid}`, {
    t: now.toISOString(),
    slug: doc.eventSlug,
    sid,
    type: "convert",
    dwellMs: doc.dwellMs || 0,
    scroll: doc.scrollMax || 0,
    refHost: doc.referrerHost || "",
    lang: doc.lang || "",
    utmSource: doc.utmSource || "",
    utmMedium: doc.utmMedium || "",
    utmCampaign: doc.utmCampaign || "",
    device: doc.device || "",
    browser: doc.browser || "",
    country: doc.country || "",
    region: doc.regionName || "",
    city: doc.city || "",
    reachedApply: true,
    formStarted: true,
    converted: true,
    returning: Boolean(doc.returning),
    visitorId: doc.visitorId || "",
    pages: (doc.pages || []).map((page) => page.label),
    routes: (doc.routes || []).map((route) => route.path),
  });
}

function applyRate(sessions, applications) {
  const visits = Number(sessions || 0);
  const applied = Number(applications || 0);
  if (!visits) return 0;
  return Math.round((applied / visits) * 1000) / 10;
}

function fillHours(rows, appRows) {
  const map = new Map(rows.map((row) => [Number(row._id), row]));
  const apps = new Map(
    (appRows || []).map((row) => [Number(row._id), Number(row.applications || 0)]),
  );
  return Array.from({ length: 24 }, (_, hour) => {
    const row = map.get(hour);
    const sessions = row?.sessions || 0;
    const applications = apps.get(hour) || 0;
    return {
      hour,
      pageViews: row?.pageViews || 0,
      sessions,
      applications,
      rate: applyRate(sessions, applications),
    };
  });
}

function fillDays(from, to, rows, appRows) {
  const map = new Map(rows.map((row) => [String(row._id), row]));
  const apps = new Map(
    (appRows || []).map((row) => [String(row._id), Number(row.applications || 0)]),
  );
  const days = [];
  for (let cursor = from; cursor <= to; cursor = shiftKstDate(cursor, 1)) {
    const row = map.get(cursor);
    const sessions = row?.sessions || 0;
    const applications = apps.get(cursor) || 0;
    days.push({
      date: cursor,
      pageViews: row?.pageViews || 0,
      sessions,
      applications,
      converted: row?.converted || 0,
      rate: applyRate(sessions, applications),
    });
    if (days.length > 40) break;
  }
  return days;
}

function sourceLabel(row) {
  const source = String(row?._id?.source || "").trim() || "직접";
  const campaign = String(row?._id?.campaign || "").trim();
  return campaign ? `${source} · ${campaign}` : source;
}

function stageLabel(row) {
  if (row.converted) return "신청 완료";
  if (row.formStarted) return "입력";
  if (row.reachedApply) return "신청 구간";
  return "둘러봄";
}

function routeNames(routes) {
  if (!Array.isArray(routes)) return [];
  return [...routes]
    .filter((route) => route?.path)
    .sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
    .map((route) => routeLabel(route.path));
}

function pageLabels(pages) {
  if (!Array.isArray(pages)) return [];
  return [...pages]
    .filter((page) => page?.label)
    .sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
    .map((page) => String(page.label));
}

export async function loadEventVisitReport(eventId, range) {
  const id = new Types.ObjectId(String(eventId));
  const to = range.to;
  const from = range.from;
  const match = { eventId: id, kstDate: { $gte: from, $lte: to } };
  const { start, end } = {
    start: new Date(`${from}T00:00:00+09:00`),
    end: new Date(`${to}T23:59:59.999+09:00`),
  };
  const appMatch = { eventId: id, createdAt: { $gte: start, $lte: end } };
  const [stats, hours, days, regions, sources, devices, pageRows, routeRows, recent, appByDay, appByHour] =
    await Promise.all([
      MarketingEventVisit.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            pageViews: { $sum: "$pageViews" },
            sessions: { $sum: 1 },
            reachedApply: { $sum: { $cond: ["$reachedApply", 1, 0] } },
            formStarted: { $sum: { $cond: ["$formStarted", 1, 0] } },
            converted: { $sum: { $cond: ["$converted", 1, 0] } },
            returning: { $sum: { $cond: ["$returning", 1, 0] } },
            bounces: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $lt: ["$dwellMs", 10000] },
                      { $ne: ["$reachedApply", true] },
                      { $ne: ["$converted", true] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            dwellSum: { $sum: "$dwellMs" },
            dwellCount: {
              $sum: { $cond: [{ $gt: ["$dwellMs", 0] }, 1, 0] },
            },
            visitors: {
              $addToSet: {
                $cond: [
                  { $gt: [{ $strLenCP: { $ifNull: ["$visitorId", ""] } }, 0] },
                  "$visitorId",
                  "$ipHash",
                ],
              },
            },
          },
        },
      ]),
      MarketingEventVisit.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$kstHour",
            pageViews: { $sum: "$pageViews" },
            sessions: { $sum: 1 },
          },
        },
      ]),
      MarketingEventVisit.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$kstDate",
            pageViews: { $sum: "$pageViews" },
            sessions: { $sum: 1 },
            converted: { $sum: { $cond: ["$converted", 1, 0] } },
          },
        },
      ]),
      MarketingEventVisit.aggregate([
        { $match: match },
        {
          $group: {
            _id: { country: "$country", region: "$regionName" },
            sessions: { $sum: 1 },
            converted: { $sum: { $cond: ["$converted", 1, 0] } },
          },
        },
        { $sort: { sessions: -1 } },
        { $limit: 8 },
      ]),
      MarketingEventVisit.aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              source: {
                $cond: [
                  { $gt: [{ $strLenCP: { $ifNull: ["$utmSource", ""] } }, 0] },
                  "$utmSource",
                  {
                    $cond: [
                      {
                        $gt: [
                          { $strLenCP: { $ifNull: ["$referrerHost", ""] } },
                          0,
                        ],
                      },
                      "$referrerHost",
                      "직접",
                    ],
                  },
                ],
              },
              campaign: "$utmCampaign",
            },
            sessions: { $sum: 1 },
            converted: { $sum: { $cond: ["$converted", 1, 0] } },
          },
        },
        { $sort: { sessions: -1 } },
        { $limit: 8 },
      ]),
      MarketingEventVisit.aggregate([
        { $match: match },
        { $group: { _id: "$device", sessions: { $sum: 1 } } },
      ]),
      MarketingEventVisit.aggregate([
        { $match: match },
        { $unwind: "$pages" },
        {
          $group: {
            _id: "$pages.label",
            sessions: { $sum: 1 },
            index: { $min: "$pages.index" },
          },
        },
        { $sort: { index: 1, _id: 1 } },
        { $limit: 12 },
      ]),
      MarketingEventVisit.aggregate([
        { $match: match },
        { $unwind: "$routes" },
        {
          $group: {
            _id: "$routes.path",
            sessions: { $sum: 1 },
            index: { $min: "$routes.index" },
          },
        },
        { $sort: { sessions: -1, index: 1 } },
        { $limit: 12 },
      ]),
      MarketingEventVisit.find(match)
        .sort({ lastSeenAt: -1 })
        .limit(12)
        .select(
          "startedAt dwellMs country regionName device referrerHost utmSource utmCampaign reachedApply formStarted converted returning pages routes",
        )
        .lean(),
      MarketingEventApplication.aggregate([
        { $match: appMatch },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt",
                timezone: "Asia/Seoul",
              },
            },
            applications: { $sum: 1 },
          },
        },
      ]),
      MarketingEventApplication.aggregate([
        { $match: appMatch },
        {
          $group: {
            _id: {
              $toInt: {
                $dateToString: {
                  format: "%H",
                  date: "$createdAt",
                  timezone: "Asia/Seoul",
                },
              },
            },
            applications: { $sum: 1 },
          },
        },
      ]),
    ]);

  const applicationTotal = appByDay.reduce(
    (sum, row) => sum + Number(row.applications || 0),
    0,
  );

  const stat = stats[0] || {};
  const visitors = Array.isArray(stat.visitors)
    ? stat.visitors.filter(Boolean)
    : [];
  const sessions = Number(stat.sessions || 0);
  const converted = Number(stat.converted || 0);
  const dwellCount = Number(stat.dwellCount || 0);
  return {
    from,
    to,
    summary: {
      pageViews: Number(stat.pageViews || 0),
      sessions,
      uniqueVisitors: visitors.length,
      returning: Number(stat.returning || 0),
      applications: applicationTotal,
      conversionRate: sessions
        ? Math.round((applicationTotal / sessions) * 100)
        : 0,
      avgDwellMs: dwellCount
        ? Math.round(Number(stat.dwellSum || 0) / dwellCount)
        : 0,
      bounces: Number(stat.bounces || 0),
    },
    funnel: {
      sessions,
      reachedApply: Number(stat.reachedApply || 0),
      formStarted: Number(stat.formStarted || 0),
      converted,
    },
    hours: fillHours(hours, appByHour),
    daily: fillDays(from, to, days, appByDay),
    regions: regions.map((row) => ({
      label: placeLabel({
        country: row._id?.country,
        regionName: row._id?.region,
        city: "",
      }),
      country: countryLabel(row._id?.country),
      sessions: row.sessions || 0,
      converted: row.converted || 0,
    })),
    sources: sources.map((row) => ({
      label: sourceLabel(row),
      sessions: row.sessions || 0,
      converted: row.converted || 0,
    })),
    devices: devices.map((row) => ({
      device: String(row._id || "desktop"),
      sessions: row.sessions || 0,
    })),
    pages: pageRows.map((row) => ({
      label: String(row._id || ""),
      sessions: row.sessions || 0,
    })),
    routes: routeRows.map((row) => ({
      path: String(row._id || ""),
      label: routeLabel(row._id),
      sessions: row.sessions || 0,
    })),
    recent: recent.map((row) => ({
      id: String(row._id),
      startedAt: row.startedAt,
      dwellMs: row.dwellMs || 0,
      place: placeLabel(row),
      device: row.device || "desktop",
      source: row.utmSource || row.referrerHost || "직접",
      stage: stageLabel(row),
      returning: Boolean(row.returning),
      pages: pageLabels(row.pages),
      routes: routeNames(row.routes),
    })),
  };
}

export async function countEventVisits(eventIds) {
  const ids = (eventIds || []).filter((id) => Types.ObjectId.isValid(String(id)));
  if (!ids.length) return new Map();
  const rows = await MarketingEventVisit.aggregate([
    { $match: { eventId: { $in: ids } } },
    { $group: { _id: "$eventId", sessions: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.sessions || 0]));
}

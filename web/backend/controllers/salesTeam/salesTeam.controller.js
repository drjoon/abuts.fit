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

const COMMITMENTS = new Set(["confirmed", "around", "askBefore"]);
const VISIT_STATUSES = new Set(["planned", "done", "canceled", "noShow"]);
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
 * Kakao Local keyword search for place autosuggest.
 * @returns {{ items: Array, authError: boolean }}
 */
async function kakaoKeywordSearch(query, { limit = 8 } = {}) {
  const q = String(query || "").trim();
  const key = kakaoRestApiKey();
  if (!q || !key) return { items: [], authError: false };
  try {
    const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
    url.searchParams.set("query", q);
    url.searchParams.set("size", String(Math.min(15, Math.max(1, limit))));
    const resp = await fetch(url.toString(), {
      headers: { Authorization: `KakaoAK ${key}` },
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const authError = isKakaoLocalAuthError(resp.status, json);
      if (authError) {
        console.warn(
          "[salesTeam.kakaoKeywordSearch] Kakao Local unauthorized",
          { status: resp.status, errorType: json?.errorType || json?.code },
        );
      }
      return { items: [], authError };
    }
    const docs = Array.isArray(json?.documents) ? json.documents : [];
    const items = docs
      .map((doc) => {
        const lat = Number(doc.y);
        const lng = Number(doc.x);
        const category = String(doc.category_name || "");
        let kind = "practice";
        if (
          /기공|치과기공|denture|lab/i.test(category) ||
          /기공/.test(String(doc.place_name || ""))
        ) {
          kind = "lab";
        }
        return {
          source: "kakao",
          name: String(doc.place_name || "").trim(),
          address: String(doc.road_address_name || doc.address_name || "").trim(),
          phone: String(doc.phone || "").trim(),
          lat: Number.isFinite(lat) ? lat : null,
          lng: Number.isFinite(lng) ? lng : null,
          kind,
          category,
        };
      })
      .filter((it) => it.name);
    return { items, authError: false };
  } catch {
    return { items: [], authError: false };
  }
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

export async function createVisit(req, res) {
  try {
    const body = req.body || {};
    const accountId = oid(body.accountId);
    const plannedAt = body.plannedAt ? new Date(body.plannedAt) : null;
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
    const doc = await SalesVisit.create({
      accountId,
      assigneeUserId: oid(body.assigneeUserId) || req.user._id,
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
    if (body.status != null) {
      const status = String(body.status).trim();
      if (!VISIT_STATUSES.has(status)) {
        return res.status(400).json({ success: false, message: "상태가 올바르지 않습니다." });
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

    const mapStops = ordered.filter(
      (s) => s.lat != null && s.lng != null && Number.isFinite(s.lat) && Number.isFinite(s.lng),
    );
    const mapUrl =
      mapStops.length >= 1
        ? `https://map.kakao.com/?map_type=TYPE_MAP&target=car&rt=${mapStops
            .map((s) => `${s.lng},${s.lat}`)
            .join(",")}`
        : null;

    return res.json({
      success: true,
      data: {
        ymd,
        ordered,
        totalKm: Math.round(totalKm * 10) / 10,
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

/**
 * Unified place autosuggest for mobile-friendly account/visit entry.
 * Sources: sales accounts → platform requestors → Kakao Local keyword.
 */
export async function suggestPlaces(req, res) {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) {
      return res.json({ success: true, data: { items: [] } });
    }
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, "i");
    const visibility = accountVisibilityFilter(req.user._id, req.user.role);
    const textMatch = {
      $or: [{ name: re }, { representativeName: re }, { phone: re }],
    };
    const accountFilter =
      Object.keys(visibility).length > 0
        ? { $and: [visibility, textMatch] }
        : textMatch;

    const [accounts, platform, kakaoRes] = await Promise.all([
      SalesAccount.find(accountFilter).sort({ updatedAt: -1 }).limit(8).lean(),
      BusinessAnchor.find({
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
          "metadata.addressDetail": 1,
          "metadata.lat": 1,
          "metadata.lng": 1,
        })
        .limit(8)
        .lean(),
      kakaoKeywordSearch(q, { limit: 8 }),
    ]);

    const items = [];
    const seen = new Set();
    const pushUnique = (row) => {
      const key = `${String(row.name || "")
        .toLowerCase()}|${String(row.address || "").toLowerCase()}`;
      if (!row.name || seen.has(key)) return;
      seen.add(key);
      items.push(row);
    };

    for (const acc of accounts) {
      pushUnique({
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

    for (const it of platform) {
      const addr = baAddressLine(it);
      const lat = parseCoord(it.metadata?.lat);
      const lng = parseCoord(it.metadata?.lng);
      const hasCoords = hasValidCoords(lat, lng);
      pushUnique({
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
        items: items.slice(0, 15),
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

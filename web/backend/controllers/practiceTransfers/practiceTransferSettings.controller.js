import { Types } from "mongoose";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import { hydrateFavoritesWithRoundBarAdopted } from "./roundBarAbutmentRequest.controller.js";
import { normalizeAdoptedKind } from "../../utils/roundBarAbutment.js";
import {
  loadAutoMatchBudgetCatalog,
  resolveAutoMatchBudgetOrDefaults,
} from "../../utils/practiceTransferAutoMatchBudget.js";

// related files:
// - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
// - web/backend/models/businessAnchor.model.js
// - web/backend/controllers/practiceTransfers/roundBarAbutmentRequest.controller.js
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - 2026-08-14: autoMatchBudget(자동매칭 기공비 min/max).
// - 2026-08-14: autoMatchMinLabRating(자동매칭 최소 별·2nd chance).
// - 2026-08-16: autoMatchBudget version3 — minPct/maxPct.
// - 2026-08-16: v4 고정가. GET은 최소 별점으로 budget 조립. autoMatchBudget PATCH 무시.
// - 2026-08-16: autoMatchMaxLabRating(하한·상한 치과 설정, 기본 3~4).
const DEFAULT_ARRIVAL_DEFAULT_DAYS = 7;
const ABUTMENT_PRODUCT_MODE_PRODUCTION = "custom_abutment";
const ABUTMENT_PRODUCT_MODE_DESIGN_AND_PRODUCTION = "design_custom_abutment";
const DEFAULT_ABUTMENT_PRODUCT_MODE = ABUTMENT_PRODUCT_MODE_DESIGN_AND_PRODUCTION;
const DEFAULT_PROSTHESIS_TYPES = [
  "인레이",
  "크라운",
  "커스텀어벗",
  "브리지",
  "유지장치",
  "임시치아",
];
const MAX_MEMO_SNIPPETS = 40;
const MAX_IMPLANT_FAVORITES = 40;
const MAX_ABUTMENT_FAVORITES = 40;

const normalizeProsthesisTypes = (items) => {
  const list = Array.isArray(items) ? items : [];
  const dedup = new Map();

  for (const item of list) {
    const trimmed = String(item || "").trim();
    if (!trimmed) continue;
    const compact = trimmed.replace(/\s+/g, "");
    const canonical =
      compact === "가철성임시치아" || compact === "임시치아"
        ? "임시치아"
        : trimmed;
    const key = canonical.toLowerCase();
    if (!dedup.has(key)) dedup.set(key, canonical);
  }

  const out = Array.from(dedup.values());
  return out.length ? out : [...DEFAULT_PROSTHESIS_TYPES];
};

const normalizeMemoSnippets = (items) => {
  const list = Array.isArray(items) ? items : [];
  const dedup = new Map();

  for (const item of list) {
    const trimmed = String(item || "").trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!dedup.has(key)) dedup.set(key, trimmed);
  }

  return Array.from(dedup.values()).slice(0, MAX_MEMO_SNIPPETS);
};

const normalizeImplantFavorites = (items) => {
  const list = Array.isArray(items) ? items : [];
  const out = [];
  const seen = new Map();

  for (const raw of list) {
    const row = raw && typeof raw === "object" ? raw : {};
    const manufacturer = String(row.manufacturer || "").trim();
    const brand = String(row.brand || "").trim();
    const family = String(row.family || "").trim();
    const type = String(row.type || "").trim();
    if (!manufacturer && !brand && !family && !type) continue;
    const key = `${manufacturer}|${brand}|${family}|${type}`.toLowerCase();
    const id = String(row.id || "").trim() || `imp-${out.length + 1}`;
    const roundBarRequestId = String(row.roundBarRequestId || "").trim();
    const roundBar = Boolean(row.roundBar) || Boolean(roundBarRequestId);
    const nextRow = {
      id,
      manufacturer,
      brand,
      family,
      type,
      roundBar,
      adopted: Boolean(row.adopted),
      adoptedKind: normalizeAdoptedKind(row.adoptedKind),
      roundBarRequestId,
    };
    if (seen.has(key)) {
      const idx = seen.get(key);
      if (!out[idx].roundBar && roundBar) out[idx] = nextRow;
      continue;
    }
    seen.set(key, out.length);
    out.push(nextRow);
    if (out.length >= MAX_IMPLANT_FAVORITES) break;
  }

  return out;
};

const normalizeAbutmentFavorites = (items) => {
  const list = Array.isArray(items) ? items : [];
  const out = [];
  const seen = new Set();

  for (const raw of list) {
    const row = raw && typeof raw === "object" ? raw : {};
    const manufacturer = String(row.manufacturer || "").trim();
    const diameter = String(row.diameter || "").trim();
    const height = String(row.height || "").trim();
    if (!manufacturer && !diameter && !height) continue;
    const key = `${manufacturer}|${diameter}|${height}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const id = String(row.id || "").trim() || `abt-${out.length + 1}`;
    out.push({ id, manufacturer, diameter, height });
    if (out.length >= MAX_ABUTMENT_FAVORITES) break;
  }

  return out;
};

const normalizeArrivalDefaultDays = (value) => {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return DEFAULT_ARRIVAL_DEFAULT_DAYS;
  return Math.min(365, Math.max(0, Math.floor(raw)));
};

const normalizeDefaultAbutmentProductMode = (value) => {
  const raw = String(value || "").trim();
  if (
    raw === ABUTMENT_PRODUCT_MODE_PRODUCTION ||
    raw === ABUTMENT_PRODUCT_MODE_DESIGN_AND_PRODUCTION
  ) {
    return raw;
  }
  return DEFAULT_ABUTMENT_PRODUCT_MODE;
};

const toSettingsResponse = async (anchor, { persistHydrated = false } = {}) => {
  const settings =
    anchor?.practiceTransferSettings &&
    typeof anchor.practiceTransferSettings === "object"
      ? anchor.practiceTransferSettings
      : {};

  const promoNoticeDismissedAt = settings?.promoNoticeDismissedAt
    ? new Date(settings.promoNoticeDismissedAt).toISOString()
    : null;

  const normalizedFavorites = normalizeImplantFavorites(settings?.implantFavorites);
  const implantFavorites = await hydrateFavoritesWithRoundBarAdopted(
    anchor?._id,
    normalizedFavorites,
  );
  if (
    persistHydrated &&
    anchor?._id &&
    JSON.stringify(implantFavorites) !== JSON.stringify(normalizedFavorites)
  ) {
    await BusinessAnchor.updateOne(
      { _id: anchor._id },
      {
        $set: {
          "practiceTransferSettings.implantFavorites": implantFavorites,
        },
      },
    );
  }

  const catalog = await loadAutoMatchBudgetCatalog();

  return {
    arrivalDefaultDays: normalizeArrivalDefaultDays(settings?.arrivalDefaultDays),
    prosthesisTypes: normalizeProsthesisTypes(settings?.prosthesisTypes),
    memoSnippets: normalizeMemoSnippets(settings?.memoSnippets),
    implantFavorites,
    abutmentFavorites: normalizeAbutmentFavorites(settings?.abutmentFavorites),
    promoNoticeDismissedAt,
    skipDesignConfirm: settings?.skipDesignConfirm !== false,
    skipJig: settings?.skipJig !== false,
    defaultAbutmentProductMode: normalizeDefaultAbutmentProductMode(
      settings?.defaultAbutmentProductMode,
    ),
    autoMatchBudget: resolveAutoMatchBudgetOrDefaults(null, catalog),
    abutsLabFeeCatalog: catalog,
    updatedAt: settings?.updatedAt || null,
  };
};

export async function getPracticeTransferSettings(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (role !== "practice" && role !== "requestor" && role !== "admin") {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const anchorId = String(req.user?.businessAnchorId || "").trim();
    if (!anchorId || !Types.ObjectId.isValid(anchorId)) {
      return res.status(400).json({
        success: false,
        message: "practice 사업자 정보가 필요합니다.",
      });
    }

    const anchor = await BusinessAnchor.findById(anchorId)
      .select({ practiceTransferSettings: 1 })
      .lean();

    if (!anchor) {
      return res.status(404).json({
        success: false,
        message: "practice 사업자 정보를 찾을 수 없습니다.",
      });
    }

    return res.status(200).json({
      success: true,
      data: await toSettingsResponse(anchor, { persistHydrated: true }),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "practice 전송 설정 조회 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

export async function upsertPracticeTransferSettings(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (role !== "practice" && role !== "requestor" && role !== "admin") {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const anchorId = String(req.user?.businessAnchorId || "").trim();
    if (!anchorId || !Types.ObjectId.isValid(anchorId)) {
      return res.status(400).json({
        success: false,
        message: "practice 사업자 정보가 필요합니다.",
      });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const hasArrivalDefaultDays = Object.prototype.hasOwnProperty.call(body, "arrivalDefaultDays");
    const hasProsthesisTypes = Object.prototype.hasOwnProperty.call(body, "prosthesisTypes");
    const hasMemoSnippets = Object.prototype.hasOwnProperty.call(body, "memoSnippets");
    const hasImplantFavorites = Object.prototype.hasOwnProperty.call(body, "implantFavorites");
    const hasAbutmentFavorites = Object.prototype.hasOwnProperty.call(body, "abutmentFavorites");
    const hasPromoNoticeDismissedAt = Object.prototype.hasOwnProperty.call(body, "promoNoticeDismissedAt");
    const hasSkipDesignConfirm = Object.prototype.hasOwnProperty.call(body, "skipDesignConfirm");
    const hasSkipJig = Object.prototype.hasOwnProperty.call(body, "skipJig");
    const hasDefaultAbutmentProductMode = Object.prototype.hasOwnProperty.call(
      body,
      "defaultAbutmentProductMode",
    );

    const setPatch = {
      "practiceTransferSettings.updatedAt": new Date(),
    };

    if (hasArrivalDefaultDays) {
      setPatch["practiceTransferSettings.arrivalDefaultDays"] = normalizeArrivalDefaultDays(body.arrivalDefaultDays);
    }
    if (hasProsthesisTypes) {
      setPatch["practiceTransferSettings.prosthesisTypes"] = normalizeProsthesisTypes(body.prosthesisTypes);
    }
    if (hasMemoSnippets) {
      setPatch["practiceTransferSettings.memoSnippets"] = normalizeMemoSnippets(body.memoSnippets);
    }
    if (hasImplantFavorites) {
      setPatch["practiceTransferSettings.implantFavorites"] =
        await hydrateFavoritesWithRoundBarAdopted(
          anchorId,
          normalizeImplantFavorites(body.implantFavorites),
        );
    }
    if (hasAbutmentFavorites) {
      setPatch["practiceTransferSettings.abutmentFavorites"] = normalizeAbutmentFavorites(body.abutmentFavorites);
    }
    if (hasPromoNoticeDismissedAt) {
      const raw = body.promoNoticeDismissedAt;
      if (!raw) {
        setPatch["practiceTransferSettings.promoNoticeDismissedAt"] = null;
      } else {
        const parsed = new Date(raw);
        setPatch["practiceTransferSettings.promoNoticeDismissedAt"] =
          Number.isNaN(parsed.getTime()) ? new Date() : parsed;
      }
    }
    if (hasSkipDesignConfirm) {
      setPatch["practiceTransferSettings.skipDesignConfirm"] = !(
        body.skipDesignConfirm === false ||
        body.skipDesignConfirm === "false" ||
        body.skipDesignConfirm === 0 ||
        body.skipDesignConfirm === "0"
      );
    }
    if (hasSkipJig) {
      setPatch["practiceTransferSettings.skipJig"] = !(
        body.skipJig === false ||
        body.skipJig === "false" ||
        body.skipJig === 0 ||
        body.skipJig === "0"
      );
    }
    if (hasDefaultAbutmentProductMode) {
      setPatch["practiceTransferSettings.defaultAbutmentProductMode"] =
        normalizeDefaultAbutmentProductMode(body.defaultAbutmentProductMode);
    }

    const anchor = await BusinessAnchor.findByIdAndUpdate(
      new Types.ObjectId(anchorId),
      {
        $set: setPatch,
      },
      {
        new: true,
        upsert: false,
      },
    )
      .select({ practiceTransferSettings: 1 })
      .lean();

    if (!anchor) {
      return res.status(404).json({
        success: false,
        message: "practice 사업자 정보를 찾을 수 없습니다.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "practice 전송 설정을 저장했습니다.",
      data: await toSettingsResponse(anchor),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "practice 전송 설정 저장 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

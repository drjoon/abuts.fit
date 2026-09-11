import { Types } from "mongoose";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import { hydrateFavoritesWithRoundBarAdopted } from "./roundBarAbutmentRequest.controller.js";
import { normalizeAdoptedKind, isImplantAddRequest, IMPLANT_ADD_REQUEST_OPTION, expandImplantFavoriteList } from "../../utils/roundBarAbutment.js";
import {
  loadAutoMatchBudgetCatalog,
  resolveAutoMatchBudgetOrDefaults,
} from "../../utils/practiceTransferAutoMatchBudget.js";
import { resolveAutoMatchEligibleStarBand, collectOwnOneStarBlockedLabAnchorIds } from "../../utils/practiceLabRating.js";
import { loadStarBandEligibleLabAnchorIds } from "../../utils/practiceTransferAutoMatch.js";

// related files:
// - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
// - web/backend/models/businessAnchor.model.js
// - web/backend/controllers/practiceTransfers/roundBarAbutmentRequest.controller.js
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - 2026-09-11: shadeFavorites — 치아 카드 직접 입력 쉐이드 계정 저장.
// - 2026-08-14: autoMatchBudget(자동매칭 기공비 min/max).
// - 2026-08-14: autoMatchMinLabRating(자동매칭 최소 별·2nd chance).
// - 2026-08-16: autoMatchBudget version3 — minPct/maxPct.
// - 2026-08-16: v4 고정가. GET은 최소 별점으로 budget 조립. autoMatchBudget PATCH 무시.
// - 2026-08-21: 임플란트 추가 요청 프리셋 type을 옵션명으로 정규화(레거시 헥스 포함).
// - 2026-08-16: autoMatchMaxLabRating(하한·상한 치과 설정, 기본 3~4).
// - 2026-08-25: labArrivalDefaults(기공소별 주문→치과도착 기본 일수).
// - 2026-08-28: calendarNewRequestHintDismissedAt(도착일 클릭 신규의뢰 안내 닫음).
// - 2026-09-07: archBulkProsthesisTypes(전체치열 모달 좌측 목록·순서).
// - 2026-09-07: requestStagePresets(다단계 기공의뢰 단계 프리셋).
import {
  normalizeRequestStagePresets,
} from "../../utils/practiceRequestStagePresets.js";
const DEFAULT_ARRIVAL_DEFAULT_DAYS = 7;
const MAX_LAB_ARRIVAL_DEFAULTS = 80;
const ABUTMENT_PRODUCT_MODE_PRODUCTION = "custom_abutment";
const ABUTMENT_PRODUCT_MODE_DESIGN_AND_PRODUCTION = "design_custom_abutment";
const DEFAULT_ABUTMENT_PRODUCT_MODE = ABUTMENT_PRODUCT_MODE_PRODUCTION;
const DEFAULT_PROSTHESIS_TYPES = [
  "인레이",
  "크라운",
  "커스텀어벗",
  "브리지",
  "유지장치",
  "임시치아",
];
const DEFAULT_ARCH_BULK_PROSTHESIS_TYPES = [
  "전체틀니",
  "부분틀니",
  "랩어라운드",
];
const MAX_ARCH_BULK_PROSTHESIS_TYPES = 20;
const MAX_MEMO_SNIPPETS = 40;
const MAX_SHADE_FAVORITES = 24;
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

const normalizeArchBulkProsthesisTypes = (items) => {
  const list = Array.isArray(items) ? items : [];
  const dedup = new Map();

  for (const item of list) {
    const trimmed = String(item || "").trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!dedup.has(key)) dedup.set(key, trimmed);
  }

  const out = Array.from(dedup.values()).slice(0, MAX_ARCH_BULK_PROSTHESIS_TYPES);
  return out.length ? out : [...DEFAULT_ARCH_BULK_PROSTHESIS_TYPES];
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

const SHADE_PRESET_KEYS = new Set(["a2", "a3", "a1", "a3.5"]);

const normalizeShadeFavorites = (items) => {
  const list = Array.isArray(items) ? items : [];
  const dedup = new Map();

  for (const item of list) {
    const trimmed = String(item || "").trim().slice(0, 24);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    // 프리셋(A2·A3·A1·A3.5)은 드롭다운 고정 — 즐겨찾기에 중복 저장하지 않음
    if (SHADE_PRESET_KEYS.has(key)) continue;
    if (!dedup.has(key)) dedup.set(key, trimmed);
  }

  return Array.from(dedup.values()).slice(0, MAX_SHADE_FAVORITES);
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
    const id = String(row.id || "").trim() || `imp-${out.length + 1}`;
    const roundBarRequestId = String(row.roundBarRequestId || "").trim();
    const roundBar = Boolean(row.roundBar) || Boolean(roundBarRequestId);
    const implantAddRequest =
      Boolean(row.implantAddRequest) ||
      isImplantAddRequest({ brand, type, implantAddRequest: row.implantAddRequest });
    const normalizedType = implantAddRequest ? IMPLANT_ADD_REQUEST_OPTION : type;
    const key = `${manufacturer}|${brand}|${family}|${normalizedType}`.toLowerCase();
    const nextRow = {
      id,
      manufacturer,
      brand,
      family,
      type: normalizedType,
      roundBar: roundBar || implantAddRequest || Boolean(row.isPublic),
      implantAddRequest: implantAddRequest || undefined,
      adopted: Boolean(row.adopted),
      adoptedKind: normalizeAdoptedKind(row.adoptedKind),
      isPublic: Boolean(row.isPublic) || undefined,
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

  return expandImplantFavoriteList(out);
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

const normalizeLabArrivalDefaults = (items) => {
  const list = Array.isArray(items) ? items : [];
  const byId = new Map();

  for (const raw of list) {
    const row = raw && typeof raw === "object" ? raw : {};
    const labAnchorId = String(row.labAnchorId || "").trim();
    if (!Types.ObjectId.isValid(labAnchorId)) continue;
    const updatedAtRaw = row.updatedAt ? new Date(row.updatedAt) : new Date();
    byId.set(labAnchorId, {
      labAnchorId: new Types.ObjectId(labAnchorId),
      labName: String(row.labName || "").trim().slice(0, 120),
      arrivalDefaultDays: normalizeArrivalDefaultDays(row.arrivalDefaultDays),
      updatedAt: Number.isNaN(updatedAtRaw.getTime()) ? new Date() : updatedAtRaw,
    });
  }

  return Array.from(byId.values())
    .sort((a, b) => {
      const at = a.updatedAt?.getTime?.() || 0;
      const bt = b.updatedAt?.getTime?.() || 0;
      return bt - at;
    })
    .slice(0, MAX_LAB_ARRIVAL_DEFAULTS);
};

const mergeLabArrivalDefault = (existingItems, patch) => {
  const row = patch && typeof patch === "object" ? patch : {};
  const labAnchorId = String(row.labAnchorId || "").trim();
  if (!Types.ObjectId.isValid(labAnchorId)) {
    return normalizeLabArrivalDefaults(existingItems);
  }
  const current = normalizeLabArrivalDefaults(existingItems);
  const nextRow = {
    labAnchorId,
    labName: String(row.labName || "").trim().slice(0, 120),
    arrivalDefaultDays: normalizeArrivalDefaultDays(row.arrivalDefaultDays),
    updatedAt: new Date().toISOString(),
  };
  const without = current.filter(
    (item) => String(item.labAnchorId || "") !== labAnchorId,
  );
  return normalizeLabArrivalDefaults([nextRow, ...without]);
};

const serializeLabArrivalDefaults = (items) =>
  normalizeLabArrivalDefaults(items).map((row) => ({
    labAnchorId: String(row.labAnchorId || ""),
    labName: String(row.labName || "").trim(),
    arrivalDefaultDays: normalizeArrivalDefaultDays(row.arrivalDefaultDays),
    updatedAt: row.updatedAt
      ? new Date(row.updatedAt).toISOString()
      : null,
  }));

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
  const calendarNewRequestHintDismissedAt = settings?.calendarNewRequestHintDismissedAt
    ? new Date(settings.calendarNewRequestHintDismissedAt).toISOString()
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
  const starBand = resolveAutoMatchEligibleStarBand({
    minStars: settings?.autoMatchMinLabRating,
    maxStars: settings?.autoMatchMaxLabRating,
  });
  const practiceLabRatings = Array.isArray(anchor?.practiceLabRatings)
    ? anchor.practiceLabRatings
    : [];
  // 별점 구간만. 우리치과 1점은 검색에 남기고 주문만 막음 → ownOneStarBlockedLabAnchorIds.
  const starBandEligibleLabAnchorIds = (
    await loadStarBandEligibleLabAnchorIds(starBand)
  ).map((id) => String(id));
  const ownOneStarBlockedLabAnchorIds =
    collectOwnOneStarBlockedLabAnchorIds(practiceLabRatings);

  return {
    arrivalDefaultDays: normalizeArrivalDefaultDays(settings?.arrivalDefaultDays),
    labArrivalDefaults: serializeLabArrivalDefaults(settings?.labArrivalDefaults),
    prosthesisTypes: normalizeProsthesisTypes(settings?.prosthesisTypes),
    archBulkProsthesisTypes: normalizeArchBulkProsthesisTypes(
      settings?.archBulkProsthesisTypes,
    ),
    requestStagePresets: normalizeRequestStagePresets(
      settings?.requestStagePresets,
    ),
    memoSnippets: normalizeMemoSnippets(settings?.memoSnippets),
    shadeFavorites: normalizeShadeFavorites(settings?.shadeFavorites),
    implantFavorites,
    abutmentFavorites: normalizeAbutmentFavorites(settings?.abutmentFavorites),
    promoNoticeDismissedAt,
    calendarNewRequestHintDismissedAt,
    skipDesignConfirm: true,
    skipJig: settings?.skipJig !== false,
    defaultAbutmentProductMode: normalizeDefaultAbutmentProductMode(
      settings?.defaultAbutmentProductMode,
    ),
    autoMatchMinLabRating: starBand.minStars,
    autoMatchMaxLabRating: starBand.maxStars,
    starBandEligibleLabAnchorIds,
    ownOneStarBlockedLabAnchorIds,
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
      .select({ practiceTransferSettings: 1, practiceLabRatings: 1 })
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
    const hasLabArrivalDefaults = Object.prototype.hasOwnProperty.call(body, "labArrivalDefaults");
    const hasLabArrivalDefault = Object.prototype.hasOwnProperty.call(body, "labArrivalDefault");
    const hasProsthesisTypes = Object.prototype.hasOwnProperty.call(body, "prosthesisTypes");
    const hasArchBulkProsthesisTypes = Object.prototype.hasOwnProperty.call(
      body,
      "archBulkProsthesisTypes",
    );
    const hasRequestStagePresets = Object.prototype.hasOwnProperty.call(
      body,
      "requestStagePresets",
    );
    const hasMemoSnippets = Object.prototype.hasOwnProperty.call(body, "memoSnippets");
    const hasShadeFavorites = Object.prototype.hasOwnProperty.call(body, "shadeFavorites");
    const hasImplantFavorites = Object.prototype.hasOwnProperty.call(body, "implantFavorites");
    const hasAbutmentFavorites = Object.prototype.hasOwnProperty.call(body, "abutmentFavorites");
    const hasPromoNoticeDismissedAt = Object.prototype.hasOwnProperty.call(body, "promoNoticeDismissedAt");
    const hasCalendarNewRequestHintDismissedAt = Object.prototype.hasOwnProperty.call(
      body,
      "calendarNewRequestHintDismissedAt",
    );
    const hasSkipDesignConfirm = Object.prototype.hasOwnProperty.call(body, "skipDesignConfirm");
    const hasSkipJig = Object.prototype.hasOwnProperty.call(body, "skipJig");
    const hasDefaultAbutmentProductMode = Object.prototype.hasOwnProperty.call(
      body,
      "defaultAbutmentProductMode",
    );
    const hasAutoMatchMinLabRating = Object.prototype.hasOwnProperty.call(
      body,
      "autoMatchMinLabRating",
    );
    const hasAutoMatchMaxLabRating = Object.prototype.hasOwnProperty.call(
      body,
      "autoMatchMaxLabRating",
    );

    const setPatch = {
      "practiceTransferSettings.updatedAt": new Date(),
    };

    if (hasArrivalDefaultDays) {
      setPatch["practiceTransferSettings.arrivalDefaultDays"] = normalizeArrivalDefaultDays(body.arrivalDefaultDays);
    }
    if (hasLabArrivalDefaults || hasLabArrivalDefault) {
      const existing = await BusinessAnchor.findById(anchorId)
        .select({ "practiceTransferSettings.labArrivalDefaults": 1 })
        .lean();
      const currentRows = existing?.practiceTransferSettings?.labArrivalDefaults;
      const nextRows = hasLabArrivalDefaults
        ? normalizeLabArrivalDefaults(body.labArrivalDefaults)
        : mergeLabArrivalDefault(currentRows, body.labArrivalDefault);
      setPatch["practiceTransferSettings.labArrivalDefaults"] = nextRows;
    }
    if (hasProsthesisTypes) {
      setPatch["practiceTransferSettings.prosthesisTypes"] = normalizeProsthesisTypes(body.prosthesisTypes);
    }
    if (hasArchBulkProsthesisTypes) {
      setPatch["practiceTransferSettings.archBulkProsthesisTypes"] =
        normalizeArchBulkProsthesisTypes(body.archBulkProsthesisTypes);
    }
    if (hasRequestStagePresets) {
      // 빈 배열 허용(의도적 삭제). null만 기본값으로 취급하므로 raw 배열을 넘김.
      setPatch["practiceTransferSettings.requestStagePresets"] =
        normalizeRequestStagePresets(
          Array.isArray(body.requestStagePresets)
            ? body.requestStagePresets
            : [],
        );
    }
    if (hasMemoSnippets) {
      setPatch["practiceTransferSettings.memoSnippets"] = normalizeMemoSnippets(body.memoSnippets);
    }
    if (hasShadeFavorites) {
      setPatch["practiceTransferSettings.shadeFavorites"] = normalizeShadeFavorites(
        body.shadeFavorites,
      );
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
    if (hasCalendarNewRequestHintDismissedAt) {
      const raw = body.calendarNewRequestHintDismissedAt;
      if (!raw) {
        setPatch["practiceTransferSettings.calendarNewRequestHintDismissedAt"] = null;
      } else {
        const parsed = new Date(raw);
        setPatch["practiceTransferSettings.calendarNewRequestHintDismissedAt"] =
          Number.isNaN(parsed.getTime()) ? new Date() : parsed;
      }
    }
    // 레거시: 디자인 컨펌 생략 옵션 삭제 — 항상 true로 고정. 설정 저장 시 false 무시.
    if (hasSkipDesignConfirm) {
      setPatch["practiceTransferSettings.skipDesignConfirm"] = true;
    }
    // 레거시(2026-08-22): skipJig 옵션 삭제 — 설정 저장 무시.
    void hasSkipJig;
    if (hasDefaultAbutmentProductMode) {
      setPatch["practiceTransferSettings.defaultAbutmentProductMode"] =
        normalizeDefaultAbutmentProductMode(body.defaultAbutmentProductMode);
    }
    if (hasAutoMatchMinLabRating || hasAutoMatchMaxLabRating) {
      const band = resolveAutoMatchEligibleStarBand({
        minStars: hasAutoMatchMinLabRating
          ? body.autoMatchMinLabRating
          : undefined,
        maxStars: hasAutoMatchMaxLabRating
          ? body.autoMatchMaxLabRating
          : undefined,
      });
      setPatch["practiceTransferSettings.autoMatchMinLabRating"] = band.minStars;
      setPatch["practiceTransferSettings.autoMatchMaxLabRating"] = band.maxStars;
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
      .select({ practiceTransferSettings: 1, practiceLabRatings: 1 })
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

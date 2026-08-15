// related files:
// - web/backend/models/practiceTransfer.model.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/backend/controllers/requests/creation.request.controller.js
// - web/backend/models/request.model.js
// - web/frontend/src/shared/practice/transferMemo.ts
// change-log:
// - 2026-08-15: PTX CA — 치과 멤버십/일반 생산단가·출고목표=기일-3영업일·묶음 우선. 디자인비는 기공소 지급 분리.
// - 2026-08-15: 지정 CA — 스캔 없이 수락 가능. 스캔은 수락 후 업로드 후 Request 생성.
// - 2026-08-15: 구강스캔 — 자동매칭은 치과 필수, 지정은 수락 기공소 업로드 허용.
// - 2026-08-15: Abuts-first — 수락 시 스캔(files)로 Request 생성, 기일 기준 스케줄, 디자인 컨펌 후 생산.
// - 2026-08-13: 치아별 abutmentProductMode(생산만/디자인+생산)를 어벗츠 의뢰 productMode로 전달.
import { Types } from "mongoose";
import Request from "../models/request.model.js";
import PracticeTransfer from "../models/practiceTransfer.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";
import User from "../models/user.model.js";
import {
  normalizeCaseInfosImplantFields,
  addKoreanBusinessDays,
  getTodayYmdInKst,
  toKstYmd,
  normalizeKoreanBusinessDay,
} from "../controllers/requests/utils.js";
import { calculateInitialProductionSchedule } from "../controllers/requests/production.utils.js";
import {
  countDesignAbutmentQty,
} from "../controllers/requests/designPrice.utils.js";
import { resolveQuotedPriceWithExpressFee } from "../controllers/requests/expressPrice.utils.js";
import { resolveSelectableShippingMode } from "../controllers/requests/expressSelectable.utils.js";
import { getManufacturerLeadTimesUtil } from "../controllers/businesses/leadTime.controller.js";
import { loadCreditSettingsDefaults } from "../utils/creditSettingsDefaults.js";
import {
  ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE,
  ABUTS_ABUTMENT_REGULAR_PRODUCTION_PRICE,
  pickAbutsAbutmentCreditPrices,
  resolveAbutsAbutmentPricingTier,
} from "../utils/abutsAbutmentService.js";
import { checkCreditLock } from "../utils/creditLock.util.js";
import { triggerDashboardSummaryRefreshForAnchorId } from "./requestSnapshotTriggers.service.js";
import { recomputeBulkShippingSnapshotForBusinessAnchorId } from "./bulkShippingSnapshot.service.js";
import { updateReviewStatusByStage } from "../controllers/requests/common.review.controller.js";
import { prevKoreanBusinessDayYmd } from "../utils/krBusinessDays.js";

const hasCustomAbutmentToothWorks = (toothWorks) =>
  (Array.isArray(toothWorks) ? toothWorks : []).some(
    (row) => Boolean(row?.customAbutment) && String(row?.toothNumber || "").trim(),
  );

const listCustomAbutmentToothWorks = (toothWorks) =>
  (Array.isArray(toothWorks) ? toothWorks : []).filter(
    (row) => Boolean(row?.customAbutment) && String(row?.toothNumber || "").trim(),
  );

const normalizeResultFiles = (raw) => {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((row) => {
      const file = row?.file && typeof row.file === "object" ? row.file : row;
      const originalName = String(
        file?.originalName || file?.name || row?.originalName || "",
      ).trim();
      const s3Key = String(file?.s3Key || file?.key || row?.s3Key || "").trim();
      if (!originalName || !s3Key) return null;
      return {
        patientName: String(row?.patientName || "").trim(),
        tooth: String(row?.tooth || "").trim(),
        file: {
          originalName,
          mimetype: String(
            file?.mimetype || row?.mimetype || "application/octet-stream",
          ).trim(),
          size: Number(file?.size || row?.size || 0) || 0,
          s3Key,
        },
      };
    })
    .filter(Boolean);
};

/** 자동매칭: 치과 전송 시 구강스캔 필수 */
export const ORAL_SCAN_REQUIRED_FOR_AUTO_MATCH_CREATE =
  "자동매칭으로 보낼 때는 구강스캔 파일을 첨부해주세요.";

/** 자동매칭 CA: 스캔 없이 수락 불가(치과 첨부만) */
export const ORAL_SCAN_REQUIRED_FROM_PRACTICE =
  "자동매칭 커스텀어벗 의뢰는 치과에서 구강스캔을 첨부해야 합니다.";

/** @deprecated 수락 기공소 CA 디자인 — 기공소 구강스캔 업로드 UI 없음 */
export const ORAL_SCAN_REQUIRED_FROM_LAB =
  "커스텀어벗 디자인을 위해 구강스캔 파일을 업로드해주세요.";

const makeOralScanError = (message, code) => {
  const err = new Error(message);
  err.code = code;
  err.statusCode = 409;
  return err;
};

/**
 * 커스텀어벗 수락 시 구강스캔 확보.
 * - 이미 transfer.files 있으면 그대로
 * - 자동매칭: 치과 첨부만 허용(기공소 body.files 무시·거절)
 * - 지정: 스캔 없이 수락 가능(레거시 body.files 첨부는 허용)
 */
export function resolveOralScanFilesForAccept({
  transferDoc,
  incomingFiles = null,
} = {}) {
  const existing = normalizeResultFiles(transferDoc?.files);
  if (!hasCustomAbutmentToothWorks(transferDoc?.toothWorks)) {
    return { files: existing, attachedByLab: false };
  }
  if (existing.length > 0) {
    return { files: existing, attachedByLab: false };
  }

  const isAuto = String(transferDoc?.matchingMode || "").trim() === "auto";
  const incoming = normalizeResultFiles(incomingFiles);

  if (isAuto) {
    throw makeOralScanError(
      ORAL_SCAN_REQUIRED_FROM_PRACTICE,
      "oral_scan_required_from_practice",
    );
  }

  if (incoming.length === 0) {
    return { files: [], attachedByLab: false };
  }

  return { files: incoming, attachedByLab: true };
}

/** 자동매칭 생성 시 구강스캔 필수 */
export function assertOralScanFilesForCreate({
  matchingMode,
  toothWorks,
  files,
} = {}) {
  if (String(matchingMode || "").trim() !== "auto") return;
  const list = normalizeResultFiles(files);
  if (list.length > 0) return;
  const err = makeOralScanError(
    ORAL_SCAN_REQUIRED_FOR_AUTO_MATCH_CREATE,
    "oral_scan_required_for_auto_match",
  );
  err.statusCode = 400;
  throw err;
}

const parsePatientNameFromMemo = (memo) => {
  const raw = String(memo || "").trim();
  const matched = raw.match(/\[\s*환자명\s*:\s*([^\]]+)\]/i);
  return String(matched?.[1] || "").trim();
};

const parseArrivalYmdFromMemo = (memo) => {
  const raw = String(memo || "").trim();
  const matched = raw.match(
    /\[\s*(?:치과도착일|도착일)\s*:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\s*\]/i,
  );
  return String(matched?.[1] || "").trim() || null;
};

const pickFileForTooth = (files, toothNumber, index) => {
  const tooth = String(toothNumber || "").trim();
  if (tooth) {
    const byTooth = files.find((f) => String(f?.tooth || "").trim() === tooth);
    if (byTooth) return byTooth;
  }
  if (files[index]) return files[index];
  return files[0] || null;
};

const resolveLabRequestorUserId = async ({ transferDoc, fallbackUserId }) => {
  const completedBy = String(transferDoc?.autoMatch?.completedBy || "").trim();
  if (completedBy && Types.ObjectId.isValid(completedBy)) return completedBy;

  const acceptedBy = String(transferDoc?.requestorDownloadedBy || "").trim();
  if (acceptedBy && Types.ObjectId.isValid(acceptedBy)) return acceptedBy;

  const labAnchorId = String(transferDoc?.targetLabAnchorId || "").trim();
  if (labAnchorId && Types.ObjectId.isValid(labAnchorId)) {
    const owner = await User.findOne({
      role: "requestor",
      businessAnchorId: new Types.ObjectId(labAnchorId),
      subRole: "owner",
    })
      .select({ _id: 1 })
      .lean();
    if (owner?._id) return String(owner._id);
  }

  const fallback = String(fallbackUserId || "").trim();
  if (fallback && Types.ObjectId.isValid(fallback)) return fallback;
  return null;
};

const ymdToUtcNoonMs = (ymd) => {
  const m = String(ymd || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d) return null;
  return Date.UTC(y, mo - 1, d, 12);
};

/**
 * 제조사 출고 목표 = 치과도착일 − 3영업일
 * (= 기공작업 종료일(도착−2) − 1영업일).
 */
export async function resolveManufacturerTargetShipYmd(arrivalYmd) {
  let ymd = String(arrivalYmd || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  for (let i = 0; i < 3; i += 1) {
    ymd = await prevKoreanBusinessDayYmd({ fromYmd: ymd });
  }
  return ymd;
}

/**
 * PTX CA 어벗츠 생산 몫 견적(관리자·제조 의뢰비 표시).
 * 치과 청구(디자인+생산)와 분리: 멤버십 치과 2.5만 → 어벗츠 생산 1.5만 + 기공소 디자인 1만.
 * 배송 3,500은 치과→어벗츠. 제조사 정산 장부: 의뢰 9,900 + 배송 3,850(VAT 포함).
 */
export function buildPtxAbutsProductionQuote({
  creditSettings,
  pricingTier = "regular",
  shippingMode,
  abutmentQty = 1,
  expressFeePerRequest = 2000,
  quotedAt = new Date(),
}) {
  const picked = pickAbutsAbutmentCreditPrices(creditSettings || {}, pricingTier);
  const unit = Math.max(
    0,
    Number(picked.productionPrice) ||
      (pricingTier === "membership"
        ? ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE
        : ABUTS_ABUTMENT_REGULAR_PRODUCTION_PRICE),
  );
  const practiceUnit = Math.max(
    0,
    Number(picked.designAndProductionPrice) || unit,
  );
  const qty = Math.max(1, Math.floor(Number(abutmentQty) || 1));
  const tier = pricingTier === "membership" ? "membership" : "regular";
  const base = {
    baseAmount: unit,
    discountAmount: 0,
    amount: unit * qty,
    currency: "KRW",
    rule:
      tier === "membership"
        ? "ptx_abuts_production_membership"
        : "ptx_abuts_production_regular",
    designFee: null,
    abutmentQty: qty,
    quotedAt,
    discountMeta: {
      pricingTier: tier,
      // 치과 지불(디자인+생산) vs 어벗츠 생산 수취 vs 기공소 디자인비
      practiceDesignAndProductionUnit: practiceUnit,
      abutsProductionUnit: unit,
      labDesignFeeUnit: Math.max(0, practiceUnit - unit),
    },
  };
  return resolveQuotedPriceWithExpressFee({
    price: base,
    shippingMode,
    expressFee: expressFeePerRequest,
    expressQty: qty,
  });
}

async function resolvePracticePricingTierForTransfer(transferDoc) {
  const practiceId = String(transferDoc?.practiceBusinessAnchorId || "").trim();
  if (!practiceId || !Types.ObjectId.isValid(practiceId)) return "regular";
  const practice = await BusinessAnchor.findById(practiceId)
    .select({ practiceMembershipActive: 1 })
    .lean();
  return resolveAbutsAbutmentPricingTier({
    practiceMembershipActive: Boolean(practice?.practiceMembershipActive),
  });
}

/**
 * 제조사 출고 목표(기일−3영업일)에 맞추기 위한 shippingMode.
 * 묶음(normal) 우선. 목표를 못 맞추면 신속.
 */
export async function resolveShippingModeForPracticeTransferArrival({
  transferDoc,
  weeklyBatchDays = [],
  requestedAt = new Date(),
  maxDiameter = 8,
}) {
  const arrivalYmd = parseArrivalYmdFromMemo(transferDoc?.transferMemo);
  const targetYmd = arrivalYmd
    ? await resolveManufacturerTargetShipYmd(arrivalYmd)
    : null;
  const batchDays = Array.isArray(weeklyBatchDays) ? weeklyBatchDays : [];
  let preferred = "normal";

  try {
    const normalSchedule = await calculateInitialProductionSchedule({
      shippingMode: "normal",
      maxDiameter,
      requestedAt,
      weeklyBatchDays: batchDays,
      productMode: "design_custom_abutment",
    });
    const normalPickupYmd = normalSchedule?.scheduledShipPickup
      ? toKstYmd(normalSchedule.scheduledShipPickup)
      : null;
    const targetMs = targetYmd ? ymdToUtcNoonMs(targetYmd) : null;
    const normalMs = normalPickupYmd ? ymdToUtcNoonMs(normalPickupYmd) : null;
    if (targetMs != null && normalMs != null && normalMs > targetMs) {
      preferred = "express";
    }
  } catch {
    // keep normal preference
  }

  return resolveSelectableShippingMode({
    shippingMode: preferred,
    requestedAt,
    weeklyBatchDays: preferred === "normal" ? batchDays : [],
    maxDiameter,
    productMode: "design_custom_abutment",
  });
}

const clampScheduleToTarget = async (productionSchedule, targetYmd) => {
  if (!targetYmd || !productionSchedule) return productionSchedule;
  const targetMs = ymdToUtcNoonMs(targetYmd);
  if (targetMs == null) return productionSchedule;
  const next = { ...productionSchedule };
  const pickup = next.scheduledShipPickup
    ? new Date(next.scheduledShipPickup)
    : null;
  if (pickup && !Number.isNaN(pickup.getTime()) && pickup.getTime() > targetMs) {
    next.scheduledShipPickup = new Date(targetMs);
  }
  return next;
};

/**
 * 기공소 수락 시 커스텀어벗 → 어벗츠 디자인+생산 의뢰 생성.
 * 소스 파일 = PTX 구강스캔(files). productMode 고정 design_custom_abutment.
 */
export async function createAbutmentRequestsFromPracticeTransfer({
  transferDoc,
  shippingMode: shippingModeRaw = null,
  actorUserId = null,
}) {
  const customRows = listCustomAbutmentToothWorks(transferDoc?.toothWorks);
  if (customRows.length === 0) {
    return { created: [], skippedReason: "no_custom_abutment", requestIds: [] };
  }

  const existingIds = Array.isArray(transferDoc?.production?.relatedRequestIds)
    ? transferDoc.production.relatedRequestIds
        .map((id) => String(id || "").trim())
        .filter((id) => Types.ObjectId.isValid(id))
    : [];
  if (existingIds.length > 0) {
    return {
      created: [],
      skippedReason: "already_created",
      requestIds: existingIds,
    };
  }

  const scanFiles = normalizeResultFiles(transferDoc?.files);
  if (scanFiles.length === 0) {
    const isAuto = String(transferDoc?.matchingMode || "").trim() === "auto";
    if (isAuto) {
      throw makeOralScanError(
        ORAL_SCAN_REQUIRED_FROM_PRACTICE,
        "oral_scan_required_from_practice",
      );
    }
    // 지정 기공소: 수락 후 스캔 업로드 가능 — CA Request는 스캔 확보 시 생성
    return {
      created: [],
      skippedReason: "awaiting_oral_scan",
      requestIds: [],
      shippingMode: null,
    };
  }

  const labAnchorId = String(transferDoc?.targetLabAnchorId || "").trim();
  if (!labAnchorId || !Types.ObjectId.isValid(labAnchorId)) {
    throw new Error("기공소 정보가 없어 어벗츠 의뢰를 생성할 수 없습니다.");
  }

  const lockStatus = await checkCreditLock(labAnchorId);
  if (lockStatus.isLocked) {
    throw new Error(
      `기공소 크레딧 사용이 제한되어 있습니다. 사유: ${lockStatus.reason || "-"}`,
    );
  }

  const labOrg = await BusinessAnchor.findById(labAnchorId)
    .select({
      name: 1,
      "shippingPolicy.weeklyBatchDays": 1,
      "requestSettings.anodizingEnabled": 1,
    })
    .lean();

  const weeklyBatchDays = Array.isArray(labOrg?.shippingPolicy?.weeklyBatchDays)
    ? labOrg.shippingPolicy.weeklyBatchDays
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    : [];
  const anodizingEnabled =
    typeof labOrg?.requestSettings?.anodizingEnabled === "boolean"
      ? labOrg.requestSettings.anodizingEnabled
      : true;

  const requestedAt = new Date();
  const shippingMode =
    shippingModeRaw === "express" || shippingModeRaw === "normal"
      ? await resolveSelectableShippingMode({
          shippingMode: shippingModeRaw,
          requestedAt,
          weeklyBatchDays: shippingModeRaw === "normal" ? weeklyBatchDays : [],
          productMode: "design_custom_abutment",
        })
      : await resolveShippingModeForPracticeTransferArrival({
          transferDoc,
          weeklyBatchDays,
          requestedAt,
        });

  const labUserId = await resolveLabRequestorUserId({
    transferDoc,
    fallbackUserId: actorUserId,
  });
  if (!labUserId) {
    throw new Error("기공소 의뢰자 계정을 찾지 못해 어벗츠 의뢰를 생성할 수 없습니다.");
  }

  const practiceAnchor = transferDoc?.practiceBusinessAnchorId
    ? await BusinessAnchor.findById(transferDoc.practiceBusinessAnchorId)
        .select({ name: 1 })
        .lean()
    : null;
  const clinicName =
    String(practiceAnchor?.name || "").trim() ||
    String(labOrg?.name || "").trim() ||
    "치과";
  const patientNameFallback =
    parsePatientNameFromMemo(transferDoc?.transferMemo) ||
    String(scanFiles[0]?.patientName || "").trim() ||
    "환자";
  const arrivalYmd = parseArrivalYmdFromMemo(transferDoc?.transferMemo);
  const targetShipYmd = arrivalYmd
    ? await resolveManufacturerTargetShipYmd(arrivalYmd)
    : null;

  const billing =
    transferDoc?.billing && typeof transferDoc.billing === "object"
      ? transferDoc.billing
      : {};
  const isTradingPartner = Boolean(billing.isTradingPartner);
  const abutmentQty = Math.max(0, Number(billing.abutmentQty || 0) || 0);
  const abutmentRetailTotal = Math.max(
    0,
    Number(billing.abutmentRetailTotal || 0) || 0,
  );
  const practicePrepaidAbutment = abutmentQty > 0 || abutmentRetailTotal > 0;

  let expressFeePerRequest = 2000;
  let creditSettingsForQuote = {};
  try {
    creditSettingsForQuote = await loadCreditSettingsDefaults({
      requestorOrgId: labAnchorId,
    });
    expressFeePerRequest = Math.max(
      0,
      Number(creditSettingsForQuote?.expressFee ?? 2000) || 2000,
    );
  } catch {
    expressFeePerRequest = 2000;
    creditSettingsForQuote = {};
  }

  const pricingTier = await resolvePracticePricingTierForTransfer(transferDoc);

  const manufacturerSettings = await getManufacturerLeadTimesUtil();
  const leadTimes = manufacturerSettings?.leadTimes || {};
  const created = [];

  for (let i = 0; i < customRows.length; i += 1) {
    const row = customRows[i];
    const tooth = String(row.toothNumber || "").trim();
    const scanFile = pickFileForTooth(scanFiles, tooth, i);
    if (!scanFile?.file?.s3Key) {
      throw new Error(`치아 #${tooth} 구강스캔 파일을 찾지 못했습니다.`);
    }

    const patientName =
      String(scanFile.patientName || "").trim() || patientNameFallback;
    const implantManufacturer = String(row.implantManufacturer || "").trim();
    const implantBrand = String(row.implantBrand || "").trim();
    const implantFamily = String(row.implantFamily || "").trim();
    const implantType = String(row.implantType || "").trim();
    if (!implantManufacturer || !implantBrand || !implantFamily || !implantType) {
      throw new Error(
        `치아 #${tooth} 임플란트 규격(Manufacturer/Brand/Family/Type)이 부족합니다.`,
      );
    }

    // Abuts-first: 워크플로(디자인 큐/핸드오프)는 design_custom_abutment 유지.
    // 과금은 생산만(멤버십 1.5만) — 디자인은 기공소 외주(abutmentDesignLabFee).
    const productMode = "design_custom_abutment";

    const diameterRaw = String(row.abutmentDiameter || "").trim();
    const diameterNum = Number(diameterRaw.replace(/[^\d.]/g, ""));
    const maxDiameter =
      Number.isFinite(diameterNum) && diameterNum > 0 ? diameterNum : undefined;

    const caseInfosRaw = {
      clinicName,
      patientName,
      tooth,
      workType: "abutment",
      productMode,
      implantManufacturer,
      implantBrand,
      implantFamily,
      implantType,
      abutmentManufacturer: String(row.abutmentManufacturer || "").trim() || undefined,
      abutmentDiameter: diameterRaw || undefined,
      abutmentHeight: String(row.abutmentHeight || "").trim() || undefined,
      maxDiameter,
      anodizingEnabled,
      file: {
        originalName: scanFile.file.originalName,
        mimetype: scanFile.file.mimetype,
        size: scanFile.file.size,
        s3Key: scanFile.file.s3Key,
      },
      toothWorks: [row],
    };

    const normalizedCaseInfos =
      await normalizeCaseInfosImplantFields(caseInfosRaw);

    const abutmentQty = Math.max(
      1,
      countDesignAbutmentQty(normalizedCaseInfos) || 1,
    );
    const quotedPrice = buildPtxAbutsProductionQuote({
      creditSettings: creditSettingsForQuote,
      pricingTier,
      shippingMode,
      abutmentQty,
      expressFeePerRequest,
      quotedAt: requestedAt,
    });

    let productionSchedule = await calculateInitialProductionSchedule({
      shippingMode,
      maxDiameter: normalizedCaseInfos?.maxDiameter,
      requestedAt,
      weeklyBatchDays: shippingMode === "normal" ? weeklyBatchDays : [],
      productMode,
    });
    productionSchedule = await clampScheduleToTarget(
      productionSchedule,
      targetShipYmd,
    );

    const createdYmd = toKstYmd(requestedAt) || getTodayYmdInKst();
    const pickupYmd = productionSchedule?.scheduledShipPickup
      ? toKstYmd(productionSchedule.scheduledShipPickup)
      : null;

    let estimatedShipYmdRaw = pickupYmd || targetShipYmd || arrivalYmd;
    if (!estimatedShipYmdRaw) {
      const d =
        typeof normalizedCaseInfos?.maxDiameter === "number" &&
        !Number.isNaN(normalizedCaseInfos.maxDiameter)
          ? normalizedCaseInfos.maxDiameter
          : 8;
      let diameterKey = "d8";
      if (d <= 6) diameterKey = "d6";
      else if (d <= 8) diameterKey = "d8";
      else if (d <= 10) diameterKey = "d10";
      else diameterKey = "d12";
      const leadDays = leadTimes[diameterKey]?.minBusinessDays ?? 1;
      estimatedShipYmdRaw = await addKoreanBusinessDays({
        startYmd: createdYmd,
        days: Math.max(1, leadDays),
      });
    }

    if (targetShipYmd) {
      const targetMs = ymdToUtcNoonMs(targetShipYmd);
      const estMs = ymdToUtcNoonMs(estimatedShipYmdRaw);
      if (targetMs != null && estMs != null && estMs > targetMs) {
        estimatedShipYmdRaw = targetShipYmd;
      }
    }

    const estimatedShipYmd = await normalizeKoreanBusinessDay({
      ymd: estimatedShipYmdRaw,
    });

    const newRequest = new Request({
      caseInfos: {
        ...normalizedCaseInfos,
        reviewByStage: {
          request: {
            status: "PENDING",
            updatedAt: requestedAt,
            updatedBy: labUserId,
            reason: "",
          },
        },
      },
      requestor: labUserId,
      businessAnchorId: labAnchorId,
      price: quotedPrice,
      shippingMode,
      originalShipping: { mode: shippingMode, requestedAt },
      finalShipping: { mode: shippingMode, updatedAt: requestedAt },
      productionSchedule,
      manufacturerStage: "준비",
      partnerBilling: {
        practicePrepaidAbutment,
        isTradingPartner,
        labTradingPartnerId: billing.labTradingPartnerId || null,
        relatedPracticeTransferId: transferDoc._id,
        billingOwnerAnchorId: isTradingPartner ? labAnchorId : null,
        labDesignedAbutment: true,
        practiceBusinessAnchorId:
          transferDoc.practiceBusinessAnchorId || null,
      },
      timeline: {
        originalEstimatedShipYmd: estimatedShipYmd,
        nextEstimatedShipYmd: estimatedShipYmd,
        estimatedShipYmd,
      },
    });

    await newRequest.save();
    created.push(newRequest);
  }

  try {
    await triggerDashboardSummaryRefreshForAnchorId(labAnchorId);
  } catch {
    // best-effort
  }
  try {
    await recomputeBulkShippingSnapshotForBusinessAnchorId(labAnchorId);
  } catch {
    // best-effort
  }

  return {
    created,
    skippedReason: null,
    requestIds: created.map((doc) => String(doc._id)),
    shippingMode,
  };
}

/**
 * CA 포함이면 Request 생성(이미 있으면 no-op) 후 production.relatedRequestIds·shippingMode 갱신.
 */
export async function ensureAbutmentRequestsOnAccept({
  transferDoc,
  actorUserId = null,
}) {
  if (!hasCustomAbutmentToothWorks(transferDoc?.toothWorks)) {
    return { created: false, requestIds: [], shippingMode: null };
  }

  const result = await createAbutmentRequestsFromPracticeTransfer({
    transferDoc,
    actorUserId,
  });
  if (result.skippedReason === "awaiting_oral_scan") {
    return {
      created: false,
      skippedReason: "awaiting_oral_scan",
      requestIds: [],
      shippingMode: null,
    };
  }
  if (result.skippedReason === "no_custom_abutment") {
    return { created: false, requestIds: [], shippingMode: null };
  }

  const requestIds = Array.isArray(result.requestIds) ? result.requestIds : [];
  const shippingMode = result.shippingMode || transferDoc?.production?.shippingMode || null;

  const oidList = requestIds
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));

  transferDoc.production = {
    ...(transferDoc.production && typeof transferDoc.production === "object"
      ? transferDoc.production
      : {}),
    relatedRequestIds: oidList,
    ...(shippingMode ? { shippingMode } : {}),
  };
  await PracticeTransfer.updateOne(
    { _id: transferDoc._id },
    {
      $set: {
        "production.relatedRequestIds": oidList,
        ...(shippingMode ? { "production.shippingMode": shippingMode } : {}),
      },
    },
  );

  return {
    created: result.skippedReason !== "already_created" && requestIds.length > 0,
    skippedReason: result.skippedReason || null,
    requestIds,
    shippingMode,
  };
}

export function isAbutmentDesignReady(transferDoc) {
  const files = normalizeResultFiles(transferDoc?.production?.designFiles);
  return files.length > 0 || Boolean(transferDoc?.production?.designReadyAt);
}

/**
 * 기공소: 예전 Abuts 선디자인 정책에서 구강스캔 다운로드를 잠갔.
 * 수락 기공소가 디자인하는 현재 정책에서는 잠그지 않는다.
 */
export function shouldLockLabOralScanDownload(_transferDoc) {
  return false;
}

export function canStartAbutmentProduction(transferDoc) {
  if (!isAbutmentDesignReady(transferDoc)) return false;
  if (!transferDoc?.production?.labDesignConfirmedAt) return false;
  const skip = transferDoc?.production?.skipDesignConfirm !== false;
  if (skip) return true;
  return Boolean(
    transferDoc?.production?.practiceDesignConfirmedAt ||
      transferDoc?.production?.confirmedAt,
  );
}

const invokeMachiningApproval = (requestId, actorUserId) =>
  new Promise((resolve, reject) => {
    const fakeReq = {
      params: { id: String(requestId) },
      user: {
        role: "admin",
        _id: actorUserId || undefined,
      },
      body: {
        status: "APPROVED",
        stage: "machining",
        nextUpCamRunGuard: true,
        forceReprocess: false,
        approvalTriggerSource: "practice-transfer-design-confirm",
      },
      __designPartner: false,
    };
    const fakeRes = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        if ((this.statusCode || 200) >= 400) {
          reject(
            Object.assign(new Error(payload?.message || "가공 진입 실패"), {
              statusCode: this.statusCode,
              payload,
            }),
          );
        } else {
          resolve(payload);
        }
        return this;
      },
    };
    Promise.resolve(updateReviewStatusByStage(fakeReq, fakeRes)).catch(reject);
  });

/**
 * 디자인 컨펌 게이트 충족 시 연결 Request를 가공(생산) 단계로 진입.
 */
export async function tryStartAbutmentProduction({
  transferDoc,
  actorUserId = null,
}) {
  if (!canStartAbutmentProduction(transferDoc)) {
    return { started: false, reason: "gates_not_met" };
  }
  if (transferDoc?.production?.abutmentProductionStartedAt) {
    return { started: false, reason: "already_started" };
  }

  const requestIds = Array.isArray(transferDoc?.production?.relatedRequestIds)
    ? transferDoc.production.relatedRequestIds.map((id) => String(id || "").trim())
    : [];
  if (requestIds.length === 0) {
    return { started: false, reason: "no_requests" };
  }

  const startedIds = [];
  for (const requestId of requestIds) {
    if (!Types.ObjectId.isValid(requestId)) continue;
    const reqDoc = await Request.findById(requestId).select({
      manufacturerStage: 1,
      designCompletedAt: 1,
      "caseInfos.file": 1,
    });
    if (!reqDoc) continue;
    const stage = String(reqDoc.manufacturerStage || "").trim();
    if (stage !== "준비") {
      startedIds.push(requestId);
      continue;
    }
    if (!reqDoc.designCompletedAt && !reqDoc.caseInfos?.file?.s3Key) {
      continue;
    }
    await invokeMachiningApproval(requestId, actorUserId);
    startedIds.push(requestId);
  }

  if (startedIds.length === 0) {
    return { started: false, reason: "no_ready_requests" };
  }

  const now = new Date();
  transferDoc.production = {
    ...(transferDoc.production && typeof transferDoc.production === "object"
      ? transferDoc.production
      : {}),
    abutmentProductionStartedAt: now,
  };
  await PracticeTransfer.updateOne(
    { _id: transferDoc._id },
    { $set: { "production.abutmentProductionStartedAt": now } },
  );

  return { started: true, requestIds: startedIds };
}

/**
 * design-handoff 후 PTX에 디자인 파일 미러 (가공 진입은 컨펌 후).
 */
export async function mirrorDesignFileToPracticeTransfer({
  transferId,
  file,
  tooth = "",
  patientName = "",
}) {
  if (!transferId || !Types.ObjectId.isValid(String(transferId))) {
    return null;
  }
  const normalized = normalizeResultFiles([
    {
      patientName,
      tooth,
      file,
    },
  ]);
  if (normalized.length === 0) return null;

  const now = new Date();
  const doc = await PracticeTransfer.findByIdAndUpdate(
    transferId,
    {
      $set: {
        "production.designReadyAt": now,
      },
      $push: {
        "production.designFiles": { $each: normalized },
      },
    },
    { new: true },
  );
  return doc;
}

export {
  hasCustomAbutmentToothWorks,
  listCustomAbutmentToothWorks,
  normalizeResultFiles,
  parseArrivalYmdFromMemo,
  pickFileForTooth,
};

/**
 * 디자인 핸드오프 시 PTX CA Request 가격·출고모드·스케줄을 생산만/기일-3 기준으로 재계산.
 * 제조 단계는 준비로 유지(취소·재업로드 가능).
 */
export async function repriceAndReschedulePtxAbutmentRequest({
  requestDoc,
  transferDoc,
  requestedAt = new Date(),
}) {
  if (!requestDoc || !transferDoc) return requestDoc;

  const labAnchorId = String(
    requestDoc.businessAnchorId || transferDoc.targetLabAnchorId || "",
  ).trim();
  const labOrg = labAnchorId && Types.ObjectId.isValid(labAnchorId)
    ? await BusinessAnchor.findById(labAnchorId)
        .select({ "shippingPolicy.weeklyBatchDays": 1 })
        .lean()
    : null;
  const weeklyBatchDays = Array.isArray(labOrg?.shippingPolicy?.weeklyBatchDays)
    ? labOrg.shippingPolicy.weeklyBatchDays
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    : [];

  let expressFeePerRequest = 2000;
  let creditSettingsForQuote = {};
  try {
    creditSettingsForQuote = await loadCreditSettingsDefaults({
      requestorOrgId: labAnchorId || null,
    });
    expressFeePerRequest = Math.max(
      0,
      Number(creditSettingsForQuote?.expressFee ?? 2000) || 2000,
    );
  } catch {
    // defaults
  }

  const pricingTier = await resolvePracticePricingTierForTransfer(transferDoc);

  const maxDiameter =
    typeof requestDoc?.caseInfos?.maxDiameter === "number" &&
    !Number.isNaN(requestDoc.caseInfos.maxDiameter)
      ? requestDoc.caseInfos.maxDiameter
      : 8;

  const shippingMode = await resolveShippingModeForPracticeTransferArrival({
    transferDoc,
    weeklyBatchDays,
    requestedAt,
    maxDiameter,
  });

  const abutmentQty = Math.max(
    1,
    countDesignAbutmentQty(requestDoc.caseInfos) || 1,
  );
  const quotedPrice = buildPtxAbutsProductionQuote({
    creditSettings: creditSettingsForQuote,
    pricingTier,
    shippingMode,
    abutmentQty,
    expressFeePerRequest,
    quotedAt: requestedAt,
  });

  const arrivalYmd = parseArrivalYmdFromMemo(transferDoc?.transferMemo);
  const targetShipYmd = arrivalYmd
    ? await resolveManufacturerTargetShipYmd(arrivalYmd)
    : null;

  let productionSchedule = await calculateInitialProductionSchedule({
    shippingMode,
    maxDiameter,
    requestedAt,
    weeklyBatchDays: shippingMode === "normal" ? weeklyBatchDays : [],
    productMode: "design_custom_abutment",
  });
  productionSchedule = await clampScheduleToTarget(
    productionSchedule,
    targetShipYmd,
  );

  const pickupYmd = productionSchedule?.scheduledShipPickup
    ? toKstYmd(productionSchedule.scheduledShipPickup)
    : null;
  let estimatedShipYmdRaw = pickupYmd || targetShipYmd || arrivalYmd;
  if (targetShipYmd) {
    const targetMs = ymdToUtcNoonMs(targetShipYmd);
    const estMs = ymdToUtcNoonMs(estimatedShipYmdRaw);
    if (targetMs != null && estMs != null && estMs > targetMs) {
      estimatedShipYmdRaw = targetShipYmd;
    }
  }
  const estimatedShipYmd = estimatedShipYmdRaw
    ? await normalizeKoreanBusinessDay({ ymd: estimatedShipYmdRaw })
    : null;

  requestDoc.price = quotedPrice;
  requestDoc.shippingMode = shippingMode;
  requestDoc.originalShipping = {
    ...(requestDoc.originalShipping && typeof requestDoc.originalShipping === "object"
      ? requestDoc.originalShipping
      : {}),
    mode: shippingMode,
    requestedAt,
  };
  requestDoc.finalShipping = {
    mode: shippingMode,
    updatedAt: requestedAt,
  };
  requestDoc.productionSchedule = productionSchedule;
  if (!requestDoc.partnerBilling || typeof requestDoc.partnerBilling !== "object") {
    requestDoc.partnerBilling = {};
  }
  requestDoc.partnerBilling.labDesignedAbutment = true;
  if (transferDoc.practiceBusinessAnchorId) {
    requestDoc.partnerBilling.practiceBusinessAnchorId =
      transferDoc.practiceBusinessAnchorId;
  }
  if (estimatedShipYmd) {
    requestDoc.timeline = {
      ...(requestDoc.timeline && typeof requestDoc.timeline === "object"
        ? requestDoc.timeline
        : {}),
      originalEstimatedShipYmd:
        requestDoc.timeline?.originalEstimatedShipYmd || estimatedShipYmd,
      nextEstimatedShipYmd: estimatedShipYmd,
      estimatedShipYmd,
    };
  }

  return requestDoc;
}

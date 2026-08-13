// related files:
// - web/backend/models/practiceTransfer.model.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/backend/controllers/requests/creation.request.controller.js
// - web/backend/models/request.model.js
// - web/frontend/src/shared/practice/transferMemo.ts
// change-log:
// - 2026-08-13: 치아별 abutmentProductMode(생산만/디자인+생산)를 어벗츠 의뢰 productMode로 전달.
import { Types } from "mongoose";
import Request from "../models/request.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";
import User from "../models/user.model.js";
import {
  normalizeCaseInfosImplantFields,
  computePriceForRequest,
  addKoreanBusinessDays,
  getTodayYmdInKst,
  toKstYmd,
  normalizeKoreanBusinessDay,
} from "../controllers/requests/utils.js";
import { calculateInitialProductionSchedule } from "../controllers/requests/production.utils.js";
import { resolveQuotedPriceWithExtras } from "../controllers/requests/designPrice.utils.js";
import { resolveSelectableShippingMode } from "../controllers/requests/expressSelectable.utils.js";
import { getManufacturerLeadTimesUtil } from "../controllers/businesses/leadTime.controller.js";
import { loadCreditSettingsDefaults } from "../utils/creditSettingsDefaults.js";
import { checkCreditLock } from "../utils/creditLock.util.js";
import { triggerDashboardSummaryRefreshForAnchorId } from "./requestSnapshotTriggers.service.js";
import { recomputeBulkShippingSnapshotForBusinessAnchorId } from "./bulkShippingSnapshot.service.js";

const hasCustomAbutmentToothWorks = (toothWorks) =>
  (Array.isArray(toothWorks) ? toothWorks : []).some(
    (row) => Boolean(row?.customAbutment) && String(row?.toothNumber || "").trim(),
  );

const listCustomAbutmentToothWorks = (toothWorks) =>
  (Array.isArray(toothWorks) ? toothWorks : []).filter(
    (row) => Boolean(row?.customAbutment) && String(row?.toothNumber || "").trim(),
  );

const resolveAbutmentProductMode = (row) => {
  const raw = String(row?.abutmentProductMode || row?.productMode || "").trim();
  return raw === "design_custom_abutment"
    ? "design_custom_abutment"
    : "custom_abutment";
};

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

const parsePatientNameFromMemo = (memo) => {
  const raw = String(memo || "").trim();
  const matched = raw.match(/\[\s*환자명\s*:\s*([^\]]+)\]/i);
  return String(matched?.[1] || "").trim();
};

const pickResultFileForTooth = (resultFiles, toothNumber, index) => {
  const tooth = String(toothNumber || "").trim();
  if (tooth) {
    const byTooth = resultFiles.find(
      (f) => String(f?.tooth || "").trim() === tooth,
    );
    if (byTooth) return byTooth;
  }
  if (resultFiles[index]) return resultFiles[index];
  return resultFiles[0] || null;
};

const resolveLabRequestorUserId = async ({ transferDoc, fallbackUserId }) => {
  const completedBy = String(transferDoc?.autoMatch?.completedBy || "").trim();
  if (completedBy && Types.ObjectId.isValid(completedBy)) return completedBy;

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

/**
 * 기공의뢰 생산 컨펌 시 커스텀어벗 → 어벗츠 생산의뢰 자동 생성.
 * requestor = 기공소, partnerBilling으로 치과 선결제/거래처 차감 연동.
 */
export async function createAbutmentRequestsFromPracticeTransfer({
  transferDoc,
  shippingMode: shippingModeRaw,
  actorUserId = null,
}) {
  const customRows = listCustomAbutmentToothWorks(transferDoc?.toothWorks);
  if (customRows.length === 0) {
    return { created: [], skippedReason: "no_custom_abutment" };
  }

  const resultFiles = normalizeResultFiles(transferDoc?.resultFiles);
  if (resultFiles.length === 0) {
    throw new Error("작업 결과 파일이 없어 어벗츠 의뢰를 생성할 수 없습니다.");
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

  const requestedShippingMode =
    shippingModeRaw === "express" ? "express" : "normal";

  if (requestedShippingMode === "normal" && weeklyBatchDays.length === 0) {
    throw new Error(
      "묶음 배송을 쓰려면 기공소 설정 > 배송에서 묶음 요일을 먼저 지정해주세요.",
    );
  }

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
    String(resultFiles[0]?.patientName || "").trim() ||
    "환자";

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
  let designFeePerTooth = 5000;
  try {
    const creditSettings = await loadCreditSettingsDefaults({
      requestorOrgId: labAnchorId,
    });
    expressFeePerRequest = Math.max(
      0,
      Number(creditSettings?.expressFee ?? 2000) || 2000,
    );
    designFeePerTooth = Math.max(
      0,
      Number(creditSettings?.designFee ?? 5000) || 5000,
    );
  } catch {
    expressFeePerRequest = 2000;
    designFeePerTooth = 5000;
  }

  const manufacturerSettings = await getManufacturerLeadTimesUtil();
  const leadTimes = manufacturerSettings?.leadTimes || {};
  const created = [];
  const requestedAt = new Date();

  for (let i = 0; i < customRows.length; i += 1) {
    const row = customRows[i];
    const tooth = String(row.toothNumber || "").trim();
    const resultFile = pickResultFileForTooth(resultFiles, tooth, i);
    if (!resultFile?.file?.s3Key) {
      throw new Error(`치아 #${tooth} 작업 결과 파일을 찾지 못했습니다.`);
    }

    const patientName =
      String(resultFile.patientName || "").trim() || patientNameFallback;
    const implantManufacturer = String(row.implantManufacturer || "").trim();
    const implantBrand = String(row.implantBrand || "").trim();
    const implantFamily = String(row.implantFamily || "").trim();
    const implantType = String(row.implantType || "").trim();
    if (!implantManufacturer || !implantBrand || !implantFamily || !implantType) {
      throw new Error(
        `치아 #${tooth} 임플란트 규격(Manufacturer/Brand/Family/Type)이 부족합니다.`,
      );
    }

    const productMode = resolveAbutmentProductMode(row);
    const shippingMode = await resolveSelectableShippingMode({
      shippingMode: requestedShippingMode,
      requestedAt,
      weeklyBatchDays,
      productMode,
    });

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
        originalName: resultFile.file.originalName,
        mimetype: resultFile.file.mimetype,
        size: resultFile.file.size,
        s3Key: resultFile.file.s3Key,
      },
      toothWorks: [row],
    };

    const normalizedCaseInfos =
      await normalizeCaseInfosImplantFields(caseInfosRaw);

    const computedPrice = await computePriceForRequest({
      requestorId: labUserId,
      requestorOrgId: labAnchorId,
      clinicName,
      patientName,
      tooth,
    });

    const quotedPrice = resolveQuotedPriceWithExtras({
      price: computedPrice,
      caseInfos: normalizedCaseInfos,
      shippingMode,
      expressFee: expressFeePerRequest,
      designFeePerTooth,
    });

    const productionSchedule = await calculateInitialProductionSchedule({
      shippingMode,
      maxDiameter: normalizedCaseInfos?.maxDiameter,
      requestedAt,
      weeklyBatchDays: shippingMode === "normal" ? weeklyBatchDays : [],
      productMode,
    });

    const createdYmd = toKstYmd(requestedAt) || getTodayYmdInKst();
    const pickupYmd = productionSchedule?.scheduledShipPickup
      ? toKstYmd(productionSchedule.scheduledShipPickup)
      : null;

    let estimatedShipYmdRaw = pickupYmd;
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
  };
}

export {
  hasCustomAbutmentToothWorks,
  listCustomAbutmentToothWorks,
  normalizeResultFiles,
};

// related files:
// - web/backend/models/labOralScanCase.model.js
// - web/backend/controllers/ai/customAbutmentDesignChat.controller.js
// - web/backend/services/labOralScanCaseDesignHost.js
// LabOralScanCase 디자인 확정 → 생산 Request(intake=lab). 디자인비 없음, 생산 크레딧만 hold.
import crypto from "crypto";
import { Types } from "mongoose";
import Request from "../models/request.model.js";
import LabOralScanCase from "../models/labOralScanCase.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";
import User from "../models/user.model.js";
import { stampDirectDesignRoute, platformProductionKey, newDesignGeneration } from "./abutmentDesignRoute.js";
import { assignProducerFields } from "./producerAssignment.service.js";
import { holdRequestCreditsOnSubmit } from "./requestCreditHold.service.js";
import { copyObjectInS3 } from "../utils/s3.utils.js";
import { loadCreditSettingsDefaults } from "../utils/creditSettingsDefaults.js";
import {
  normalizeCaseInfosImplantFields,
  classifyImplantPreset,
  ensureLotNumbersOnReadyEnter,
  computePriceForRequest,
} from "../controllers/requests/utils.js";
import { resolveQuotedPriceWithExtras } from "../controllers/requests/designPrice.utils.js";
import { buildStandardStlFileName } from "../controllers/requests/creation.helpers.controller.js";
import { listCustomAbutmentToothWorks } from "./practiceTransferProduction.service.js";
import { assertImplantProducerMatchedOrThrow } from "./producerAssignment.service.js";
import { calculateInitialProductionSchedule } from "../controllers/requests/production.utils.js";
import {
  addKoreanBusinessDays,
  getTodayYmdInKst,
  normalizeKoreanBusinessDay,
  toKstYmd,
} from "../utils/krBusinessDays.js";
import { getManufacturerLeadTimesUtil } from "../controllers/businesses/leadTime.controller.js";
import { resolvePrcFileNames } from "../controllers/requests/prcMapping.utils.js";

const REQUEST_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const REQUEST_ID_SUFFIX_LEN = 4;

function buildRequestIdPrefix() {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function makeRequestSuffix() {
  const bytes = crypto.randomBytes(REQUEST_ID_SUFFIX_LEN);
  let out = "";
  for (let i = 0; i < REQUEST_ID_SUFFIX_LEN; i += 1) {
    out += REQUEST_ID_ALPHABET[bytes[i] % REQUEST_ID_ALPHABET.length];
  }
  return out;
}

function generateRequestIds(count) {
  const prefix = buildRequestIdPrefix();
  const ids = [];
  const seen = new Set();
  for (let i = 0; i < count; i += 1) {
    let candidate = `${prefix}-${makeRequestSuffix()}`;
    let tries = 0;
    while (seen.has(candidate) && tries < 20) {
      candidate = `${prefix}-${makeRequestSuffix()}`;
      tries += 1;
    }
    seen.add(candidate);
    ids.push(candidate);
  }
  return ids;
}

function toothWorkByNumber(toothWorks, toothNumber) {
  const rows = listCustomAbutmentToothWorks(toothWorks || []);
  const key = String(toothNumber || "").trim();
  return rows.find((row) => String(row.toothNumber || "").trim() === key) || null;
}

/**
 * @param {{
 *   labCase: object,
 *   actorUserId: string,
 *   teeth: Array<{ toothNumber: string, s3Key: string, size: number, fileName?: string, metrics?: object, crownS3Key?: string }>,
 *   patientName?: string,
 *   version?: number,
 *   fitVersion?: number,
 * }} args
 */
export async function confirmLabOralScanCaseDesign({
  labCase,
  actorUserId,
  teeth,
  patientName,
  version,
  fitVersion,
}) {
  if (!labCase?._id) {
    const err = new Error("케이스를 찾을 수 없습니다.");
    err.statusCode = 404;
    throw err;
  }
  if (String(labCase.status || "") === "confirmed") {
    const err = new Error("이미 생산 의뢰된 케이스입니다.");
    err.statusCode = 409;
    throw err;
  }
  if (String(labCase.status || "") === "cancelled") {
    const err = new Error("취소된 케이스입니다.");
    err.statusCode = 409;
    throw err;
  }

  const labAnchorId = String(labCase.labBusinessAnchorId || "").trim();
  if (!labAnchorId || !Types.ObjectId.isValid(labAnchorId)) {
    const err = new Error("기공소 정보가 없습니다.");
    err.statusCode = 400;
    throw err;
  }

  const validTeeth = (Array.isArray(teeth) ? teeth : []).filter(
    (row) => row?.s3Key && String(row.toothNumber || "").trim(),
  );
  if (validTeeth.length === 0) {
    const err = new Error("확정할 커스텀어벗 디자인이 없습니다.");
    err.statusCode = 400;
    throw err;
  }

  const labUserId =
    String(actorUserId || "").trim() ||
    String(labCase.createdByUserId || "").trim();
  if (!labUserId || !Types.ObjectId.isValid(labUserId)) {
    const err = new Error("의뢰자 계정이 필요합니다.");
    err.statusCode = 401;
    throw err;
  }

  const [labOrg, labUser, creditSettings] = await Promise.all([
    BusinessAnchor.findById(labAnchorId)
      .select({
        name: 1,
        "shippingPolicy.weeklyBatchDays": 1,
        "requestSettings.designSoftware": 1,
        "requestSettings.anodizingEnabled": 1,
        "requestSettings.retentionGroove": 1,
      })
      .lean(),
    User.findById(labUserId)
      .select({
        "requestSettings.designSoftware": 1,
        "requestSettings.anodizingEnabled": 1,
        "requestSettings.retentionGroove": 1,
      })
      .lean(),
    loadCreditSettingsDefaults({
      requestorOrgId: labAnchorId,
      applyLabSupplyPrices: false,
    }).catch(() => ({})),
  ]);

  const designSoftware =
    String(labUser?.requestSettings?.designSoftware || "").trim() ||
    String(labOrg?.requestSettings?.designSoftware || "").trim() ||
    "3Shape";
  const anodizingEnabled =
    typeof labUser?.requestSettings?.anodizingEnabled === "boolean"
      ? labUser.requestSettings.anodizingEnabled
      : typeof labOrg?.requestSettings?.anodizingEnabled === "boolean"
        ? labOrg.requestSettings.anodizingEnabled
        : true;
  const retentionGroove =
    labUser?.requestSettings?.retentionGroove ??
    labOrg?.requestSettings?.retentionGroove ??
    undefined;

  const clinicName =
    String(labCase.clinicName || "").trim() ||
    String(labOrg?.name || "").trim() ||
    "치과";
  const patient =
    String(patientName || "").trim() ||
    String(labCase.patientName || "").trim() ||
    "환자";

  const weeklyBatchDays = Array.isArray(labOrg?.shippingPolicy?.weeklyBatchDays)
    ? labOrg.shippingPolicy.weeklyBatchDays
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    : [];

  const shippingMode = "normal";
  const requestedAt = new Date();
  const requestIds = generateRequestIds(validTeeth.length);
  const createdDocs = [];
  const now = new Date();

  for (let i = 0; i < validTeeth.length; i += 1) {
    const toothRow = validTeeth[i];
    const tooth = String(toothRow.toothNumber || "").trim();
    const work = toothWorkByNumber(labCase.toothWorks, tooth);
    if (!work) {
      const err = new Error(`치아 #${tooth} 커스텀어벗 정보가 없습니다.`);
      err.statusCode = 400;
      throw err;
    }

    const implantManufacturer = String(work.implantManufacturer || "").trim();
    const implantBrand = String(work.implantBrand || "").trim();
    const implantFamily = String(work.implantFamily || "").trim();
    const implantType = String(work.implantType || "").trim();
    if (!implantManufacturer || !implantBrand || !implantFamily || !implantType) {
      const err = new Error(
        `치아 #${tooth} 임플란트 규격(Manufacturer/Brand/Family/Type)이 부족합니다.`,
      );
      err.statusCode = 400;
      throw err;
    }

    const implantPreset = await classifyImplantPreset({
      implantManufacturer,
      implantBrand,
      implantFamily,
      implantType,
    });
    if (implantPreset.kind === "incomplete") {
      const err = new Error(
        `치아 #${tooth} 임플란트 규격(Manufacturer/Brand/Family/Type)이 부족합니다.`,
      );
      err.statusCode = 400;
      throw err;
    }
    try {
      await assertImplantProducerMatchedOrThrow({
        implantManufacturer,
        implantBrand,
        implantFamily,
        implantType,
      });
    } catch (matchError) {
      const err = new Error(`치아 #${tooth} ${matchError?.message || "의뢰할 수 없습니다."}`);
      err.statusCode = 400;
      throw err;
    }

    const generation = newDesignGeneration();
    const destKey = platformProductionKey(requestIds[i], generation);
    try {
      await copyObjectInS3(toothRow.s3Key, destKey);
    } catch (copyErr) {
      console.warn(
        "[labOralScan] confirm STL copy failed",
        toothRow.s3Key,
        copyErr?.message || copyErr,
      );
      const err = new Error(
        "커스텀어벗 STL 파일을 확인하지 못했습니다. 다시 시도해 주세요.",
      );
      err.statusCode = 400;
      throw err;
    }

    const fileName =
      String(toothRow.fileName || "").trim() ||
      `custom_abutment_${tooth}.stl`;
    const diameterRaw = String(work.abutmentDiameter || "").trim();
    const diameterNum = Number(diameterRaw.replace(/[^\d.]/g, ""));
    const metricsMax = Number(toothRow.metrics?.maxDiameterMm);
    const maxDiameter =
      Number.isFinite(metricsMax) && metricsMax > 0
        ? metricsMax
        : Number.isFinite(diameterNum) && diameterNum > 0
          ? diameterNum
          : undefined;

    const oralSources = (Array.isArray(labCase.files) ? labCase.files : [])
      .filter((f) => f?.s3Key)
      .map((f) => ({
        originalName: f.originalName,
        mimetype: f.mimetype,
        size: f.size,
        s3Key: f.s3Key,
      }));

    const caseInfosRaw = {
      clinicName,
      patientName: patient,
      tooth,
      workType: "abutment",
      productMode: "custom_abutment",
      intake: "lab",
      designRoute: "direct",
      implantManufacturer,
      implantBrand,
      implantFamily,
      implantType,
      abutmentManufacturer: String(work.abutmentManufacturer || "").trim() || undefined,
      abutmentDiameter: diameterRaw || undefined,
      abutmentHeight: String(work.abutmentHeight || "").trim() || undefined,
      maxDiameter,
      designSoftware,
      anodizingEnabled,
      retentionGroove,
      designGeneration: generation,
      machiningSourceS3Key: destKey,
      requestorHexRotation: "STL모델대로",
      manufacturerHexRotation: "STL모델대로",
      finalHexRotation: "STL모델대로",
      hexRotation: { mode: "STL모델대로" },
      designSourceFiles: oralSources,
      files: oralSources,
      file: {
        originalName: fileName,
        fileType: "model/stl",
        fileSize: toothRow.size,
        s3Key: destKey,
      },
      toothWorks: [work],
      labOralScanCaseId: String(labCase.caseId || ""),
    };

    const normalizedCaseInfos = await normalizeCaseInfosImplantFields(caseInfosRaw);
    const computedPrice = await computePriceForRequest({
      requestorId: labUserId,
      requestorOrgId: labAnchorId,
      clinicName,
      patientName: patient,
      tooth,
      creditSettings,
    });
    const quotedPrice = resolveQuotedPriceWithExtras({
      price: computedPrice,
      caseInfos: normalizedCaseInfos,
      shippingMode,
      expressFee: 0,
      designFeePerTooth: 0,
    });

    const bgFileName = buildStandardStlFileName({
      requestId: requestIds[i],
      clinicName,
      patientName: patient,
      tooth,
      originalFileName: fileName,
    });
    if (normalizedCaseInfos?.file) {
      normalizedCaseInfos.file.filePath = bgFileName;
    }

    const productionSchedule = await calculateInitialProductionSchedule({
      shippingMode,
      maxDiameter: normalizedCaseInfos?.maxDiameter,
      requestedAt,
      weeklyBatchDays,
      productMode: "custom_abutment",
      anodizingEnabled,
    });

    const createdYmd = toKstYmd(requestedAt) || getTodayYmdInKst();
    const pickupYmd = productionSchedule?.scheduledShipPickup
      ? toKstYmd(productionSchedule.scheduledShipPickup)
      : null;
    let estimatedShipYmdRaw = pickupYmd;
    if (!estimatedShipYmdRaw) {
      const manufacturerSettings = await getManufacturerLeadTimesUtil();
      const leadTimes = manufacturerSettings?.leadTimes || {};
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
      requestId: requestIds[i],
      requestor: labUserId,
      businessAnchorId: labAnchorId,
      caseInfos: normalizedCaseInfos,
      price: quotedPrice,
      shippingMode,
      manufacturerStage: "준비",
      designCompletedAt: now,
      productionSchedule,
      originalShipping: { mode: shippingMode, requestedAt },
      finalShipping: { mode: shippingMode, updatedAt: requestedAt },
      timeline: {
        originalEstimatedShipYmd: estimatedShipYmd,
        nextEstimatedShipYmd: estimatedShipYmd,
        estimatedShipYmd,
      },
      rnd: { manufacturerHexRotation: "STL모델대로" },
      partnerBilling: {
        labOralScanCaseId: labCase._id,
        offlineClinic: true,
      },
    });

    stampDirectDesignRoute(newRequest);
    await assignProducerFields(newRequest, newRequest.caseInfos);
    createdDocs.push(newRequest);
  }

  await ensureLotNumbersOnReadyEnter(createdDocs);

  try {
    for (const doc of createdDocs) {
      await doc.validate();
    }
    await Request.insertMany(createdDocs, { ordered: true });
  } catch (insertErr) {
    console.error("[labOralScan] request insert failed", insertErr?.message || insertErr);
    throw insertErr;
  }

  const savedIds = createdDocs.map((doc) => doc._id);
  try {
    await holdRequestCreditsOnSubmit({
      requests: createdDocs,
      actorUserId: labUserId,
    });
  } catch (holdErr) {
    await Request.deleteMany({ _id: { $in: savedIds } });
    throw holdErr;
  }

  const prevPreview =
    labCase.production?.customAbutmentPreview &&
    typeof labCase.production.customAbutmentPreview === "object"
      ? labCase.production.customAbutmentPreview
      : {};
  const nextPreview = {
    ...prevPreview,
    version: Number(version) || Number(prevPreview.version) || 0,
    fitVersion: Number(fitVersion) || Number(prevPreview.fitVersion) || 0,
    savedAt: Date.now(),
    updatedBy: String(labUserId),
    confirmedAt: now,
    confirmedBy: new Types.ObjectId(labUserId),
    teeth: validTeeth,
  };

  await LabOralScanCase.updateOne(
    { _id: labCase._id },
    {
      $set: {
        status: "confirmed",
        patientName: patient,
        "production.customAbutmentPreview": nextPreview,
        "production.relatedRequestIds": savedIds,
        "production.confirmedAt": now,
        "production.confirmedBy": new Types.ObjectId(labUserId),
      },
      $unset: {
        "production.customAbutmentManualDesign": "",
      },
    },
  );

  for (const doc of createdDocs) {
    try {
      const prc = await resolvePrcFileNames(doc.caseInfos);
      const $set = {};
      if (prc.faceHolePrcFileName) {
        $set["caseInfos.faceHolePrcFileName"] = prc.faceHolePrcFileName;
      }
      if (prc.connectionPrcFileName) {
        $set["caseInfos.connectionPrcFileName"] = prc.connectionPrcFileName;
      }
      if (Object.keys($set).length > 0) {
        await Request.updateOne({ _id: doc._id }, { $set });
      }
    } catch (err) {
      console.warn("[labOralScan] prc seed failed", err?.message || err);
    }
  }

  void (async () => {
    try {
      const { triggerRhinoProcessFileForRequest } = await import(
        "../controllers/rhino/rhino.controller.js"
      );
      const { scheduleRequestReadyBadgeEmit } = await import(
        "./adminCommBadge.service.js"
      );
      const { emitAppEventToRoles } = await import("../socket.js");
      for (const doc of createdDocs) {
        const processFileName = String(doc.caseInfos?.file?.filePath || "").trim();
        if (!processFileName || !doc.requestId) continue;
        triggerRhinoProcessFileForRequest({
          requestId: doc.requestId,
          filePath: processFileName,
          fileName: processFileName,
        });
      }
      scheduleRequestReadyBadgeEmit();
      emitAppEventToRoles(["manufacturer", "admin"], "worksheet:updated", {
        source: "lab-oral-scan-confirm",
        caseId: String(labCase.caseId || ""),
      });
    } catch (pipelineErr) {
      console.warn(
        "[labOralScan] rhino pipeline failed",
        pipelineErr?.message || pipelineErr,
      );
    }
  })();

  return {
    caseId: String(labCase.caseId || ""),
    requestIds: createdDocs.map((doc) => String(doc.requestId || "")),
    requestMongoIds: savedIds.map(String),
    teeth: validTeeth.map((t) => t.toothNumber),
  };
}

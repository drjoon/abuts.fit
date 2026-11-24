#!/usr/bin/env node
/**
 * 향기로운치과 커스텀어벗 포함 PracticeTransfer → 테스트치과·테스트기공소 복사.
 * 의뢰일=오늘(KST), 치과도착=오늘+7일. 워크플로(작업시작·정산·CA Request 링크)는 초기화.
 *
 * Usage:
 *   cd web/backend && \
 *   ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
 *   node scripts/db/copy-scent-ca-ptx-to-test-practice.js
 *
 * Optional:
 *   DRY_RUN=1
 *   SOURCE_NAME=향기로운치과
 *   TARGET_PRACTICE_NAME=테스트치과
 *   TARGET_LAB_NAME=테스트기공소
 *   ARRIVAL_OFFSET_DAYS=7
 */
import { connectDb, disconnectDb } from "./_mongo.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import User from "../../models/user.model.js";
import { hasCustomAbutmentToothWorks } from "../../services/practiceTransferProduction.service.js";
import {
  addCivilDaysYmd,
  defaultAbutmentShipYmdFromArrival,
} from "../../utils/practiceTransferArrivalDates.js";
import {
  upsertMemoArrivalYmd,
  upsertMemoOrderYmd,
} from "../../utils/practiceTransferRush.js";
import { toKstYmd } from "../../controllers/requests/utils.js";

const SOURCE_NAME = String(process.env.SOURCE_NAME || "향기로운치과").trim();
const TARGET_PRACTICE_NAME = String(
  process.env.TARGET_PRACTICE_NAME || "테스트치과",
).trim();
const TARGET_LAB_NAME = String(
  process.env.TARGET_LAB_NAME || "테스트기공소",
).trim();
const ARRIVAL_OFFSET_DAYS = Math.max(
  0,
  Math.floor(Number(process.env.ARRIVAL_OFFSET_DAYS || 7)),
);
const DRY_RUN =
  String(process.env.DRY_RUN || "")
    .trim()
    .toLowerCase() === "1" ||
  String(process.env.DRY_RUN || "")
    .trim()
    .toLowerCase() === "true";

function makeTransferId(index) {
  const base = Date.now().toString(36).toUpperCase();
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PTX-${base}-${suffix}${index ? String(index) : ""}`;
}

function clonePlain(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function stripCopyMarker(memo) {
  return String(memo || "")
    .replace(/\[\s*복사원본\s*:\s*[^\]]*\]\s*/gi, "")
    .trim();
}

function buildBillingSnapshot(billing) {
  const src = billing && typeof billing === "object" ? billing : {};
  return {
    labFeeTotal: Number(src.labFeeTotal) || 0,
    labAbutmentTotal: Number(src.labAbutmentTotal) || 0,
    labAbutmentPending: Boolean(src.labAbutmentPending),
    abutmentRetailTotal: Number(src.abutmentRetailTotal) || 0,
    abutmentQty: Number(src.abutmentQty) || 0,
    total: Number(src.total) || 0,
    labShippingFee: Number(src.labShippingFee) || 0,
    isTradingPartner: Boolean(src.isTradingPartner),
    relationshipKind: src.relationshipKind || "none",
    feeRateApplied: Number(src.feeRateApplied) || 0,
    platformFeeRateApplied: src.platformFeeRateApplied,
    aiTrainingConsent: src.aiTrainingConsent,
    internalPerformer: src.internalPerformer,
    requireLabProsthesisUpload:
      src.requireLabProsthesisUpload === undefined
        ? true
        : Boolean(src.requireLabProsthesisUpload),
    labFeeMultiplier: Number(src.labFeeMultiplier) || 1,
    labPracticeSpecialSupply: clonePlain(src.labPracticeSpecialSupply),
    rushFeeMultiplier: Number(src.rushFeeMultiplier) || 1,
    labTradingPartnerId: null,
    labSettlementAmount: Number(src.labSettlementAmount) || 0,
    abutsRevenueAmount: Number(src.abutsRevenueAmount) || 0,
    heldAt: null,
    heldTotal: 0,
    heldLabTotal: 0,
    heldAbutmentTotal: 0,
    heldShippingLabTotal: 0,
    heldShippingAbutsTotal: 0,
    billedAt: null,
    settledAt: null,
    labSettledAt: null,
    abutmentSettledAt: null,
    isRemake: false,
    autoMatchBudget: undefined,
  };
}

function buildProductionSnapshot(production, abutmentShipYmd) {
  const src = production && typeof production === "object" ? production : {};
  return {
    shippingMode: null,
    rushProcessing: Boolean(src.rushProcessing),
    skipDesignConfirm: src.skipDesignConfirm !== false,
    skipJig: src.skipJig !== false,
    designFiles: [],
    abutmentSeats: undefined,
    workFilePaint: undefined,
    labWorkScanFiles: clonePlain(src.labWorkScanFiles) || [],
    workScanAutoAlign: clonePlain(src.workScanAutoAlign),
    workScanAlignment: clonePlain(src.workScanAlignment),
    workScanEditing: undefined,
    workSession: clonePlain(src.workSession),
    customAbutmentPreview: clonePlain(src.customAbutmentPreview),
    caDesignUploadCountByTooth: undefined,
    designReadyAt: null,
    labDesignConfirmedAt: null,
    labDesignConfirmedBy: null,
    practiceDesignConfirmedAt: null,
    practiceDesignConfirmedBy: null,
    abutmentFeeRoute: src.abutmentFeeRoute || null,
    abutmentFeeRouteRevision: 0,
    abutmentCancelDeadlineAt: null,
    abutmentGracePromoteAt: null,
    abutmentProductionStartedAt: null,
    abutmentShipYmd: abutmentShipYmd || null,
    anodizingEnabled: src.anodizingEnabled,
    confirmedAt: null,
    confirmedBy: null,
    relatedRequestIds: [],
    customAbutmentManualDesign: undefined,
  };
}

async function main() {
  await connectDb();

  const [sourcePractice, targetPractice, targetLab] = await Promise.all([
    BusinessAnchor.findOne({ name: SOURCE_NAME }).lean(),
    BusinessAnchor.findOne({ name: TARGET_PRACTICE_NAME }).lean(),
    BusinessAnchor.findOne({ name: TARGET_LAB_NAME }).lean(),
  ]);

  if (!sourcePractice?._id) {
    throw new Error(`source practice not found: ${SOURCE_NAME}`);
  }
  if (!targetPractice?._id) {
    throw new Error(`target practice not found: ${TARGET_PRACTICE_NAME}`);
  }
  if (!targetLab?._id) {
    throw new Error(`target lab not found: ${TARGET_LAB_NAME}`);
  }

  const practiceUser = await User.findOne({
    businessAnchorId: targetPractice._id,
  })
    .select({ _id: 1, email: 1, name: 1 })
    .lean();
  if (!practiceUser?._id) {
    throw new Error(`no user under ${TARGET_PRACTICE_NAME}`);
  }

  const sources = await PracticeTransfer.find({
    practiceBusinessAnchorId: sourcePractice._id,
    status: "active",
  }).lean();

  const caSources = sources.filter((doc) =>
    hasCustomAbutmentToothWorks(doc.toothWorks),
  );

  const orderYmd = toKstYmd(new Date());
  const arrivalYmd = addCivilDaysYmd(orderYmd, ARRIVAL_OFFSET_DAYS);
  const abutmentShipYmd = defaultAbutmentShipYmdFromArrival(arrivalYmd);

  console.log("[copy-ca-ptx] plan", {
    dryRun: DRY_RUN,
    source: SOURCE_NAME,
    sourceId: String(sourcePractice._id),
    targetPractice: TARGET_PRACTICE_NAME,
    targetPracticeId: String(targetPractice._id),
    targetLab: TARGET_LAB_NAME,
    targetLabId: String(targetLab._id),
    practiceUserId: String(practiceUser._id),
    sourceActive: sources.length,
    caCount: caSources.length,
    orderYmd,
    arrivalYmd,
    abutmentShipYmd,
  });

  if (DRY_RUN) {
    console.log(
      "[copy-ca-ptx] dry-run ids",
      caSources.map((d) => d.transferId),
    );
    await disconnectDb();
    return;
  }

  const created = [];
  for (let i = 0; i < caSources.length; i += 1) {
    const source = caSources[i];
    const transferId = makeTransferId(i + 1);
    let memo = stripCopyMarker(source.transferMemo);
    memo = upsertMemoOrderYmd(memo, orderYmd);
    memo = upsertMemoArrivalYmd(memo, arrivalYmd);
    memo = `[복사원본: ${source.transferId}]\n${memo}`.trim();

    const doc = await PracticeTransfer.create({
      transferId,
      practiceUserId: practiceUser._id,
      practiceBusinessAnchorId: targetPractice._id,
      targetLabAnchorId: targetLab._id,
      targetLabName: TARGET_LAB_NAME,
      assigneeLabAnchorId: null,
      assigneeLabName: "",
      assigneeKind: null,
      matchingMode: "direct",
      autoMatch: {
        claimedAt: null,
        deadlineAt: null,
        claimHours: null,
        completedAt: null,
        completedBy: null,
        releaseCount: 0,
      },
      transferMemo: memo,
      labBasketTag: "",
      arrivalDates: [arrivalYmd],
      orderDates: [orderYmd],
      tag: String(source.tag || "practice_file_transfer").trim(),
      status: "active",
      files: clonePlain(source.files) || [],
      trashedFiles: [],
      resultFiles: [],
      scanAlignment: clonePlain(source.scanAlignment),
      aiTraining: undefined,
      crownFabrication: source.crownFabrication ?? null,
      toothWorks: clonePlain(source.toothWorks) || [],
      screwSupply: source.screwSupply,
      production: buildProductionSnapshot(source.production, abutmentShipYmd),
      billing: buildBillingSnapshot(source.billing),
      remake: {
        sourceTransferId: "",
        sourceTransferMongoId: null,
        requestedAt: null,
        requestedBy: null,
        includeCustomAbutment: false,
        initiatedByLab: false,
      },
      labRequestStagePlans: clonePlain(source.labRequestStagePlans),
      prosthesisFollowUps: undefined,
      prosthesisFeeStages: undefined,
      remakeCharges: undefined,
      requestorReadAt: null,
      requestorReadBy: null,
      requestorDownloadedAt: null,
      requestorDownloadedBy: null,
      labTechnicianUserId: null,
      labTechnicianName: "",
      labTechnicianSetAt: null,
      workCanceledAt: null,
      workCanceledBy: null,
      arrivalDeadlineExpiredAt: null,
      labRejectedAt: null,
      labRejectedByLabAnchorId: null,
      canceledAt: null,
      canceledBy: null,
    });

    created.push({
      sourceTransferId: source.transferId,
      transferId: doc.transferId,
      mongoId: String(doc._id),
    });
    if ((i + 1) % 20 === 0 || i + 1 === caSources.length) {
      console.log(`[copy-ca-ptx] progress ${i + 1}/${caSources.length}`);
    }
  }

  console.log("[copy-ca-ptx] done", {
    created: created.length,
    orderYmd,
    arrivalYmd,
    sample: created.slice(0, 5),
  });

  await disconnectDb();
}

main().catch(async (err) => {
  console.error("[copy-ca-ptx] failed", err);
  try {
    await disconnectDb();
  } catch {
    // ignore
  }
  process.exit(1);
});

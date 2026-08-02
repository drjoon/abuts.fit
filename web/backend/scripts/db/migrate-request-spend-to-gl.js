// related files:
// - web/backend/rules.md
// - web/backend/scripts/db/_mongo.js
// - web/backend/models/request.model.js
// - web/backend/models/shippingPackage.model.js
// - web/backend/models/ledgerJournal.model.js
// - web/backend/models/ledgerLine.model.js
// - web/backend/services/generalLedger.service.js
// - web/backend/services/creditBalance.service.js
// - web/backend/services/creditRevenuePolicy.service.js
import mongoose, { Types } from "mongoose";
import { connectDb, disconnectDb } from "./_mongo.js";
import Request from "../../models/request.model.js";
import User from "../../models/user.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import ShippingPackage from "../../models/shippingPackage.model.js";
import LedgerJournal from "../../models/ledgerJournal.model.js";
import SystemSettings from "../../models/systemSettings.model.js";
import { postGeneralLedgerJournal } from "../../services/generalLedger.service.js";
import { upsertBusinessCreditBalanceFromLedger } from "../../services/creditBalance.service.js";
import {
  isShippingSpendRevenueContext,
  resolveConfiguredRevenueRates,
  resolveRevenueOwnerBaseAllocation,
  splitRevenueByCreditKindProRata,
} from "../../services/creditRevenuePolicy.service.js";
const VAT_RATE = 0.1;

function withVat(amount) {
  return Math.round(Number(amount || 0) * (1 + VAT_RATE));
}

function parseCliArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice(2) : [];
  const out = {
    execute: args.includes("--yes"),
    allRequestors: args.includes("--all-requestors"),
    anchorId: "",
    businessName: "",
    limit: 0,
    allowUnverified: args.includes("--allow-unverified"),
    forcePaidFallback: args.includes("--force-paid-fallback"),
  };

  const anchorIdx = args.findIndex((a) => a === "--anchor");
  if (anchorIdx >= 0 && args[anchorIdx + 1]) {
    out.anchorId = String(args[anchorIdx + 1] || "").trim();
  }

  const nameIdx = args.findIndex((a) => a === "--business-name");
  if (nameIdx >= 0 && args[nameIdx + 1]) {
    out.businessName = String(args[nameIdx + 1] || "").trim();
  }

  const limitIdx = args.findIndex((a) => a === "--limit");
  if (limitIdx >= 0 && args[limitIdx + 1]) {
    const n = Number(args[limitIdx + 1]);
    out.limit = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  return out;
}

function asObjectId(value) {
  const raw = String(value || "").trim();
  if (!raw || !Types.ObjectId.isValid(raw)) return null;
  return new Types.ObjectId(raw);
}

function normalizeStage(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (s === "생산") return "가공";
  if (s === "세척.포장") return "세척.패킹";
  if (s === "발송") return "포장.발송";
  return s;
}

function isSampleRequest(reqDoc) {
  const category = String(reqDoc?.requestCategory || "").trim();
  return category === "rnd_sample" || category === "copied_sample";
}

function requestSpendEvidence(reqDoc) {
  const stage = normalizeStage(reqDoc?.manufacturerStage);
  const reviewCam = String(reqDoc?.caseInfos?.reviewByStage?.cam?.status || "")
    .trim()
    .toLowerCase();
  const rollbackMachining = Number(reqDoc?.caseInfos?.rollbackCounts?.machining || 0);
  const hasMachiningFile = Boolean(reqDoc?.caseInfos?.stageFiles?.machining?.s3Key);
  const hasMachiningSchedule = Boolean(
    reqDoc?.productionSchedule?.actualMachiningStart ||
      reqDoc?.productionSchedule?.actualCamComplete,
  );

  const stageEligible = ["가공", "세척.패킹", "포장.발송", "추적관리"].includes(stage);
  const strongEvidence =
    reviewCam === "approved" || rollbackMachining > 0 || hasMachiningFile || hasMachiningSchedule;

  return {
    stage,
    stageEligible,
    strongEvidence,
    confident: stageEligible || strongEvidence,
    reason: stageEligible
      ? "stage>=machining"
      : strongEvidence
        ? "review/schedule evidence"
        : "insufficient evidence",
  };
}

function shippingSpendEvidence(reqDoc) {
  const stage = normalizeStage(reqDoc?.manufacturerStage);
  const hasPackage = Boolean(reqDoc?.shippingPackageId);
  const reviewPacking = String(reqDoc?.caseInfos?.reviewByStage?.packing?.status || "")
    .trim()
    .toLowerCase();
  const rollbackShipping = Number(reqDoc?.caseInfos?.rollbackCounts?.shipping || 0);
  const shipCode = String(reqDoc?.shippingWorkflow?.code || "").trim().toLowerCase();
  const stageEligible = ["포장.발송", "추적관리"].includes(stage);
  const workflowEvidence = ["accepted", "picked_up", "completed"].includes(shipCode);
  const strongEvidence = reviewPacking === "approved" || rollbackShipping > 0 || workflowEvidence;

  return {
    stage,
    hasPackage,
    stageEligible,
    strongEvidence,
    confident: hasPackage && (stageEligible || strongEvidence),
    reason: !hasPackage
      ? "no_shipping_package"
      : stageEligible
        ? "stage>=shipping"
        : strongEvidence
          ? "packing/workflow evidence"
          : "insufficient evidence",
  };
}

async function resolveAnchors(cli) {
  if (cli.allRequestors) {
    const query = { businessType: "requestor" };
    const cursor = BusinessAnchor.find(query)
      .select({ _id: 1, name: 1, businessType: 1 })
      .sort({ createdAt: -1 });
    if (cli.limit > 0) cursor.limit(cli.limit);
    return cursor.lean();
  }

  if (cli.anchorId) {
    const id = asObjectId(cli.anchorId);
    if (!id) throw new Error(`invalid --anchor: ${cli.anchorId}`);
    const anchor = await BusinessAnchor.findById(id)
      .select({ _id: 1, name: 1, businessType: 1 })
      .lean();
    return anchor ? [anchor] : [];
  }

  if (cli.businessName) {
    const anchor = await BusinessAnchor.findOne({
      $or: [{ name: cli.businessName }, { "metadata.companyName": cli.businessName }],
    })
      .select({ _id: 1, name: 1, businessType: 1 })
      .lean();
    return anchor ? [anchor] : [];
  }

  throw new Error(
    "usage: --all-requestors [--limit N] [--yes] [--allow-unverified] [--force-paid-fallback] OR --anchor <id> [--yes] OR --business-name <name> [--yes]",
  );
}



async function resolveRoleOwnerAnchors({ request, businessAnchorId }) {
  const requestorAnchor = await BusinessAnchor.findById(businessAnchorId)
    .select({ _id: 1, businessType: 1, referredByAnchorId: 1 })
    .lean();

  const devopsAnchor = await BusinessAnchor.findOne({
    businessType: "devops",
    status: { $ne: "merged" },
  })
    .select({ _id: 1, payoutRates: 1, createdAt: 1 })
    .sort({ createdAt: 1, _id: 1 })
    .lean();

  const adminAnchor = await BusinessAnchor.findOne({
    businessType: "admin",
    status: { $ne: "merged" },
  })
    .select({ _id: 1, createdAt: 1 })
    .sort({ createdAt: 1, _id: 1 })
    .lean();

  const manufacturerUserIdRaw = String(request?.caManufacturer || "").trim();
  const manufacturerUser = Types.ObjectId.isValid(manufacturerUserIdRaw)
    ? await User.findById(manufacturerUserIdRaw)
        .select({ _id: 1, businessAnchorId: 1 })
        .lean()
    : null;

  const referredAnchor = requestorAnchor?.referredByAnchorId
    ? await BusinessAnchor.findById(requestorAnchor.referredByAnchorId)
        .select({ _id: 1, businessType: 1 })
        .lean()
    : null;

  const hasSalesmanReferrer = referredAnchor?.businessType === "salesman";

  return {
    requestorAnchorId: requestorAnchor?._id || null,
    manufacturerAnchorId: manufacturerUser?.businessAnchorId || null,
    devopsAnchorId: devopsAnchor?._id || null,
    salesmanAnchorId: hasSalesmanReferrer ? referredAnchor?._id || null : null,
    adminAnchorId: adminAnchor?._id || null,
    hasSalesmanReferrer,
    configuredRates: resolveConfiguredRevenueRates(devopsAnchor?.payoutRates),
  };
}

function buildSpendCommitLines({
  spendAmount,
  paidAmount,
  freeAmount,
  freeAccountCode,
  owners,
  refType,
  refId,
  spendUniqueKey,
}) {
  const lines = [];

  if (freeAmount > 0) {
    lines.push({
      accountCode: freeAccountCode,
      ownerRole: "requestor",
      ownerId: owners.requestorAnchorId,
      amount: -freeAmount,
      creditKind: freeAccountCode === "REQ_FREE_SHIPPING_CREDIT" ? "FREE_SHIPPING" : "FREE_REQUEST",
      refType,
      refId,
      meta: { spendUniqueKey },
    });
  }

  if (paidAmount > 0) {
    lines.push({
      accountCode: "REQ_PAID_CREDIT",
      ownerRole: "requestor",
      ownerId: owners.requestorAnchorId,
      amount: -paidAmount,
      creditKind: "PAID",
      refType,
      refId,
      meta: { spendUniqueKey },
    });
  }

  const freeCreditKind =
    freeAccountCode === "REQ_FREE_SHIPPING_CREDIT" ? "FREE_SHIPPING" : "FREE_REQUEST";
  const revenueBaseByOwner = resolveRevenueOwnerBaseAllocation({
    spendAmount,
    hasSalesmanReferrer: owners.hasSalesmanReferrer,
    configuredRates: owners.configuredRates,
    owners,
    isShippingSpend: isShippingSpendRevenueContext({ refType, freeAccountCode }),
  });

  const assignManufacturer = revenueBaseByOwner.manufacturer;
  const assignDevops = revenueBaseByOwner.devops;
  const assignSalesman = revenueBaseByOwner.salesman;
  const adminBase = revenueBaseByOwner.admin;

  const revenueKindSplit = splitRevenueByCreditKindProRata({
    ownerBaseByRole: {
      manufacturer: assignManufacturer,
      devops: assignDevops,
      salesman: assignSalesman,
      admin: adminBase,
    },
    freeAmount,
  });

  const pushRevenueLinesBySplit = ({ accountCode, ownerRole, ownerId, paidBase, freeBase }) => {
    if (!ownerId) return;

    const paid = Math.max(0, Math.round(Number(paidBase || 0)));
    const free = Math.max(0, Math.round(Number(freeBase || 0)));

    if (free > 0) {
      const amountIncludingVat = withVat(free);
      lines.push({
        accountCode,
        ownerRole,
        ownerId,
        amount: amountIncludingVat,
        amountExcludingVat: free,
        vatAmount: amountIncludingVat - free,
        amountIncludingVat,
        creditKind: freeCreditKind,
        refType,
        refId,
        meta: { spendUniqueKey },
      });
    }

    if (paid > 0) {
      const amountIncludingVat = withVat(paid);
      lines.push({
        accountCode,
        ownerRole,
        ownerId,
        amount: amountIncludingVat,
        amountExcludingVat: paid,
        vatAmount: amountIncludingVat - paid,
        amountIncludingVat,
        creditKind: "PAID",
        refType,
        refId,
        meta: { spendUniqueKey },
      });
    }
  };

  pushRevenueLinesBySplit({
    accountCode: "REV_MANUFACTURER",
    ownerRole: "manufacturer",
    ownerId: owners.manufacturerAnchorId,
    paidBase: revenueKindSplit.manufacturer.paid,
    freeBase: revenueKindSplit.manufacturer.free,
  });
  pushRevenueLinesBySplit({
    accountCode: "REV_DEVOPS",
    ownerRole: "devops",
    ownerId: owners.devopsAnchorId,
    paidBase: revenueKindSplit.devops.paid,
    freeBase: revenueKindSplit.devops.free,
  });
  pushRevenueLinesBySplit({
    accountCode: "REV_SALESMAN",
    ownerRole: "salesman",
    ownerId: owners.salesmanAnchorId,
    paidBase: revenueKindSplit.salesman.paid,
    freeBase: revenueKindSplit.salesman.free,
  });
  pushRevenueLinesBySplit({
    accountCode: "REV_ADMIN",
    ownerRole: "admin",
    ownerId: owners.adminAnchorId,
    paidBase: revenueKindSplit.admin.paid,
    freeBase: revenueKindSplit.admin.free,
  });

  return lines;
}

async function resolveLegacyCollectionName() {
  const db = mongoose.connection.db;
  if (!db) return null;
  const names = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((c) => String(c?.name || ""))
    .filter(Boolean);
  const candidates = ["creditledgers", "creditledger", "CreditLedger"];
  for (const c of candidates) {
    if (names.includes(c)) return c;
  }
  return null;
}

async function buildLegacySpendMaps() {
  const name = await resolveLegacyCollectionName();
  if (!name) {
    return {
      requestMap: new Map(),
      shippingMap: new Map(),
      found: false,
    };
  }

  const coll = mongoose.connection.db.collection(name);
  const rows = await coll
    .find(
      {
        type: "SPEND",
        refType: { $in: ["REQUEST", "SHIPPING_PACKAGE", "SHIPPING_FEE"] },
      },
      {
        projection: {
          _id: 1,
          businessAnchorId: 1,
          refType: 1,
          refId: 1,
          amount: 1,
          spentPaidAmount: 1,
          spentFreeAmount: 1,
          createdAt: 1,
          uniqueKey: 1,
        },
      },
    )
    .toArray();

  const requestMap = new Map();
  const shippingMap = new Map();

  for (const row of rows || []) {
    const refType = String(row?.refType || "");
    const anchorId = String(row?.businessAnchorId || "").trim();
    const refId = String(row?.refId || "").trim();
    if (!anchorId || !refId) continue;

    const key = `${anchorId}:${refId}`;
    const target = refType === "REQUEST" ? requestMap : shippingMap;
    const arr = target.get(key) || [];
    arr.push(row);
    target.set(key, arr);
  }

  return { requestMap, shippingMap, found: true };
}

function summarizeLegacySplit(rows, expectedAmount) {
  const normalizedAmount = Math.max(0, Math.round(Number(expectedAmount || 0)));
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    return {
      ok: false,
      reason: "legacy_not_found",
      paid: 0,
      free: 0,
      amount: 0,
      rows: 0,
    };
  }

  let amountTotal = 0;
  let paidTotal = 0;
  let freeTotal = 0;
  let splitFieldCount = 0;

  for (const row of list) {
    const amount = Math.abs(Math.round(Number(row?.amount || 0)));
    amountTotal += amount;

    const paid = Number(row?.spentPaidAmount);
    const free = Number(row?.spentFreeAmount);
    if (Number.isFinite(paid) && Number.isFinite(free)) {
      splitFieldCount += 1;
      paidTotal += Math.max(0, Math.round(paid));
      freeTotal += Math.max(0, Math.round(free));
    }
  }

  if (amountTotal !== normalizedAmount) {
    return {
      ok: false,
      reason: "legacy_amount_mismatch",
      paid: 0,
      free: 0,
      amount: amountTotal,
      rows: list.length,
    };
  }

  if (splitFieldCount > 0) {
    if (paidTotal + freeTotal !== normalizedAmount) {
      return {
        ok: false,
        reason: "legacy_split_mismatch",
        paid: 0,
        free: 0,
        amount: amountTotal,
        rows: list.length,
      };
    }
    return {
      ok: true,
      reason: "legacy_split",
      paid: paidTotal,
      free: freeTotal,
      amount: amountTotal,
      rows: list.length,
    };
  }

  return {
    ok: false,
    reason: "legacy_split_missing",
    paid: 0,
    free: 0,
    amount: amountTotal,
    rows: list.length,
  };
}

function extractRequestSpendAmount(reqDoc) {
  const amount = Math.max(0, Math.round(Number(reqDoc?.price?.amount || 0)));
  return amount;
}

async function loadShippingFeeDefault() {
  const doc = await SystemSettings.findOne({ key: "global" })
    .select({ "creditSettings.shippingFee": 1 })
    .lean();
  const n = Number(doc?.creditSettings?.shippingFee || 0);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 3500;
}

function toObjectIdString(v) {
  if (!v) return "";
  return String(v).trim();
}

async function migrateAnchor(anchor, { cli, shippingFeeDefault, legacyMaps }) {
  const anchorId = toObjectIdString(anchor?._id);
  const requests = await Request.find({
    businessAnchorId: anchor._id,
  })
    .select({
      _id: 1,
      requestId: 1,
      businessAnchorId: 1,
      requestCategory: 1,
      manufacturerStage: 1,
      shippingPackageId: 1,
      price: 1,
      caManufacturer: 1,
      caseInfos: 1,
      productionSchedule: 1,
      shippingWorkflow: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    .sort({ createdAt: 1, _id: 1 })
    .lean();

  const packageIds = Array.from(
    new Set(
      requests
        .map((r) => String(r?.shippingPackageId || "").trim())
        .filter(Boolean)
        .filter((id) => Types.ObjectId.isValid(id)),
    ),
  );

  const packages = packageIds.length
    ? await ShippingPackage.find({ _id: { $in: packageIds } })
        .select({ _id: 1, shippingFeeSupply: 1, createdAt: 1, updatedAt: 1 })
        .lean()
    : [];
  const packageMap = new Map((packages || []).map((p) => [String(p._id), p]));

  const expectedRows = [];

  for (const req of requests || []) {
    if (isSampleRequest(req)) continue;

    const requestAmount = extractRequestSpendAmount(req);
    const requestEvidence = requestSpendEvidence(req);
    if (requestAmount > 0 && requestEvidence.confident) {
      const requestMongoId = String(req._id);
      expectedRows.push({
        kind: "REQUEST",
        eventType: "REQUEST_SPEND_COMMIT",
        businessAnchorId: anchorId,
        spendUniqueKey: `request:${requestMongoId}:machining_spend`,
        idempotencyKey: `gl:request:${requestMongoId}:machining_spend`,
        refType: "REQUEST",
        refId: requestMongoId,
        amount: requestAmount,
        freeAccountCode: "REQ_FREE_REQUEST_CREDIT",
        occurredAt: req?.updatedAt || req?.createdAt || new Date(),
        stageFrom: "CAM",
        stageTo: "가공",
        request: req,
        confidence: requestEvidence.reason,
      });
    }

    const shippingEvidence = shippingSpendEvidence(req);
    if (!shippingEvidence.confident) continue;

    const packageId = String(req?.shippingPackageId || "").trim();
    if (!packageId) continue;
    const pkg = packageMap.get(packageId);
    if (!pkg?._id) continue;

    const shippingAmountRaw = Number(pkg?.shippingFeeSupply);
    const shippingAmount =
      Number.isFinite(shippingAmountRaw) && shippingAmountRaw > 0
        ? Math.round(shippingAmountRaw)
        : shippingFeeDefault;

    if (shippingAmount <= 0) continue;

    expectedRows.push({
      kind: "SHIPPING",
      eventType: "SHIPPING_SPEND_COMMIT",
      businessAnchorId: anchorId,
      spendUniqueKey: `shippingPackage:${packageId}:shipping_fee`,
      idempotencyKey: `gl:shippingPackage:${packageId}:shipping_fee`,
      refType: "SHIPPING_PACKAGE",
      refId: packageId,
      amount: shippingAmount,
      freeAccountCode: "REQ_FREE_SHIPPING_CREDIT",
      occurredAt: pkg?.updatedAt || pkg?.createdAt || req?.updatedAt || req?.createdAt || new Date(),
      stageFrom: "세척.패킹",
      stageTo: "포장.발송",
      request: req,
      confidence: shippingEvidence.reason,
    });
  }

  const idempotencyKeys = expectedRows.map((r) => r.idempotencyKey);
  const existingJournals = idempotencyKeys.length
    ? await LedgerJournal.find({ idempotencyKey: { $in: idempotencyKeys } })
        .select({ journalId: 1, idempotencyKey: 1, eventType: 1 })
        .lean()
    : [];
  const existingByKey = new Map((existingJournals || []).map((j) => [String(j.idempotencyKey), j]));

  let existingCount = 0;
  let missingCount = 0;
  let migratedCount = 0;
  let skippedUnverifiedCount = 0;
  let unresolvedCount = 0;
  const unresolvedSamples = [];

  for (const row of expectedRows) {
    const existing = existingByKey.get(row.idempotencyKey);
    if (existing?.journalId) {
      existingCount += 1;
      continue;
    }

    missingCount += 1;

    const legacyKey = `${anchorId}:${String(row.refId)}`;
    const legacyRows =
      row.kind === "REQUEST"
        ? legacyMaps.requestMap.get(legacyKey) || []
        : legacyMaps.shippingMap.get(legacyKey) || [];

    let split = summarizeLegacySplit(legacyRows, row.amount);
    let verification = split.reason;

    if (!split.ok && (cli.forcePaidFallback || cli.allowUnverified)) {
      split = {
        ok: true,
        reason: cli.forcePaidFallback ? "paid_fallback" : "paid_fallback_allow_unverified",
        paid: row.amount,
        free: 0,
        amount: row.amount,
        rows: legacyRows.length,
      };
      verification = split.reason;
    }

    if (!split.ok) {
      unresolvedCount += 1;
      skippedUnverifiedCount += 1;
      if (unresolvedSamples.length < 20) {
        unresolvedSamples.push({
          requestId: row.request?.requestId || null,
          kind: row.kind,
          refId: row.refId,
          amount: row.amount,
          reason: split.reason,
          confidence: row.confidence,
          legacyRows: legacyRows.length,
        });
      }
      continue;
    }

    if (!cli.execute) continue;

    const owners = await resolveRoleOwnerAnchors({
      request: row.request,
      businessAnchorId: row.businessAnchorId,
    });

    if (!owners?.requestorAnchorId) {
      unresolvedCount += 1;
      if (unresolvedSamples.length < 20) {
        unresolvedSamples.push({
          requestId: row.request?.requestId || null,
          kind: row.kind,
          refId: row.refId,
          amount: row.amount,
          reason: "owner_resolution_failed",
          confidence: row.confidence,
          legacyRows: legacyRows.length,
        });
      }
      continue;
    }

    const paidAmount = Math.max(0, Math.round(Number(split.paid || 0)));
    const freeAmount = Math.max(0, Math.round(Number(split.free || 0)));

    const lines = buildSpendCommitLines({
      spendAmount: row.amount,
      paidAmount,
      freeAmount,
      freeAccountCode: row.freeAccountCode,
      owners,
      refType: row.refType,
      refId: row.refId,
      spendUniqueKey: row.spendUniqueKey,
    });

    if (!lines.length) {
      unresolvedCount += 1;
      continue;
    }

    const posted = await postGeneralLedgerJournal({
      idempotencyKey: row.idempotencyKey,
      eventType: row.eventType,
      businessAnchorId: row.businessAnchorId,
      refType: row.refType,
      refId: row.refId,
      stageFrom: row.stageFrom,
      stageTo: row.stageTo,
      occurredAt: row.occurredAt,
      createdBy: null,
      meta: {
        spendUniqueKey: row.spendUniqueKey,
        requestId: row.request?.requestId || null,
        requestMongoId: row.request?._id ? String(row.request._id) : null,
        requestCategory: String(row.request?.requestCategory || "").trim() || null,
        spendAmount: row.amount,
        paidAmount,
        freeAmount,
        migration: {
          source: "request_history_verification",
          verification,
          confidence: row.confidence,
          legacyRows: legacyRows.length,
        },
      },
      lines,
    });

    if (posted?.posted) migratedCount += 1;
  }

  if (cli.execute) {
    await upsertBusinessCreditBalanceFromLedger({ businessAnchorId: anchorId });
  }

  return {
    anchorId,
    anchorName: String(anchor?.name || "").trim() || "(no-name)",
    scannedRequests: requests.length,
    expectedCount: expectedRows.length,
    existingCount,
    missingCount,
    migratedCount,
    skippedUnverifiedCount,
    unresolvedCount,
    unresolvedSamples,
  };
}

async function run() {
  const cli = parseCliArgs(process.argv || []);

  const mode = cli.execute ? "APPLY" : "DRY_RUN";
  console.log(`[migrate-request-spend-to-gl] mode=${mode}`);
  if (cli.execute && cli.allowUnverified && !cli.forcePaidFallback) {
    console.log(
      "[migrate-request-spend-to-gl] execute mode with --allow-unverified: unverified legacy splits use paid fallback (paid=row.amount, free=0).",
    );
  }

  await connectDb();

  try {
    const shippingFeeDefault = await loadShippingFeeDefault();
    const anchors = await resolveAnchors(cli);
    const legacyMaps = await buildLegacySpendMaps();

    console.log(
      `[migrate-request-spend-to-gl] targets=${anchors.length} shippingFeeDefault=${shippingFeeDefault} legacyCollectionFound=${legacyMaps.found}`,
    );

    let totalExpected = 0;
    let totalExisting = 0;
    let totalMissing = 0;
    let totalMigrated = 0;
    let totalSkipped = 0;
    let totalUnresolved = 0;

    for (const anchor of anchors) {
      const result = await migrateAnchor(anchor, {
        cli,
        shippingFeeDefault,
        legacyMaps,
      });

      totalExpected += result.expectedCount;
      totalExisting += result.existingCount;
      totalMissing += result.missingCount;
      totalMigrated += result.migratedCount;
      totalSkipped += result.skippedUnverifiedCount;
      totalUnresolved += result.unresolvedCount;

      console.log(
        `[anchor] ${result.anchorName} (${result.anchorId}) requests=${result.scannedRequests} expected=${result.expectedCount} existing=${result.existingCount} missing=${result.missingCount} migrated=${result.migratedCount} skipped=${result.skippedUnverifiedCount} unresolved=${result.unresolvedCount}`,
      );

      if (result.unresolvedSamples.length > 0) {
        for (const sample of result.unresolvedSamples.slice(0, 5)) {
          console.log(
            `  - unresolved kind=${sample.kind} requestId=${sample.requestId || "-"} refId=${sample.refId} amount=${sample.amount} reason=${sample.reason} confidence=${sample.confidence} legacyRows=${sample.legacyRows}`,
          );
        }
      }
    }

    console.log("\n[migrate-request-spend-to-gl] summary");
    console.log(`- expected: ${totalExpected}`);
    console.log(`- existing: ${totalExisting}`);
    console.log(`- missing: ${totalMissing}`);
    console.log(`- migrated: ${totalMigrated}`);
    console.log(`- skipped(unverified): ${totalSkipped}`);
    console.log(`- unresolved: ${totalUnresolved}`);

    if (!cli.execute) {
      console.log(
        "\n[migrate-request-spend-to-gl] dry-run complete. Re-run with --yes to migrate verified missing commits.",
      );
    }
  } finally {
    await disconnectDb();
  }
}

run().catch((error) => {
  console.error("[migrate-request-spend-to-gl] failed", error?.message || error);
  process.exit(1);
});

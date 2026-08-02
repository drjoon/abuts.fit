// related files:
// - web/backend/rules.md
// - web/backend/scripts/db/_mongo.js
// - web/backend/scripts/db/migrate-request-spend-to-gl.js
// - web/backend/models/request.model.js
// - web/backend/models/shippingPackage.model.js
// - web/backend/models/ledgerJournal.model.js
// - web/backend/models/ledgerLine.model.js
// - web/backend/services/generalLedger.service.js
// - web/backend/services/creditBalance.service.js
import mongoose, { Types } from "mongoose";
import { connectDb, disconnectDb } from "./_mongo.js";
import Request from "../../models/request.model.js";
import User from "../../models/user.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import ShippingPackage from "../../models/shippingPackage.model.js";
import LedgerJournal from "../../models/ledgerJournal.model.js";
import LedgerLine from "../../models/ledgerLine.model.js";
import { postGeneralLedgerJournal } from "../../services/generalLedger.service.js";
import { upsertBusinessCreditBalanceFromLedger } from "../../services/creditBalance.service.js";

const WITH_SALESMAN_DEFAULT_RATES = {
  manufacturerRate: 0.6,
  devopsRate: 0.1,
  salesmanRate: 0.1,
  adminRate: 0.2,
};
const WITHOUT_SALESMAN_RATES = {
  manufacturerRate: 0.65,
  devopsRate: 0.1,
  salesmanRate: 0,
  adminRate: 0.25,
};
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
    forcePaidFallback: args.includes("--force-paid-fallback"),
    allowUnverified: args.includes("--allow-unverified"),
    purgeRequestHistory: args.includes("--purge-request-history"),
  };

  const anchorIdx = args.findIndex((a) => a === "--anchor");
  if (anchorIdx >= 0 && args[anchorIdx + 1]) out.anchorId = String(args[anchorIdx + 1] || "").trim();

  const nameIdx = args.findIndex((a) => a === "--business-name");
  if (nameIdx >= 0 && args[nameIdx + 1]) out.businessName = String(args[nameIdx + 1] || "").trim();

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

function toObjectIdString(v) {
  if (!v) return "";
  return String(v).trim();
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
    reqDoc?.productionSchedule?.actualMachiningStart || reqDoc?.productionSchedule?.actualCamComplete,
  );

  const stageEligible = ["가공", "세척.패킹", "포장.발송", "추적관리"].includes(stage);
  const strongEvidence =
    reviewCam === "approved" || rollbackMachining > 0 || hasMachiningFile || hasMachiningSchedule;

  return {
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
    "usage: --all-requestors [--limit N] [--yes] OR --anchor <id> [--yes] OR --business-name <name> [--yes]",
  );
}

function resolveRevenueBaseAllocation({ spendAmount, hasSalesmanReferrer, configuredRates }) {
  const effectiveRates = hasSalesmanReferrer ? configuredRates : WITHOUT_SALESMAN_RATES;

  const plannedManufacturerBaseAmount = Math.round(
    spendAmount * Number(effectiveRates.manufacturerRate || 0),
  );
  const plannedDevopsBaseAmount = Math.round(spendAmount * Number(effectiveRates.devopsRate || 0));
  const plannedSalesmanBaseAmount = hasSalesmanReferrer
    ? Math.round(spendAmount * Number(effectiveRates.salesmanRate || 0))
    : 0;
  const plannedAdminBaseAmount = Math.max(
    spendAmount - plannedManufacturerBaseAmount - plannedDevopsBaseAmount - plannedSalesmanBaseAmount,
    0,
  );

  return {
    manufacturer: plannedManufacturerBaseAmount,
    devops: plannedDevopsBaseAmount,
    salesman: plannedSalesmanBaseAmount,
    admin: plannedAdminBaseAmount,
  };
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
    configuredRates: {
      manufacturerRate: Number(
        devopsAnchor?.payoutRates?.manufacturerRate ?? WITH_SALESMAN_DEFAULT_RATES.manufacturerRate,
      ),
      devopsRate: Number(devopsAnchor?.payoutRates?.devopsRate ?? WITH_SALESMAN_DEFAULT_RATES.devopsRate),
      salesmanRate: Number(
        devopsAnchor?.payoutRates?.salesmanRate ?? WITH_SALESMAN_DEFAULT_RATES.salesmanRate,
      ),
      adminRate: Number(devopsAnchor?.payoutRates?.adminRate ?? WITH_SALESMAN_DEFAULT_RATES.adminRate),
    },
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

  const planned = resolveRevenueBaseAllocation({
    spendAmount,
    hasSalesmanReferrer: owners.hasSalesmanReferrer,
    configuredRates: owners.configuredRates,
  });
  const freeCreditKind =
    freeAccountCode === "REQ_FREE_SHIPPING_CREDIT" ? "FREE_SHIPPING" : "FREE_REQUEST";

  let assignManufacturer = owners.manufacturerAnchorId ? planned.manufacturer : 0;
  let assignDevops = owners.devopsAnchorId ? planned.devops : 0;
  let assignSalesman = owners.salesmanAnchorId ? planned.salesman : 0;
  let adminBase =
    planned.admin +
    (planned.manufacturer - assignManufacturer) +
    (planned.devops - assignDevops) +
    (planned.salesman - assignSalesman);

  const allocatedTotal = assignManufacturer + assignDevops + assignSalesman + adminBase;
  const allocationGap = spendAmount - allocatedTotal;
  if (allocationGap !== 0) adminBase += allocationGap;

  const pushRevenueLinesByCreditKind = ({ accountCode, ownerRole, ownerId, baseAmount }) => {
    const base = Math.max(0, Math.round(Number(baseAmount || 0)));
    if (!ownerId || base <= 0) return;

    if (paidAmount > 0 && freeAmount > 0) {
      const paidBase = Math.min(base, Math.round((base * paidAmount) / spendAmount));
      const freeBase = Math.max(0, base - paidBase);

      if (paidBase > 0) {
        const amountIncludingVat = withVat(paidBase);
        lines.push({
          accountCode,
          ownerRole,
          ownerId,
          amount: amountIncludingVat,
          amountExcludingVat: paidBase,
          vatAmount: amountIncludingVat - paidBase,
          amountIncludingVat,
          creditKind: "PAID",
          refType,
          refId,
          meta: { spendUniqueKey },
        });
      }

      if (freeBase > 0) {
        const amountIncludingVat = withVat(freeBase);
        lines.push({
          accountCode,
          ownerRole,
          ownerId,
          amount: amountIncludingVat,
          amountExcludingVat: freeBase,
          vatAmount: amountIncludingVat - freeBase,
          amountIncludingVat,
          creditKind: freeCreditKind,
          refType,
          refId,
          meta: { spendUniqueKey },
        });
      }
      return;
    }

    const creditKind = paidAmount > 0 ? "PAID" : freeCreditKind;
    const amountIncludingVat = withVat(base);
    lines.push({
      accountCode,
      ownerRole,
      ownerId,
      amount: amountIncludingVat,
      amountExcludingVat: base,
      vatAmount: amountIncludingVat - base,
      amountIncludingVat,
      creditKind,
      refType,
      refId,
      meta: { spendUniqueKey },
    });
  };

  pushRevenueLinesByCreditKind({
    accountCode: "REV_MANUFACTURER",
    ownerRole: "manufacturer",
    ownerId: owners.manufacturerAnchorId,
    baseAmount: assignManufacturer,
  });
  pushRevenueLinesByCreditKind({
    accountCode: "REV_DEVOPS",
    ownerRole: "devops",
    ownerId: owners.devopsAnchorId,
    baseAmount: assignDevops,
  });
  pushRevenueLinesByCreditKind({
    accountCode: "REV_SALESMAN",
    ownerRole: "salesman",
    ownerId: owners.salesmanAnchorId,
    baseAmount: assignSalesman,
  });
  pushRevenueLinesByCreditKind({
    accountCode: "REV_ADMIN",
    ownerRole: "admin",
    ownerId: owners.adminAnchorId,
    baseAmount: adminBase,
  });

  return lines;
}

function invertLines(lines) {
  return (Array.isArray(lines) ? lines : []).map((line) => ({
    ...line,
    amount: -Number(line?.amount || 0),
    amountExcludingVat:
      line?.amountExcludingVat === null || line?.amountExcludingVat === undefined
        ? null
        : -Number(line.amountExcludingVat),
    vatAmount:
      line?.vatAmount === null || line?.vatAmount === undefined
        ? 0
        : -Number(line.vatAmount),
    amountIncludingVat:
      line?.amountIncludingVat === null || line?.amountIncludingVat === undefined
        ? null
        : -Number(line.amountIncludingVat),
  }));
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

function normalizeLegacySplit(row, amountAbs, cli, defaultFreeAccountCode) {
  const paidRaw = Math.max(0, Math.round(Number(row?.spentPaidAmount || 0)));
  const freeRaw = Math.max(0, Math.round(Number(row?.spentFreeAmount || 0)));

  if (paidRaw + freeRaw === amountAbs && (paidRaw > 0 || freeRaw > 0)) {
    return { ok: true, paid: paidRaw, free: freeRaw, reason: "legacy_split" };
  }

  if (amountAbs <= 0) {
    return { ok: false, paid: 0, free: 0, reason: "zero_amount" };
  }

  if (cli.forcePaidFallback || cli.allowUnverified) {
    if (defaultFreeAccountCode) {
      return {
        ok: true,
        paid: 0,
        free: amountAbs,
        reason: cli.forcePaidFallback ? "legacy_free_fallback_forced" : "legacy_free_fallback_unverified",
      };
    }
    return {
      ok: true,
      paid: amountAbs,
      free: 0,
      reason: cli.forcePaidFallback ? "legacy_paid_fallback_forced" : "legacy_paid_fallback_unverified",
    };
  }

  return { ok: false, paid: 0, free: 0, reason: "legacy_split_missing_or_mismatch" };
}

function resolveChargeMapping(row) {
  const refType = String(row?.refType || "").trim();
  if (refType === "WELCOME_BONUS") {
    return {
      eventType: "CHARGE_FREE_REQUEST",
      accountCode: "REQ_FREE_REQUEST_CREDIT",
      creditKind: "FREE_REQUEST",
    };
  }
  if (refType === "FREE_SHIPPING_CREDIT") {
    return {
      eventType: "CHARGE_FREE_SHIPPING",
      accountCode: "REQ_FREE_SHIPPING_CREDIT",
      creditKind: "FREE_SHIPPING",
    };
  }
  if (refType === "CHARGE_ORDER") {
    return {
      eventType: "CHARGE_PAID",
      accountCode: "REQ_PAID_CREDIT",
      creditKind: "PAID",
    };
  }
  return null;
}

async function purgeRequestHistoryMigrationForAnchor(anchorId) {
  const journals = await LedgerJournal.find({
    businessAnchorId: anchorId,
    "meta.migration.source": "request_history_verification",
    eventType: { $in: ["REQUEST_SPEND_COMMIT", "SHIPPING_SPEND_COMMIT"] },
  })
    .select({ journalId: 1 })
    .lean();

  const ids = journals.map((j) => String(j?.journalId || "")).filter(Boolean);
  if (!ids.length) return { deletedJournals: 0, deletedLines: 0 };

  const deleteLines = await LedgerLine.deleteMany({ journalId: { $in: ids } });
  const deleteJournals = await LedgerJournal.deleteMany({ journalId: { $in: ids } });

  return {
    deletedJournals: Number(deleteJournals?.deletedCount || 0),
    deletedLines: Number(deleteLines?.deletedCount || 0),
  };
}

async function buildAnchorContext(anchorId, legacyRows) {
  const requestRows = await Request.find({ businessAnchorId: anchorId })
    .select({
      _id: 1,
      requestId: 1,
      requestCategory: 1,
      manufacturerStage: 1,
      shippingPackageId: 1,
      caManufacturer: 1,
      caseInfos: 1,
      productionSchedule: 1,
      shippingWorkflow: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    .lean();

  const requestById = new Map((requestRows || []).map((r) => [String(r._id), r]));

  const packageIdSet = new Set(
    (requestRows || [])
      .map((r) => String(r?.shippingPackageId || "").trim())
      .filter((id) => Types.ObjectId.isValid(id)),
  );

  for (const row of legacyRows || []) {
    if (String(row?.refType || "") !== "SHIPPING_PACKAGE") continue;
    const refId = String(row?.refId || "").trim();
    if (Types.ObjectId.isValid(refId)) packageIdSet.add(refId);
  }

  const packageIds = Array.from(packageIdSet);
  const packageRows = packageIds.length
    ? await ShippingPackage.find({ _id: { $in: packageIds } })
        .select({ _id: 1, requestIds: 1, shippingFeeSupply: 1, createdAt: 1, updatedAt: 1 })
        .lean()
    : [];
  const packageById = new Map((packageRows || []).map((p) => [String(p._id), p]));

  return { requestById, packageById };
}

function pickRepresentativeRequestForPackage(pkg, requestById) {
  const requestIds = Array.isArray(pkg?.requestIds) ? pkg.requestIds : [];
  for (const reqId of requestIds) {
    const req = requestById.get(String(reqId));
    if (req && !isSampleRequest(req)) return req;
  }
  return requestById.get(String(requestIds[0] || "")) || null;
}

async function migrateAnchor(anchor, { cli, legacyCollectionName }) {
  const anchorId = toObjectIdString(anchor?._id);
  const coll = mongoose.connection.db.collection(legacyCollectionName);

  const legacyRows = await coll
    .find({ businessAnchorId: new Types.ObjectId(anchorId) })
    .sort({ createdAt: 1, _id: 1 })
    .toArray();

  const legacyIds = legacyRows.map((r) => String(r?._id || "")).filter(Boolean);
  const idempotencyKeys = legacyIds.map((id) => `gl:legacy_creditledger:${id}`);
  const existingJournals = idempotencyKeys.length
    ? await LedgerJournal.find({ idempotencyKey: { $in: idempotencyKeys } })
        .select({ idempotencyKey: 1, journalId: 1 })
        .lean()
    : [];
  const existingKeySet = new Set((existingJournals || []).map((j) => String(j?.idempotencyKey || "")));

  const context = await buildAnchorContext(anchor._id, legacyRows);

  let migratedCount = 0;
  let existingCount = 0;
  let unresolvedCount = 0;
  let resolvedIgnoredCount = 0;
  let skippedInvalidSampleCount = 0;
  const unresolvedSamples = [];

  const orphanShippingPairKeySet = new Set();
  const shippingPairMap = new Map();
  for (const row of legacyRows || []) {
    const type = String(row?.type || "").trim().toUpperCase();
    const refType = String(row?.refType || "").trim();
    const refId = String(row?.refId || "").trim();
    const amountAbs = Math.abs(Math.round(Number(row?.amount || 0)));
    if ((type !== "SPEND" && type !== "REFUND") || refType !== "SHIPPING_PACKAGE") continue;
    if (!refId || !Types.ObjectId.isValid(refId) || amountAbs <= 0) continue;
    const key = `${refId}:${amountAbs}`;
    const prev = shippingPairMap.get(key) || { hasSpend: false, hasRefund: false };
    if (type === "SPEND") prev.hasSpend = true;
    if (type === "REFUND") prev.hasRefund = true;
    shippingPairMap.set(key, prev);
  }
  for (const [k, v] of shippingPairMap.entries()) {
    if (v.hasSpend && v.hasRefund) orphanShippingPairKeySet.add(k);
  }

  for (const row of legacyRows) {
    const legacyId = String(row?._id || "").trim();
    if (!legacyId) continue;

    const idempotencyKey = `gl:legacy_creditledger:${legacyId}`;
    if (existingKeySet.has(idempotencyKey)) {
      existingCount += 1;
      continue;
    }

    const type = String(row?.type || "").trim().toUpperCase();
    const refType = String(row?.refType || "").trim();
    const refIdRaw = String(row?.refId || "").trim();
    const refId = Types.ObjectId.isValid(refIdRaw) ? refIdRaw : null;
    const amountSigned = Math.round(Number(row?.amount || 0));
    const amountAbs = Math.abs(amountSigned);
    const occurredAt = row?.createdAt || row?.updatedAt || new Date();

    if (amountAbs <= 0) {
      resolvedIgnoredCount += 1;
      continue;
    }

    let eventType = "";
    let lines = [];
    let reason = "";
    let confidence = "legacy";
    let request = null;

    if (type === "CHARGE") {
      const chargeMap = resolveChargeMapping(row);
      if (!chargeMap) {
        unresolvedCount += 1;
        if (unresolvedSamples.length < 20) {
          unresolvedSamples.push({ legacyId, type, refType, amount: amountSigned, reason: "unsupported_charge_refType" });
        }
        continue;
      }

      eventType = chargeMap.eventType;
      lines = [
        {
          accountCode: chargeMap.accountCode,
          ownerRole: "requestor",
          ownerId: anchorId,
          amount: amountAbs,
          amountExcludingVat: amountAbs,
          vatAmount: 0,
          amountIncludingVat: amountAbs,
          creditKind: chargeMap.creditKind,
          refType,
          refId,
          meta: { legacyId },
        },
      ];
      reason = "legacy_charge";
    } else if (type === "SPEND" || type === "REFUND") {
      if (refType !== "REQUEST" && refType !== "SHIPPING_PACKAGE") {
        unresolvedCount += 1;
        if (unresolvedSamples.length < 20) {
          unresolvedSamples.push({ legacyId, type, refType, amount: amountSigned, reason: "unsupported_spend_refType" });
        }
        continue;
      }

      let freeAccountCode = refType === "SHIPPING_PACKAGE" ? "REQ_FREE_SHIPPING_CREDIT" : "REQ_FREE_REQUEST_CREDIT";

      if (!refId || !Types.ObjectId.isValid(refId)) {
        unresolvedCount += 1;
        if (unresolvedSamples.length < 20) {
          unresolvedSamples.push({ legacyId, type, refType, amount: amountSigned, reason: "invalid_ref_id" });
        }
        continue;
      }

      if (refType === "REQUEST") {
        request = context.requestById.get(refId) || null;
        if (!request) {
          unresolvedCount += 1;
          if (unresolvedSamples.length < 20) {
            unresolvedSamples.push({ legacyId, type, refType, refId, amount: amountSigned, reason: "request_not_found" });
          }
          continue;
        }
        if (isSampleRequest(request)) {
          skippedInvalidSampleCount += 1;
          continue;
        }

        const ev = requestSpendEvidence(request);
        confidence = ev.reason;
        if (!ev.confident && !cli.allowUnverified) {
          unresolvedCount += 1;
          if (unresolvedSamples.length < 20) {
            unresolvedSamples.push({ legacyId, type, refType, refId, amount: amountSigned, reason: "request_insufficient_evidence" });
          }
          continue;
        }
      } else {
        const pkg = context.packageById.get(refId) || null;
        if (!pkg) {
          const orphanPairKey = `${refId}:${amountAbs}`;
          if (orphanShippingPairKeySet.has(orphanPairKey)) {
            resolvedIgnoredCount += 1;
            continue;
          }
          unresolvedCount += 1;
          if (unresolvedSamples.length < 20) {
            unresolvedSamples.push({ legacyId, type, refType, refId, amount: amountSigned, reason: "shipping_package_not_found" });
          }
          continue;
        }
        request = pickRepresentativeRequestForPackage(pkg, context.requestById);
        if (request && isSampleRequest(request)) {
          skippedInvalidSampleCount += 1;
          continue;
        }
        if (request) {
          const ev = shippingSpendEvidence(request);
          confidence = ev.reason;
          if (!ev.confident && !cli.allowUnverified) {
            unresolvedCount += 1;
            if (unresolvedSamples.length < 20) {
              unresolvedSamples.push({ legacyId, type, refType, refId, amount: amountSigned, reason: "shipping_insufficient_evidence" });
            }
            continue;
          }
        } else {
          confidence = "package_without_request_context";
        }
      }

      const split = normalizeLegacySplit(row, amountAbs, cli, freeAccountCode);
      if (!split.ok) {
        unresolvedCount += 1;
        if (unresolvedSamples.length < 20) {
          unresolvedSamples.push({ legacyId, type, refType, refId, amount: amountSigned, reason: split.reason });
        }
        continue;
      }

      const owners = await resolveRoleOwnerAnchors({
        request,
        businessAnchorId: anchorId,
      });
      if (!owners?.requestorAnchorId) {
        unresolvedCount += 1;
        if (unresolvedSamples.length < 20) {
          unresolvedSamples.push({ legacyId, type, refType, refId, amount: amountSigned, reason: "owner_resolution_failed" });
        }
        continue;
      }

      const spendUniqueKey = String(row?.uniqueKey || `legacy:${legacyId}`).trim();
      const spendLines = buildSpendCommitLines({
        spendAmount: amountAbs,
        paidAmount: split.paid,
        freeAmount: split.free,
        freeAccountCode,
        owners,
        refType,
        refId,
        spendUniqueKey,
      });

      if (!spendLines.length) {
        unresolvedCount += 1;
        if (unresolvedSamples.length < 20) {
          unresolvedSamples.push({ legacyId, type, refType, refId, amount: amountSigned, reason: "empty_lines" });
        }
        continue;
      }

      if (type === "SPEND") {
        eventType = refType === "SHIPPING_PACKAGE" ? "SHIPPING_SPEND_COMMIT" : "REQUEST_SPEND_COMMIT";
        lines = spendLines;
        reason = split.reason;
      } else {
        eventType = "ADJUST";
        lines = invertLines(spendLines);
        reason = `legacy_refund:${split.reason}`;
      }
    } else if (type === "ADJUST") {
      eventType = "ADJUST";
      lines = [
        {
          accountCode: "REQ_PAID_CREDIT",
          ownerRole: "requestor",
          ownerId: anchorId,
          amount: amountSigned,
          amountExcludingVat: amountSigned,
          vatAmount: 0,
          amountIncludingVat: amountSigned,
          creditKind: "PAID",
          refType,
          refId,
          meta: { legacyId },
        },
      ];
      reason = "legacy_adjust";
    } else {
      unresolvedCount += 1;
      if (unresolvedSamples.length < 20) {
        unresolvedSamples.push({ legacyId, type, amount: amountSigned, reason: "unsupported_legacy_type" });
      }
      continue;
    }

    if (!cli.execute) continue;

    const result = await postGeneralLedgerJournal({
      idempotencyKey,
      eventType,
      businessAnchorId: anchorId,
      refType,
      refId,
      occurredAt,
      createdBy: null,
      meta: {
        migration: {
          source: "legacy_creditledger_rewrite",
          legacyId,
          reason,
          confidence,
        },
        legacy: {
          type,
          amount: amountSigned,
          spentPaidAmount: Number(row?.spentPaidAmount || 0),
          spentFreeAmount: Number(row?.spentFreeAmount || 0),
          uniqueKey: String(row?.uniqueKey || "") || null,
          memo: String(row?.memo || "") || null,
        },
      },
      lines,
    });

    if (result?.posted) migratedCount += 1;
  }

  let purge = { deletedJournals: 0, deletedLines: 0 };
  if (cli.execute && cli.purgeRequestHistory) {
    purge = await purgeRequestHistoryMigrationForAnchor(anchor._id);
  }

  if (cli.execute) {
    await upsertBusinessCreditBalanceFromLedger({ businessAnchorId: anchorId });
  }

  return {
    anchorId,
    anchorName: String(anchor?.name || "").trim() || "(no-name)",
    legacyCount: legacyRows.length,
    existingCount,
    migratedCount,
    unresolvedCount,
    resolvedIgnoredCount,
    skippedInvalidSampleCount,
    purge,
    unresolvedSamples,
  };
}

async function run() {
  const cli = parseCliArgs(process.argv || []);
  const mode = cli.execute ? "APPLY" : "DRY_RUN";
  console.log(`[migrate-legacy-creditledger-to-gl] mode=${mode}`);

  await connectDb();

  try {
    const legacyCollectionName = await resolveLegacyCollectionName();
    if (!legacyCollectionName) {
      throw new Error("legacy creditledger collection not found");
    }

    const anchors = await resolveAnchors(cli);
    console.log(
      `[migrate-legacy-creditledger-to-gl] targets=${anchors.length} legacyCollection=${legacyCollectionName}`,
    );

    let totalLegacy = 0;
    let totalExisting = 0;
    let totalMigrated = 0;
    let totalUnresolved = 0;
    let totalResolvedIgnored = 0;
    let totalSkippedSample = 0;
    let totalPurgedJournals = 0;

    for (const anchor of anchors) {
      const r = await migrateAnchor(anchor, { cli, legacyCollectionName });
      totalLegacy += r.legacyCount;
      totalExisting += r.existingCount;
      totalMigrated += r.migratedCount;
      totalUnresolved += r.unresolvedCount;
      totalResolvedIgnored += r.resolvedIgnoredCount;
      totalSkippedSample += r.skippedInvalidSampleCount;
      totalPurgedJournals += Number(r?.purge?.deletedJournals || 0);

      console.log(
        `[anchor] ${r.anchorName} (${r.anchorId}) legacy=${r.legacyCount} existing=${r.existingCount} migrated=${r.migratedCount} unresolved=${r.unresolvedCount} resolvedIgnored=${r.resolvedIgnoredCount} skippedSample=${r.skippedInvalidSampleCount} purgedHistory=${r.purge.deletedJournals}`,
      );

      if (r.unresolvedSamples.length > 0) {
        for (const sample of r.unresolvedSamples.slice(0, 8)) {
          console.log(
            `  - unresolved legacyId=${sample.legacyId} type=${sample.type} refType=${sample.refType || "-"} refId=${sample.refId || "-"} amount=${sample.amount} reason=${sample.reason}`,
          );
        }
      }
    }

    console.log("\n[migrate-legacy-creditledger-to-gl] summary");
    console.log(`- legacyRows: ${totalLegacy}`);
    console.log(`- existing: ${totalExisting}`);
    console.log(`- migrated: ${totalMigrated}`);
    console.log(`- unresolved: ${totalUnresolved}`);
    console.log(`- resolvedIgnored: ${totalResolvedIgnored}`);
    console.log(`- skippedInvalidSample: ${totalSkippedSample}`);
    console.log(`- purgedHistoryJournals: ${totalPurgedJournals}`);

    if (!cli.execute) {
      console.log(
        "\n[migrate-legacy-creditledger-to-gl] dry-run complete. Re-run with --yes to apply migration.",
      );
    }
  } finally {
    await disconnectDb();
  }
}

run().catch((error) => {
  console.error("[migrate-legacy-creditledger-to-gl] failed", error?.message || error);
  process.exit(1);
});

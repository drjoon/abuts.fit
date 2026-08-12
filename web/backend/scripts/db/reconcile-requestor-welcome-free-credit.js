// related files:
// - web/backend/rules.md
// - web/backend/controllers/businesses/business.freeCredit.util.js
// - web/backend/models/freeCreditGrant.model.js
// - web/backend/services/generalLedger.service.js
//
// Reconciles existing requestor welcome free credits in MONGODB_URI_TEST:
// - practice anchors: reverse all active welcome grants through an ADJUST journal.
// - lab anchors with a real business number: create missing request/shipping welcome grants.
// Ledger subaccounts remain distinct for audit; balance APIs expose their sum as freeCredit.
//
// Usage:
//   ENV_FILE=test.env node scripts/db/reconcile-requestor-welcome-free-credit.js
//   ENV_FILE=test.env ABUTS_DB_FORCE=true node scripts/db/reconcile-requestor-welcome-free-credit.js --apply

import dotenv from "dotenv";
import mongoose from "mongoose";
import crypto from "crypto";
import FreeCreditGrant from "../../models/freeCreditGrant.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import { loadCreditSettingsDefaults } from "../../utils/creditSettingsDefaults.js";
import { normalizeRequestorCapabilities, normalizeRequestorKind } from "../../utils/requestorCapabilities.js";
import { postGeneralLedgerJournal } from "../../services/generalLedger.service.js";
import { assertSafeToMutateDb } from "./_mongo.js";

const APPLY = process.argv.includes("--apply");
const WELCOME_TYPES = [
  "REQUEST_FREE_CREDIT",
  "WELCOME_BONUS",
  "SHIPPING_FREE_CREDIT",
  "FREE_SHIPPING_CREDIT",
];

function normalizeBusinessNumber(value) {
  return String(value || "").replace(/\D/g, "");
}

function isRealBusinessNumber(value) {
  return /^\d{10}$/.test(normalizeBusinessNumber(value));
}

function getAnchorKind(anchor) {
  const kind = normalizeRequestorKind(anchor?.requestorKind);
  if (kind) return kind;
  const caps = normalizeRequestorCapabilities(anchor?.requestorCapabilities);
  if (caps.lab && !caps.practice) return "lab";
  if (caps.practice && !caps.lab) return "practice";
  return null;
}

function isShippingGrant(type) {
  return ["SHIPPING_FREE_CREDIT", "FREE_SHIPPING_CREDIT"].includes(
    String(type || "").trim().toUpperCase(),
  );
}

function canonicalGrantType(type) {
  return isShippingGrant(type) ? "SHIPPING_FREE_CREDIT" : "REQUEST_FREE_CREDIT";
}

async function resolveAnchorForGrant(grant, anchorsById, anchorsByBusinessNumber) {
  const byId = anchorsById.get(String(grant.businessAnchorId || ""));
  if (byId) return byId;
  return anchorsByBusinessNumber.get(normalizeBusinessNumber(grant.businessNumber)) || null;
}

async function reversePracticeGrant(grant, anchor) {
  const amount = Math.max(0, Math.round(Number(grant.amount || 0)));
  if (!amount) return { posted: false, skipped: true };

  const shipping = isShippingGrant(grant.type);
  const result = await postGeneralLedgerJournal({
    journalId: crypto.randomUUID(),
    idempotencyKey: `gl:free_credit_grant_cancel:${String(grant._id)}`,
    eventType: "ADJUST",
    businessAnchorId: anchor._id,
    refType: "FREE_CREDIT_CANCEL",
    refId: grant._id,
    meta: {
      freeCreditGrantId: String(grant._id),
      cancelReason: "requestor_kind_practice_welcome_credit_ineligible",
      source: "requestor_welcome_credit_reconcile",
    },
    lines: [{
      accountCode: shipping
        ? "REQ_FREE_SHIPPING_CREDIT"
        : "REQ_FREE_REQUEST_CREDIT",
      ownerRole: "requestor",
      ownerId: anchor._id,
      amount: -amount,
      amountExcludingVat: -amount,
      vatAmount: 0,
      amountIncludingVat: -amount,
      creditKind: shipping ? "FREE_SHIPPING" : "FREE_REQUEST",
      refType: "FREE_CREDIT_CANCEL",
      refId: grant._id,
    }],
  });

  if (result.posted || result.idempotent) {
    await FreeCreditGrant.updateOne(
      { _id: grant._id, canceledAt: null },
      {
        $set: {
          canceledAt: new Date(),
          cancelReason: "requestor_kind_practice_welcome_credit_ineligible",
          cancelJournalId: String(result.journalId || ""),
        },
      },
    );
  }
  return result;
}

async function createMissingLabGrant({ anchor, type, amount }) {
  const businessNumber = normalizeBusinessNumber(
    anchor.businessNumberNormalized || anchor?.metadata?.businessNumber,
  );
  const canonicalType = canonicalGrantType(type);
  const existing = await FreeCreditGrant.findOne({
    type: { $in: canonicalType === "SHIPPING_FREE_CREDIT"
      ? ["SHIPPING_FREE_CREDIT", "FREE_SHIPPING_CREDIT"]
      : ["REQUEST_FREE_CREDIT", "WELCOME_BONUS"] },
    businessNumber,
    isOverride: false,
  }).lean();
  if (existing) return { created: false, reason: "already-granted" };

  const grant = await FreeCreditGrant.create({
    type: canonicalType,
    businessNumber,
    amount,
    businessAnchorId: anchor._id,
    userId: anchor.primaryContactUserId || null,
    isOverride: false,
    source: "migrated",
  });
  const shipping = canonicalType === "SHIPPING_FREE_CREDIT";
  const result = await postGeneralLedgerJournal({
    idempotencyKey: `gl:free_credit_grant:${String(grant._id)}`,
    eventType: shipping ? "CHARGE_FREE_SHIPPING" : "CHARGE_FREE_REQUEST",
    businessAnchorId: anchor._id,
    refType: shipping ? "FREE_SHIPPING_CREDIT" : "FREE_REQUEST_CREDIT",
    refId: grant._id,
    createdBy: anchor.primaryContactUserId || null,
    meta: {
      memo: "환영 무료크레딧",
      freeCreditGrantId: String(grant._id),
      source: "requestor_welcome_credit_reconcile",
    },
    lines: [{
      accountCode: shipping
        ? "REQ_FREE_SHIPPING_CREDIT"
        : "REQ_FREE_REQUEST_CREDIT",
      ownerRole: "requestor",
      ownerId: anchor._id,
      amount,
      amountExcludingVat: amount,
      vatAmount: 0,
      amountIncludingVat: amount,
      creditKind: shipping ? "FREE_SHIPPING" : "FREE_REQUEST",
      refType: shipping ? "FREE_SHIPPING_CREDIT" : "FREE_REQUEST_CREDIT",
      refId: grant._id,
    }],
  });
  await FreeCreditGrant.updateOne(
    { _id: grant._id },
    { $set: { grantJournalId: String(result.journalId || "") } },
  );
  return { created: true, grantId: String(grant._id), journalId: result.journalId };
}

async function main() {
  dotenv.config({ path: process.env.ENV_FILE || "test.env" });
  const uri = process.env.MONGODB_URI_TEST || process.env.MONGO_URI_TEST;
  if (!uri) throw new Error("MONGODB_URI_TEST is required.");
  if (!/abuts[_-]?fit/i.test(uri.split("?")[0])) {
    throw new Error("MONGODB_URI_TEST does not target an abuts-fit database.");
  }
  if (APPLY) assertSafeToMutateDb(uri);

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  try {
    const [anchors, grants, defaults] = await Promise.all([
      BusinessAnchor.find({ businessType: "requestor" })
        .select({
          _id: 1,
          businessNumberNormalized: 1,
          requestorKind: 1,
          requestorCapabilities: 1,
          metadata: 1,
          primaryContactUserId: 1,
          name: 1,
        })
        .lean(),
      FreeCreditGrant.find({ type: { $in: WELCOME_TYPES } }).lean(),
      loadCreditSettingsDefaults(),
    ]);

    const anchorsById = new Map(anchors.map((anchor) => [String(anchor._id), anchor]));
    const anchorsByBusinessNumber = new Map(
      anchors
        .map((anchor) => [
          normalizeBusinessNumber(anchor.businessNumberNormalized || anchor?.metadata?.businessNumber),
          anchor,
        ])
        .filter(([businessNumber]) => businessNumber),
    );
    const practiceGrants = [];
    const labGrantKeys = new Set();
    const unresolvedGrants = [];
    const unattachedLegacyGrantIds = [];

    for (const grant of grants) {
      const attachedAnchor = anchorsById.get(String(grant.businessAnchorId || ""));
      const anchor = attachedAnchor || await resolveAnchorForGrant(
        grant,
        anchorsById,
        anchorsByBusinessNumber,
      );
      if (!anchor) {
        unresolvedGrants.push(String(grant._id));
        continue;
      }
      // Legacy grants that only share the same business number may not have
      // posted GL lines for this current anchor. They are historical records,
      // not current-anchor balances, and must never create a reversal debt.
      if (!attachedAnchor) {
        unattachedLegacyGrantIds.push(String(grant._id));
        const kind = getAnchorKind(anchor);
        if (kind === "lab") {
          labGrantKeys.add(
            `${String(anchor._id)}:${canonicalGrantType(grant.type)}`,
          );
        }
        continue;
      }
      const kind = getAnchorKind(anchor);
      if (kind === "practice" && !grant.canceledAt) practiceGrants.push({ grant, anchor });
      if (kind === "lab") {
        labGrantKeys.add(
          `${String(anchor._id)}:${canonicalGrantType(grant.type)}`,
        );
      }
    }

    const eligibleLabs = anchors.filter((anchor) =>
      getAnchorKind(anchor) === "lab" &&
      isRealBusinessNumber(anchor.businessNumberNormalized || anchor?.metadata?.businessNumber),
    );
    const missingLabGrants = eligibleLabs.flatMap((anchor) => {
      const missing = [];
      if (!labGrantKeys.has(`${String(anchor._id)}:REQUEST_FREE_CREDIT`)) {
        missing.push({ anchor, type: "REQUEST_FREE_CREDIT", amount: defaults.defaultRequestFreeCredit });
      }
      if (!labGrantKeys.has(`${String(anchor._id)}:SHIPPING_FREE_CREDIT`)) {
        missing.push({ anchor, type: "SHIPPING_FREE_CREDIT", amount: defaults.defaultShippingFreeCredit });
      }
      return missing;
    }).filter((item) => Number(item.amount) > 0);

    const summary = {
      mode: APPLY ? "apply" : "dry-run",
      requestorAnchors: anchors.length,
      eligibleLabs: eligibleLabs.length,
      welcomeDefaults: {
        request: defaults.defaultRequestFreeCredit,
        shipping: defaults.defaultShippingFreeCredit,
        combinedFreeCredit: defaults.defaultRequestFreeCredit + defaults.defaultShippingFreeCredit,
      },
      practiceWelcomeGrantsToReverse: practiceGrants.length,
      practiceWelcomeAmountToReverse: practiceGrants.reduce((sum, { grant }) => sum + Number(grant.amount || 0), 0),
      labWelcomeGrantsToCreate: missingLabGrants.length,
      labWelcomeAmountToCreate: missingLabGrants.reduce((sum, item) => sum + Number(item.amount || 0), 0),
      unresolvedGrantCount: unresolvedGrants.length,
      unattachedLegacyGrantCount: unattachedLegacyGrantIds.length,
    };
    console.log(JSON.stringify(summary, null, 2));

    if (!APPLY) {
      console.log("Dry run only. Re-run with --apply after taking a backup.");
      return;
    }

    const applied = { reversed: 0, created: 0 };
    for (const { grant, anchor } of practiceGrants) {
      const result = await reversePracticeGrant(grant, anchor);
      if (result.posted || result.idempotent) applied.reversed += 1;
    }
    for (const item of missingLabGrants) {
      const result = await createMissingLabGrant(item);
      if (result.created) applied.created += 1;
    }
    console.log(JSON.stringify({ ...summary, applied }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("[reconcile-requestor-welcome-free-credit] failed", error?.stack || error);
  process.exit(1);
});

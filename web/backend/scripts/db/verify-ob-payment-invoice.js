// One-off check against MONGODB_URI_TEST. Deletes only rows this run created.
// ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true node scripts/db/verify-ob-payment-invoice.js
import { Types } from "mongoose";
import { connectDb, disconnectDb, getDbNameFromMongoUri } from "./_mongo.js";
import mongoose from "mongoose";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import Request from "../../models/request.model.js";
import TaxInvoiceDraft from "../../models/taxInvoiceDraft.model.js";
import LedgerJournal from "../../models/ledgerJournal.model.js";
import LedgerLine from "../../models/ledgerLine.model.js";
import { aggregatePracticeMonthUsage } from "../../services/practiceObBilling.service.js";
import { issuePracticeObPaymentInvoices } from "../../services/practiceObPaymentInvoice.service.js";
import { generateMonthlyCustomerInvoiceDrafts } from "../../services/customerMonthlyInvoice.service.js";

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const stamp = Date.now().toString().slice(-8);
const bn = (n) => `9${stamp}${n}`.slice(0, 10);
const createdAnchorIds = [];
const journalIds = [];

async function main() {
  const { mongoUri } = await connectDb();
  const dbName = getDbNameFromMongoUri(mongoUri);
  const liveName = mongoose.connection.db?.databaseName;
  console.log("[verify-ob-invoice] db", { dbName, liveName });
  assert(dbName === "abuts_fit_test", `expected abuts_fit_test, got ${dbName}`);
  assert(liveName === "abuts_fit_test", `connected db is ${liveName}`);

  const practice = await BusinessAnchor.create({
    businessNumberNormalized: bn(1),
    businessType: "requestor",
    requestorKind: "practice",
    practiceHasInHouseLab: false,
    name: `invtest-practice-${stamp}`,
    metadata: { companyName: `invtest-practice-${stamp}` },
  });
  const lab = await BusinessAnchor.create({
    businessNumberNormalized: bn(2),
    businessType: "requestor",
    requestorKind: "lab",
    name: `invtest-lab-${stamp}`,
    metadata: { companyName: `invtest-lab-${stamp}` },
  });
  const optedOut = await BusinessAnchor.create({
    businessNumberNormalized: bn(3),
    businessType: "requestor",
    requestorKind: "lab",
    name: `invtest-optout-${stamp}`,
    metadata: { companyName: `invtest-optout-${stamp}` },
    taxInvoice: { trusteeIssueEnabled: false },
  });
  const inHouse = await BusinessAnchor.create({
    businessNumberNormalized: bn(4),
    businessType: "requestor",
    requestorKind: "practice",
    practiceHasInHouseLab: true,
    name: `invtest-inhouse-${stamp}`,
    metadata: { companyName: `invtest-inhouse-${stamp}` },
  });
  createdAnchorIds.push(practice._id, lab._id, optedOut._id, inHouse._id);

  const settlementId = new Types.ObjectId();
  const split = {
    storeSupplyAmount: 18_182,
    storeVatAmount: 1_818,
    storeTotalAmount: 20_000,
    abutmentAmount: 30_000,
  };
  const settlement = {
    _id: settlementId,
    practiceAnchorId: practice._id,
    yearMonth: "2098-09",
    lines: [
      {
        payeeKind: "direct_lab",
        payeeAnchorId: lab._id,
        amount: 100_000,
        transferStatus: "SUCCESS",
      },
      {
        payeeKind: "direct_lab",
        payeeAnchorId: optedOut._id,
        amount: 40_000,
        transferStatus: "SUCCESS",
      },
      {
        payeeKind: "abuts_corp",
        amount: 50_000,
        transferStatus: "SUCCESS",
      },
    ],
  };

  const first = await issuePracticeObPaymentInvoices({
    settlement,
    invoiceSplit: split,
    now: new Date("2098-10-05T00:00:00+09:00"),
  });
  assert(first.created === 3, `created ${first.created}, expected 3`);
  assert(first.skippedOptOut === 1, `opt-out ${first.skippedOptOut}`);

  const drafts = await TaxInvoiceDraft.find({
    businessAnchorId: practice._id,
  }).lean();
  const labDraft = drafts.find((d) => d.direction === "LAB_TO_PRACTICE");
  const storeDraft = drafts.find(
    (d) => d.direction === "ABUTS_TO_CUSTOMER" && d.taxType === "과세",
  );
  const abutmentDraft = drafts.find(
    (d) => d.direction === "ABUTS_TO_CUSTOMER" && d.taxType === "면세",
  );
  assert(labDraft?.issuanceMode === "TRUSTEE", "lab invoice is trustee");
  assert(String(labDraft.sellerAnchorId) === String(lab._id), "seller is performing lab");
  assert(labDraft.supplyAmount === 100_000 && labDraft.vatAmount === 0, "lab amount");
  assert(labDraft.itemName === "기공서비스(면세 계산서)", "lab item");
  assert(
    storeDraft?.issuanceMode === "SELF" &&
      storeDraft.supplyAmount === 18_182 &&
      storeDraft.vatAmount === 1_818 &&
      storeDraft.totalAmount === 20_000,
    "store tax invoice split",
  );
  assert(
    abutmentDraft?.issuanceMode === "SELF" &&
      abutmentDraft.supplyAmount === 30_000 &&
      abutmentDraft.vatAmount === 0,
    "abutment exempt invoice",
  );

  const second = await issuePracticeObPaymentInvoices({
    settlement,
    invoiceSplit: split,
    now: new Date("2098-10-05T00:00:00+09:00"),
  });
  assert(second.created === 0, `second created ${second.created}`);
  assert(second.skippedExisting === 3, `second skipped ${second.skippedExisting}`);

  const userId = new Types.ObjectId();
  const createdAt = new Date("2098-09-15T10:00:00+09:00");
  await PracticeTransfer.create({
    transferId: `invtest-ptx-${stamp}`,
    practiceUserId: userId,
    practiceBusinessAnchorId: inHouse._id,
    targetLabAnchorId: lab._id,
    status: "active",
    createdAt,
    billing: { labFeeTotal: 80_000, abutmentRetailTotal: 15_000 },
  });
  await Request.create({
    businessAnchorId: inHouse._id,
    requestor: userId,
    requestCategory: "order",
    manufacturerStage: "준비",
    createdAt,
    price: { amount: 45_000, paidAmount: 45_000 },
  });
  const usage = await aggregatePracticeMonthUsage({
    practiceAnchorId: inHouse._id,
    yearMonth: "2098-09",
  });
  assert(usage.directLabTotal === 80_000, `lab total ${usage.directLabTotal}`);
  assert(usage.abutmentAmount === 15_000, `abutment ${usage.abutmentAmount}`);
  assert(usage.abutsCorpTotal === 15_000, `corp ${usage.abutsCorpTotal}`);

  const periodStart = new Date("2098-11-01T00:00:00+09:00");
  const periodEnd = new Date("2098-12-01T00:00:00+09:00");
  const occurredAt = new Date("2098-11-10T03:00:00+09:00");
  const labJournalId = `invtest-lab-${stamp}`;
  const practiceJournalId = `invtest-practice-${stamp}`;
  journalIds.push(labJournalId, practiceJournalId);
  await LedgerJournal.create([
    {
      journalId: labJournalId,
      idempotencyKey: labJournalId,
      eventType: "REQUEST_SPEND_COMMIT",
      businessAnchorId: lab._id,
      occurredAt,
    },
    {
      journalId: practiceJournalId,
      idempotencyKey: practiceJournalId,
      eventType: "REQUEST_SPEND_COMMIT",
      businessAnchorId: practice._id,
      occurredAt,
    },
  ]);
  await LedgerLine.create([
    {
      journalId: labJournalId,
      lineNo: 1,
      businessAnchorId: lab._id,
      accountCode: "REQ_PAID_CREDIT",
      ownerRole: "requestor",
      ownerId: lab._id,
      amount: -12_000,
      amountExcludingVat: -12_000,
      vatAmount: 0,
      creditKind: "PAID",
      occurredAt,
    },
    {
      journalId: practiceJournalId,
      lineNo: 1,
      businessAnchorId: practice._id,
      accountCode: "REQ_PAID_CREDIT",
      ownerRole: "requestor",
      ownerId: practice._id,
      amount: -9_000,
      amountExcludingVat: -9_000,
      vatAmount: 0,
      creditKind: "PAID",
      occurredAt,
    },
  ]);

  const monthly = await generateMonthlyCustomerInvoiceDrafts({
    periodStart,
    periodEnd,
  });
  const monthlyDrafts = await TaxInvoiceDraft.find({
    businessAnchorId: { $in: [lab._id, practice._id, inHouse._id] },
    sourceRefType: "EXEMPT_SPEND",
    periodStart,
  }).lean();
  assert(monthly.taxable.created === 0, "store monthly drafts must not be created");
  assert(
    monthlyDrafts.length === 1 && String(monthlyDrafts[0].businessAnchorId) === String(lab._id),
    `monthly buyers ${monthlyDrafts.map((d) => d.itemName).join(",")}`,
  );
  assert(monthlyDrafts[0].supplyAmount === 12_000, `monthly amount ${monthlyDrafts[0].supplyAmount}`);
  assert(monthlyDrafts[0].taxType === "면세", "monthly custom abutment is exempt");
  assert(monthlyDrafts[0].direction === "ABUTS_TO_CUSTOMER", "seller is abuts");

  console.log("[verify-ob-invoice] ok", {
    obCreated: first.created,
    monthlyExemptCreated: monthly.exempt.created,
    labMonthly: monthlyDrafts[0].supplyAmount,
  });
}

main()
  .catch((err) => {
    console.error("[verify-ob-invoice] failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      if (mongoose.connection.readyState === 1 && createdAnchorIds.length) {
        await TaxInvoiceDraft.deleteMany({
          $or: [
            { businessAnchorId: { $in: createdAnchorIds } },
            { sellerAnchorId: { $in: createdAnchorIds } },
          ],
        });
        await PracticeTransfer.deleteMany({
          practiceBusinessAnchorId: { $in: createdAnchorIds },
        });
        await Request.deleteMany({ businessAnchorId: { $in: createdAnchorIds } });
        if (journalIds.length) {
          await LedgerLine.deleteMany({ journalId: { $in: journalIds } });
          await LedgerJournal.deleteMany({ journalId: { $in: journalIds } });
        }
        await BusinessAnchor.deleteMany({ _id: { $in: createdAnchorIds } });
        console.log("[verify-ob-invoice] cleaned fixtures");
      }
    } catch (cleanupErr) {
      console.error("[verify-ob-invoice] cleanup failed", cleanupErr);
      process.exitCode = 1;
    }
    await disconnectDb().catch(() => {});
  });

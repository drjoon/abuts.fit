#!/usr/bin/env node
// related files:
// - web/backend/services/customerMonthlyInvoice.service.js
// - web/backend/services/practiceLabInvoice.service.js
// - web/backend/utils/popbill.util.js
// - web/frontend/src/pages/admin/system/AdminTaxInvoices.tsx
//
// 재무 (세금)계산서 콘솔 시뮬레이션 검증.
// 팝빌 registIssue는 호출하지 않고, 초안 생성·승인·payload 조립·정책 가드만 확인.
//
// Usage:
//   cd web/backend && \
//   ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//   node scripts/db/verify-tax-invoice-console.js [--apply-approve]
import mongoose from "mongoose";
import { connectDb, getMongoUri } from "./_mongo.js";
import {
  generateMonthlyCustomerInvoiceDrafts,
  resolvePreviousKstMonthRange,
} from "../../services/customerMonthlyInvoice.service.js";
import {
  generateMonthlyLabToPracticeInvoiceDrafts,
  LAB_TO_PRACTICE_INVOICE_GENERATION_ENABLED,
} from "../../services/practiceLabInvoice.service.js";
import TaxInvoiceDraft from "../../models/taxInvoiceDraft.model.js";
import { buildTaxinvoiceObject } from "../../utils/popbill.util.js";

function ok(label, pass, detail = "") {
  const mark = pass ? "PASS" : "FAIL";
  console.log(`[${mark}] ${label}${detail ? ` — ${detail}` : ""}`);
  return pass;
}

async function main() {
  const applyApprove = process.argv.includes("--apply-approve");
  const { mongoUri } = await connectDb();
  console.log("[info] connected", { db: String(mongoUri).split("/").pop()?.split("?")[0] });

  const results = [];
  const range = resolvePreviousKstMonthRange();
  const periodStart = range.periodStart;
  const periodEnd = range.periodEnd;
  console.log("[info] period", {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
  });

  results.push(
    ok(
      "LAB_TO_PRACTICE generation flag is off",
      LAB_TO_PRACTICE_INVOICE_GENERATION_ENABLED === false,
      `enabled=${LAB_TO_PRACTICE_INVOICE_GENERATION_ENABLED}`,
    ),
  );

  const labResult = await generateMonthlyLabToPracticeInvoiceDrafts({
    periodStart,
    periodEnd,
  });
  results.push(
    ok(
      "LAB_TO_PRACTICE generate is no-op (disabled)",
      labResult?.disabled === true && Number(labResult?.created || 0) === 0,
      JSON.stringify(labResult),
    ),
  );

  const beforePending = await TaxInvoiceDraft.countDocuments({
    status: "PENDING_APPROVAL",
    direction: "ABUTS_TO_CUSTOMER",
  });

  const customerResult = await generateMonthlyCustomerInvoiceDrafts({
    periodStart,
    periodEnd,
  });
  console.log("[info] customer monthly generate", customerResult);

  const afterPending = await TaxInvoiceDraft.countDocuments({
    status: "PENDING_APPROVAL",
    direction: "ABUTS_TO_CUSTOMER",
  });

  const createdExempt = Number(customerResult?.exempt?.created || 0);
  const createdTaxable = Number(customerResult?.taxable?.created || 0);
  const skippedExempt = Number(customerResult?.exempt?.skippedExisting || 0);
  const skippedTaxable = Number(customerResult?.taxable?.skippedExisting || 0);

  results.push(
    ok(
      "customer monthly generate returns exempt/taxable buckets",
      customerResult?.exempt && customerResult?.taxable,
      `exempt created=${createdExempt} skipped=${skippedExempt}; taxable created=${createdTaxable} skipped=${skippedTaxable}`,
    ),
  );

  results.push(
    ok(
      "pending ABUTS_TO_CUSTOMER count did not drop",
      afterPending >= beforePending,
      `before=${beforePending} after=${afterPending}`,
    ),
  );

  const sample = await TaxInvoiceDraft.findOne({
    direction: "ABUTS_TO_CUSTOMER",
    status: { $in: ["PENDING_APPROVAL", "APPROVED"] },
    kind: { $ne: "REVERSE" },
  })
    .sort({ updatedAt: -1 })
    .lean();

  if (!sample) {
    results.push(
      ok(
        "have at least one ABUTS_TO_CUSTOMER draft to simulate",
        false,
        "no draft found — period may have zero paid spend/store sales",
      ),
    );
  } else {
    results.push(
      ok(
        "sample draft has buyer + amounts",
        Boolean(sample.buyer?.corpName || sample.buyer?.bizNo) &&
          Number(sample.totalAmount || 0) > 0,
        `id=${sample._id} taxType=${sample.taxType} buyerKind=${sample.buyerKind} total=${sample.totalAmount} status=${sample.status}`,
      ),
    );

    results.push(
      ok(
        "sample draft is SELF (customer lane)",
        sample.issuanceMode === "SELF" || !sample.issuanceMode,
        `issuanceMode=${sample.issuanceMode}`,
      ),
    );

    const mgtKey = `SIM${String(sample._id).slice(-12)}`;
    let payload = null;
    try {
      payload = buildTaxinvoiceObject({ draft: sample, mgtKey });
      results.push(
        ok(
          "buildTaxinvoiceObject (popbill payload sim)",
          Boolean(payload?.invoicerMgtKey || payload?.invoicer?.corpNum || payload?.writeDate),
          `issueType=${payload?.issueType} taxType=${payload?.taxType} writeDate=${payload?.writeDate} supply=${payload?.supplyCostTotal} tax=${payload?.taxTotal}`,
        ),
      );
      results.push(
        ok(
          "payload taxType matches draft",
          String(payload?.taxType || "") === String(sample.taxType || "과세"),
          `draft=${sample.taxType} payload=${payload?.taxType}`,
        ),
      );
    } catch (err) {
      results.push(
        ok("buildTaxinvoiceObject (popbill payload sim)", false, err.message),
      );
    }

    if (applyApprove && sample.status === "PENDING_APPROVAL") {
      const now = new Date();
      await TaxInvoiceDraft.updateOne(
        { _id: sample._id, status: "PENDING_APPROVAL" },
        { $set: { status: "APPROVED", approvedAt: now, failReason: null } },
      );
      const refreshed = await TaxInvoiceDraft.findById(sample._id).lean();
      results.push(
        ok(
          "simulate approve PENDING_APPROVAL→APPROVED",
          refreshed?.status === "APPROVED",
          `id=${sample._id}`,
        ),
      );
    } else if (sample.status === "PENDING_APPROVAL") {
      console.log(
        "[info] skip approve mutate (pass --apply-approve to flip one draft)",
      );
      results.push(
        ok(
          "approve path is available (dry)",
          true,
          "PENDING_APPROVAL sample present; use --apply-approve to mutate",
        ),
      );
    } else {
      results.push(
        ok(
          "approve path already exercised on sample",
          sample.status === "APPROVED" || sample.status === "SENT",
          `status=${sample.status}`,
        ),
      );
    }
  }

  const byStatus = await TaxInvoiceDraft.aggregate([
    {
      $match: {
        $or: [{ kind: { $exists: false } }, { kind: "NORMAL" }],
      },
    },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const stats = Object.fromEntries(byStatus.map((r) => [r._id, r.count]));
  const reverseSent = await TaxInvoiceDraft.countDocuments({
    kind: "REVERSE",
    status: "SENT",
  });
  console.log("[info] stats", { ...stats, REVERSE_SENT: reverseSent });

  const laneCounts = await TaxInvoiceDraft.aggregate([
    {
      $group: {
        _id: {
          direction: "$direction",
          buyerKind: "$buyerKind",
          taxType: "$taxType",
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
  ]);
  console.log(
    "[info] lanes",
    laneCounts.map((r) => ({
      direction: r._id.direction,
      buyerKind: r._id.buyerKind,
      taxType: r._id.taxType,
      count: r.count,
    })),
  );

  const failed = results.filter((r) => !r).length;
  console.log(
    failed === 0
      ? `\nOK — ${results.length}/${results.length} checks passed`
      : `\nDONE — ${results.length - failed}/${results.length} passed, ${failed} failed`,
  );

  await mongoose.disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("[fatal]", err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});

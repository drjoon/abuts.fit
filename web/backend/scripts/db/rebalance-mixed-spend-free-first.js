// related files:
// - web/backend/rules.md
// - web/backend/scripts/db/_mongo.js
// - web/backend/models/ledgerJournal.model.js
// - web/backend/models/ledgerLine.model.js
// - web/backend/models/businessAnchor.model.js
// - web/backend/services/creditRevenuePolicy.service.js
import mongoose, { Types } from "mongoose";
import { connectDb, disconnectDb } from "./_mongo.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import LedgerJournal from "../../models/ledgerJournal.model.js";
import LedgerLine from "../../models/ledgerLine.model.js";
import {
  REVENUE_OWNER_ORDER,
  splitRevenueByCreditKindProRata,
} from "../../services/creditRevenuePolicy.service.js";

const VAT_RATE = 0.1;

function withVat(base) {
  return Math.round(Number(base || 0) * (1 + VAT_RATE));
}

function parseCliArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice(2) : [];
  const out = {
    execute: args.includes("--yes"),
    allRequestors: args.includes("--all-requestors"),
    anchorId: "",
    businessName: "",
    limit: 0,
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

function toObjectId(raw) {
  const s = String(raw || "").trim();
  if (!s || !Types.ObjectId.isValid(s)) return null;
  return new Types.ObjectId(s);
}

async function resolveAnchorIds(cli) {
  if (cli.allRequestors) {
    const cursor = BusinessAnchor.find({ businessType: "requestor" })
      .select({ _id: 1 })
      .sort({ createdAt: -1 });
    if (cli.limit > 0) cursor.limit(cli.limit);
    const rows = await cursor.lean();
    return rows.map((r) => String(r._id));
  }

  if (cli.anchorId) {
    const id = toObjectId(cli.anchorId);
    if (!id) throw new Error(`invalid --anchor: ${cli.anchorId}`);
    return [String(id)];
  }

  if (cli.businessName) {
    const doc = await BusinessAnchor.findOne({
      $or: [{ name: cli.businessName }, { "metadata.companyName": cli.businessName }],
    })
      .select({ _id: 1 })
      .lean();
    return doc?._id ? [String(doc._id)] : [];
  }

  throw new Error(
    "usage: --all-requestors [--limit N] [--yes] OR --anchor <id> [--yes] OR --business-name <name> [--yes]",
  );
}

function baseAbs(line) {
  return Math.max(
    0,
    Math.round(Math.abs(Number(line?.amountExcludingVat ?? line?.amount ?? 0))),
  );
}

function collectRequestorCreditSplit(lines) {
  let paid = 0;
  let freeRequest = 0;
  let freeShipping = 0;

  for (const line of lines || []) {
    if (String(line?.ownerRole || "") !== "requestor") continue;
    const account = String(line?.accountCode || "");
    const base = baseAbs(line);
    if (base <= 0) continue;

    if (account === "REQ_PAID_CREDIT") paid += base;
    else if (account === "REQ_FREE_REQUEST_CREDIT") freeRequest += base;
    else if (account === "REQ_FREE_SHIPPING_CREDIT") freeShipping += base;
  }

  return {
    paid,
    freeRequest,
    freeShipping,
    freeTotal: freeRequest + freeShipping,
    total: paid + freeRequest + freeShipping,
  };
}

function collectRevenueBases(lines) {
  const ownerBaseByRole = {
    manufacturer: 0,
    devops: 0,
    salesman: 0,
    admin: 0,
  };

  const ownerIdByRole = {
    manufacturer: null,
    devops: null,
    salesman: null,
    admin: null,
  };

  const currentKindByRole = {
    manufacturer: { paid: 0, freeRequest: 0, freeShipping: 0 },
    devops: { paid: 0, freeRequest: 0, freeShipping: 0 },
    salesman: { paid: 0, freeRequest: 0, freeShipping: 0 },
    admin: { paid: 0, freeRequest: 0, freeShipping: 0 },
  };

  for (const line of lines || []) {
    const role = String(line?.ownerRole || "");
    if (!REVENUE_OWNER_ORDER.includes(role)) continue;

    const account = String(line?.accountCode || "");
    if (!account.startsWith("REV_")) continue;

    const base = Math.max(0, Math.round(Number(line?.amountExcludingVat ?? line?.amount ?? 0)));
    if (base <= 0) continue;

    ownerBaseByRole[role] += base;
    if (!ownerIdByRole[role] && line?.ownerId) {
      ownerIdByRole[role] = String(line.ownerId);
    }

    const creditKind = line?.creditKind;
    if (creditKind === "FREE_REQUEST") currentKindByRole[role].freeRequest += base;
    else if (creditKind === "FREE_SHIPPING") currentKindByRole[role].freeShipping += base;
    else currentKindByRole[role].paid += base; // PAID|null
  }

  return { ownerBaseByRole, ownerIdByRole, currentKindByRole };
}

function allocateIntegerByWeights({ total, weightByRole }) {
  const normalizedTotal = Math.max(0, Math.round(Number(total || 0)));
  const roles = REVENUE_OWNER_ORDER.filter((role) => Number(weightByRole?.[role] || 0) > 0);
  const out = Object.fromEntries(REVENUE_OWNER_ORDER.map((role) => [role, 0]));
  if (normalizedTotal <= 0 || roles.length <= 0) return out;

  const weightSum = roles.reduce((sum, role) => sum + Number(weightByRole[role] || 0), 0);
  if (weightSum <= 0) return out;

  const rows = roles.map((role) => {
    const weight = Math.max(0, Math.round(Number(weightByRole[role] || 0)));
    const raw = (normalizedTotal * weight) / weightSum;
    const floorVal = Math.floor(raw);
    return { role, weight, raw, floorVal, frac: raw - floorVal };
  });

  let used = 0;
  for (const row of rows) {
    out[row.role] = row.floorVal;
    used += row.floorVal;
  }

  let remain = Math.max(0, normalizedTotal - used);
  rows.sort((a, b) => {
    if (b.frac !== a.frac) return b.frac - a.frac;
    return REVENUE_OWNER_ORDER.indexOf(a.role) - REVENUE_OWNER_ORDER.indexOf(b.role);
  });

  let idx = 0;
  while (remain > 0 && rows.length > 0) {
    const role = rows[idx % rows.length].role;
    if (out[role] < Number(weightByRole[role] || 0)) {
      out[role] += 1;
      remain -= 1;
    }
    idx += 1;
    if (idx > rows.length * 1000) break;
  }

  return out;
}

function allocateFreePoolsByRole({ ownerBaseByRole, freeRequest, freeShipping }) {
  const totalFree = Math.max(
    0,
    Math.round(Number(freeRequest || 0)) + Math.round(Number(freeShipping || 0)),
  );

  const splitByRole = splitRevenueByCreditKindProRata({
    ownerBaseByRole,
    freeAmount: totalFree,
  });

  const freeCapByRole = {
    manufacturer: Number(splitByRole.manufacturer.free || 0),
    devops: Number(splitByRole.devops.free || 0),
    salesman: Number(splitByRole.salesman.free || 0),
    admin: Number(splitByRole.admin.free || 0),
  };

  const allocFreeRequest = allocateIntegerByWeights({
    total: Math.max(0, Math.round(Number(freeRequest || 0))),
    weightByRole: freeCapByRole,
  });

  const remainingFreeCapByRole = {
    manufacturer: Math.max(0, freeCapByRole.manufacturer - allocFreeRequest.manufacturer),
    devops: Math.max(0, freeCapByRole.devops - allocFreeRequest.devops),
    salesman: Math.max(0, freeCapByRole.salesman - allocFreeRequest.salesman),
    admin: Math.max(0, freeCapByRole.admin - allocFreeRequest.admin),
  };

  const allocFreeShipping = allocateIntegerByWeights({
    total: Math.max(0, Math.round(Number(freeShipping || 0))),
    weightByRole: remainingFreeCapByRole,
  });

  const target = {
    manufacturer: { paid: 0, freeRequest: allocFreeRequest.manufacturer, freeShipping: allocFreeShipping.manufacturer },
    devops: { paid: 0, freeRequest: allocFreeRequest.devops, freeShipping: allocFreeShipping.devops },
    salesman: { paid: 0, freeRequest: allocFreeRequest.salesman, freeShipping: allocFreeShipping.salesman },
    admin: { paid: 0, freeRequest: allocFreeRequest.admin, freeShipping: allocFreeShipping.admin },
  };

  for (const role of REVENUE_OWNER_ORDER) {
    const base = Math.max(0, Math.round(Number(ownerBaseByRole?.[role] || 0)));
    const freeUsed = Number(target[role].freeRequest || 0) + Number(target[role].freeShipping || 0);
    target[role].paid = Math.max(0, base - freeUsed);
  }

  const usedFreeRequest = REVENUE_OWNER_ORDER.reduce(
    (sum, role) => sum + Number(target[role].freeRequest || 0),
    0,
  );
  const usedFreeShipping = REVENUE_OWNER_ORDER.reduce(
    (sum, role) => sum + Number(target[role].freeShipping || 0),
    0,
  );

  const freeRemainder =
    Math.max(0, Math.round(Number(freeRequest || 0)) - usedFreeRequest) +
    Math.max(0, Math.round(Number(freeShipping || 0)) - usedFreeShipping);

  return { target, freeRemainder };
}

function isSameKindSplit(currentKindByRole, targetKindByRole) {
  for (const role of REVENUE_OWNER_ORDER) {
    const a = currentKindByRole[role] || {};
    const b = targetKindByRole[role] || {};
    if (
      Number(a.paid || 0) !== Number(b.paid || 0) ||
      Number(a.freeRequest || 0) !== Number(b.freeRequest || 0) ||
      Number(a.freeShipping || 0) !== Number(b.freeShipping || 0)
    ) {
      return false;
    }
  }
  return true;
}

function buildRebalancedRevenueLines({
  journal,
  ownerIdByRole,
  targetKindByRole,
  sampleMeta,
}) {
  const accountByRole = {
    manufacturer: "REV_MANUFACTURER",
    devops: "REV_DEVOPS",
    salesman: "REV_SALESMAN",
    admin: "REV_ADMIN",
  };

  const lines = [];

  const pushLine = ({ role, base, creditKind }) => {
    const baseAmount = Math.max(0, Math.round(Number(base || 0)));
    if (baseAmount <= 0) return;
    const ownerIdRaw = String(ownerIdByRole?.[role] || "").trim();
    if (!ownerIdRaw || !Types.ObjectId.isValid(ownerIdRaw)) return;

    const amountIncludingVat = withVat(baseAmount);
    lines.push({
      journalId: journal.journalId,
      businessAnchorId: journal.businessAnchorId,
      accountCode: accountByRole[role],
      ownerRole: role,
      ownerId: new Types.ObjectId(ownerIdRaw),
      amount: amountIncludingVat,
      amountExcludingVat: baseAmount,
      vatAmount: amountIncludingVat - baseAmount,
      amountIncludingVat,
      creditKind,
      occurredAt: journal.occurredAt || new Date(),
      refType: journal.refType || "",
      refId: journal.refId || null,
      meta: {
        ...(sampleMeta && typeof sampleMeta === "object" ? sampleMeta : {}),
        rebalancedBy: "mixed_spend_free_first_policy",
      },
    });
  };

  for (const role of REVENUE_OWNER_ORDER) {
    const split = targetKindByRole[role] || { paid: 0, freeRequest: 0, freeShipping: 0 };
    // free 우선 라인 -> paid 라인 순서로 적재
    pushLine({ role, base: split.freeRequest, creditKind: "FREE_REQUEST" });
    pushLine({ role, base: split.freeShipping, creditKind: "FREE_SHIPPING" });
    pushLine({ role, base: split.paid, creditKind: "PAID" });
  }

  return lines;
}

async function run() {
  const cli = parseCliArgs(process.argv || []);
  console.log(`[rebalance-mixed-spend-free-first] mode=${cli.execute ? "APPLY" : "DRY_RUN"}`);

  await connectDb();
  try {
    const anchorIds = await resolveAnchorIds(cli);
    const anchorObjectIds = anchorIds.map((id) => new Types.ObjectId(id));

    const journals = await LedgerJournal.find({
      businessAnchorId: { $in: anchorObjectIds },
      eventType: { $in: ["REQUEST_SPEND_COMMIT", "SHIPPING_SPEND_COMMIT"] },
    })
      .select({ journalId: 1, businessAnchorId: 1, eventType: 1, refType: 1, refId: 1, occurredAt: 1 })
      .sort({ occurredAt: 1, _id: 1 })
      .lean();

    let journalsScanned = 0;
    let mixedCandidate = 0;
    let alreadyAligned = 0;
    let rebalanced = 0;
    let skipped = 0;
    let unresolved = 0;

    for (const journal of journals || []) {
      journalsScanned += 1;
      const journalId = String(journal?.journalId || "").trim();
      if (!journalId) {
        skipped += 1;
        continue;
      }

      const lines = await LedgerLine.find({ journalId }).sort({ lineNo: 1 }).lean();
      if (!lines.length) {
        skipped += 1;
        continue;
      }

      const requestorSplit = collectRequestorCreditSplit(lines);
      if (requestorSplit.paid <= 0 || requestorSplit.freeTotal <= 0) {
        // mixed가 아닌 건은 대상 아님
        continue;
      }
      mixedCandidate += 1;

      const { ownerBaseByRole, ownerIdByRole, currentKindByRole } = collectRevenueBases(lines);
      const revenueBaseTotal = REVENUE_OWNER_ORDER.reduce(
        (sum, role) => sum + Number(ownerBaseByRole?.[role] || 0),
        0,
      );

      if (revenueBaseTotal !== requestorSplit.total) {
        unresolved += 1;
        continue;
      }

      // role 무료/유료 분해는 순서 편향 없이 비율 기준으로 배정한다.
      const proRataByTotal = splitRevenueByCreditKindProRata({
        ownerBaseByRole,
        freeAmount: requestorSplit.freeTotal,
      });
      const freeAllocatedTotal = Number(proRataByTotal?.freeAllocatedTotal || 0);
      if (freeAllocatedTotal !== requestorSplit.freeTotal) {
        unresolved += 1;
        continue;
      }

      const allocated = allocateFreePoolsByRole({
        ownerBaseByRole,
        freeRequest: requestorSplit.freeRequest,
        freeShipping: requestorSplit.freeShipping,
      });

      if (allocated.freeRemainder > 0) {
        unresolved += 1;
        continue;
      }

      const targetKindByRole = allocated.target;

      if (isSameKindSplit(currentKindByRole, targetKindByRole)) {
        alreadyAligned += 1;
        continue;
      }

      const nonRevenueLines = (lines || []).filter(
        (line) => !String(line?.accountCode || "").startsWith("REV_"),
      );
      const sampleRevenueMeta = (lines || []).find((l) => String(l?.accountCode || "").startsWith("REV_"))?.meta;

      const nextRevenueLines = buildRebalancedRevenueLines({
        journal,
        ownerIdByRole,
        targetKindByRole,
        sampleMeta: sampleRevenueMeta,
      });

      const merged = [...nonRevenueLines, ...nextRevenueLines].map((line, idx) => ({
        ...line,
        _id: undefined,
        id: undefined,
        lineNo: idx + 1,
      }));

      if (!cli.execute) continue;

      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await LedgerLine.deleteMany({ journalId }, { session });
          await LedgerLine.insertMany(merged, { session, ordered: true });
        });
        rebalanced += 1;
      } finally {
        await session.endSession().catch(() => null);
      }
    }

    console.log("[rebalance-mixed-spend-free-first] summary");
    console.log(`- anchors: ${anchorIds.length}`);
    console.log(`- journals_scanned: ${journalsScanned}`);
    console.log(`- mixed_candidates: ${mixedCandidate}`);
    console.log(`- already_aligned: ${alreadyAligned}`);
    console.log(`- rebalanced: ${rebalanced}`);
    console.log(`- skipped: ${skipped}`);
    console.log(`- unresolved: ${unresolved}`);
  } finally {
    await disconnectDb();
  }
}

run().catch((error) => {
  console.error("[rebalance-mixed-spend-free-first] failed", error?.message || error);
  process.exit(1);
});

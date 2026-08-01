// related files:
// - web/backend/rules.md
// - web/backend/models/creditLedger.model.js
// - web/backend/models/bonusGrant.model.js
// - web/backend/services/creditBalance.service.js
// - web/backend/controllers/admin/adminCredit.controller.js
import { Types } from "mongoose";

import { connectDb, disconnectDb, getDbNameFromMongoUri } from "./_mongo.js";
import CreditLedger from "../../models/creditLedger.model.js";
import BonusGrant from "../../models/bonusGrant.model.js";

function parseArgs(argv) {
  const args = new Set((argv || []).slice(2));
  return {
    apply: args.has("--yes") || args.has("--apply"),
    verbose: args.has("--verbose"),
  };
}

function resolveCreditKindFromLegacyBonus(refType) {
  return String(refType || "") === "FREE_SHIPPING_CREDIT"
    ? "FREE_SHIPPING"
    : "FREE_REQUEST";
}

function parseBonusGrantIdFromUniqueKey(uniqueKey) {
  const raw = String(uniqueKey || "").trim();
  if (!raw.startsWith("bonus_grant:")) return null;
  const id = raw.slice("bonus_grant:".length);
  if (!Types.ObjectId.isValid(id)) return null;
  return new Types.ObjectId(id);
}

async function loadGrantReasonMap(rows) {
  const grantIds = Array.from(
    new Set(
      (rows || [])
        .map((row) => parseBonusGrantIdFromUniqueKey(row?.uniqueKey))
        .filter((v) => !!v)
        .map((v) => String(v)),
    ),
  ).map((id) => new Types.ObjectId(id));

  if (!grantIds.length) return new Map();

  const grants = await BonusGrant.find({ _id: { $in: grantIds } })
    .select({ _id: 1, type: 1, overrideReason: 1 })
    .lean();

  const m = new Map();
  for (const g of grants || []) {
    m.set(String(g?._id || ""), {
      type: String(g?.type || ""),
      reason: String(g?.overrideReason || "").trim(),
    });
  }
  return m;
}

async function main() {
  const { apply, verbose } = parseArgs(process.argv);
  const { mongoUri } = await connectDb();

  try {
    const dbName = getDbNameFromMongoUri(mongoUri);

    const legacyRows = await CreditLedger.find({ type: "BONUS" })
      .select({
        _id: 1,
        type: 1,
        amount: 1,
        refType: 1,
        uniqueKey: 1,
        creditKind: 1,
        memo: 1,
      })
      .sort({ createdAt: 1, _id: 1 })
      .lean();

    const grantReasonMap = await loadGrantReasonMap(legacyRows);

    const preview = (legacyRows || []).slice(0, 20).map((row) => {
      const grantId = parseBonusGrantIdFromUniqueKey(row?.uniqueKey);
      const grantMeta = grantId ? grantReasonMap.get(String(grantId)) : null;
      return {
        _id: String(row?._id || ""),
        amount: Number(row?.amount || 0),
        fromType: row?.type,
        toType: "CHARGE",
        refType: row?.refType,
        toCreditKind: resolveCreditKindFromLegacyBonus(row?.refType),
        uniqueKey: row?.uniqueKey,
        grantType: grantMeta?.type || null,
        grantReason: grantMeta?.reason || null,
      };
    });

    console.log("[migrate-bonus-to-charge-creditkind] summary");
    console.log(
      JSON.stringify(
        {
          dbName,
          mode: apply ? "APPLY" : "DRY_RUN",
          legacyBonusRows: legacyRows.length,
        },
        null,
        2,
      ),
    );

    if (verbose || !apply) {
      console.log(
        "[migrate-bonus-to-charge-creditkind] preview (max 20):\n" +
          JSON.stringify(preview, null, 2),
      );
    }

    if (!apply) {
      console.log("[migrate-bonus-to-charge-creditkind] dry-run complete.");
      return;
    }

    let modified = 0;
    for (const row of legacyRows || []) {
      const grantId = parseBonusGrantIdFromUniqueKey(row?.uniqueKey);
      const grantMeta = grantId ? grantReasonMap.get(String(grantId)) : null;
      const nextKind = resolveCreditKindFromLegacyBonus(row?.refType);

      const nextMemo = (() => {
        const currentMemo = String(row?.memo || "").trim();
        if (currentMemo) return currentMemo;
        const reason = String(grantMeta?.reason || "").trim();
        if (reason) return reason;
        return "";
      })();

      const res = await CreditLedger.updateOne(
        { _id: row._id, type: "BONUS" },
        {
          $set: {
            type: "CHARGE",
            creditKind: nextKind,
            memo: nextMemo,
          },
        },
      );

      modified += Number(res?.modifiedCount || 0);
    }

    const remain = await CreditLedger.countDocuments({ type: "BONUS" });

    console.log(
      JSON.stringify(
        {
          applied: true,
          updatedRows: modified,
          expectedRows: legacyRows.length,
          remainingBonusRows: remain,
        },
        null,
        2,
      ),
    );
  } finally {
    await disconnectDb();
  }
}

main().catch((error) => {
  console.error("[migrate-bonus-to-charge-creditkind] failed", error);
  process.exit(1);
});

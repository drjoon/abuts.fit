// related files:
// - web/backend/rules.md
// - web/backend/scripts/db/_mongo.js
// - web/backend/services/creditRevenuePolicy.service.js
// - web/backend/models/ledgerJournal.model.js
// - web/backend/models/ledgerLine.model.js
// change-log:
// - 2026-08-23: 기본 단가 8,800(면세) 기준. 레거시 9,000·부가세 포함 9,900 라인 정리.
// - 2026-08-18: 제조사 REV만 어벗 1개당 고정단가(면세)로 재기록. 타 역할 REV는 유지.
//
// 제조사 장부만 하청 고정단가로 맞춘다. 영업자·개발운영사·관리자 분배는 건드리지 않는다.
// 유료·무료 라인 모두 단가에 맞춘다(제조사 지급은 약정 단가 전액).
//
// dry-run:
//   cd web/backend && ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//     node scripts/db/rebalance-manufacturer-unit-price.js
// apply:
//   ... node scripts/db/rebalance-manufacturer-unit-price.js --yes

import { Types } from "mongoose";
import { connectDb, disconnectDb } from "./_mongo.js";
import LedgerJournal from "../../models/ledgerJournal.model.js";
import LedgerLine from "../../models/ledgerLine.model.js";
import Request from "../../models/request.model.js";
import { loadCreditSettingsDefaults } from "../../utils/creditSettingsDefaults.js";
import { countDesignAbutmentQty } from "../../controllers/requests/designPrice.utils.js";
import {
  MANUFACTURER_PRODUCTION_LEDGER_LABEL,
  resolveManufacturerUnitApply,
  resolveManufacturerUnitEarn,
  resolveManufacturerUnitQty,
} from "../../services/creditRevenuePolicy.service.js";
import { SHIPPING_LEDGER_LABELS } from "../../utils/shippingLedgerLabels.js";

function parseCliArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice(2) : [];
  return { execute: args.includes("--yes") };
}

function signedAmounts(earn, sign) {
  const supply = Math.round(Number(earn.supply || 0)) * sign;
  const vat = Math.round(Number(earn.vat || 0)) * sign;
  const total = supply + vat;
  return { supply, vat, total };
}

function sameAmounts(line, next) {
  const supply = Math.round(Number(line?.amountExcludingVat ?? line?.amount ?? 0));
  const vat = Math.round(Number(line?.vatAmount || 0));
  const total = Math.round(Number(line?.amount ?? supply + vat));
  return (
    supply === next.supply &&
    vat === next.vat &&
    total === next.total
  );
}

function pickAbutmentQty({ line, journal, request }) {
  const fromMeta = Math.round(
    Number(
      line?.meta?.abutmentQty ??
        journal?.meta?.abutmentQty ??
        journal?.meta?.fees?.abutmentQty ??
        0,
    ) || 0,
  );
  if (fromMeta > 0) return fromMeta;
  const fromPrice = Math.round(Number(request?.price?.abutmentQty || 0) || 0);
  if (fromPrice > 0) return fromPrice;
  const fromWorks = countDesignAbutmentQty(request?.caseInfos);
  return Math.max(1, fromWorks || 1);
}

async function run() {
  const cli = parseCliArgs(process.argv || []);
  console.log(
    `[rebalance-manufacturer-unit-price] mode=${cli.execute ? "APPLY" : "DRY_RUN"}`,
  );

  await connectDb();
  try {
    const creditSettings = await loadCreditSettingsDefaults();
    const lines = await LedgerLine.find({
      accountCode: "REV_MANUFACTURER",
      ownerRole: "manufacturer",
    })
      .sort({ occurredAt: 1, _id: 1 })
      .lean();

    const journalIds = [
      ...new Set(lines.map((l) => String(l.journalId || "")).filter(Boolean)),
    ];
    const journals = await LedgerJournal.find({
      journalId: { $in: journalIds },
    }).lean();
    const journalById = new Map(
      journals.map((j) => [String(j.journalId), j]),
    );

    const requestIds = [];
    for (const line of lines) {
      if (String(line.refType || "") === "REQUEST" && line.refId) {
        requestIds.push(String(line.refId));
      }
    }
    const uniqueRequestIds = [
      ...new Set(requestIds.filter((id) => Types.ObjectId.isValid(id))),
    ];
    const requests = uniqueRequestIds.length
      ? await Request.find({
          _id: { $in: uniqueRequestIds.map((id) => new Types.ObjectId(id)) },
        })
          .select({
            _id: 1,
            "price.abutmentQty": 1,
            "caseInfos.toothWorks": 1,
            "caseInfos.productMode": 1,
          })
          .lean()
      : [];
    const requestById = new Map(requests.map((r) => [String(r._id), r]));

    const summary = {
      scanned: 0,
      unchanged: 0,
      updated: 0,
      deleted: 0,
      skipped: 0,
      byAction: {},
    };

    const bump = (key) => {
      summary.byAction[key] = (summary.byAction[key] || 0) + 1;
    };

    for (const line of lines) {
      summary.scanned += 1;
      const journal = journalById.get(String(line.journalId || ""));
      if (!journal) {
        summary.skipped += 1;
        bump("missing_journal");
        continue;
      }

      const eventType = String(journal.eventType || "");
      const usageKind = String(
        line?.meta?.usageKind || journal?.meta?.usageKind || "",
      );
      const source = String(line?.meta?.source || journal?.meta?.source || "");
      const displayKind = String(
        line?.meta?.displayKind || journal?.meta?.displayKind || "",
      );
      const currentSupply = Math.round(
        Number(line?.amountExcludingVat ?? line?.amount ?? 0),
      );
      const sign = currentSupply < 0 || eventType === "ADJUST" ? -1 : 1;
      const request =
        String(line.refType || "") === "REQUEST"
          ? requestById.get(String(line.refId || ""))
          : null;
      const abutmentQty = pickAbutmentQty({ line, journal, request });
      const isShippingSpend =
        eventType === "SHIPPING_SPEND_COMMIT" ||
        usageKind === "practice_transfer_abuts_shipping" ||
        usageKind === "shipping";
      const apply = resolveManufacturerUnitApply({
        usageKind,
        source,
        displayKind,
        abutmentQty,
        abutmentRetailTotal: Number(
          journal?.meta?.fees?.abutmentRetailTotal ||
            journal?.meta?.abutmentRetailTotal ||
            0,
        ),
        isShippingSpend,
      });

      if (!apply) {
        if (cli.execute) {
          await LedgerLine.deleteOne({ _id: line._id });
        }
        summary.deleted += 1;
        bump(`delete:${eventType || "unknown"}:${usageKind || source || "n/a"}`);
        continue;
      }

      const qty = resolveManufacturerUnitQty({
        abutmentQty,
        isShippingSpend,
      });
      const earn = resolveManufacturerUnitEarn({
        isShippingSpend,
        creditSettings,
        applyManufacturerUnit: true,
        qty,
      });
      const next = signedAmounts(earn, sign);
      const nextMeta = {
        ...(line.meta && typeof line.meta === "object" ? line.meta : {}),
        rebalancedBy: "manufacturer_unit_price_v1",
        abutmentQty: isShippingSpend ? undefined : qty,
        displayKind: isShippingSpend ? "shipping" : "abutment_production",
        displayLabel: isShippingSpend
          ? SHIPPING_LEDGER_LABELS.abutsToManufacturer
          : MANUFACTURER_PRODUCTION_LEDGER_LABEL,
      };
      if (isShippingSpend) delete nextMeta.abutmentQty;

      if (
        sameAmounts(line, next) &&
        String(line?.meta?.displayLabel || "") === nextMeta.displayLabel
      ) {
        summary.unchanged += 1;
        bump("unchanged");
        continue;
      }

      if (cli.execute) {
        await LedgerLine.updateOne(
          { _id: line._id },
          {
            $set: {
              amount: next.total,
              amountExcludingVat: next.supply,
              vatAmount: next.vat,
              amountIncludingVat: next.total,
              meta: nextMeta,
            },
          },
        );
      }
      summary.updated += 1;
      bump(
        `update:${eventType}:${isShippingSpend ? "shipping" : "request"}:${qty}x${sign < 0 ? "-" : "+"}${earn.total}`,
      );
    }

    console.log("[rebalance-manufacturer-unit-price] summary", summary);
    if (!cli.execute) {
      console.log(
        "dry-run complete. Re-run with --yes to apply manufacturer unit prices.",
      );
    }
  } finally {
    await disconnectDb();
  }
}

run().catch((error) => {
  console.error("[rebalance-manufacturer-unit-price] failed", error?.message || error);
  process.exit(1);
});

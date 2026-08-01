#!/usr/bin/env node
// related files:
// - web/backend/rules.md
// - web/backend/models/ledgerJournal.model.js
// - web/backend/models/ledgerLine.model.js
// - web/backend/models/businessAnchor.model.js
// - web/backend/models/businessCreditBalance.model.js
/**
 * 무료 크레딧 사용액 검증 스크립트 (General Ledger SSOT)
 *
 * 기본 대상 사업자명은 TARGET_BUSINESS_NAME이며,
 * 필요 시 --business-name 또는 --anchor-id 로 지정할 수 있습니다.
 */

import mongoose, { Types } from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import BusinessAnchor from "../models/businessAnchor.model.js";
import BusinessCreditBalance from "../models/businessCreditBalance.model.js";
import LedgerLine from "../models/ledgerLine.model.js";
import LedgerJournal from "../models/ledgerJournal.model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, "../local.env");
dotenv.config({ path: envPath });

const TARGET_BUSINESS_NAME = "우리치과기공소";

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    anchorId: "",
    businessName: "",
  };

  for (let i = 0; i < args.length; i += 1) {
    const token = String(args[i] || "").trim();
    if (token === "--anchor-id") {
      out.anchorId = String(args[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (token === "--business-name") {
      out.businessName = String(args[i + 1] || "").trim();
      i += 1;
      continue;
    }
  }

  return out;
}

function toObjectId(value) {
  const raw = String(value || "").trim();
  if (!raw || !Types.ObjectId.isValid(raw)) return null;
  return new Types.ObjectId(raw);
}

async function connectDb() {
  const uri = process.env.MONGODB_URI || process.env.DB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI 환경변수가 설정되지 않았습니다.");
  }
  await mongoose.connect(uri);
}

async function resolveAnchor(opts) {
  if (opts.anchorId) {
    const oid = toObjectId(opts.anchorId);
    if (!oid) throw new Error(`유효하지 않은 --anchor-id: ${opts.anchorId}`);
    return BusinessAnchor.findById(oid).lean();
  }

  const name = String(opts.businessName || TARGET_BUSINESS_NAME).trim();
  return BusinessAnchor.findOne({
    $or: [{ name }, { "metadata.companyName": name }],
  }).lean();
}

function amountBaseExpr() {
  return { $ifNull: ["$amountExcludingVat", "$amount"] };
}

async function verifyFreeCreditUsage(anchor) {
  const anchorId = new Types.ObjectId(String(anchor._id));

  const [chargedRows, spentRows, snapshot] = await Promise.all([
    LedgerLine.aggregate([
      {
        $match: {
          ownerRole: "requestor",
          ownerId: anchorId,
          accountCode: { $in: ["REQ_FREE_REQUEST_CREDIT", "REQ_FREE_SHIPPING_CREDIT"] },
        },
      },
      {
        $lookup: {
          from: LedgerJournal.collection.name,
          localField: "journalId",
          foreignField: "journalId",
          as: "journalDoc",
        },
      },
      { $unwind: "$journalDoc" },
      {
        $match: {
          "journalDoc.eventType": { $in: ["CHARGE_FREE_REQUEST", "CHARGE_FREE_SHIPPING"] },
        },
      },
      {
        $project: {
          accountCode: 1,
          amountBase: amountBaseExpr(),
        },
      },
      {
        $group: {
          _id: "$accountCode",
          total: {
            $sum: {
              $cond: [{ $gt: ["$amountBase", 0] }, "$amountBase", 0],
            },
          },
        },
      },
    ]),
    LedgerLine.aggregate([
      {
        $match: {
          ownerRole: "requestor",
          ownerId: anchorId,
          accountCode: { $in: ["REQ_FREE_REQUEST_CREDIT", "REQ_FREE_SHIPPING_CREDIT"] },
        },
      },
      {
        $lookup: {
          from: LedgerJournal.collection.name,
          localField: "journalId",
          foreignField: "journalId",
          as: "journalDoc",
        },
      },
      { $unwind: "$journalDoc" },
      {
        $match: {
          "journalDoc.eventType": { $in: ["REQUEST_SPEND_COMMIT", "SHIPPING_SPEND_COMMIT"] },
        },
      },
      {
        $project: {
          accountCode: 1,
          amountBase: amountBaseExpr(),
        },
      },
      {
        $group: {
          _id: "$accountCode",
          total: {
            $sum: {
              $cond: [{ $lt: ["$amountBase", 0] }, { $abs: "$amountBase" }, 0],
            },
          },
        },
      },
    ]),
    BusinessCreditBalance.findOne({ businessAnchorId: anchorId })
      .select({ freeRequestCredit: 1, freeShippingCredit: 1, balance: 1, paidCredit: 1 })
      .lean(),
  ]);

  const chargedMap = new Map((chargedRows || []).map((r) => [String(r._id), Number(r.total || 0)]));
  const spentMap = new Map((spentRows || []).map((r) => [String(r._id), Number(r.total || 0)]));

  const chargedRequest = Math.max(0, Math.round(chargedMap.get("REQ_FREE_REQUEST_CREDIT") || 0));
  const chargedShipping = Math.max(0, Math.round(chargedMap.get("REQ_FREE_SHIPPING_CREDIT") || 0));
  const spentRequest = Math.max(0, Math.round(spentMap.get("REQ_FREE_REQUEST_CREDIT") || 0));
  const spentShipping = Math.max(0, Math.round(spentMap.get("REQ_FREE_SHIPPING_CREDIT") || 0));

  const computedFreeRequest = Math.max(0, chargedRequest - spentRequest);
  const computedFreeShipping = Math.max(0, chargedShipping - spentShipping);

  const snapshotFreeRequest = Math.max(0, Math.round(Number(snapshot?.freeRequestCredit || 0)));
  const snapshotFreeShipping = Math.max(0, Math.round(Number(snapshot?.freeShippingCredit || 0)));

  console.log(`📌 사업자: ${anchor.name || "(no-name)"} (${String(anchor._id)})\n`);

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("💰 무료 크레딧 충전 (GL)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`무료 의뢰 충전: ${chargedRequest.toLocaleString()}원`);
  console.log(`무료 배송 충전: ${chargedShipping.toLocaleString()}원`);
  console.log(`총 무료 충전: ${(chargedRequest + chargedShipping).toLocaleString()}원\n`);

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("💸 무료 크레딧 사용 (GL)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`무료 의뢰 사용: ${spentRequest.toLocaleString()}원`);
  console.log(`무료 배송 사용: ${spentShipping.toLocaleString()}원`);
  console.log(`총 무료 사용: ${(spentRequest + spentShipping).toLocaleString()}원\n`);

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🧾 잔액 비교 (GL 계산 vs Snapshot)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`의뢰 무료 잔액 (계산): ${computedFreeRequest.toLocaleString()}원`);
  console.log(`의뢰 무료 잔액 (스냅샷): ${snapshotFreeRequest.toLocaleString()}원`);
  console.log(`배송 무료 잔액 (계산): ${computedFreeShipping.toLocaleString()}원`);
  console.log(`배송 무료 잔액 (스냅샷): ${snapshotFreeShipping.toLocaleString()}원`);

  const reqDiff = computedFreeRequest - snapshotFreeRequest;
  const shipDiff = computedFreeShipping - snapshotFreeShipping;
  const totalDiff = reqDiff + shipDiff;

  console.log(`\n차이(의뢰): ${reqDiff >= 0 ? "+" : ""}${reqDiff.toLocaleString()}원`);
  console.log(`차이(배송): ${shipDiff >= 0 ? "+" : ""}${shipDiff.toLocaleString()}원`);
  console.log(`차이(합계): ${totalDiff >= 0 ? "+" : ""}${totalDiff.toLocaleString()}원`);
}

async function main() {
  const opts = parseArgs(process.argv);
  await connectDb();
  try {
    const anchor = await resolveAnchor(opts);
    if (!anchor?._id) {
      throw new Error("대상 사업자를 찾을 수 없습니다.");
    }
    await verifyFreeCreditUsage(anchor);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((e) => {
  console.error("에러:", e?.message || e);
  process.exit(1);
});

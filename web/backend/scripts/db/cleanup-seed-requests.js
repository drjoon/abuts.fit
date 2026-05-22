import { connectDb, disconnectDb } from "./_mongo.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import CreditLedger from "../../models/creditLedger.model.js";
import Request from "../../models/request.model.js";

// Usage:
// node cleanup-seed-requests.js "향기로운치과" 7 --yes
// - 첫번째 인자: BusinessAnchor 이름 (부분 일치, 기본: "향기로운치과")
// - 두번째 인자: lookback days (기본: 7)
// - --yes 플래그를 붙여야 실제 삭제가 실행됩니다. 없으면 미리보기만 출력합니다.

function parseArgs() {
  const args = process.argv.slice(2);
  const name = args[0] || "향기로운치과";
  const lookbackDays = args[1] ? Number.parseInt(args[1], 10) : 7;
  const yes = args.includes("--yes");
  return { name, lookbackDays, yes };
}

function daysAgoDate(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

async function run() {
  const { name, lookbackDays, yes } = parseArgs();
  await connectDb();
  try {
    console.log(`[cleanup] business anchor name: ${name}, lookbackDays: ${lookbackDays}`);

    // BusinessAnchor 찾기 (이름 또는 metadata.companyName 포함, 대소문자 무시)
    const anchor = await BusinessAnchor.findOne({
      $or: [
        { name: { $regex: `^${name}$`, $options: "i" } },
        { "metadata.companyName": { $regex: name, $options: "i" } },
      ],
    }).lean();

    if (!anchor) {
      console.error("[cleanup] 대상 BusinessAnchor를 찾지 못했습니다. 이름을 확인하세요.");
      return;
    }

    const anchorId = anchor._id;
    console.log(`[cleanup] found business anchor: ${anchor.name} (${anchorId})`);

    const since = daysAgoDate(lookbackDays);

    // 1) CreditLedger: refType에 SEED가 포함된 항목 또는 uniqueKey에 seed가 포함된 항목을 우선 탐지
    const ledgerMatch = {
      businessAnchorId: anchorId,
      $or: [
        { refType: { $regex: "SEED", $options: "i" } },
        { uniqueKey: { $regex: "seed", $options: "i" } },
        { createdAt: { $gte: since } },
      ],
    };

    const ledgers = await CreditLedger.find(ledgerMatch).lean();

    // 2) Request: businessAnchorId가 대상이고 생성일이 lookback window에 포함된 문서
    const requestMatch = {
      businessAnchorId: anchorId,
      createdAt: { $gte: since },
    };
    const requests = await Request.find(requestMatch).select({ _id: 1, requestId: 1, createdAt: 1, "caseInfos.clinicName": 1 }).lean();

    console.log(`[cleanup] matched credit ledger count: ${ledgers.length}`);
    if (ledgers.length > 0) {
      console.log("[cleanup] sample ledgers (up to 10):");
      ledgers.slice(0, 10).forEach((l) => {
        console.log(`  - _id: ${l._id}, type:${l.type}, amount:${l.amount}, refType:${l.refType}, uniqueKey:${l.uniqueKey}, createdAt:${l.createdAt}`);
      });
    }

    console.log(`[cleanup] matched request count: ${requests.length}`);
    if (requests.length > 0) {
      console.log("[cleanup] sample requests (up to 10):");
      requests.slice(0, 10).forEach((r) => {
        console.log(`  - _id: ${r._id}, requestId:${r.requestId}, clinicName:${r.caseInfos?.clinicName}, createdAt:${r.createdAt}`);
      });
    }

    if (!yes) {
      console.log("\n[cleanup] --yes 플래그가 없으므로 변경을 적용하지 않습니다. 미리보기만 출력했습니다.");
      return;
    }

    // 삭제 실행 (트랜잭션 사용 — MongoDB replica set/transactions 지원 환경에서만 안전하게 동작)
    const mongoose = BusinessAnchor.db.constructor;
    let session = null;
    try {
      if (typeof BusinessAnchor.db.startSession === "function") {
        session = await BusinessAnchor.db.startSession();
        session.startTransaction();
      }

      const ledgerDeleteResult = await CreditLedger.deleteMany(ledgerMatch).session(session || undefined);
      const requestDeleteResult = await Request.deleteMany(requestMatch).session(session || undefined);

      if (session) {
        await session.commitTransaction();
        await session.endSession();
      }

      console.log(`[cleanup] deleted credit ledgers: ${ledgerDeleteResult.deletedCount || 0}`);
      console.log(`[cleanup] deleted requests: ${requestDeleteResult.deletedCount || 0}`);
    } catch (err) {
      if (session) {
        try {
          await session.abortTransaction();
          await session.endSession();
        } catch (_) {}
      }
      throw err;
    }
  } finally {
    await disconnectDb();
  }
}

run().catch((err) => {
  console.error("[cleanup] failed", err);
  process.exit(1);
});

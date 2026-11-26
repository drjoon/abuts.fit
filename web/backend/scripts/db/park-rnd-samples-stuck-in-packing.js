#!/usr/bin/env node
/**
 * 세척.패킹에 남은 R&D 보관 샘플(고스트)을 추적관리로 옮긴다.
 * lot-server/백엔드 각인 매칭이 이 건들과 맞물리지 않게 한다.
 * 정식 order 세척.패킹 건은 건드리지 않는다.
 *
 * Usage:
 *   cd web/backend && \
 *   ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
 *   node scripts/db/park-rnd-samples-stuck-in-packing.js
 *
 *   ... --execute   # 실제 저장 (기본은 dry-run)
 */
import { connectDb, disconnectDb } from "./_mongo.js";
import Request from "../../models/request.model.js";
import { applyStatusMapping } from "../../controllers/requests/utils.js";

const shouldExecute = process.argv.includes("--execute");

function isRndArchiveSample(doc) {
  const category = String(doc?.requestCategory || "").trim();
  if (category === "rnd_sample") return true;
  const source = String(doc?.source || "").trim();
  return source === "manufacturer_sample" && Boolean(doc?.rnd?.doneAt);
}

async function main() {
  const { mongoUri } = await connectDb();
  const dbName = String(mongoUri || "")
    .split("?")[0]
    .split("/")
    .filter(Boolean)
    .pop();
  console.log("[park-rnd-packing] dbName", dbName, "execute", shouldExecute);

  const rows = await Request.find({
    status: { $ne: "취소" },
    manufacturerStage: "세척.패킹",
  }).select({
    requestId: 1,
    source: 1,
    requestCategory: 1,
    manufacturerStage: 1,
    status: 1,
    "lotNumber.value": 1,
    "rnd.doneAt": 1,
    "caseInfos.patientName": 1,
    "caseInfos.clinicName": 1,
  });

  const ghosts = rows.filter(isRndArchiveSample);
  const keep = rows.filter((row) => !isRndArchiveSample(row));

  console.log(
    JSON.stringify(
      {
        packingTotal: rows.length,
        ghostRnd: ghosts.length,
        keepOrders: keep.length,
        keepIds: keep.map((r) => r.requestId),
      },
      null,
      2,
    ),
  );

  for (const doc of ghosts) {
    console.log(
      [
        doc.requestId,
        doc.source,
        doc.requestCategory || "-",
        doc?.lotNumber?.value || "-",
        doc?.caseInfos?.patientName || "",
        doc?.caseInfos?.clinicName || "",
      ].join("\t"),
    );
  }

  if (!shouldExecute) {
    console.log("[park-rnd-packing] dry-run only. Re-run with --execute to save.");
    await disconnectDb();
    return;
  }

  let saved = 0;
  for (const doc of ghosts) {
    applyStatusMapping(doc, "추적관리");
    if (String(doc.requestCategory || "").trim() !== "rnd_sample") {
      doc.requestCategory = "rnd_sample";
    }
    await doc.save();
    saved += 1;
  }

  const remaining = await Request.countDocuments({
    status: { $ne: "취소" },
    manufacturerStage: "세척.패킹",
  });
  console.log("[park-rnd-packing] saved", saved, "packingRemaining", remaining);
  await disconnectDb();
}

main().catch(async (err) => {
  console.error("[park-rnd-packing] failed", err?.message || err);
  try {
    await disconnectDb();
  } catch {
    // ignore
  }
  process.exit(1);
});

#!/usr/bin/env node
/**
 * R&D 보관 샘플(rnd.doneAt)의 manufacturerStage를 R&D로 맞춘다.
 * 원래 공정은 rnd.doneFromStage에 둔다(없으면 이동 전 단계를 기록).
 * 세척.패킹 고스트 27건처럼 이미 doneFromStage=세척.패킹인 건은 그 값을 유지한다.
 *
 * Usage:
 *   cd web/backend && \
 *   ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
 *   node scripts/db/park-rnd-archive-to-rnd-stage.js
 *
 *   ... --execute
 */
import { connectDb, disconnectDb } from "./_mongo.js";
import Request from "../../models/request.model.js";
import { applyStatusMapping } from "../../controllers/requests/utils.js";

const shouldExecute = process.argv.includes("--execute");

const PRODUCTION_STAGES = new Set([
  "의뢰",
  "준비",
  "CAM",
  "가공",
  "세척.패킹",
  "포장.발송",
  "추적관리",
]);

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
  console.log("[park-rnd-stage] dbName", dbName, "execute", shouldExecute);

  const rows = await Request.find({
    status: { $ne: "취소" },
    manufacturerStage: { $ne: "취소" },
    "rnd.doneAt": { $ne: null },
  }).select({
    requestId: 1,
    source: 1,
    requestCategory: 1,
    manufacturerStage: 1,
    "rnd.doneAt": 1,
    "rnd.doneFromStage": 1,
    "caseInfos.patientName": 1,
  });

  const targets = rows.filter(isRndArchiveSample);
  const already = targets.filter(
    (doc) => String(doc.manufacturerStage || "").trim() === "R&D",
  );
  const toMove = targets.filter(
    (doc) => String(doc.manufacturerStage || "").trim() !== "R&D",
  );

  console.log(
    JSON.stringify(
      {
        archiveTotal: targets.length,
        alreadyRnd: already.length,
        toMove: toMove.length,
      },
      null,
      2,
    ),
  );

  for (const doc of toMove) {
    const stage = String(doc.manufacturerStage || "").trim();
    const from = String(doc.rnd?.doneFromStage || "").trim();
    console.log(
      [
        doc.requestId,
        `stage=${stage}`,
        `from=${from || "-"}`,
        doc?.caseInfos?.patientName || "",
      ].join("\t"),
    );
  }

  if (!shouldExecute) {
    console.log("[park-rnd-stage] dry-run only. Re-run with --execute to save.");
    await disconnectDb();
    return;
  }

  let saved = 0;
  for (const doc of toMove) {
    const stage = String(doc.manufacturerStage || "").trim();
    const from = String(doc.rnd?.doneFromStage || "").trim();
    if (!from && PRODUCTION_STAGES.has(stage)) {
      doc.rnd = { ...(doc.rnd || {}), doneFromStage: stage };
    }
    if (String(doc.requestCategory || "").trim() !== "rnd_sample") {
      doc.requestCategory = "rnd_sample";
    }
    applyStatusMapping(doc, "R&D");
    await doc.save();
    saved += 1;
  }

  const stillGhost = await Request.countDocuments({
    status: { $ne: "취소" },
    "rnd.doneAt": { $ne: null },
    manufacturerStage: { $nin: ["R&D", "취소"] },
  });
  const packing = await Request.countDocuments({
    status: { $ne: "취소" },
    manufacturerStage: "세척.패킹",
  });
  const rndStage = await Request.countDocuments({
    status: { $ne: "취소" },
    manufacturerStage: "R&D",
  });
  console.log("[park-rnd-stage] saved", saved, {
    stillGhost,
    packing,
    rndStage,
  });
  await disconnectDb();
}

main().catch(async (err) => {
  console.error("[park-rnd-stage] failed", err?.message || err);
  try {
    await disconnectDb();
  } catch {
    // ignore
  }
  process.exit(1);
});

#!/usr/bin/env node
/**
 * 테스트치과→테스트기공소 PracticeTransfer 정리.
 * 1) 3D 스캔(stl/ply/obj/dcm) 없는 건 hard delete
 * 2) 같은 환자·같은 치아 집합 중복은 최신 1건만 남기고 삭제
 *    (스캔 없는 건이 있으면 그쪽을 먼저 지움 — 1단계로 처리)
 *
 * Usage:
 *   cd web/backend && \
 *   ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
 *   node scripts/db/cleanup-test-practice-ptx-no-scan-duplicates.js
 *
 *   ... --execute   # 실제 삭제 (기본은 dry-run)
 *
 * Optional:
 *   PRACTICE_NAME=테스트치과
 *   LAB_NAME=테스트기공소
 */
import { connectDb, disconnectDb } from "./_mongo.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import PracticeTransferBookmark from "../../models/practiceTransferBookmark.model.js";
import PracticeTransferShareLink from "../../models/practiceTransferShareLink.model.js";
import ChatRoom from "../../models/chatRoom.model.js";
import Chat from "../../models/chat.model.js";
import Request from "../../models/request.model.js";
import { hasOralScanModelFile } from "../../services/practiceTransferProduction.service.js";
import {
  resolvePracticeTransferPatientName,
  collectToothNumbersFromToothWorks,
} from "../../utils/practiceTransferSimilarCase.js";

const PRACTICE_NAME = String(
  process.env.PRACTICE_NAME || "테스트치과",
).trim();
const LAB_NAME = String(process.env.LAB_NAME || "테스트기공소").trim();
const shouldExecute = process.argv.includes("--execute");

function duplicateKey(doc) {
  const patient =
    resolvePracticeTransferPatientName(doc) || "(no-patient)";
  const teeth =
    collectToothNumbersFromToothWorks(doc.toothWorks)
      .slice()
      .sort()
      .join(",") || "(no-teeth)";
  return `${patient}|${teeth}`;
}

function planDeletions(docs) {
  const annotated = docs.map((doc) => ({
    doc,
    id: String(doc._id),
    transferId: String(doc.transferId || ""),
    hasScan: hasOralScanModelFile(doc.files),
    createdAt: doc.createdAt ? new Date(doc.createdAt).getTime() : 0,
    key: duplicateKey(doc),
  }));

  const deleteIds = new Set();
  const reasons = new Map(); // id -> reason[]

  const mark = (row, reason) => {
    deleteIds.add(row.id);
    const list = reasons.get(row.id) || [];
    list.push(reason);
    reasons.set(row.id, list);
  };

  for (const row of annotated) {
    if (!row.hasScan) mark(row, "no_scan");
  }

  const byKey = new Map();
  for (const row of annotated) {
    if (deleteIds.has(row.id)) continue;
    if (!byKey.has(row.key)) byKey.set(row.key, []);
    byKey.get(row.key).push(row);
  }

  for (const [key, group] of byKey.entries()) {
    if (group.length <= 1) continue;
    group.sort((a, b) => b.createdAt - a.createdAt || b.transferId.localeCompare(a.transferId));
    const [, ...older] = group;
    for (const row of older) {
      mark(row, `duplicate_keep_latest:${key}`);
    }
  }

  return {
    annotated,
    deleteRows: annotated.filter((row) => deleteIds.has(row.id)),
    keepRows: annotated.filter((row) => !deleteIds.has(row.id)),
    reasons,
  };
}

async function cascadeDelete(mongoIds, transferIds) {
  const objectIds = mongoIds;
  const rooms = await ChatRoom.find({
    relatedPracticeTransferId: { $in: objectIds },
  })
    .select({ _id: 1 })
    .lean();
  const roomIds = rooms.map((r) => r._id);

  const [chatMsg, chatRoom, bookmark, share, request, transfer] =
    await Promise.all([
      roomIds.length
        ? Chat.deleteMany({ roomId: { $in: roomIds } })
        : Promise.resolve({ deletedCount: 0 }),
      roomIds.length
        ? ChatRoom.deleteMany({ _id: { $in: roomIds } })
        : Promise.resolve({ deletedCount: 0 }),
      PracticeTransferBookmark.deleteMany({
        transferMongoId: { $in: objectIds },
      }),
      PracticeTransferShareLink.deleteMany({
        transferMongoId: { $in: objectIds },
      }),
      Request.deleteMany({
        "partnerBilling.relatedPracticeTransferId": { $in: objectIds },
      }),
      PracticeTransfer.deleteMany({ _id: { $in: objectIds } }),
    ]);

  return {
    chats: chatMsg.deletedCount || 0,
    chatRooms: chatRoom.deletedCount || 0,
    bookmarks: bookmark.deletedCount || 0,
    shareLinks: share.deletedCount || 0,
    requests: request.deletedCount || 0,
    transfers: transfer.deletedCount || 0,
    transferIds,
  };
}

async function main() {
  const { mongoUri } = await connectDb();
  console.log("[cleanup-test-ptx] connected", {
    mongoUri: String(mongoUri || "").replace(/\/\/(.*)@/, "//***@"),
    mode: shouldExecute ? "execute" : "dry-run",
    practice: PRACTICE_NAME,
    lab: LAB_NAME,
  });

  const [practice, lab] = await Promise.all([
    BusinessAnchor.findOne({ name: PRACTICE_NAME }).lean(),
    BusinessAnchor.findOne({ name: LAB_NAME }).lean(),
  ]);
  if (!practice?._id) throw new Error(`practice not found: ${PRACTICE_NAME}`);
  if (!lab?._id) throw new Error(`lab not found: ${LAB_NAME}`);

  const docs = await PracticeTransfer.find({
    practiceBusinessAnchorId: practice._id,
    targetLabAnchorId: lab._id,
  })
    .select({
      transferId: 1,
      files: 1,
      toothWorks: 1,
      transferMemo: 1,
      createdAt: 1,
      status: 1,
    })
    .lean();

  const plan = planDeletions(docs);
  const noScanCount = plan.deleteRows.filter((r) =>
    (plan.reasons.get(r.id) || []).includes("no_scan"),
  ).length;
  const dupCount = plan.deleteRows.filter((r) =>
    (plan.reasons.get(r.id) || []).some((x) =>
      String(x).startsWith("duplicate_"),
    ),
  ).length;

  console.log("[cleanup-test-ptx] summary", {
    total: docs.length,
    delete: plan.deleteRows.length,
    keep: plan.keepRows.length,
    noScan: noScanCount,
    duplicateOlder: dupCount,
  });

  for (const row of plan.deleteRows) {
    console.log("[cleanup-test-ptx] delete", {
      transferId: row.transferId,
      hasScan: row.hasScan,
      key: row.key,
      reasons: plan.reasons.get(row.id),
    });
  }

  if (!shouldExecute) {
    console.log(
      "[cleanup-test-ptx] dry-run only. Re-run with --execute to hard delete.",
    );
    await disconnectDb();
    return;
  }

  if (plan.deleteRows.length === 0) {
    console.log("[cleanup-test-ptx] nothing to delete");
    await disconnectDb();
    return;
  }

  const mongoIds = plan.deleteRows.map((r) => r.doc._id);
  const transferIds = plan.deleteRows.map((r) => r.transferId);
  const result = await cascadeDelete(mongoIds, transferIds);
  console.log("[cleanup-test-ptx] deleted", result);

  const remaining = await PracticeTransfer.countDocuments({
    practiceBusinessAnchorId: practice._id,
    targetLabAnchorId: lab._id,
  });
  console.log("[cleanup-test-ptx] remaining transfers", remaining);

  await disconnectDb();
}

main().catch(async (err) => {
  console.error("[cleanup-test-ptx] failed", err);
  try {
    await disconnectDb();
  } catch {
    /* ignore */
  }
  process.exitCode = 1;
});

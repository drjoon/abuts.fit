// related files:
// - web/backend/services/practiceTransferComplete.service.js
// - web/backend/services/chatSystemMessage.service.js
// - web/backend/utils/practiceTransferAutoMatchCore.js
//
// 작업완료인데 work_complete / arrival_auto_completed 시스템 채팅이 없는 PTX에
// 「기공소「…」이(가) 작업을 완료했습니다.」를 채운다.
//
// Usage:
//   cd web/backend && \
//     ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//     node scripts/db/backfill-ptx-work-complete-chat.js
//
// Apply: --apply
// Optional: --limit=N
import mongoose from "mongoose";
import { assertSafeToMutateDb, getMongoUri, getDbNameFromMongoUri } from "./_mongo.js";
import { formatPracticeTransferWorkCompletedChat } from "../../utils/practiceTransferAutoMatchCore.js";

const APPLY = process.argv.includes("--apply");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = Math.max(
  1,
  Number(limitArg ? limitArg.slice("--limit=".length) : 500) || 500,
);

async function main() {
  const uri = getMongoUri();
  assertSafeToMutateDb(uri);
  console.log("[backfill-ptx-work-complete-chat]", {
    db: getDbNameFromMongoUri(uri),
    apply: APPLY,
    limit: LIMIT,
  });
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  const db = mongoose.connection.db;

  const transfers = await db
    .collection("practicetransfers")
    .find({
      "autoMatch.completedAt": { $ne: null },
      status: { $nin: ["deleted", "canceled"] },
    })
    .project({
      _id: 1,
      transferId: 1,
      targetLabName: 1,
      assigneeLabName: 1,
      assigneeLabAnchorId: 1,
      assigneeKind: 1,
      targetLabAnchorId: 1,
      requestorDownloadedBy: 1,
      "autoMatch.completedAt": 1,
      "autoMatch.completedBy": 1,
    })
    .sort({ "autoMatch.completedAt": -1 })
    .limit(LIMIT)
    .toArray();

  let scanned = 0;
  let missing = 0;
  let inserted = 0;
  let skippedNoRoom = 0;
  let skippedNoSender = 0;
  const samples = [];

  for (const t of transfers) {
    scanned += 1;
    const room = await db.collection("chatrooms").findOne({
      relatedPracticeTransferId: t._id,
      isArchived: false,
    });
    if (!room?._id) {
      skippedNoRoom += 1;
      continue;
    }
    const existing = await db.collection("chats").findOne({
      roomId: room._id,
      messageKind: "system",
      systemEvent: { $in: ["work_complete", "arrival_auto_completed"] },
    });
    if (existing) continue;

    missing += 1;
    const senderId = t.autoMatch?.completedBy || t.requestorDownloadedBy || null;
    const content = formatPracticeTransferWorkCompletedChat(t);
    if (!senderId || !content) {
      skippedNoSender += 1;
      continue;
    }
    if (samples.length < 10) {
      samples.push({
        transferId: t.transferId,
        content,
        completedAt: t.autoMatch?.completedAt,
      });
    }
    if (!APPLY) continue;

    const completedAt = t.autoMatch?.completedAt
      ? new Date(t.autoMatch.completedAt)
      : new Date();
    await db.collection("chats").insertOne({
      roomId: room._id,
      sender: senderId,
      messageKind: "system",
      systemEvent: "work_complete",
      systemPayload: null,
      content,
      attachments: [],
      replyTo: null,
      reactions: [],
      readBy: [{ userId: senderId, readAt: completedAt }],
      createdAt: completedAt,
      updatedAt: completedAt,
    });
    await db.collection("chatrooms").updateOne(
      { _id: room._id },
      { $set: { lastMessageAt: completedAt } },
    );
    inserted += 1;
  }

  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        scanned,
        missing,
        inserted,
        skippedNoRoom,
        skippedNoSender,
        samples,
      },
      null,
      2,
    ),
  );
  if (!APPLY) {
    console.log("dry-run only. re-run with --apply to insert.");
  }
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

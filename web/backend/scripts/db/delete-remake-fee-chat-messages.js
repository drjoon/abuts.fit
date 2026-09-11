// related files:
// - web/backend/scripts/db/_mongo.js
// - web/backend/services/chatSystemMessage.service.js
//
// 리메이크비 무료 정책 — 리메이크 관련 시스템 채팅 메시지 삭제.
//
// Usage:
//   cd web/backend && \
//     ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//     node scripts/db/delete-remake-fee-chat-messages.js
//
// Apply: --apply
import mongoose from "mongoose";
import { assertSafeToMutateDb, getMongoUri } from "./_mongo.js";

const APPLY = process.argv.includes("--apply");

const REMAKE_SYSTEM_EVENTS = [
  "practice_transfer_remake_charge",
  "practice_transfer_remake_charge_cancel",
  "practice_transfer_remake",
];

async function main() {
  const uri = getMongoUri();
  assertSafeToMutateDb(uri);
  await mongoose.connect(uri, { serverSelectionTimeoutMs: 20000 });
  const chats = mongoose.connection.db.collection("chats");

  const filter = {
    messageKind: "system",
    systemEvent: { $in: REMAKE_SYSTEM_EVENTS },
  };

  const count = await chats.countDocuments(filter);
  const sample = await chats
    .find(filter)
    .project({ content: 1, systemEvent: 1, createdAt: 1, isDeleted: 1 })
    .sort({ createdAt: -1 })
    .limit(15)
    .toArray();

  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        matchCount: count,
        events: REMAKE_SYSTEM_EVENTS,
        sample: sample.map((row) => ({
          systemEvent: row.systemEvent,
          isDeleted: Boolean(row.isDeleted),
          content: String(row.content || "").slice(0, 120),
          createdAt: row.createdAt,
        })),
      },
      null,
      2,
    ),
  );

  if (!APPLY) {
    console.log("dry-run only. re-run with --apply to delete.");
    await mongoose.disconnect();
    return;
  }

  const result = await chats.deleteMany(filter);
  console.log("deleted", { deletedCount: result.deletedCount });
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

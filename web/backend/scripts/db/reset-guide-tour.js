// related files:
// - web/backend/models/user.model.js
// - web/backend/models/practiceTransfer.model.js
// - web/backend/utils/guideTour.util.js
//
// 테스트치과·테스트기공소:
//   1) 소속 유저 가이드투어 미수료 리셋
//   2) 관련 PracticeTransfer(PTX) · 채팅방/메시지 · draft 삭제
//
// Usage:
//   cd web/backend && \
//     ENV_FILE=local.env NODE_ENV=test ABUTS_DB_FORCE=true \
//     node scripts/db/reset-guide-tour.js
//
// Apply: --apply
import mongoose from "mongoose";
import { assertSafeToMutateDb, getMongoUri } from "./_mongo.js";

const APPLY = process.argv.includes("--apply");

const TARGET_NAMES = ["테스트치과", "테스트기공소"];

async function main() {
  const uri = getMongoUri();
  assertSafeToMutateDb(uri);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  const db = mongoose.connection.db;
  const anchors = db.collection("businessanchors");
  const users = db.collection("users");
  const transfers = db.collection("practicetransfers");
  const drafts = db.collection("practicetransferdrafts");
  const chatRooms = db.collection("chatrooms");
  const chats = db.collection("chats");

  const found = await anchors
    .find({
      $or: [
        { name: { $in: TARGET_NAMES } },
        { "profile.companyName": { $in: TARGET_NAMES } },
      ],
    })
    .project({ _id: 1, name: 1, "profile.companyName": 1, requestorKind: 1 })
    .toArray();

  console.log(
    "anchors",
    found.map((a) => ({
      id: String(a._id),
      name: a.name,
      companyName: a.profile?.companyName,
      kind: a.requestorKind,
    })),
  );

  if (found.length === 0) {
    const fuzzy = await anchors
      .find({
        $or: [
          { name: /테스트(치과|기공소)/ },
          { "profile.companyName": /테스트(치과|기공소)/ },
        ],
      })
      .project({ _id: 1, name: 1, "profile.companyName": 1, requestorKind: 1 })
      .toArray();
    console.log(
      "fuzzy anchors",
      fuzzy.map((a) => ({
        id: String(a._id),
        name: a.name,
        companyName: a.profile?.companyName,
        kind: a.requestorKind,
      })),
    );
    found.push(...fuzzy);
  }

  const ids = found.map((a) => a._id);
  if (ids.length === 0) {
    console.log("No matching anchors. Nothing to do.");
    await mongoose.disconnect();
    process.exit(1);
  }

  const userFilter = {
    $or: [
      { businessAnchorId: { $in: ids } },
      { orgBusinessAnchorId: { $in: ids } },
    ],
  };
  const matchedUsers = await users
    .find(userFilter)
    .project({ _id: 1, email: 1, name: 1, guideTour: 1, businessAnchorId: 1 })
    .toArray();
  console.log(
    "users",
    matchedUsers.map((u) => ({
      id: String(u._id),
      email: u.email,
      name: u.name,
      guideTour: u.guideTour,
    })),
  );

  const ptxFilter = {
    $or: [
      { practiceBusinessAnchorId: { $in: ids } },
      { targetLabAnchorId: { $in: ids } },
      { assigneeLabAnchorId: { $in: ids } },
    ],
  };
  const matchedPtx = await transfers
    .find(ptxFilter)
    .project({
      _id: 1,
      transferId: 1,
      patientName: 1,
      practiceBusinessAnchorId: 1,
      targetLabAnchorId: 1,
      status: 1,
      createdAt: 1,
    })
    .toArray();
  console.log("ptx count", matchedPtx.length);
  console.log(
    "ptx sample",
    matchedPtx.slice(0, 10).map((t) => ({
      id: String(t._id),
      transferId: t.transferId,
      patientName: t.patientName,
      status: t.status,
    })),
  );

  const ptxIds = matchedPtx.map((t) => t._id);
  const relatedRooms = ptxIds.length
    ? await chatRooms
        .find({ relatedPracticeTransferId: { $in: ptxIds } })
        .project({ _id: 1 })
        .toArray()
    : [];
  const roomIds = relatedRooms.map((r) => r._id);
  const chatCount = roomIds.length
    ? await chats.countDocuments({ roomId: { $in: roomIds } })
    : 0;
  const draftCount = await drafts.countDocuments({
    $or: [
      { practiceBusinessAnchorId: { $in: ids } },
      { targetLabAnchorId: { $in: ids } },
    ],
  });
  console.log("related", {
    chatRooms: roomIds.length,
    chats: chatCount,
    drafts: draftCount,
  });

  if (!APPLY) {
    console.log("Dry-run only. Re-run with --apply to mutate.");
    await mongoose.disconnect();
    return;
  }

  const guideResult = await users.updateMany(userFilter, {
    $set: {
      "guideTour.completed": false,
      "guideTour.resumeStepId": null,
    },
  });
  console.log("guideTour updated", {
    matched: guideResult.matchedCount,
    modified: guideResult.modifiedCount,
  });

  if (roomIds.length) {
    const chatDel = await chats.deleteMany({ roomId: { $in: roomIds } });
    const roomDel = await chatRooms.deleteMany({ _id: { $in: roomIds } });
    console.log("chat cleaned", {
      chats: chatDel.deletedCount,
      rooms: roomDel.deletedCount,
    });
  }

  const ptxDel = await transfers.deleteMany(ptxFilter);
  console.log("ptx deleted", { deleted: ptxDel.deletedCount });

  const draftDel = await drafts.deleteMany({
    $or: [
      { practiceBusinessAnchorId: { $in: ids } },
      { targetLabAnchorId: { $in: ids } },
    ],
  });
  console.log("drafts deleted", { deleted: draftDel.deletedCount });

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

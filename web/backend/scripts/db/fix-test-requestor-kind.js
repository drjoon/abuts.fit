// related files:
// - web/backend/utils/requestorCapabilities.js
// - web/backend/models/businessAnchor.model.js
// - web/backend/models/user.model.js
//
// MONGODB_URI_TEST 레거시 의뢰자 앵커: 치과/기공소가 전부 lab으로 섞인 값을
// 상호·종목으로 구분해 requestorKind + 레거시 caps를 맞춘다.
//
// Usage:
//   ENV_FILE=test.env node scripts/db/fix-test-requestor-kind.js
//   ENV_FILE=test.env ABUTS_DB_FORCE=true node scripts/db/fix-test-requestor-kind.js --apply
import dotenv from "dotenv";
import mongoose from "mongoose";
import {
  hasAnyRequestorService,
  legacyCapabilitiesFromProfile,
  normalizeRequestorKind,
  normalizeRequestorServices,
} from "../../utils/requestorCapabilities.js";
import { assertSafeToMutateDb } from "./_mongo.js";

const APPLY = process.argv.includes("--apply");

const CLASSIFY = [
  // labs
  { id: "6a366ecda763cade93f0ad65", kind: "lab", name: "(주)센트릭덴탈솔루션" },
  { id: "6a587d934ddce007c7bb0171", kind: "lab", name: "라임 치과기공소" },
  { id: "69f2fb506ba9c2c255ac5769", kind: "lab", name: "레인보우덴탈랩" },
  { id: "6a30af11927fc70fe580064b", kind: "lab", name: "모아치과기공소" },
  { id: "6a3e29508cf58ef2dbdef8e4", kind: "lab", name: "알토란치과기공소" },
  { id: "69cb8cf856d4d586bdc948d5", kind: "lab", name: "우리치과기공소" },
  { id: "69cb878c56d4d586bdc946d4", kind: "lab", name: "통영 Zahn-Art 치과기공소" },
  { id: "6a3342820c96822448f0d103", kind: "lab", name: "티디랩(TD lab)" },
  { id: "6a7bec1b6790bd02b33d5b92", kind: "lab", name: "향기로운기공소" },
  // practices
  { id: "6a1ccc1109b03c6371dafc55", kind: "practice", name: "김치과 의원" },
  { id: "6a1a90cd09b03c6371d6a63f", kind: "practice", name: "남양바른탑치과의원" },
  { id: "69f33f716ba9c2c255acc847", kind: "practice", name: "바른탑치과의원" },
  { id: "6a114de8b9993851c77b437c", kind: "practice", name: "서울녹번치과의원" },
  { id: "6a19389f5e70e2f448804605", kind: "practice", name: "스마트치과" },
  { id: "6a1ab89709b03c6371d6f435", kind: "practice", name: "평온치과의원" },
  { id: "6a76f0d92ebf0193391db96f", kind: "practice", name: "테스트치과" },
  { id: "6a7be9f92ac96a7df488b7cb", kind: "practice", name: "향기로운치과" },
];

const servicesForAnchor = (doc) => {
  const existing = normalizeRequestorServices(doc?.requestorServices);
  if (hasAnyRequestorService(existing)) return existing;
  return { free: false, paid: true };
};

async function main() {
  dotenv.config({ path: process.env.ENV_FILE || "test.env" });
  const uri = process.env.MONGODB_URI_TEST || process.env.MONGO_URI_TEST;
  if (!uri) throw new Error("MONGODB_URI_TEST is required.");
  if (APPLY) assertSafeToMutateDb(uri);

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  const db = mongoose.connection.db;
  const anchorsCol = db.collection("businessanchors");
  const usersCol = db.collection("users");

  try {
    const planned = [];
    for (const row of CLASSIFY) {
      const _id = new mongoose.Types.ObjectId(row.id);
      const doc = await anchorsCol.findOne({ _id });
      if (!doc) {
        planned.push({ ...row, error: "anchor not found" });
        continue;
      }
      if (String(doc.name || "").trim() !== row.name) {
        planned.push({
          ...row,
          error: `name mismatch db="${doc.name}"`,
        });
        continue;
      }

      const kind = normalizeRequestorKind(row.kind);
      const services = servicesForAnchor(doc);
      const caps = legacyCapabilitiesFromProfile({ kind, services });
      const currentKind = normalizeRequestorKind(doc.requestorKind);
      const currentCaps = doc.requestorCapabilities || {};
      const currentServices = normalizeRequestorServices(doc.requestorServices);
      const needsAnchor =
        currentKind !== kind ||
        Boolean(currentCaps.practice) !== Boolean(caps.practice) ||
        Boolean(currentCaps.lab) !== Boolean(caps.lab) ||
        !hasAnyRequestorService(doc.requestorServices) ||
        Boolean(currentServices.free) !== Boolean(services.free) ||
        Boolean(currentServices.paid) !== Boolean(services.paid);

      const linkedUsers = await usersCol
        .find({ businessAnchorId: _id })
        .project({
          _id: 1,
          email: 1,
          role: 1,
          requestorKind: 1,
          requestorServices: 1,
          requestorCapabilities: 1,
        })
        .toArray();

      const userUpdates = linkedUsers
        .map((u) => {
          const uKind = normalizeRequestorKind(u.requestorKind);
          const uCaps = u.requestorCapabilities || {};
          const uServices = normalizeRequestorServices(u.requestorServices);
          const needsUser =
            u.role === "practice" ||
            uKind !== kind ||
            Boolean(uCaps.practice) !== Boolean(caps.practice) ||
            Boolean(uCaps.lab) !== Boolean(caps.lab) ||
            !hasAnyRequestorService(u.requestorServices) ||
            Boolean(uServices.free) !== Boolean(services.free) ||
            Boolean(uServices.paid) !== Boolean(services.paid);
          if (!needsUser) return null;
          return {
            email: u.email,
            from: {
              role: u.role,
              requestorKind: u.requestorKind || null,
              caps: uCaps,
            },
          };
        })
        .filter(Boolean);

      planned.push({
        id: row.id,
        name: row.name,
        kind,
        services,
        caps,
        needsAnchor,
        from: {
          requestorKind: doc.requestorKind || null,
          services: doc.requestorServices || null,
          caps: currentCaps,
          status: doc.status,
        },
        userUpdates,
      });
    }

    console.log(
      JSON.stringify(
        {
          apply: APPLY,
          total: planned.length,
          missing: planned.filter((p) => p.error),
          changeAnchors: planned.filter((p) => p.needsAnchor && !p.error).length,
          changeUsers: planned.reduce(
            (n, p) => n + (p.userUpdates?.length || 0),
            0,
          ),
          rows: planned,
        },
        null,
        2,
      ),
    );

    if (!APPLY) {
      console.log("[fix-test-requestor-kind] dry-run only. Pass --apply to write.");
      return;
    }

    let anchorUpdated = 0;
    let userUpdated = 0;
    for (const row of planned) {
      if (row.error || !row.needsAnchor && !(row.userUpdates || []).length) continue;
      const _id = new mongoose.Types.ObjectId(row.id);
      if (row.needsAnchor) {
        const res = await anchorsCol.updateOne(
          { _id },
          {
            $set: {
              requestorKind: row.kind,
              requestorServices: row.services,
              requestorCapabilities: row.caps,
            },
          },
        );
        if (res.modifiedCount) anchorUpdated += 1;
      }

      const userRes = await usersCol.updateMany(
        { businessAnchorId: _id },
        {
          $set: {
            role: "requestor",
            requestorKind: row.kind,
            requestorServices: row.services,
            requestorCapabilities: row.caps,
          },
        },
      );
      userUpdated += Number(userRes.modifiedCount || 0);
    }

    console.log("[fix-test-requestor-kind] done", { anchorUpdated, userUpdated });
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error("[fix-test-requestor-kind] failed", err);
  process.exitCode = 1;
});

// related files:
// - web/backend/utils/cloudSandbox.js
// - web/backend/scripts/db/_core.shared.js
// - web/backend/rules.md
//
// 클라우드 개발용 로컬 샌드박스.
// 베타 DB(MONGODB_URI_TEST)에는 접속하지 않는다.
// up: 저장소 안 샘플(연결·파일명 규칙·라벨)을 샌드박스에 복사한다.
// down: 127.0.0.1의 abuts_fit_sandbox만 지운다.
import mongoose from "mongoose";
import {
  CLOUD_SANDBOX_URI,
  assertSandboxDropAllowed,
} from "../../utils/cloudSandbox.js";

const command = String(process.argv[2] || "up").trim().toLowerCase();

async function connectSandbox() {
  await mongoose.connect(CLOUD_SANDBOX_URI, {
    serverSelectionTimeoutMS: 8000,
    maxPoolSize: 5,
  });
  const host = String(mongoose.connection.host || "");
  const dbName = String(mongoose.connection.name || "");
  assertSandboxDropAllowed({ host, dbName });
  return { host, dbName };
}

async function copySample() {
  // down 경로에서는 모델을 불러오지 않는다. 연결 직후 인덱스 생성이 샌드박스를 다시 만든다.
  const { seedCoreShared } = await import("./_core.shared.js");
  const core = await seedCoreShared();
  await mongoose.connection.collection("cloudSandboxMeta").updateOne(
    { _id: "sandbox" },
    {
      $set: {
        sample: "repo-core-seeds",
        betaContacted: false,
        copiedAt: new Date(),
      },
    },
    { upsert: true },
  );
  return core;
}

async function up() {
  const target = await connectSandbox();
  const core = await copySample();
  console.log("[cloud-sandbox] sample copied", {
    db: target.dbName,
    host: target.host,
    betaContacted: false,
    core,
  });
}

async function down() {
  const target = await connectSandbox();
  assertSandboxDropAllowed(target);
  const dropped = await mongoose.connection.db.dropDatabase();
  if (!dropped) {
    throw new Error("Sandbox dropDatabase did not succeed.");
  }
  console.log("[cloud-sandbox] sandbox dropped", {
    db: target.dbName,
    host: target.host,
  });
}

async function run() {
  if (command !== "up" && command !== "down") {
    throw new Error("Usage: node scripts/db/cloud-sandbox.js <up|down>");
  }
  try {
    if (command === "down") await down();
    else await up();
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
}

run().catch((err) => {
  console.error("[cloud-sandbox] failed", err?.message || err);
  process.exit(1);
});

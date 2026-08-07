// related files:
// - web/backend/rules.md
// - web/backend/tests/mongoSafety.js
// - web/backend/app.js
// - web/backend/server.js
import mongoose from "mongoose";
import { config } from "dotenv";
import {
  assertLocalJestMongoUri,
  isLocalHostName,
  isLocalMongoUri,
  redactMongoUri,
  resolveJestMongoUri,
} from "./mongoSafety.js";

// 환경 변수 로드 (.env.test가 있으면 사용. 없어도 Atlas URI를 기본값으로 쓰지 않는다.)
config({ path: ".env.test" });

let jestMongoReady = false;
let jestMongoUri = "";

function assertConnectedHostIsLocal() {
  const host = String(mongoose.connection?.host || "").trim();
  if (!isLocalHostName(host)) {
    throw new Error(
      `Jest refuses to wipe MongoDB host=${host || "unknown"} (non-local).`,
    );
  }
  // belt-and-suspenders: URI we connected with must still be local
  if (jestMongoUri && !isLocalMongoUri(jestMongoUri)) {
    throw new Error(
      `Jest refuses to wipe non-local URI ${redactMongoUri(jestMongoUri)}.`,
    );
  }
}

async function clearCollections() {
  if (!jestMongoReady) return;
  if (mongoose.connection.readyState !== 1) return;

  assertConnectedHostIsLocal();

  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
}

// 테스트 전 MongoDB 연결 — 로컬 전용. Atlas/공유 DB면 즉시 실패(삭제 없음).
beforeAll(async () => {
  jestMongoUri = resolveJestMongoUri();
  assertLocalJestMongoUri(jestMongoUri);

  await mongoose.connect(jestMongoUri);
  assertConnectedHostIsLocal();
  jestMongoReady = true;
});

// 각 테스트 후 컬렉션 정리 — 로컬 연결일 때만
afterEach(async () => {
  await clearCollections();
});

// 모든 테스트 후 연결 종료
afterAll(async () => {
  try {
    await clearCollections();
  } finally {
    jestMongoReady = false;
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
});

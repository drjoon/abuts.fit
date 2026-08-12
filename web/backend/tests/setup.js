// related files:
// - web/backend/rules.md
// - web/backend/tests/mongoSafety.js
// - web/backend/app.js
// - web/backend/server.js
import mongoose from "mongoose";
import { config } from "dotenv";
import { jest } from "@jest/globals";
import {
  assertSafeJestMongoUri,
  isExplicitRemoteJestDbAllowed,
  isLocalHostName,
  isLocalMongoUri,
  redactMongoUri,
  resolveJestMongoUri,
} from "./mongoSafety.js";

// 환경 변수 로드 (.env.test가 있으면 사용. 없어도 Atlas URI를 기본값으로 쓰지 않는다.)
config({ path: ".env.test" });

let jestMongoReady = false;
let jestMongoUri = "";

// Atlas의 네트워크 왕복 시간은 로컬 Mongo와 달리 afterEach 정리와 개별 fixture
// 생성이 5초를 넘길 수 있다. 명시적으로 허용한 전용 DB에서만 제한을 늘린다.
if (isExplicitRemoteJestDbAllowed(resolveJestMongoUri())) {
  jest.setTimeout(120000);
}

function assertConnectedHostIsSafe() {
  const host = String(mongoose.connection?.host || "").trim();
  const isLocal = isLocalHostName(host);
  const isExplicitRemote = isExplicitRemoteJestDbAllowed(jestMongoUri);
  if (!isLocal && !isExplicitRemote) {
    throw new Error(
      `Jest refuses to wipe MongoDB host=${host || "unknown"}.`,
    );
  }
  // belt-and-suspenders: URI must be local or an explicitly approved disposable DB.
  if (
    jestMongoUri &&
    !isLocalMongoUri(jestMongoUri) &&
    !isExplicitRemoteJestDbAllowed(jestMongoUri)
  ) {
    throw new Error(
      `Jest refuses to wipe non-local URI ${redactMongoUri(jestMongoUri)}.`,
    );
  }
}

async function clearCollections() {
  if (!jestMongoReady) return;
  if (mongoose.connection.readyState !== 1) return;

  assertConnectedHostIsSafe();

  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
}

// 테스트 전 MongoDB 연결 — 로컬 기본. Atlas는 전용 DB명 + 명시적 opt-in일 때만 허용.
beforeAll(async () => {
  jestMongoUri = resolveJestMongoUri();
  assertSafeJestMongoUri(jestMongoUri);

  await mongoose.connect(jestMongoUri);
  assertConnectedHostIsSafe();
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

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

if (String(process.env.NODE_ENV || "").trim() === "production") {
  throw new Error("Jest refuses to run with NODE_ENV=production.");
}

// 환경 변수 로드 (.env.test가 있으면 사용. 없어도 Atlas URI를 기본값으로 쓰지 않는다.)
config({ path: ".env.test" });

// app.js는 import 시점에 resolveMongoUri()로 연결을 시작하고, bootstrap/env.js는
// ENV_FILE(local.env/test.env → Atlas)을 읽는다. 테스트 파일이 app.js를 import하기
// 전에 env 파일 로드를 막고 모든 Mongo URI 키를 검증된 Jest URI 하나로 고정한다.
const pinnedJestMongoUri = resolveJestMongoUri();
assertSafeJestMongoUri(pinnedJestMongoUri);
globalThis.__abuts_env_loaded = true;
delete process.env.ENV_FILE;
for (const key of [
  "MONGODB_URI_TEST",
  "MONGO_URI_TEST",
  "MONGODB_URI",
  "MONGO_URI",
]) {
  process.env[key] = pinnedJestMongoUri;
}

// tests/jestMongoEnvironment.js가 파일 종료 시 이 인스턴스의 연결을 닫는다.
globalThis.__abutsJestMongoose = mongoose;

let jestMongoReady = false;
let jestMongoUri = "";

// Atlas의 네트워크 왕복 시간은 로컬 Mongo와 달리 afterEach 정리와 개별 fixture
// 생성이 5초를 넘길 수 있다. 명시적으로 허용한 전용 DB에서만 제한을 늘린다.
if (isExplicitRemoteJestDbAllowed(pinnedJestMongoUri)) {
  jest.setTimeout(120000);
}

// connection.host는 첫 host만 담고, 연결 완료 전에는 undefined다.
// 실제 MongoClient가 접속한 host 목록 전체가 로컬인지 본다.
function connectedMongoHosts() {
  const conn = mongoose.connection;
  let hosts = [];
  try {
    hosts = (conn.getClient()?.options?.hosts || [])
      .map((h) => String(h?.host || h?.socketPath || "").trim())
      .filter(Boolean);
  } catch {
    hosts = [];
  }
  if (!hosts.length && conn?.host) hosts = [String(conn.host).trim()];
  return hosts;
}

function assertConnectedHostIsSafe() {
  const hosts = connectedMongoHosts();
  const isLocal = hosts.length > 0 && hosts.every((h) => isLocalHostName(h));
  const isExplicitRemote = isExplicitRemoteJestDbAllowed(jestMongoUri);
  if (!isLocal && !isExplicitRemote) {
    throw new Error(
      `Jest refuses to wipe MongoDB host=${hosts.join(",") || "unknown"}.`,
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
  if (jestMongoUri !== pinnedJestMongoUri) {
    throw new Error(
      `Jest Mongo URI changed after setup: ${redactMongoUri(jestMongoUri)}.`,
    );
  }
  assertSafeJestMongoUri(jestMongoUri);

  // app.js가 같은 URI로 이미 connecting 중이면 mongoose.connect()는 기다리지 않고
  // 바로 반환한다. 실제 open까지 기다린 뒤 host를 검사한다.
  await mongoose.connect(jestMongoUri);
  await mongoose.connection.asPromise();
  assertConnectedHostIsSafe();

  // 새 DB에서는 모델 인덱스 생성이 첫 fixture 저장과 겹쳐 5초 hook 제한을 넘긴다.
  await Promise.all(
    Object.values(mongoose.connection.models).map((model) =>
      model.init().catch(() => {}),
    ),
  );
  jestMongoReady = true;
}, 60000);

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

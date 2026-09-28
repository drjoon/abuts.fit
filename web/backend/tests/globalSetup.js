// related files:
// - web/backend/jest.config.js
// - web/backend/tests/globalTeardown.js
// - web/backend/tests/setup.js
// - web/backend/tests/mongoSafety.js

/**
 * JEST_MEMORY_MONGO=true(`npm run test:integration`)이면 일회용 로컬 replica set을
 * 띄우고 MONGODB_URI_TEST를 그 URI로 덮는다. 셸에 Atlas URI가 export돼 있어도
 * 이 모드에서는 메모리 Mongo만 쓴다. 파일마다 컬렉션을 비우므로 --runInBand로 돌린다.
 * 그 외에는 아무것도 하지 않는다(MONGODB_URI_TEST 또는 127.0.0.1:27017).
 */
export default async function globalSetup() {
  const enabled = ["1", "true", "yes"].includes(
    String(process.env.JEST_MEMORY_MONGO || "").trim().toLowerCase(),
  );
  if (!enabled) return;

  const { MongoMemoryReplSet } = await import("mongodb-memory-server-core");
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
    instanceOpts: [{ ip: "127.0.0.1" }],
  });
  globalThis.__abutsMemoryMongo = replSet;

  const uri = replSet.getUri("abutsFitTest");
  process.env.MONGODB_URI_TEST = uri;
  process.env.MONGO_URI_TEST = uri;
}

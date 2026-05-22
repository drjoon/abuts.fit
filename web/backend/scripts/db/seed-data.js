import { connectDb, disconnectDb } from "./_mongo.js";
import { seedCoreShared } from "./_core.shared.js";

function parseCountArg() {
  const raw = process.argv[2];
  if (!raw) return 50;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid seed-data count: ${raw}`);
  }
  return value;
}

async function run() {
  try {
    await connectDb();
    const count = parseCountArg();
    const core = await seedCoreShared();

    // 의도적으로 request/ledger/shipping 샘플 데이터 관련 시딩 로직은 제거했습니다.
    // `scripts/db/seed/data.js`는 이미 request 관련 시드를 비활성화되어 있으며,
    // 운영 DB 오염을 막기 위해 의뢰 관련 샘플 시드는 별도 opt-in 스크립트로 분리해야 합니다.

    console.log("[db] seed-data done", {
      count,
      core,
      requestData: { disabled: true },
    });
  } finally {
    await disconnectDb();
  }
}

run().catch((err) => {
  console.error("[db] seed-data failed", err);
  process.exit(1);
});

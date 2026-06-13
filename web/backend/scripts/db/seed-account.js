import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { connectDb, disconnectDb } from "./_mongo.js";
// 안전 정책: db:seed-account는 필수 계정만 생성한다.
// 벌크/mock 계정 생성은 이 스크립트에서 호출하지 않는다.
import { seedEssentialAccounts } from "./seed/accounts.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SEED_DIR = path.join(__dirname, "seed");
const ESSENTIAL_OUTPUT_PATH = path.join(SEED_DIR, ".essential-accounts.json");
const BULK_OUTPUT_PATH = path.join(SEED_DIR, ".bulk-accounts.json");

async function persistJsonFile(filePath, payload, label) {
  if (!payload) return;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), {
    mode: 0o600,
  });
  console.log(`[db] ${label} saved`, {
    path: filePath,
  });
}

async function run() {
  try {
    await connectDb();

    const essentialResult = await seedEssentialAccounts();
    if (essentialResult?.users?.length) {
      await persistJsonFile(
        ESSENTIAL_OUTPUT_PATH,
        {
          generatedAt: new Date().toISOString(),
          users: essentialResult.users,
        },
        "essential account credentials",
      );
    }
  } finally {
    await disconnectDb();
  }
}

run().catch((err) => {
  console.error("[db] seed-account failed", err);
  process.exit(1);
});

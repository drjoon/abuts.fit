import { clearAllCollections, connectDb, disconnectDb } from "./_mongo.js";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runScript(scriptName) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, scriptName)], {
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${scriptName} exited with code ${code}`));
    });
  });
}

/**
 * DB 버전을 자동으로 증가시킵니다.
 * /web/backend/config/dbVersion.js 파일의 DB_VERSION 값을 1 증가시킵니다.
 */
async function incrementDbVersion() {
  const dbVersionPath = path.resolve(__dirname, "../../config/dbVersion.js");

  try {
    const content = fs.readFileSync(dbVersionPath, "utf-8");

    // DB_VERSION = "숫자" 패턴 찾기
    const versionMatch = content.match(/export const DB_VERSION = "(\d+)"/);

    if (!versionMatch) {
      console.warn(
        "[db] DB_VERSION not found in dbVersion.js, skipping version increment",
      );
      return;
    }

    const currentVersion = parseInt(versionMatch[1], 10);
    const nextVersion = currentVersion + 1;

    // 버전 증가
    const newContent = content.replace(
      /export const DB_VERSION = "\d+"/,
      `export const DB_VERSION = "${nextVersion}"`,
    );

    fs.writeFileSync(dbVersionPath, newContent, "utf-8");

    console.log(
      `[db] DB_VERSION incremented: ${currentVersion} → ${nextVersion}`,
    );
    console.log(`[db] Updated: ${dbVersionPath}`);
  } catch (error) {
    console.error("[db] Failed to increment DB_VERSION:", error.message);
    console.warn(
      "[db] Please manually update DB_VERSION in config/dbVersion.js",
    );
  }
}

async function run() {
  // DB 버전 증가 (리셋 전에 먼저 실행)
  await incrementDbVersion();

  try {
    await connectDb();
    await clearAllCollections();
    console.log("[db] reset done");
  } finally {
    await disconnectDb();
  }

  await runScript("implant-preset.js");
  await runScript("seed-prc-mappings.js");
  await runScript("seed-account.js");
  await runScript("reset-password.js");
}

run().catch((err) => {
  console.error("[db] reset failed", err);
  process.exit(1);
});

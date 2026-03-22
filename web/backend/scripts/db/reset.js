import { clearAllCollections, connectDb, disconnectDb } from "./_mongo.js";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

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

async function run() {
  try {
    await connectDb();
    await clearAllCollections();
    console.log("[db] reset done");
  } finally {
    await disconnectDb();
  }

  await runScript("implant-preset.js");
  await runScript("seed-account.js");
  await runScript("reset-password.js");
}

run().catch((err) => {
  console.error("[db] reset failed", err);
  process.exit(1);
});

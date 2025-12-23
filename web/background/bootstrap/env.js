import { config } from "dotenv";
import { existsSync } from "fs";
import { dirname, isAbsolute, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const toBool = (v) =>
  String(v || "")
    .trim()
    .toLowerCase() === "true";

const redactUrlCredentials = (uri) => {
  const s = String(uri || "");
  if (!s) return "";
  return s.replace(/\/\/(.*)@/, "//***@");
};

export function ensureEnvLoaded() {
  if (globalThis.__abuts_bg_env_loaded) return;
  globalThis.__abuts_bg_env_loaded = true;

  const envFile = String(process.env.ENV_FILE || "").trim();
  if (!envFile) {
    config();
  } else {
    const candidates = isAbsolute(envFile)
      ? [envFile]
      : [
          resolve(process.cwd(), envFile),
          resolve(process.cwd(), "..", envFile),
          resolve(process.cwd(), "..", "..", envFile),
          resolve(__dirname, "..", envFile),
          resolve(__dirname, "..", "..", envFile),
        ];

    const found = candidates.find((p) => existsSync(p));
    if (found) {
      config({ path: found });
      globalThis.__abuts_bg_env_path = found;
    } else {
      console.warn(
        `[dotenv/bg] ENV_FILE not found. ENV_FILE=${envFile}. Tried: ${candidates.join(
          ", "
        )}`
      );
      config();
    }
  }

  if (toBool(process.env.DEBUG_DOTENV)) {
    console.log("[dotenv/bg] loaded", {
      envFile: String(process.env.ENV_FILE || "").trim() || null,
      resolvedEnvPath: globalThis.__abuts_bg_env_path || null,
      cwd: process.cwd(),
      hasMongoUriTest: !!process.env.MONGODB_URI_TEST,
      hasMongoUri: !!process.env.MONGODB_URI,
      mongoUriTest: redactUrlCredentials(process.env.MONGODB_URI_TEST),
      mongoUri: redactUrlCredentials(process.env.MONGODB_URI),
    });
  }
}

ensureEnvLoaded();

import { existsSync, readFileSync } from "fs";
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

const parseDotenvLine = (line) => {
  const s = String(line || "").trim();
  if (!s) return null;
  if (s.startsWith("#")) return null;

  const idx = s.indexOf("=");
  if (idx < 0) return null;

  const key = s.slice(0, idx).trim();
  if (!key) return null;

  let value = s.slice(idx + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return { key, value };
};

const loadEnvFileIntoProcessEnv = (path) => {
  try {
    const content = readFileSync(path, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const parsed = parseDotenvLine(line);
      if (!parsed) continue;
      if (process.env[parsed.key] === undefined) {
        process.env[parsed.key] = parsed.value;
      }
    }
    globalThis.__abuts_env_path = path;
  } catch (e) {
    console.warn(`[dotenv] failed to read env file: ${path}`, e);
  }
};

export function ensureEnvLoaded() {
  if (globalThis.__abuts_env_loaded) return;
  globalThis.__abuts_env_loaded = true;

  const envFile = String(process.env.ENV_FILE || "").trim();
  if (!envFile) {
    return;
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
      loadEnvFileIntoProcessEnv(found);
    } else {
      console.warn(
        `[dotenv] ENV_FILE not found. ENV_FILE=${envFile}. Tried: ${candidates.join(
          ", "
        )}`
      );
    }
  }

  if (toBool(process.env.DEBUG_DOTENV)) {
    console.log("[dotenv] loaded", {
      envFile: String(process.env.ENV_FILE || "").trim() || null,
      resolvedEnvPath: globalThis.__abuts_env_path || null,
      cwd: process.cwd(),
      hasMongoUriTest: !!process.env.MONGODB_URI_TEST,
      hasMongoUri: !!process.env.MONGODB_URI,
      mongoUriTest: redactUrlCredentials(process.env.MONGODB_URI_TEST),
      mongoUri: redactUrlCredentials(process.env.MONGODB_URI),
    });
  }
}

ensureEnvLoaded();

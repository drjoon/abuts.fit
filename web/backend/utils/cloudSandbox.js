// related files:
// - web/backend/utils/mongoUri.js
// - web/backend/scripts/db/cloud-sandbox.js
// - web/backend/rules.md

// 클라우드 개발은 베타 DB(MONGODB_URI_TEST)에 붙지 않는다.
// 샘플은 로컬 샌드박스에만 복사하고, 해제는 이 데이터베이스만 지운다.
export const CLOUD_SANDBOX_DB = "abuts_fit_sandbox";
export const CLOUD_SANDBOX_URI = `mongodb://127.0.0.1:27017/${CLOUD_SANDBOX_DB}`;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function isCloudSandboxEnabled() {
  const value = String(process.env.ABUTS_CLOUD_SANDBOX || "")
    .trim()
    .toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function assertCloudSandboxEnabledForRuntime() {
  if (process.env.NODE_ENV === "production" && isCloudSandboxEnabled()) {
    throw new Error(
      "ABUTS_CLOUD_SANDBOX cannot be used when NODE_ENV=production.",
    );
  }
}

export function assertSandboxDropAllowed({ host, dbName }) {
  const normalizedHost = String(host || "")
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/, "$1");
  const name = String(dbName || "").trim();
  if (!LOCAL_HOSTS.has(normalizedHost) || name !== CLOUD_SANDBOX_DB) {
    throw new Error(
      `Refusing to drop database host=${normalizedHost || "unknown"} db=${name || "unknown"}.`,
    );
  }
}

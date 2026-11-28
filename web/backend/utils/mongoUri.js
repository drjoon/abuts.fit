// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/utils/cloudSandbox.js
import {
  CLOUD_SANDBOX_URI,
  assertCloudSandboxEnabledForRuntime,
  isCloudSandboxEnabled,
} from "./cloudSandbox.js";

export function resolveMongoUri() {
  if (isCloudSandboxEnabled()) {
    assertCloudSandboxEnabledForRuntime();
    // 주입된 베타 URI가 있어도 로컬 샌드박스만 연다.
    return CLOUD_SANDBOX_URI;
  }

  const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
    return process.env.MONGODB_URI || process.env.MONGO_URI || "";
  }

  // dev/test는 항상 TEST URI를 우선 사용한다.
  return process.env.MONGODB_URI_TEST || process.env.MONGO_URI_TEST || "";
}

export function resolveMongoSourceLabel() {
  if (isCloudSandboxEnabled()) return "SANDBOX DB";

  const isProd = process.env.NODE_ENV === "production";
  if (isProd) return "PROD DB";

  if (process.env.MONGODB_URI_TEST || process.env.MONGO_URI_TEST) {
    return "TEST DB";
  }

  if (process.env.MONGODB_URI || process.env.MONGO_URI) {
    return "DEV DB";
  }

  return "UNSET DB";
}

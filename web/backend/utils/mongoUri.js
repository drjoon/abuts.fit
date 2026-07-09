export function resolveMongoUri() {
  const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
    return process.env.MONGODB_URI || process.env.MONGO_URI || "";
  }

  // dev/test는 항상 TEST URI를 우선 사용한다.
  return process.env.MONGODB_URI_TEST || process.env.MONGO_URI_TEST || "";
}

export function resolveMongoSourceLabel() {
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

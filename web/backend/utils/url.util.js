export function getFrontendBaseUrl(req) {
  const configured = String(
    process.env.FRONTEND_PUBLIC_URL ||
      process.env.OAUTH_FRONTEND_URL ||
      process.env.FRONTEND_URL ||
      ""
  ).trim();
  if (configured) return configured;

  const proto = (
    req.headers["cloudfront-forwarded-proto"] ||
    req.headers["x-forwarded-proto"] ||
    req.protocol ||
    "http"
  )
    .toString()
    .split(",")[0]
    .trim();

  return `${proto}://${req.get("host")}`;
}

export function getBackendBaseUrl(req) {
  const configured = String(process.env.BACKEND_PUBLIC_URL || "").trim();
  if (configured) return configured;
  const proto = (
    req.headers["cloudfront-forwarded-proto"] ||
    req.headers["x-forwarded-proto"] ||
    req.protocol ||
    "http"
  )
    .toString()
    .split(",")[0]
    .trim();
  return `${proto}://${req.get("host")}`;
}

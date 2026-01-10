function parseAllowlist() {
  return (process.env.BRIDGE_ALLOWLIST_IPS || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function normalizeIp(ip) {
  if (!ip) return "";
  // Express가 IPv4를 "::ffff:" prefix로 전달하는 경우를 정규화
  if (ip.startsWith("::ffff:")) return ip.slice(7);
  return ip;
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded && typeof forwarded === "string") {
    const first = forwarded.split(",")[0]?.trim();
    return normalizeIp(first);
  }
  return normalizeIp(req.ip);
}

export function requireBridgeIpAllowlist(req, res, next) {
  const allowlist = parseAllowlist();
  if (allowlist.length === 0) return next(); // 미설정 시 허용

  const ip = getClientIp(req);
  if (allowlist.includes(ip)) return next();

  return res.status(403).json({
    success: false,
    message: "Forbidden: bridge IP not allowed",
  });
}

export function requireBridgeSecret(req, res, next) {
  const secret = process.env.BRIDGE_SHARED_SECRET || "";
  if (!secret) {
    return next();
  }

  const provided = String(req.headers["x-bridge-secret"] || "");
  if (!provided || provided !== secret) {
    return res.status(401).json({
      success: false,
      message: "Invalid bridge secret",
    });
  }
  return next();
}

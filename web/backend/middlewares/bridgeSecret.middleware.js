function getSecrets(envKeys) {
  return envKeys
    .map((key) => String(process.env[key] || "").trim())
    .filter(Boolean);
}

export function requireSecretFromEnv(envKey, label = "secret") {
  return function requireSecret(req, res, next) {
    const secrets = getSecrets([envKey]);
    if (!secrets.length) {
      return next();
    }

    const provided = String(req.headers["x-bridge-secret"] || "");
    if (!provided || !secrets.includes(provided)) {
      return res.status(401).json({
        success: false,
        message: `Invalid ${label}`,
      });
    }
    return next();
  };
}

export function requireAnySecretFromEnv(envKeys, label = "secret") {
  return function requireAnySecret(req, res, next) {
    const secrets = getSecrets(envKeys);
    if (!secrets.length) {
      return next();
    }

    const provided = String(req.headers["x-bridge-secret"] || "");
    if (!provided || !secrets.includes(provided)) {
      return res.status(401).json({
        success: false,
        message: `Invalid ${label}`,
      });
    }
    return next();
  };
}

export const requireBridgeSecret = requireSecretFromEnv(
  "BRIDGE_SHARED_SECRET",
  "bridge secret",
);

export const requirePc1BgSecret = requireAnySecretFromEnv(
  ["BRIDGE_SHARED_SECRET", "RHINO_SHARED_SECRET", "ESPRIT_SHARED_SECRET"],
  "PC1 service secret",
);

export const requireBgWorkerSecret = requireAnySecretFromEnv(
  [
    "BRIDGE_SHARED_SECRET",
    "RHINO_SHARED_SECRET",
    "ESPRIT_SHARED_SECRET",
    "LOT_SHARED_SECRET",
  ],
  "BG worker secret",
);

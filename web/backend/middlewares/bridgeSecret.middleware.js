function getSecrets(envKeys) {
  return envKeys
    .map((key) => String(process.env[key] || "").trim())
    .filter(Boolean);
}

function logSecretMismatch(req, envKeys, provided, label) {
  try {
    const path = String(req.originalUrl || req.url || "");
    const loadedKeys = envKeys.filter(
      (key) => String(process.env[key] || "").trim().length > 0,
    );
    console.warn("[BG-SECRET] mismatch", {
      path,
      label,
      loadedKeys,
      providedLength: String(provided || "").length,
      remoteIp: req.ip,
      forwardedFor: req.headers["x-forwarded-for"] || null,
    });
  } catch {}
}

function buildSecretMismatchDebug(envKeys, provided) {
  if (process.env.NODE_ENV !== "development") return undefined;
  return {
    loadedKeys: envKeys.filter(
      (key) => String(process.env[key] || "").trim().length > 0,
    ),
    providedLength: String(provided || "").length,
  };
}

export function requireSecretFromEnv(envKey, label = "secret") {
  return function requireSecret(req, res, next) {
    const secrets = getSecrets([envKey]);
    if (!secrets.length) {
      return next();
    }

    const provided = String(req.headers["x-bridge-secret"] || "");
    if (!provided || !secrets.includes(provided)) {
      logSecretMismatch(req, [envKey], provided, label);
      return res.status(401).json({
        success: false,
        message: `Invalid ${label}`,
        debug: buildSecretMismatchDebug([envKey], provided),
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
      logSecretMismatch(req, envKeys, provided, label);
      return res.status(401).json({
        success: false,
        message: `Invalid ${label}`,
        debug: buildSecretMismatchDebug(envKeys, provided),
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

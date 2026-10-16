// related files:
// - bg/pc1/esprit-addin/Helpers/EspDownloadAuth.cs
// - web/backend/controllers/requests/common.nc.controller.js
import crypto from "node:crypto";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function resolveEspritSharedSecret() {
  return String(
    process.env.ESPRIT_SHARED_SECRET || process.env.BRIDGE_SHARED_SECRET || "",
  ).trim();
}

/**
 * 브라우저가 운영 PC에서 ESP를 직접 받을 URL. 공인 ESPRIT_BASE + HMAC(exp,sig)일 때만.
 */
export function buildDirectEspritEspDownloadUrl(espritBase, requestId) {
  const rid = String(requestId || "").trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(rid)) return null;

  const base = String(espritBase || "")
    .trim()
    .replace(/\/+$/, "");
  if (!base) return null;

  let host = "";
  try {
    host = new URL(base).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (LOCAL_HOSTS.has(host)) return null;

  const secret = resolveEspritSharedSecret();
  if (!secret) return null;

  const exp = Math.floor(Date.now() / 1000) + 120;
  const payload = `${rid}:${exp}`;
  const sig = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");

  return `${base}/esp/${encodeURIComponent(rid)}?exp=${exp}&sig=${encodeURIComponent(sig)}`;
}

// related files:
// - web/backend/models/scannerIntegration.model.js
// - web/backend/controllers/integrations/threeShape.controller.js
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

function resolveKey() {
  const raw = String(process.env.SCANNER_INTEGRATION_SECRET || "").trim();
  if (!raw) {
    throw new Error(
      "SCANNER_INTEGRATION_SECRET가 필요합니다. backend/*.env에 설정해주세요.",
    );
  }
  return createHash("sha256").update(raw, "utf8").digest();
}

/**
 * @param {unknown} payload
 * @returns {string} base64url: iv.tag.ciphertext
 */
export function encryptScannerCredentials(payload) {
  const key = resolveKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const plain = Buffer.from(JSON.stringify(payload ?? {}), "utf8");
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

/**
 * @param {string} cipherText
 * @returns {Record<string, unknown>}
 */
export function decryptScannerCredentials(cipherText) {
  const raw = String(cipherText || "").trim();
  const parts = raw.split(".");
  if (parts.length !== 3) {
    throw new Error("자격증명 암호문이 올바르지 않습니다.");
  }
  const [ivB64, tagB64, dataB64] = parts;
  const key = resolveKey();
  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  const data = Buffer.from(dataB64, "base64url");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(plain.toString("utf8"));
}

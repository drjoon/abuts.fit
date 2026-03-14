import { isDeepStrictEqual } from "node:util";

export function hasOwnKey(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

export function normalizeBusinessNumberDigits(input) {
  const digits = String(input || "").replace(/\D/g, "");
  if (digits.length !== 10) return "";
  return digits;
}

export function formatBusinessNumber(input) {
  const digits = normalizeBusinessNumberDigits(input);
  if (!digits) return "";
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

export function normalizeBusinessNumber(input) {
  return formatBusinessNumber(input);
}

export function normalizePhoneNumber(input) {
  const digits = String(input || "").replace(/\D/g, "");
  if (!digits.startsWith("0")) return "";
  if (digits.startsWith("02")) {
    if (digits.length === 9) return `02-${digits.slice(2, 5)}-${digits.slice(5)}`;
    if (digits.length === 10) return `02-${digits.slice(2, 6)}-${digits.slice(6)}`;
    return "";
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  return "";
}

export function isValidEmail(input) {
  const v = String(input || "").trim();
  if (!v) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export function isValidAddress(input) {
  const v = String(input || "").trim();
  return v.length >= 5;
}

export function normalizeStartDate(input) {
  const digits = String(input || "").replace(/\D/g, "");
  if (digits.length !== 8) return "";
  return digits;
}

export function isDuplicateKeyError(err) {
  const code = err?.code;
  const name = String(err?.name || "");
  const msg = String(err?.message || "");
  return code === 11000 || name.includes("MongoServerError") || msg.includes("E11000");
}

export function shallowEquals(a, b) {
  return isDeepStrictEqual(a, b);
}

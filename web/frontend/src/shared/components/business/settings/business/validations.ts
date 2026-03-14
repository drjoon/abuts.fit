export const normalizeBusinessNumber = (input: string): string => {
  const digits = String(input || "").replace(/\D/g, "");
  if (digits.length !== 10) return "";
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
};

export const normalizePhoneNumber = (input: string): string => {
  const digits = String(input || "").replace(/\D/g, "");
  if (!digits.startsWith("0")) return "";
  if (digits.startsWith("02")) {
    if (digits.length === 9)
      return `02-${digits.slice(2, 5)}-${digits.slice(5)}`;
    if (digits.length === 10)
      return `02-${digits.slice(2, 6)}-${digits.slice(6)}`;
    return "";
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  return "";
};

export const isValidEmail = (input: string): boolean => {
  const v = String(input || "").trim();
  if (!v) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
};

export const isValidAddress = (input: string): boolean => {
  const v = String(input || "").trim();
  return v.length >= 5;
};

const joinWithDash = (...parts: string[]) =>
  parts.filter((part) => !!part).join("-");

export const formatBusinessNumberInput = (input: string): string => {
  const digits = String(input || "")
    .replace(/\D/g, "")
    .slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) {
    return joinWithDash(digits.slice(0, 3), digits.slice(3));
  }
  return joinWithDash(digits.slice(0, 3), digits.slice(3, 5), digits.slice(5));
};

export const formatPhoneNumberInput = (input: string): string => {
  const digits = String(input || "")
    .replace(/\D/g, "")
    .slice(0, 11);
  if (!digits) return "";
  if (digits.startsWith("02")) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) {
      return joinWithDash("02", digits.slice(2));
    }
    if (digits.length <= 9) {
      return joinWithDash("02", digits.slice(2, 5), digits.slice(5));
    }
    return joinWithDash("02", digits.slice(2, 6), digits.slice(6));
  }

  if (digits.length <= 3) return digits;
  if (digits.length <= 6) {
    return joinWithDash(digits.slice(0, 3), digits.slice(3));
  }
  if (digits.length <= 10) {
    return joinWithDash(
      digits.slice(0, 3),
      digits.slice(3, 6),
      digits.slice(6)
    );
  }
  return joinWithDash(digits.slice(0, 3), digits.slice(3, 7), digits.slice(7));
};

export const isValidBusinessNumber = (input: string): boolean =>
  !!normalizeBusinessNumber(input);

export const isValidPhoneNumber = (input: string): boolean =>
  !!normalizePhoneNumber(input);

export const normalizeStartDate = (input: string): string => {
  // 부분 입력도 유지하면서 숫자만 최대 8자리까지 허용
  return String(input || "")
    .replace(/\D/g, "")
    .slice(0, 8);
};

export const isValidStartDate = (input: string): boolean =>
  !!normalizeStartDate(input);

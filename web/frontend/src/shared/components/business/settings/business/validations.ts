// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
export const normalizeBusinessNumber = (input: string): string => {
  const digits = String(input || "").replace(/\D/g, "");
  if (digits.length !== 10) return "";
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
};

export const normalizePhoneNumber = (input: string): string => {
  const digits = String(input || "").replace(/\D/g, "");
  if (digits.length === 8 && !digits.startsWith("0")) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }
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
  const raw = String(input || "").replace(/\D/g, "");
  if (!raw) return "";

  if (!raw.startsWith("0")) {
    const digits = raw.slice(0, 8);
    if (digits.length <= 4) return digits;
    return joinWithDash(digits.slice(0, 4), digits.slice(4));
  }

  const digits = raw.slice(0, 11);
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
      digits.slice(6),
    );
  }
  return joinWithDash(digits.slice(0, 3), digits.slice(3, 7), digits.slice(7));
};

export const isValidBusinessNumber = (input: string): boolean =>
  !!normalizeBusinessNumber(input);

export const isValidPhoneNumber = (input: string): boolean =>
  !!normalizePhoneNumber(input);

/** 휴대폰(010/011/016/017/018/019) 번호 검증 */
export const isValidMobilePhone = (input: string): boolean => {
  const digits = String(input || "").replace(/\D/g, "");
  return /^01[016789]\d{7,8}$/.test(digits);
};

export const normalizeStartDate = (input: string): string => {
  // 부분 입력도 유지하면서 숫자만 최대 8자리까지 허용
  return String(input || "")
    .replace(/\D/g, "")
    .slice(0, 8);
};

export const isValidStartDate = (input: string): boolean =>
  !!normalizeStartDate(input);

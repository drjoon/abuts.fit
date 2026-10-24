// $ 는 .env 파일의 변수 확장 문자이므로 비밀번호에 사용하지 않는다.
// 회원가입, 비밀번호 변경, 대표의 직원 등록이 같은 규칙을 쓴다.

export const PASSWORD_POLICY_MESSAGE =
  "비밀번호는 10자 이상이며 특수문자(!@#%^&* 등)를 포함해야 합니다. $는 사용할 수 없습니다.";

export const STAFF_INITIAL_PASSWORD_MESSAGE =
  "처음 비밀번호는 영문 소문자 6자리로 적어 주세요. 예: abcdef";

/** 대표가 정하는 임직원 처음 비밀번호. */
export function isStaffInitialPassword(password) {
  return /^[a-z]{6}$/.test(String(password || ""));
}

export function isStrongPassword(password) {
  const p = String(password || "");
  if (p.length < 10) return false;
  if (p.includes("$")) return false;
  if (!/[!@#%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p)) return false;
  return true;
}

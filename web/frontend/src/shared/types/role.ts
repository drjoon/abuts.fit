// related files:
// - web/frontend/rules.md
// - web/frontend/src/store/useAuthStore.ts
// - web/frontend/src/App.tsx
// - web/frontend/src/features/auth/SignupPage.tsx
// - web/frontend/src/shared/components/RoleSelect.tsx
// - web/frontend/src/pages/admin/partners/partnerShare.ts
// - 2026-08-17: staff 가입에 labTeam(기공팀)·salesTeam(영업팀) 추가.

export const APP_USER_ROLES = [
  "requestor",
  "practice",
  "salesman",
  "manufacturer",
  "internalLab",
  "admin",
  "devops",
  "labTeam",
  "salesTeam",
] as const;

export type AppUserRole = (typeof APP_USER_ROLES)[number];

export const APP_USER_ROLE_SET = new Set<string>(APP_USER_ROLES);

export const isAppUserRole = (value: unknown): value is AppUserRole =>
  APP_USER_ROLE_SET.has(String(value || "").trim());

export const STAFF_SIGNUP_ROLES = [
  "manufacturer",
  "devops",
  "admin",
  "labTeam",
  "salesTeam",
] as const;

export type StaffSignupRole = (typeof STAFF_SIGNUP_ROLES)[number];

export const STAFF_SIGNUP_ROLE_SET = new Set<string>(STAFF_SIGNUP_ROLES);

export const isStaffSignupRole = (value: unknown): value is StaffSignupRole =>
  STAFF_SIGNUP_ROLE_SET.has(String(value || "").trim());

/** 가입 화면에서 고를 수 있는 역할. internalLab은 관리자 생성만. */
export const SELECTABLE_SIGNUP_ROLES = [
  "requestor",
  "practice",
  "salesman",
  "manufacturer",
  "admin",
  "devops",
  "labTeam",
  "salesTeam",
] as const;

export type SelectableSignupRole = (typeof SELECTABLE_SIGNUP_ROLES)[number];

export const SELECTABLE_SIGNUP_ROLE_SET = new Set<string>(
  SELECTABLE_SIGNUP_ROLES,
);

export const isSelectableSignupRole = (
  value: unknown,
): value is SelectableSignupRole =>
  SELECTABLE_SIGNUP_ROLE_SET.has(String(value || "").trim());

export const APP_USER_ROLE_LABEL: Record<AppUserRole, string> = {
  requestor: "의뢰자",
  practice: "의뢰 발신자 (치과)",
  salesman: "영업자",
  manufacturer: "제조사",
  internalLab: "어벗츠기공소",
  admin: "어벗츠.핏",
  devops: "개발운영사",
  labTeam: "기공팀",
  salesTeam: "영업팀",
};

export function getAppUserRoleLabel(role: string): string {
  const key = String(role || "").trim();
  if (isAppUserRole(key)) return APP_USER_ROLE_LABEL[key];
  return "사용자";
}

/** 사업영역 수익 분배 주체 표시명. admin은 어벗츠. */
export function sharePartyLabel(role: string): string {
  if (String(role || "").trim() === "admin") return "어벗츠";
  return getAppUserRoleLabel(role);
}

export const AREA_SHARE_ROLES = {
  lab: ["labTeam", "salesTeam", "devops"],
  abutment: ["manufacturer", "devops", "salesman", "admin"],
  platform: ["admin", "devops"],
} as const;

export type AreaShareKey = keyof typeof AREA_SHARE_ROLES;

export function isExternalShareRole(role: string): boolean {
  const key = String(role || "").trim();
  return key === "devops" || key === "manufacturer" || key === "salesman";
}

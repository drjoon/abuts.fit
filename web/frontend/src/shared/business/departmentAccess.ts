// related files:
// - web/backend/utils/internalDepartments.util.js
// - web/frontend/src/features/settings/tabs/StaffTab.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/store/useAuthStore.ts

export const DEPARTMENT_KEY_MANAGEMENT = "management";
export const DEPARTMENT_KEY_CLINICAL = "clinical";
export const DEPARTMENT_KEY_LAB = "lab";
export const DEPARTMENT_KEY_PRODUCTION = "production";
export const DEPARTMENT_KEY_SALES = "sales";
export const DEPARTMENT_KEY_DEVELOPMENT = "development";

export const OPERATIONS_DEPARTMENT_KEYS = new Set([
  DEPARTMENT_KEY_CLINICAL,
  DEPARTMENT_KEY_LAB,
  DEPARTMENT_KEY_PRODUCTION,
  DEPARTMENT_KEY_SALES,
  DEPARTMENT_KEY_DEVELOPMENT,
]);

export const SETTLEMENT_SIDEBAR_PATHS = new Set([
  "/dashboard/credits",
  "/dashboard/payments",
]);

export type DepartmentAccessKey =
  | typeof DEPARTMENT_KEY_MANAGEMENT
  | typeof DEPARTMENT_KEY_CLINICAL
  | typeof DEPARTMENT_KEY_LAB
  | typeof DEPARTMENT_KEY_PRODUCTION
  | typeof DEPARTMENT_KEY_SALES
  | typeof DEPARTMENT_KEY_DEVELOPMENT
  | string;

export function collectDepartmentIds(member: {
  internalDepartmentId?: string | null;
  internalDepartmentIds?: string[] | null;
}): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const push = (raw: unknown) => {
    const id = String(raw || "").trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };
  if (Array.isArray(member.internalDepartmentIds)) {
    member.internalDepartmentIds.forEach(push);
  }
  push(member.internalDepartmentId);
  return ids;
}

export function departmentKey(dept: { key?: string | null; name?: string }): string {
  const key = String(dept.key || "").trim();
  if (key) return key;
  const name = String(dept.name || "").trim();
  if (name === "경영팀") return DEPARTMENT_KEY_MANAGEMENT;
  if (name === "진료팀") return DEPARTMENT_KEY_CLINICAL;
  if (name === "기공팀") return DEPARTMENT_KEY_LAB;
  if (name === "생산팀") return DEPARTMENT_KEY_PRODUCTION;
  if (name === "영업팀") return DEPARTMENT_KEY_SALES;
  if (name === "개발팀") return DEPARTMENT_KEY_DEVELOPMENT;
  return "";
}

export function isOperationsDepartmentKey(key: string): boolean {
  return OPERATIONS_DEPARTMENT_KEYS.has(key);
}

export function departmentGrantsSettlement(dept: {
  key?: string | null;
  name?: string;
  grantsSettlement?: boolean;
}): boolean {
  if (dept.grantsSettlement === true) return true;
  return departmentKey(dept) === DEPARTMENT_KEY_MANAGEMENT;
}

export function departmentSettlementHint(dept: {
  key?: string | null;
  name?: string;
  grantsSettlement?: boolean;
}): string {
  const key = departmentKey(dept);
  if (key === DEPARTMENT_KEY_MANAGEMENT || departmentGrantsSettlement(dept)) {
    return "정산을 볼 수 있습니다";
  }
  if (isOperationsDepartmentKey(key)) {
    return "정산을 볼 수 없습니다";
  }
  return "";
}

export function canAccessSettlement(user: {
  role?: string | null;
  accountRole?: string | null;
  canAccessSettlement?: boolean;
} | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "admin" || user.accountRole === "admin") return true;
  return user.canAccessSettlement !== false;
}

/** @deprecated use canAccessSettlement */
export function canAccessRequestorSettlement(user: {
  role?: string | null;
  accountRole?: string | null;
  canAccessSettlement?: boolean;
} | null | undefined): boolean {
  return canAccessSettlement(user);
}

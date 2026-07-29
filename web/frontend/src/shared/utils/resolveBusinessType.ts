// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
export const BUSINESS_ALLOWED_ROLES = [
  "requestor",
  "salesman",
  "manufacturer",
  "admin",
  "devops",
  "practice",
] as const;

export type BusinessRole = (typeof BUSINESS_ALLOWED_ROLES)[number];

const BUSINESS_ALLOWED_ROLE_SET = new Set<string>(BUSINESS_ALLOWED_ROLES);

export const resolveBusinessType = (
  role?: string | null,
  fallback: BusinessRole = "requestor",
): BusinessRole => {
  const normalized = String(role || "").trim();
  if (BUSINESS_ALLOWED_ROLE_SET.has(normalized)) {
    return normalized as BusinessRole;
  }
  return fallback;
};

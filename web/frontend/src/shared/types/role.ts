// related files:
// - web/frontend/rules.md
// - web/frontend/src/store/useAuthStore.ts
// - web/frontend/src/App.tsx
// - web/frontend/src/features/auth/SignupPage.tsx

export const APP_USER_ROLES = [
  "requestor",
  "practice",
  "salesman",
  "manufacturer",
  "admin",
  "devops",
] as const;

export type AppUserRole = (typeof APP_USER_ROLES)[number];

export const APP_USER_ROLE_SET = new Set<string>(APP_USER_ROLES);

export const isAppUserRole = (value: unknown): value is AppUserRole =>
  APP_USER_ROLE_SET.has(String(value || "").trim());

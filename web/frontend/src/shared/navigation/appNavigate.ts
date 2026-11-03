// related files:
// - web/frontend/src/App.tsx
// - web/frontend/src/shared/practice/openPracticeTransferChat.ts
// change-log:
// - 2026-11-03: 알림 보기 — Router 밖에서도 navigate로 SPA 이동(pushState 우회).

export type AppNavigateOptions = {
  replace?: boolean;
};

type AppNavigateFn = (to: string, options?: AppNavigateOptions) => void;

let navigateFn: AppNavigateFn | null = null;

/** BrowserRouter 안에서 한 번 등록. 알림 보기 등이 Router hook 없이 이동한다. */
export const registerAppNavigate = (fn: AppNavigateFn): (() => void) => {
  navigateFn = fn;
  return () => {
    if (navigateFn === fn) navigateFn = null;
  };
};

/**
 * React Router navigate. 미등록이면 location.assign/replace.
 * @returns Router로 이동했으면 true
 */
export const appNavigate = (
  to: string,
  options?: AppNavigateOptions,
): boolean => {
  const path = String(to || "").trim();
  if (!path) return false;
  if (navigateFn) {
    navigateFn(path, options);
    return true;
  }
  if (typeof window === "undefined") return false;
  if (options?.replace) {
    window.location.replace(path);
  } else {
    window.location.assign(path);
  }
  return false;
};

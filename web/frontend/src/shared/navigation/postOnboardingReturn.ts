// related files:
// - web/frontend/src/pages/public/EventApplyPage.tsx
// - web/frontend/src/features/auth/SignupPage.tsx
// - web/frontend/src/shared/onboarding/SharedOnboardingWizardPage.tsx
// - web/frontend/rules.md
// 이벤트 「회원가입 후 신청」은 가입·온보딩 뒤 신청 폼으로 돌아온다.

const STORAGE_KEY = "postOnboardingReturnTo";

/** 행사 신청 폼만 허용. 오픈 리다이렉트 방지. */
export function sanitizeEventReturnPath(raw: unknown): string | null {
  const s = String(raw || "").trim();
  if (!s || s.length > 300) return null;
  if (s.includes("://") || s.includes("\\") || s.includes("..")) return null;
  if (!s.startsWith("/events/")) return null;

  try {
    const url = new URL(s, "http://local.invalid");
    const pathname = String(url.pathname || "");
    if (!pathname.startsWith("/events/") || pathname.includes("//")) return null;
    if (pathname === "/events/" || pathname === "/events") return null;
    const hash = url.hash === "#event-apply" ? url.hash : "";
    return `${pathname}${hash}`;
  } catch {
    return null;
  }
}

export function rememberPostOnboardingReturn(raw: unknown) {
  const path = sanitizeEventReturnPath(raw);
  if (!path || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, path);
  } catch {
    // ignore
  }
}

export function peekPostOnboardingReturn(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sanitizeEventReturnPath(window.sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function consumePostOnboardingReturn(): string | null {
  const path = peekPostOnboardingReturn();
  if (typeof window === "undefined") return path;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  return path;
}

export function eventApplySignupHref(slug: string): string {
  const safeSlug = String(slug || "").trim();
  const next = `/events/${encodeURIComponent(safeSlug)}#event-apply`;
  return `/signup?next=${encodeURIComponent(next)}`;
}

/** 온보딩이 이미 끝난 로그인만 신청 폼으로. 미완료면 위저드가 끝난 뒤 보낸다. */
export function landingPathIfOnboardingDone(
  user: {
    onboardingWizardCompleted?: boolean;
    businessVerified?: boolean;
  } | null
  | undefined,
  fallback: string,
): string {
  const pending = peekPostOnboardingReturn();
  if (!pending) return fallback;
  const onboarded = Boolean(
    user?.onboardingWizardCompleted || user?.businessVerified,
  );
  return onboarded ? pending : fallback;
}

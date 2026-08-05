// related files:
// - web/frontend/rules.md
// - web/frontend/src/features/auth/SignupPage.tsx
// - web/frontend/src/shared/onboarding/wizard/SettingsWizard.tsx
// - web/frontend/src/shared/onboarding/wizard/steps/ProfileStep.tsx
// - web/frontend/src/shared/onboarding/wizard/steps/PhoneStep.tsx

/**
 * 온보딩 위저드 진행 상태를 localStorage에서 제거합니다.
 * signup으로 다시 들어오면 1/4부터 시작하도록 호출합니다.
 */
export const clearOnboardingLocalStorage = () => {
  if (typeof window === "undefined") return;

  try {
    const keys = Object.keys(window.localStorage);
    for (const key of keys) {
      if (
        key.startsWith("onboarding:") ||
        key.startsWith("wizard.") ||
        key.startsWith("business_tab_setup_mode") ||
        key.startsWith("business_tab_draft_v1") ||
        key.startsWith("avatarCarousel.prefetch")
      ) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // ignore
  }
};

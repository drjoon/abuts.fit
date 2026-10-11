// change-log:
// - 2026-10-11: lg 미만에서는 플랫폼·어벗츠기공소를 `/`에 이어 붙인다.
// related files:
// - web/frontend/src/features/landing/LandingHome.tsx
// - web/frontend/src/features/landing/LandingOfferPage.tsx
// - web/frontend/src/features/layout/Navigation.tsx
// - web/frontend/src/pages/public/OfferPage.tsx
import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react";

/** 공개 네비 햄버거(`lg:hidden`)와 같은 구간. */
export const LANDING_OFFER_INLINE_QUERY = "(max-width: 1023px)";

/** 랜딩에 붙는 서브페이지 앵커. `#offer-platform` */
export function offerSectionId(slug: string) {
  return `offer-${slug}`;
}

export function scrollToLandingSection(id: string) {
  const element = document.getElementById(id);
  if (!element) return false;
  const top = element.getBoundingClientRect().top + window.scrollY - 80;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({
    top: Math.max(0, top),
    behavior: reduce ? "auto" : "smooth",
  });
  return true;
}

export function useLandingOfferInline() {
  const [inline, setInline] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia(LANDING_OFFER_INLINE_QUERY).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(LANDING_OFFER_INLINE_QUERY);
    const apply = () => setInline(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return inline;
}

const EmbedScopeContext = createContext<string | null>(null);

/** `scope`가 있으면 랜딩에 붙은 오퍼. 겹치는 섹션 id에 접두사를 붙인다. */
export function LandingOfferEmbedProvider({
  scope,
  children,
}: {
  scope: string | null;
  children: ReactNode;
}) {
  return createElement(EmbedScopeContext.Provider, { value: scope }, children);
}

export function useLandingOfferEmbedded() {
  return useContext(EmbedScopeContext) != null;
}

export function useScopedSectionId(id: string) {
  const scope = useContext(EmbedScopeContext);
  return scope ? `${scope}-${id}` : id;
}

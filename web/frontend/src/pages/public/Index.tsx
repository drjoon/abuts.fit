// related files:
// - web/frontend/src/App.tsx
// - web/frontend/src/features/landing/LandingHome.tsx
// - web/frontend/src/features/landing/landingTheme.ts
// - web/frontend/src/pages/public/components/PublicPageLayout.tsx
import { PublicPageLayout } from "./components/PublicPageLayout";
import { LandingHome } from "@/features/landing/LandingHome";
import { useLandingOfferInline } from "@/features/landing/landingOfferInline";

/** `/` — Waveon 구조 랜딩. lg 미만은 플랫폼·어벗츠기공소를 이 페이지에 붙인다. */
const Index = () => {
  const offerInline = useLandingOfferInline();
  return (
    <PublicPageLayout
      tone="light"
      plain
      footerSurface={offerInline ? "sky" : "white"}
      contentClassName="relative z-10 w-full max-w-none px-0 pb-0 pt-14 sm:pt-16"
    >
      <LandingHome />
    </PublicPageLayout>
  );
};

export default Index;

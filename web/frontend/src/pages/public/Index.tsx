// related files:
// - web/frontend/src/App.tsx
// - web/frontend/src/features/landing/LandingHome.tsx
// - web/frontend/src/features/landing/landingTheme.ts
// - web/frontend/src/pages/public/components/PublicPageLayout.tsx
import { PublicPageLayout } from "./components/PublicPageLayout";
import { LandingHome } from "@/features/landing/LandingHome";

/** `/` — 플랫폼·어벗츠기공소 설명을 포함한 랜딩. 마감 밴드는 하늘색이라 푸터는 흰색. */
const Index = () => {
  return (
    <PublicPageLayout
      tone="light"
      plain
      footerSurface="white"
      contentClassName="relative z-10 w-full max-w-none px-0 pb-0 pt-14 sm:pt-16"
    >
      <LandingHome />
    </PublicPageLayout>
  );
};

export default Index;

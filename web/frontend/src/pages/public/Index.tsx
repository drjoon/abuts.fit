// related files:
// - web/frontend/src/App.tsx
// - web/frontend/src/features/landing/LandingHome.tsx
// - web/frontend/src/features/landing/landingTheme.ts
// - web/frontend/src/pages/public/components/PublicPageLayout.tsx
import { PublicPageLayout } from "./components/PublicPageLayout";
import { LandingHome } from "@/features/landing/LandingHome";

/** `/` — Waveon 구조 랜딩. 상세는 `/offer/:slug` */
const Index = () => {
  return (
    <PublicPageLayout
      tone="light"
      plain
      contentClassName="relative z-10 w-full max-w-none px-0 pb-0 pt-14 sm:pt-16"
    >
      <LandingHome />
    </PublicPageLayout>
  );
};

export default Index;

// related files:
// - web/frontend/src/App.tsx
// - web/frontend/src/features/landing/LandingHome.tsx
// - web/frontend/src/features/landing/landingTheme.ts
// - web/frontend/src/pages/public/components/PublicPageLayout.tsx
import { PublicPageLayout } from "./components/PublicPageLayout";
import { LandingHome } from "@/features/landing/LandingHome";

/** `/` — 큰 이미지 4장. 상세는 `/offer/:slug` */
const Index = () => {
  return (
    <PublicPageLayout
      tone="light"
      plain
      navOverlay
      contentClassName="relative z-10 w-full max-w-none px-0 py-0"
    >
      <LandingHome />
    </PublicPageLayout>
  );
};

export default Index;

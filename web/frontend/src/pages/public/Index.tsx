// related files:
// - web/frontend/src/App.tsx
// - web/frontend/src/features/landing/LandingBrandStory.tsx
// - web/frontend/src/features/landing/landingTheme.ts
import { PublicPageLayout } from "./components/PublicPageLayout";
import { LandingBrandStory } from "@/features/landing/LandingBrandStory";

/** `/` — 브랜드/스토리 감성 랜딩 (첨1) */
const Index = () => {
  return (
    <PublicPageLayout
      tone="light"
      contentClassName="relative z-10 w-full max-w-none px-0 py-0"
    >
      <LandingBrandStory />
    </PublicPageLayout>
  );
};

export default Index;

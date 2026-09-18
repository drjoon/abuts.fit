// related files:
// - web/frontend/src/pages/public/PlatformPage.tsx
// - web/frontend/src/pages/public/Index.tsx
// - web/frontend/src/features/landing/landingTheme.ts
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { landingAbout, landingTheme } from "./landingTheme";

/** 서비스 홈(`/platform`) 하단 — 브랜드 랜딩(`/`)으로 이어지는 짧은 스트립 */
export const LandingAboutSection = () => {
  const navigate = useNavigate();

  return (
    <section
      id="about"
      className={`relative scroll-mt-20 border-t border-slate-200/80 sm:scroll-mt-24 ${landingTheme.sectionAlt}`}
    >
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-5 px-4 py-10 sm:flex-row sm:items-center sm:px-6 sm:py-12">
        <div className="max-w-xl">
          <p className={landingTheme.eyebrow}>{landingAbout.eyebrow}</p>
          <h2
            className={`mt-3 text-xl font-semibold tracking-tight sm:text-2xl ${landingTheme.headline}`}
          >
            시술의 불편은 제품으로.
            <br />
            업무의 번거로움은 플랫폼으로.
          </h2>
          <p className={`mt-2 text-sm leading-relaxed ${landingTheme.body}`}>
            치과의사가 현장에서 직접 만든 솔루션의 이야기를 확인하세요.
          </p>
        </div>
        <Button
          className={`h-11 shrink-0 px-5 font-semibold ${landingTheme.ctaPrimary}`}
          onClick={() => navigate("/")}
        >
          어벗츠 소개
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </section>
  );
};

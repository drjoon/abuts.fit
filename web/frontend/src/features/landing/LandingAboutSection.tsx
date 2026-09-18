// related files:
// - web/frontend/src/pages/public/Index.tsx
// - web/frontend/src/features/landing/landingTheme.ts
// - web/frontend/src/features/landing/LandingPracticeWorkspacePreview.tsx
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/useAuthStore";
import { resolveEntryDashboardPath } from "@/shared/navigation/lastDashboardPath";
import { LandingPracticeWorkspacePreview } from "./LandingPracticeWorkspacePreview";
import { landingAbout, landingTheme } from "./landingTheme";

/** 짧은 About — 철학 한 줄 + 캘린더/채팅 프리뷰 */
export const LandingAboutSection = () => {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const entryPath = resolveEntryDashboardPath(user);

  return (
    <section
      id="about"
      className={`relative scroll-mt-20 border-t border-slate-200/80 sm:scroll-mt-24 ${landingTheme.sectionAlt}`}
    >
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:px-6 sm:py-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-10 lg:py-14">
        <div>
          <p className={landingTheme.eyebrow}>{landingAbout.eyebrow}</p>
          <h2
            className={`mt-4 text-2xl font-semibold tracking-tight sm:text-3xl ${landingTheme.headline}`}
          >
            시술의 불편은{" "}
            <span className={landingTheme.accentText}>제품으로</span>.
            <br />
            업무의 번거로움은{" "}
            <span className={landingTheme.accentText}>플랫폼으로</span>.
          </h2>
          <p className={`mt-3 text-sm leading-relaxed sm:text-base ${landingTheme.body}`}>
            치과는 의뢰 캘린더와 기공소 채팅을 한 화면에서 이어 봅니다.
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <Button
              className={`h-10 px-5 font-semibold ${landingTheme.ctaPrimary}`}
              onClick={() => navigate(isAuthenticated ? entryPath : "/signup")}
            >
              시작하기
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className={`h-10 px-5 ${landingTheme.ctaGhost}`}
              onClick={() => navigate("/help")}
            >
              이용 안내
            </Button>
          </div>
        </div>

        <div className={`${landingTheme.imageFrame}`}>
          <div className={`${landingTheme.imageInner} overflow-hidden`}>
            <LandingPracticeWorkspacePreview className="min-h-[220px] sm:min-h-[260px]" />
          </div>
        </div>
      </div>
    </section>
  );
};

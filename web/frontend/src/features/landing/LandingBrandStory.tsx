// related files:
// - web/frontend/src/pages/public/Index.tsx
// - web/frontend/src/features/landing/landingTheme.ts
import { ArrowRight, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/useAuthStore";
import { resolveEntryDashboardPath } from "@/shared/navigation/lastDashboardPath";
import { LandingPracticeWorkspacePreview } from "./LandingPracticeWorkspacePreview";
import { landingAbout, landingTheme } from "./landingTheme";

function scrollToProblems() {
  const el = document.getElementById("about-problems");
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - 64;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

/** 첨1 — 브랜드/스토리 풀 페이지 (`/`) */
export const LandingBrandStory = () => {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const entryPath = resolveEntryDashboardPath(user);
  const startPath = isAuthenticated ? entryPath : "/signup";

  return (
    <div className="relative">
      {/* Hero — 첫 뷰포트에 여유 있게 */}
      <section className="relative flex min-h-[min(100svh,52rem)] flex-col justify-center px-4 pb-24 pt-24 text-center sm:px-6 sm:pb-28 sm:pt-28">
        <div className="mx-auto max-w-3xl">
          <p className={landingTheme.eyebrow}>{landingAbout.eyebrow}</p>
          <h1
            className={`mt-6 whitespace-pre-line text-3xl font-semibold leading-tight tracking-tight sm:mt-8 sm:text-4xl md:text-[2.75rem] ${landingTheme.headline}`}
          >
            {landingAbout.headline}
          </h1>
          <p
            className={`mx-auto mt-6 max-w-xl whitespace-pre-line text-base leading-relaxed sm:text-lg ${landingTheme.body}`}
          >
            {landingAbout.body}
          </p>
          <p className={`mt-5 text-sm ${landingTheme.muted}`}>
            {landingAbout.origin}
          </p>
        </div>
        <button
          type="button"
          onClick={scrollToProblems}
          className={`absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 transition hover:opacity-80 sm:bottom-8 ${landingTheme.muted}`}
          aria-label="아래로 스크롤"
        >
          <ChevronDown className="h-6 w-6 animate-bounce" strokeWidth={1.75} />
        </button>
      </section>

      {/* Problems */}
      <section
        id="about-problems"
        className={`${landingTheme.sectionAlt} scroll-mt-20 border-y border-slate-200/80 sm:scroll-mt-24`}
      >
        <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-16">
          <h2
            className={`mx-auto max-w-2xl whitespace-pre-line text-center text-2xl font-semibold tracking-tight sm:text-3xl ${landingTheme.headline}`}
          >
            {landingAbout.problemHeadline}
          </h2>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {landingAbout.problems.map((item) => (
              <div key={item.step} className={`${landingTheme.panelSoft} p-6 sm:p-7`}>
                <p className={`text-[11px] font-medium tracking-[0.18em] ${landingTheme.accentText}`}>
                  {item.step} · {item.label}
                </p>
                <h3 className={`mt-3 text-lg font-semibold ${landingTheme.headline}`}>
                  {item.title}
                </h3>
                <p className={`mt-2 text-sm leading-relaxed ${landingTheme.body}`}>
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Philosophy */}
      <section className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6 sm:py-16">
        <h2
          className={`whitespace-pre-line text-2xl font-semibold tracking-tight sm:text-3xl ${landingTheme.headline}`}
        >
          {landingAbout.philosophyHeadline}
        </h2>
        <p className={`mt-4 text-base leading-relaxed ${landingTheme.body}`}>
          {landingAbout.philosophyBody}
        </p>
      </section>

      {/* Cases */}
      <section className="border-t border-slate-200/80 bg-white/60">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-16">
          <h2
            className={`text-center text-2xl font-semibold tracking-tight sm:text-3xl ${landingTheme.headline}`}
          >
            {landingAbout.casesHeadline}
          </h2>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {landingAbout.cases.map((item) => (
              <article key={item.id} className={`${landingTheme.panel} overflow-hidden`}>
                {item.id === "platform" ? (
                  <div className="border-b border-slate-100 bg-[#f4f7fb]">
                    <LandingPracticeWorkspacePreview className="min-h-[200px] sm:min-h-[220px]" />
                  </div>
                ) : (
                  <div className="flex min-h-[200px] items-center justify-center border-b border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-white sm:min-h-[220px]">
                    <p className={`text-sm ${landingTheme.faint}`}>
                      제품 개발 사례 이미지 영역
                    </p>
                  </div>
                )}
                <div className="p-5 sm:p-6">
                  <p className={`text-[11px] font-medium tracking-[0.16em] ${landingTheme.accentText}`}>
                    {item.label}
                  </p>
                  <h3 className={`mt-2 text-lg font-semibold ${landingTheme.headline}`}>
                    {item.title}
                  </h3>
                  <p className={`mt-2 text-sm leading-relaxed ${landingTheme.body}`}>
                    {item.body}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Identity */}
      <section className={`${landingTheme.sectionAlt} border-y border-slate-200/80`}>
        <div className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6 sm:py-16">
          <p className={landingTheme.eyebrow}>{landingAbout.identityEyebrow}</p>
          <h2
            className={`mt-4 whitespace-pre-line text-2xl font-semibold tracking-tight sm:text-3xl ${landingTheme.headline}`}
          >
            {landingAbout.identityHeadline}
          </h2>
          <p
            className={`mt-4 whitespace-pre-line text-base leading-relaxed ${landingTheme.body}`}
          >
            {landingAbout.identityBody}
          </p>
        </div>
      </section>

      {/* Growth */}
      <section className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6 sm:py-16">
        <p className={landingTheme.eyebrow}>{landingAbout.growthEyebrow}</p>
        <h2
          className={`mt-4 whitespace-pre-line text-2xl font-semibold tracking-tight sm:text-3xl ${landingTheme.headline}`}
        >
          {landingAbout.growthHeadline}
        </h2>
        <p
          className={`mt-4 whitespace-pre-line text-base leading-relaxed ${landingTheme.body}`}
        >
          {landingAbout.growthBody}
        </p>
      </section>

      {/* CTA band */}
      <section className="px-4 pb-16 sm:px-6 sm:pb-20">
        <div
          className={`${landingTheme.bandDark} mx-auto max-w-4xl px-6 py-10 text-center sm:px-10 sm:py-12`}
        >
          <h2 className="whitespace-pre-line text-2xl font-semibold leading-snug sm:text-3xl">
            {landingAbout.ctaHeadline}
          </h2>
          <p className="mt-3 text-sm text-white/75 sm:text-base">
            {landingAbout.ctaBody}
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button
              className={`h-11 px-6 font-semibold ${landingTheme.ctaOnDark}`}
              onClick={() => navigate({ pathname: "/platform", hash: "#platform" })}
            >
              {landingAbout.ctaPlatform}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className={`h-11 px-6 font-semibold ${landingTheme.ctaGhostOnDark}`}
              onClick={() => navigate({ pathname: "/platform", hash: "#store" })}
            >
              {landingAbout.ctaProduct}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
          <div className="mt-4">
            <Button
              variant="ghost"
              className="h-10 text-white/80 hover:bg-white/10 hover:text-white"
              onClick={() => navigate(startPath)}
            >
              {isAuthenticated ? "대시보드로 이동" : "시작하기"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
};

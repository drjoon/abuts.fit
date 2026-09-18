// related files:
// - web/frontend/src/pages/public/Index.tsx
// - web/frontend/src/features/landing/landingTheme.ts
// - web/frontend/src/features/landing/landingAssets.ts
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { useInView } from "react-intersection-observer";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/ui/cn";
import { useAuthStore } from "@/store/useAuthStore";
import { resolveEntryDashboardPath } from "@/shared/navigation/lastDashboardPath";
import { LANDING_CAD_PREVIEW, LANDING_PRODUCT_IMAGE } from "./landingAssets";
import { landingAbout, landingTheme } from "./landingTheme";

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const navOffset = 80;
  const top = el.getBoundingClientRect().top + window.scrollY - navOffset;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

function Reveal({
  children,
  className,
  delayMs = 0,
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const { ref, inView } = useInView({ threshold: 0.12, triggerOnce: true });
  return (
    <div
      ref={ref}
      className={cn(
        "transition-all duration-700",
        inView ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
        className,
      )}
      style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  );
}

export const LandingAboutSection = () => {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const entryPath = resolveEntryDashboardPath(user);

  return (
    <>
      {/* Hero */}
      <section
        id="about"
        className="relative isolate scroll-mt-20 overflow-hidden bg-white sm:scroll-mt-24"
      >
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 left-1/2 h-[28rem] w-[36rem] -translate-x-1/2 rounded-full bg-sky-200/40 blur-[100px]" />
          <div className="absolute top-24 right-[-8%] h-[22rem] w-[22rem] rounded-full bg-blue-100/50 blur-[110px]" />
        </div>

        <div className="relative z-10 mx-auto flex min-h-[min(88svh,820px)] max-w-3xl flex-col items-center justify-center px-4 pb-16 pt-28 text-center sm:px-6 sm:pb-20 sm:pt-32">
          <p className={landingTheme.eyebrow}>{landingAbout.eyebrow}</p>
          <h1
            className={`mt-6 whitespace-pre-line text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl md:leading-[1.15] ${landingTheme.headline}`}
          >
            {landingAbout.headline}
          </h1>
          <p
            className={`mt-5 max-w-xl whitespace-pre-line text-sm leading-relaxed sm:text-base ${landingTheme.body}`}
          >
            {landingAbout.body}
          </p>
          <p className={`mt-4 text-xs sm:text-sm ${landingTheme.faint}`}>
            {landingAbout.origin}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button
              size="lg"
              className={`h-11 px-7 font-semibold ${landingTheme.ctaPrimary}`}
              onClick={() => navigate(isAuthenticated ? entryPath : "/signup")}
            >
              시작하기
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className={`h-11 px-7 ${landingTheme.ctaGhost}`}
              onClick={() => scrollToId("platform")}
            >
              플랫폼 알아보기
            </Button>
          </div>
        </div>
      </section>

      {/* Problems */}
      <section className={`relative border-t border-slate-200/80 ${landingTheme.sectionAlt}`}>
        <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-16 lg:py-20">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2
              className={`whitespace-pre-line text-2xl font-semibold tracking-tight sm:text-3xl ${landingTheme.headline}`}
            >
              {landingAbout.problemHeadline}
            </h2>
          </Reveal>

          <div className="mt-10 grid gap-4 md:grid-cols-2 md:gap-0">
            {landingAbout.problems.map((item, index) => (
              <Reveal
                key={item.step}
                delayMs={80 + index * 60}
                className={cn(
                  "px-5 py-6 sm:px-8 sm:py-8",
                  index === 0 ? "md:border-r md:border-slate-200" : "",
                )}
              >
                <p className={`text-[11px] font-medium tracking-[0.18em] ${landingTheme.accentText}`}>
                  {item.step} · {item.label}
                </p>
                <h3
                  className={`mt-3 text-lg font-semibold sm:text-xl ${landingTheme.headline}`}
                >
                  {item.title}
                </h3>
                <p className={`mt-2 text-sm leading-relaxed ${landingTheme.body}`}>
                  {item.body}
                </p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Philosophy */}
      <section className="relative border-t border-slate-200/80 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6 sm:py-16 lg:py-20">
          <Reveal>
            <h2
              className={`text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl md:leading-snug ${landingTheme.headline}`}
            >
              시술의 불편은{" "}
              <span className={landingTheme.accentText}>제품으로</span>.
              <br />
              업무의 번거로움은{" "}
              <span className={landingTheme.accentText}>플랫폼으로</span>.
            </h2>
            <p
              className={`mt-5 text-sm leading-relaxed sm:text-base ${landingTheme.body}`}
            >
              {landingAbout.philosophyBody}
            </p>
          </Reveal>
        </div>
      </section>

      {/* Cases */}
      <section className={`relative border-t border-slate-200/80 ${landingTheme.sectionAlt}`}>
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16 lg:py-20">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2
              className={`text-2xl font-semibold tracking-tight sm:text-3xl ${landingTheme.headline}`}
            >
              {landingAbout.casesHeadline}
            </h2>
          </Reveal>

          <div className="mt-10 grid gap-5 lg:grid-cols-2 lg:gap-6">
            {landingAbout.cases.map((item, index) => {
              const image =
                item.id === "product"
                  ? LANDING_PRODUCT_IMAGE
                  : LANDING_CAD_PREVIEW;
              const alt =
                item.id === "product"
                  ? "제품 개발 사례 — 시술 키트·어벗먼트"
                  : "플랫폼 개발 사례 — CAD·제작 워크스페이스";
              return (
                <Reveal
                  key={item.id}
                  delayMs={80 + index * 70}
                  className={`${landingTheme.panelSoft} overflow-hidden p-5 sm:p-6`}
                >
                  <p
                    className={`text-[11px] font-medium tracking-[0.16em] ${landingTheme.accentText}`}
                  >
                    {item.label}
                  </p>
                  <h3 className={`mt-2 text-lg font-semibold ${landingTheme.headline}`}>
                    {item.title}
                  </h3>
                  <p className={`mt-2 text-sm leading-relaxed ${landingTheme.body}`}>
                    {item.body}
                  </p>
                  <div className={`${landingTheme.imageFrame} mt-5`}>
                    <div
                      className={`${landingTheme.imageInner} flex min-h-[200px] items-center justify-center bg-gradient-to-br from-white via-slate-50 to-sky-50/90 p-4 sm:min-h-[240px]`}
                    >
                      <img
                        src={image}
                        alt={alt}
                        className="max-h-56 w-full object-contain sm:max-h-64"
                      />
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* Identity */}
      <section className="relative border-t border-slate-200/80 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6 sm:py-16 lg:py-20">
          <Reveal>
            <p className={landingTheme.eyebrow}>{landingAbout.identityEyebrow}</p>
            <h2
              className={`mt-5 whitespace-pre-line text-2xl font-semibold tracking-tight sm:text-3xl ${landingTheme.headline}`}
            >
              {landingAbout.identityHeadline}
            </h2>
            <p
              className={`mt-5 whitespace-pre-line text-sm leading-relaxed sm:text-base ${landingTheme.body}`}
            >
              {landingAbout.identityBody}
            </p>
          </Reveal>
        </div>
      </section>

      {/* Growth */}
      <section className={`relative border-t border-slate-200/80 ${landingTheme.sectionAlt}`}>
        <div className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6 sm:py-16 lg:py-20">
          <Reveal>
            <p className={landingTheme.eyebrow}>{landingAbout.growthEyebrow}</p>
            <h2
              className={`mt-5 whitespace-pre-line text-2xl font-semibold tracking-tight sm:text-3xl ${landingTheme.headline}`}
            >
              {landingAbout.growthHeadline}
            </h2>
            <p
              className={`mt-5 whitespace-pre-line text-sm leading-relaxed sm:text-base ${landingTheme.body}`}
            >
              {landingAbout.growthBody}
            </p>
          </Reveal>
        </div>
      </section>

      {/* Story CTA — deep navy band */}
      <section className="relative border-t border-slate-200/80 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-16 lg:py-20">
          <Reveal
            className={`${landingTheme.bandDark} relative overflow-hidden px-6 py-10 text-center sm:px-10 sm:py-12`}
          >
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-400/20 via-transparent to-transparent" />
            <div className="relative z-10 mx-auto max-w-2xl">
              <h2 className="whitespace-pre-line text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                {landingAbout.ctaHeadline}
              </h2>
              <p className="mt-4 text-sm text-sky-100/80 sm:text-base">
                {landingAbout.ctaBody}
              </p>
              <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                <Button
                  size="lg"
                  className={`h-11 px-7 font-semibold ${landingTheme.ctaOnDark}`}
                  onClick={() => scrollToId("platform")}
                >
                  {landingAbout.ctaPlatform}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className={`h-11 px-7 ${landingTheme.ctaGhostOnDark}`}
                  onClick={() => scrollToId("store")}
                >
                  {landingAbout.ctaProduct}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
};

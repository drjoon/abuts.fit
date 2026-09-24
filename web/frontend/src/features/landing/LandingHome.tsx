// related files:
// - web/frontend/src/pages/public/Index.tsx
// - web/frontend/src/features/landing/landingTheme.ts
// - web/frontend/src/features/landing/LandingEventsSection.tsx
// - web/frontend/src/features/layout/Navigation.tsx
// - web/frontend/src/features/landing/landingAssets.ts
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowDown, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useAuthStore } from "@/store/useAuthStore";
import { resolveEntryDashboardPath } from "@/shared/navigation/lastDashboardPath";
import { cn } from "@/shared/ui/cn";
import { LANDING_WAVEON_HERO } from "./landingAssets";
import {
  landingHome,
  landingHomeBusinessTabs,
  landingHomeFaq,
  landingHomeSteps,
  landingContent,
  landingSectionY,
} from "./landingTheme";
import { LandingEventsSection } from "./LandingEventsSection";

type BusinessTab = (typeof landingHomeBusinessTabs)[number];
type BusinessTabId = BusinessTab["id"];

/** Waveon 대비 살짝만 작은 타이포 — 본문 15px대, h2 ~36–40px */
const TYPO = {
  eyebrow: "text-[11px] font-semibold tracking-[0.2em]",
  h1: "text-[1.875rem] font-bold leading-tight tracking-tight sm:text-[2.5rem] lg:text-[3.25rem]",
  h2: "break-keep text-[1.5rem] font-semibold leading-snug tracking-tight sm:text-[2rem] lg:text-[2.25rem]",
  h3: "break-keep text-lg font-semibold tracking-tight sm:text-xl",
  lead: "break-keep text-[14px] leading-6 text-slate-600 sm:text-[15px] sm:leading-6",
  body: "break-keep text-[14px] leading-6 text-slate-600 sm:text-[15px] sm:leading-[1.65]",
  link: "text-[14px] font-semibold sm:text-[15px]",
} as const;

const SKY = {
  ink: "text-[#0b2a5c]",
  accent: "text-sky-600",
  accentStrong: "text-[#2563eb]",
  band: "bg-[#eef6ff]",
  card: "rounded-2xl border border-sky-100/80 bg-white shadow-[0_10px_32px_rgba(37,99,235,0.06)]",
  pill:
    "rounded-full bg-[#2563eb] text-white shadow-[0_8px_22px_rgba(37,99,235,0.25)] hover:bg-[#1d4ed8]",
  pillGhost:
    "rounded-full border border-sky-200 bg-white text-[#0b2a5c] hover:bg-sky-50",
  /** 히어로 오버레이 — Waveon과 동일한 짙은 블루 */
  heroWash:
    "bg-[linear-gradient(rgba(7,25,55,0.62),rgba(7,25,55,0.65))]",
} as const;

function Lines({ lines, className }: { lines: string[]; className?: string }) {
  return (
    <p className={cn("break-keep", className)}>
      {lines.map((line, index) => (
        <span key={line}>
          {index > 0 ? <br /> : null}
          {line}
        </span>
      ))}
    </p>
  );
}

function SectionEyebrow({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <p className={cn(TYPO.eyebrow, SKY.accent, className)}>{children}</p>
  );
}

function BusinessFlowCard({ tab }: { tab: BusinessTab }) {
  return (
    <article
      className={cn(
        "grid h-full items-stretch gap-0 overflow-hidden lg:grid-cols-2",
        SKY.card,
      )}
    >
      <div className="relative min-h-[12.5rem] overflow-hidden bg-[#e8f2ff] sm:min-h-[18rem] lg:min-h-[20rem]">
        <img
          src={tab.image.src}
          alt={tab.image.alt}
          className="h-full w-full object-cover object-center"
          draggable={false}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-sky-500/15 via-transparent to-blue-500/10" />
      </div>
      <div className="flex flex-col justify-center px-5 py-7 sm:px-8 sm:py-9">
        <p className={cn(TYPO.eyebrow, SKY.accent)}>{tab.eyebrow}</p>
        <h3 className={cn(TYPO.h3, "mt-2", SKY.ink)}>{tab.title}</h3>
        <Lines lines={[...tab.body]} className={cn("mt-3", TYPO.body)} />
        <Link
          to={tab.href}
          className={cn(
            "mt-5 inline-flex items-center gap-1 underline-offset-4 hover:underline",
            TYPO.link,
            SKY.accentStrong,
          )}
        >
          {tab.cta}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
}

/** `/` — Waveon 구조 · 포토 히어로 · 작은 타이포 · 하늘색 · 둥근 모서리 */
export function LandingHome() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const [tabId, setTabId] = useState<BusinessTabId>("simple-way");
  const activeTab =
    landingHomeBusinessTabs.find((t) => t.id === tabId) ??
    landingHomeBusinessTabs[0];

  const goStart = () => {
    navigate(isAuthenticated ? resolveEntryDashboardPath(user) : "/signup");
  };

  const scrollToBusiness = () => {
    document.getElementById("business")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <div className="bg-white text-slate-900">
      {/* 풀블리드 포토 히어로 — Waveon 원본 색감 */}
      <section className="relative flex min-h-[78svh] items-center justify-center overflow-hidden bg-[#071937] sm:min-h-[82svh]">
        <img
          src={LANDING_WAVEON_HERO}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className={cn("pointer-events-none absolute inset-0", SKY.heroWash)} />

        <div
          className={cn(
            landingContent,
            "relative z-10 flex w-full flex-col items-center px-5 py-28 text-center sm:py-32",
          )}
        >
          <p className={cn(TYPO.eyebrow, "text-white/85")}>
            {landingHome.heroEyebrow}
          </p>
          <h1 className={cn(TYPO.h1, "mt-3 max-w-2xl text-white")}>
            {landingHome.heroTitle.map((line, index) => (
              <span key={line}>
                {index > 0 ? <br /> : null}
                {line}
              </span>
            ))}
          </h1>
          <Lines
            lines={[landingHome.heroBody, landingHome.heroSupport]}
            className="mt-4 max-w-xl text-[14px] leading-6 text-white/90 sm:mt-5 sm:text-[15px] sm:leading-6"
          />
          <Button
            type="button"
            className="mt-7 h-11 rounded-full bg-white px-6 text-[14px] font-semibold text-[#1e4a8c] hover:bg-white/95 sm:text-[15px]"
            onClick={scrollToBusiness}
          >
            {landingHome.ctaHero}
            <ArrowDown className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="pointer-events-none absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2">
          <span className="text-[10px] font-semibold tracking-[0.28em] text-white/70">
            SCROLL
          </span>
          <span className="h-8 w-px bg-white/50" />
        </div>
      </section>

      {/* THE SIMPLE WAY — 모바일: 가로 파노라마 / sm+: 탭 */}
      <section
        id="business"
        className={cn("scroll-mt-20 bg-white", landingSectionY.bandTight)}
      >
        <div className={landingContent}>
          <div className="mx-auto max-w-2xl text-center">
            <SectionEyebrow>{landingHome.browseEyebrow}</SectionEyebrow>
            <h2 className={cn(TYPO.h2, "mt-2.5", SKY.ink)}>
              {landingHome.browseHeading}
            </h2>
            <p className={cn("mt-2.5", TYPO.lead)}>{landingHome.browseLead}</p>
          </div>

          {/* 모바일: 3장이 옆으로 이어지는 스냅 스크롤 (본문과 같은 좌우 여백) */}
          <div className="mt-8 sm:hidden">
            <div
              className="flex snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              aria-label="서비스 흐름"
            >
              {landingHomeBusinessTabs.map((tab, index) => (
                <div
                  key={tab.id}
                  className="w-[min(100%,20.5rem)] shrink-0 snap-start"
                >
                  <p className={cn("mb-2 text-[12px] font-semibold", SKY.accentStrong)}>
                    {String(index + 1).padStart(2, "0")} · {tab.label}
                  </p>
                  <BusinessFlowCard tab={tab} />
                </div>
              ))}
            </div>
          </div>

          {/* sm+: 탭 + 패널 */}
          <div className="mt-10 hidden sm:block">
            <div
              role="tablist"
              aria-label="서비스 선택"
              className="grid grid-cols-3 gap-3"
            >
              {landingHomeBusinessTabs.map((tab) => {
                const selected = tab.id === tabId;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setTabId(tab.id)}
                    className={cn(
                      "flex h-12 items-center justify-between rounded-xl px-5 text-left text-[15px] font-semibold transition",
                      selected
                        ? "bg-[#2563eb] text-white shadow-[0_10px_24px_rgba(37,99,235,0.25)]"
                        : "border border-sky-200/90 bg-white text-[#0b2a5c] hover:border-sky-300 hover:bg-sky-50/80",
                    )}
                  >
                    <span>{tab.label}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-80" />
                  </button>
                );
              })}
            </div>

            <div className="mt-6">
              <BusinessFlowCard tab={activeTab} />
            </div>
          </div>
        </div>
      </section>

      {/* 연결 가치 + 진행 절차 — Why/Workflow/Pain 중복을 한 섹션으로 */}
      <section
        id="process"
        className={cn("scroll-mt-20", SKY.band, landingSectionY.bandTight)}
      >
        <div className={landingContent}>
          <div className="mx-auto max-w-2xl text-center">
            <SectionEyebrow>{landingHome.stepsEyebrow}</SectionEyebrow>
            <h2 className={cn(TYPO.h2, "mt-2.5", SKY.ink)}>
              {landingHome.whyHeading}
            </h2>
            <p className={cn("mt-2.5", TYPO.lead)}>{landingHome.stepsLead}</p>
          </div>

          <div className="relative mt-8 overflow-hidden rounded-2xl sm:mt-10">
            <img
              src="/landing/waveon/partnership.jpg"
              alt="치과·기공소 디지털 협업"
              className="h-[12rem] w-full object-cover object-center sm:h-[16rem] lg:h-[18rem]"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#071937]/45 via-sky-500/10 to-transparent" />
          </div>

          <ol className="mt-6 grid gap-3 sm:mt-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
            {landingHomeSteps.map((item, index) => (
              <li
                key={item.title}
                className={cn(SKY.card, "px-4 py-5 sm:px-5 sm:py-6")}
              >
                <p className={cn("text-[13px] font-bold", SKY.accentStrong)}>
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h3
                  className={cn(
                    "mt-2 break-keep text-base font-semibold tracking-tight sm:text-lg",
                    SKY.ink,
                  )}
                >
                  {item.title}
                </h3>
                <p className={cn("mt-2", TYPO.body)}>{item.body}</p>
              </li>
            ))}
          </ol>

          <div className="mt-8 flex justify-center">
            <Button
              type="button"
              className={cn("h-10 px-6 text-[14px] font-semibold", SKY.pillGhost)}
              onClick={() => navigate("/contact")}
            >
              플랫폼 도입 상담
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </section>

      <LandingEventsSection />

      {/* FAQ */}
      <section
        id="faq"
        className={cn("scroll-mt-20 bg-white", landingSectionY.bandTight)}
      >
        <div
          className={cn(
            landingContent,
            "grid gap-6 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:gap-10",
          )}
        >
          <div>
            <SectionEyebrow>{landingHome.faqEyebrow}</SectionEyebrow>
            <h2 className={cn(TYPO.h2, "mt-2.5", SKY.ink)}>
              {landingHome.faqHeading}
            </h2>
          </div>
          <Accordion
            type="single"
            collapsible
            className={cn(SKY.card, "px-4 sm:px-5")}
          >
            {landingHomeFaq.map((item) => (
              <AccordionItem
                key={item.q}
                value={item.q}
                className="border-sky-100"
              >
                <AccordionTrigger className="py-4 text-left text-[15px] font-semibold text-[#0b2a5c] hover:no-underline sm:text-base">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className={cn("pb-4", TYPO.body)}>
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA */}
      <section id="contact" className={cn("scroll-mt-20", SKY.band)}>
        <div
          className={cn(
            landingContent,
            "flex flex-col items-start py-12 sm:py-14 lg:flex-row lg:items-end lg:justify-between lg:gap-8",
          )}
        >
          <div className="max-w-lg">
            <SectionEyebrow>START SIMPLE WAY</SectionEyebrow>
            <h2 className={cn(TYPO.h2, "mt-2.5", SKY.ink)}>
              {landingHome.ctaBandTitle}
            </h2>
            <Lines
              lines={[...landingHome.ctaBandBody]}
              className={cn("mt-3", TYPO.lead)}
            />
          </div>
          <div className="mt-6 flex flex-wrap gap-2.5 lg:mt-0">
            <Button
              type="button"
              className={cn("h-10 shrink-0 px-6 text-[14px] font-semibold", SKY.pill)}
              onClick={goStart}
            >
              {landingHome.ctaStart}
            </Button>
            <Button
              type="button"
              variant="outline"
              className={cn(
                "h-10 shrink-0 px-6 text-[14px] font-semibold",
                SKY.pillGhost,
              )}
              onClick={() => navigate("/contact")}
            >
              {landingHome.ctaConsult}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

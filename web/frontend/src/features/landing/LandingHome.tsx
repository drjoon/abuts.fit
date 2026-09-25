// related files:
// - web/frontend/src/pages/public/Index.tsx
// - web/frontend/src/features/landing/landingTheme.ts
// - web/frontend/src/features/landing/LandingEventsSection.tsx
// - web/frontend/src/features/layout/Navigation.tsx
// - web/frontend/src/features/landing/landingAssets.ts
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
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
  landingSky,
  landingTypo,
} from "./landingTheme";
import { LandingEventsSection } from "./LandingEventsSection";
import { LandingScrollCue } from "./LandingScrollCue";

const TYPO = landingTypo;
const SKY = landingSky;
const GALLERY_SLIDE_MS = 7000;

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

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return reduced;
}

function WorkflowGallery() {
  const slides = landingHomeBusinessTabs;
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = usePrefersReducedMotion();
  const dragX = useRef<number | null>(null);
  const slide = slides[index] ?? slides[0];

  const go = (next: number) => {
    if (count < 1) return;
    setIndex(((next % count) + count) % count);
  };

  useEffect(() => {
    if (reduced || paused || count < 2) return;
    let id = 0;
    const arm = () => {
      id = window.setTimeout(() => {
        if (document.hidden) {
          arm();
          return;
        }
        setIndex((current) => (current + 1) % count);
      }, GALLERY_SLIDE_MS);
    };
    arm();
    return () => window.clearTimeout(id);
  }, [count, index, paused, reduced]);

  return (
    <div
      className={cn(
        "mt-8 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2 sm:mt-10",
        SKY.card,
      )}
      role="region"
      aria-roledescription="갤러리"
      aria-label="서비스 흐름"
      tabIndex={0}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        setPaused(false);
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "ArrowRight") {
          event.preventDefault();
          go(index + 1);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          go(index - 1);
        }
      }}
    >
      <div className="lg:grid lg:grid-cols-[minmax(0,1.45fr)_minmax(17.5rem,22.5rem)]">
      <div
        className={cn(
          "relative aspect-[16/10] overflow-hidden sm:aspect-[16/8] lg:aspect-auto lg:min-h-[24rem]",
          slide.id === "simple-way" ? "bg-white" : "bg-[#071937]",
        )}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          if ((event.target as HTMLElement).closest("button")) return;
          dragX.current = event.clientX;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerUp={(event) => {
          if (dragX.current == null) return;
          const delta = event.clientX - dragX.current;
          dragX.current = null;
          if (delta > 48) go(index - 1);
          else if (delta < -48) go(index + 1);
        }}
        onPointerCancel={() => {
          dragX.current = null;
        }}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[3px] bg-white/45">
          <div
            key={index}
            className={cn(
              "h-full bg-[#2563eb]",
              reduced ? "w-full" : "workflow-gallery-progress",
              paused && "is-paused",
            )}
            style={
              reduced ? undefined : { animationDuration: `${GALLERY_SLIDE_MS}ms` }
            }
          />
        </div>

        {slides.map((item, itemIndex) => {
          const active = itemIndex === index;
          const diagram = item.id === "simple-way";
          const zoom = !diagram;
          return (
            <img
              key={item.id}
              src={item.image.src}
              alt={active ? item.image.alt : ""}
              className={cn(
                "absolute max-w-none object-center transition-opacity duration-700",
                diagram
                  ? "left-0 top-1/2 h-auto w-full -translate-y-1/2"
                  : "inset-0 h-full w-full object-cover",
                active ? "opacity-100" : "opacity-0",
                active && !reduced && zoom && "workflow-gallery-zoom",
                active && paused && "is-paused",
              )}
              style={
                active && !reduced && zoom
                  ? { animationDuration: `${GALLERY_SLIDE_MS}ms` }
                  : undefined
              }
              draggable={false}
            />
          );
        })}
        <p className="absolute left-4 top-5 z-10 rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-[#0b2a5c] shadow-sm">
          {String(index + 1).padStart(2, "0")}
          <span className="text-sky-400"> / {String(count).padStart(2, "0")}</span>
        </p>

        <button
          type="button"
          aria-label="이전"
          className="absolute left-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200/80 bg-white/90 text-[#0b2a5c] shadow-md backdrop-blur-sm transition hover:bg-white sm:left-4 sm:h-11 sm:w-11"
          onClick={() => go(index - 1)}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label="다음"
          className="absolute right-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200/80 bg-white/90 text-[#0b2a5c] shadow-md backdrop-blur-sm transition hover:bg-white sm:right-4 sm:h-11 sm:w-11"
          onClick={() => go(index + 1)}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-col justify-center border-t border-sky-100 px-5 py-6 sm:px-8 sm:py-7 lg:border-l lg:border-t-0 lg:px-8 lg:py-8">
        <div key={slide.id} className={reduced ? undefined : "workflow-gallery-fade"}>
          <p className={cn(TYPO.eyebrow, SKY.accent)}>{slide.eyebrow}</p>
          <h3 className={cn(TYPO.h3, "mt-2", SKY.ink)}>{slide.title}</h3>
          <Lines lines={[...slide.body]} className={cn("mt-3", TYPO.body)} />
          <Link
            to={slide.href}
            className={cn(
              "mt-5 inline-flex items-center gap-1 underline-offset-4 hover:underline",
              TYPO.link,
              SKY.accentStrong,
            )}
          >
            {slide.cta}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
      </div>
    </div>
  );
}

/** `/` — Waveon 구조 · 포토 히어로 · 작은 타이포 · 하늘색 · 둥근 모서리 */
export function LandingHome() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const goStart = () => {
    navigate(isAuthenticated ? resolveEntryDashboardPath(user) : "/signup");
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
        </div>

        <LandingScrollCue />
      </section>

      {/* ABUTS WORKFLOW — 사진 갤러리 슬라이드쇼 */}
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

          <WorkflowGallery />
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

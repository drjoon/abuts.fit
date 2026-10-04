// change-log:
// - 2026-10-05: 장점 2(구강스캔 특화 · AI 지향) · 스토리 2. FIT TOGETHER 제외.
// - 2026-10-05: 커스텀어벗 플로우·하나의 크레딧 섹션은 플랫폼 오퍼로 이동.
// - 2026-10-05: 장점 3 · 생성 이미지 스토리 3 · AI는 검수·축적 카피. 히어로 스캔 점군 유지.
// - 2026-09-29: 기공서비스 오퍼 전용 섹션 신설 — 히어로(파티클) · 장점 4 · AI 디자인 · 커스텀어벗 플로우 · 하나의 크레딧 · FAQ.
//   랜딩(`LandingHome`)·플랫폼과 같은 토큰/이펙트(Reveal · SpotlightCard · Magnetic · ParticleField · ScrollCue)만 쓴다.
// related files:
// - web/frontend/src/features/landing/LandingOfferPage.tsx
// - web/frontend/src/features/landing/labOfferContent.ts
// - web/frontend/src/features/landing/landingTheme.ts
// - web/frontend/src/index.css (lab-* 이펙트)
import type { CSSProperties } from "react";
import {
  ArrowRight,
  Crosshair,
  Crown,
  Layers,
  PenTool,
  ScanLine,
  Save,
  ShieldCheck,
  Sparkles,
  Spline,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/ui/cn";
import {
  landingContent,
  landingProse,
  landingSectionY,
  landingSky,
  landingTheme,
  landingTypo,
} from "./landingTheme";
import type { LabIconKey, LabOfferExtras } from "./labOfferContent";
import { LabScanField } from "./LabScanField";
import { LandingMagnetic } from "./LandingMagnetic";
import { LandingParticleField } from "./LandingParticleField";
import { LandingReveal } from "./LandingReveal";
import { LandingScrollCue } from "./LandingScrollCue";
import { LandingSpotlightCard } from "./LandingSpotlightCard";
import { Lines, SectionEyebrow } from "./landingText";

const TYPO = landingTypo;
const SKY = landingSky;

const rise = (delay: number) =>
  ({ "--rise-delay": `${delay}ms` }) as CSSProperties;
const stepIndex = (index: number) => ({ "--i": index }) as CSSProperties;

const ICONS: Record<LabIconKey, typeof ScanLine> = {
  ai: Sparkles,
  align: ScanLine,
  axis: Crosshair,
  margin: Spline,
  scanbody: Layers,
  crown: Crown,
  check: ShieldCheck,
  design: PenTool,
  save: Save,
};

/**
 * 히어로 — 3D 스캔 점군 위로 스캔 평면이 지나가는 스플릿 히어로.
 * 랜딩(파티클 워드·중앙 정렬)과 달리 왼쪽 정렬 카피 + 오른쪽 스캔 캔버스.
 */
export function LabOfferHero({
  hero,
  eyebrow,
  startLabel,
  consultLabel,
  onStart,
  onConsult,
}: {
  hero: LabOfferExtras["hero"];
  eyebrow: string;
  startLabel: string;
  consultLabel: string;
  onStart: () => void;
  onConsult: () => void;
}) {
  return (
    <section data-rail-label="시작" className="bg-white">
      {/* fixed 헤더(h-14/sm:h-16) 아래부터 히어로 */}
      <div className="h-14 sm:h-16" aria-hidden />
      <div className="relative flex min-h-[78svh] items-center overflow-hidden bg-[#050f24] sm:min-h-[82svh]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_78%_45%,rgba(37,99,235,0.42),transparent_58%),radial-gradient(ellipse_at_8%_0%,rgba(56,189,248,0.18),transparent_50%)]"
        />
        {/* 블루프린트 격자 — 오른쪽 스캔 영역 쪽으로 옅어진다 */}
        <div
          aria-hidden
          className="lab-hero-grid pointer-events-none absolute inset-0"
        />

        <div
          className={cn(
            landingContent,
            "relative z-10 grid w-full items-center gap-6 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-10",
          )}
        >
          <div className="text-center lg:text-left">
            <p
              className={cn(TYPO.eyebrow, "landing-rise text-sky-300")}
              style={rise(0)}
            >
              {eyebrow}
            </p>
            <h1
              className={cn(TYPO.h2, "landing-rise mt-3 text-white")}
              style={rise(200)}
            >
              {hero.title.map((line, index) => (
                <span
                  key={line}
                  className={cn(
                    "block",
                    index === 0 &&
                      "bg-gradient-to-r from-white via-sky-200 to-sky-400 bg-clip-text text-transparent",
                  )}
                >
                  {line}
                </span>
              ))}
            </h1>
            <div className="landing-rise" style={rise(400)}>
              <Lines
                lines={hero.body}
                className="mt-4 text-[14px] leading-6 text-white/85 sm:mt-5 sm:text-[15px]"
              />
            </div>
            <div
              className="landing-rise mt-7 flex w-full flex-col items-center justify-center gap-2.5 sm:mt-8 sm:w-auto sm:flex-row sm:gap-3 lg:justify-start"
              style={rise(600)}
            >
              <LandingMagnetic className="w-full sm:w-auto">
                <Button
                  type="button"
                  className={cn(
                    "landing-btn h-10 w-full px-6 text-[14px] font-semibold sm:w-auto",
                    landingTheme.ctaOnDark,
                  )}
                  onClick={onStart}
                >
                  {startLabel}
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </LandingMagnetic>
              <LandingMagnetic className="w-full sm:w-auto">
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "landing-btn h-10 w-full px-6 text-[14px] font-semibold sm:w-auto",
                    landingTheme.ctaGhostOnDark,
                  )}
                  onClick={onConsult}
                >
                  {consultLabel}
                </Button>
              </LandingMagnetic>
            </div>
          </div>

          <div
            className="landing-rise relative h-[19rem] w-full sm:h-[24rem] lg:h-[30rem] min-[1600px]:h-[34rem] min-[1920px]:h-[40rem]"
            style={rise(300)}
          >
            <LabScanField />
            <p className="absolute left-2 top-2 inline-flex items-center gap-2 rounded-full border border-sky-300/30 bg-sky-400/10 px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-sky-200 backdrop-blur-sm">
              <span className="lab-live-dot h-1.5 w-1.5 rounded-full bg-sky-300" />
              {hero.hud}
            </p>
          </div>
        </div>

        <LandingScrollCue />
      </div>
    </section>
  );
}

/** 히어로 직후 — 장점 2카드. */
export function LabAdvantagesSection({
  advantages,
}: {
  advantages: LabOfferExtras["advantages"];
}) {
  return (
    <section
      id="after-hero"
      data-rail-label="장점"
      className={cn("scroll-mt-20", SKY.band, landingSectionY.bandTight)}
    >
      <div className={landingContent}>
        <LandingReveal className={cn(landingProse, "text-center")}>
          <SectionEyebrow>{advantages.eyebrow}</SectionEyebrow>
          <h2 className={cn(TYPO.h2, "mt-2.5", SKY.ink)}>{advantages.title}</h2>
          <Lines lines={advantages.lead} className={cn("mt-2.5", TYPO.lead)} />
        </LandingReveal>

        <ul className="mx-auto mt-8 grid max-w-4xl gap-3 sm:mt-10 sm:grid-cols-2 lg:gap-4">
          {advantages.items.map((item, index) => {
            const Icon = ICONS[item.icon];
            return (
              <LandingReveal as="li" key={item.label} delay={index * 90}>
                <LandingSpotlightCard
                  className={cn(
                    SKY.card,
                    "group flex h-full flex-col bg-white px-4 py-5 sm:px-5 sm:py-6",
                  )}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#eef6ff] text-[#2563eb] transition-colors duration-300 group-hover:bg-[#2563eb] group-hover:text-white">
                    <Icon className="h-[18px] w-[18px]" aria-hidden />
                  </span>
                  <p
                    className={cn(
                      "mt-4 text-[11px] font-bold tracking-[0.14em]",
                      SKY.accent,
                    )}
                  >
                    {item.label}
                  </p>
                  <h3
                    className={cn(
                      "mt-1.5 break-keep text-base font-semibold tracking-tight sm:text-lg",
                      SKY.ink,
                    )}
                  >
                    {item.title}
                  </h3>
                  <Lines lines={item.body} className={cn("mt-2", TYPO.body)} />
                  <ul className="mt-auto flex flex-wrap gap-1.5 pt-4">
                    {item.tags.map((tag) => (
                      <li
                        key={tag}
                        className="rounded-full border border-sky-100 bg-[#f4f9ff] px-2.5 py-0.5 text-[11px] font-medium text-[#1d4ed8]"
                      >
                        {tag}
                      </li>
                    ))}
                  </ul>
                </LandingSpotlightCard>
              </LandingReveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/** 구강스캔 · AI 검수 — 생성 이미지 스토리 2. */
export function LabStoriesSection({
  stories,
}: {
  stories: LabOfferExtras["stories"];
}) {
  return (
    <section
      data-rail-label="방식"
      className={cn("scroll-mt-20 bg-white", landingSectionY.bandTight)}
    >
      <div className={landingContent}>
        <LandingReveal className={cn(landingProse, "text-center")}>
          <SectionEyebrow>{stories.eyebrow}</SectionEyebrow>
          <h2 className={cn(TYPO.h2, "mt-2.5", SKY.ink)}>{stories.title}</h2>
          <Lines lines={stories.lead} className={cn("mt-2.5", TYPO.lead)} />
        </LandingReveal>

        <div className="mt-8 flex flex-col gap-8 sm:mt-10 sm:gap-12">
          {stories.items.map((story, index) => (
            <LandingReveal key={story.name}>
              <article
                className={cn(
                  "grid items-center gap-0 overflow-hidden lg:grid-cols-2",
                  SKY.card,
                )}
              >
                <div
                  className={cn(
                    "relative overflow-hidden bg-[#071937]",
                    index % 2 === 1 && "lg:order-2",
                  )}
                >
                  <img
                    src={story.image.src}
                    alt={story.image.alt}
                    className="h-auto w-full object-cover object-center"
                  />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_72%,rgba(255,255,255,0.28)_100%)]"
                  />
                </div>
                <div className="flex flex-col justify-center px-5 py-6 sm:px-8 sm:py-8">
                  <SectionEyebrow>
                    {String(index + 1).padStart(2, "0")}
                  </SectionEyebrow>
                  <h3 className={cn(TYPO.h3, "mt-2", SKY.ink)}>{story.name}</h3>
                  <p
                    className={cn(
                      "mt-1.5 text-[14px] font-medium sm:text-[15px]",
                      SKY.accentStrong,
                    )}
                  >
                    {story.line}
                  </p>
                  <Lines lines={story.body} className={cn("mt-3", TYPO.body)} />
                </div>
              </article>
            </LandingReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/** AI 디자인 — 다크 밴드 + 스캔 라인 + 단계 순차 글로우. */
export function LabAiDesignSection({ ai }: { ai: LabOfferExtras["ai"] }) {
  return (
    <section
      id="ai-design"
      data-rail-label="AI 디자인"
      className={cn(
        "relative scroll-mt-20 overflow-hidden bg-[#071937]",
        landingSectionY.bandTight,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_15%_0%,rgba(56,189,248,0.22),transparent_55%),radial-gradient(ellipse_at_90%_20%,rgba(37,99,235,0.28),transparent_55%)]"
      />
      <LandingParticleField />
      <span aria-hidden className="lab-scan-line" />

      <div className={cn("relative z-10", landingContent)}>
        <LandingReveal className={cn(landingProse, "text-center")}>
          <SectionEyebrow className="!text-sky-300">{ai.eyebrow}</SectionEyebrow>
          <h2 className={cn(TYPO.h2, "mt-2.5 text-white")}>
            {ai.title.map((line, index) => (
              <span key={line}>
                {index > 0 ? <br /> : null}
                {line}
              </span>
            ))}
          </h2>
          <Lines
            lines={ai.lead}
            className="mt-2.5 text-[14px] leading-6 text-white/80 sm:text-[15px]"
          />
        </LandingReveal>

        <ol className="mt-8 grid gap-3 sm:mt-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
          {ai.steps.map((step, index) => {
            const Icon = ICONS[step.icon];
            return (
              <LandingReveal as="li" key={step.title} delay={(index % 3) * 90}>
                <LandingSpotlightCard
                  style={stepIndex(index)}
                  className="lab-step-glow h-full rounded-2xl border border-white/[0.12] bg-white/[0.06] px-4 py-5 backdrop-blur-sm sm:px-5 sm:py-6"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-400/15 text-sky-300 ring-1 ring-inset ring-sky-300/30">
                      <Icon className="h-[18px] w-[18px]" aria-hidden />
                    </span>
                    <span className="text-[13px] font-bold tracking-[0.12em] text-sky-300/90">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3 className="mt-4 break-keep text-base font-semibold tracking-tight text-white sm:text-lg">
                    {step.title}
                  </h3>
                  <p className="mt-1.5 break-keep text-[14px] leading-6 text-white/75 sm:text-[15px] sm:leading-[1.65]">
                    {step.line}
                  </p>
                </LandingSpotlightCard>
              </LandingReveal>
            );
          })}
        </ol>

        <LandingReveal delay={120}>
          <ul className="mt-6 grid gap-3 sm:mt-8 md:grid-cols-3">
            {ai.points.map((point) => {
              const Icon = ICONS[point.icon];
              return (
                <li
                  key={point.title}
                  className="flex items-start gap-3 rounded-2xl border border-sky-300/20 bg-sky-400/[0.08] px-4 py-4 sm:px-5"
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[#2563eb]">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div>
                    <p className="text-[14px] font-semibold text-white sm:text-[15px]">
                      {point.title}
                    </p>
                    <p className="mt-1 break-keep text-[13px] leading-5 text-white/75">
                      {point.line}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </LandingReveal>
      </div>
    </section>
  );
}

/** FAQ — `/` 와 같은 아코디언. */
export function LabFaqSection({ faq }: { faq: LabOfferExtras["faq"] }) {
  return (
    <section
      id="faq"
      data-rail-label="FAQ"
      className={cn("scroll-mt-20", SKY.band, landingSectionY.bandTight)}
    >
      <div
        className={cn(
          landingContent,
          "grid gap-6 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:gap-10",
        )}
      >
        <LandingReveal>
          <SectionEyebrow>{faq.eyebrow}</SectionEyebrow>
          <h2 className={cn(TYPO.h2, "mt-2.5", SKY.ink)}>{faq.heading}</h2>
        </LandingReveal>
        <LandingReveal delay={120}>
          <Accordion
            type="single"
            collapsible
            className={cn(SKY.card, "px-4 sm:px-5")}
          >
            {faq.items.map((item) => (
              <AccordionItem key={item.q} value={item.q} className="border-sky-100">
                <AccordionTrigger className="py-4 text-left text-[15px] font-semibold text-[#0b2a5c] hover:no-underline sm:text-base">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <Lines lines={item.a} className={TYPO.body} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </LandingReveal>
      </div>
    </section>
  );
}

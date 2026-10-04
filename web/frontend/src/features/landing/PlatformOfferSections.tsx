// change-log:
// - 2026-10-05: 커스텀어벗 플로우·하나의 크레딧 섹션을 기공소 오퍼에서 이동. HOW IT WORKS 4단계는 플로우로 대체.
// - 2026-10-04: 플랫폼 오퍼 전용 섹션 — 스테이지 히어로 · 장점 glance · UI 캡처 스토리 · 추가 이유 · 대상 · 단계 · FAQ.
// related files:
// - web/frontend/src/features/landing/LandingOfferPage.tsx
// - web/frontend/src/features/landing/platformOfferContent.ts
// - web/frontend/src/features/landing/landingTheme.ts
// - web/frontend/src/index.css (pf-* 이펙트)
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  Cpu,
  Eye,
  Factory,
  FileText,
  Handshake,
  Infinity as InfinityIcon,
  LayoutDashboard,
  Link2,
  MessageSquare,
  PenTool,
  Play,
  Receipt,
  RotateCcw,
  Activity,
  Store,
  Truck,
  Users,
  Wallet,
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
  landingAudienceLab,
  landingAudiencePractice,
  landingContent,
  landingProse,
  landingSectionY,
  landingSky,
  landingTheme,
  landingTypo,
} from "./landingTheme";
import type { PlatformIconKey, PlatformOfferExtras } from "./platformOfferContent";
import { PlatformHeroFx } from "./PlatformHeroFx";
import { LandingMagnetic } from "./LandingMagnetic";
import { LandingReveal } from "./LandingReveal";
import { LandingScrollCue } from "./LandingScrollCue";
import { LandingSpotlightCard } from "./LandingSpotlightCard";
import { Lines, SectionEyebrow } from "./landingText";

const TYPO = landingTypo;
const SKY = landingSky;

const rise = (delay: number) =>
  ({ "--rise-delay": `${delay}ms` }) as CSSProperties;
const stepIndex = (index: number) => ({ "--i": index }) as CSSProperties;

const ICONS: Record<PlatformIconKey, typeof Eye> = {
  status: Activity,
  scan: Eye,
  chat: MessageSquare,
  partner: LayoutDashboard,
  credit: Wallet,
  cnc: Cpu,
  board: LayoutDashboard,
  practice: Building2,
  lab: Factory,
  request: FileText,
  start: Play,
  design: PenTool,
  ship: Truck,
  custom: Link2,
  store: Store,
  labFee: Handshake,
  infinity: InfinityIcon,
  refund: RotateCcw,
  receipt: Receipt,
  settle: BadgeCheck,
};

/**
 * 히어로 — 스테이지 레인 FX + 실제 UI 스크린샷 스플릿.
 * 랜딩(파티클)·어벗츠기공소(스캔 점군)와 다른 효과.
 */
export function PlatformOfferHero({
  hero,
  eyebrow,
  startLabel,
  consultLabel,
  onStart,
  onConsult,
}: {
  hero: PlatformOfferExtras["hero"];
  eyebrow: string;
  startLabel: string;
  consultLabel: string;
  onStart: () => void;
  onConsult: () => void;
}) {
  return (
    <section data-rail-label="시작" className="bg-white">
      <div className="h-14 sm:h-16" aria-hidden />
      <div className="relative flex min-h-[78svh] items-center overflow-hidden bg-[#06122a] sm:min-h-[82svh]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_72%_40%,rgba(37,99,235,0.38),transparent_58%),radial-gradient(ellipse_at_12%_0%,rgba(56,189,248,0.16),transparent_48%)]"
        />
        <PlatformHeroFx />

        <div
          className={cn(
            landingContent,
            "relative z-10 grid w-full items-center gap-6 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-10",
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
            className="landing-rise relative w-full"
            style={rise(300)}
          >
            <div className="pf-hero-frame relative overflow-hidden rounded-2xl border border-white/15 bg-white/5 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
              <img
                src={hero.image.src}
                alt={hero.image.alt}
                className="h-auto w-full object-cover object-top"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,rgba(6,18,42,0.55)_100%)]"
              />
              <p className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full border border-sky-300/30 bg-sky-400/10 px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-sky-200 backdrop-blur-sm">
                <span className="pf-live-dot h-1.5 w-1.5 rounded-full bg-sky-300" />
                {hero.hud}
              </p>
            </div>
          </div>
        </div>

        <LandingScrollCue />
      </div>
    </section>
  );
}

/** 히어로 직후 — 장점 3카드. */
export function PlatformGlanceSection({
  glance,
}: {
  glance: PlatformOfferExtras["glance"];
}) {
  return (
    <section
      id="after-hero"
      data-rail-label="장점"
      className={cn("scroll-mt-20", SKY.band, landingSectionY.bandTight)}
    >
      <div className={landingContent}>
        <LandingReveal className={cn(landingProse, "text-center")}>
          <SectionEyebrow>{glance.eyebrow}</SectionEyebrow>
          <h2 className={cn(TYPO.h2, "mt-2.5", SKY.ink)}>{glance.title}</h2>
          <Lines lines={glance.lead} className={cn("mt-2.5", TYPO.lead)} />
        </LandingReveal>

        <ul className="mx-auto mt-8 grid max-w-4xl gap-3 sm:mt-10 sm:grid-cols-2 lg:gap-4">
          {glance.items.map((item, index) => {
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

/** 실제 UI 캡처 스토리 3. */
export function PlatformStoriesSection({
  stories,
}: {
  stories: PlatformOfferExtras["stories"];
}) {
  return (
    <section
      data-rail-label="화면"
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
                    "relative overflow-hidden bg-[#f4f7fb]",
                    index % 2 === 1 && "lg:order-2",
                  )}
                >
                  <img
                    src={story.image.src}
                    alt={story.image.alt}
                    className="h-auto w-full object-cover object-top"
                  />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_70%,rgba(255,255,255,0.35)_100%)]"
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

/** 지정 기공소 · 크레딧 · CNC. */
export function PlatformExtrasSection({
  extras,
}: {
  extras: PlatformOfferExtras["extras"];
}) {
  return (
    <section
      data-rail-label="더보기"
      className={cn("scroll-mt-20", SKY.band, landingSectionY.bandTight)}
    >
      <div className={landingContent}>
        <LandingReveal className={cn(landingProse, "text-center")}>
          <SectionEyebrow>{extras.eyebrow}</SectionEyebrow>
          <h2 className={cn(TYPO.h2, "mt-2.5", SKY.ink)}>{extras.title}</h2>
          <Lines lines={extras.lead} className={cn("mt-2.5", TYPO.lead)} />
        </LandingReveal>
        <ul className="mt-8 grid gap-3 sm:mt-10 sm:grid-cols-3 lg:gap-4">
          {extras.items.map((item, index) => {
            const Icon = ICONS[item.icon];
            return (
              <LandingReveal as="li" key={item.title} delay={index * 80}>
                <LandingSpotlightCard
                  className={cn(SKY.card, "h-full bg-white px-4 py-5 sm:px-5")}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eef6ff] text-[#2563eb]">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <h3 className={cn("mt-3 text-base font-semibold sm:text-lg", SKY.ink)}>
                    {item.title}
                  </h3>
                  <Lines lines={item.body} className={cn("mt-2", TYPO.body)} />
                </LandingSpotlightCard>
              </LandingReveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/** 치과 / 기공소 대상 카드. */
export function PlatformAudienceSection({
  audiences,
}: {
  audiences: PlatformOfferExtras["audiences"];
}) {
  const cards = [
    { copy: landingAudiencePractice, icon: Building2, tone: "practice" as const },
    { copy: landingAudienceLab, icon: Factory, tone: "lab" as const },
  ];

  return (
    <section
      data-rail-label="대상"
      className={cn("scroll-mt-20 bg-white", landingSectionY.bandTight)}
    >
      <div className={landingContent}>
        <LandingReveal className={cn(landingProse, "text-center")}>
          <SectionEyebrow>{audiences.eyebrow}</SectionEyebrow>
          <h2 className={cn(TYPO.h2, "mt-2.5", SKY.ink)}>{audiences.title}</h2>
          <Lines lines={audiences.lead} className={cn("mt-2.5", TYPO.lead)} />
        </LandingReveal>

        <ul className="mt-8 grid gap-4 sm:mt-10 lg:grid-cols-2">
          {cards.map(({ copy, icon: Icon, tone }, index) => {
            const isPractice = tone === "practice";
            return (
              <LandingReveal as="li" key={copy.id} delay={index * 100}>
                <LandingSpotlightCard
                  className={cn(
                    "flex h-full flex-col overflow-hidden border bg-white",
                    isPractice ? "border-sky-200/80" : "border-emerald-200/80",
                  )}
                >
                  <div
                    className={cn(
                      "border-b px-5 py-5",
                      isPractice
                        ? "border-sky-100 bg-gradient-to-br from-sky-50 via-white to-white"
                        : "border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-white",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "flex h-11 w-11 items-center justify-center rounded-2xl text-white",
                          isPractice ? "bg-sky-600" : "bg-emerald-600",
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-[13px] font-semibold",
                          isPractice
                            ? "bg-sky-100 text-sky-800"
                            : "bg-emerald-100 text-emerald-800",
                        )}
                      >
                        {copy.shortLabel}
                      </span>
                    </div>
                    <h3 className={cn("mt-3 text-base font-semibold sm:text-lg", SKY.ink)}>
                      {copy.headline}
                    </h3>
                    <p className={cn("mt-1.5", TYPO.body)}>{copy.subheadline}</p>
                  </div>
                  <ul className="space-y-2 px-5 py-5">
                    {copy.landingBenefits.map((benefit) => (
                      <li key={benefit} className="flex items-start gap-2.5">
                        <span
                          className={cn(
                            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                            isPractice
                              ? "bg-sky-100 text-sky-700"
                              : "bg-emerald-100 text-emerald-700",
                          )}
                        >
                          <Check className="h-3 w-3" strokeWidth={3} />
                        </span>
                        <span className={TYPO.body}>{benefit}</span>
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

/** 커스텀어벗 연동 — 5단계 플로우(진입 시 라인이 차오르고 점이 순서대로 켜진다). */
export function PlatformPipelineSection({
  pipeline,
}: {
  pipeline: PlatformOfferExtras["pipeline"];
}) {
  return (
    <section
      id="custom-abutment"
      data-rail-label="커스텀어벗"
      className={cn("scroll-mt-20 bg-white", landingSectionY.bandTight)}
    >
      <div className={landingContent}>
        <LandingReveal className={cn(landingProse, "text-center")}>
          <SectionEyebrow>{pipeline.eyebrow}</SectionEyebrow>
          <h2 className={cn(TYPO.h2, "mt-2.5", SKY.ink)}>{pipeline.title}</h2>
          <Lines lines={pipeline.lead} className={cn("mt-2.5", TYPO.lead)} />
        </LandingReveal>

        <LandingReveal className="relative mt-10 sm:mt-12">
          <span
            aria-hidden
            className="absolute left-[9%] right-[9%] top-[1.375rem] hidden h-px bg-sky-100 lg:block"
          >
            <span className="lab-flow-fill-x absolute left-0 top-0 h-full bg-[#2563eb]" />
          </span>
          <span
            aria-hidden
            className="absolute bottom-[1.375rem] left-[1.375rem] top-[1.375rem] w-px bg-sky-100 lg:hidden"
          >
            <span className="lab-flow-fill-y absolute left-0 top-0 w-full bg-[#2563eb]" />
          </span>

          <ol className="relative grid gap-6 lg:grid-cols-5 lg:gap-4">
            {pipeline.steps.map((step, index) => {
              const Icon = ICONS[step.icon];
              return (
                <li
                  key={step.title}
                  style={stepIndex(index)}
                  className="flex gap-4 lg:flex-col lg:items-center lg:text-center"
                >
                  <span className="lab-flow-dot relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-sky-200 bg-white text-[#2563eb]">
                    <Icon className="h-[18px] w-[18px]" aria-hidden />
                  </span>
                  <div className="lg:mt-3">
                    <p className={cn("text-[12px] font-bold tracking-[0.14em]", SKY.accent)}>
                      {String(index + 1).padStart(2, "0")}
                    </p>
                    <h3 className={cn("mt-0.5 text-base font-semibold sm:text-lg", SKY.ink)}>
                      {step.title}
                    </h3>
                    <p className={cn("mt-1.5 lg:mx-auto lg:max-w-[14rem]", TYPO.body)}>
                      {step.line}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </LandingReveal>

        <div className="mt-10 grid gap-4 sm:mt-12 lg:grid-cols-[1.2fr_1fr]">
          <LandingReveal>
            <div className={cn("h-full overflow-hidden", SKY.card)}>
              <img
                src={pipeline.image.src}
                alt={pipeline.image.alt}
                className="h-full max-h-[22rem] w-full bg-white object-contain object-center min-[1600px]:max-h-[28rem]"
              />
            </div>
          </LandingReveal>
          <LandingReveal delay={120}>
            <LandingSpotlightCard
              className={cn(SKY.card, "flex h-full flex-col justify-center px-5 py-6 sm:px-7")}
            >
              <ul className="space-y-3">
                {pipeline.notes.map((note) => (
                  <li key={note} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#eef6ff] text-[#2563eb]">
                      <Check className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <p className={TYPO.body}>{note}</p>
                  </li>
                ))}
              </ul>
              <Link
                to="/offer/lab"
                className={cn(
                  "mt-6 inline-flex items-center gap-1 self-start underline-offset-4 hover:underline",
                  TYPO.link,
                  SKY.accentStrong,
                )}
              >
                어벗츠기공소 이어서 보기
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </LandingSpotlightCard>
          </LandingReveal>
        </div>
      </div>
    </section>
  );
}

/** 하나의 크레딧 — 허브(맥동 링) + 사용처 3 + 정책 사실 4. */
export function PlatformCreditSection({
  credit,
}: {
  credit: PlatformOfferExtras["credit"];
}) {
  return (
    <section
      id="credit"
      data-rail-label="크레딧"
      className={cn("scroll-mt-20", SKY.band, landingSectionY.bandTight)}
    >
      <div className={landingContent}>
        <LandingReveal className={cn(landingProse, "text-center")}>
          <SectionEyebrow>{credit.eyebrow}</SectionEyebrow>
          <h2 className={cn(TYPO.h2, "mt-2.5", SKY.ink)}>{credit.title}</h2>
          <Lines lines={credit.lead} className={cn("mt-2.5", TYPO.lead)} />
        </LandingReveal>

        <div className="mt-8 grid gap-4 sm:mt-10 lg:grid-cols-[1.05fr_0.95fr]">
          <LandingReveal>
            <div className={cn(SKY.card, "flex h-full flex-col items-center px-5 py-8 sm:px-8")}>
              <div className="relative flex h-28 w-28 items-center justify-center">
                {[0, 1, 2].map((ring) => (
                  <span
                    key={ring}
                    aria-hidden
                    style={stepIndex(ring)}
                    className="lab-hub-ring absolute inset-0 rounded-full border border-sky-400/50"
                  />
                ))}
                <span className="relative z-10 flex h-24 w-24 flex-col items-center justify-center rounded-full bg-[#2563eb] text-white shadow-[0_14px_34px_rgba(37,99,235,0.35)]">
                  <Wallet className="h-5 w-5" aria-hidden />
                  <span className="mt-1 text-[15px] font-bold tracking-tight">
                    {credit.hubLabel}
                  </span>
                  <span className="text-[11px] font-medium text-white/80">
                    {credit.hubNote}
                  </span>
                </span>
              </div>

              <span aria-hidden className="hidden h-6 w-px bg-sky-200 sm:block" />
              <div className="relative w-full pt-6 sm:pt-0">
                <span
                  aria-hidden
                  className="absolute left-[16.67%] right-[16.67%] top-0 hidden h-px bg-sky-200 sm:block"
                />
                <ul className="grid gap-3 sm:grid-cols-3 sm:pt-6">
                  {credit.spokes.map((spoke) => {
                    const Icon = ICONS[spoke.icon];
                    return (
                      <li
                        key={spoke.label}
                        className="relative rounded-2xl border border-sky-100 bg-[#f7fbff] px-3 py-4 text-center"
                      >
                        <span
                          aria-hidden
                          className="absolute -top-6 left-1/2 hidden h-6 w-px bg-sky-200 sm:block"
                        />
                        <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#2563eb] ring-1 ring-sky-100">
                          <Icon className="h-4 w-4" aria-hidden />
                        </span>
                        <p className={cn("mt-2.5 text-[15px] font-semibold", SKY.ink)}>
                          {spoke.label}
                        </p>
                        <p className="mt-0.5 break-keep text-[12px] text-slate-500">
                          {spoke.line}
                        </p>
                        <span className="mt-2 inline-block rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-[#2563eb] ring-1 ring-sky-100">
                          {spoke.tag}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </LandingReveal>

          <LandingReveal delay={120}>
            <div className={cn(SKY.card, "flex h-full flex-col px-5 py-2 sm:px-7")}>
              <ul className="divide-y divide-sky-100">
                {credit.facts.map((fact) => {
                  const Icon = ICONS[fact.icon];
                  return (
                    <li key={fact.title} className="flex items-start gap-3 py-4">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eef6ff] text-[#2563eb]">
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <div>
                        <h3 className={cn("text-[15px] font-semibold sm:text-base", SKY.ink)}>
                          {fact.title}
                        </h3>
                        <Lines lines={fact.body} className={cn("mt-1", TYPO.body)} />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-auto flex items-center gap-2 border-t border-sky-100 py-4 text-[12px] font-medium text-slate-500">
                <Users className="h-3.5 w-3.5 shrink-0 text-sky-500" aria-hidden />
                {credit.notice}
              </p>
            </div>
          </LandingReveal>
        </div>
      </div>
    </section>
  );
}

export function PlatformFaqSection({
  faq,
}: {
  faq: PlatformOfferExtras["faq"];
}) {
  return (
    <section
      id="faq"
      data-rail-label="FAQ"
      className={cn("scroll-mt-20 bg-white", landingSectionY.bandTight)}
    >
      <div className={cn(landingContent, "max-w-3xl")}>
        <LandingReveal className="text-center">
          <SectionEyebrow>{faq.eyebrow}</SectionEyebrow>
          <h2 className={cn(TYPO.h2, "mt-2.5", SKY.ink)}>{faq.heading}</h2>
        </LandingReveal>
        <LandingReveal delay={80}>
          <Accordion type="single" collapsible className="mt-8">
            {faq.items.map((item) => (
              <AccordionItem
                key={item.q}
                value={item.q}
                className="border-sky-100"
              >
                <AccordionTrigger className="py-4 text-left text-[15px] font-semibold text-[#0b2a5c] hover:no-underline sm:text-base">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className={cn("pb-4", TYPO.body)}>
                  {item.a.map((line, index) => (
                    <span key={line}>
                      {index > 0 ? <br /> : null}
                      {line}
                    </span>
                  ))}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </LandingReveal>
      </div>
    </section>
  );
}

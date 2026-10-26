// change-log:
// - 2026-10-27: 어벗츠기공소 표현 제거. 행사·커스텀어벗 소개·후불/선불 입금. 구강스캔 이야기·용어·옛 크레딧 허브 제거.
// - 2026-10-27: 플랫폼·어벗츠기공소 오퍼를 랜딩 본문에 통합. 히어로·중복 FAQ·마감 배너·장점 카드(스토리와 동일)는 넣지 않음.
// related files:
// - web/frontend/src/pages/public/Index.tsx
// - web/frontend/src/features/landing/landingTheme.ts
// - web/frontend/src/features/landing/LandingEventsSection.tsx
// - web/frontend/src/features/layout/Navigation.tsx
// - web/frontend/src/features/landing/PlatformOfferSections.tsx
// - web/frontend/src/features/landing/LabOfferSections.tsx
import { useNavigate } from "react-router-dom";
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
import {
  landingHome,
  landingHomeFaq,
  landingContent,
  landingProse,
  landingSectionY,
  landingSky,
  landingTypo,
} from "./landingTheme";
import { AbutsLabIntroSections } from "./AbutsLabIntroSections";
import { LandingEventsSection } from "./LandingEventsSection";
import { LandingHero } from "./LandingHero";
import { LandingMagnetic } from "./LandingMagnetic";
import { LandingReveal } from "./LandingReveal";
import { LandingScrollProgress } from "./LandingScrollProgress";
import { LandingSectionRail, type LandingRailItem } from "./LandingSectionRail";
import { LandingSpotlightCard } from "./LandingSpotlightCard";
import { PLATFORM_OFFER_EXTRAS } from "./platformOfferContent";
import {
  PlatformGlanceSection,
  PlatformPipelineSection,
  PlatformStoriesSection,
} from "./PlatformOfferSections";

const TYPO = landingTypo;
const SKY = landingSky;

/** 우측 섹션 레일 — 각 섹션 `id` 와 일치해야 한다. */
const RAIL_ITEMS: LandingRailItem[] = [
  { id: "hero", label: "시작" },
  { id: "events", label: "행사" },
  { id: "offer-platform", label: "플랫폼" },
  { id: "screens", label: "화면" },
  { id: "custom-abutment", label: "커스텀어벗" },
  { id: "offer-lab", label: "가공" },
  { id: "abutment-corner", label: "코너" },
  { id: "abutment-design", label: "디자인" },
  { id: "settlement", label: "입금" },
  { id: "faq", label: "자주 묻는 질문" },
  { id: "contact", label: "시작하기" },
];

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
  return <p className={cn(TYPO.eyebrow, SKY.accent, className)}>{children}</p>;
}

/** `/` — 플랫폼·어벗츠기공소 설명을 이 페이지 흐름에 붙인다. */
export function LandingHome() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const goStart = () => {
    navigate(isAuthenticated ? resolveEntryDashboardPath(user) : "/signup");
  };

  return (
    <div className="bg-white text-slate-900">
      <LandingScrollProgress />
      <LandingSectionRail items={RAIL_ITEMS} />
      <LandingHero
        onMore={() =>
          document
            .getElementById("events")
            ?.scrollIntoView({ behavior: "smooth", block: "start" })
        }
        onConsult={() => navigate("/contact")}
      />

      <LandingEventsSection />

      <PlatformGlanceSection
        id="offer-platform"
        glance={PLATFORM_OFFER_EXTRAS.glance}
        surface="white"
      />
      <PlatformStoriesSection
        id="screens"
        className="border-t border-sky-100"
        stories={PLATFORM_OFFER_EXTRAS.stories}
      />
      <PlatformPipelineSection pipeline={PLATFORM_OFFER_EXTRAS.pipeline} />
      <AbutsLabIntroSections asPlatform />

      <section
        id="settlement"
        className={cn("scroll-mt-20 bg-white", landingSectionY.bandTight)}
      >
        <div className={landingContent}>
          <LandingReveal className={cn(landingProse, "text-center")}>
            <SectionEyebrow>SETTLEMENT</SectionEyebrow>
            <h2 className={cn(TYPO.h2, "mt-2.5", SKY.ink)}>
              입금은 역할마다 다릅니다.
            </h2>
            <p className={cn("mt-2.5", TYPO.lead)}>
              기공 결제와 스토어는 잠시 닫혀 있습니다.
            </p>
          </LandingReveal>
          <ul className="mx-auto mt-8 grid max-w-4xl gap-3 sm:mt-10 sm:grid-cols-2 lg:gap-4">
            <LandingReveal as="li">
              <LandingSpotlightCard
                className={cn(SKY.card, "h-full bg-[#eef6ff] px-5 py-6 sm:px-6")}
              >
                <p className={cn(TYPO.eyebrow, SKY.accent)}>PRACTICE</p>
                <h3 className={cn(TYPO.h3, "mt-2", SKY.ink)}>치과</h3>
                <p className={cn("mt-3", TYPO.body)}>
                  기공료는 후불 정산으로 입금합니다.
                </p>
              </LandingSpotlightCard>
            </LandingReveal>
            <LandingReveal as="li" delay={90}>
              <LandingSpotlightCard
                className={cn(SKY.card, "h-full bg-[#eef6ff] px-5 py-6 sm:px-6")}
              >
                <p className={cn(TYPO.eyebrow, SKY.accent)}>LAB</p>
                <h3 className={cn(TYPO.h3, "mt-2", SKY.ink)}>기공실 · 기공소</h3>
                <p className={cn("mt-3", TYPO.body)}>
                  커스텀어벗 생산비는 선불 크레딧으로 입금합니다.
                </p>
              </LandingSpotlightCard>
            </LandingReveal>
          </ul>
        </div>
      </section>

      <section
        id="faq"
        className={cn(
          "scroll-mt-20 border-t border-sky-100 bg-white",
          landingSectionY.bandTight,
        )}
      >
        <div
          className={cn(
            landingContent,
            "grid gap-6 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:gap-10",
          )}
        >
          <LandingReveal>
            <SectionEyebrow>{landingHome.faqEyebrow}</SectionEyebrow>
            <h2 className={cn(TYPO.h2, "mt-2.5", SKY.ink)}>
              {landingHome.faqHeading}
            </h2>
          </LandingReveal>
          <LandingReveal delay={120}>
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
                    {Array.isArray(item.a) ? (
                      <Lines lines={[...item.a]} />
                    ) : (
                      item.a
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </LandingReveal>
        </div>
      </section>

      <section id="contact" className={cn("scroll-mt-20", SKY.band)}>
        <div
          className={cn(
            landingContent,
            "flex flex-col items-start py-12 sm:py-14 lg:flex-row lg:items-end lg:justify-between lg:gap-8",
          )}
        >
          <LandingReveal className="max-w-lg">
            <SectionEyebrow>START WITH ABUTS</SectionEyebrow>
            <h2 className={cn(TYPO.h2, "mt-2.5", SKY.ink)}>
              {landingHome.ctaBandTitle}
            </h2>
            <Lines
              lines={[...landingHome.ctaBandBody]}
              className={cn("mt-3", TYPO.lead)}
            />
          </LandingReveal>
          <LandingReveal
            delay={150}
            className="mt-6 flex flex-wrap gap-2.5 lg:mt-0"
          >
            <LandingMagnetic>
              <Button
                type="button"
                className={cn(
                  "landing-btn h-10 shrink-0 px-6 text-[14px] font-semibold",
                  SKY.pill,
                )}
                onClick={goStart}
              >
                {landingHome.ctaStart}
              </Button>
            </LandingMagnetic>
            <LandingMagnetic>
              <Button
                type="button"
                variant="outline"
                className={cn(
                  "landing-btn h-10 shrink-0 px-6 text-[14px] font-semibold",
                  SKY.pillGhost,
                )}
                onClick={() => navigate("/contact")}
              >
                {landingHome.ctaConsult}
              </Button>
            </LandingMagnetic>
          </LandingReveal>
        </div>
      </section>
    </div>
  );
}

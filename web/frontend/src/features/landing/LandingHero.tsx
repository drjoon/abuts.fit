// related files:
// - web/frontend/src/features/landing/LandingHome.tsx
// - web/frontend/src/features/landing/LandingParticleField.tsx
// - web/frontend/src/features/landing/landingTheme.ts
import { useRef, type CSSProperties } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/ui/cn";
import { LANDING_WAVEON_HERO } from "./landingAssets";
import {
  landingContent,
  landingHome,
  landingIdentity,
  landingSky,
  landingTheme,
  landingTypo,
} from "./landingTheme";
import { LandingMagnetic } from "./LandingMagnetic";
import { LandingParticleField } from "./LandingParticleField";
import { LandingScrollCue } from "./LandingScrollCue";

const TYPO = landingTypo;
const SKY = landingSky;

const rise = (delay: number) => ({ "--rise-delay": `${delay}ms` }) as CSSProperties;

/**
 * `/` 풀블리드 히어로. 브랜드 워드를 파티클로 그리고(마우스 반응·스크롤 분산),
 * 문구·버튼은 순차 등장한다. 스크롤하면 배경은 살짝 확대, 콘텐츠는 페이드아웃.
 */
export function LandingHero({
  onMore,
  onConsult,
}: {
  onMore: () => void;
  onConsult: () => void;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);

  return (
    <section
      id="hero"
      className="relative flex min-h-[78svh] items-center justify-center overflow-hidden bg-[#071937] sm:min-h-[82svh]"
    >
      <img
        src={LANDING_WAVEON_HERO}
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-center will-change-transform"
        style={{ transform: "scale(calc(1.04 + var(--hero-p, 0) * 0.1))" }}
      />
      <div className={cn("pointer-events-none absolute inset-0", SKY.heroWash)} />

      <LandingParticleField anchorRef={anchorRef} text={landingIdentity.brandLine} />

      <div
        className={cn(
          landingContent,
          "relative z-10 flex w-full flex-col items-center px-5 py-24 text-center sm:py-28",
        )}
        style={{ opacity: "calc(1 - var(--hero-p, 0) * 1.15)" }}
      >
        <p
          className={cn(TYPO.eyebrow, "landing-rise text-white/85")}
          style={rise(0)}
        >
          {landingHome.heroEyebrow}
        </p>

        <div
          ref={anchorRef}
          role="img"
          aria-label={landingIdentity.brandLine}
          className="mt-4 h-[5.5rem] w-full max-w-[34rem] sm:h-[7.5rem] lg:h-[9rem]"
        />

        <h1
          className={cn(TYPO.h2, "landing-rise mt-4 max-w-2xl text-white")}
          style={rise(500)}
        >
          {landingHome.heroTitle.map((line, index) => (
            <span key={line}>
              {index > 0 ? <br /> : null}
              {line}
            </span>
          ))}
        </h1>
        <p
          className="landing-rise mt-4 max-w-xl break-keep text-[14px] leading-6 text-white/90 sm:mt-5 sm:text-[15px] sm:leading-6"
          style={rise(650)}
        >
          {landingHome.heroBody}
          <br />
          {landingHome.heroSupport}
        </p>

        <div
          className="landing-rise mt-7 flex w-full flex-col items-center justify-center gap-2.5 sm:mt-8 sm:w-auto sm:flex-row sm:gap-3"
          style={rise(800)}
        >
          <LandingMagnetic className="w-full sm:w-auto">
            <Button
              type="button"
              className={cn(
                "landing-btn h-10 w-full px-6 text-[14px] font-semibold sm:w-auto",
                landingTheme.ctaOnDark,
              )}
              onClick={onMore}
            >
              {landingHome.ctaHero}
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
              {landingHome.ctaConsult}
            </Button>
          </LandingMagnetic>
        </div>
      </div>

      <LandingScrollCue />
    </section>
  );
}

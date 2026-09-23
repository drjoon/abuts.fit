// related files:
// - web/frontend/src/pages/public/Index.tsx
// - web/frontend/src/features/landing/landingOffers.ts
// - web/frontend/src/features/landing/landingTheme.ts
// - web/frontend/src/features/landing/LandingEventsSection.tsx
// - web/frontend/src/features/landing/OfferVisual.tsx
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/useAuthStore";
import { resolveEntryDashboardPath } from "@/shared/navigation/lastDashboardPath";
import { cn } from "@/shared/ui/cn";
import { LANDING_HERO_POSTER, LANDING_HERO_VIDEO } from "./landingAssets";
import {
  landingHome,
  landingHomeStories,
  landingContent,
  landingSectionY,
} from "./landingTheme";
import { landingOffers, offerPath } from "./landingOffers";
import { OfferVisual } from "./OfferVisual";
import { LandingEventsSection } from "./LandingEventsSection";

/** `/` 둘러보기. 심플웨이 · 기공사업부 2열. 이벤트는 `#events`. */
const TILE_FRAME = "min-h-[20rem] lg:min-h-[24rem]";

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

function StoryBody({ lines }: { lines: string[] }) {
  return (
    <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600 sm:text-xl sm:leading-8">
      {lines.map((line, index) => (
        <span key={line}>
          {index > 0 ? <br /> : null}
          {line}
        </span>
      ))}
    </p>
  );
}

/** `/` — 히어로 · 오퍼 타일 · 이벤트 · 스토리 밴드. 상세는 `/offer/:slug`. */
export function LandingHome() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const reducedMotion = usePrefersReducedMotion();

  const goStart = () => {
    navigate(isAuthenticated ? resolveEntryDashboardPath(user) : "/signup");
  };

  return (
    <div className="bg-white text-slate-900">
      <div className="h-14 bg-white sm:h-16" aria-hidden />
      <section className="relative flex min-h-[calc(100svh-3.5rem)] items-end overflow-hidden bg-black sm:min-h-[calc(100svh-4rem)]">
        {reducedMotion ? (
          <img
            src={LANDING_HERO_POSTER}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-center"
          />
        ) : (
          <video
            className="absolute inset-0 h-full w-full object-cover object-center"
            autoPlay
            muted
            loop
            playsInline
            poster={LANDING_HERO_POSTER}
            aria-label="심플웨이 시술 키트 영상"
          >
            <source src={LANDING_HERO_VIDEO} type="video/mp4" />
          </video>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-black/25" />
        <div className={cn(landingContent, "relative z-10 pb-14 pt-24 sm:pb-20")}>
          <h1 className="max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl">
            {landingHome.heroTitle}
          </h1>
          <p className="mt-4 max-w-xl text-2xl text-white/95 sm:mt-5 sm:text-3xl">
            {landingHome.heroBody}
          </p>
          <p className="mt-2 max-w-xl text-lg text-white/75 sm:text-xl">
            {landingHome.heroSupport}
          </p>
          <Button
            type="button"
            className="mt-8 h-12 rounded-full bg-white px-7 text-base font-semibold text-slate-900 hover:bg-white/90"
            onClick={goStart}
          >
            {landingHome.ctaStart}
          </Button>
        </div>
      </section>

      <section
        id="browse"
        className="bg-[#f3f4f6] pt-8 pb-12 sm:pt-10 sm:pb-14 lg:pt-12 lg:pb-16"
      >
        <div
          className={cn(
            landingContent,
            "grid grid-cols-1 gap-5 sm:gap-6 lg:grid-cols-2",
          )}
        >
          {landingOffers.map((offer) => {
            const frame = cn(
              "group relative block overflow-hidden rounded-[1.5rem] bg-[#e7e9ee] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900",
              TILE_FRAME,
            );
            return (
              <Link
                key={offer.slug}
                to={offerPath(offer.slug)}
                className={frame}
              >
                <div className="absolute inset-0 transition duration-500 group-hover:scale-[1.02]">
                  <OfferVisual
                    visual={offer.tile}
                    tile
                    className="h-full min-h-0"
                  />
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-6 pb-6 pt-20 sm:px-8 sm:pb-7">
                  <p className="text-base font-medium text-white/85 sm:text-lg">
                    {offer.navLabel}
                  </p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                    {offer.punch}
                  </h2>
                  <p className="mt-2 max-w-md text-base leading-snug text-white/90 sm:text-lg">
                    {offer.line}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <LandingEventsSection />

      <section
        id="stories"
        className={cn("scroll-mt-20 bg-white", landingSectionY.bandLoose)}
      >
        <div className={landingContent}>
          <h2 className="max-w-2xl text-[clamp(2rem,4.2vw,3.25rem)] font-semibold leading-tight tracking-tight text-slate-900">
            {landingHome.storiesHeading}
          </h2>
          <p className="mt-3 max-w-xl text-xl text-slate-600 sm:text-2xl">
            {landingHome.storiesLead}
          </p>

          <div className={cn("mt-14 flex flex-col sm:mt-16", landingSectionY.storyGap)}>
            {landingHomeStories.map((story, index) => {
              const media = (
                <div
                  className={cn(
                    "overflow-hidden rounded-[1.75rem] bg-[#e7e9ee]",
                    landingSectionY.media,
                    index % 2 === 1 && "lg:order-2",
                  )}
                >
                  <img
                    src={story.image.src}
                    alt={story.image.alt}
                    className="h-full w-full object-cover object-center"
                  />
                </div>
              );
              const copy = (
                <div
                  className={cn(
                    index % 2 === 1 ? "lg:pr-2" : "lg:pl-2",
                  )}
                >
                  <h3 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                    {story.title}
                  </h3>
                  <p className="mt-3 text-xl text-slate-600 sm:text-2xl">
                    {story.line}
                  </p>
                  <StoryBody lines={story.body} />
                  {story.href ? (
                    <Link
                      to={story.href}
                      className="mt-6 inline-block text-base font-semibold text-[#1d4ed8] underline-offset-4 hover:underline sm:text-lg"
                    >
                      자세히 보기
                    </Link>
                  ) : null}
                </div>
              );
              return (
                <article
                  key={story.title}
                  className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14"
                >
                  {media}
                  {copy}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-[#f3f4f6]">
        <div
          className={cn(
            landingContent,
            "flex flex-col items-start py-16 sm:py-20 lg:flex-row lg:items-end lg:justify-between lg:gap-10",
          )}
        >
          <div className="max-w-xl">
            <h2 className="text-[clamp(2rem,4vw,3rem)] font-semibold tracking-tight text-slate-900">
              {landingHome.ctaBandTitle}
            </h2>
            <StoryBody lines={[...landingHome.ctaBandBody]} />
          </div>
          <Button
            type="button"
            className="mt-8 h-12 shrink-0 rounded-full bg-[#2563eb] px-8 text-base font-semibold text-white hover:bg-[#1d4ed8] lg:mt-0"
            onClick={goStart}
          >
            {landingHome.ctaStart}
          </Button>
        </div>
      </section>
    </div>
  );
}

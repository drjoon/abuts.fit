// related files:
// - web/frontend/src/pages/public/Index.tsx
// - web/frontend/src/features/landing/landingOffers.ts
// - web/frontend/src/features/landing/landingTheme.ts
// - web/frontend/src/features/landing/OfferVisual.tsx
// - web/frontend/src/shared/sales/PlatformPitchPanel.tsx
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/useAuthStore";
import { resolveEntryDashboardPath } from "@/shared/navigation/lastDashboardPath";
import { PlatformPitchPanel } from "@/shared/sales/PlatformPitchPanel";
import { cn } from "@/shared/ui/cn";
import { LANDING_HERO_POSTER, LANDING_HERO_VIDEO } from "./landingAssets";
import { landingHome, landingContent } from "./landingTheme";
import { landingOffers, offerPath } from "./landingOffers";
import { OfferVisual } from "./OfferVisual";

/** `/` 둘러보기. 플랫폼 1열, 나머지 3열. */
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

/** `/` — 큰 이미지 4장. 설명은 `/offer/:slug`. */
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

      <section id="browse" className="bg-[#f3f4f6] pt-4 pb-8 sm:pt-5 sm:pb-10 lg:pt-6 lg:pb-12">
        <div className={cn(landingContent, "grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-3")}>
        {landingOffers.map((offer) => {
          const frame = cn(
            "group relative block overflow-hidden rounded-[1.5rem] bg-[#e7e9ee] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900",
            TILE_FRAME,
            offer.slug === "platform" && "lg:col-span-3 h-[22rem] sm:h-[26rem] lg:h-[32rem] lg:min-h-0",
          );
          const caption = (
            <>
              <p className="text-base font-medium text-white/85 sm:text-lg">
                {offer.navLabel}
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                {offer.punch}
              </h2>
              <p className="mt-2 max-w-md text-base leading-snug text-white/90 sm:text-lg">
                {offer.line}
              </p>
            </>
          );
          const captionClass =
            "absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-6 pb-6 pt-20 sm:px-8 sm:pb-7";

          if (offer.slug === "platform") {
            return (
              <div key={offer.slug} className={frame}>
                <OfferVisual visual={offer.tile} tile className="h-full min-h-0" />
                <Link to={offerPath(offer.slug)} className={captionClass}>
                  {caption}
                </Link>
              </div>
            );
          }

          return (
          <Link
            key={offer.slug}
            to={offerPath(offer.slug)}
            className={frame}
          >
            <div className="absolute inset-0 transition duration-500 group-hover:scale-[1.02]">
              <OfferVisual visual={offer.tile} tile className="h-full min-h-0" />
            </div>
            <div className={cn(captionClass, "pointer-events-none")}>{caption}</div>
          </Link>
          );
        })}
        </div>
      </section>

      {/* 영업팀·딜러 소개·피치와 동일 UI (공개 통계) */}
      <section
        id="pitch"
        className="scroll-mt-20 border-t border-slate-200/80 bg-white sm:scroll-mt-24"
      >
        <div className={cn(landingContent, "py-10 sm:py-12 lg:py-14")}>
          <PlatformPitchPanel
            apiPath="/api/system/platform-pitch"
            queryKey="public-platform-pitch"
          />
        </div>
      </section>
    </div>
  );
}

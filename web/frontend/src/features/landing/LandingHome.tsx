// related files:
// - web/frontend/src/pages/public/Index.tsx
// - web/frontend/src/features/landing/landingOffers.ts
// - web/frontend/src/features/landing/landingTheme.ts
// - web/frontend/src/features/landing/OfferVisual.tsx
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/useAuthStore";
import { resolveEntryDashboardPath } from "@/shared/navigation/lastDashboardPath";
import { cn } from "@/shared/ui/cn";
import { LANDING_HERO_POSTER, LANDING_HERO_VIDEO } from "./landingAssets";
import { landingHome } from "./landingTheme";
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
      <section className="relative flex min-h-[72vh] items-end overflow-hidden bg-black">
        {reducedMotion ? (
          <img
            src={LANDING_HERO_POSTER}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <video
            className="absolute inset-0 h-full w-full object-cover"
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
        <div className="relative z-10 w-full px-6 pb-12 pt-28 sm:px-10 sm:pb-16 lg:px-16">
          <h1 className="max-w-3xl text-4xl font-semibold leading-[1.15] tracking-tight text-white sm:text-6xl">
            {landingHome.heroTitle}
          </h1>
          <p className="mt-6 max-w-xl text-lg text-white/90 sm:mt-8 sm:text-xl">
            {landingHome.heroBody}
          </p>
          <p className="mt-4 max-w-xl text-lg text-white/80 sm:mt-5 sm:text-xl">
            {landingHome.heroSupport}
          </p>
          <Button
            type="button"
            className="mt-8 h-11 rounded-full bg-white px-6 text-sm font-semibold text-slate-900 hover:bg-white/90"
            onClick={goStart}
          >
            {landingHome.ctaStart}
          </Button>
        </div>
      </section>

      <section
        id="browse"
        className="grid grid-cols-1 gap-5 bg-[#f3f4f6] px-4 py-6 sm:gap-6 sm:px-6 sm:py-8 lg:grid-cols-3 lg:px-10 lg:py-10"
      >
        {landingOffers.map((offer) => (
          <Link
            key={offer.slug}
            to={offerPath(offer.slug)}
            className={cn(
              "group relative block overflow-hidden rounded-[1.5rem] bg-[#e7e9ee] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900",
              TILE_FRAME,
              offer.slug === "platform" && "lg:col-span-3 lg:min-h-[28rem]",
            )}
          >
            <div className="absolute inset-0 transition duration-500 group-hover:scale-[1.02]">
              <OfferVisual visual={offer.tile} tile className="h-full min-h-0" />
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-5 pb-5 pt-20">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-white/80">
                {offer.navLabel}
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">
                {offer.punch}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-white/90">
                {offer.line}
              </p>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}

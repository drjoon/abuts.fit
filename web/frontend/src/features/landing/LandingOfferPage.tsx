// related files:
// - web/frontend/src/pages/public/OfferPage.tsx
// - web/frontend/src/features/landing/landingOffers.ts
// - web/frontend/src/features/landing/OfferVisual.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Crown,
  FileText,
  Play,
  Receipt,
  ScanLine,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Truck,
  Wrench,
} from "lucide-react";
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
import { LANDING_HERO_POSTER, LANDING_HERO_VIDEO } from "./landingAssets";
import { OfferVisual } from "./OfferVisual";
import {
  type LandingOffer,
  type OfferBuy,
  type OfferIcon,
  type OfferVisual as OfferVisualModel,
} from "./landingOffers";

const ICONS: Record<OfferIcon, typeof FileText> = {
  request: FileText,
  start: Play,
  pay: Receipt,
  ship: Truck,
  store: ShoppingBag,
  scan: ScanLine,
  healing: Sparkles,
  abutment: Box,
  kit: Wrench,
  crown: Crown,
  cnc: Cpu,
  lab: Crown,
  quality: ShieldCheck,
  box: Box,
};

const ONE =
  "whitespace-nowrap tracking-tight";

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

function MediaFrame({
  visual,
  video,
  reduced,
  drift,
  className,
}: {
  visual: OfferVisualModel;
  video?: boolean;
  reduced: boolean;
  drift?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative h-full w-full overflow-hidden bg-[#e7e9ee]", className)}>
      {video && !reduced ? (
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
      ) : (
        <div
          className={cn(
            "absolute inset-0",
            drift && !reduced && "offer-hero-drift",
          )}
        >
          {video && reduced ? (
            <img
              src={LANDING_HERO_POSTER}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <OfferVisual visual={visual} fill className="h-full min-h-0" />
          )}
        </div>
      )}
    </div>
  );
}

function ProductCards({
  products,
  onBuy,
}: {
  products: NonNullable<LandingOffer["products"]>;
  onBuy: (buy: OfferBuy) => void;
}) {
  return (
    <section id="buy" className="scroll-mt-20 bg-[#f3f4f6] px-4 py-24 sm:px-8 sm:py-32 lg:px-12">
      <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-2 md:gap-8">
        {products.map((product) => (
          <article
            key={product.name}
            className="flex flex-col overflow-hidden rounded-[2rem] bg-white"
          >
            <div className="h-64 bg-[#eef1f6] sm:h-72">
              <OfferVisual visual={product.visual} fill className="h-full min-h-0" />
            </div>
            <div className="flex flex-1 flex-col px-7 py-8 sm:px-10 sm:py-10">
              <h2 className={cn(ONE, "text-3xl font-semibold text-slate-900")}>
                {product.name}
              </h2>
              <p className={cn(ONE, "mt-2 text-base text-slate-600")}>{product.line}</p>
              <p className={cn(ONE, "mt-8 text-3xl font-semibold tabular-nums text-slate-900")}>
                {product.price}
              </p>
              <p className={cn(ONE, "mt-1 text-sm text-slate-500")}>{product.priceNote}</p>
              <Button
                type="button"
                className="mt-8 h-12 w-full rounded-full bg-[#2563eb] text-sm font-semibold text-white hover:bg-[#1d4ed8]"
                onClick={() => onBuy(product.buy)}
              >
                {product.buy.label}
              </Button>
              <ul className="mt-8 space-y-2.5 border-t border-slate-100 pt-6">
                {product.specs.map((spec) => (
                  <li key={spec} className={cn(ONE, "text-sm text-slate-700")}>
                    {spec}
                  </li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function StoryCards({
  stories,
}: {
  stories: NonNullable<LandingOffer["stories"]>;
}) {
  return (
    <section className="bg-[#f3f4f6] px-4 py-24 sm:px-8 sm:py-32 lg:px-12">
      <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-2 md:gap-8">
        {stories.map((story) => (
          <article
            key={story.name}
            className="flex flex-col overflow-hidden rounded-[2rem] bg-white"
          >
            {story.visual ? (
              <div className="h-64 bg-[#eef1f6] sm:h-80">
                <OfferVisual visual={story.visual} fill className="h-full min-h-0" />
              </div>
            ) : null}
            <div className="flex flex-1 flex-col px-7 py-8 sm:px-10 sm:py-10">
              <h2 className={cn(ONE, "text-3xl font-semibold text-slate-900")}>
                {story.name}
              </h2>
              <p className={cn(ONE, "mt-2 text-base text-slate-600")}>{story.line}</p>
              <ul className="mt-8 space-y-2.5">
                {story.points.map((point) => (
                  <li key={point} className={cn(ONE, "text-sm text-slate-700")}>
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Slideshow({
  heading,
  slides,
  slug,
  reduced,
}: {
  heading: string;
  slides: NonNullable<LandingOffer["slides"]>;
  slug: string;
  reduced: boolean;
}) {
  const [index, setIndex] = useState(0);
  const count = slides.length;

  useEffect(() => {
    setIndex(0);
  }, [slug]);

  useEffect(() => {
    if (reduced || count < 2) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % count);
    }, 6500);
    return () => window.clearInterval(id);
  }, [reduced, count, slug]);

  const slide = slides[index];
  if (!slide) return null;

  const go = (next: number) => {
    setIndex((next + count) % count);
  };

  return (
    <section className="bg-white px-4 py-24 sm:px-8 sm:py-32 lg:px-12" aria-roledescription="carousel">
      <div className="mx-auto max-w-6xl">
        <h2 className={cn(ONE, "text-center text-[clamp(1.75rem,4vw,3rem)] font-semibold text-slate-900")}>
          {heading}
        </h2>
        <div className="relative mt-14 overflow-hidden rounded-[2rem] bg-[#e7e9ee]">
          <div className="h-[22rem] sm:h-[28rem]">
            <MediaFrame visual={slide.visual} reduced={reduced} />
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-6 pb-8 pt-24 sm:px-10">
            <p className={cn(ONE, "text-2xl font-semibold text-white sm:text-4xl")}>
              {slide.title}
            </p>
            <p className={cn(ONE, "mt-2 text-sm text-white/90 sm:text-base")}>{slide.line}</p>
          </div>
          <button
            type="button"
            className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-sm hover:bg-white"
            aria-label="이전 슬라이드"
            onClick={() => go(index - 1)}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-sm hover:bg-white"
            aria-label="다음 슬라이드"
            onClick={() => go(index + 1)}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-6 flex justify-center gap-2">
          {slides.map((item, dot) => (
            <button
              key={item.title}
              type="button"
              aria-label={`${dot + 1}번째 슬라이드`}
              aria-current={dot === index}
              className={cn(
                "h-2.5 rounded-full transition-all",
                dot === index ? "w-8 bg-slate-900" : "w-2.5 bg-slate-300",
              )}
              onClick={() => setIndex(dot)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export function LandingOfferPage({ offer }: { offer: LandingOffer }) {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const reduced = usePrefersReducedMotion();

  const onBuy = (buy: OfferBuy) => {
    if (buy.kind === "store") {
      if (isAuthenticated && user?.role === "requestor") {
        navigate(`/dashboard/store/${buy.productId}`);
        return;
      }
      navigate(isAuthenticated ? resolveEntryDashboardPath(user) : "/signup");
      return;
    }
    navigate(isAuthenticated ? resolveEntryDashboardPath(user) : "/signup");
  };

  return (
    <div className="bg-white text-slate-900">
      <section className="bg-[#f4f5f7]">
        <div className="relative h-[68vh] min-h-[26rem] overflow-hidden">
          <MediaFrame
            visual={offer.tile}
            video={offer.hero === "video"}
            reduced={reduced}
            drift={offer.hero !== "video" && offer.tile.kind !== "slideshow"}
          />
        </div>
        <div className="px-6 pb-24 pt-16 text-center sm:px-10 sm:pb-32 sm:pt-20">
          <p className="text-xs font-semibold tracking-[0.22em] text-slate-500">
            {offer.navLabel}
          </p>
          <h1
            className={cn(
              ONE,
              "mt-8 text-[clamp(2rem,6.2vw,4.75rem)] font-semibold leading-[1.15] text-slate-900 sm:mt-10",
            )}
          >
            {offer.heroTitle}
          </h1>
          <p
            className={cn(
              ONE,
              "mt-8 text-[clamp(1.05rem,2.2vw,1.5rem)] text-slate-600 sm:mt-10",
            )}
          >
            {offer.line}
          </p>
          {offer.cta ? (
            <Button
              type="button"
              className="mt-12 h-12 rounded-full bg-[#2563eb] px-8 text-sm font-semibold text-white hover:bg-[#1d4ed8] sm:mt-14"
              onClick={() => {
                if (offer.cta) onBuy(offer.cta);
              }}
            >
              {offer.cta.label}
            </Button>
          ) : null}
          {offer.products ? (
            <div className="mt-12 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 sm:mt-14">
              {offer.products.map((product) => (
                <a
                  key={product.name}
                  href="#buy"
                  className={cn(
                    ONE,
                    "text-sm font-semibold text-[#1d4ed8] underline-offset-4 hover:underline",
                  )}
                >
                  {product.name}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {offer.highlights ? (
        <section className="bg-white px-4 py-20 sm:px-8 sm:py-28 lg:px-12">
          <div className="mx-auto max-w-6xl">
            <div
              className={cn(
                "-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:gap-5 lg:overflow-visible lg:px-0",
                offer.highlights.length >= 5
                  ? "lg:grid-cols-5"
                  : "lg:grid-cols-4",
              )}
            >
              {offer.highlights.slice(0, 5).map((item) => {
                const Icon = ICONS[item.icon];
                return (
                  <article
                    key={item.label}
                    className="w-[13.75rem] shrink-0 snap-start rounded-[1.5rem] bg-[#f4f5f7] px-5 py-8 lg:w-auto"
                  >
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-900">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <h2 className={cn(ONE, "mt-6 text-lg font-semibold text-slate-900")}>
                      {item.label}
                    </h2>
                    <p className={cn(ONE, "mt-2 text-sm text-slate-600")}>{item.line}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      {offer.scene ? (
        <section className="bg-white px-4 py-16 sm:px-8 sm:py-24 lg:px-12">
          <div className="mx-auto max-w-6xl text-center">
            <h2
              className={cn(
                ONE,
                "text-[clamp(1.75rem,4.2vw,3.25rem)] font-semibold text-slate-900",
              )}
            >
              {offer.scene.title}
            </h2>
            <p className={cn(ONE, "mt-4 text-base text-slate-600 sm:text-lg")}>
              {offer.scene.line}
            </p>
            <div className="mt-14 h-[24rem] overflow-hidden rounded-[2rem] sm:mt-16 sm:h-[32rem]">
              <MediaFrame visual={offer.scene.visual} reduced={reduced} />
            </div>
          </div>
        </section>
      ) : null}

      {offer.products ? (
        <ProductCards products={offer.products} onBuy={onBuy} />
      ) : null}
      {offer.stories ? <StoryCards stories={offer.stories} /> : null}
      {offer.slides ? (
        <Slideshow
          heading={offer.slideHeading ?? "키트도 함께."}
          slides={offer.slides}
          slug={offer.slug}
          reduced={reduced}
        />
      ) : null}

      {offer.specs ? (
        <section className="bg-[#f3f4f6] px-6 py-24 sm:px-10 sm:py-32">
          <div className="mx-auto max-w-6xl">
            <h2
              className={cn(
                ONE,
                "text-center text-[clamp(1.75rem,4vw,3rem)] font-semibold text-slate-900",
              )}
            >
              간단히 보는 스펙.
            </h2>
            <dl className="mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
              {offer.specs.map((spec) => (
                <div key={spec.label} className="text-center">
                  <dt className={cn(ONE, "text-sm text-slate-500")}>{spec.label}</dt>
                  <dd className={cn(ONE, "mt-3 text-xl font-semibold text-slate-900")}>
                    {spec.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      ) : null}

      {offer.faq ? (
        <section className="bg-white px-6 py-24 sm:px-10 sm:pb-28">
          <div className="mx-auto max-w-3xl">
            <h2
              className={cn(
                ONE,
                "text-center text-[clamp(1.75rem,4vw,3rem)] font-semibold text-slate-900",
              )}
            >
              FAQ
            </h2>
            <Accordion type="single" collapsible className="mt-12">
              {offer.faq.map((item) => (
                <AccordionItem key={item.q} value={item.q} className="border-slate-200">
                  <AccordionTrigger className="py-5 text-left text-base font-semibold text-slate-900 hover:no-underline">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-base leading-7 text-slate-600">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>
      ) : null}
    </div>
  );
}

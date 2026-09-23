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
import { landingContent, landingSectionY } from "./landingTheme";
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

const ONE = "tracking-tight";

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
          className="absolute inset-0 h-full w-full object-cover object-top"
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
              className="h-full w-full object-cover object-top"
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
    <section id="buy" className={cn("scroll-mt-20 bg-[#f3f4f6]", landingSectionY.band)}>
      <div className={cn(landingContent, "grid gap-6 md:grid-cols-2 lg:gap-8")}>
        {products.map((product, index) => (
          <article
            key={product.name}
            className={cn(
              "flex flex-col overflow-hidden rounded-[2rem] bg-white",
              index === 0 && "md:mt-6",
            )}
          >
            <div className="h-64 bg-[#eef1f6] sm:h-72">
              <OfferVisual visual={product.visual} fill className="h-full min-h-0" />
            </div>
            <div className="flex flex-1 flex-col px-7 pt-6 pb-8 sm:px-10 sm:pt-8 sm:pb-10">
              <h2 className={cn(ONE, "text-4xl font-semibold text-slate-900")}>
                {product.name}
              </h2>
              <p className={cn(ONE, "mt-2 text-xl text-slate-600")}>{product.line}</p>
              <p className={cn(ONE, "mt-8 text-4xl font-semibold tabular-nums text-slate-900")}>
                {product.price}
              </p>
              <p className={cn(ONE, "mt-1 text-base text-slate-500")}>{product.priceNote}</p>
              <Button
                type="button"
                className="mt-6 h-12 w-full rounded-full bg-[#2563eb] text-base font-semibold text-white hover:bg-[#1d4ed8]"
                onClick={() => onBuy(product.buy)}
              >
                {product.buy.label}
              </Button>
              <ul className="mt-8 space-y-3 border-t border-slate-100 pt-6">
                {product.specs.map((spec) => (
                  <li key={spec} className={cn(ONE, "text-lg text-slate-800")}>
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

function StoryBody({ lines }: { lines: string[] }) {
  return (
    <p
      className={cn(
        ONE,
        "mt-5 max-w-xl text-lg leading-relaxed text-slate-600 sm:text-xl sm:leading-8",
      )}
    >
      {lines.map((line, index) => (
        <span key={line}>
          {index > 0 ? <br /> : null}
          {line}
        </span>
      ))}
    </p>
  );
}

function StoryRows({
  stories,
}: {
  stories: NonNullable<LandingOffer["stories"]>;
}) {
  return (
    <section className={cn("bg-[#f3f4f6]", landingSectionY.band)}>
      <div className={landingContent}>
        <div className={cn("flex flex-col", landingSectionY.storyGap)}>
          {stories.map((story, index) => (
            <article
              key={story.name}
              className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14"
            >
              {story.visual ? (
                <div
                  className={cn(
                    "overflow-hidden rounded-[1.75rem] bg-[#e7e9ee]",
                    landingSectionY.media,
                    index % 2 === 1 && "lg:order-2",
                  )}
                >
                  <OfferVisual
                    visual={story.visual}
                    fill
                    className="h-full min-h-0"
                  />
                </div>
              ) : null}
              <div
                className={cn(
                  story.visual
                    ? index % 2 === 1
                      ? "lg:pr-2"
                      : "lg:pl-2"
                    : "max-w-2xl lg:col-span-2",
                )}
              >
                <h3
                  className={cn(
                    ONE,
                    "text-3xl font-semibold text-slate-900 sm:text-4xl",
                  )}
                >
                  {story.name}
                </h3>
                <p
                  className={cn(
                    ONE,
                    "mt-3 text-xl text-slate-600 sm:text-2xl",
                  )}
                >
                  {story.line}
                </p>
                {story.body?.length ? <StoryBody lines={story.body} /> : null}
                {story.points?.length ? (
                  <ul className="mt-6 space-y-2.5">
                    {story.points.map((point) => (
                      <li
                        key={point}
                        className={cn(
                          ONE,
                          "text-base text-slate-700 sm:text-lg",
                        )}
                      >
                        {point}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </article>
          ))}
        </div>
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
    <section className={cn("bg-white", landingSectionY.bandLoose)} aria-roledescription="carousel">
      <div className={landingContent}>
        <h2 className={cn(ONE, "max-w-xl text-[clamp(2rem,4.2vw,3.25rem)] font-semibold leading-tight text-slate-900")}>
          {heading}
        </h2>
        <div className="relative mt-8 overflow-hidden rounded-[2rem] bg-[#e7e9ee] sm:mt-10">
          <div className={landingSectionY.media}>
            <MediaFrame visual={slide.visual} reduced={reduced} />
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-6 pb-6 pt-20 sm:px-10 sm:pb-8">
            <p className={cn(ONE, "text-2xl font-semibold text-white sm:text-4xl")}>
              {slide.title}
            </p>
            <p className={cn(ONE, "mt-2 text-lg text-white/90 sm:text-xl")}>{slide.line}</p>
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
        <div className="mt-5 flex justify-center gap-2">
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

function HeroCopy({
  offer,
  onBuy,
  onDark = false,
}: {
  offer: LandingOffer;
  onBuy: (buy: OfferBuy) => void;
  onDark?: boolean;
}) {
  return (
    <div>
      <p
        className={cn(
          "text-2xl font-medium sm:text-3xl",
          onDark ? "text-white/85" : "text-slate-500",
        )}
      >
        {offer.navLabel}
      </p>
      <h1
        className={cn(
          ONE,
          "mt-2 text-[clamp(2.6rem,5vw,4.25rem)] font-semibold leading-[1.08]",
          onDark ? "text-white" : "text-slate-900",
        )}
      >
        {offer.heroTitle}
      </h1>
      <p
        className={cn(
          ONE,
          "mt-4 max-w-xl text-xl leading-snug sm:text-2xl",
          onDark ? "text-white/90" : "text-slate-600",
        )}
      >
        {offer.line}
      </p>
      {offer.cta ? (
        <Button
          type="button"
          className={cn(
            "mt-7 h-12 rounded-full px-8 text-base font-semibold",
            onDark
              ? "bg-white text-slate-900 hover:bg-white/90"
              : "bg-[#2563eb] text-white hover:bg-[#1d4ed8]",
          )}
          onClick={() => {
            if (offer.cta) onBuy(offer.cta);
          }}
        >
          {offer.cta.label}
        </Button>
      ) : null}
      {offer.products ? (
        <div className="mt-8 flex flex-wrap gap-x-8 gap-y-2">
          {offer.products.map((product) => (
            <a
              key={product.name}
              href="#buy"
              className={cn(
                ONE,
                "text-lg font-semibold underline-offset-4 hover:underline",
                onDark ? "text-white" : "text-[#1d4ed8]",
              )}
            >
              {product.name}
            </a>
          ))}
        </div>
      ) : null}
    </div>
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

  const heroVisual = offer.pageVisual ?? offer.tile;
  const fullBleedHero = offer.hero === "video" || offer.hero === "photo";

  return (
    <div className="bg-white text-slate-900">
      {fullBleedHero ? (
        <section className="bg-black">
          <div className="h-14 bg-white sm:h-16" aria-hidden />
          <div className="relative min-h-[calc(100svh-3.5rem)] sm:min-h-[calc(100svh-4rem)]">
            <div className="absolute inset-0">
              <MediaFrame
                visual={heroVisual}
                video={offer.hero === "video"}
                reduced={reduced}
                drift={offer.hero === "photo"}
                className="h-full"
              />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/25" />
            <div className={cn(landingContent, "relative flex min-h-[calc(100svh-3.5rem)] items-end pb-10 pt-8 sm:min-h-[calc(100svh-4rem)] sm:pb-14")}>
              <HeroCopy offer={offer} onBuy={onBuy} onDark />
            </div>
          </div>
        </section>
      ) : (
        <section className="bg-[#f4f5f7]">
          <div className="h-14 sm:h-16" aria-hidden />
          <div className={cn(landingContent, "grid items-center lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-8")}>
            <div className="flex flex-col pt-4 pb-6 lg:py-6">
              <HeroCopy offer={offer} onBuy={onBuy} />
            </div>
            <div className="pb-4 lg:py-4">
              <div className="h-[min(56vh,34rem)] w-full overflow-hidden rounded-[1.75rem] bg-[#e7e9ee] lg:h-[min(64vh,40rem)] lg:rounded-[2rem]">
                <MediaFrame
                  visual={heroVisual}
                  reduced={reduced}
                  drift={heroVisual.kind !== "slideshow"}
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {offer.highlights ? (
        <section className={cn("bg-white", landingSectionY.band)}>
          <div className={landingContent}>
            <h2
              className={cn(
                ONE,
                "max-w-3xl text-[clamp(2rem,4.5vw,3.5rem)] font-semibold leading-[1.1] text-slate-900",
              )}
            >
              {offer.lead}
            </h2>
            <div className="mt-10 grid gap-x-6 gap-y-8 border-t border-slate-200/80 pt-10 sm:mt-12 sm:grid-cols-2 sm:pt-12 lg:grid-cols-5">
              {offer.highlights.slice(0, 5).map((item) => {
                const Icon = ICONS[item.icon];
                return (
                  <article key={item.label} className="min-w-0">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f4f5f7] text-slate-900">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <h3
                      className={cn(
                        ONE,
                        "mt-4 text-xl font-semibold text-slate-900",
                      )}
                    >
                      {item.label}
                    </h3>
                    <p className={cn(ONE, "mt-1.5 text-base text-slate-600")}>
                      {item.line}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      {offer.scene ? (
        <section className={cn("relative bg-[#e7e9ee]", landingSectionY.sceneMin)}>
          <div className="absolute inset-0">
            <MediaFrame visual={offer.scene.visual} reduced={reduced} />
          </div>
          <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/35 to-transparent" />
          <div className={cn("relative flex items-end pb-10 sm:pb-12", landingSectionY.sceneMin)}>
            <div className={landingContent}>
            <div className="max-w-xl">
              <h2
                className={cn(
                  ONE,
                  "text-[clamp(2.25rem,5vw,4rem)] font-semibold leading-[1.08] text-white",
                )}
              >
                {offer.scene.title}
              </h2>
              <p className={cn(ONE, "mt-3 text-xl text-white/90 sm:text-2xl")}>
                {offer.scene.line}
              </p>
            </div>
            </div>
          </div>
        </section>
      ) : null}

      {offer.products ? (
        <ProductCards products={offer.products} onBuy={onBuy} />
      ) : null}
      {offer.stories ? (
        <StoryRows stories={offer.stories} />
      ) : null}
      {offer.slides ? (
        <Slideshow
          heading={offer.slideHeading ?? "키트도 함께."}
          slides={offer.slides}
          slug={offer.slug}
          reduced={reduced}
        />
      ) : null}

      {offer.specs ? (
        <section className={cn("bg-[#f3f4f6]", landingSectionY.band)}>
          <div className={landingContent}>
            <h2
              className={cn(
                ONE,
                "max-w-xl text-[clamp(2rem,4vw,3.25rem)] font-semibold text-slate-900",
              )}
            >
              간단히 보는 스펙.
            </h2>
            <dl className="mt-8 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:mt-10 lg:grid-cols-4">
              {offer.specs.map((spec, index) => (
                <div key={spec.label} className={cn(index === 0 && "lg:pt-1")}>
                  <dt className={cn(ONE, "text-base text-slate-500")}>{spec.label}</dt>
                  <dd className={cn(ONE, "mt-1.5 text-2xl font-semibold text-slate-900")}>
                    {spec.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      ) : null}

      {offer.faq ? (
        <section className={cn("bg-white", landingSectionY.bandLoose)}>
          <div className={cn(landingContent, "grid gap-6 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:gap-12")}>
            <div>
              <h2
                className={cn(
                  ONE,
                  "text-[clamp(2.5rem,5vw,4rem)] font-semibold text-slate-900",
                )}
              >
                FAQ
              </h2>
              <p className="mt-3 max-w-xs text-lg leading-snug text-slate-600">
                {offer.navLabel}에서 먼저 묻는 것만.
              </p>
            </div>
            <Accordion type="single" collapsible>
              {offer.faq.map((item) => (
                <AccordionItem key={item.q} value={item.q} className="border-slate-200">
                  <AccordionTrigger className="py-5 text-left text-lg font-semibold text-slate-900 hover:no-underline sm:text-xl">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="pb-5 text-lg leading-8 text-slate-600">
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

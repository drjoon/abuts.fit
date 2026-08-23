// related files:
// - web/frontend/src/pages/public/Index.tsx
// - web/frontend/src/shared/store/storeCatalog.ts
import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/shared/ui/cn";
import {
  STORE_SLIDES,
  getStoreSlideTheme,
} from "@/shared/store/storeCatalog";
import { landingTheme } from "./landingTheme";

const AUTOPLAY_MS = 5500;

export const LandingStoreShowcase = () => {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, duration: 32 });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  const scrollTo = useCallback(
    (index: number) => emblaApi?.scrollTo(index),
    [emblaApi],
  );

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;

    const onSelect = () => {
      setSelectedIndex(emblaApi.selectedScrollSnap());
      setProgress(0);
    };
    onSelect();
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    const timer = window.setInterval(() => emblaApi.scrollNext(), AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [emblaApi]);

  useEffect(() => {
    const start = Date.now();
    const tick = window.setInterval(() => {
      const elapsed = Date.now() - start;
      setProgress(Math.min(100, (elapsed / AUTOPLAY_MS) * 100));
    }, 50);
    return () => window.clearInterval(tick);
  }, [selectedIndex]);

  const scrollToDetails = () => {
    document
      .getElementById("platform-details")
      ?.scrollIntoView({ behavior: "smooth" });
  };

  const activeTheme = getStoreSlideTheme(
    STORE_SLIDES[selectedIndex]?.categoryId ?? "",
  );

  return (
    <section
      id="store"
      className="relative min-h-[min(100vh,900px)] overflow-hidden border-t border-white/[0.06]"
    >
      <div ref={emblaRef} className="h-full min-h-[min(100vh,900px)]">
        <div className="flex h-full min-h-[min(100vh,900px)]">
          {STORE_SLIDES.map((slide, index) => {
            const theme = getStoreSlideTheme(slide.categoryId);
            const isActive = index === selectedIndex;
            const scale = slide.imageScale ?? 1;

            return (
              <div
                key={slide.id}
                className="relative min-w-0 shrink-0 grow-0 basis-full"
              >
                <div className="relative z-10 mx-auto flex h-full min-h-[min(100vh,900px)] max-w-6xl flex-col justify-center px-4 py-14 sm:px-6 sm:py-16 lg:grid lg:grid-cols-2 lg:items-center lg:gap-14 lg:py-20">
                  <div
                    className={cn(
                      "space-y-5 text-center transition-all duration-700 ease-out lg:text-left",
                      isActive
                        ? "translate-y-0 opacity-100"
                        : "translate-y-6 opacity-0",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex rounded-full px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.3em]",
                        landingTheme.glass,
                        theme.accent,
                      )}
                    >
                      {slide.categoryLabel}
                    </span>
                    <h2 className="text-2xl font-semibold uppercase tracking-wide text-white sm:text-3xl md:text-5xl">
                      {slide.name}
                    </h2>
                    <p className="mx-auto max-w-md text-base leading-relaxed text-white/70 lg:mx-0 md:text-lg">
                      {slide.blurb}
                    </p>
                  </div>

                  <div
                    className={cn(
                      "relative mt-10 flex items-center justify-center transition-all duration-700 ease-out lg:mt-0",
                      isActive
                        ? "translate-y-0 scale-100 opacity-100"
                        : "translate-y-8 scale-[0.96] opacity-0",
                    )}
                  >
                    <div
                      className={cn(
                        "pointer-events-none absolute inset-0 m-auto h-48 w-48 rounded-full blur-3xl transition-opacity duration-700 lg:h-56 lg:w-56",
                        theme.glow,
                        isActive ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div
                      className={cn(
                        landingTheme.imageFrame,
                        "ring-1",
                        theme.ring,
                      )}
                    >
                      <div
                        className={cn(
                          landingTheme.imageInner,
                          "p-6 lg:p-10",
                          isActive && "animate-landing-float",
                        )}
                      >
                        <img
                          src={slide.image}
                          alt={slide.name}
                          className="mx-auto h-44 w-full max-w-sm object-contain lg:h-56"
                          style={
                            scale !== 1
                              ? {
                                  transform: `scale(${scale})`,
                                  transformOrigin: "center",
                                }
                              : undefined
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-12 sm:pb-8 sm:pt-16">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-5">
          <div className="h-0.5 w-full max-w-md overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className={cn("h-full rounded-full", activeTheme.progress)}
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {STORE_SLIDES.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => scrollTo(index)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider transition-all duration-300",
                  index === selectedIndex
                    ? cn(
                        "border border-white/20 bg-white/10 text-white",
                        getStoreSlideTheme(slide.categoryId).accent,
                      )
                    : "border border-transparent text-white/40 hover:bg-white/[0.05] hover:text-white/70",
                )}
              >
                {slide.name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={scrollPrev}
              className={`flex h-10 w-10 items-center justify-center ${landingTheme.ctaGhost}`}
              aria-label="이전 상품"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="min-w-[3rem] text-center text-xs tabular-nums text-white/45">
              {String(selectedIndex + 1).padStart(2, "0")} /{" "}
              {String(STORE_SLIDES.length).padStart(2, "0")}
            </span>
            <button
              type="button"
              onClick={scrollNext}
              className={`flex h-10 w-10 items-center justify-center ${landingTheme.ctaGhost}`}
              aria-label="다음 상품"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <button
            type="button"
            onClick={scrollToDetails}
            className="group flex flex-col items-center gap-1 text-white/40 transition hover:text-white/70"
            aria-label="자세히 보기"
          >
            <span className="text-[10px] uppercase tracking-[0.35em]">More</span>
            <ChevronDown className="h-5 w-5 transition group-hover:translate-y-0.5" />
          </button>
        </div>
      </div>
    </section>
  );
};

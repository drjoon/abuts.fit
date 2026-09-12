// related files:
// - web/frontend/src/pages/public/Index.tsx
// - web/frontend/src/shared/store/storeCatalog.ts
import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/ui/cn";
import {
  STORE_SLIDES,
  getStoreSlideTheme,
} from "@/shared/store/storeCatalog";
import { landingTheme } from "./landingTheme";

const AUTOPLAY_MS = 6000;

export const LandingStoreShowcase = () => {
  const navigate = useNavigate();
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, duration: 28 });
  const [selectedIndex, setSelectedIndex] = useState(0);

  const scrollTo = useCallback(
    (index: number) => emblaApi?.scrollTo(index),
    [emblaApi],
  );
  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
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

  const active = STORE_SLIDES[selectedIndex];

  return (
    <section id="store" className="relative border-t border-white/[0.06]">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p
            className={`inline-flex rounded-full px-3.5 py-1 text-[11px] tracking-[0.18em] text-white/55 ${landingTheme.glass}`}
          >
            ECOSYSTEM
          </p>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            시술 키트도 같은 흐름 안에
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/60 sm:text-base">
            커스텀 제작과 함께 쓰는 시술·키트. 가입 후 스토어에서 이어집니다.
          </p>
        </div>

        <div
          className={cn(
            "mt-8 overflow-hidden p-4 sm:mt-10 sm:p-6 lg:p-8",
            landingTheme.panel,
          )}
        >
          <div className="grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
            <div className="min-w-0 space-y-4 text-center lg:text-left">
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/40">
                {active?.categoryLabel}
              </p>
              <h3 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                {active?.name}
              </h3>
              <p className="mx-auto max-w-md text-sm leading-relaxed text-white/60 lg:mx-0">
                {active?.blurb}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1 lg:justify-start">
                <Button
                  className={`h-10 px-5 ${landingTheme.ctaGhost}`}
                  onClick={() => navigate("/signup")}
                >
                  가입 후 스토어 보기
                </Button>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={scrollPrev}
                    className={`flex h-9 w-9 items-center justify-center ${landingTheme.ctaGhost}`}
                    aria-label="이전 상품"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="min-w-[3.25rem] text-center text-xs tabular-nums text-white/40">
                    {String(selectedIndex + 1).padStart(2, "0")} /{" "}
                    {String(STORE_SLIDES.length).padStart(2, "0")}
                  </span>
                  <button
                    type="button"
                    onClick={scrollNext}
                    className={`flex h-9 w-9 items-center justify-center ${landingTheme.ctaGhost}`}
                    aria-label="다음 상품"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            <div ref={emblaRef} className="overflow-hidden">
              <div className="flex">
                {STORE_SLIDES.map((slide) => {
                  const theme = getStoreSlideTheme(slide.categoryId);
                  const scale = slide.imageScale ?? 1;
                  return (
                    <div
                      key={slide.id}
                      className="min-w-0 shrink-0 grow-0 basis-full"
                    >
                      <div className="relative flex items-center justify-center py-2">
                        <div
                          className={cn(
                            "pointer-events-none absolute h-40 w-40 rounded-full blur-3xl",
                            theme.glow,
                            "opacity-35",
                          )}
                        />
                        <img
                          src={slide.image}
                          alt={slide.name}
                          className="relative z-[1] h-48 w-full max-w-xs object-contain sm:h-56"
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
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-1.5 border-t border-white/[0.06] pt-5">
            {STORE_SLIDES.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => scrollTo(index)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider transition-colors",
                  index === selectedIndex
                    ? "bg-white/10 text-white"
                    : "text-white/35 hover:text-white/60",
                )}
              >
                {slide.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

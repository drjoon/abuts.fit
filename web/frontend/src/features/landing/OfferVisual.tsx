// related files:
// - web/frontend/src/features/landing/landingOffers.ts
// - web/frontend/src/features/landing/LandingPracticeWorkspacePreview.tsx
import { useEffect, useState } from "react";
import { cn } from "@/shared/ui/cn";
import type { OfferVisual as OfferVisualModel } from "./landingOffers";
import { LandingPracticeWorkspacePreview } from "./LandingPracticeWorkspacePreview";

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

function OfferSlideshow({
  shots,
  tile = false,
  className,
}: {
  shots: Array<{ src: string; alt: string }>;
  tile?: boolean;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced || shots.length < 2) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % shots.length);
    }, 5500);
    return () => window.clearInterval(id);
  }, [reduced, shots.length]);

  return (
    <div className={cn("relative h-full min-h-0 w-full overflow-hidden bg-[#e8ecf1]", className)}>
      {shots.map((shot, i) => (
        <div
          key={shot.src}
          className={cn(
            "absolute inset-0 flex items-center justify-center p-3 transition-opacity duration-700 sm:p-5",
            tile && "pb-28 sm:pb-32",
            i === index ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          <img
            src={shot.src}
            alt={i === index ? shot.alt : ""}
            className="max-h-full max-w-full rounded-xl object-contain shadow-[0_16px_40px_rgba(15,23,42,0.12)]"
          />
        </div>
      ))}
      {!tile && shots.length > 1 ? (
        <div className="pointer-events-none absolute bottom-4 left-0 right-0 flex justify-center gap-1.5">
          {shots.map((shot, i) => (
            <span
              key={shot.src}
              className={cn(
                "h-1.5 rounded-full",
                i === index ? "w-6 bg-slate-900/80" : "w-1.5 bg-slate-900/30",
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function OfferVisual({
  visual,
  className,
  tile = false,
  fill = false,
}: {
  visual: OfferVisualModel;
  className?: string;
  /** 홈 카드. 캡션은 숨기고, 빈 칸 문구는 위쪽에 둔다 */
  tile?: boolean;
  /** 히어로·슬라이드. 프레임을 채운다 */
  fill?: boolean;
}) {
  if (visual.kind === "blank") {
    return (
      <div
        className={cn(
          "flex h-full w-full flex-col items-center bg-[#e7e9ee] px-8 text-center",
          fill ? "min-h-0 justify-center" : "min-h-[16rem]",
          tile ? "justify-start pt-10 sm:pt-14" : "justify-center",
          className,
        )}
      >
        <p className="text-[11px] font-semibold tracking-[0.22em] text-slate-400">
          IMAGE
        </p>
        <p className="mt-3 max-w-xs text-sm font-medium leading-relaxed text-slate-600 sm:text-base">
          {visual.caption}
        </p>
      </div>
    );
  }

  if (visual.kind === "slideshow") {
    return <OfferSlideshow shots={visual.shots} tile={tile} className={className} />;
  }

  if (visual.kind === "workspace") {
    return (
      <div
        className={cn(
          "flex h-full w-full bg-[#eef1f6]",
          tile
            ? "items-start p-4 pb-36 sm:p-6 sm:pb-40"
            : fill
              ? "min-h-0 items-center p-4 sm:p-6"
              : "min-h-[16rem] items-center p-4 sm:p-8",
          className,
        )}
      >
        <LandingPracticeWorkspacePreview className="min-h-[220px] shadow-sm" />
      </div>
    );
  }

  if (visual.kind === "pair") {
    return (
      <div
        className={cn(
          "grid h-full w-full grid-cols-2 gap-3 bg-[#f3f4f6]",
          tile
            ? "content-start items-start p-4 pb-40 sm:gap-6 sm:p-8 sm:pb-44"
            : fill
              ? "min-h-0 content-center items-center p-6 sm:gap-6 sm:p-10"
              : "min-h-[16rem] p-4 sm:gap-4 sm:p-8",
          className,
        )}
      >
        {visual.items.map((item) => (
          <figure
            key={item.caption}
            className="flex min-h-0 flex-col items-center justify-center"
          >
            <img
              src={item.src}
              alt={item.alt}
              className={cn(
                "w-full object-contain",
                fill
                  ? "h-full max-h-[70%]"
                  : tile
                    ? "h-[min(46%,18rem)] sm:h-[min(52%,22rem)]"
                    : "h-[min(52vh,22rem)] sm:h-[min(58vh,28rem)]",
              )}
            />
            {tile || fill ? null : (
              <figcaption className="mt-3 text-center text-xs font-medium text-slate-600 sm:text-sm">
                {item.caption}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center bg-[#f3f4f6]",
        tile ? "p-4 pb-40 sm:p-8 sm:pb-44" : fill ? "min-h-0 p-6 sm:p-10" : "min-h-[16rem] p-4 sm:p-8",
        className,
      )}
    >
      <img
        src={visual.src}
        alt={visual.alt}
        className={cn(
          "w-full object-contain",
          fill ? "h-full max-h-full" : "h-[min(62vh,32rem)]",
        )}
      />
    </div>
  );
}

// related files:
// - web/frontend/src/features/landing/landingOffers.ts
// - web/frontend/src/features/landing/LandingPracticeWorkspacePreview.tsx
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
  const [dragX, setDragX] = useState<number | null>(null);
  const reduced = usePrefersReducedMotion();
  const count = shots.length;

  useEffect(() => {
    if (reduced || count < 2) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % count);
    }, 5500);
    return () => window.clearInterval(id);
  }, [reduced, count, index]);

  const go = (next: number) => {
    if (count < 1) return;
    setIndex((next + count) % count);
  };

  return (
    <div
      className={cn("relative h-full min-h-0 w-full overflow-hidden bg-[#e8ecf1]", className)}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        if ((event.target as HTMLElement).closest("button")) return;
        setDragX(event.clientX);
      }}
      onPointerUp={(event) => {
        if (dragX == null) return;
        const delta = event.clientX - dragX;
        setDragX(null);
        if (delta > 48) go(index - 1);
        else if (delta < -48) go(index + 1);
      }}
      onPointerCancel={() => setDragX(null)}
    >
      <div
        className={cn(
          "flex h-full",
          reduced ? "" : "transition-transform duration-700 ease-out",
        )}
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {shots.map((shot, i) => (
          <div
            key={shot.src}
            className={cn(
              "flex h-full min-w-full items-center justify-center p-3 sm:p-5",
              tile && "pb-28 sm:pb-32",
            )}
          >
            <img
              src={shot.src}
              alt={i === index ? shot.alt : ""}
              className="max-h-full max-w-full rounded-xl object-contain shadow-[0_16px_40px_rgba(15,23,42,0.12)]"
              draggable={false}
            />
          </div>
        ))}
      </div>
      {count > 1 ? (
        <>
          <button
            type="button"
            className="absolute left-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-sm hover:bg-white"
            aria-label="이전 화면"
            onClick={() => go(index - 1)}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            className="absolute right-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-sm hover:bg-white"
            aria-label="다음 화면"
            onClick={() => go(index + 1)}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className={cn(
            "absolute left-0 right-0 z-20 flex justify-center gap-1.5",
            tile ? "bottom-28 sm:bottom-32" : "bottom-4",
          )}>
            {shots.map((shot, i) => (
              <button
                key={shot.src}
                type="button"
                aria-label={`${i + 1}번째 화면`}
                aria-current={i === index ? "true" : undefined}
                className={cn(
                  "h-1.5 rounded-full",
                  i === index ? "w-6 bg-slate-900/80" : "w-1.5 bg-slate-900/30",
                )}
                onClick={() => go(i)}
              />
            ))}
          </div>
        </>
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

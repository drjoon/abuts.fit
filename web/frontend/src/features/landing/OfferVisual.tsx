// related files:
// - web/frontend/src/features/landing/landingOffers.ts
// - web/frontend/src/features/landing/LandingPracticeWorkspacePreview.tsx
import { cn } from "@/shared/ui/cn";
import type { OfferVisual as OfferVisualModel } from "./landingOffers";
import { LandingPracticeWorkspacePreview } from "./LandingPracticeWorkspacePreview";

export function OfferVisual({
  visual,
  className,
  tile = false,
}: {
  visual: OfferVisualModel;
  className?: string;
  /** 홈 카드. 캡션은 숨기고, 빈 칸 문구는 위쪽에 둔다 */
  tile?: boolean;
}) {
  if (visual.kind === "blank") {
    return (
      <div
        className={cn(
          "flex h-full min-h-[16rem] w-full flex-col items-center bg-[#e7e9ee] px-8 text-center",
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

  if (visual.kind === "workspace") {
    return (
      <div
        className={cn(
          "flex h-full w-full bg-[#eef1f6]",
          tile ? "items-start p-4 pb-36 sm:p-6 sm:pb-40" : "min-h-[16rem] items-center p-4 sm:p-8",
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
                tile
                  ? "h-[min(46%,18rem)] sm:h-[min(52%,22rem)]"
                  : "h-[min(52vh,22rem)] sm:h-[min(58vh,28rem)]",
              )}
            />
            {tile ? null : (
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
        tile ? "p-4 pb-40 sm:p-8 sm:pb-44" : "min-h-[16rem] p-4 sm:p-8",
        className,
      )}
    >
      <img
        src={visual.src}
        alt={visual.alt}
        className="h-[min(62vh,32rem)] w-full object-contain"
      />
    </div>
  );
}

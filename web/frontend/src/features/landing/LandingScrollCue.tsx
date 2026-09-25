// related files:
// - web/frontend/src/features/landing/LandingHome.tsx
// - web/frontend/src/features/landing/LandingOfferPage.tsx
import { ArrowDown } from "lucide-react";
import { cn } from "@/shared/ui/cn";

function scrollToNextSection(cue: HTMLElement) {
  const next = cue.closest("section")?.nextElementSibling;
  if (!(next instanceof HTMLElement)) return;
  const margin = Number.parseFloat(getComputedStyle(next).scrollMarginTop) || 0;
  const target = Math.max(0, next.getBoundingClientRect().top + window.scrollY - margin);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) {
    window.scrollTo(0, target);
    return;
  }
  const start = window.scrollY;
  const delta = target - start;
  if (Math.abs(delta) < 1) return;
  const duration = 480;
  const t0 = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / duration);
    const eased = 1 - (1 - t) ** 3;
    window.scrollTo(0, start + delta * eased);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** 히어로 하단 스크롤 화살표. 랜딩·오퍼 모두 히어로 바닥에서 같은 간격. */
export function LandingScrollCue({
  tone = "onDark",
}: {
  /** 흰 히어로(심플웨이)는 파란 아이콘 */
  tone?: "onDark" | "onLight";
}) {
  const onLight = tone === "onLight";
  return (
    <button
      type="button"
      aria-label="아래로 스크롤"
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        const cue = event.currentTarget;
        // 포커스가 히어로 버튼에 남으면 브라우저가 스크롤을 되돌린다.
        cue.blur();
        window.setTimeout(() => scrollToNextSection(cue), 50);
      }}
      className={cn(
        "absolute bottom-6 left-1/2 z-10 flex h-8 w-8 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full border-0 p-0 outline-none backdrop-blur-sm focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2",
        onLight
          ? "animate-scroll-halo-blue bg-[#eef6ff] text-[#2563eb]"
          : "bg-white/80 text-[#0b2a5c] shadow-[0_1px_14px_rgba(255,255,255,0.95),0_1px_28px_rgba(255,255,255,0.8)]",
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center",
          onLight ? "animate-scroll-blink-blue" : "animate-scroll-blink",
        )}
        aria-hidden
      >
        <ArrowDown className="h-4 w-4" strokeWidth={2.5} />
      </span>
    </button>
  );
}

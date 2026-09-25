// related files:
// - web/frontend/src/features/landing/LandingHome.tsx
// - web/frontend/src/features/landing/LandingOfferPage.tsx
import { ArrowDown } from "lucide-react";

function scrollToNextSection(cue: HTMLElement) {
  const next = cue.closest("section")?.nextElementSibling;
  if (!(next instanceof HTMLElement)) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  next.scrollIntoView({
    behavior: reduce ? "auto" : "smooth",
    block: "start",
  });
}

/** 히어로 하단 스크롤 화살표. 랜딩·오퍼 모두 히어로 바닥에서 같은 간격. */
export function LandingScrollCue() {
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
      className="absolute bottom-6 left-1/2 z-10 flex h-8 w-8 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full border-0 bg-white/80 p-0 text-[#0b2a5c] shadow-[0_1px_14px_rgba(255,255,255,0.95),0_1px_28px_rgba(255,255,255,0.8)] backdrop-blur-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2"
    >
      <span className="flex animate-scroll-blink items-center justify-center" aria-hidden>
        <ArrowDown className="h-4 w-4" strokeWidth={2.5} />
      </span>
    </button>
  );
}

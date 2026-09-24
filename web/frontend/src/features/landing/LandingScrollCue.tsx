// related files:
// - web/frontend/src/features/landing/LandingHome.tsx
// - web/frontend/src/features/landing/LandingOfferPage.tsx
import { ArrowDown } from "lucide-react";

/** 히어로 하단 스크롤 화살표 (하이라이트 깜빡임) */
export function LandingScrollCue() {
  return (
    <div className="pointer-events-none absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center">
      <span
        className="flex h-8 w-8 animate-scroll-blink items-center justify-center rounded-full bg-white/80 text-[#0b2a5c] shadow-[0_1px_14px_rgba(255,255,255,0.95),0_1px_28px_rgba(255,255,255,0.8)] backdrop-blur-sm"
        aria-hidden
      >
        <ArrowDown className="h-4 w-4" strokeWidth={2.5} />
      </span>
    </div>
  );
}

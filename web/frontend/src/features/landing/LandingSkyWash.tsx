// related files:
// - web/frontend/src/features/landing/landingTheme.ts
// - web/frontend/src/features/landing/LandingHome.tsx
// - web/frontend/src/pages/public/EventApplyPage.tsx

import { cn } from "@/shared/ui/cn";
import { landingSkyWashClass } from "./landingTheme";

/** 공개 히어로 하늘색 워시 + 그리드. 이벤트·랜딩 공통 SSOT. */
export function LandingSkyWash({ className }: { className?: string }) {
  return (
    <div
      className={cn("pointer-events-none absolute inset-0", className)}
      aria-hidden
    >
      <div className={cn("absolute inset-0", landingSkyWashClass)} />
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(15,23,42,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.04) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
    </div>
  );
}

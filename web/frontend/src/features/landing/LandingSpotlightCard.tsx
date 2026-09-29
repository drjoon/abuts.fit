// related files:
// - web/frontend/src/features/landing/LandingHome.tsx
// - web/frontend/src/features/landing/LabOfferSections.tsx
// - web/frontend/src/index.css
import type { CSSProperties, PointerEvent, ReactNode } from "react";
import { cn } from "@/shared/ui/cn";

/** 커서를 따라다니는 스포트라이트 카드. 스타일은 `index.css` 의 `.landing-spot`. */
export function LandingSpotlightCard({
  className,
  style,
  children,
}: {
  className?: string;
  /** 단계 지연 변수(`--i`) 등 */
  style?: CSSProperties;
  children: ReactNode;
}) {
  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${event.clientX - rect.left}px`);
    el.style.setProperty("--my", `${event.clientY - rect.top}px`);
  };
  return (
    <div
      className={cn("landing-spot", className)}
      style={style}
      onPointerMove={onMove}
    >
      {children}
    </div>
  );
}

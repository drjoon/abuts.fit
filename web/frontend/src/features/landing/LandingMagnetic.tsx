// related files:
// - web/frontend/src/features/landing/LandingHero.tsx
// - web/frontend/src/features/landing/LandingHome.tsx
import type { PointerEvent, ReactNode } from "react";
import { cn } from "@/shared/ui/cn";

/** 마우스가 가까이 오면 버튼이 살짝 끌려오는 마그네틱 효과. 터치·모션 감소에서는 동작하지 않는다. */
export function LandingMagnetic({
  children,
  className,
  strength = 0.28,
}: {
  children: ReactNode;
  className?: string;
  strength?: number;
}) {
  const onMove = (event: PointerEvent<HTMLSpanElement>) => {
    if (event.pointerType !== "mouse") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    el.style.transform = `translate(${(dx * strength).toFixed(1)}px, ${(dy * strength).toFixed(1)}px)`;
  };
  const onLeave = (event: PointerEvent<HTMLSpanElement>) => {
    event.currentTarget.style.transform = "";
  };
  return (
    <span
      className={cn(
        "inline-flex transition-transform duration-200 ease-out will-change-transform",
        className,
      )}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      {children}
    </span>
  );
}

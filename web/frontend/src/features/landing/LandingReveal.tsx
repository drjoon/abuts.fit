// related files:
// - web/frontend/src/features/landing/LandingHome.tsx
// - web/frontend/src/index.css
import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";
import { cn } from "@/shared/ui/cn";

/**
 * 스크롤 진입 리빌. 화면에 처음 들어올 때 한 번만 아래에서 페이드인한다.
 * 스타일은 `index.css` 의 `.landing-reveal`. `prefers-reduced-motion` 이면 바로 보인다.
 */
export function LandingReveal({
  as: Tag = "div",
  delay = 0,
  className,
  children,
}: {
  as?: ElementType;
  /** 같은 묶음 안 순차 등장(ms) */
  delay?: number;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const style = { "--reveal-delay": `${delay}ms` } as CSSProperties;
  return (
    <Tag
      ref={ref}
      style={style}
      className={cn("landing-reveal", shown && "is-in", className)}
    >
      {children}
    </Tag>
  );
}

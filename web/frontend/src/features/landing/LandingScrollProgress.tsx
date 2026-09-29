// related files:
// - web/frontend/src/features/landing/LandingHome.tsx
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/** 뷰포트 최상단 가는 스크롤 진행바(헤더 위). */
export function LandingScrollProgress() {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const bar = barRef.current;
      if (!bar) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      bar.style.transform = `scaleX(${p.toFixed(4)})`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return createPortal(
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px]"
    >
      <div
        ref={barRef}
        className="h-full origin-left bg-gradient-to-r from-sky-300 via-sky-400 to-[#2563eb] shadow-[0_0_10px_rgba(56,189,248,0.7)]"
        style={{ transform: "scaleX(0)" }}
      />
    </div>,
    document.body,
  );
}

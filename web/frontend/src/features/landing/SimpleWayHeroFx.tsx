// related files:
// - web/frontend/src/features/landing/LandingOfferPage.tsx
// - web/frontend/src/features/landing/landingOffers.ts (직경 색 SSOT: DIAMETER_DOT)
// - web/frontend/src/index.css (sw-* 이펙트)
import { useEffect, useRef } from "react";

/** 직경 6·7·8·9·10 색 (landingOffers `DIAMETER_DOT` 과 같은 값). */
const DIAMETER_COLORS = ["#E0C850", "#4EAE82", "#7A3488", "#3E92C4", "#6AADC0"] as const;

/**
 * 심플웨이 히어로 배경 — 블루프린트 격자 + 직경 색 오로라 + 가이드 라인.
 * 부모(히어로)의 포인터 위치를 `--px` `--py`(-1~1)로 올려, 배경은 반대로·제품 프레임은 같은 방향으로 시차를 준다.
 * (랜딩 히어로의 「파티클 워드」, 기공서비스의 「스캔 점군」과 다른 효과)
 */
export function SimpleWayHeroFx() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return undefined;

    let raf = 0;
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    const tick = () => {
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      host.style.setProperty("--px", cx.toFixed(3));
      host.style.setProperty("--py", cy.toFixed(3));
      if (Math.abs(tx - cx) > 0.002 || Math.abs(ty - cy) > 0.002) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = 0;
      }
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const rect = host.getBoundingClientRect();
      tx = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      ty = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
      kick();
    };
    const onLeave = () => {
      tx = 0;
      ty = 0;
      kick();
    };
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    return () => {
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
      host.style.removeProperty("--px");
      host.style.removeProperty("--py");
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div className="sw-parallax-back absolute inset-[-4%]">
        <div className="sw-hero-grid absolute inset-0" />
        {DIAMETER_COLORS.map((color, index) => (
          <span
            key={color}
            className={`sw-orb sw-orb-${index + 1}`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
      <span className="sw-guide-line" />
    </div>
  );
}

/** 제품 프레임 뒤에서 도는 점선 링 2겹. 바깥 링 위를 직경 색 점 5개가 돈다. */
export function SimpleWayRings() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 aspect-square h-[122%] -translate-x-1/2 -translate-y-1/2"
    >
      <div className="sw-ring-spin absolute inset-0 rounded-full border border-dashed border-sky-300/70">
        {DIAMETER_COLORS.map((color, index) => (
          <span
            key={color}
            className="absolute inset-0"
            style={{ transform: `rotate(${index * 72}deg)` }}
          >
            <span
              className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white shadow-[0_2px_8px_rgba(15,23,42,0.25)]"
              style={{ backgroundColor: color }}
            />
          </span>
        ))}
      </div>
      <div className="sw-ring-spin-rev absolute inset-[13%] rounded-full border border-sky-200/80" />
      <div className="absolute inset-[26%] rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.10),transparent_70%)]" />
    </div>
  );
}

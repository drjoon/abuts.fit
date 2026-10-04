// related files:
// - web/frontend/src/features/landing/PlatformOfferSections.tsx
// - web/frontend/src/features/landing/landingOffers.ts
// - web/frontend/src/index.css (pf-* 이펙트)
//
// 플랫폼 히어로 — 의뢰가 치과에서 기공소로 흘러 납품까지 가는 한 사이클.
// 홈 파티클 / 심플웨이 블루프린트 / 랩 스캔 점군과 다른 효과.

const STAGES = ["의뢰", "작업", "확인", "납품"] as const;

/**
 * 다크 히어로 배경 — 의뢰 패킷이 레인을 따라 이동하며 단계 노드를 차례로 켠다.
 * 노드 점등 시점은 패킷 위치와 맞춘 `--pf-i` 지연으로 동기화. 마지막 납품에서 완료 링이 퍼진다.
 * `prefers-reduced-motion`이면 CSS에서 정지.
 */
export function PlatformHeroFx() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div className="pf-hero-grid absolute inset-0" />
      <div className="pf-orbit pf-orbit-a absolute -left-16 top-1/4 h-64 w-64 rounded-full" />
      <div className="pf-orbit pf-orbit-b absolute -right-20 bottom-0 h-80 w-80 rounded-full" />

      <div className="absolute inset-x-0 bottom-[12%] flex justify-center px-6 sm:bottom-[14%]">
        <div className="pf-lane relative grid w-full max-w-md grid-cols-4 items-center sm:max-w-lg">
          <span className="pf-lane-fill absolute left-[12.5%] right-[12.5%] top-[5px] h-px" />
          <div className="absolute inset-x-[12.5%] top-[5px] h-0">
            <span className="pf-packet absolute -top-[5px] h-2.5 w-2.5 -translate-x-1/2 rounded-sm" />
          </div>
          {STAGES.map((label, index) => (
            <div
              key={label}
              className="pf-node relative z-10 flex flex-col items-center gap-1.5"
              style={{ ["--pf-i" as string]: index }}
            >
              <span className="pf-node-dot relative h-2.5 w-2.5 rounded-full">
                {index === STAGES.length - 1 ? (
                  <span className="pf-done-ring absolute inset-0 rounded-full" />
                ) : null}
              </span>
              <span className="text-[10px] font-semibold tracking-[0.14em] text-sky-200/80">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

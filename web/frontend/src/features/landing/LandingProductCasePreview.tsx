// related files:
// - web/frontend/src/features/landing/LandingBrandStory.tsx
// - web/frontend/src/features/landing/landingAssets.ts
// - web/frontend/public/store/acrodent/
import { cn } from "@/shared/ui/cn";
import {
  LANDING_CASE_ABUTMENT,
  LANDING_CASE_HEALING,
  LANDING_CASE_KIT,
} from "./landingAssets";

/** 랜딩용 — 어벗·힐링·키트를 한 장면으로 합성 (장식, 비인터랙티브) */
export function LandingProductCasePreview({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative flex h-full min-h-[200px] w-full items-center justify-center overflow-hidden bg-[#f4f7fb] sm:min-h-[220px]",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_28%_18%,rgba(186,230,253,0.5),transparent_52%),radial-gradient(ellipse_at_78%_78%,rgba(226,232,240,0.55),transparent_48%)]" />

      <div className="relative mx-auto flex h-full w-full max-w-[26rem] items-end justify-center gap-1 px-3 pb-3 pt-5 sm:gap-2 sm:px-4 sm:pb-4 sm:pt-6">
        {/* 어벗먼트 */}
        <figure className="relative z-[1] mb-1 flex w-[28%] flex-col items-center">
          <div className="flex aspect-[3/4] w-full items-center justify-center rounded-2xl bg-white/90 shadow-[0_10px_28px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70">
            <img
              src={LANDING_CASE_ABUTMENT}
              alt=""
              className="h-[88%] w-[78%] object-contain"
            />
          </div>
          <figcaption className="mt-1.5 text-[10px] font-medium tracking-wide text-slate-500 sm:text-[11px]">
            어벗먼트
          </figcaption>
        </figure>

        {/* 힐링 — 살짝 앞으로 */}
        <figure className="relative z-[2] mb-0 flex w-[28%] flex-col items-center">
          <div className="flex aspect-[3/4] w-full items-center justify-center rounded-2xl bg-white shadow-[0_12px_30px_rgba(15,23,42,0.1)] ring-1 ring-slate-200/80">
            <img
              src={LANDING_CASE_HEALING}
              alt=""
              className="h-[88%] w-[78%] object-contain"
            />
          </div>
          <figcaption className="mt-1.5 text-[10px] font-medium tracking-wide text-slate-500 sm:text-[11px]">
            힐링
          </figcaption>
        </figure>

        {/* 시술 키트 — 메인 */}
        <figure className="relative z-[3] -ml-1 mb-1 flex w-[42%] flex-col items-center sm:-ml-0.5">
          <div className="flex aspect-square w-full items-center justify-center rounded-2xl bg-white shadow-[0_14px_34px_rgba(15,23,42,0.12)] ring-1 ring-sky-100">
            <img
              src={LANDING_CASE_KIT}
              alt=""
              className="h-[92%] w-[92%] scale-110 object-contain"
            />
          </div>
          <figcaption className="mt-1.5 text-[10px] font-medium tracking-wide text-slate-500 sm:text-[11px]">
            시술 키트
          </figcaption>
        </figure>
      </div>
    </div>
  );
}

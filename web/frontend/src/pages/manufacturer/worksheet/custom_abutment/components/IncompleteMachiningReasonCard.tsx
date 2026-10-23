// 오른쪽 STL 우하단 — 불완전 사유를 숫자 칸과 짧은 문장으로 나눈 작은 카드.
// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/utils/incompleteMachiningReason.ts
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx

import type { IncompleteMachiningReasonCard } from "../utils/incompleteMachiningReason";

export function IncompleteMachiningReasonCardView({
  card,
}: {
  card: IncompleteMachiningReasonCard;
}) {
  if (!card.stats.length && !card.notes.length) return null;

  return (
    <div
      className="w-fit max-w-[min(100%,18rem)] shrink-0 self-start overflow-hidden rounded-xl border border-accent-muted bg-white shadow-sm"
      role="status"
    >
      {card.stats.length ? (
        <div
          className={`grid gap-x-4 gap-y-2 bg-accent-soft px-3 py-2.5 ${
            card.stats.length > 1 ? "grid-cols-2" : "grid-cols-1"
          }`}
        >
          {card.stats.map((stat) => (
            <div key={stat.label} className="min-w-[4.5rem]">
              <div className="text-[10px] font-medium leading-none text-accent-strong/70">
                {stat.label}
              </div>
              <div className="mt-1 text-[13px] font-semibold tabular-nums leading-none text-accent-strong">
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {card.notes.length ? (
        <div
          className={`px-3 py-2 text-[12px] font-medium leading-snug ${
            card.stats.length
              ? "border-t border-accent-muted/80 text-slate-700"
              : "bg-accent-soft text-accent-strong"
          }`}
        >
          {card.notes.map((line, index) => (
            <span key={`${index}-${line}`}>
              {index > 0 ? <br /> : null}
              {line}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * 치과 기공의뢰 — 커스텀어벗 디자인 미확정.
 * 툴바 한 줄은 공지 왼쪽. 디자인 모달 헤더는 공지 레일처럼 한 장씩 넘긴다.
 *
 * related files:
 * - web/frontend/src/pages/practice/components/PracticeRecentTransfersAllModal.tsx
 * - web/frontend/src/shared/components/practice/PracticeCustomAbutmentPreviewDialog.tsx
 */
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export type PracticeAbutmentDesignReviewCard = {
  id: string;
  label: string;
};

export function PracticeAbutmentDesignAwaitingButton({
  total,
  onClick,
}: {
  total: number;
  onClick: () => void;
}) {
  const count = Math.max(0, Number(total || 0));
  if (count <= 0) return null;
  return (
    <button
      type="button"
      className="inline-flex h-8 shrink-0 items-center rounded-lg border border-amber-300 bg-amber-50 px-2.5 text-sm font-medium text-amber-950 hover:bg-amber-100"
      onClick={onClick}
    >
      어벗 디자인 {count}건 검토 대기중
    </button>
  );
}

export function PracticeAbutmentDesignReviewRail({
  items,
  index,
  onIndexChange,
}: {
  items: readonly PracticeAbutmentDesignReviewCard[];
  index: number;
  onIndexChange: (index: number) => void;
}) {
  if (items.length === 0) return null;
  const safe = ((index % items.length) + items.length) % items.length;
  const current = items[safe];
  if (!current) return null;
  const canCycle = items.length > 1;
  const countLabel = items.length > 99 ? "99+" : String(items.length);
  const step = (delta: number) => {
    onIndexChange((safe + delta + items.length) % items.length);
  };

  return (
    <div
      className="flex w-fit max-w-[22rem] shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-sm text-amber-950"
      role="group"
      aria-label={`검토 대기 ${items.length}건`}
    >
      <span
        className="inline-flex min-w-0 items-center rounded-md border border-amber-300 bg-white px-2 py-1 text-left text-[11px] leading-snug text-amber-950"
        title={current.label}
      >
        <span className="min-w-0 truncate">{current.label}</span>
      </span>
      {canCycle ? (
        <div className="flex shrink-0 flex-col">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-3.5 w-6 p-0 text-amber-900 hover:bg-amber-100 hover:text-amber-950"
            aria-label="이전 검토 의뢰"
            title="이전 검토 의뢰"
            onClick={() => step(-1)}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-3.5 w-6 p-0 text-amber-900 hover:bg-amber-100 hover:text-amber-950"
            aria-label="다음 검토 의뢰"
            title="다음 검토 의뢰"
            onClick={() => step(1)}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : null}
      <span
        className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-amber-600 px-1.5 text-[11px] font-bold tabular-nums leading-none text-white"
        title={`검토 대기 ${items.length}건`}
        aria-label={`검토 대기 ${items.length}건`}
      >
        {countLabel}
      </span>
    </div>
  );
}

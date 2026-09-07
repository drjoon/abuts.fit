/**
 * 치과 기공의뢰 — 다음 도착일 미지정(도착일+1일~) 상단 안내.
 * 기공소 LabReceiveUnreadNotice와 같은 헤더 alert 패턴.
 *
 * related files:
 * - web/frontend/src/shared/practice/practiceNextArrivalReminder.ts
 * - web/frontend/src/pages/practice/components/PracticeRecentTransfersAllModal.tsx
 * - web/frontend/src/pages/practice/components/LabReceiveUnreadNotice.tsx
 */
import { AlertCircle } from "lucide-react";
import { cn } from "@/shared/ui/cn";

export type PracticeNextArrivalOverdueNoticeItem = {
  id: string;
  label: string;
  /** 도착일로부터 경과 일수(≥1) */
  daysPast: number;
};

type PracticeNextArrivalOverdueNoticeProps = {
  total: number;
  items?: readonly PracticeNextArrivalOverdueNoticeItem[];
  onSelectItem?: (id: string) => void;
  className?: string;
};

export function PracticeNextArrivalOverdueNotice({
  total,
  items = [],
  onSelectItem,
  className,
}: PracticeNextArrivalOverdueNoticeProps) {
  const count = Math.max(0, Number(total || 0));
  if (count <= 0) return null;

  const visibleItems = items.filter(
    (item) => Math.max(0, Number(item.daysPast || 0)) >= 1,
  );

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col gap-2 rounded-lg border border-amber-300/90 bg-amber-50/90 px-3 py-2 text-sm text-amber-950",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex min-w-0 items-start gap-2">
        <AlertCircle
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-700"
          aria-hidden
        />
        <p className="min-w-0 font-medium leading-snug">
          다음 도착일 미지정 {count}건이 있습니다. 도착일 다음 날부터 표시됩니다.
        </p>
      </div>
      {visibleItems.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {visibleItems.slice(0, 12).map((item) => {
            const daysLabel =
              item.daysPast > 99 ? "99+" : `${item.daysPast}일`;
            return (
              <button
                key={item.id}
                type="button"
                className="inline-flex max-w-full items-center gap-1 rounded-md border-[3px] border-double border-amber-600 bg-white px-2 py-1 text-left text-[11px] leading-snug text-amber-950 hover:bg-amber-50"
                title={item.label}
                onClick={() => onSelectItem?.(item.id)}
              >
                <span className="min-w-0 truncate">{item.label}</span>
                <span
                  className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-amber-700 px-1 text-[10px] font-semibold leading-none text-white"
                  aria-label={`${daysLabel} 경과`}
                >
                  {daysLabel}
                </span>
              </button>
            );
          })}
          {visibleItems.length > 12 ? (
            <span className="self-center text-[11px] text-amber-800/80">
              +{visibleItems.length - 12}건
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

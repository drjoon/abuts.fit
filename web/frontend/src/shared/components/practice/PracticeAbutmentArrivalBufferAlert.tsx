// related files:
// - web/frontend/src/shared/practice/practiceAbutmentShipYmd.ts
// - web/frontend/src/shared/components/practice/PracticeLabReceiveWorkActionsBar.tsx

import { AlertTriangle } from "lucide-react";
import { formatKstYmdToKo } from "@/shared/date/kst";
import {
  isAbutmentShipYmdBeyondArrivalBuffer,
  resolveEffectiveAbutmentShipYmd,
  resolveLatestAllowedAbutmentShipYmd,
  resolvePracticeTransferArrivalYmd,
} from "@/shared/practice/practiceAbutmentShipYmd";
import { cn } from "@/shared/ui/cn";

export type PracticeAbutmentArrivalBufferAlertProps = {
  transfer: {
    arrivalDate?: string | null;
    arrivalDates?: string[] | null;
    production?: { abutmentShipYmd?: string | null } | null;
  };
  /** 계정 선호 치과도착 − N영업일(미설정=3) */
  beforeArrivalBusinessDays?: number | null;
  compact?: boolean;
  className?: string;
};

/**
 * 어벗 택배 익일 출고가 치과도착 − 3영업일 마감을 넘기면 경고.
 */
export function PracticeAbutmentArrivalBufferAlert({
  transfer,
  beforeArrivalBusinessDays = null,
  compact = false,
  className,
}: PracticeAbutmentArrivalBufferAlertProps) {
  const arrivalYmd = resolvePracticeTransferArrivalYmd(transfer);
  const shipYmd = resolveEffectiveAbutmentShipYmd(transfer);
  if (
    !isAbutmentShipYmdBeyondArrivalBuffer({
      shipYmd,
      arrivalYmd,
      beforeArrivalBusinessDays,
    })
  ) {
    return null;
  }
  const latestYmd = resolveLatestAllowedAbutmentShipYmd(
    arrivalYmd,
    beforeArrivalBusinessDays,
  );
  const shipLabel = shipYmd ? formatKstYmdToKo(shipYmd) : "—";
  const latestLabel = latestYmd ? formatKstYmdToKo(latestYmd) : "—";
  const arrivalLabel = arrivalYmd ? formatKstYmdToKo(arrivalYmd) : "—";

  return (
    <div
      role="status"
      className={cn(
        "flex gap-2 rounded-md border border-amber-200/80 bg-amber-50 px-2.5 py-2 text-[11px] leading-snug text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100",
        compact && "py-1.5",
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-0.5">
        <p className="font-medium">치과도착일 여유가 부족합니다.</p>
        <p className="text-amber-900/90 dark:text-amber-100/90">
          택배 출고 {shipLabel}는 치과도착 {arrivalLabel} 기준
          <br />
          권장 마감({latestLabel})보다 늦습니다.
        </p>
      </div>
    </div>
  );
}

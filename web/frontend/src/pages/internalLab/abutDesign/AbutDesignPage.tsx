// related files:
// - web/frontend/src/pages/requestor/design/DesignQueueSection.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/App.tsx
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import { usePeriodStore } from "@/store/usePeriodStore";
import { DesignQueueSection } from "@/pages/requestor/design/DesignQueueSection";

/** 어벗츠기공소 대시보드 — 어벗츠 커스텀어벗 디자인 수신·작업 */
export default function AbutDesignPage() {
  const { period, setPeriod } = usePeriodStore();

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-3">
      <div className="flex shrink-0 items-center justify-end">
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <DesignQueueSection />
      </div>
    </div>
  );
}

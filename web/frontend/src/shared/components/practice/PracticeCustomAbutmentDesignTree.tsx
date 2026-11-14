// 커스텀어벗 디자인 뷰어 왼쪽 목록. 치아마다 표시·치식·다운로드만 보이고, 펼치면 치수를 보여 준다.
// 치식을 누르면 그 치아를 고르고(AI 대화 대상) 화면을 맞춘다.
// related files:
// - web/frontend/src/shared/components/practice/PracticeCustomAbutmentPreviewDialog.tsx
// - web/frontend/src/shared/practice/customAbutmentStlDesign.ts

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Cylinder,
  Download,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
} from "lucide-react";
import type { DesignedCustomAbutment } from "@/shared/practice/customAbutmentStlDesign";
import { cn } from "@/shared/ui/cn";

const headerBtn =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground";

/** 스캔바디 표시 토글. 보일 때만 강조한다(기본은 가림). */
function ScanbodyButton({
  shown,
  label,
  onClick,
}: {
  shown: boolean;
  label: string;
  onClick: () => void;
}) {
  const text = `${label} 스캔바디 ${shown ? "가리기" : "보이기"}`;
  return (
    <button
      type="button"
      className={cn(
        "relative flex h-6 w-6 shrink-0 items-center justify-center rounded",
        shown
          ? "bg-primary/10 text-primary hover:bg-primary/15"
          : "text-muted-foreground/70 hover:bg-muted hover:text-foreground",
      )}
      aria-label={text}
      aria-pressed={shown}
      title={text}
      onClick={onClick}
    >
      <Cylinder className="h-3.5 w-3.5" />
      {shown ? null : (
        <span
          aria-hidden
          className="pointer-events-none absolute h-px w-4 rotate-45 rounded bg-current"
        />
      )}
    </button>
  );
}

const AXIS_SOURCE_LABEL: Record<DesignedCustomAbutment["metrics"]["axisSource"], string> = {
  opposing: "대합치 중심",
  arch: "악궁 교합 방향",
  parallel: "인접 어벗과 평행",
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right tabular-nums text-foreground">{value}</span>
    </div>
  );
}

export function PracticeCustomAbutmentDesignTree({
  items,
  visibleTeeth,
  selectedTooth,
  redesigning,
  onToggleVisible,
  onSetAllVisible,
  shownScanbodies,
  onToggleScanbody,
  onSetAllScanbodies,
  onSelect,
  onDownload,
  onRegenerate,
  className,
}: {
  shownScanbodies: Record<string, boolean>;
  onToggleScanbody: (toothNumber: string) => void;
  onSetAllScanbodies: (shown: boolean) => void;
  items: readonly DesignedCustomAbutment[];
  visibleTeeth: Record<string, boolean>;
  selectedTooth: string | null;
  redesigning: readonly string[];
  onToggleVisible: (toothNumber: string) => void;
  onSetAllVisible: (visible: boolean) => void;
  onSelect: (toothNumber: string) => void;
  onDownload: (item: DesignedCustomAbutment) => void;
  onRegenerate: () => void;
  className?: string;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const allOpen = items.length > 0 && items.every((it) => expanded[it.toothNumber]);
  const allVisible = items.every((it) => visibleTeeth[it.toothNumber] !== false);
  const anyScanbody = items.some((it) => shownScanbodies[it.toothNumber]);

  return (
    <div
      className={cn(
        "pointer-events-auto flex min-h-0 w-[14.5rem] shrink flex-col overflow-y-auto rounded-lg border bg-background/95 shadow-sm",
        className,
      )}
    >
      <div className="sticky top-0 z-[1] flex items-center gap-0.5 border-b bg-background py-1 pl-2.5 pr-1 text-xs font-semibold text-foreground">
        <span className="min-w-0 flex-1 truncate">커스텀어벗 {items.length}</span>
        <button
          type="button"
          className={headerBtn}
          aria-label="커스텀어벗 재생성"
          title="지금 값으로 커스텀어벗을 다시 만듭니다."
          disabled={redesigning.length > 0}
          onClick={onRegenerate}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", redesigning.length > 0 && "animate-spin")} />
        </button>
        <ScanbodyButton
          shown={anyScanbody}
          label="모든"
          onClick={() => onSetAllScanbodies(!anyScanbody)}
        />
        <button
          type="button"
          className={headerBtn}
          aria-label={allVisible ? "모두 숨기기" : "모두 보이기"}
          title={allVisible ? "모두 숨기기" : "모두 보이기"}
          onClick={() => onSetAllVisible(!allVisible)}
        >
          {allVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          className={headerBtn}
          aria-label={allOpen ? "모두 접기" : "모두 펼치기"}
          title={allOpen ? "모두 접기" : "모두 펼치기"}
          aria-expanded={allOpen}
          onClick={() =>
            setExpanded(allOpen ? {} : Object.fromEntries(items.map((it) => [it.toothNumber, true])))
          }
        >
          {allOpen ? <ChevronsDownUp className="h-3.5 w-3.5" /> : <ChevronsUpDown className="h-3.5 w-3.5" />}
        </button>
      </div>
      <ul className="space-y-0.5 p-1.5">
        {items.map((item) => {
          const tooth = item.toothNumber;
          const open = Boolean(expanded[tooth]);
          const visible = visibleTeeth[tooth] !== false;
          const selected = selectedTooth === tooth;
          const busy = redesigning.includes(tooth);
          const m = item.metrics;
          const conn = item.fixture.connectionSpec;
          return (
            <li key={tooth}>
              <div
                className={cn(
                  "flex items-center gap-0.5 rounded-md py-0.5 pr-0.5 text-xs",
                  selected ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-muted/60",
                )}
              >
                <button
                  type="button"
                  className="flex h-6 w-5 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                  aria-label={open ? `#${tooth} 접기` : `#${tooth} 펼치기`}
                  aria-expanded={open}
                  onClick={() => setExpanded((prev) => ({ ...prev, [tooth]: !open }))}
                >
                  {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={visible ? `#${tooth} 숨기기` : `#${tooth} 보이기`}
                  onClick={() => onToggleVisible(tooth)}
                >
                  {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1.5 py-0.5 text-left font-semibold text-foreground"
                  onClick={() => onSelect(tooth)}
                >
                  #{tooth}
                  {busy ? <Loader2 className="h-3 w-3 animate-spin text-primary" /> : null}
                </button>
                <ScanbodyButton
                  shown={Boolean(shownScanbodies[tooth])}
                  label={`#${tooth}`}
                  onClick={() => onToggleScanbody(tooth)}
                />
                <button
                  type="button"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`#${tooth} STL 다운로드`}
                  onClick={() => onDownload(item)}
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              </div>
              {open ? (
                <div className="ml-6 mr-1 mt-0.5 space-y-0.5 border-l pb-1.5 pl-2.5 text-[0.6875rem] leading-relaxed">
                  <DetailRow label="최대 직경" value={`Ø${m.maxDiameterMm}mm`} />
                  <DetailRow label="커프 높이" value={`${m.cuffHeightMinMm}~${m.cuffHeightMaxMm}mm`} />
                  <DetailRow label="포스트 높이" value={`${m.postHeightMm}mm`} />
                  {m.adjacentOcclusalMm != null ? (
                    <DetailRow label="인접치 교합면" value={`${m.adjacentOcclusalMm}mm`} />
                  ) : null}
                  {m.crownOverPostMm != null ? (
                    <DetailRow label="크라운 − 포스트" value={`${m.crownOverPostMm}mm`} />
                  ) : null}
                  <DetailRow label="테이퍼" value={`${m.postTaperDeg}°`} />
                  <DetailRow label="삽입축 각도" value={`${m.angulationDeg}°`} />
                  <DetailRow label="삽입축 기준" value={AXIS_SOURCE_LABEL[m.axisSource] ?? "-"} />
                  <DetailRow
                    label="대합 거리"
                    value={m.occlusalClearanceMm != null ? `${m.occlusalClearanceMm}mm` : "대합치 없음"}
                  />
                  <DetailRow label="평균 컷백" value={`${m.cutbackMm}mm`} />
                  <DetailRow label="마진 챔퍼 R" value={`${m.marginFilletRadiusMm}mm`} />
                  <DetailRow
                    label="커넥션"
                    value={[conn.manufacturer, conn.brand, conn.type].filter(Boolean).join(" ") || "-"}
                  />
                  <DetailRow
                    label="스캔바디"
                    value={`${item.fixture.matchedLibraryLabel} · ${m.rmsMm}mm`}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

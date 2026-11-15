// 커스텀어벗 디자인 뷰어 오른쪽 위 「어벗 정보」 패널.
// 치아마다 표시·치식·다운로드를 두고, 펼치면 세부 항목을 드래그·스피너(▲/▼)·직접 입력으로 바꿀 수 있다.
// related files:
// - web/frontend/src/shared/components/practice/PracticeCustomAbutmentPreviewDialog.tsx
// - web/frontend/src/shared/practice/customAbutmentStlDesign.ts
// - web/frontend/src/shared/practice/customAbutmentDesignParams.ts

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsDownUp,
  ChevronsUpDown,
  Cylinder,
  Download,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
} from "lucide-react";
import {
  CUSTOM_ABUTMENT_PARAM_SPECS,
  type CustomAbutmentDesignParams,
  type CustomAbutmentParamKey,
} from "@/shared/practice/customAbutmentDesignParams";
import type {
  CustomAbutmentDesignMetrics,
  DesignedCustomAbutment,
} from "@/shared/practice/customAbutmentStlDesign";
import { cn } from "@/shared/ui/cn";

const headerBtn =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground";

export type AbutmentAxisSource = CustomAbutmentDesignMetrics["axisSource"];

export type AbutmentInfoFieldKey =
  | "maxDiameterMm"
  | "cuffHeightMinMm"
  | "postHeightMm"
  | "crownOverPostMm"
  | "postTaperDeg"
  | "angulationDeg"
  | "axisSource"
  | "occlusalClearanceMm"
  | "cutbackMm"
  | "marginFilletRadiusMm";

export const ABUTMENT_INFO_FIELD_LABELS: Record<AbutmentInfoFieldKey, string> = {
  maxDiameterMm: "최대 직경",
  cuffHeightMinMm: "커프 높이",
  postHeightMm: "포스트 높이",
  crownOverPostMm: "크라운 − 포스트",
  postTaperDeg: "테이퍼",
  angulationDeg: "삽입축 각도",
  axisSource: "삽입축 기준",
  occlusalClearanceMm: "대합 거리",
  cutbackMm: "평균 컷백",
  marginFilletRadiusMm: "마진 챔퍼 R",
};

export const AXIS_SOURCE_LABEL: Record<AbutmentAxisSource, string> = {
  opposing: "대합치 중심",
  arch: "악궁 교합 방향",
  parallel: "인접 어벗과 평행",
};

const AXIS_SOURCE_ORDER: readonly AbutmentAxisSource[] = [
  "opposing",
  "arch",
  "parallel",
];

const AXIS_SOURCE_TO_CODE: Record<AbutmentAxisSource, number> = {
  arch: 0,
  opposing: 1,
  parallel: 2,
};

function clampParam(key: CustomAbutmentParamKey, value: number): number {
  const spec = CUSTOM_ABUTMENT_PARAM_SPECS[key];
  return Math.min(spec.max, Math.max(spec.min, value));
}

function cleanNum(value: number, digits = 2): string {
  return String(Number(value.toFixed(digits)));
}

export function formatAbutmentInfoFieldValue(
  m: CustomAbutmentDesignMetrics,
  field: AbutmentInfoFieldKey,
): string {
  switch (field) {
    case "maxDiameterMm":
      return `Ø${cleanNum(m.maxDiameterMm, 2)}mm`;
    case "cuffHeightMinMm":
      return `${cleanNum(m.cuffHeightMinMm, 2)}~${cleanNum(m.cuffHeightMaxMm, 2)}mm`;
    case "postHeightMm":
      return `${cleanNum(m.postHeightMm, 2)}mm`;
    case "crownOverPostMm":
      return m.crownOverPostMm != null ? `${cleanNum(m.crownOverPostMm, 2)}mm` : "-";
    case "postTaperDeg":
      return `${cleanNum(m.postTaperDeg, 1)}°`;
    case "angulationDeg":
      return `${cleanNum(m.angulationDeg, 1)}°`;
    case "axisSource":
      return AXIS_SOURCE_LABEL[m.axisSource] ?? "-";
    case "occlusalClearanceMm":
      return m.occlusalClearanceMm != null ? `${cleanNum(m.occlusalClearanceMm, 2)}mm` : "대합치 없음";
    case "cutbackMm":
      return `${cleanNum(m.cutbackMm, 2)}mm`;
    case "marginFilletRadiusMm":
      return `${cleanNum(m.marginFilletRadiusMm, 2)}mm`;
  }
}

/** 어벗 정보 패널의 항목 변경값을 디자인 파라미터 패치로 변환한다. */
export function computeParamsFromInfoFieldEdit(
  item: DesignedCustomAbutment,
  field: AbutmentInfoFieldKey,
  nextValue: number | AbutmentAxisSource,
): Partial<CustomAbutmentDesignParams> {
  const m = item.metrics;
  const p = item.params;
  if (field === "axisSource") {
    const src = nextValue as AbutmentAxisSource;
    return {
      axisSourceCode: AXIS_SOURCE_TO_CODE[src] ?? 1,
      axisToOpposing: src === "arch" ? 0 : 1,
    };
  }
  const num = Number(nextValue);
  if (!Number.isFinite(num)) return {};

  switch (field) {
    case "maxDiameterMm": {
      const base = Math.max(m.maxDiameterMm, 1);
      const ratio = num / base;
      return {
        marginSizeScale: Number(clampParam("marginSizeScale", p.marginSizeScale * ratio).toFixed(3)),
      };
    }
    case "cuffHeightMinMm": {
      const delta = num - m.cuffHeightMinMm;
      return {
        marginDepthMm: Number(clampParam("marginDepthMm", p.marginDepthMm - delta).toFixed(2)),
      };
    }
    case "postHeightMm": {
      const delta = num - m.postHeightMm;
      return {
        postHeightOffsetMm: Number(
          clampParam("postHeightOffsetMm", p.postHeightOffsetMm + delta).toFixed(2),
        ),
      };
    }
    case "crownOverPostMm": {
      if (m.crownOverPostMm == null) return {};
      const delta = num - m.crownOverPostMm;
      return {
        postHeightOffsetMm: Number(
          clampParam("postHeightOffsetMm", p.postHeightOffsetMm - delta).toFixed(2),
        ),
      };
    }
    case "postTaperDeg": {
      const delta = num - m.postTaperDeg;
      return {
        postTaperDeg: Number(clampParam("postTaperDeg", p.postTaperDeg + delta).toFixed(2)),
      };
    }
    case "angulationDeg": {
      return {
        axisTargetDeg: Number(clampParam("axisTargetDeg", Math.max(0, num)).toFixed(2)),
        axisMaxDeg: Number(
          clampParam("axisMaxDeg", Math.max(p.axisMaxDeg, Math.max(0, num))).toFixed(2),
        ),
      };
    }
    case "occlusalClearanceMm": {
      if (m.occlusalClearanceMm == null) return {};
      const delta = num - m.occlusalClearanceMm;
      return {
        occlusalClearanceMm: Number(
          clampParam("occlusalClearanceMm", p.occlusalClearanceMm + delta).toFixed(2),
        ),
      };
    }
    case "cutbackMm": {
      const delta = num - m.cutbackMm;
      return {
        minCrownThicknessMm: Number(
          clampParam("minCrownThicknessMm", p.minCrownThicknessMm + delta * 0.75).toFixed(2),
        ),
        postWidthScale: Number(
          clampParam("postWidthScale", p.postWidthScale - delta * 0.1).toFixed(3),
        ),
      };
    }
    case "marginFilletRadiusMm": {
      const delta = num - m.marginFilletRadiusMm;
      return {
        marginFilletRadiusMm: Number(
          clampParam("marginFilletRadiusMm", p.marginFilletRadiusMm + delta).toFixed(2),
        ),
      };
    }
  }
}

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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5 text-[0.8125rem] leading-snug">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span
        className="min-w-0 truncate text-right tabular-nums text-foreground"
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

function EditableNumberRow({
  label,
  value,
  min,
  max,
  step,
  digits = 2,
  prefix,
  suffix,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  digits?: number;
  prefix?: string;
  suffix?: string;
  disabled?: boolean;
  onCommit: (next: number) => void;
}) {
  const formatVal = (v: number) => cleanNum(v, digits);
  const [draft, setDraft] = useState(() => formatVal(value));
  const [editing, setEditing] = useState(false);
  const [scrubValue, setScrubValue] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrubTimerRef = useRef(0);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startVal: number;
    moved: boolean;
    fromInput: boolean;
    lastCommitted: number;
  } | null>(null);

  useEffect(() => {
    if (!editing && scrubValue == null) {
      setDraft(formatVal(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, scrubValue, value, digits]);

  useEffect(() => {
    return () => window.clearTimeout(scrubTimerRef.current);
  }, []);

  const clampVal = (raw: number) => {
    const snapped = Number((Math.round(raw / step) * step).toFixed(digits + 1));
    return Number(Math.min(max, Math.max(min, snapped)).toFixed(digits));
  };

  const stepBy = (dir: 1 | -1) => {
    if (disabled) return;
    const base = scrubValue ?? value;
    const next = clampVal(base + dir * step);
    setDraft(formatVal(next));
    onCommit(next);
  };

  const commitDraft = () => {
    setEditing(false);
    const parsed = Number(draft.trim());
    if (!draft.trim() || !Number.isFinite(parsed)) {
      setDraft(formatVal(value));
      return;
    }
    const clamped = Number(Math.min(max, Math.max(min, parsed)).toFixed(digits));
    setDraft(formatVal(clamped));
    if (Math.abs(clamped - value) >= 1e-4) {
      onCommit(clamped);
    }
  };

  const startScrub = (fromInput: boolean) => (e: ReactPointerEvent<HTMLElement>) => {
    if (disabled || e.button !== 0) return;
    if (fromInput && editing) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startVal: value,
      moved: false,
      fromInput,
      lastCommitted: value,
    };
  };

  const moveScrub = (e: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = drag.startY - e.clientY;
    if (!drag.moved && Math.hypot(dx, dy) < 3) return;
    drag.moved = true;
    const deltaPx = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
    const fine = e.shiftKey ? 0.2 : 1;
    const steps = (deltaPx / 6) * fine;
    const next = clampVal(drag.startVal + steps * step);
    setScrubValue(next);
    setDraft(formatVal(next));
    window.clearTimeout(scrubTimerRef.current);
    scrubTimerRef.current = window.setTimeout(() => {
      if (Math.abs(next - drag.lastCommitted) >= 1e-4) {
        drag.lastCommitted = next;
        onCommit(next);
      }
    }, 110);
  };

  const endScrub = (e: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    window.clearTimeout(scrubTimerRef.current);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // 이미 해제됨
    }
    if (!drag.moved) {
      setScrubValue(null);
      if (drag.fromInput) {
        setEditing(true);
        window.requestAnimationFrame(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        });
      }
      return;
    }
    const finalVal = scrubValue ?? drag.startVal;
    setScrubValue(null);
    if (Math.abs(finalVal - drag.lastCommitted) >= 1e-4) {
      onCommit(finalVal);
    }
  };

  return (
    <div className="flex items-center justify-between gap-2 py-0.5 text-[0.8125rem] leading-snug">
      <span
        className={cn(
          "shrink-0 select-none text-muted-foreground",
          !disabled && "cursor-ew-resize hover:text-foreground",
        )}
        title={disabled ? undefined : "좌우로 드래그해 값 조절"}
        onPointerDown={startScrub(false)}
        onPointerMove={moveScrub}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
      >
        {label}
      </span>
      <div
        className={cn(
          "flex h-7 min-w-[7.25rem] items-center rounded-md border bg-background pl-1.5 pr-0.5 transition-colors focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/40",
          scrubValue != null && "border-primary bg-primary/5",
          disabled && "opacity-60",
        )}
      >
        {prefix ? (
          <span className="shrink-0 select-none text-xs text-muted-foreground">{prefix}</span>
        ) : null}
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          aria-label={label}
          disabled={disabled}
          value={draft}
          readOnly={!editing}
          className={cn(
            "h-full w-full min-w-[2.5rem] flex-1 bg-transparent px-1 text-right text-[0.8125rem] font-medium tabular-nums text-foreground outline-none",
            !editing && !disabled && "cursor-ew-resize select-none",
          )}
          title={
            disabled
              ? undefined
              : editing
                ? "숫자 입력 후 Enter"
                : "클릭하여 직접 입력 · 드래그하여 조절"
          }
          onPointerDown={startScrub(true)}
          onPointerMove={moveScrub}
          onPointerUp={endScrub}
          onPointerCancel={endScrub}
          onFocus={() => {
            if (!dragRef.current) setEditing(true);
          }}
          onBlur={commitDraft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
              setDraft(formatVal(value));
              (e.target as HTMLInputElement).blur();
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              stepBy(1);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              stepBy(-1);
            }
          }}
        />
        {suffix ? (
          <span className="shrink-0 select-none pr-1 text-xs tabular-nums text-muted-foreground">
            {suffix}
          </span>
        ) : null}
        <div className="flex h-full shrink-0 flex-col justify-center border-l pl-0.5">
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled || value >= max - 1e-5}
            aria-label={`${label} 올리기`}
            className="flex h-3 w-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            onClick={() => stepBy(1)}
          >
            <ChevronUp className="h-2.5 w-2.5" />
          </button>
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled || value <= min + 1e-5}
            aria-label={`${label} 내리기`}
            className="flex h-3 w-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            onClick={() => stepBy(-1)}
          >
            <ChevronDown className="h-2.5 w-2.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function EditableAxisSourceRow({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  value: AbutmentAxisSource;
  disabled?: boolean;
  onCommit: (next: AbutmentAxisSource) => void;
}) {
  const dragRef = useRef<{ pointerId: number; startX: number; startIdx: number } | null>(null);
  const curIdx = Math.max(0, AXIS_SOURCE_ORDER.indexOf(value));

  const stepBy = (dir: 1 | -1) => {
    if (disabled) return;
    const nextIdx = (curIdx + dir + AXIS_SOURCE_ORDER.length) % AXIS_SOURCE_ORDER.length;
    const next = AXIS_SOURCE_ORDER[nextIdx]!;
    if (next !== value) onCommit(next);
  };

  return (
    <div className="flex items-center justify-between gap-2 py-0.5 text-[0.8125rem] leading-snug">
      <span
        className={cn(
          "shrink-0 select-none text-muted-foreground",
          !disabled && "cursor-ew-resize hover:text-foreground",
        )}
        title={disabled ? undefined : "좌우로 드래그해 기준 변경"}
        onPointerDown={(e) => {
          if (disabled || e.button !== 0) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startIdx: curIdx };
        }}
        onPointerMove={(e) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== e.pointerId) return;
          const steps = Math.round((e.clientX - drag.startX) / 28);
          const idx =
            ((drag.startIdx + steps) % AXIS_SOURCE_ORDER.length + AXIS_SOURCE_ORDER.length) %
            AXIS_SOURCE_ORDER.length;
          const next = AXIS_SOURCE_ORDER[idx]!;
          if (next !== value) onCommit(next);
        }}
        onPointerUp={(e) => {
          if (dragRef.current?.pointerId !== e.pointerId) return;
          dragRef.current = null;
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
            // 이미 해제됨
          }
        }}
      >
        {label}
      </span>
      <div
        className={cn(
          "flex h-7 min-w-[7.25rem] items-center rounded-md border bg-background pl-1 pr-0.5 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/40",
          disabled && "opacity-60",
        )}
      >
        <select
          aria-label={label}
          disabled={disabled}
          value={value}
          className="h-full min-w-0 flex-1 bg-transparent pr-1 text-right text-xs font-medium text-foreground outline-none"
          onChange={(e) => onCommit(e.target.value as AbutmentAxisSource)}
        >
          {AXIS_SOURCE_ORDER.map((src) => (
            <option key={src} value={src}>
              {AXIS_SOURCE_LABEL[src]}
            </option>
          ))}
        </select>
        <div className="flex h-full shrink-0 flex-col justify-center border-l pl-0.5">
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            aria-label={`${label} 이전`}
            className="flex h-3 w-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            onClick={() => stepBy(-1)}
          >
            <ChevronUp className="h-2.5 w-2.5" />
          </button>
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            aria-label={`${label} 다음`}
            className="flex h-3 w-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            onClick={() => stepBy(1)}
          >
            <ChevronDown className="h-2.5 w-2.5" />
          </button>
        </div>
      </div>
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
  onRegenerateTooth,
  onEditField,
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
  onRegenerate?: () => void;
  onRegenerateTooth?: (toothNumber: string) => void;
  onEditField?: (
    item: DesignedCustomAbutment,
    field: AbutmentInfoFieldKey,
    nextValue: number | AbutmentAxisSource,
  ) => void;
  className?: string;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const autoExpandedTeethRef = useRef(new Set<string>());

  useEffect(() => {
    if (items.length === 0) return;
    const freshTeeth = items
      .map((it) => it.toothNumber)
      .filter((t) => !autoExpandedTeethRef.current.has(t));
    if (freshTeeth.length === 0) return;
    for (const t of freshTeeth) autoExpandedTeethRef.current.add(t);
    setExpanded((prev) => {
      const next = { ...prev };
      for (const t of freshTeeth) {
        if (next[t] === undefined) next[t] = true;
      }
      return next;
    });
  }, [items]);

  const allOpen = items.length > 0 && items.every((it) => expanded[it.toothNumber]);
  const allVisible = items.every((it) => visibleTeeth[it.toothNumber] !== false);
  const anyScanbody = items.some((it) => shownScanbodies[it.toothNumber]);
  const editable = Boolean(onEditField);

  return (
    <div
      className={cn(
        "pointer-events-auto flex min-h-0 w-[19.5rem] shrink flex-col overflow-y-auto rounded-lg border bg-background/95 shadow-sm",
        className,
      )}
    >
      <div className="sticky top-0 z-[1] flex items-center gap-0.5 border-b bg-background py-1.5 pl-3 pr-1.5 text-[0.8125rem] font-semibold text-foreground">
        <span className="min-w-0 flex-1 truncate">어벗 정보</span>
        {onRegenerate ? (
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
        ) : null}
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
          {allOpen ? (
            <ChevronsDownUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronsUpDown className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      <ul className="space-y-1 px-2 py-1.5">
        {items.map((item) => {
          const tooth = item.toothNumber;
          const open = Boolean(expanded[tooth]);
          const visible = visibleTeeth[tooth] !== false;
          const selected = selectedTooth === tooth;
          const busy = redesigning.includes(tooth);
          const m = item.metrics;
          const conn = item.fixture.connectionSpec;
          const rowDisabled = busy || !editable;

          return (
            <li key={tooth}>
              <div
                className={cn(
                  "flex items-center gap-0.5 rounded-md py-0.5 pr-1 text-[0.8125rem]",
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
                  {open ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
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
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> : null}
                </button>
                <ScanbodyButton
                  shown={Boolean(shownScanbodies[tooth])}
                  label={`#${tooth}`}
                  onClick={() => onToggleScanbody(tooth)}
                />
                {onRegenerateTooth ? (
                  <button
                    type="button"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                    aria-label={`#${tooth} 재생성`}
                    title={`#${tooth}만 지금 값으로 다시 만듭니다.`}
                    disabled={redesigning.length > 0}
                    onClick={() => onRegenerateTooth(tooth)}
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
                  </button>
                ) : null}
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
                <div className="ml-4 mr-0.5 mt-1 space-y-1 border-l pb-2 pl-2.5">
                  {editable ? (
                    <>
                      <EditableNumberRow
                        label="최대 직경"
                        value={m.maxDiameterMm}
                        min={3.5}
                        max={14}
                        step={0.05}
                        digits={2}
                        prefix="Ø"
                        suffix="mm"
                        disabled={rowDisabled}
                        onCommit={(v) => onEditField?.(item, "maxDiameterMm", v)}
                      />
                      <EditableNumberRow
                        label="커프 높이"
                        value={m.cuffHeightMinMm}
                        min={0.3}
                        max={12}
                        step={0.1}
                        digits={2}
                        suffix={`~${cleanNum(m.cuffHeightMaxMm, 2)}mm`}
                        disabled={rowDisabled}
                        onCommit={(v) => onEditField?.(item, "cuffHeightMinMm", v)}
                      />
                      <EditableNumberRow
                        label="포스트 높이"
                        value={m.postHeightMm}
                        min={2.2}
                        max={12}
                        step={0.1}
                        digits={2}
                        suffix="mm"
                        disabled={rowDisabled}
                        onCommit={(v) => onEditField?.(item, "postHeightMm", v)}
                      />
                      {m.adjacentOcclusalMm != null ? (
                        <DetailRow label="인접치 교합면" value={`${m.adjacentOcclusalMm}mm`} />
                      ) : null}
                      {m.crownOverPostMm != null ? (
                        <EditableNumberRow
                          label="크라운 − 포스트"
                          value={m.crownOverPostMm}
                          min={0.7}
                          max={6}
                          step={0.1}
                          digits={2}
                          suffix="mm"
                          disabled={rowDisabled}
                          onCommit={(v) => onEditField?.(item, "crownOverPostMm", v)}
                        />
                      ) : null}
                      <EditableNumberRow
                        label="테이퍼"
                        value={m.postTaperDeg}
                        min={0.5}
                        max={8}
                        step={0.1}
                        digits={1}
                        suffix="°"
                        disabled={rowDisabled}
                        onCommit={(v) => onEditField?.(item, "postTaperDeg", v)}
                      />
                      <EditableNumberRow
                        label="삽입축 각도"
                        value={m.angulationDeg}
                        min={0}
                        max={32}
                        step={0.2}
                        digits={1}
                        suffix="°"
                        disabled={rowDisabled}
                        onCommit={(v) => onEditField?.(item, "angulationDeg", v)}
                      />
                      <EditableAxisSourceRow
                        label="삽입축 기준"
                        value={m.axisSource}
                        disabled={rowDisabled}
                        onCommit={(v) => onEditField?.(item, "axisSource", v)}
                      />
                      {m.occlusalClearanceMm != null ? (
                        <EditableNumberRow
                          label="대합 거리"
                          value={m.occlusalClearanceMm}
                          min={0.7}
                          max={3.5}
                          step={0.05}
                          digits={2}
                          suffix="mm"
                          disabled={rowDisabled}
                          onCommit={(v) => onEditField?.(item, "occlusalClearanceMm", v)}
                        />
                      ) : (
                        <DetailRow label="대합 거리" value="대합치 없음" />
                      )}
                      <EditableNumberRow
                        label="평균 컷백"
                        value={m.cutbackMm}
                        min={0.7}
                        max={3.5}
                        step={0.05}
                        digits={2}
                        suffix="mm"
                        disabled={rowDisabled}
                        onCommit={(v) => onEditField?.(item, "cutbackMm", v)}
                      />
                      <EditableNumberRow
                        label="마진 챔퍼 R"
                        value={m.marginFilletRadiusMm}
                        min={0.3}
                        max={1.0}
                        step={0.02}
                        digits={2}
                        suffix="mm"
                        disabled={rowDisabled}
                        onCommit={(v) => onEditField?.(item, "marginFilletRadiusMm", v)}
                      />
                    </>
                  ) : (
                    <>
                      <DetailRow label="최대 직경" value={`Ø${m.maxDiameterMm}mm`} />
                      <DetailRow
                        label="커프 높이"
                        value={`${m.cuffHeightMinMm}~${m.cuffHeightMaxMm}mm`}
                      />
                      <DetailRow label="포스트 높이" value={`${m.postHeightMm}mm`} />
                      {m.adjacentOcclusalMm != null ? (
                        <DetailRow label="인접치 교합면" value={`${m.adjacentOcclusalMm}mm`} />
                      ) : null}
                      {m.crownOverPostMm != null ? (
                        <DetailRow label="크라운 − 포스트" value={`${m.crownOverPostMm}mm`} />
                      ) : null}
                      <DetailRow label="테이퍼" value={`${m.postTaperDeg}°`} />
                      <DetailRow label="삽입축 각도" value={`${m.angulationDeg}°`} />
                      <DetailRow
                        label="삽입축 기준"
                        value={AXIS_SOURCE_LABEL[m.axisSource] ?? "-"}
                      />
                      <DetailRow
                        label="대합 거리"
                        value={
                          m.occlusalClearanceMm != null
                            ? `${m.occlusalClearanceMm}mm`
                            : "대합치 없음"
                        }
                      />
                      <DetailRow label="평균 컷백" value={`${m.cutbackMm}mm`} />
                      <DetailRow label="마진 챔퍼 R" value={`${m.marginFilletRadiusMm}mm`} />
                    </>
                  )}
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

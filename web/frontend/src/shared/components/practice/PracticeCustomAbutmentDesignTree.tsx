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
  type ReactNode,
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
  snapMaxDiameterMm,
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
  | "marginSubgMm"
  | "maxDiameterMm"
  | "marginFilletRadiusMm"
  | "postHeightMm"
  | "postTaperDeg"
  | "occlusalClearanceMm"
  | "axisSource";

export type AbutmentInfoEditValue = number | AbutmentAxisSource | { min: number; max: number };

export const ABUTMENT_INFO_FIELD_LABELS: Record<AbutmentInfoFieldKey, string> = {
  marginSubgMm: "치은 연하",
  maxDiameterMm: "최대 직경",
  marginFilletRadiusMm: "마진 챔퍼 R",
  postHeightMm: "포스트 높이",
  postTaperDeg: "테이퍼",
  occlusalClearanceMm: "대합 거리",
  axisSource: "삽입축 기준",
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
    case "marginSubgMm":
      return `${(m.marginSubgMinMm ?? 0.5).toFixed(1)}~${(m.marginSubgMaxMm ?? 1).toFixed(1)}mm`;
    case "maxDiameterMm":
      return `Ø${cleanNum(m.maxDiameterMm, 2)}mm`;
    case "marginFilletRadiusMm":
      return `${cleanNum(m.marginFilletRadiusMm, 1)}mm`;
    case "postHeightMm":
      return `${cleanNum(m.postHeightMm, 2)}mm`;
    case "postTaperDeg":
      return `${cleanNum(m.postTaperDeg, 1)}°`;
    case "occlusalClearanceMm":
      return m.occlusalClearanceMm != null ? `${cleanNum(m.occlusalClearanceMm, 2)}mm` : "대합치 없음";
    case "axisSource":
      return AXIS_SOURCE_LABEL[m.axisSource] ?? "-";
    default:
      return "-";
  }
}

/** 어벗 정보 패널의 항목 변경값을 디자인 파라미터 패치로 변환한다. */
export function computeParamsFromInfoFieldEdit(
  item: DesignedCustomAbutment,
  field: AbutmentInfoFieldKey,
  nextValue: AbutmentInfoEditValue,
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
  if (field === "marginSubgMm") {
    const range = nextValue as { min: number; max: number };
    if (!Number.isFinite(range?.min) || !Number.isFinite(range?.max)) return {};
    const minV = Number(clampParam("marginSubgMinMm", Math.min(range.min, range.max)).toFixed(2));
    const maxV = Number(clampParam("marginSubgMaxMm", Math.max(minV, range.min, range.max)).toFixed(2));
    return {
      marginSubgMinMm: minV,
      marginSubgMaxMm: maxV,
      marginDepthMm: minV,
    };
  }
  const num = Number(nextValue);
  if (!Number.isFinite(num)) return {};

  switch (field) {
    case "maxDiameterMm": {
      const snapped = snapMaxDiameterMm(num);
      const base = Math.max(m.maxDiameterMm, 1);
      const ratio = snapped / base;
      return {
        marginSizeScale: Number(clampParam("marginSizeScale", p.marginSizeScale * ratio).toFixed(3)),
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
    case "postTaperDeg": {
      const delta = num - m.postTaperDeg;
      return {
        postTaperDeg: Number(clampParam("postTaperDeg", p.postTaperDeg + delta).toFixed(2)),
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
    case "marginFilletRadiusMm":
      return {
        marginFilletRadiusMm: Number(
          clampParam("marginFilletRadiusMm", Math.round(num * 10) / 10).toFixed(1),
        ),
      };
    default:
      return {};
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

/** 「지오메디 Ø4.5×9mm (상부캡) · rms」에서 직경×길이까지만 남긴다. */
function formatScanbodyPanelValue(label: string): string {
  const withoutCap = label.replace(/\s*\(상부캡\)\s*/g, " ").replace(/\s+/g, " ").trim();
  const sized = withoutCap.match(/^(.*?Ø\s*[\d.]+\s*[×xX]\s*[\d.]+\s*mm)/);
  return (sized?.[1] ?? withoutCap).trim();
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5 pl-2 text-[0.8125rem] leading-snug">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span
        className="ml-auto min-w-0 truncate text-right tabular-nums text-foreground"
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
  const holdRef = useRef(false);
  const seenValueRef = useRef(value);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startVal: number;
    moved: boolean;
    fromInput: boolean;
    pending: number;
  } | null>(null);

  useEffect(() => {
    const changed = Math.abs(seenValueRef.current - value) > 1e-6;
    seenValueRef.current = value;
    if (changed) holdRef.current = false;
    if (editing || scrubValue != null || holdRef.current) return;
    setDraft(formatVal(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, scrubValue, value, digits]);

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
      pending: value,
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
    drag.pending = next;
    setScrubValue(next);
    setDraft(formatVal(next));
  };

  const endScrub = (e: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
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
    const finalVal = drag.pending;
    setScrubValue(null);
    setDraft(formatVal(finalVal));
    if (Math.abs(finalVal - drag.startVal) >= 1e-4) {
      holdRef.current = true;
      onCommit(finalVal);
    }
  };

  return (
    <div className="flex items-center gap-2 py-0.5 pl-2 text-[0.8125rem] leading-snug">
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
          "ml-auto flex h-7 w-[8.75rem] shrink-0 items-center overflow-hidden rounded-md border bg-background pl-1.5 pr-0.5 transition-colors focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/40",
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
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startIdx: number;
    pending: AbutmentAxisSource;
  } | null>(null);
  const [pending, setPending] = useState<AbutmentAxisSource | null>(null);
  const shown = pending ?? value;
  const curIdx = Math.max(0, AXIS_SOURCE_ORDER.indexOf(shown));

  useEffect(() => {
    if (pending != null && pending === value) setPending(null);
  }, [pending, value]);

  const stepBy = (dir: 1 | -1) => {
    if (disabled) return;
    const nextIdx = (curIdx + dir + AXIS_SOURCE_ORDER.length) % AXIS_SOURCE_ORDER.length;
    const next = AXIS_SOURCE_ORDER[nextIdx]!;
    if (next !== value) onCommit(next);
  };

  return (
    <div className="flex items-center gap-2 py-0.5 pl-2 text-[0.8125rem] leading-snug">
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
          dragRef.current = {
            pointerId: e.pointerId,
            startX: e.clientX,
            startIdx: Math.max(0, AXIS_SOURCE_ORDER.indexOf(value)),
            pending: value,
          };
        }}
        onPointerMove={(e) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== e.pointerId) return;
          const steps = Math.round((e.clientX - drag.startX) / 28);
          const idx =
            ((drag.startIdx + steps) % AXIS_SOURCE_ORDER.length + AXIS_SOURCE_ORDER.length) %
            AXIS_SOURCE_ORDER.length;
          const next = AXIS_SOURCE_ORDER[idx]!;
          drag.pending = next;
          setPending(next);
        }}
        onPointerUp={(e) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== e.pointerId) return;
          dragRef.current = null;
          setPending(null);
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
            // 이미 해제됨
          }
          if (drag.pending !== value) {
            setPending(drag.pending);
            onCommit(drag.pending);
          }
        }}
        onPointerCancel={(e) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== e.pointerId) return;
          dragRef.current = null;
          if (drag.pending !== value) {
            setPending(drag.pending);
            onCommit(drag.pending);
          } else {
            setPending(null);
          }
        }}
      >
        {label}
      </span>
      <div
        className={cn(
          "ml-auto flex h-7 w-[8.75rem] shrink-0 items-center overflow-hidden rounded-md border bg-background pl-1 pr-0.5 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/40",
          disabled && "opacity-60",
        )}
      >
        <select
          aria-label={label}
          disabled={disabled}
          value={shown}
          className="h-full w-0 min-w-0 flex-1 truncate bg-transparent pr-1 text-right text-xs font-medium text-foreground outline-none"
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

function InfoGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="pt-2 first:pt-0.5">
      <div className="text-sm font-semibold leading-snug text-foreground">{title}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function EditableRangeRow({
  label,
  minValue,
  maxValue,
  min,
  max,
  step,
  digits = 1,
  suffix,
  disabled,
  onCommit,
}: {
  label: string;
  minValue: number;
  maxValue: number;
  min: number;
  max: number;
  step: number;
  digits?: number;
  suffix?: string;
  disabled?: boolean;
  onCommit: (minV: number, maxV: number) => void;
}) {
  const formatVal = (v: number) => v.toFixed(digits);
  const [draftMin, setDraftMin] = useState(() => formatVal(minValue));
  const [draftMax, setDraftMax] = useState(() => formatVal(maxValue));
  const [editing, setEditing] = useState<null | "min" | "max">(null);
  const [scrub, setScrub] = useState<{ min: number; max: number } | null>(null);
  const minInputRef = useRef<HTMLInputElement | null>(null);
  const maxInputRef = useRef<HTMLInputElement | null>(null);
  const holdRef = useRef(false);
  const seenRef = useRef({ min: minValue, max: maxValue });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startMin: number;
    startMax: number;
    moved: boolean;
    target: "min" | "max" | "both";
    pending: { min: number; max: number };
  } | null>(null);

  useEffect(() => {
    const changed =
      Math.abs(seenRef.current.min - minValue) > 1e-6 ||
      Math.abs(seenRef.current.max - maxValue) > 1e-6;
    seenRef.current = { min: minValue, max: maxValue };
    if (changed) holdRef.current = false;
    if (editing || scrub || holdRef.current) return;
    setDraftMin(formatVal(minValue));
    setDraftMax(formatVal(maxValue));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, scrub, minValue, maxValue, digits]);

  const clampEnd = (raw: number) => {
    const snapped = Number((Math.round(raw / step) * step).toFixed(digits + 1));
    return Number(Math.min(max, Math.max(min, snapped)).toFixed(digits));
  };

  const shiftBoth = (startMin: number, startMax: number, delta: number) => {
    const gap = Math.max(0, startMax - startMin);
    let nextMin = clampEnd(startMin + delta);
    const nextMax = clampEnd(nextMin + gap);
    if (nextMax - nextMin < gap - 1e-6) nextMin = clampEnd(nextMax - gap);
    return { min: nextMin, max: Math.max(nextMin, clampEnd(nextMin + gap)) };
  };

  const stepBoth = (dir: 1 | -1) => {
    if (disabled) return;
    const baseMin = scrub?.min ?? minValue;
    const baseMax = scrub?.max ?? maxValue;
    const next = shiftBoth(baseMin, baseMax, dir * step);
    if (Math.abs(next.min - baseMin) < 1e-4 && Math.abs(next.max - baseMax) < 1e-4) return;
    setDraftMin(formatVal(next.min));
    setDraftMax(formatVal(next.max));
    holdRef.current = true;
    onCommit(next.min, next.max);
  };

  const commitDraft = () => {
    setEditing(null);
    const rawMin = Number(draftMin.trim());
    const rawMax = Number(draftMax.trim());
    let nextMin = clampEnd(Number.isFinite(rawMin) ? rawMin : minValue);
    let nextMax = clampEnd(Number.isFinite(rawMax) ? rawMax : maxValue);
    if (nextMax < nextMin) {
      const swap = nextMin;
      nextMin = nextMax;
      nextMax = swap;
    }
    setDraftMin(formatVal(nextMin));
    setDraftMax(formatVal(nextMax));
    if (Math.abs(nextMin - minValue) >= 1e-4 || Math.abs(nextMax - maxValue) >= 1e-4) {
      holdRef.current = true;
      onCommit(nextMin, nextMax);
    }
  };

  const startScrub = (target: "min" | "max" | "both") => (e: ReactPointerEvent<HTMLElement>) => {
    if (disabled || e.button !== 0) return;
    if (target !== "both" && editing === target) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startMin: minValue,
      startMax: maxValue,
      moved: false,
      target,
      pending: { min: minValue, max: maxValue },
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
    const delta = (deltaPx / 6) * fine * step;
    const next =
      drag.target === "both"
        ? shiftBoth(drag.startMin, drag.startMax, delta)
        : drag.target === "min"
          ? { min: clampEnd(Math.min(drag.startMax, drag.startMin + delta)), max: drag.startMax }
          : { min: drag.startMin, max: clampEnd(Math.max(drag.startMin, drag.startMax + delta)) };
    drag.pending = next;
    setScrub(next);
    setDraftMin(formatVal(next.min));
    setDraftMax(formatVal(next.max));
  };

  const endScrub = (e: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // 이미 해제됨
    }
    if (!drag.moved) {
      setScrub(null);
      if (drag.target === "min" || drag.target === "max") {
        const which = drag.target;
        setEditing(which);
        window.requestAnimationFrame(() => {
          const node = which === "min" ? minInputRef.current : maxInputRef.current;
          node?.focus();
          node?.select();
        });
      }
      return;
    }
    const finalPair = drag.pending;
    setScrub(null);
    setDraftMin(formatVal(finalPair.min));
    setDraftMax(formatVal(finalPair.max));
    if (
      Math.abs(finalPair.min - drag.startMin) >= 1e-4 ||
      Math.abs(finalPair.max - drag.startMax) >= 1e-4
    ) {
      holdRef.current = true;
      onCommit(finalPair.min, finalPair.max);
    }
  };

  const shownMin = scrub?.min ?? minValue;
  const shownMax = scrub?.max ?? maxValue;
  const fieldClass = (active: boolean) =>
    cn(
      "h-full min-w-0 flex-1 bg-transparent text-right text-[0.8125rem] font-medium tabular-nums text-foreground outline-none",
      !active && !disabled && "cursor-ew-resize select-none",
    );

  return (
    <div className="flex items-center gap-2 py-0.5 pl-2 text-[0.8125rem] leading-snug">
      <span
        className={cn(
          "shrink-0 select-none text-muted-foreground",
          !disabled && "cursor-ew-resize hover:text-foreground",
        )}
        title={disabled ? undefined : "좌우로 드래그하면 구간이 같이 움직입니다"}
        onPointerDown={startScrub("both")}
        onPointerMove={moveScrub}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
      >
        {label}
      </span>
      <div
        className={cn(
          "ml-auto flex h-7 w-[8.75rem] shrink-0 items-center overflow-hidden rounded-md border bg-background pl-1 pr-0.5 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/40",
          scrub && "border-primary bg-primary/5",
          disabled && "opacity-60",
        )}
      >
        <input
          ref={minInputRef}
          type="text"
          inputMode="decimal"
          aria-label={`${label} 얕은 끝`}
          disabled={disabled}
          value={draftMin}
          readOnly={editing !== "min"}
          className={fieldClass(editing === "min")}
          title={disabled ? undefined : "얕은 끝. 드래그하거나 입력"}
          onPointerDown={startScrub("min")}
          onPointerMove={moveScrub}
          onPointerUp={endScrub}
          onPointerCancel={endScrub}
          onFocus={() => {
            if (!dragRef.current) setEditing("min");
          }}
          onBlur={commitDraft}
          onChange={(e) => setDraftMin(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditing(null);
              setDraftMin(formatVal(minValue));
              setDraftMax(formatVal(maxValue));
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <span className="shrink-0 px-0.5 text-xs text-muted-foreground">~</span>
        <input
          ref={maxInputRef}
          type="text"
          inputMode="decimal"
          aria-label={`${label} 깊은 끝`}
          disabled={disabled}
          value={draftMax}
          readOnly={editing !== "max"}
          className={fieldClass(editing === "max")}
          title={disabled ? undefined : "깊은 끝. 드래그하거나 입력"}
          onPointerDown={startScrub("max")}
          onPointerMove={moveScrub}
          onPointerUp={endScrub}
          onPointerCancel={endScrub}
          onFocus={() => {
            if (!dragRef.current) setEditing("max");
          }}
          onBlur={commitDraft}
          onChange={(e) => setDraftMax(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditing(null);
              setDraftMin(formatVal(minValue));
              setDraftMax(formatVal(maxValue));
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        {suffix ? (
          <span className="shrink-0 select-none pr-1 text-xs text-muted-foreground">{suffix}</span>
        ) : null}
        <div className="flex h-full shrink-0 flex-col justify-center border-l pl-0.5">
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled || shownMax >= max - 1e-5}
            aria-label={`${label} 깊게`}
            className="flex h-3 w-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            onClick={() => stepBoth(1)}
          >
            <ChevronUp className="h-2.5 w-2.5" />
          </button>
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled || shownMin <= min + 1e-5}
            aria-label={`${label} 얕게`}
            className="flex h-3 w-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            onClick={() => stepBoth(-1)}
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
  onDownloadAll,
  onRegenerate,
  onRegenerateTooth,
  onEditField,
  expanded,
  onExpandedChange,
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
  onDownloadAll?: () => void;
  onRegenerate?: () => void;
  onRegenerateTooth?: (toothNumber: string) => void;
  onEditField?: (
    item: DesignedCustomAbutment,
    field: AbutmentInfoFieldKey,
    nextValue: AbutmentInfoEditValue,
  ) => void;
  expanded: Record<string, boolean>;
  onExpandedChange: (next: Record<string, boolean>) => void;
  className?: string;
}) {
  const allOpen = items.length > 0 && items.every((it) => expanded[it.toothNumber]);
  const allVisible = items.every((it) => visibleTeeth[it.toothNumber] !== false);
  const anyScanbody = items.some((it) => shownScanbodies[it.toothNumber]);
  const editable = Boolean(onEditField);

  return (
    <div
      className={cn(
        "pointer-events-auto flex min-h-0 w-[17.5rem] shrink-0 flex-col overflow-x-hidden overflow-y-auto rounded-lg border bg-background/95 shadow-sm",
        className,
      )}
    >
      <div className="sticky top-0 z-[1] flex items-center gap-0.5 border-b bg-background py-1.5 pl-3 pr-1.5 text-[0.8125rem] font-semibold text-foreground">
        <span className="shrink-0">어벗 정보</span>
        <ScanbodyButton
          shown={anyScanbody}
          label="모든"
          onClick={() => onSetAllScanbodies(!anyScanbody)}
        />
        <button
          type="button"
          className={headerBtn}
          aria-label={allVisible ? "커스텀어벗 모두 숨기기" : "커스텀어벗 모두 보이기"}
          title={allVisible ? "커스텀어벗 모두 숨기기" : "커스텀어벗 모두 보이기"}
          onClick={() => onSetAllVisible(!allVisible)}
        >
          {allVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
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
          {onDownloadAll ? (
            <button
              type="button"
              className={headerBtn}
              aria-label="모든 STL 다운로드"
              title="모든 커스텀어벗 STL을 받습니다."
              onClick={onDownloadAll}
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            className={headerBtn}
            aria-label={allOpen ? "모두 접기" : "모두 펼치기"}
            title={allOpen ? "모두 접기" : "모두 펼치기"}
            aria-expanded={allOpen}
            onClick={() =>
              onExpandedChange(
                Object.fromEntries(items.map((it) => [it.toothNumber, !allOpen])),
              )
            }
          >
            {allOpen ? (
              <ChevronsDownUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronsUpDown className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
      <ul className="space-y-1 px-1.5 py-1.5">
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
                  "flex items-center gap-0.5 rounded-md py-0.5 pl-0.5 pr-0.5 text-[0.8125rem]",
                  selected ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-muted/60",
                )}
              >
                <button
                  type="button"
                  className="flex h-6 shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-left font-semibold text-foreground"
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
                <button
                  type="button"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={visible ? `#${tooth} 숨기기` : `#${tooth} 보이기`}
                  title={visible ? `#${tooth} 커스텀어벗 숨기기` : `#${tooth} 커스텀어벗 보이기`}
                  onClick={() => onToggleVisible(tooth)}
                >
                  {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
                <div className="ml-auto flex shrink-0 items-center gap-0.5">
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
                    title={`#${tooth} STL 다운로드`}
                    onClick={() => onDownload(item)}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={open ? `#${tooth} 접기` : `#${tooth} 펼치기`}
                    aria-expanded={open}
                    onClick={() => onExpandedChange({ ...expanded, [tooth]: !open })}
                  >
                    {open ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
              {open ? (
                <div className="ml-1 mr-0.5 mt-1 border-l pb-2 pl-2">
                  <InfoGroup title="마진">
                    {editable ? (
                      <EditableRangeRow
                        label="치은 연하"
                        minValue={m.marginSubgMinMm ?? item.params.marginSubgMinMm ?? 0.5}
                        maxValue={m.marginSubgMaxMm ?? item.params.marginSubgMaxMm ?? 1}
                        min={-1.5}
                        max={2.5}
                        step={0.1}
                        digits={1}
                        suffix="mm"
                        disabled={rowDisabled}
                        onCommit={(minV, maxV) =>
                          onEditField?.(item, "marginSubgMm", { min: minV, max: maxV })
                        }
                      />
                    ) : (
                      <DetailRow
                        label="치은 연하"
                        value={formatAbutmentInfoFieldValue(m, "marginSubgMm")}
                      />
                    )}
                    {editable ? (
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
                    ) : (
                      <DetailRow label="최대 직경" value={`Ø${m.maxDiameterMm}mm`} />
                    )}
                    {editable ? (
                      <EditableNumberRow
                        label="마진 챔퍼 R"
                        value={m.marginFilletRadiusMm}
                        min={0.5}
                        max={1}
                        step={0.1}
                        digits={1}
                        suffix="mm"
                        disabled={rowDisabled}
                        onCommit={(v) => onEditField?.(item, "marginFilletRadiusMm", v)}
                      />
                    ) : (
                      <DetailRow label="마진 챔퍼 R" value={`${m.marginFilletRadiusMm}mm`} />
                    )}
                  </InfoGroup>
                  <InfoGroup title="포스트">
                    {editable ? (
                      <EditableNumberRow
                        label="높이"
                        value={m.postHeightMm}
                        min={2.2}
                        max={12}
                        step={0.1}
                        digits={2}
                        suffix="mm"
                        disabled={rowDisabled}
                        onCommit={(v) => onEditField?.(item, "postHeightMm", v)}
                      />
                    ) : (
                      <DetailRow label="높이" value={`${m.postHeightMm}mm`} />
                    )}
                    {editable ? (
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
                    ) : (
                      <DetailRow label="테이퍼" value={`${m.postTaperDeg}°`} />
                    )}
                    {m.occlusalClearanceMm != null && editable ? (
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
                      <DetailRow
                        label="대합 거리"
                        value={
                          m.occlusalClearanceMm != null ? `${m.occlusalClearanceMm}mm` : "대합치 없음"
                        }
                      />
                    )}
                  </InfoGroup>
                  <InfoGroup title="삽입축">
                    {editable ? (
                      <EditableAxisSourceRow
                        label="기준"
                        value={m.axisSource}
                        disabled={rowDisabled}
                        onCommit={(v) => onEditField?.(item, "axisSource", v)}
                      />
                    ) : (
                      <DetailRow label="기준" value={AXIS_SOURCE_LABEL[m.axisSource] ?? "-"} />
                    )}
                  </InfoGroup>
                  <div className="mt-1.5 space-y-1 border-t pt-1.5">
                    <DetailRow
                      label="커넥션"
                      value={[conn.manufacturer, conn.brand, conn.type].filter(Boolean).join(" ") || "-"}
                    />
                    <DetailRow
                      label="스캔바디"
                      value={formatScanbodyPanelValue(item.fixture.matchedLibraryLabel)}
                    />
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

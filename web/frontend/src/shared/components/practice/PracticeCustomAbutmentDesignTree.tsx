// 커스텀어벗 디자인 뷰어 오른쪽 위 「어벗 정보」 패널.
// 치아마다 표시·치식을 두고, 펼치면 세부 항목을 드래그·스피너(▲/▼)·직접 입력으로 바꿀 수 있다.
// 치아 왼쪽 레일: 싱글도 짧은 수직·수평선, 브리지는 수직+수평(├/└)과 행 사이 링크 아이콘.
// 커스텀어벗 단독 파일은 받지 않는다.
// related files:
// - web/frontend/src/shared/components/practice/PracticeCustomAbutmentPreviewDialog.tsx
// - web/frontend/src/shared/practice/customAbutmentStlDesign.ts
// - web/frontend/src/shared/practice/customAbutmentDesignParams.ts

import {
  useEffect,
  useMemo,
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
  Crown,
  Hexagon,
  Eye,
  EyeOff,
  Link2,
  Link2Off,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CUSTOM_ABUTMENT_PARAM_SPECS,
  RETENTION_BRIDGE_MAX_TAPER_DEG,
  RETENTION_BRIDGE_MIN_TAPER_DEG,
  RETENTION_MAX_POST_HEIGHT_MM,
  RETENTION_MIN_POST_HEIGHT_MM,
  RETENTION_SINGLE_MAX_TAPER_DEG,
  RETENTION_SINGLE_MIN_TAPER_DEG,
  computeOptimalPostHeightMmFromTaper,
  computeOptimalPostTaperDeg,
  evaluatePostTaperRetention,
  isAnteriorTooth,
  minOcclusalClearanceMmForTooth,
  postRetentionSurface,
  snapMaxDiameterMm,
  teethShareBridgeSpan,
  type CustomAbutmentDesignParams,
  type CustomAbutmentParamKey,
  type ToothBridgeMetaItem,
} from "@/shared/practice/customAbutmentDesignParams";
import type {
  CustomAbutmentDesignMetrics,
  DesignedCustomAbutment,
} from "@/shared/practice/customAbutmentStlDesign";
import { cn } from "@/shared/ui/cn";

const headerBtn =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground";

/** 어벗 정보 패널 순서. FDI 시계방향 18→11, 21→28, 38→31, 41→48. */
export function abutmentInfoPanelSortKey(toothNumber: string): number {
  const raw = String(toothNumber || "").trim();
  if (!/^[1-4][1-8]$/.test(raw)) return Number.MAX_SAFE_INTEGER;
  const tens = Number(raw[0]);
  const ones = Number(raw[1]);
  if (tens === 1) return 9 - ones;
  if (tens === 2) return 8 + ones;
  if (tens === 3) return 16 + (9 - ones);
  return 24 + ones;
}

function sortAbutmentInfoPanelItems<T extends { toothNumber: string }>(
  items: readonly T[],
): T[] {
  return [...items].sort(
    (a, b) => abutmentInfoPanelSortKey(a.toothNumber) - abutmentInfoPanelSortKey(b.toothNumber),
  );
}

export type AbutmentAxisSource = CustomAbutmentDesignMetrics["axisSource"];

export type AbutmentInfoFieldKey =
  | "marginSubgMm"
  | "maxDiameterMm"
  | "marginFilletRadiusMm"
  | "postHeightMm"
  | "postTaperDeg"
  | "postTaperLink"
  | "postLingualBevelMm"
  | "postLabialBevelMm"
  | "postTopPlaneCode"
  | "occlusalClearanceMm"
  | "axisSource";

export type AbutmentInfoEditValue = number | AbutmentAxisSource | { min: number; max: number };

export const ABUTMENT_INFO_FIELD_LABELS: Record<AbutmentInfoFieldKey, string> = {
  marginSubgMm: "치은 연하",
  maxDiameterMm: "최대 직경",
  marginFilletRadiusMm: "마진 필레 R",
  postHeightMm: "포스트 높이",
  postTaperDeg: "테이퍼",
  postTaperLink: "높이·테이퍼 연결",
  postLingualBevelMm: "설측 사면",
  postLabialBevelMm: "순측 사면",
  postTopPlaneCode: "교합 대상",
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
    case "postLingualBevelMm":
      return m.postLingualBevelMm != null && m.postLingualBevelMm > 0
        ? `${cleanNum(m.postLingualBevelMm, 1)}mm`
        : "없음";
    case "postLabialBevelMm":
      return m.postLabialBevelMm != null && m.postLabialBevelMm > 0
        ? `${cleanNum(m.postLabialBevelMm, 1)}mm`
        : "없음";
    case "postTopPlaneCode":
      return "-";
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

  const linked = (p.postTaperLink ?? 1) >= 0.5;
  const bridgeCtx = {
    isBridge: Boolean(m.isBridge),
    retainerCount: m.bridgeRetainerCount ?? (m.isBridge ? 2 : 1),
  };
  const surface = postRetentionSurface(m.postWallRadiusMm);

  switch (field) {
    case "maxDiameterMm": {
      const snapped = snapMaxDiameterMm(num);
      const base = Math.max(m.maxDiameterMm, 1);
      const ratio = snapped / base;
      return {
        marginSizeScale: Number(clampParam("marginSizeScale", p.marginSizeScale * ratio).toFixed(3)),
      };
    }
    case "postTaperLink": {
      const nextLinked = num >= 0.5 ? 1 : 0;
      const maxTaper = bridgeCtx.isBridge
        ? RETENTION_BRIDGE_MAX_TAPER_DEG
        : RETENTION_SINGLE_MAX_TAPER_DEG;
      if (nextLinked === 0) {
        return {
          postTaperLink: 0,
          postTaperDeg: Number(
            Math.min(maxTaper, Math.max(RETENTION_SINGLE_MIN_TAPER_DEG, m.postTaperDeg)).toFixed(2),
          ),
        };
      }
      return {
        postTaperLink: 1,
        postTaperDeg: computeOptimalPostTaperDeg(m.postHeightMm, bridgeCtx, surface),
      };
    }
    case "postHeightMm": {
      const delta = num - m.postHeightMm;
      const nextOffset = Number(
        clampParam("postHeightOffsetMm", p.postHeightOffsetMm + delta).toFixed(2),
      );
      if (linked) {
        return {
          postHeightOffsetMm: nextOffset,
          postTaperDeg: computeOptimalPostTaperDeg(num, bridgeCtx, surface),
          postTaperLink: 1,
        };
      }
      return {
        postHeightOffsetMm: nextOffset,
      };
    }
    case "postTaperDeg": {
      const maxTaper = bridgeCtx.isBridge
        ? RETENTION_BRIDGE_MAX_TAPER_DEG
        : RETENTION_SINGLE_MAX_TAPER_DEG;
      const minTaper =
        linked && bridgeCtx.isBridge
          ? RETENTION_BRIDGE_MIN_TAPER_DEG
          : RETENTION_SINGLE_MIN_TAPER_DEG;
      if (linked) {
        const targetTaper = Number(Math.min(maxTaper, Math.max(minTaper, num)).toFixed(2));
        const targetHeight = computeOptimalPostHeightMmFromTaper(targetTaper, bridgeCtx, surface);
        const deltaH = targetHeight - m.postHeightMm;
        return {
          postTaperDeg: targetTaper,
          postHeightOffsetMm: Number(
            clampParam("postHeightOffsetMm", p.postHeightOffsetMm + deltaH).toFixed(2),
          ),
          postTaperLink: 1,
        };
      }
      const delta = num - m.postTaperDeg;
      return {
        postTaperDeg: Number(
          Math.min(maxTaper, Math.max(RETENTION_SINGLE_MIN_TAPER_DEG, p.postTaperDeg + delta)).toFixed(2),
        ),
      };
    }
    case "postLingualBevelMm": {
      if (num < 0) return { postLingualBevelMm: -1 };
      if (num === 0) return { postLingualBevelMm: 0 };
      const maxBevel = Math.max(0.5, Number((m.postHeightMm - 0.5).toFixed(1)));
      return {
        postLingualBevelMm: Number(Math.min(maxBevel, Math.max(0.5, num)).toFixed(1)),
      };
    }
    case "postLabialBevelMm": {
      if (num <= 0) return { postLabialBevelMm: 0 };
      const maxBevel = Math.max(0.5, Number((m.postHeightMm - 0.5).toFixed(1)));
      return {
        postLabialBevelMm: Number(Math.min(maxBevel, Math.max(0.5, num)).toFixed(1)),
      };
    }
    case "postTopPlaneCode": {
      return { postTopPlaneCode: num >= 0.5 ? 1 : 0 };
    }
    case "occlusalClearanceMm": {
      if (m.occlusalClearanceMm == null) return {};
      const minOcc = minOcclusalClearanceMmForTooth(item.toothNumber);
      return {
        occlusalClearanceMm: Number(
          Math.max(minOcc, clampParam("occlusalClearanceMm", num)).toFixed(2),
        ),
        postHeightOffsetMm: 0,
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

function PostHeightTaperLinkButton({
  linked,
  isBridge,
  disabled,
  onToggle,
}: {
  linked: boolean;
  isBridge: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const title = linked
    ? isBridge
      ? "높이·테이퍼 연결됨 · 브리지 보정 (클릭하면 개별 조절)"
      : "높이·테이퍼 연결됨 (클릭하면 개별 조절)"
    : "높이·테이퍼 연결 해제됨 (클릭하면 최적 접착력으로 자동 조절)";
  const lineClass = linked
    ? "border-primary/45"
    : "border-dashed border-muted-foreground/35";

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-4 right-[8.875rem] top-4 flex w-[0.8125rem] flex-col"
      >
        <span
          className={cn(
            "block h-[calc(50%-0.625rem)] w-full rounded-tl-[0.2rem] border-l border-t",
            lineClass,
          )}
        />
        <span
          className={cn(
            "mt-auto block h-[calc(50%-0.625rem)] w-full rounded-bl-[0.2rem] border-b border-l",
            lineClass,
          )}
        />
      </div>
      <button
        type="button"
        disabled={disabled}
        aria-label={linked ? "포스트 높이와 테이퍼 연결 해제" : "포스트 높이와 테이퍼 연결"}
        aria-pressed={linked}
        title={disabled ? undefined : title}
        onClick={onToggle}
        className={cn(
          "absolute right-[9.0625rem] top-1/2 z-[1] flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded transition-colors disabled:opacity-50",
          linked
            ? "bg-primary/10 text-primary ring-1 ring-primary/30 hover:bg-primary/20"
            : "bg-background text-muted-foreground/70 ring-1 ring-border hover:bg-muted hover:text-foreground",
        )}
      >
        {linked ? (
          <Link2 className="h-3 w-3 rotate-90" />
        ) : (
          <Link2Off className="h-3 w-3 rotate-90" />
        )}
      </button>
    </>
  );
}

/** 표시 토글. 보일 때만 강조한다(기본은 가림). */
function VisibilityIconButton({
  shown,
  label,
  tip,
  onClick,
  children,
}: {
  shown: boolean;
  label: string;
  tip?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const text = tip ?? `${label} ${shown ? "가리기" : "보이기"}`;
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
      {children}
      {shown ? null : (
        <span
          aria-hidden
          className="pointer-events-none absolute h-px w-4 rotate-45 rounded bg-current"
        />
      )}
    </button>
  );
}

function ScanbodyButton({
  shown,
  label,
  onClick,
}: {
  shown: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <VisibilityIconButton
      shown={shown}
      label={`${label} 스캔바디`}
      onClick={onClick}
    >
      <Hexagon className="h-3.5 w-3.5" />
    </VisibilityIconButton>
  );
}

function PredictedCrownButton({
  shown,
  label,
  onClick,
}: {
  shown: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <VisibilityIconButton
      shown={shown}
      label={`${label} 예측 크라운`}
      tip={
        shown
          ? `${label} 예측 크라운 가리기`
          : "컷백 기준인 예측 크라운을 반투명으로 겹칩니다."
      }
      onClick={onClick}
    >
      <Crown className="h-3.5 w-3.5" />
    </VisibilityIconButton>
  );
}

/** 「지오메디 Ø4.5×9mm (상부캡) · rms」에서 직경×길이까지만 남긴다. */
function formatScanbodyPanelValue(label: string): string {
  const withoutCap = label.replace(/\s*\(상부캡\)\s*/g, " ").replace(/\s+/g, " ").trim();
  const sized = withoutCap.match(/^(.*?Ø\s*[\d.]+\s*[×xX]\s*[\d.]+\s*mm)/);
  return (sized?.[1] ?? withoutCap).trim();
}

function DetailRow({
  label,
  value,
  warning,
  warningTooltip,
  hint,
}: {
  label: string;
  value: string;
  warning?: boolean;
  warningTooltip?: ReactNode;
  hint?: ReactNode;
}) {
  const valueNode = (
    <span
      className={cn(
        "ml-auto min-w-0 truncate text-right tabular-nums text-foreground",
        warning &&
          "rounded border border-amber-400/90 bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-300",
      )}
      title={warningTooltip ? undefined : value}
    >
      {value}
    </span>
  );
  const labelNode = hint ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="shrink-0 cursor-help text-muted-foreground">{label}</span>
      </TooltipTrigger>
      <TooltipContent side="left" align="center" className="z-[520] max-w-[16rem] text-xs leading-relaxed">
        {hint}
      </TooltipContent>
    </Tooltip>
  ) : (
    <span className="shrink-0 text-muted-foreground">{label}</span>
  );
  const row = (
    <div className="flex items-center gap-2 py-0.5 pl-2 text-[0.8125rem] leading-snug">
      {labelNode}
      {valueNode}
    </div>
  );
  // 풀스크린 디자인 다이얼로그(z-480) 위에 보이려면 z-520이 필요하다.
  if (!warningTooltip) return row;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      <TooltipContent side="left" align="center" className="z-[520] text-xs leading-relaxed">
        {warningTooltip}
      </TooltipContent>
    </Tooltip>
  );
}

function EditableNumberRow({
  label,
  value,
  min,
  max = Infinity,
  step,
  digits = 2,
  prefix,
  suffix,
  disabled,
  warning,
  warningTooltip,
  hint,
  leading,
  inactive,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max?: number;
  step: number;
  digits?: number;
  prefix?: string;
  suffix?: string;
  disabled?: boolean;
  warning?: boolean;
  warningTooltip?: ReactNode;
  hint?: ReactNode;
  /** 입력 왼쪽. 사면 체크처럼 값과 한 묶음으로 둔다. */
  leading?: ReactNode;
  /** 체크 전. 숫자는 보이지만 형상에는 아직 없다. */
  inactive?: boolean;
  onCommit: (next: number) => void;
}) {
  const formatVal = (v: number) => cleanNum(v, digits);
  const [draft, setDraft] = useState(() => formatVal(value));
  const [editing, setEditing] = useState(false);
  const [scrubValue, setScrubValue] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const holdRef = useRef(false);
  const seenValueRef = useRef(value);
  const lastCommittedRef = useRef(value);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
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
    lastCommittedRef.current = value;
    if (changed) holdRef.current = false;
    if (editing || scrubValue != null || holdRef.current) return;
    setDraft(formatVal(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, scrubValue, value, digits]);

  const hasMax = Number.isFinite(max);

  // 직접 입력 중 Enter·포커스 이동 전이라도 유효 범위 숫자를 입력하고 잠시 멈추면 형상에 바로 반영한다.
  useEffect(() => {
    if (!editing) return;
    const trimmed = draft.trim();
    if (!trimmed || /[.\-+]$/.test(trimmed)) return;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < min || (hasMax && parsed > max)) return;
    const rounded = Number(parsed.toFixed(digits));
    if (Math.abs(rounded - lastCommittedRef.current) < 1e-4) return;
    const timer = window.setTimeout(() => {
      lastCommittedRef.current = rounded;
      holdRef.current = true;
      onCommitRef.current(rounded);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [draft, editing, min, max, hasMax, digits]);

  const clampVal = (raw: number) => {
    const snapped = Number((Math.round(raw / step) * step).toFixed(digits + 1));
    const bounded = hasMax ? Math.min(max, Math.max(min, snapped)) : Math.max(min, snapped);
    return Number(bounded.toFixed(digits));
  };

  const stepBy = (dir: 1 | -1) => {
    if (disabled) return;
    const base = scrubValue ?? value;
    const next = clampVal(base + dir * step);
    lastCommittedRef.current = next;
    holdRef.current = true;
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
    const bounded = hasMax ? Math.min(max, Math.max(min, parsed)) : Math.max(min, parsed);
    const clamped = Number(bounded.toFixed(digits));
    setDraft(formatVal(clamped));
    if (Math.abs(clamped - lastCommittedRef.current) >= 1e-4) {
      lastCommittedRef.current = clamped;
      holdRef.current = true;
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
      lastCommittedRef.current = finalVal;
      holdRef.current = true;
      onCommit(finalVal);
    }
  };

  const inputBox = (
    <div
      className={cn(
        "flex h-7 items-center overflow-hidden rounded-md border bg-background pl-1.5 pr-0.5 transition-colors focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/40",
        leading ? "min-w-0 flex-1 truncate" : "ml-auto w-[7.25rem] shrink-0",
        inactive && "border-dashed",
        warning &&
          "border-amber-400/90 bg-amber-500/10 focus-within:border-amber-500 focus-within:ring-amber-500/40",
        scrubValue != null &&
          (warning ? "border-amber-500 bg-amber-500/15" : "border-primary bg-primary/5"),
        disabled && "opacity-60",
      )}
    >
      {prefix ? (
        <span
          className={cn(
            "shrink-0 select-none text-xs text-muted-foreground",
            warning && "text-amber-700/80 dark:text-amber-300/80",
          )}
        >
          {prefix}
        </span>
      ) : null}
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        aria-label={label}
        disabled={disabled && !editing}
        value={draft}
        readOnly={!editing}
        className={cn(
          "h-full w-full min-w-[2.5rem] flex-1 bg-transparent px-1 text-right text-[0.8125rem] font-medium tabular-nums text-foreground outline-none",
          inactive && "text-muted-foreground",
          warning && "text-amber-700 dark:text-amber-300",
          !editing && !disabled && "cursor-ew-resize select-none",
        )}
        title={
          warningTooltip
            ? undefined
            : disabled
              ? undefined
              : inactive
                ? "체크하면 이 높이부터 깎습니다"
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
        <span
          className={cn(
            "shrink-0 select-none pr-1 text-xs tabular-nums text-muted-foreground",
            warning && "text-amber-700/80 dark:text-amber-300/80",
          )}
        >
          {suffix}
        </span>
      ) : null}
      <div
        className={cn(
          "flex h-full shrink-0 flex-col justify-center border-l pl-0.5",
          warning && "border-amber-400/60",
        )}
      >
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled || (hasMax && value >= max - 1e-5)}
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
  );

  const labelNode = (
    <span
      className={cn(
        "min-w-0 shrink truncate select-none text-muted-foreground",
        !disabled && "cursor-ew-resize hover:text-foreground",
        hint && "cursor-help",
      )}
      title={
        hint || warningTooltip
          ? undefined
          : disabled
            ? undefined
            : "좌우로 드래그해 값 조절"
      }
      onPointerDown={startScrub(false)}
      onPointerMove={moveScrub}
      onPointerUp={endScrub}
      onPointerCancel={endScrub}
    >
      {label}
    </span>
  );
  const row = (
    <div className="flex items-center gap-2 py-0.5 pl-2 text-[0.8125rem] leading-snug">
      {hint ? (
        <Tooltip>
          <TooltipTrigger asChild>{labelNode}</TooltipTrigger>
          <TooltipContent side="left" align="center" className="z-[520] max-w-[16rem] text-xs leading-relaxed">
            {hint}
          </TooltipContent>
        </Tooltip>
      ) : (
        labelNode
      )}
      {leading ? (
        <div className="ml-auto flex w-[7.25rem] shrink-0 items-center gap-1.5">
          {leading}
          {inputBox}
        </div>
      ) : (
        inputBox
      )}
    </div>
  );
  // 풀스크린 디자인 다이얼로그(z-480) 위에 보이려면 z-520이 필요하다.
  if (!warningTooltip) return row;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      <TooltipContent side="left" align="center" className="z-[520] text-xs leading-relaxed">
        {warningTooltip}
      </TooltipContent>
    </Tooltip>
  );
}

function posteriorBevelHint(side: "설측" | "협측") {
  return (
    <>
      마진에서 {side} 사면이 시작되는 높이입니다.
      <br />
      삽입축이 기울어 어벗이 가상 크라운 {side}으로 치우치면 그 쪽을 깎습니다.
    </>
  );
}

/** 포스트 상단 교합 대상. 교합면·대합치 중 하나만 켠다. */
function PostTopPlaneRow({
  value,
  disabled,
  onCommit,
}: {
  value: number;
  disabled?: boolean;
  onCommit: (next: number) => void;
}) {
  const useArch = value < 0.5;
  const option = (
    code: 0 | 1,
    label: string,
    hint: ReactNode,
  ) => {
    const on = code === 0 ? useArch : !useArch;
    return (
      <label className="inline-flex items-center gap-1.5">
        <Checkbox
          checked={on}
          disabled={disabled}
          aria-label={label}
          onCheckedChange={(state) => {
            if (disabled) return;
            if (state === true) onCommit(code);
          }}
          onPointerDown={(e) => e.stopPropagation()}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help text-foreground">{label}</span>
          </TooltipTrigger>
          <TooltipContent side="left" align="center" className="z-[520] max-w-[16rem] text-xs leading-relaxed">
            {hint}
          </TooltipContent>
        </Tooltip>
      </label>
    );
  };
  return (
    <div className="flex items-center gap-2 py-0.5 pl-2 text-[0.8125rem] leading-snug">
      <span className="shrink-0 text-muted-foreground">교합 대상</span>
      <div className="ml-auto flex items-center gap-3">
        {option(
          0,
          "교합면",
          <>
            포스트 상단을 악궁 교합면에 평행하게 그립니다.
          </>,
        )}
        {option(
          1,
          "대합치",
          <>
            포스트 상단을 대합치 평면에 평행하게 그립니다.
          </>,
        )}
      </div>
    </div>
  );
}

/** 설측·협측 사면. 체크하기 전에는 숫자를 보여 주기만 하고 형상에 넣지 않는다. */
function BevelNumberRow({
  label,
  hint,
  appliedMm,
  paramMm,
  suggestedMm,
  postHeightMm,
  disabled,
  onCommit,
}: {
  label: string;
  hint: ReactNode;
  appliedMm: number | null;
  paramMm: number;
  suggestedMm: number | null;
  postHeightMm: number;
  disabled?: boolean;
  onCommit: (next: number) => void;
}) {
  const cap = Math.max(0.5, Number((postHeightMm - 0.5).toFixed(1)));
  const raw =
    suggestedMm != null && suggestedMm >= 0.5 ? suggestedMm : Math.max(0.5, postHeightMm * 0.5);
  const fallback = Number(Math.min(cap, Math.max(0.5, raw)).toFixed(1));
  const enabledFromProps = (appliedMm != null && appliedMm > 0) || paramMm >= 0.5;
  const [pending, setPending] = useState<boolean | null>(null);
  const enabled = pending ?? enabledFromProps;
  const [held, setHeld] = useState(() =>
    appliedMm != null && appliedMm > 0 ? appliedMm : paramMm >= 0.5 ? paramMm : fallback,
  );
  const heldRef = useRef(held);
  const editedRef = useRef(false);
  const seenAppliedRef = useRef(enabledFromProps);
  heldRef.current = held;

  useEffect(() => {
    setPending(null);
  }, [paramMm, appliedMm]);

  useEffect(() => {
    if (appliedMm != null && appliedMm > 0) {
      seenAppliedRef.current = true;
      heldRef.current = appliedMm;
      setHeld(appliedMm);
      return;
    }
    if (paramMm >= 0.5) {
      seenAppliedRef.current = true;
      heldRef.current = paramMm;
      setHeld(paramMm);
      return;
    }
    if (!seenAppliedRef.current && !editedRef.current) {
      heldRef.current = fallback;
      setHeld(fallback);
    }
  }, [appliedMm, paramMm, fallback]);

  const shown = enabled ? (appliedMm != null && appliedMm > 0 ? appliedMm : held) : held;

  return (
    <EditableNumberRow
      label={label}
      hint={hint}
      value={shown}
      min={0.5}
      max={cap}
      step={0.1}
      digits={1}
      suffix="mm"
      disabled={disabled}
      inactive={!enabled}
      leading={
        <Checkbox
          checked={enabled}
          disabled={disabled}
          aria-label={`${label} 적용`}
          title={enabled ? `${label} 해제` : `${label} 적용`}
          onCheckedChange={(state) => {
            if (disabled) return;
            if (state === true) {
              setPending(true);
              onCommit(heldRef.current);
            } else {
              setPending(false);
              onCommit(0);
            }
          }}
          onPointerDown={(e) => e.stopPropagation()}
        />
      }
      onCommit={(next) => {
        editedRef.current = true;
        heldRef.current = next;
        setHeld(next);
        if (enabled) onCommit(next);
      }}
    />
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
          "min-w-0 shrink truncate select-none text-muted-foreground",
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
          "ml-auto flex h-7 w-[7.25rem] shrink-0 items-center overflow-hidden rounded-md border bg-background pl-1 pr-0.5 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/40",
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
  warning,
  warningTooltip,
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
  warning?: boolean;
  warningTooltip?: ReactNode;
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
      warning && "text-amber-700 dark:text-amber-300",
      !active && !disabled && "cursor-ew-resize select-none",
    );

  const row = (
    <div className="flex items-center gap-2 py-0.5 pl-2 text-[0.8125rem] leading-snug">
      <span
        className={cn(
          "min-w-0 shrink truncate select-none text-muted-foreground",
          !disabled && "cursor-ew-resize hover:text-foreground",
        )}
        title={
          warningTooltip
            ? undefined
            : disabled
              ? undefined
              : "좌우로 드래그하면 구간이 같이 움직입니다"
        }
        onPointerDown={startScrub("both")}
        onPointerMove={moveScrub}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
      >
        {label}
      </span>
      <div
        className={cn(
          "ml-auto flex h-7 w-[7.25rem] shrink-0 items-center overflow-hidden rounded-md border bg-background pl-1 pr-0.5 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/40",
          warning &&
            "border-amber-400/90 bg-amber-500/10 focus-within:border-amber-500 focus-within:ring-amber-500/40",
          scrub &&
            (warning ? "border-amber-500 bg-amber-500/15" : "border-primary bg-primary/5"),
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
  if (!warningTooltip) return row;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      <TooltipContent side="left" align="center" className="z-[520] text-xs leading-relaxed">
        {warningTooltip}
      </TooltipContent>
    </Tooltip>
  );
}

function BridgeLinkMark({ fromTooth, toTooth }: { fromTooth: string; toTooth: string }) {
  return (
    <div className="relative h-4">
      <span aria-hidden className="absolute bottom-0 left-2.5 top-0 w-px -translate-x-1/2 bg-primary/70" />
      <span
        role="img"
        aria-label={`#${fromTooth}와 #${toTooth} 브리지 연결`}
        title="브리지 연결"
        className="absolute left-2.5 top-1/2 flex h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-background text-primary"
      >
        <Link2 className="h-3 w-3" />
      </span>
    </div>
  );
}

/** 치아 행 왼쪽 레일. 싱글·브리지 모두 같은 들여쓰기에 수직+수평(가지)선을 그린다. */
function BridgeRail({ linkedToPrev, linkedToNext }: { linkedToPrev: boolean; linkedToNext: boolean }) {
  const inBridge = linkedToPrev || linkedToNext;
  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute left-2.5 w-px -translate-x-1/2 bg-primary/70"
        style={
          inBridge
            ? {
                top: linkedToPrev ? 0 : "0.875rem",
                bottom: linkedToNext ? 0 : undefined,
                height: linkedToNext ? undefined : "0.875rem",
              }
            : {
                top: "0.5rem",
                height: "0.75rem",
              }
        }
      />
      <span
        aria-hidden
        className="pointer-events-none absolute left-2.5 top-[0.875rem] h-px w-3.5 bg-primary/70"
      />
    </>
  );
}

export function PracticeCustomAbutmentDesignTree({
  items,
  toothWorks,
  visibleTeeth,
  selectedTeeth,
  redesigning,
  onToggleVisible,
  onSetAllVisible,
  shownScanbodies,
  onToggleScanbody,
  onSetAllScanbodies,
  shownPredictedCrowns,
  onTogglePredictedCrown,
  onSetAllPredictedCrowns,
  onSelect,
  onRegenerate,
  onRegenerateTooth,
  onRepickScanbody,
  onEditField,
  expanded,
  onExpandedChange,
  className,
}: {
  shownScanbodies: Record<string, boolean>;
  onToggleScanbody: (toothNumber: string) => void;
  onSetAllScanbodies: (shown: boolean) => void;
  shownPredictedCrowns: Record<string, boolean>;
  onTogglePredictedCrown: (toothNumber: string) => void;
  onSetAllPredictedCrowns: (shown: boolean) => void;
  items: readonly DesignedCustomAbutment[];
  toothWorks?: readonly ToothBridgeMetaItem[] | null;
  visibleTeeth: Record<string, boolean>;
  selectedTeeth: readonly string[];
  redesigning: readonly string[];
  onToggleVisible: (toothNumber: string) => void;
  onSetAllVisible: (visible: boolean) => void;
  onSelect: (toothNumber: string, additive: boolean) => void;
  onRegenerate?: () => void;
  onRegenerateTooth?: (toothNumber: string) => void;
  /** 스캔바디 위치를 다시 찍는다. 자동 배정이 틀렸을 때 쓴다. */
  onRepickScanbody?: (toothNumbers: readonly string[]) => void;
  onEditField?: (
    item: DesignedCustomAbutment,
    field: AbutmentInfoFieldKey,
    nextValue: AbutmentInfoEditValue,
  ) => void;
  expanded: Record<string, boolean>;
  onExpandedChange: (next: Record<string, boolean>) => void;
  className?: string;
}) {
  const orderedItems = useMemo(() => sortAbutmentInfoPanelItems(items), [items]);
  const primaryTooth = selectedTeeth[selectedTeeth.length - 1] ?? null;
  const allOpen = orderedItems.length > 0 && orderedItems.every((it) => expanded[it.toothNumber]);
  const allVisible = orderedItems.every((it) => visibleTeeth[it.toothNumber] !== false);
  const anyScanbody = orderedItems.some((it) => shownScanbodies[it.toothNumber]);
  const anyPredictedCrown = orderedItems.some((it) => shownPredictedCrowns[it.toothNumber]);
  const editable = Boolean(onEditField);

  return (
    <div
      className={cn(
        "pointer-events-auto flex min-h-0 w-full min-w-0 shrink-0 flex-col overflow-x-hidden rounded-lg border bg-background/95 shadow-sm",
        className,
      )}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        data-snap-drag=""
        title="끌어 옮기면 귀퉁이나 다른 패널에 붙습니다"
        className="sticky top-0 z-[1] flex cursor-grab touch-none select-none items-center gap-0.5 border-b bg-background py-1.5 pl-3 pr-1.5 text-[0.8125rem] font-semibold text-foreground active:cursor-grabbing"
      >
        <span className="shrink-0">어벗 정보</span>
        <ScanbodyButton
          shown={anyScanbody}
          label="모든"
          onClick={() => onSetAllScanbodies(!anyScanbody)}
        />
        <PredictedCrownButton
          shown={anyPredictedCrown}
          label="모든"
          onClick={() => onSetAllPredictedCrowns(!anyPredictedCrown)}
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
          {onRepickScanbody ? (
            <button
              type="button"
              className={cn(headerBtn, "disabled:opacity-40")}
              aria-label="스캔바디 위치 다시 지정"
              title="스캔바디 상단을 클릭해 어벗 위치를 지정합니다."
              disabled={redesigning.length > 0}
              onClick={() => {
                const targets =
                  selectedTeeth.length > 0
                    ? selectedTeeth
                    : orderedItems.map((it) => it.toothNumber);
                onRepickScanbody(targets);
              }}
            >
              <Hexagon className="h-3.5 w-3.5" />
            </button>
          ) : null}
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
          <button
            type="button"
            className={headerBtn}
            aria-label={allOpen ? "모두 접기" : "모두 펼치기"}
            title={allOpen ? "모두 접기" : "모두 펼치기"}
            aria-expanded={allOpen}
            onClick={() =>
              onExpandedChange(
                Object.fromEntries(orderedItems.map((it) => [it.toothNumber, !allOpen])),
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
      {selectedTeeth.length > 1 ? (
        <p className="px-3 pt-1.5 text-[0.75rem] leading-relaxed text-muted-foreground">
          {selectedTeeth.length}개 선택입니다.
          <br />
          수치와 검볼은 같이 바뀝니다.
        </p>
      ) : null}
      <ul className="px-1.5 py-1.5">
        {orderedItems.map((item, index) => {
          const tooth = item.toothNumber;
          const prevTooth = index > 0 ? orderedItems[index - 1]!.toothNumber : "";
          const nextTooth = orderedItems[index + 1]?.toothNumber ?? "";
          const linkedToPrev = Boolean(prevTooth) && teethShareBridgeSpan(prevTooth, tooth, toothWorks);
          const linkedToNext = Boolean(nextTooth) && teethShareBridgeSpan(tooth, nextTooth, toothWorks);
          const open = Boolean(expanded[tooth]);
          const visible = visibleTeeth[tooth] !== false;
          const selected = selectedTeeth.includes(tooth);
          const primary = primaryTooth === tooth;
          const busy = redesigning.includes(tooth);
          const m = item.metrics;
          const conn = item.fixture.connectionSpec;
          const rowDisabled = busy || !editable;

          return (
            <li key={tooth} className={cn("relative", !linkedToPrev && index > 0 && "mt-1")}>
              {linkedToPrev ? <BridgeLinkMark fromTooth={prevTooth} toTooth={tooth} /> : null}
              <div className="relative">
              <BridgeRail linkedToPrev={linkedToPrev} linkedToNext={linkedToNext} />
              <div className="min-w-0 pl-6">
              <div
                className={cn(
                  "flex items-center gap-0.5 rounded-md py-0.5 pl-0.5 pr-0.5 text-[0.8125rem]",
                  primary
                    ? "bg-primary/10 ring-1 ring-primary/40"
                    : selected
                      ? "bg-primary/5 ring-1 ring-primary/25"
                      : "hover:bg-muted/60",
                )}
              >
                <button
                  type="button"
                  className="flex h-6 shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-left font-semibold text-foreground"
                  title="클릭하면 이 어벗을 가운데로 확대합니다. Shift로 여러 개."
                  onClick={(e) => onSelect(tooth, e.shiftKey)}
                >
                  #{tooth}
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> : null}
                </button>
                <ScanbodyButton
                  shown={Boolean(shownScanbodies[tooth])}
                  label={`#${tooth}`}
                  onClick={() => onToggleScanbody(tooth)}
                />
                <PredictedCrownButton
                  shown={Boolean(shownPredictedCrowns[tooth])}
                  label={`#${tooth}`}
                  onClick={() => onTogglePredictedCrown(tooth)}
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
                  {onRepickScanbody ? (
                    <button
                      type="button"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                      aria-label={`#${tooth} 위치 다시 지정`}
                      title={
                        selectedTeeth.length > 1 && selectedTeeth.includes(tooth)
                          ? "선택한 치아의 스캔바디 위치를 다시 찍습니다."
                          : `#${tooth} 스캔바디 위치를 다시 찍습니다.`
                      }
                      disabled={redesigning.length > 0 || busy}
                      onClick={() => {
                        const targets =
                          selectedTeeth.length > 1 && selectedTeeth.includes(tooth)
                            ? selectedTeeth
                            : [tooth];
                        onRepickScanbody(targets);
                      }}
                    >
                      <Hexagon className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
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
                    {(() => {
                      const supraTooltip = m.supragingivalRaisedForStrength ? (
                        <>
                          포스트 파절 방지 두께 확보를 위해 치은 연상으로 올렸습니다.
                          <br />
                          음수는 치은선 위 높이입니다.
                        </>
                      ) : undefined;
                      return editable ? (
                        <EditableRangeRow
                          label="치은 연하"
                          minValue={m.marginSubgMinMm ?? item.params.marginSubgMinMm ?? 0.5}
                          maxValue={m.marginSubgMaxMm ?? item.params.marginSubgMaxMm ?? 1}
                          min={CUSTOM_ABUTMENT_PARAM_SPECS.marginSubgMinMm.min}
                          max={CUSTOM_ABUTMENT_PARAM_SPECS.marginSubgMaxMm.max}
                          step={0.1}
                          digits={1}
                          suffix="mm"
                          disabled={rowDisabled}
                          warning={Boolean(m.supragingivalRaisedForStrength)}
                          warningTooltip={supraTooltip}
                          onCommit={(minV, maxV) =>
                            onEditField?.(item, "marginSubgMm", { min: minV, max: maxV })
                          }
                        />
                      ) : (
                        <DetailRow
                          label="치은 연하"
                          value={formatAbutmentInfoFieldValue(m, "marginSubgMm")}
                          warning={Boolean(m.supragingivalRaisedForStrength)}
                          warningTooltip={supraTooltip}
                        />
                      );
                    })()}
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
                        label="마진 필레 R"
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
                      <DetailRow label="마진 필레 R" value={`${m.marginFilletRadiusMm}mm`} />
                    )}
                  </InfoGroup>
                  <InfoGroup title="포스트">
                    {(() => {
                      const postTaperLinked = (item.params.postTaperLink ?? 1) >= 0.5;
                      const taperMin =
                        postTaperLinked && m.isBridge
                          ? RETENTION_BRIDGE_MIN_TAPER_DEG
                          : RETENTION_SINGLE_MIN_TAPER_DEG;
                      const taperMax = m.isBridge
                        ? RETENTION_BRIDGE_MAX_TAPER_DEG
                        : RETENTION_SINGLE_MAX_TAPER_DEG;
                      const taperCheck = evaluatePostTaperRetention(
                        m.postHeightMm,
                        {
                          isBridge: Boolean(m.isBridge),
                          retainerCount: m.bridgeRetainerCount,
                        },
                        postRetentionSurface(m.postWallRadiusMm),
                      );
                      const effectiveIdealDeg =
                        m.idealPostTaperDeg != null
                          ? Math.min(m.idealPostTaperDeg, taperCheck.idealTaperDeg)
                          : taperCheck.idealTaperDeg;
                      const taperLimitClamped =
                        effectiveIdealDeg < taperCheck.minTaperDeg - 1e-4 &&
                        (postTaperLinked || m.postTaperDeg <= taperCheck.minTaperDeg + 0.12);
                      const taperLimitTooltip = taperLimitClamped ? (
                        <>
                          적정값 {cleanNum(effectiveIdealDeg, 1)}° · 최소값{" "}
                          {cleanNum(taperCheck.minTaperDeg, 1)}°
                          <br />
                          포스트 높이는 유지하고 테이퍼만 최소값으로 맞췄습니다.
                        </>
                      ) : undefined;
                      return (
                        <div className="relative">
                          {editable ? (
                            <EditableNumberRow
                              label="높이"
                              value={m.postHeightMm}
                              min={RETENTION_MIN_POST_HEIGHT_MM}
                              max={RETENTION_MAX_POST_HEIGHT_MM}
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
                            <PostHeightTaperLinkButton
                              linked={postTaperLinked}
                              isBridge={Boolean(m.isBridge)}
                              disabled={rowDisabled}
                              onToggle={() =>
                                onEditField?.(item, "postTaperLink", postTaperLinked ? 0 : 1)
                              }
                            />
                          ) : null}
                          {editable ? (
                            <EditableNumberRow
                              label="테이퍼"
                              value={m.postTaperDeg}
                              min={taperMin}
                              max={taperMax}
                              step={0.1}
                              digits={1}
                              suffix="°"
                              disabled={rowDisabled}
                              warning={taperLimitClamped}
                              warningTooltip={taperLimitTooltip}
                              onCommit={(v) => onEditField?.(item, "postTaperDeg", v)}
                            />
                          ) : (
                            <DetailRow
                              label="테이퍼"
                              value={`${m.postTaperDeg}°`}
                              warning={taperLimitClamped}
                              warningTooltip={taperLimitTooltip}
                            />
                          )}
                        </div>
                      );
                    })()}
                    <BevelNumberRow
                      label="설측 사면"
                      hint={
                        isAnteriorTooth(item.toothNumber) ? (
                          "마진에서 설측 사면이 시작되는 높이입니다."
                        ) : (
                          posteriorBevelHint("설측")
                        )
                      }
                      appliedMm={
                        m.postLingualBevelMm != null && m.postLingualBevelMm > 0
                          ? m.postLingualBevelMm
                          : null
                      }
                      paramMm={item.params.postLingualBevelMm}
                      suggestedMm={m.suggestedPostLingualBevelMm ?? null}
                      postHeightMm={m.postHeightMm}
                      disabled={rowDisabled}
                      onCommit={(v) => onEditField?.(item, "postLingualBevelMm", v)}
                    />
                    <BevelNumberRow
                      label={isAnteriorTooth(item.toothNumber) ? "순측 사면" : "협측 사면"}
                      hint={
                        isAnteriorTooth(item.toothNumber) ? (
                          <>
                            마진에서 순측 사면이 시작되는 높이입니다.
                            <br />
                            절단연 크라운 두께가 부족하면 필요한 높이가 잡힙니다.
                          </>
                        ) : (
                          posteriorBevelHint("협측")
                        )
                      }
                      appliedMm={
                        m.postLabialBevelMm != null && m.postLabialBevelMm > 0
                          ? m.postLabialBevelMm
                          : null
                      }
                      paramMm={item.params.postLabialBevelMm}
                      suggestedMm={m.suggestedPostLabialBevelMm ?? null}
                      postHeightMm={m.postHeightMm}
                      disabled={rowDisabled}
                      onCommit={(v) => onEditField?.(item, "postLabialBevelMm", v)}
                    />
                    {editable ? (
                      <PostTopPlaneRow
                        value={item.params.postTopPlaneCode ?? 0}
                        disabled={rowDisabled}
                        onCommit={(v) => onEditField?.(item, "postTopPlaneCode", v)}
                      />
                    ) : (
                      <DetailRow
                        label="교합 대상"
                        value={(item.params.postTopPlaneCode ?? 0) >= 0.5 ? "대합치" : "교합면"}
                      />
                    )}
                    {m.occlusalClearanceMm != null && editable ? (
                      <EditableNumberRow
                        label="대합 거리"
                        value={m.occlusalClearanceMm}
                        min={minOcclusalClearanceMmForTooth(item.toothNumber)}
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
              </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

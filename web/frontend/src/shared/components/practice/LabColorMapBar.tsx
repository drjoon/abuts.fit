// 기공소 AI 디자인 — 칼라맵 범위 막대. 모드(간섭·두께·내면)와 색 범위를 고른다.
// related files:
// - web/frontend/src/shared/practice/labColorMap.ts
// - web/frontend/src/shared/components/practice/LabProsthesisAiDesignDialog.tsx
import { Fragment, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  clampColorMapHalf,
  COLOR_MAP_MODES,
  COLOR_MAP_RANGES_MM,
  colorMapGradientCss,
  DEFAULT_COLOR_MAP,
  formatColorMapMm,
  type ColorMapMode,
  type ColorMapState,
} from "@/shared/practice/labColorMap";
import { cn } from "@/shared/ui/cn";

type Props = {
  state: ColorMapState;
  onChange: (next: ColorMapState) => void;
  /** 지대치에서 내면을 만든 치아가 하나라도 있는가. 없으면 내면 모드는 볼 게 없다. */
  hasIntaglio: boolean;
  /** 간섭 모드는 대합·인접 스캔이 있어야 한다. */
  canContact: boolean;
};

export function LabColorMapBar({ state, onChange, hasIntaglio, canContact }: Props) {
  const half = state.half[state.mode];
  const [custom, setCustom] = useState(formatColorMapMm(half));
  useEffect(() => {
    setCustom(formatColorMapMm(half));
  }, [half, state.mode]);

  const setHalf = (mode: ColorMapMode, mm: number) => {
    onChange({
      ...state,
      half: { ...state.half, [mode]: clampColorMapHalf(mm, DEFAULT_COLOR_MAP.half[mode]) },
    });
  };
  const modeInfo = COLOR_MAP_MODES.find((item) => item.id === state.mode)!;
  const disabled = (mode: ColorMapMode) =>
    (mode === "fit" && !hasIntaglio) || (mode === "contact" && !canContact);

  return (
    <div
      className="pointer-events-auto absolute left-1/2 top-full z-10 mt-1.5 w-60 -translate-x-1/2 rounded-md border bg-background/95 p-2 text-[11px] text-foreground shadow-md"
      aria-label="칼라맵"
    >
      <div className="grid grid-cols-3 gap-1">
        {COLOR_MAP_MODES.map((item) => (
          <Button
            key={item.id}
            type="button"
            size="sm"
            variant={state.mode === item.id ? "default" : "outline"}
            className="h-6 px-1 text-[11px]"
            disabled={disabled(item.id)}
            aria-pressed={state.mode === item.id}
            title={
              item.id === "fit" && !hasIntaglio
                ? "지대치 스캔에서 내면을 만든 크라운이 없습니다"
                : item.id === "contact" && !canContact
                  ? "대합 스캔이 없습니다"
                  : item.hint
            }
            onClick={() => onChange({ ...state, mode: item.id })}
          >
            {item.label}
          </Button>
        ))}
      </div>
      <div className="mt-2 flex justify-between whitespace-nowrap tabular-nums leading-none">
        <span>-{formatColorMapMm(half)}mm</span>
        <span>0</span>
        <span>+{formatColorMapMm(half)}mm</span>
      </div>
      <div className="mt-0.5 h-2 rounded-sm" style={{ background: colorMapGradientCss() }} />
      <div className="mt-2 flex items-center gap-1">
        {COLOR_MAP_RANGES_MM.map((mm) => (
          <Button
            key={mm}
            type="button"
            size="sm"
            variant={Math.abs(half - mm) < 1e-6 ? "default" : "outline"}
            className={cn("h-6 flex-1 px-0 text-[11px] tabular-nums")}
            onClick={() => setHalf(state.mode, mm)}
          >
            ±{formatColorMapMm(mm)}
          </Button>
        ))}
      </div>
      <div className="mt-1.5 flex items-center gap-1">
        <span className="shrink-0">직접</span>
        <Input
          type="number"
          inputMode="decimal"
          step={0.05}
          min={0.02}
          max={2}
          value={custom}
          className="h-6 flex-1 px-1.5 text-[11px] tabular-nums"
          aria-label="칼라맵 범위(mm)"
          onChange={(event) => {
            setCustom(event.target.value);
            const mm = Number(event.target.value);
            if (Number.isFinite(mm) && mm > 0) setHalf(state.mode, mm);
          }}
          onBlur={() => setCustom(formatColorMapMm(half))}
        />
        <span className="shrink-0">mm</span>
      </div>
      <p className="mt-1.5 leading-snug text-muted-foreground">
        {modeInfo.hint.split(/(?<=\.)\s+/).map((line, index) => (
          <Fragment key={line}>
            {index > 0 ? <br /> : null}
            {line}
          </Fragment>
        ))}
      </p>
    </div>
  );
}

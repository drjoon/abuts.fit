// 기공소 AI 보철 — 스캔 단계 메시 편집. 다듬기·구멍 메우기·조각.
// - 2026-09-28: 디자인 전에 스캔을 정리한다. 보이는 스캔만 편집하고, 바뀐 스캔은 작업 스캔으로 저장한다.

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  MESH_EDIT_BRUSH_RANGE_MM,
  SCULPT_TOOLS,
  TRIM_TOOLS,
  type MeshEditTab,
  type ScanMeshEdit,
  type ScanMeshEditStatus,
} from "@/shared/practice/scanMeshEdit";

const SWITCH_CLASS =
  "h-5 w-9 data-[state=checked]:bg-primary [&>span]:h-4 [&>span]:w-4 data-[state=checked]:[&>span]:translate-x-4";

const TABS: ReadonlyArray<{ id: MeshEditTab; label: string; tip: ReactNode }> = [
  {
    id: "trim",
    label: "다듬기",
    tip: (
      <>
        받침·파편·필요 없는 면을 골라 지웁니다.
        <br />
        빈 곳을 끌면 화면이 돕니다.
      </>
    ),
  },
  {
    id: "fill",
    label: "구멍",
    tip: (
      <>
        스캔 구멍 테두리를 눌러 고른 뒤 메웁니다.
        <br />
        스캔 바깥 테두리는 목록에서 뺍니다.
      </>
    ),
  },
  {
    id: "sculpt",
    label: "조각",
    tip: (
      <>
        인접치 주변 거친 면이나 파편을 손봅니다.
        <br />
        손을 떼면 바로 반영됩니다.
      </>
    ),
  },
];

function TipButton({
  active,
  disabled,
  onClick,
  tip,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  tip: ReactNode;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex min-w-0">
          <Button
            type="button"
            size="sm"
            variant={active ? "default" : "outline"}
            className="h-7 w-full px-1 text-[11px]"
            disabled={disabled}
            onClick={onClick}
          >
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" className="z-[520]">
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}

function BrushSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (mm: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs font-medium">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">{value.toFixed(1)} mm</span>
      </div>
      <Slider
        min={MESH_EDIT_BRUSH_RANGE_MM.min * 10}
        max={MESH_EDIT_BRUSH_RANGE_MM.max * 10}
        step={1}
        value={[Math.round(value * 10)]}
        onValueChange={([next]) => onChange((next ?? value * 10) / 10)}
        aria-label={label}
      />
    </div>
  );
}

function SmallButton({
  disabled,
  onClick,
  children,
}: {
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-7 w-full px-1 text-[11px]"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

export function MeshEditSection({
  edit,
  status,
  disabled,
  onToggle,
  onPatch,
  onApply,
  onInvert,
  onClear,
  onSelectLoose,
  onPickAllHoles,
}: {
  edit: ScanMeshEdit | null;
  status: ScanMeshEditStatus;
  disabled: boolean;
  onToggle: (on: boolean) => void;
  onPatch: (patch: Partial<ScanMeshEdit>) => void;
  onApply: () => void;
  onInvert: () => void;
  onClear: () => void;
  onSelectLoose: () => void;
  onPickAllHoles: (on: boolean) => void;
}) {
  const hasSelection = status.selected > 0;
  return (
    <section className="space-y-2" data-coach="mesh-edit">
      <Tooltip>
        <TooltipTrigger asChild>
          <label className="flex items-center justify-between gap-3 text-xs font-semibold text-foreground">
            메시 편집
            <Switch
              checked={edit != null}
              disabled={disabled}
              onCheckedChange={onToggle}
              aria-label="메시 편집"
              className={SWITCH_CLASS}
            />
          </label>
        </TooltipTrigger>
        <TooltipContent side="right" className="z-[520]">
          디자인 전에 스캔을 정리하면 생성이 깔끔해집니다.
          <br />
          보이는 스캔만 편집합니다.
        </TooltipContent>
      </Tooltip>
      {edit ? (
        <div className="space-y-2.5">
          <div className="grid grid-cols-3 gap-1">
            {TABS.map((tab) => (
              <TipButton
                key={tab.id}
                active={edit.tab === tab.id}
                tip={tab.tip}
                onClick={() => onPatch({ tab: tab.id })}
              >
                {tab.label}
              </TipButton>
            ))}
          </div>

          {edit.tab === "trim" ? (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-1">
                {TRIM_TOOLS.map((tool) => (
                  <TipButton
                    key={tool.id}
                    active={edit.trimTool === tool.id}
                    tip={tool.hint}
                    onClick={() => onPatch({ trimTool: tool.id })}
                  >
                    {tool.label}
                  </TipButton>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-1">
                <TipButton
                  active={edit.selectMode === "add"}
                  tip="칠하거나 둘러싼 곳을 선택에 더합니다."
                  onClick={() => onPatch({ selectMode: "add" })}
                >
                  더하기
                </TipButton>
                <TipButton
                  active={edit.selectMode === "remove"}
                  tip="칠하거나 둘러싼 곳을 선택에서 뺍니다."
                  onClick={() => onPatch({ selectMode: "remove" })}
                >
                  빼기
                </TipButton>
              </div>
              {edit.trimTool === "brush" ? (
                <BrushSlider
                  label="브러시 크기"
                  value={edit.trimBrushMm}
                  onChange={(mm) => onPatch({ trimBrushMm: mm })}
                />
              ) : null}
              <div className="grid grid-cols-3 gap-1">
                <SmallButton onClick={onSelectLoose}>떨어진 조각</SmallButton>
                <SmallButton onClick={onInvert}>반전</SmallButton>
                <SmallButton disabled={!hasSelection} onClick={onClear}>
                  비우기
                </SmallButton>
              </div>
              <Button
                type="button"
                size="sm"
                className="h-8 w-full text-xs"
                disabled={!hasSelection}
                onClick={onApply}
              >
                고른 면 지우기
              </Button>
            </div>
          ) : null}

          {edit.tab === "fill" ? (
            <div className="space-y-2">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {status.holes > 0 ? (
                  <>
                    구멍 {status.holes}개 중 {status.selectedHoles}개를 골랐습니다.
                    <br />
                    테두리를 누르면 고르거나 풉니다.
                  </>
                ) : (
                  "메울 구멍이 없습니다."
                )}
              </p>
              <div className="grid grid-cols-2 gap-1">
                <SmallButton
                  disabled={status.holes === 0 || status.selectedHoles === status.holes}
                  onClick={() => onPickAllHoles(true)}
                >
                  모두 고르기
                </SmallButton>
                <SmallButton
                  disabled={status.selectedHoles === 0}
                  onClick={() => onPickAllHoles(false)}
                >
                  모두 풀기
                </SmallButton>
              </div>
              <Button
                type="button"
                size="sm"
                className="h-8 w-full text-xs"
                disabled={status.selectedHoles === 0}
                onClick={onApply}
              >
                구멍 메우기
              </Button>
            </div>
          ) : null}

          {edit.tab === "sculpt" ? (
            <div className="space-y-2">
              <div className="grid grid-cols-4 gap-1">
                {SCULPT_TOOLS.map((tool) => (
                  <TipButton
                    key={tool.id}
                    active={edit.sculptTool === tool.id}
                    tip={tool.hint}
                    onClick={() => onPatch({ sculptTool: tool.id })}
                  >
                    {tool.label}
                  </TipButton>
                ))}
              </div>
              <BrushSlider
                label="브러시 크기"
                value={edit.sculptBrushMm}
                onChange={(mm) => onPatch({ sculptBrushMm: mm })}
              />
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span>세기</span>
                  <span className="tabular-nums text-muted-foreground">
                    {Math.round(edit.strength * 100)}%
                  </span>
                </div>
                <Slider
                  min={5}
                  max={100}
                  step={5}
                  value={[Math.round(edit.strength * 100)]}
                  onValueChange={([next]) => onPatch({ strength: (next ?? 35) / 100 })}
                  aria-label="세기"
                />
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                스캔 위를 끌어 손봅니다.
                <br />
                빈 곳을 끌면 화면이 돕니다.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

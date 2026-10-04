// 기공소 AI 보철 — 스캔 단계 메시 편집. 다듬기·구멍 메우기·조각·가상 발치.
// - 2026-09-28: 디자인 전에 스캔을 정리한다. 보이는 스캔만 편집하고, 바뀐 스캔은 작업 스캔으로 저장한다.
// - 2026-09-30: 발치 탭. 치아를 눌러 고르고 경계를 고친 뒤 적용하면 지우고 발치와를 메운다.
// - 2026-10-04: 왼쪽 드래그는 다듬기에서 바로 지우기, 화면 회전은 오른쪽.

import type { ReactNode } from "react";
import { ChevronDown, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/shared/ui/cn";
import {
  MESH_EDIT_BRUSH_RANGE_MM,
  SCULPT_TOOLS,
  TRIM_TOOLS,
  type ExtractAction,
  type MeshEditTab,
  type ScanMeshEdit,
  type ScanMeshEditStatus,
} from "@/shared/practice/scanMeshEdit";

/** 단계 제목 아래 세부 버튼·슬라이더. 좌우를 들여 제목과 구분한다. */
export const STAGE_NEST_CLASS = "px-2";

/** 단계 패널의 하위 메뉴. 셰브론으로 접고, 같은 단계에서는 하나만 연다. */
export function StageSubsection({
  title,
  open,
  onOpen,
  children,
  coach,
  className,
}: {
  title: string;
  open: boolean;
  onOpen: (on: boolean) => void;
  children: ReactNode;
  coach?: string;
  className?: string;
}) {
  return (
    <section className={cn("space-y-2", className)} data-coach={coach}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left text-xs font-semibold text-foreground"
        aria-expanded={open}
        onClick={() => onOpen(!open)}
      >
        {title}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open ? (
        <div className={cn("space-y-2", STAGE_NEST_CLASS, className)}>{children}</div>
      ) : null}
    </section>
  );
}

const TABS: ReadonlyArray<{ id: MeshEditTab; label: string; tip: ReactNode }> = [
  {
    id: "trim",
    label: "다듬기",
    tip: (
      <>
        받침·파편·필요 없는 면을 바로 지웁니다.
        <br />
        왼쪽 드래그로 지우고, 오른쪽 드래그로 화면이 돕니다.
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
  {
    id: "extract",
    label: "발치",
    tip: (
      <>
        뺄 치아를 스캔에서 지웁니다.
        <br />
        발치 자리는 주변 잇몸 곡면에 맞춰 메웁니다.
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
  onSelectLoose,
  onPickAllHoles,
  onExtract,
}: {
  edit: ScanMeshEdit | null;
  status: ScanMeshEditStatus;
  disabled: boolean;
  onToggle: (on: boolean) => void;
  onPatch: (patch: Partial<ScanMeshEdit>) => void;
  onApply: () => void;
  onSelectLoose: () => void;
  onPickAllHoles: (on: boolean) => void;
  onExtract: (action: ExtractAction) => void;
}) {
  const activeTooth = status.teeth.find((row) => row.active) ?? null;
  return (
    <section className="space-y-2" data-coach="mesh-edit">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex min-w-0">
            <button
              type="button"
              disabled={disabled}
              className="flex w-full items-center justify-between gap-3 text-left text-xs font-semibold text-foreground disabled:opacity-50"
              aria-expanded={edit != null}
              aria-label="메시 편집"
              onClick={() => onToggle(edit == null)}
            >
              메시 편집
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                  edit != null && "rotate-180",
                )}
                aria-hidden
              />
            </button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="right" className="z-[520]">
          디자인 전에 스캔을 정리하면 생성이 깔끔해집니다.
          <br />
          보이는 스캔만 편집합니다.
        </TooltipContent>
      </Tooltip>
      {edit ? (
        <div className={cn("space-y-2.5", STAGE_NEST_CLASS)}>
          <div className="grid grid-cols-4 gap-1">
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
            <div className={cn("space-y-2", STAGE_NEST_CLASS)}>
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
                <TipButton
                  active={false}
                  tip="가장 큰 덩어리만 남기고 떨어진 파편을 지웁니다."
                  onClick={onSelectLoose}
                >
                  떨어진 조각
                </TipButton>
              </div>
              {edit.trimTool === "brush" ? (
                <BrushSlider
                  label="브러시 크기"
                  value={edit.trimBrushMm}
                  onChange={(mm) => onPatch({ trimBrushMm: mm })}
                />
              ) : null}
            </div>
          ) : null}

          {edit.tab === "fill" ? (
            <div className={cn("space-y-2", STAGE_NEST_CLASS)}>
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
            <div className={cn("space-y-2", STAGE_NEST_CLASS)}>
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
                왼쪽 드래그로 조각하고, 오른쪽 드래그로 화면이 돕니다.
              </p>
            </div>
          ) : null}

          {edit.tab === "extract" ? (
            <div className={cn("space-y-2", STAGE_NEST_CLASS)}>
              <div className="grid grid-cols-2 gap-1">
                <TipButton
                  active={edit.extractTool === "pick"}
                  tip="스캔에서 뺄 치아를 누릅니다. 경계는 자동으로 찾습니다."
                  onClick={() => onPatch({ extractTool: "pick" })}
                >
                  치아 고르기
                </TipButton>
                <TipButton
                  active={edit.extractTool === "brush"}
                  disabled={!activeTooth}
                  tip="고른 치아의 경계를 칠해서 넓히거나 줄입니다."
                  onClick={() => onPatch({ extractTool: "brush" })}
                >
                  경계 브러시
                </TipButton>
              </div>

              {status.teeth.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {status.teeth.map((tooth) => (
                    <span
                      key={tooth.key}
                      className={cn(
                        "inline-flex h-6 items-center gap-0.5 rounded-full border pl-2 pr-1 text-[11px] font-medium",
                        tooth.active
                          ? "border-sky-700 bg-sky-50 text-sky-800"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      <button
                        type="button"
                        className="tabular-nums"
                        onClick={() => onExtract({ kind: "activate", key: tooth.key })}
                      >
                        {tooth.label}
                      </button>
                      <button
                        type="button"
                        className="rounded-full p-0.5 hover:bg-muted"
                        aria-label={`${tooth.label} 빼기`}
                        onClick={() => onExtract({ kind: "remove", key: tooth.key })}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}

              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {status.finding ? (
                  "치아 경계를 찾는 중입니다."
                ) : status.teeth.length === 0 ? (
                  <>
                    스캔에서 뺄 치아를 누르세요.
                    <br />
                    여러 개를 고를 수 있습니다.
                  </>
                ) : activeTooth?.weak ? (
                  <>
                    {activeTooth.label} 경계가 흐려 넓게 잡혔을 수 있습니다.
                    <br />
                    경계 브러시로 잇몸 쪽을 빼세요.
                  </>
                ) : (
                  <>
                    파란 선이 발치 경계입니다.
                    <br />
                    맞지 않으면 넓히기·좁히기나 경계 브러시로 고치세요.
                  </>
                )}
              </p>

              {edit.extractTool === "brush" && activeTooth ? (
                <>
                  <div className="grid grid-cols-2 gap-1">
                    <TipButton
                      active={edit.selectMode === "add"}
                      tip="칠한 곳을 치아에 넣습니다."
                      onClick={() => onPatch({ selectMode: "add" })}
                    >
                      더하기
                    </TipButton>
                    <TipButton
                      active={edit.selectMode === "remove"}
                      tip="칠한 곳을 치아에서 뺍니다."
                      onClick={() => onPatch({ selectMode: "remove" })}
                    >
                      빼기
                    </TipButton>
                  </div>
                  <BrushSlider
                    label="브러시 크기"
                    value={edit.extractBrushMm}
                    onChange={(mm) => onPatch({ extractBrushMm: mm })}
                  />
                </>
              ) : null}

              <div className="grid grid-cols-4 gap-1">
                <SmallButton disabled={!activeTooth} onClick={() => onExtract({ kind: "grow" })}>
                  넓히기
                </SmallButton>
                <SmallButton disabled={!activeTooth} onClick={() => onExtract({ kind: "shrink" })}>
                  좁히기
                </SmallButton>
                <SmallButton disabled={!activeTooth} onClick={() => onExtract({ kind: "restore" })}>
                  되돌리기
                </SmallButton>
                <SmallButton
                  disabled={status.teeth.length === 0}
                  onClick={() => onExtract({ kind: "clear" })}
                >
                  선택취소
                </SmallButton>
              </div>
              <Button
                type="button"
                size="sm"
                className="h-8 w-full text-xs"
                disabled={status.teeth.length === 0 || status.finding}
                onClick={onApply}
              >
                발치 적용
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

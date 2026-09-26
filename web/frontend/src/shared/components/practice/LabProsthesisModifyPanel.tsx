// 기공소 AI 보철 — 마진·삽입·내면·형상·훅·컷백·홀·커넥터 조작.

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CONNECTOR_SHAPES,
  INNER_PRESETS,
  MODIFY_TOOLS,
  applyInnerPreset,
  holeIssue,
  shellIsThin,
  shellThicknessMm,
  type EditBrush,
  type MarginEditMode,
  type ModifyTool,
  type ToothDesignEdit,
} from "@/shared/practice/labProsthesisModify";
import { cn } from "@/shared/ui/cn";

type Props = {
  tool: ModifyTool;
  onTool: (tool: ModifyTool) => void;
  marginMode: MarginEditMode;
  onMarginMode: (mode: MarginEditMode) => void;
  brush: EditBrush;
  onBrush: (brush: EditBrush) => void;
  edit: ToothDesignEdit;
  onEdit: (next: ToothDesignEdit) => void;
  toothLabel: string | null;
  generated: boolean;
  isBridge: boolean;
  canMatchInsertion: boolean;
  holeNote: string;
  onRedetect: () => void;
  onClearMargin: () => void;
  onMatchInsertion: () => void;
  onApplyInner: () => void;
  onRemoveHook: () => void;
};

function Row({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs font-medium">
        <span>{label}</span>
        {value ? (
          <span className="tabular-nums text-muted-foreground">{value}</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function LabProsthesisModifyPanel({
  tool,
  onTool,
  marginMode,
  onMarginMode,
  brush,
  onBrush,
  edit,
  onEdit,
  toothLabel,
  generated,
  isBridge,
  canMatchInsertion,
  holeNote,
  onRedetect,
  onClearMargin,
  onMatchInsertion,
  onApplyInner,
  onRemoveHook,
}: Props) {
  const thin = shellIsThin(edit);
  const issue = holeIssue(edit.hole);

  return (
    <section className="space-y-2">
      <p className="text-xs font-semibold text-foreground">수정</p>
      {toothLabel ? (
        <p className="text-[11px] text-muted-foreground">{toothLabel}</p>
      ) : null}
      <div className="grid grid-cols-4 gap-1">
        {MODIFY_TOOLS.map((item) =>
          item.id === "connector" && !isBridge ? (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <span className="flex min-w-0">
                  <Button
                    type="button"
                    size="sm"
                    variant={tool === item.id ? "default" : "outline"}
                    className="h-7 w-full px-1 text-[11px]"
                    onClick={() => onTool(item.id)}
                  >
                    {item.label}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" className="z-[520]">
                브리지 스팬에서 조립합니다.
              </TooltipContent>
            </Tooltip>
          ) : (
            <Button
              key={item.id}
              type="button"
              size="sm"
              variant={tool === item.id ? "default" : "outline"}
              className="h-7 px-1 text-[11px]"
              onClick={() => onTool(item.id)}
            >
              {item.label}
            </Button>
          ),
        )}
      </div>

      {tool === "margin" ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1">
            <Button
              type="button"
              size="sm"
              variant={marginMode === "point" ? "default" : "outline"}
              className="h-7 text-[11px]"
              onClick={() => onMarginMode("point")}
            >
              점 편집
            </Button>
            <Button
              type="button"
              size="sm"
              variant={marginMode === "pen" ? "default" : "outline"}
              className="h-7 text-[11px]"
              onClick={() => onMarginMode("pen")}
            >
              펜
            </Button>
          </div>
          <Row label="마진 간격" value={`${edit.margin.offsetMm.toFixed(2)} mm`}>
            <Slider
              min={-40}
              max={60}
              step={2}
              value={[Math.round(edit.margin.offsetMm * 100)]}
              onValueChange={([value]) =>
                onEdit({
                  ...edit,
                  margin: { ...edit.margin, offsetMm: (value ?? 0) / 100, deleted: false },
                })
              }
              aria-label="마진 간격"
            />
          </Row>
          <div className="flex gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 flex-1 text-[11px]"
              onClick={onRedetect}
            >
              다시 검출
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 flex-1 text-[11px]"
              onClick={onClearMargin}
            >
              마진 삭제
            </Button>
          </div>
        </div>
      ) : null}

      {tool === "insertion" ? (
        <div className="space-y-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex min-w-0">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 w-full text-[11px]"
                  disabled={!canMatchInsertion}
                  onClick={onMatchInsertion}
                >
                  화면 각도로 맞추기
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" className="z-[520]">
              화면 중앙에 화면과 수직인 삽입축을 둡니다.
            </TooltipContent>
          </Tooltip>
        </div>
      ) : null}

      {tool === "inner" ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1">
            {INNER_PRESETS.map((preset) => (
              <Button
                key={preset.id}
                type="button"
                size="sm"
                variant={edit.inner.preset === preset.id ? "default" : "outline"}
                className="h-7 px-1 text-[11px]"
                onClick={() => onEdit(applyInnerPreset(edit, preset.id))}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <Row label="시멘트 갭" value={`${edit.inner.cementGapMm.toFixed(2)} mm`}>
            <Slider
              min={0}
              max={20}
              step={1}
              value={[Math.round(edit.inner.cementGapMm * 100)]}
              onValueChange={([value]) =>
                onEdit({
                  ...edit,
                  inner: {
                    ...edit.inner,
                    preset: "custom",
                    cementGapMm: (value ?? 5) / 100,
                    applied: false,
                  },
                })
              }
              aria-label="시멘트 갭"
            />
          </Row>
          <Row label="스페이서" value={`${edit.inner.spacerMm.toFixed(2)} mm`}>
            <Slider
              min={0}
              max={20}
              step={1}
              value={[Math.round(edit.inner.spacerMm * 100)]}
              onValueChange={([value]) =>
                onEdit({
                  ...edit,
                  inner: {
                    ...edit.inner,
                    preset: "custom",
                    spacerMm: (value ?? 8) / 100,
                    applied: false,
                  },
                })
              }
              aria-label="스페이서"
            />
          </Row>
          <Row label="마진 테이퍼" value={`${edit.inner.marginTaperMm.toFixed(2)} mm`}>
            <Slider
              min={0}
              max={20}
              step={1}
              value={[Math.round(edit.inner.marginTaperMm * 100)]}
              onValueChange={([value]) =>
                onEdit({
                  ...edit,
                  inner: {
                    ...edit.inner,
                    preset: "custom",
                    marginTaperMm: (value ?? 0) / 100,
                    applied: false,
                  },
                })
              }
              aria-label="마진 테이퍼"
            />
          </Row>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex min-w-0">
                <Button
                  type="button"
                  size="sm"
                  className="h-7 w-full text-[11px]"
                  disabled={!generated}
                  onClick={onApplyInner}
                >
                  {edit.inner.applied ? "내면 적용됨" : "내면 적용"}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" className="z-[520]">
              생성한 보철 내면에 갭을 적용합니다.
            </TooltipContent>
          </Tooltip>
        </div>
      ) : null}

      {tool === "refine" ? (
        <div className="space-y-2">
          <Row label="크기" value={edit.refine.scale.toFixed(2)}>
            <Slider
              min={75}
              max={135}
              step={1}
              value={[Math.round(edit.refine.scale * 100)]}
              onValueChange={([value]) =>
                onEdit({
                  ...edit,
                  refine: { ...edit.refine, scale: (value ?? 100) / 100 },
                })
              }
              aria-label="크기"
            />
          </Row>
          <Row label="교두" value={edit.refine.cusp.toFixed(2)}>
            <Slider
              min={-100}
              max={100}
              step={5}
              value={[Math.round(edit.refine.cusp * 100)]}
              onValueChange={([value]) =>
                onEdit({
                  ...edit,
                  refine: { ...edit.refine, cusp: (value ?? 0) / 100 },
                })
              }
              aria-label="교두"
            />
          </Row>
          <Row label="융선" value={edit.refine.ridge.toFixed(2)}>
            <Slider
              min={-100}
              max={100}
              step={5}
              value={[Math.round(edit.refine.ridge * 100)]}
              onValueChange={([value]) =>
                onEdit({
                  ...edit,
                  refine: { ...edit.refine, ridge: (value ?? 0) / 100 },
                })
              }
              aria-label="융선"
            />
          </Row>
          <Row
            label="교합 간격"
            value={`${edit.refine.occlusalClearanceMm.toFixed(2)} mm`}
          >
            <Slider
              min={0}
              max={40}
              step={1}
              value={[Math.round(edit.refine.occlusalClearanceMm * 100)]}
              onValueChange={([value]) =>
                onEdit({
                  ...edit,
                  refine: {
                    ...edit.refine,
                    occlusalClearanceMm: (value ?? 10) / 100,
                  },
                })
              }
              aria-label="교합 간격"
            />
          </Row>
          <label className="flex items-center justify-between gap-3 text-xs font-medium">
            대합 깎기
            <Switch
              checked={edit.refine.occlusalTrim}
              onCheckedChange={(occlusalTrim) =>
                onEdit({ ...edit, refine: { ...edit.refine, occlusalTrim } })
              }
              aria-label="대합 깎기"
              className="h-5 w-9 data-[state=checked]:bg-primary [&>span]:h-4 [&>span]:w-4 data-[state=checked]:[&>span]:translate-x-4"
            />
          </label>
          <Row
            label="인접 간격"
            value={`${edit.refine.proximalClearanceMm.toFixed(2)} mm`}
          >
            <Slider
              min={0}
              max={40}
              step={1}
              value={[Math.round(edit.refine.proximalClearanceMm * 100)]}
              onValueChange={([value]) =>
                onEdit({
                  ...edit,
                  refine: {
                    ...edit.refine,
                    proximalClearanceMm: (value ?? 5) / 100,
                  },
                })
              }
              aria-label="인접 간격"
            />
          </Row>
          <label className="flex items-center justify-between gap-3 text-xs font-medium">
            인접 깎기
            <Switch
              checked={edit.refine.proximalTrim}
              onCheckedChange={(proximalTrim) =>
                onEdit({ ...edit, refine: { ...edit.refine, proximalTrim } })
              }
              aria-label="인접 깎기"
              className="h-5 w-9 data-[state=checked]:bg-primary [&>span]:h-4 [&>span]:w-4 data-[state=checked]:[&>span]:translate-x-4"
            />
          </label>
          <div className="grid grid-cols-3 gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex min-w-0">
                  <Button
                    type="button"
                    size="sm"
                    variant={brush === "sculpt" ? "default" : "outline"}
                    className="h-7 w-full px-1 text-[11px]"
                    disabled={!generated}
                    onClick={() => onBrush(brush === "sculpt" ? "none" : "sculpt")}
                  >
                    스컬프트
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" className="z-[520]">
                왼쪽은 덧대고 오른쪽은 깎습니다.
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex min-w-0">
                  <Button
                    type="button"
                    size="sm"
                    variant={brush === "erase" ? "default" : "outline"}
                    className="h-7 w-full px-1 text-[11px]"
                    disabled={!generated}
                    onClick={() => onBrush(brush === "erase" ? "none" : "erase")}
                  >
                    매끈
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" className="z-[520]">
                형태를 완만하게 합니다.
              </TooltipContent>
            </Tooltip>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-1 text-[11px]"
              disabled={!generated}
              onClick={() =>
                onEdit({
                  ...edit,
                  refine: {
                    ...edit.refine,
                    compensate: !edit.refine.compensate,
                  },
                })
              }
            >
              {edit.refine.compensate ? "보상 켬" : "두께 보상"}
            </Button>
          </div>
          <Row label="최소 두께" value={`${edit.refine.minThicknessMm.toFixed(2)} mm`}>
            <Slider
              min={30}
              max={120}
              step={5}
              value={[Math.round(edit.refine.minThicknessMm * 100)]}
              onValueChange={([value]) =>
                onEdit({
                  ...edit,
                  refine: {
                    ...edit.refine,
                    minThicknessMm: (value ?? 50) / 100,
                  },
                })
              }
              aria-label="최소 두께"
            />
          </Row>
          <p
            className={cn(
              "text-[11px] font-medium",
              thin && !edit.refine.compensate
                ? "text-destructive"
                : "text-foreground",
            )}
          >
            외면 {shellThicknessMm(edit).toFixed(2)} mm
            {thin && !edit.refine.compensate ? " · 최소보다 얇음" : ""}
          </p>
        </div>
      ) : null}

      {tool === "hook" ? (
        <div className="space-y-2">
          <div className="flex gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex min-w-0 flex-1">
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 w-full text-[11px]"
                    disabled={!generated}
                    onClick={() =>
                      onEdit({ ...edit, hook: { ...edit.hook, on: true } })
                    }
                  >
                    훅 놓기
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" className="z-[520]">
                보철을 누르면 그 자리에 훅이 붙습니다.
              </TooltipContent>
            </Tooltip>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 flex-1 text-[11px]"
              onClick={onRemoveHook}
            >
              제거
            </Button>
          </div>
          <Row label="반지름" value={`${edit.hook.radiusMm.toFixed(2)} mm`}>
            <Slider
              min={20}
              max={90}
              step={2}
              value={[Math.round(edit.hook.radiusMm * 100)]}
              onValueChange={([value]) =>
                onEdit({
                  ...edit,
                  hook: { ...edit.hook, radiusMm: (value ?? 45) / 100 },
                })
              }
              aria-label="훅 반지름"
            />
          </Row>
          <Row label="길이" value={`${edit.hook.lengthMm.toFixed(1)} mm`}>
            <Slider
              min={8}
              max={50}
              step={1}
              value={[Math.round(edit.hook.lengthMm * 10)]}
              onValueChange={([value]) =>
                onEdit({
                  ...edit,
                  hook: { ...edit.hook, lengthMm: (value ?? 24) / 10 },
                })
              }
              aria-label="훅 길이"
            />
          </Row>
          <Row label="위치" value={`${Math.round(edit.hook.angle)}°`}>
            <Slider
              min={0}
              max={360}
              step={2}
              value={[edit.hook.angle]}
              onValueChange={([value]) =>
                onEdit({
                  ...edit,
                  hook: { ...edit.hook, on: true, angle: value ?? 0 },
                })
              }
              aria-label="훅 위치"
            />
          </Row>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex min-w-0">
                <Button
                  type="button"
                  size="sm"
                  variant={brush === "erase" ? "default" : "outline"}
                  className="h-7 w-full text-[11px]"
                  onClick={() => onBrush(brush === "erase" ? "none" : "erase")}
                >
                  지우개
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" className="z-[520]">
              훅을 없앱니다.
            </TooltipContent>
          </Tooltip>
        </div>
      ) : null}

      {tool === "cutback" ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex min-w-0">
                  <Button
                    type="button"
                    size="sm"
                    variant={edit.cutback.region === "partial" ? "default" : "outline"}
                    className="h-7 w-full text-[11px]"
                    onClick={() =>
                      onEdit({
                        ...edit,
                        cutback: { ...edit.cutback, region: "partial", on: true },
                      })
                    }
                  >
                    부분
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" className="z-[520]">
                교합면만 얇게 합니다.
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex min-w-0">
                  <Button
                    type="button"
                    size="sm"
                    variant={edit.cutback.region === "full" ? "default" : "outline"}
                    className="h-7 w-full text-[11px]"
                    onClick={() =>
                      onEdit({
                        ...edit,
                        cutback: { ...edit.cutback, region: "full", on: true },
                      })
                    }
                  >
                    전체
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" className="z-[520]">
                외면 전체를 얇게 합니다.
              </TooltipContent>
            </Tooltip>
          </div>
          <Row label="컷백 두께" value={`${edit.cutback.thicknessMm.toFixed(2)} mm`}>
            <Slider
              min={10}
              max={80}
              step={2}
              value={[Math.round(edit.cutback.thicknessMm * 100)]}
              onValueChange={([value]) =>
                onEdit({
                  ...edit,
                  cutback: {
                    ...edit.cutback,
                    on: true,
                    thicknessMm: (value ?? 40) / 100,
                  },
                })
              }
              aria-label="컷백 두께"
            />
          </Row>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex min-w-0">
                <Button
                  type="button"
                  size="sm"
                  variant={brush === "minus" ? "default" : "outline"}
                  className="h-7 w-full text-[11px]"
                  disabled={!generated}
                  onClick={() => onBrush(brush === "minus" ? "none" : "minus")}
                >
                  제외 브러시
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" className="z-[520]">
              누른 자리는 컷백에서 뺍니다.
            </TooltipContent>
          </Tooltip>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 w-full text-[11px]"
            onClick={() =>
              onEdit({
                ...edit,
                cutback: { ...edit.cutback, on: false, excluded: [] },
              })
            }
          >
            컷백 끄기
          </Button>
        </div>
      ) : null}

      {tool === "hole" ? (
        <div className="space-y-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex min-w-0">
                <Button
                  type="button"
                  size="sm"
                  className="h-7 w-full text-[11px]"
                  disabled={!generated}
                  onClick={() => onEdit({ ...edit, hole: { ...edit.hole, on: true } })}
                >
                  {edit.hole.on ? "홀 있음" : "홀 만들기"}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" className="z-[520]">
              교합면을 누르면 위치가 잡힙니다.
              <br />
              기둥 끝을 끌면 기울기가 바뀝니다.
            </TooltipContent>
          </Tooltip>
          <Row label="반지름" value={`${edit.hole.radiusMm.toFixed(2)} mm`}>
            <Slider
              min={40}
              max={240}
              step={4}
              value={[Math.round(edit.hole.radiusMm * 100)]}
              onValueChange={([value]) =>
                onEdit({
                  ...edit,
                  hole: { ...edit.hole, on: true, radiusMm: (value ?? 100) / 100 },
                })
              }
              aria-label="홀 반지름"
            />
          </Row>
          <Row label="기울기" value={`${Math.round(edit.hole.tiltDeg)}°`}>
            <Slider
              min={-50}
              max={50}
              step={1}
              value={[edit.hole.tiltDeg]}
              onValueChange={([value]) =>
                onEdit({
                  ...edit,
                  hole: { ...edit.hole, on: true, tiltDeg: value ?? 0 },
                })
              }
              aria-label="홀 기울기"
            />
          </Row>
          <Row label="위치" value={`${Math.round(edit.hole.angle)}°`}>
            <Slider
              min={0}
              max={360}
              step={2}
              value={[edit.hole.angle]}
              onValueChange={([value]) =>
                onEdit({
                  ...edit,
                  hole: { ...edit.hole, on: true, angle: value ?? 0 },
                })
              }
              aria-label="홀 위치"
            />
          </Row>
          {issue || holeNote ? (
            <p className="text-[11px] leading-relaxed text-destructive">
              {issue || holeNote}
            </p>
          ) : null}
        </div>
      ) : null}

      {tool === "connector" ? (
        <div className="space-y-2">
          {isBridge ? (
            <>
              <div className="grid grid-cols-2 gap-1">
                {CONNECTOR_SHAPES.map((shape) => (
                  <Button
                    key={shape.id}
                    type="button"
                    size="sm"
                    variant={edit.connector.shape === shape.id ? "default" : "outline"}
                    className="h-7 px-1 text-[11px]"
                    onClick={() =>
                      onEdit({
                        ...edit,
                        connector: { ...edit.connector, shape: shape.id },
                      })
                    }
                  >
                    {shape.label}
                  </Button>
                ))}
              </div>
              <Row label="가로" value={`${edit.connector.transverseMm.toFixed(1)} mm`}>
                <Slider
                  min={16}
                  max={60}
                  step={1}
                  value={[Math.round(edit.connector.transverseMm * 10)]}
                  onValueChange={([value]) =>
                    onEdit({
                      ...edit,
                      connector: {
                        ...edit.connector,
                        transverseMm: (value ?? 32) / 10,
                      },
                    })
                  }
                  aria-label="커넥터 가로"
                />
              </Row>
              <Row label="세로" value={`${edit.connector.verticalMm.toFixed(1)} mm`}>
                <Slider
                  min={12}
                  max={50}
                  step={1}
                  value={[Math.round(edit.connector.verticalMm * 10)]}
                  onValueChange={([value]) =>
                    onEdit({
                      ...edit,
                      connector: {
                        ...edit.connector,
                        verticalMm: (value ?? 26) / 10,
                      },
                    })
                  }
                  aria-label="커넥터 세로"
                />
              </Row>
              <div className="flex gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex min-w-0 flex-1">
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 w-full text-[11px]"
                        disabled={!generated}
                        onClick={() =>
                          onEdit({
                            ...edit,
                            connector: { ...edit.connector, assembled: true },
                          })
                        }
                      >
                        조립
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="z-[520]">
                    커넥터로 브리지를 한 덩어리로 잇습니다.
                  </TooltipContent>
                </Tooltip>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 flex-1 text-[11px]"
                  onClick={() =>
                    onEdit({
                      ...edit,
                      connector: { ...edit.connector, assembled: false },
                    })
                  }
                >
                  분리
                </Button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

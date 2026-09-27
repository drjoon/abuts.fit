// 기공소 AI 보철 — 마진·삽입·내면·형상·훅·컷백·홀·커넥터 조작.

import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

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
  PONTIC_BASES,
  adjustMarginOffset,
  applyInnerPreset,
  connectorAreaMm2,
  connectorIsWeak,
  connectorMinAreaMm2,
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
  /** 의뢰 발신자(치과). 없으면 치과 프리셋을 두지 않는다. */
  clinicLabel: string | null;
  clinicSaved: boolean;
  onApplyClinic: () => void;
  onSaveClinic: () => void;
  /** 이 브리지 스팬의 커넥터. 설정은 앞 치아(from) 수정값에 둔다. */
  connectors: ConnectorRow[];
  connectorFrom: string | null;
  onConnectorFrom: (from: string) => void;
  onConnector: (from: string, connector: ToothDesignEdit["connector"]) => void;
  bridgeAssembled: boolean;
  /** 스팬 치아가 모두 생성됐으면 조립할 수 있다. */
  bridgeReady: boolean;
  onAssemble: (assembled: boolean) => void;
  /** 커넥터 단면 보기(양쪽 인접면). */
  focusView: boolean;
  onFocusView: (on: boolean) => void;
};

export type ConnectorRow = {
  from: string;
  to: string;
  edit: ToothDesignEdit;
};

function ConnectorControls({
  connectors,
  row,
  assembled,
  ready,
  onSelect,
  onChange,
  onAssemble,
  focusView,
  onFocusView,
}: {
  connectors: ConnectorRow[];
  row: ConnectorRow;
  assembled: boolean;
  ready: boolean;
  onSelect: (from: string) => void;
  onChange: (connector: ToothDesignEdit["connector"]) => void;
  onAssemble: (assembled: boolean) => void;
  focusView: boolean;
  onFocusView: (on: boolean) => void;
}) {
  const connector = row.edit.connector;
  const area = connectorAreaMm2(connector);
  const minArea = connectorMinAreaMm2(row.edit.inner.preset, [row.from, row.to]);
  const weak = connectorIsWeak(row.edit, [row.from, row.to]);
  const locked = assembled;
  const set = (patch: Partial<ToothDesignEdit["connector"]>) =>
    onChange({ ...connector, ...patch });

  return (
    <>
      <Row label="커넥터">
        <div className="flex flex-wrap gap-1">
          {connectors.map((item) => {
            const itemWeak = connectorIsWeak(item.edit, [item.from, item.to]);
            return (
              <Button
                key={item.from}
                type="button"
                size="sm"
                variant={item.from === row.from ? "default" : "outline"}
                className={cn(
                  "h-7 px-2 text-[11px] tabular-nums",
                  !item.edit.connector.linked && "line-through opacity-70",
                  itemWeak && item.from !== row.from && "border-destructive text-destructive",
                )}
                onClick={() => onSelect(item.from)}
              >
                {item.from}-{item.to}
              </Button>
            );
          })}
        </div>
      </Row>
      <label className="flex items-center justify-between gap-3 text-xs font-medium">
        연결
        <Switch
          checked={connector.linked}
          disabled={locked}
          onCheckedChange={(linked) => set({ linked })}
          aria-label={`${row.from}-${row.to} 커넥터 연결`}
          className="h-5 w-9 data-[state=checked]:bg-primary [&>span]:h-4 [&>span]:w-4 data-[state=checked]:[&>span]:translate-x-4"
        />
      </label>
      {connector.linked ? (
        <>
          <div className="grid grid-cols-2 gap-1">
            {CONNECTOR_SHAPES.map((shape) => (
              <Button
                key={shape.id}
                type="button"
                size="sm"
                variant={connector.shape === shape.id ? "default" : "outline"}
                className="h-7 px-1 text-[11px]"
                disabled={locked}
                onClick={() => set({ shape: shape.id })}
              >
                {shape.label}
              </Button>
            ))}
          </div>
          <Row label="가로" value={`${connector.transverseMm.toFixed(1)} mm`}>
            <Slider
              min={16}
              max={60}
              step={1}
              disabled={locked}
              value={[Math.round(connector.transverseMm * 10)]}
              onValueChange={([value]) => set({ transverseMm: (value ?? 40) / 10 })}
              aria-label="커넥터 가로"
            />
          </Row>
          <Row label="세로" value={`${connector.verticalMm.toFixed(1)} mm`}>
            <Slider
              min={12}
              max={50}
              step={1}
              disabled={locked}
              value={[Math.round(connector.verticalMm * 10)]}
              onValueChange={([value]) => set({ verticalMm: (value ?? 32) / 10 })}
              aria-label="커넥터 세로"
            />
          </Row>
          <div
            className={cn(
              "flex items-center justify-between rounded-md border px-2 py-1.5 text-[11px] font-medium",
              weak ? "border-destructive/40 bg-destructive/10 text-destructive" : "text-foreground",
            )}
          >
            <span className="flex items-center gap-1">
              {weak ? <TriangleAlert className="h-3 w-3" /> : null}
              {weak ? "약함" : "충분"}
            </span>
            <span className="tabular-nums">
              {area.toFixed(1)} / {minArea} mm²
            </span>
          </div>
          <Row
            label="위치"
            value={`협설 ${connector.shiftXMm.toFixed(1)} · 교합 ${connector.shiftYMm.toFixed(1)} mm`}
          >
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 w-full text-[11px]"
              disabled={locked || (connector.shiftXMm === 0 && connector.shiftYMm === 0)}
              onClick={() => set({ shiftXMm: 0, shiftYMm: 0 })}
            >
              가운데로
            </Button>
          </Row>
          <Tooltip>
            <TooltipTrigger asChild>
              <label className="flex items-center justify-between gap-3 text-xs font-medium">
                단면 보기
                <Switch
                  checked={focusView}
                  onCheckedChange={onFocusView}
                  aria-label="커넥터 단면 보기"
                  className="h-5 w-9 data-[state=checked]:bg-primary [&>span]:h-4 [&>span]:w-4 data-[state=checked]:[&>span]:translate-x-4"
                />
              </label>
            </TooltipTrigger>
            <TooltipContent side="right" className="z-[520]">
              양쪽 치아 인접면에 커넥터 단면을 겹쳐 봅니다.
              <br />
              노란 점을 끌면 커넥터 위치가 옮겨집니다.
            </TooltipContent>
          </Tooltip>
        </>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          {row.from}번과 {row.to}번을 잇지 않습니다.
        </p>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex min-w-0">
            {assembled ? (
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="h-7 w-full text-[11px]"
                onClick={() => onAssemble(false)}
              >
                분리
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                className="h-7 w-full text-[11px]"
                disabled={!ready}
                onClick={() => onAssemble(true)}
              >
                조립
              </Button>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="right" className="z-[520]">
          {assembled
            ? "크라운이나 커넥터를 고치려면 분리합니다."
            : ready
              ? "커넥터로 브리지를 한 덩어리로 잇습니다."
              : "스팬의 치아를 모두 생성한 뒤 조립합니다."}
        </TooltipContent>
      </Tooltip>
    </>
  );
}

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
  clinicLabel,
  clinicSaved,
  onApplyClinic,
  onSaveClinic,
  connectors,
  connectorFrom,
  onConnectorFrom,
  onConnector,
  bridgeAssembled,
  bridgeReady,
  onAssemble,
  focusView,
  onFocusView,
}: Props) {
  const thin = shellIsThin(edit);
  const issue = holeIssue(edit.hole);
  const connectorRow =
    connectors.find((row) => row.from === connectorFrom) ?? connectors[0] ?? null;

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

      {tool === "margin" && edit.pontic.on ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          폰틱은 지대치가 없어 마진을 잡지 않습니다.
          <br />
          기저면은 형상에서 고릅니다.
        </p>
      ) : null}

      {tool === "margin" && !edit.pontic.on ? (
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
          <div className="grid grid-cols-2 gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() => onEdit(adjustMarginOffset(edit, -0.05))}
              title="마진을 안쪽(교합면 방향)으로 0.05mm 수축합니다."
            >
              수축 -0.05
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() => onEdit(adjustMarginOffset(edit, 0.05))}
              title="마진을 바깥쪽(치은 방향)으로 0.05mm 확장합니다."
            >
              확장 +0.05
            </Button>
          </div>
          <div className="flex items-center justify-between rounded-md border px-2 py-1.5 text-xs">
            <span className="font-medium text-foreground">배면 투명</span>
            <Switch
              checked={edit.margin.showBack}
              onCheckedChange={(checked) =>
                onEdit({
                  ...edit,
                  margin: { ...edit.margin, showBack: checked },
                })
              }
              aria-label="지대치 배면 투명"
            />
          </div>
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
            {INNER_PRESETS.filter((preset) => preset.id !== "custom").map((preset) => (
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
            <Button
              type="button"
              size="sm"
              variant={edit.inner.preset === "custom" ? "default" : "outline"}
              className="h-7 px-1 text-[11px]"
              onClick={() => onEdit(applyInnerPreset(edit, "custom"))}
            >
              직접 입력
            </Button>
          </div>
          {clinicLabel ? (
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant={edit.inner.preset === "clinic" ? "default" : "outline"}
                className="h-7 flex-1 px-1 text-[11px]"
                disabled={!clinicSaved}
                onClick={onApplyClinic}
              >
                {clinicLabel}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[11px]"
                title="이 치과의 시멘트 갭, 최소 두께, 교합 간격을 저장합니다."
                onClick={onSaveClinic}
              >
                저장
              </Button>
            </div>
          ) : null}
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
          {edit.pontic.on ? (
            <Row label="폰틱 기저면">
              <div className="grid grid-cols-3 gap-1">
                {PONTIC_BASES.map((base) => (
                  <Tooltip key={base.id}>
                    <TooltipTrigger asChild>
                      <span className="flex min-w-0">
                        <Button
                          type="button"
                          size="sm"
                          variant={edit.pontic.base === base.id ? "default" : "outline"}
                          className="h-7 w-full px-1 text-[11px]"
                          onClick={() =>
                            onEdit({ ...edit, pontic: { ...edit.pontic, base: base.id } })
                          }
                        >
                          {base.label}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="z-[520]">
                      {base.hint}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </Row>
          ) : null}
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
                  inner: { ...edit.inner, preset: "custom" },
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
                  inner: { ...edit.inner, preset: "custom" },
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
                  inner: { ...edit.inner, preset: "custom" },
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
          {isBridge && connectorRow ? (
            <ConnectorControls
              connectors={connectors}
              row={connectorRow}
              assembled={bridgeAssembled}
              ready={bridgeReady}
              onSelect={onConnectorFrom}
              onChange={(connector) => onConnector(connectorRow.from, connector)}
              onAssemble={onAssemble}
              focusView={focusView}
              onFocusView={onFocusView}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

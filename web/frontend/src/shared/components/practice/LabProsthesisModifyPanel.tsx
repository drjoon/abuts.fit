// 기공소 AI 보철 — 마진·삽입·내면·형상·훅·컷백·홀·커넥터 조작.

import { useState, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CONNECTOR_SHAPES,
  MODIFY_TOOLS,
  PONTIC_BASES,
  SCULPT_SHAPES,
  adjustMarginOffset,
  connectorAreaMm2,
  connectorIsWeak,
  connectorMinAreaMm2,
  holeIssue,
  shellThicknessMm,
  type EditBrush,
  type MarginEditMode,
  type ModifyTool,
  type SculptBrush,
  type ToothDesignEdit,
} from "@/shared/practice/labProsthesisModify";
import {
  applyPresetForKind,
  CAVITY_TAPER_RECOMMENDED,
  cavityDepthMm,
  cavityTaperSummary,
  cavityThicknessMm,
  designIsThin,
  innerPresetsFor,
  type CavityKind,
} from "@/shared/practice/labInlayDesign";
import { fitDistanceRgb } from "@/shared/components/practice/labProsthesisEditLayer";
import { cn } from "@/shared/ui/cn";

/** 임플란트 치아의 스캔바디 정렬. 없으면 스캔바디 도구를 두지 않는다. */
export type ScanbodyControls = {
  libraryLabel: string | null;
  aligned: boolean;
  fitMm: number | null;
  picking: boolean;
  picks: number;
  onPickLibrary: () => void;
  onAutoFit: () => void;
  onRotate: (deltaDeg: number) => void;
  onTogglePick: () => void;
  onReset: () => void;
  onApply: () => void;
};

const DEFAULT_MARGIN_STEP = 0.1;
const MARGIN_STEP_MIN = 0.01;
const MARGIN_STEP_MAX = 0.5;

const FIT_LEGEND = `linear-gradient(90deg, ${[-0.1, -0.05, 0, 0.05, 0.1]
  .map((mm) => {
    const [r, g, b] = fitDistanceRgb(mm);
    return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
  })
  .join(", ")})`;

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
  /** 인레이·온레이면 마진은 와동 테두리, 두께는 와동 단면으로 본다. */
  cavityKind: CavityKind | null;
  generated: boolean;
  isBridge: boolean;
  canMatchInsertion: boolean;
  holeNote: string;
  onRedetect: () => void;
  /** 다시 검출 시작점을 찍는 중. */
  redetectPicking: boolean;
  onClearMargin: () => void;
  undercutShown: boolean;
  canUndercut: boolean;
  onUndercut: (on: boolean) => void;
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
  sculptBrush: SculptBrush;
  onSculptBrush: (next: SculptBrush) => void;
  scanbody: ScanbodyControls | null;
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
  cavityKind,
  generated,
  isBridge,
  canMatchInsertion,
  holeNote,
  onRedetect,
  redetectPicking,
  onClearMargin,
  undercutShown,
  canUndercut,
  onUndercut,
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
  sculptBrush,
  onSculptBrush,
  scanbody,
}: Props) {
  const implant = edit.implant.on;
  const cavity = implant || edit.pontic.on ? null : cavityKind;
  const thin = designIsThin(edit, cavity);
  const presets = innerPresetsFor(cavity);
  const taper = cavity ? cavityTaperSummary(edit.margin.cavity) : null;
  const issue = implant ? null : holeIssue(edit.hole);
  const marginWord = implant ? "EPL" : "마진";
  const [stepDraft, setStepDraft] = useState(DEFAULT_MARGIN_STEP.toFixed(2));
  const parsedStep = Number(stepDraft);
  const marginStep = Number.isFinite(parsedStep)
    ? Math.min(MARGIN_STEP_MAX, Math.max(MARGIN_STEP_MIN, Math.round(parsedStep * 100) / 100))
    : DEFAULT_MARGIN_STEP;
  const tools = MODIFY_TOOLS.filter((item) => item.id !== "scanbody" || scanbody);
  const connectorRow =
    connectors.find((row) => row.from === connectorFrom) ?? connectors[0] ?? null;

  return (
    <section className="space-y-2">
      <p className="text-xs font-semibold text-foreground">수정</p>
      {toothLabel ? (
        <p className="text-[11px] text-muted-foreground">{toothLabel}</p>
      ) : null}
      <div className="grid grid-cols-4 gap-1">
        {tools.map((item) =>
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
              data-coach={`tool-${item.id}`}
              onClick={() => onTool(item.id)}
            >
              {item.id === "margin" ? marginWord : item.label}
            </Button>
          ),
        )}
      </div>

      {tool === "scanbody" && scanbody ? (
        <div className="space-y-2">
          <Row label="라이브러리">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 w-full justify-start truncate px-2 text-[11px]"
              data-coach="implant-library"
              onClick={scanbody.onPickLibrary}
            >
              {scanbody.libraryLabel ?? "라이브러리 고르기"}
            </Button>
          </Row>
          <div className="space-y-1">
            <div
              className="h-2 rounded-sm"
              style={{ background: FIT_LEGEND }}
              aria-label="스캔바디 거리 -0.1mm부터 +0.1mm"
            />
            <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground">
              <span>-0.1</span>
              <span>0</span>
              <span>+0.1</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex min-w-0">
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 w-full text-[11px]"
                    disabled={!scanbody.libraryLabel}
                    data-coach="scanbody-fit"
                    onClick={scanbody.onAutoFit}
                  >
                    자동 맞춤
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" className="z-[520]">
                스캔바디 윗면과 옆면을 찾아 라이브러리를 맞춥니다.
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex min-w-0">
                  <Button
                    type="button"
                    size="sm"
                    variant={scanbody.picking ? "default" : "outline"}
                    className="h-7 w-full text-[11px]"
                    disabled={!scanbody.libraryLabel}
                    onClick={scanbody.onTogglePick}
                  >
                    {scanbody.picking ? `점 ${scanbody.picks}/3` : "점 3개 정렬"}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" className="z-[520]">
                스캔바디 윗면 가장자리를 세 곳 찍습니다.
                <br />
                세 점이 지나는 원으로 축과 중심을 잡습니다.
              </TooltipContent>
            </Tooltip>
          </div>
          <Row label="회전" value={`${Math.round(((edit.implant.rotDeg % 360) + 360) % 360)}°`}>
            <div className="grid grid-cols-2 gap-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                disabled={!scanbody.libraryLabel}
                onClick={() => scanbody.onRotate(-60)}
              >
                -60°
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                disabled={!scanbody.libraryLabel}
                onClick={() => scanbody.onRotate(60)}
              >
                +60°
              </Button>
            </div>
          </Row>
          {scanbody.aligned ? (
            <p className="text-[11px] font-medium text-foreground">
              평균 거리 {scanbody.fitMm == null ? "-" : `${scanbody.fitMm.toFixed(3)} mm`}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              disabled={!scanbody.aligned}
              onClick={scanbody.onReset}
            >
              초기화
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 text-[11px]"
              disabled={!scanbody.aligned}
              data-coach="scanbody-apply"
              onClick={scanbody.onApply}
            >
              적용
            </Button>
          </div>
        </div>
      ) : null}

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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant={marginMode === "point" ? "default" : "outline"}
                  className="h-7 text-[11px]"
                  onClick={() => onMarginMode("point")}
                >
                  점 편집
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="z-[520]">
                점을 끌어 스캔 면 위로 옮깁니다.
                <br />
                선을 누르면 점을 더하고, 점을 우클릭하면 지웁니다.
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant={marginMode === "pen" ? "default" : "outline"}
                  className="h-7 text-[11px]"
                  onClick={() => onMarginMode("pen")}
                >
                  펜
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="z-[520]">
                {marginWord}을 따라 끌면 그 구간을 다시 그립니다.
                <br />
                한 바퀴를 그리면 {marginWord} 전체를 바꿉니다.
              </TooltipContent>
            </Tooltip>
          </div>
          {implant && !edit.implant.aligned ? (
            <p className="text-[11px] leading-relaxed text-destructive">
              스캔바디를 먼저 맞춥니다.
              <br />
              EPL은 맞춘 인터페이스 둘레에서 잡습니다.
            </p>
          ) : null}
          <Row label={`${marginWord} 간격`} value={`${edit.margin.offsetMm.toFixed(2)} mm`}>
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
              aria-label={`${marginWord} 간격`}
            />
          </Row>
          <div className="flex items-center justify-between gap-2 text-xs font-medium">
            <span>조정</span>
            <span className="flex items-center gap-1">
              <Input
                type="number"
                min={MARGIN_STEP_MIN}
                max={MARGIN_STEP_MAX}
                step={0.01}
                value={stepDraft}
                onChange={(event) => setStepDraft(event.target.value)}
                onBlur={() => setStepDraft(marginStep.toFixed(2))}
                className="h-7 w-16 px-1.5 text-right text-[11px] tabular-nums"
                aria-label={`${marginWord} 조정 간격`}
              />
              <span className="text-muted-foreground">mm</span>
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() => onEdit(adjustMarginOffset(edit, -marginStep))}
              title={`${marginWord} 전체를 안쪽으로 ${marginStep.toFixed(2)}mm 줄입니다.`}
            >
              수축
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() => onEdit(adjustMarginOffset(edit, marginStep))}
              title={`${marginWord} 전체를 바깥쪽으로 ${marginStep.toFixed(2)}mm 넓힙니다.`}
            >
              확장
            </Button>
          </div>
          {implant ? null : (
            <div className="space-y-1 rounded-md border px-2 py-1.5 text-xs">
              <label className="flex items-center justify-between gap-3">
                <span className="font-medium text-foreground">언더컷 표시</span>
                <Switch
                  checked={undercutShown}
                  disabled={!canUndercut}
                  onCheckedChange={onUndercut}
                  aria-label="언더컷 표시"
                />
              </label>
              <label className="flex items-center justify-between gap-3">
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
              </label>
            </div>
          )}
          <div className="flex gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant={redetectPicking ? "default" : "outline"}
                  className="h-7 flex-1 text-[11px]"
                  aria-pressed={redetectPicking}
                  onClick={onRedetect}
                >
                  {redetectPicking ? "시작점 찍는 중" : "다시 검출"}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="z-[520]">
                {cavity ? (
                  "와동 테두리를 다시 잡습니다."
                ) : (
                  <>
                    {marginWord} 위 시작점을 찍습니다.
                    <br />
                    그 자리부터 {marginWord}을 다시 검출합니다.
                  </>
                )}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 flex-1 text-[11px]"
                  onClick={onClearMargin}
                >
                  {marginWord} 삭제
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="z-[520]">
                {marginWord}을 지우고 새로 잡습니다.
                <br />
                시작점부터 점을 찍고, 시작점을 다시 누르면 닫힙니다.
              </TooltipContent>
            </Tooltip>
          </div>
          {cavity ? (
            <div className="space-y-1 rounded-md border px-2 py-1.5 text-[11px]">
              <div className="flex items-center justify-between font-medium text-foreground">
                <span>와동 벽 테이퍼</span>
                <span className="tabular-nums text-muted-foreground">
                  {taper
                    ? `${taper.minDeg.toFixed(0)}–${taper.maxDeg.toFixed(0)}°`
                    : "검출 전"}
                </span>
              </div>
              {taper && taper.undercut > 0 ? (
                <p className="flex items-center gap-1 text-destructive">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-red-600" aria-hidden />
                  빨간 점 {taper.undercut}곳은 벽이 삽입축과 평행하거나 언더컷입니다.
                </p>
              ) : null}
              {taper && taper.wide > 0 ? (
                <p className="flex items-center gap-1 text-amber-700">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
                  주황 점 {taper.wide}곳은 벽이 넓게 벌어져 유지력이 약합니다.
                </p>
              ) : null}
              <p className="text-muted-foreground">
                권장 {CAVITY_TAPER_RECOMMENDED}. 삽입축을 다시 잡으면 다시 잽니다.
              </p>
            </div>
          ) : null}
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
                  className="h-7 w-full text-[11px]"
                  disabled={!canMatchInsertion}
                  onClick={onMatchInsertion}
                >
                  화면 각도로 맞추기
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" className="z-[520]">
              화면을 돌리면 삽입축이 화면과 수직으로 따라옵니다.
              <br />
              가운데 뱃지에서 확정합니다.
            </TooltipContent>
          </Tooltip>
          <p className="text-[11px] text-muted-foreground">
            화살표 끝을 끌면 직접 기울입니다.
            <br />
            끄는 동안 언더컷 색이 바로 바뀝니다.
          </p>
        </div>
      ) : null}

      {tool === "inner" ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1">
            {presets.filter((preset) => preset.id !== "custom").map((preset) => (
              <Button
                key={preset.id}
                type="button"
                size="sm"
                variant={edit.inner.preset === preset.id ? "default" : "outline"}
                className="h-7 px-1 text-[11px]"
                title={`최소 두께 ${preset.minThicknessMm.toFixed(1)} mm`}
                onClick={() => onEdit(applyPresetForKind(edit, cavity, preset.id))}
              >
                {preset.label}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant={edit.inner.preset === "custom" ? "default" : "outline"}
              className="h-7 px-1 text-[11px]"
              onClick={() => onEdit(applyPresetForKind(edit, cavity, "custom"))}
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
          <div className="grid grid-cols-2 gap-1">
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
                보철 면을 눌러 고칩니다.
                <br />
                오른쪽 클릭은 더하기와 빼기를 뒤집습니다.
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
          {brush === "sculpt" ? (
            <div className="space-y-2 rounded-md border px-2 py-2">
              <div className="grid grid-cols-3 gap-1">
                {SCULPT_SHAPES.map((shape) => (
                  <Tooltip key={shape.id}>
                    <TooltipTrigger asChild>
                      <span className="flex min-w-0">
                        <Button
                          type="button"
                          size="sm"
                          variant={sculptBrush.shape === shape.id ? "default" : "outline"}
                          className="h-7 w-full px-1 text-[11px]"
                          onClick={() => onSculptBrush({ ...sculptBrush, shape: shape.id })}
                        >
                          {shape.label}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="z-[520]">
                      {shape.hint}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
              <Row label="브러시 크기" value={`${sculptBrush.sizeMm.toFixed(2)} mm`}>
                <Slider
                  min={40}
                  max={500}
                  step={5}
                  value={[Math.round(sculptBrush.sizeMm * 100)]}
                  onValueChange={([value]) =>
                    onSculptBrush({ ...sculptBrush, sizeMm: (value ?? 160) / 100 })
                  }
                  aria-label="브러시 크기"
                />
              </Row>
              <Row label="강도" value={`${Math.round(sculptBrush.strength * 100)}%`}>
                <Slider
                  min={10}
                  max={100}
                  step={5}
                  value={[Math.round(sculptBrush.strength * 100)]}
                  onValueChange={([value]) =>
                    onSculptBrush({ ...sculptBrush, strength: (value ?? 50) / 100 })
                  }
                  aria-label="강도"
                />
              </Row>
              <label className="flex items-center justify-between gap-3 text-xs font-medium">
                줌에 맞춰 크기 동기화
                <Switch
                  checked={sculptBrush.zoomSync}
                  onCheckedChange={(zoomSync) => onSculptBrush({ ...sculptBrush, zoomSync })}
                  aria-label="줌에 맞춰 브러시 크기 동기화"
                  className="h-5 w-9 data-[state=checked]:bg-primary [&>span]:h-4 [&>span]:w-4 data-[state=checked]:[&>span]:translate-x-4"
                />
              </label>
            </div>
          ) : null}
          <Row label="최소 두께" value={`${edit.refine.minThicknessMm.toFixed(2)} mm`}>
            <Slider
              min={30}
              max={cavity ? 250 : 120}
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
            {cavity
              ? `와동 단면 ${cavityThicknessMm(edit, cavity, cavityDepthMm(edit, cavity)).toFixed(2)} mm`
              : `외면 ${shellThicknessMm(edit).toFixed(2)} mm`}
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

      {tool === "hole" && implant ? (
        <div className="space-y-2">
          <label className="flex items-center justify-between gap-3 text-xs font-medium">
            스크류홀
            <Switch
              checked={edit.implant.screwHole}
              onCheckedChange={(screwHole) =>
                onEdit({ ...edit, implant: { ...edit.implant, screwHole } })
              }
              aria-label="스크류홀"
              className="h-5 w-9 data-[state=checked]:bg-primary [&>span]:h-4 [&>span]:w-4 data-[state=checked]:[&>span]:translate-x-4"
            />
          </label>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            스캔바디에 맞춘 임플란트 축을 따라 뚫습니다.
            <br />
            표시 목록에서 스크류 경로를 켜고 끕니다.
          </p>
        </div>
      ) : null}

      {tool === "hole" && !implant ? (
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

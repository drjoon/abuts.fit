// 기공소 AI 보철 — 마진·삽입·내면·형상·훅·컷백·홀·커넥터 조작.

import { Fragment, useState, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  CUTBACK_BRUSH_RANGE_MM,
  CUTBACK_DEPTH_RANGE_MM,
  MODIFY_TOOLS,
  adjustMarginOffset,
  applyInnerParams,
  cutbackHasSelection,
  editCutbackSelection,
  invertCutbackSelection,
  connectorAreaMm2,
  connectorIsWeak,
  connectorMinAreaMm2,
  DISC_RANGE_MM,
  HOLE_RADIUS_MAX_MM,
  HOLE_RADIUS_MIN_MM,
  HOOK_LENGTH_RANGE_MM,
  HOOK_MAX_COUNT,
  HOOK_RADIUS_RANGE_MM,
  holeTiltDeg,
  innerParamsOf,
  type EditBrush,
  type MarginEditMode,
  type ModifyTool,
  type RefineTab,
  type SculptBrush,
  type ToothDesignEdit,
} from "@/shared/practice/labProsthesisModify";
import {
  CAVITY_TAPER_RECOMMENDED,
  cavityTaperSummary,
  designIsThin,
  type CavityKind,
} from "@/shared/practice/labInlayDesign";
import {
  INNER_FIELDS,
  INNER_KINDS,
  INNER_METHODS,
  innerKindOf,
  withMethod,
  type DesignPreset,
  type InnerKind,
  type InnerParams,
} from "@/shared/practice/labDesignPresets";
import {
  HintLines,
  InnerMaterialSelect,
  InnerNumberInput,
} from "@/shared/components/practice/LabInnerParamFields";
import {
  fitDistanceRgb,
  type CrownIntaglioInfo,
} from "@/shared/components/practice/labProsthesisEditLayer";
import { LabRefineControls } from "@/shared/components/practice/LabRefineControls";
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
  /** 뷰어가 잰 홀 검사 결과. 통과면 null. */
  holeIssue: string | null;
  onViewHoleAxis: () => void;
  onRedetect: () => void;
  /** 다시 검출 시작점을 찍는 중. */
  redetectPicking: boolean;
  onClearMargin: () => void;
  undercutShown: boolean;
  canUndercut: boolean;
  onUndercut: (on: boolean) => void;
  onMatchInsertion: () => void;
  onRemoveHook: () => void;
  /** 기공소 디자인 프리셋. 내면 도구에서 복사한다. */
  designPresets: DesignPreset[];
  onOpenPresets: (presetId: string | null) => void;
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
  /** 형상 도구 단계(변형·외면·맞춤). */
  refineTab: RefineTab;
  onRefineTab: (tab: RefineTab) => void;
  /** 뷰어가 맞춘 이 크라운에서 잰 가장 얇은 외면. 맞춤이 없으면 null. */
  crownShellMm: number | null;
  /** 뷰어가 지대치 스캔에서 이 크라운 내면을 만든 결과. 아직 없으면 null. */
  intaglio: CrownIntaglioInfo | null;
  /** 칼라맵의 내면 간격 모드를 연다. */
  onViewFit: () => void;
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
  const minArea = connectorMinAreaMm2(row.edit.inner.material, [row.from, row.to]);
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
        <>
          <p className="text-[11px] text-muted-foreground">
            {row.from}번과 {row.to}번을 잇지 않습니다.
          </p>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <Row
                  label="디스크 간격"
                  value={connector.discMm > 0 ? `${connector.discMm.toFixed(2)} mm` : "깎지 않음"}
                >
                  <Slider
                    min={DISC_RANGE_MM.min * 100}
                    max={DISC_RANGE_MM.max * 100}
                    step={1}
                    disabled={locked}
                    value={[Math.round(connector.discMm * 100)]}
                    onValueChange={([value]) => set({ discMm: (value ?? 0) / 100 })}
                    aria-label={`${row.from}-${row.to} 디스크 간격`}
                  />
                </Row>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="z-[520]">
              두 보철이 맞닿은 인접면을 이 간격만큼 떼어 깎습니다.
              <br />
              커넥터를 끈 자리에만 씁니다.
            </TooltipContent>
          </Tooltip>
        </>
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

/**
 * 내면 도구. 값은 이 패널 안에서만 고치고 「적용」을 눌러야 치아에 건다.
 * 프리셋에서 복사하면 그 프리셋의 이 치아 유형 열을 가져온다.
 */
function InnerControls({
  edit,
  kind,
  generated,
  presets,
  onEdit,
  onOpenPresets,
  intaglio,
  onViewFit,
}: {
  edit: ToothDesignEdit;
  kind: InnerKind;
  generated: boolean;
  presets: DesignPreset[];
  onEdit: (next: ToothDesignEdit) => void;
  onOpenPresets: (presetId: string | null) => void;
  intaglio: CrownIntaglioInfo | null;
  onViewFit: () => void;
}) {
  const committed = innerParamsOf(edit);
  const [draft, setDraft] = useState<InnerParams>(committed);
  const [blockOut, setBlockOut] = useState(edit.inner.blockOut);
  const [source, setSource] = useState<DesignPreset | null>(
    () => presets.find((row) => row.id === edit.inner.presetId) ?? null,
  );
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(committed) ||
    blockOut !== edit.inner.blockOut ||
    (source?.id ?? null) !== (edit.inner.presetId || null);
  const kindLabel = INNER_KINDS.find((row) => row.id === kind)?.label ?? "";
  const set = (patch: Partial<InnerParams>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    setSource(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-muted-foreground">{kindLabel} 열</span>
        <button
          type="button"
          className="font-medium text-primary hover:underline"
          onClick={() => onOpenPresets(source?.id ?? edit.inner.presetId ?? null)}
        >
          프리셋 관리
        </button>
      </div>
      <select
        className="h-7 w-full rounded-md border bg-background px-1 text-[11px]"
        aria-label="프리셋에서 복사"
        value={source?.id ?? ""}
        onChange={(event) => {
          const preset = presets.find((row) => row.id === event.target.value);
          if (!preset) return;
          setDraft({ ...preset[kind] });
          setSource(preset);
        }}
      >
        <option value="" disabled>
          {edit.inner.presetId === null || dirty ? "직접 조정" : "프리셋에서 복사"}
        </option>
        {presets.map((row) => (
          <option key={row.id} value={row.id}>
            {row.name}
          </option>
        ))}
      </select>
      <Row label="가공 방식">
        <div className="grid grid-cols-2 gap-1">
          {INNER_METHODS.map((method) => (
            <Button
              key={method.id}
              type="button"
              size="sm"
              variant={draft.method === method.id ? "default" : "outline"}
              className="h-7 px-1 text-[11px]"
              onClick={() => {
                setDraft((prev) => withMethod(prev, method.id));
                setSource(null);
              }}
            >
              {method.label}
            </Button>
          ))}
        </div>
      </Row>
      <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] items-center gap-x-2 gap-y-1.5">
        <span className="text-xs font-medium">재료</span>
        <InnerMaterialSelect
          label="재료"
          method={draft.method}
          value={draft.material}
          onChange={(material) => set({ material })}
        />
        {INNER_FIELDS.map((field) => (
          <Fragment key={field.key}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="w-fit cursor-help text-xs font-medium">{field.label}</span>
              </TooltipTrigger>
              <TooltipContent side="right" className="z-[520] max-w-72">
                <HintLines text={field.hint} />
              </TooltipContent>
            </Tooltip>
            <InnerNumberInput
              field={field}
              label={field.label}
              value={draft[field.key]}
              disabled={field.key === "toolRadiusMm" && draft.method === "print"}
              onChange={(value) => set({ [field.key]: value })}
            />
          </Fragment>
        ))}
      </div>
      <label className="flex items-center gap-2 text-xs font-medium">
        <Checkbox
          className="h-3.5 w-3.5"
          checked={blockOut}
          onCheckedChange={(checked) => setBlockOut(checked === true)}
          aria-label="블록아웃"
        />
        블록아웃
      </label>
      <div className="space-y-1.5 rounded-md border p-2">
        <label className="flex items-center gap-2 text-xs font-medium">
          <Checkbox
            className="h-3.5 w-3.5"
            checked={edit.inner.intaglio}
            onCheckedChange={(checked) =>
              onEdit({ ...edit, inner: { ...edit.inner, intaglio: checked === true } })
            }
            aria-label="지대치에서 내면 생성"
          />
          지대치에서 내면 생성
        </label>
        <p className="text-[11px] leading-snug text-muted-foreground">
          <IntaglioStatus edit={edit} generated={generated} info={intaglio} />
        </p>
        {intaglio?.status === "ok" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 w-full text-[11px]"
            onClick={onViewFit}
          >
            내면 간격 보기
          </Button>
        ) : null}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex min-w-0">
            <Button
              type="button"
              size="sm"
              className="h-7 w-full text-[11px]"
              disabled={!dirty}
              onClick={() => {
                const same = source && JSON.stringify(source[kind]) === JSON.stringify(draft);
                onEdit(applyInnerParams(edit, draft, kind, same ? source : null, blockOut));
              }}
            >
              적용
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="right" className="z-[520]">
          {generated
            ? "생성한 보철 내면을 이 값으로 다시 만듭니다."
            : "생성할 때 이 값을 씁니다."}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

/** 내면 생성 상태 안내. 문장마다 줄을 나눈다. */
function IntaglioStatus({
  edit,
  generated,
  info,
}: {
  edit: ToothDesignEdit;
  generated: boolean;
  info: CrownIntaglioInfo | null;
}) {
  if (!edit.inner.intaglio) {
    return (
      <>
        끄면 외면만 그립니다.
        <br />
        위 숫자는 생성 크기 검토에만 씁니다.
      </>
    );
  }
  if (!generated || !info) {
    return (
      <>
        보철을 생성하면 지대치 스캔에서 내면을 만듭니다.
        <br />
        위 간격·마진 두께가 그대로 들어갑니다.
      </>
    );
  }
  if (info.status === "ok") {
    return (
      <>
        내면을 만들었습니다.
        <br />
        외면과 이어 내보내기에 함께 들어갑니다.
        {info.minThicknessMm != null ? (
          <>
            <br />
            가장 얇은 곳 {info.minThicknessMm.toFixed(2)}mm.
          </>
        ) : null}
        {info.maxGapErrorMm != null && info.maxGapErrorMm > 0.15 ? (
          <>
            <br />
            스캔 잡음·구멍으로 설계 간격에서 최대 {info.maxGapErrorMm.toFixed(2)}mm 벗어난 곳이 있습니다.
          </>
        ) : null}
      </>
    );
  }
  if (info.status === "sparse") {
    return (
      <>
        지대치 스캔이 없거나 성겨 내면을 만들지 못했습니다.
        <br />
        외면만 그립니다.
      </>
    );
  }
  if (info.status === "margin") {
    return (
      <>
        마진이 모자라 내면을 만들지 못했습니다.
        <br />
        마진을 먼저 잡아 주세요.
      </>
    );
  }
  return (
    <>
      이 보철은 내면 메시를 만들지 않습니다.
      <br />
      폰틱·임플란트·스크류홀 크라운은 외면만 그립니다.
    </>
  );
}

function ToolButton({
  active,
  disabled,
  hint,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  hint: ReactNode;
  onClick: () => void;
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
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * 컷백. 프리셋으로 영역을 잡고 브러시로 더하고 뺀 뒤 적용하면 그 영역을 깊이만큼 깎는다.
 * 깎은 면은 형상 › 외면 스컬프트로 다듬는다.
 */
function CutbackControls({
  edit,
  onEdit,
  brush,
  onBrush,
  generated,
  intaglio,
  onRefineSurface,
}: {
  edit: ToothDesignEdit;
  onEdit: (next: ToothDesignEdit) => void;
  brush: EditBrush;
  onBrush: (brush: EditBrush) => void;
  generated: boolean;
  intaglio: CrownIntaglioInfo | null;
  onRefineSurface: () => void;
}) {
  const { cutback } = edit;
  const selected = cutbackHasSelection(cutback);
  const set = (patch: Partial<ToothDesignEdit["cutback"]>) =>
    onEdit({ ...edit, cutback: { ...cutback, ...patch } });

  if (!generated) {
    return (
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        크라운을 생성한 뒤 컷백합니다.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">컷백할 영역을 고릅니다.</p>
      <Row label="프리셋">
        <div className="grid grid-cols-2 gap-1">
          <ToolButton
            active={cutback.preset === "partial"}
            hint="절단연과 순면 쪽을 고릅니다."
            onClick={() => onEdit(editCutbackSelection(edit, { preset: "partial", ops: [] }))}
          >
            부분
          </ToolButton>
          <ToolButton
            active={cutback.preset === "full"}
            hint="마진 띠를 뺀 외면 전체를 고릅니다."
            onClick={() => onEdit(editCutbackSelection(edit, { preset: "full", ops: [] }))}
          >
            전체
          </ToolButton>
        </div>
      </Row>
      <Row label="브러시">
        <div className="grid grid-cols-2 gap-1">
          <ToolButton
            active={brush === "plus"}
            hint="칠한 자리를 선택에 넣습니다."
            onClick={() => onBrush(brush === "plus" ? "none" : "plus")}
          >
            더하기
          </ToolButton>
          <ToolButton
            active={brush === "minus"}
            hint="칠한 자리를 선택에서 뺍니다."
            onClick={() => onBrush(brush === "minus" ? "none" : "minus")}
          >
            빼기
          </ToolButton>
        </div>
      </Row>
      <Row label="브러시 크기" value={`${cutback.brushMm.toFixed(1)} mm`}>
        <Slider
          min={CUTBACK_BRUSH_RANGE_MM.min * 10}
          max={CUTBACK_BRUSH_RANGE_MM.max * 10}
          step={1}
          value={[Math.round(cutback.brushMm * 10)]}
          onValueChange={([value]) => set({ brushMm: (value ?? 30) / 10 })}
          aria-label="컷백 브러시 크기"
        />
      </Row>
      <Row label="선택 영역">
        <div className="grid grid-cols-2 gap-1">
          <ToolButton
            hint={
              <>
                고른 곳과 고르지 않은 곳을 바꿉니다.
                <br />
                마진 띠는 바꿔도 깎지 않습니다.
              </>
            }
            onClick={() => onEdit(invertCutbackSelection(edit))}
          >
            반전
          </ToolButton>
          <ToolButton
            disabled={!selected}
            hint="선택을 모두 지웁니다."
            onClick={() => onEdit(editCutbackSelection(edit, { preset: "none", ops: [] }))}
          >
            지우기
          </ToolButton>
        </div>
      </Row>
      <Row label="깎는 깊이" value={`${cutback.depthMm.toFixed(2)} mm`}>
        <Slider
          min={CUTBACK_DEPTH_RANGE_MM.min * 100}
          max={CUTBACK_DEPTH_RANGE_MM.max * 100}
          step={5}
          value={[Math.round(cutback.depthMm * 100)]}
          onValueChange={([value]) => set({ depthMm: (value ?? 50) / 100 })}
          aria-label="컷백 깊이"
        />
      </Row>
      <label className="flex items-center gap-2 text-xs font-medium">
        <Checkbox
          className="h-3.5 w-3.5"
          checked={cutback.preserveMinThickness}
          onCheckedChange={(checked) => set({ preserveMinThickness: checked === true })}
          aria-label="최소 두께 유지"
        />
        최소 두께 유지 ({edit.refine.minThicknessMm.toFixed(2)} mm)
      </label>
      {cutback.preserveMinThickness && intaglio?.status !== "ok" ? (
        <p className="text-[11px] leading-snug text-amber-700">
          지대치 내면이 없어 두께를 재지 못합니다.
          <br />
          깊이만큼 그대로 깎습니다.
        </p>
      ) : null}
      {cutback.applied ? (
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-1">
            <ToolButton hint="깎기 전 선택으로 돌아갑니다." onClick={() => set({ applied: false })}>
              되돌리기
            </ToolButton>
            <ToolButton
              active
              hint={
                <>
                  형상 › 외면 스컬프트로 엽니다.
                  <br />
                  깎은 면의 경계와 굴곡을 다듬습니다.
                </>
              }
              onClick={onRefineSurface}
            >
              면 다듬기
            </ToolButton>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            선택을 고치면 깎은 면이 풀리고 선택부터 다시 보입니다.
          </p>
        </div>
      ) : (
        <ToolButton
          active
          disabled={!selected}
          hint={selected ? "선택 영역을 깊이만큼 깎습니다." : "프리셋이나 더하기 브러시로 영역을 먼저 고릅니다."}
          onClick={() => {
            set({ applied: true });
            onBrush("none");
          }}
        >
          적용
        </ToolButton>
      )}
    </div>
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
  holeIssue,
  onViewHoleAxis,
  onRedetect,
  redetectPicking,
  onClearMargin,
  undercutShown,
  canUndercut,
  onUndercut,
  onMatchInsertion,
  onRemoveHook,
  designPresets,
  onOpenPresets,
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
  refineTab,
  onRefineTab,
  crownShellMm,
  intaglio,
  onViewFit,
}: Props) {
  const implant = edit.implant.on;
  const cavity = implant || edit.pontic.on ? null : cavityKind;
  const thin = designIsThin(edit, cavity, crownShellMm);
  const innerKind = innerKindOf(edit, cavity);
  const taper = cavity ? cavityTaperSummary(edit.margin.cavity) : null;
  const holeMessage = holeIssue || holeNote;
  const holeRadiusRow = (
    <Row label="반지름" value={`${edit.hole.radiusMm.toFixed(2)} mm`}>
      <Slider
        min={HOLE_RADIUS_MIN_MM * 100}
        max={HOLE_RADIUS_MAX_MM * 100}
        step={5}
        value={[Math.round(edit.hole.radiusMm * 100)]}
        onValueChange={([value]) =>
          onEdit({
            ...edit,
            hole: { ...edit.hole, radiusMm: (value ?? 125) / 100 },
          })
        }
        aria-label="홀 반지름"
      />
    </Row>
  );
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
                    {scanbody.picking ? "점을 찍으세요" : "점 찍기"}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" className="z-[520]">
                스캔바디 위를 한 점 찍으면 그 자리에서 찾습니다.
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
        edit.pontic.on ? (
          <p className="text-[11px] text-muted-foreground">폰틱은 내면이 없습니다.</p>
        ) : (
          <InnerControls
            key={`${toothLabel ?? ""}\0${innerKind}\0${JSON.stringify(edit.inner)}\0${edit.refine.minThicknessMm}`}
            edit={edit}
            kind={innerKind}
            generated={generated}
            presets={designPresets}
            onEdit={onEdit}
            onOpenPresets={onOpenPresets}
            intaglio={intaglio}
            onViewFit={onViewFit}
          />
        )
      ) : null}

      {tool === "refine" ? (
        <LabRefineControls
          edit={edit}
          onEdit={onEdit}
          generated={generated}
          cavity={cavity}
          thin={thin}
          measuredShellMm={crownShellMm}
          tab={refineTab}
          onTab={onRefineTab}
          brush={brush}
          onBrush={onBrush}
          sculptBrush={sculptBrush}
          onSculptBrush={onSculptBrush}
        />
      ) : null}

      {tool === "hook" && cavity ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          인레이·온레이에는 훅을 붙이지 않습니다.
        </p>
      ) : null}

      {tool === "hook" && !cavity ? (
        <div className="space-y-2">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
            {[
              ["추가", "보철 외면 클릭"],
              ["삭제", "오른쪽 클릭"],
              ["이동", "훅 끌기"],
            ].map(([key, value]) => (
              <Fragment key={key}>
                <dt className="font-medium">{key}</dt>
                <dd className="text-muted-foreground">{value}</dd>
              </Fragment>
            ))}
          </dl>
          <Row label="반지름" value={`${edit.hook.radiusMm.toFixed(2)} mm`}>
            <Slider
              min={HOOK_RADIUS_RANGE_MM.min * 100}
              max={HOOK_RADIUS_RANGE_MM.max * 100}
              step={5}
              value={[Math.round(edit.hook.radiusMm * 100)]}
              onValueChange={([value]) =>
                onEdit({
                  ...edit,
                  hook: { ...edit.hook, radiusMm: (value ?? 80) / 100 },
                })
              }
              aria-label="훅 반지름"
            />
          </Row>
          <Row label="길이" value={`${edit.hook.lengthMm.toFixed(1)} mm`}>
            <Slider
              min={HOOK_LENGTH_RANGE_MM.min * 10}
              max={HOOK_LENGTH_RANGE_MM.max * 10}
              step={1}
              value={[Math.round(edit.hook.lengthMm * 10)]}
              onValueChange={([value]) =>
                onEdit({
                  ...edit,
                  hook: { ...edit.hook, lengthMm: (value ?? 18) / 10 },
                })
              }
              aria-label="훅 길이"
            />
          </Row>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] tabular-nums text-muted-foreground">
              훅 {edit.hook.hooks.length} / {HOOK_MAX_COUNT}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              disabled={edit.hook.hooks.length === 0}
              onClick={onRemoveHook}
            >
              모두 지우기
            </Button>
          </div>
          {!generated ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              크라운을 생성한 뒤 훅을 붙입니다.
            </p>
          ) : edit.hook.hooks.length === 0 ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              시적 때 잡을 자리를 누르면 훅이 붙습니다.
              <br />
              훅은 보철과 한 파일로 내보냅니다.
            </p>
          ) : null}
        </div>
      ) : null}

      {tool === "cutback" && cavity ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          인레이·온레이에는 컷백하지 않습니다.
        </p>
      ) : null}

      {tool === "cutback" && !cavity ? (
        <CutbackControls
          edit={edit}
          onEdit={onEdit}
          brush={brush}
          onBrush={onBrush}
          generated={generated}
          intaglio={intaglio}
          onRefineSurface={() => {
            onTool("refine");
            onRefineTab("outer");
            onBrush("sculpt");
          }}
        />
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
          {holeRadiusRow}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 w-full text-[11px]"
            disabled={!generated || !edit.implant.screwHole}
            onClick={onViewHoleAxis}
          >
            홀 축으로 보기
          </Button>
          {edit.implant.screwHole && holeIssue ? (
            <p className="text-[11px] leading-relaxed text-destructive">{holeIssue}</p>
          ) : null}
        </div>
      ) : null}

      {tool === "hole" && !implant && edit.pontic.on ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          폰틱에는 홀을 뚫지 않습니다.
        </p>
      ) : null}

      {tool === "hole" && !implant && !edit.pontic.on ? (
        <div className="space-y-2">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
            {[
              ["추가", "교합면 클릭"],
              ["삭제", "오른쪽 클릭"],
              ["이동", "원기둥 끌기"],
              ["회전", "끝 공 끌기"],
            ].map(([key, value]) => (
              <Fragment key={key}>
                <dt className="font-medium">{key}</dt>
                <dd className="text-muted-foreground">{value}</dd>
              </Fragment>
            ))}
          </dl>
          {holeRadiusRow}
          {edit.hole.on ? (
            <div className="flex items-center justify-between text-xs font-medium">
              <span>기울기</span>
              <span className="tabular-nums text-muted-foreground">
                {Math.round(holeTiltDeg(edit.hole.dir))}°
              </span>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-1 text-[11px]"
              disabled={!edit.hole.on}
              onClick={onViewHoleAxis}
            >
              홀 축으로 보기
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-1 text-[11px]"
              disabled={!edit.hole.on}
              onClick={() =>
                onEdit({ ...edit, hole: { ...edit.hole, on: false, applied: false } })
              }
            >
              홀 지우기
            </Button>
          </div>
          <Button
            type="button"
            size="sm"
            variant={edit.hole.applied ? "outline" : "default"}
            className="h-7 w-full text-[11px]"
            disabled={!generated || !edit.hole.on || (!edit.hole.applied && Boolean(holeIssue))}
            onClick={() =>
              onEdit({ ...edit, hole: { ...edit.hole, applied: !edit.hole.applied } })
            }
          >
            {edit.hole.applied ? "뚫은 홀 메우기" : "홀 뚫기"}
          </Button>
          {!generated ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              크라운을 생성한 뒤 홀 자리를 잡습니다.
            </p>
          ) : !edit.hole.on ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              교합면을 누르면 삽입축 방향으로 홀 자리가 잡힙니다.
              <br />
              자리를 맞춘 뒤 홀 뚫기를 누르세요.
            </p>
          ) : null}
          {edit.hole.on && holeMessage ? (
            <p className="text-[11px] leading-relaxed text-destructive">{holeMessage}</p>
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

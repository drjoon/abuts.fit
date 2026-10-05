// 기공소 AI 보철 — 마진·삽입·내면·형상·훅·컷백·홀·커넥터 조작.
// - 2026-10-01: 스캔바디 맞춤은 스캔 단계, 메시 편집 아래.
// - 2026-10-05: 디자인은 보철 생성, 그다음 내면·형상·교합·훅·컷백·홀·커넥터.

import { Fragment, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { ContactPaintMode } from "@/shared/practice/oralScanDesignAnalysis";
import {
  INNER_FIELDS,
  innerKindOf,
  withMaterial,
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
import { StageSubsection } from "@/shared/components/practice/LabMeshEditSection";
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
  onTogglePick: () => void;
  onReset: () => void;
  onApply: () => void;
  /** 의뢰가 지정한 스캔바디 라이브러리·심플어벗 템플릿이 서버에 없다. 여기서 바로 올린다. */
  missingLibrary?: {
    /** 무엇이 없는지·무엇을 올리는지. 문장마다 줄을 바꾼다. */
    lines: string[];
    accept: string;
    multiple: boolean;
    /** exocad 라이브러리 폴더를 통째로 고르는 버튼을 같이 둔다. */
    allowFolder?: boolean;
    buttonLabel: string;
    /** 올리는 중이면 진행 문구. */
    status: string | null;
    /** null이면 안내만 한다(어벗츠가 준비 중). */
    onUpload: ((files: File[]) => void) | null;
  } | null;
};


const FIT_LEGEND = `linear-gradient(90deg, ${[-0.1, -0.05, 0, 0.05, 0.1]
  .map((mm) => {
    const [r, g, b] = fitDistanceRgb(mm);
    return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
  })
  .join(", ")})`;

type Props = {
  /** prepare: 마진·삽입축. design: 내면 이후. */
  part: "prepare" | "design";
  onTool: (tool: ModifyTool) => void;
  /** 마진 점을 끌어 옮기는 편집 중인지. */
  marginEditOn: boolean;
  /** 재설정을 잠시 멈춘 상태. 마진편집을 누르면 찍어 둔 점에서 이어 찍는다. */
  marginResetPaused: boolean;
  onMarginEdit: () => void;
  /** 삽입축·치아색·잇몸색으로 마진을 자동 검출한다. */
  onAutoDetect: () => void;
  /** 이 치아의 삽입축을 잡았는지. 마진보다 먼저 잡아야 한다. */
  axisReady: boolean;
  brush: EditBrush;
  onBrush: (brush: EditBrush) => void;
  edit: ToothDesignEdit;
  onEdit: (next: ToothDesignEdit) => void;
  toothLabel: string | null;
  /** 인레이·온레이면 마진은 와동 테두리, 두께는 와동 단면으로 본다. */
  cavityKind: CavityKind | null;
  generated: boolean;
  isBridge: boolean;
  holeNote: string;
  /** 뷰어가 잰 홀 검사 결과. 통과면 null. */
  holeIssue: string | null;
  onViewHoleAxis: () => void;
  /** 다시 검출 시작점을 찍는 중. */
  marginResetOn: boolean;
  onMarginReset: () => void;
  onRemoveHook: () => void;
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
  /** 형상 도구 단계(변형·외면·맞춤). */
  refineTab: RefineTab;
  onRefineTab: (tab: RefineTab) => void;
  /** 열린 수정 하위 메뉴. 없으면 모두 접힌다. */
  openTool: ModifyTool | "occlusal" | null;
  onOpenTool: (tool: ModifyTool | "occlusal" | null) => void;
  contactMap?: boolean;
  onContactMap?: (on: boolean) => void;
  canContact?: boolean;
  occlusalGap?: number;
  onOcclusalGap?: (mm: number) => void;
  contactMode?: ContactPaintMode;
  onContactMode?: (mode: ContactPaintMode) => void;
  generating?: boolean;
  generateDisabled?: boolean;
  generateHint?: string;
  onGenerate?: () => void;
  /** 뷰어가 맞춘 이 크라운에서 잰 가장 얇은 외면. 맞춤이 없으면 null. */
  crownShellMm: number | null;
  /** 뷰어가 지대치 스캔에서 이 크라운 내면을 만든 결과. 아직 없으면 null. */
  intaglio: CrownIntaglioInfo | null;
  /** 준비 삽입축. 작업 치아 뱃지. */
  insertionTeeth?: Array<{ toothNumber: string; label: string }>;
  insertionToothNumber?: string | null;
  onPickInsertionTooth?: (toothNumber: string) => void;
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
 * 재료(가공 방식 포함)는 여기서만 고른다. 프리셋 복사는 치아 정보·헤더 설정에서 한다.
 */
function InnerControls({
  edit,
  kind,
  generated,
  onEdit,
}: {
  edit: ToothDesignEdit;
  kind: InnerKind;
  generated: boolean;
  onEdit: (next: ToothDesignEdit) => void;
}) {
  const committed = innerParamsOf(edit);
  const [draft, setDraft] = useState<InnerParams>(committed);
  const [source, setSource] = useState<{ id: string; name: string } | null>(() =>
    edit.inner.presetId
      ? { id: edit.inner.presetId, name: edit.inner.presetName }
      : null,
  );
  const dirty = JSON.stringify(draft) !== JSON.stringify(committed);
  const set = (patch: Partial<InnerParams>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    setSource(null);
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2">
        <span className="text-xs font-medium">재료</span>
        <InnerMaterialSelect
          label="재료"
          value={draft.material}
          onChange={(material) => set(withMaterial(draft, material))}
        />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] items-center gap-x-2 gap-y-1.5">
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
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex min-w-0">
            <Button
              type="button"
              size="sm"
              className="h-7 w-full text-[11px]"
              disabled={!dirty}
              onClick={() => {
                const same = source && JSON.stringify(draft) === JSON.stringify(committed);
                onEdit(applyInnerParams(edit, draft, kind, same ? source : null));
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

function MissingScanbodyLibrary({
  lines,
  accept,
  multiple,
  allowFolder,
  buttonLabel,
  status,
  onUpload,
}: NonNullable<ScanbodyControls["missingLibrary"]>) {
  const input = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length > 0) onUpload?.(files);
  };
  if (!onUpload) {
    return (
      <p className="rounded-md border border-sky-200 bg-sky-50 p-2 text-[11px] leading-relaxed text-sky-900">
        {lines.map((line, index) => (
          <Fragment key={line}>
            {index > 0 ? <br /> : null}
            {line}
          </Fragment>
        ))}
      </p>
    );
  }
  return (
    <div className="space-y-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] leading-relaxed text-amber-900">
      <p>
        {[...lines, "악성코드 검사를 통과하면 바로 등록되고 자동으로 맞춥니다."].map((line, index) => (
          <Fragment key={line}>
            {index > 0 ? <br /> : null}
            {line}
          </Fragment>
        ))}
      </p>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={pick}
      />
      {allowFolder ? (
        <input
          ref={folderInput}
          type="file"
          multiple
          className="hidden"
          {...({ webkitdirectory: "" } as Record<string, string>)}
          onChange={pick}
        />
      ) : null}
      <div className="flex gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 min-w-0 flex-1 bg-white text-[11px]"
          disabled={Boolean(status)}
          onClick={() => input.current?.click()}
        >
          {status ?? buttonLabel}
        </Button>
        {allowFolder && !status ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 shrink-0 bg-white text-[11px]"
            onClick={() => folderInput.current?.click()}
          >
            exocad 폴더
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** 스캔 단계 — 메시 편집 아래. 고른 임플란트 치아의 라이브러리를 스캔에 맞춘다. */
export function ScanbodyAlignSection({
  scanbody,
  toothLabel,
  open,
  onOpen,
}: {
  scanbody: ScanbodyControls;
  toothLabel: string | null;
  open: boolean;
  onOpen: (on: boolean) => void;
}) {
  return (
    <StageSubsection title="스캔바디" open={open} onOpen={onOpen} coach="scanbody">
      {toothLabel ? (
        <p className="text-[11px] text-muted-foreground">{toothLabel}</p>
      ) : null}
      {scanbody.missingLibrary ? (
        <MissingScanbodyLibrary {...scanbody.missingLibrary} />
      ) : null}
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
    </StageSubsection>
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
  part,
  onTool,
  marginEditOn,
  marginResetPaused,
  onMarginEdit,
  onAutoDetect,
  axisReady,
  brush,
  onBrush,
  edit,
  onEdit,
  toothLabel,
  cavityKind,
  generated,
  isBridge,
  holeNote,
  holeIssue,
  onViewHoleAxis,
  marginResetOn,
  onMarginReset,
  onRemoveHook,
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
  refineTab,
  onRefineTab,
  openTool,
  onOpenTool,
  contactMap = false,
  onContactMap,
  canContact = false,
  occlusalGap = 0.1,
  onOcclusalGap,
  contactMode = "cut",
  onContactMode,
  generating = false,
  generateDisabled = true,
  generateHint = "보철 생성",
  onGenerate,
  crownShellMm,
  intaglio,
  insertionTeeth = [],
  insertionToothNumber = null,
  onPickInsertionTooth,
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
  const connectorRow =
    connectors.find((row) => row.from === connectorFrom) ?? connectors[0] ?? null;
  const openFold = (id: ModifyTool | "occlusal") => (on: boolean) => {
    if (on && id !== "occlusal") onTool(id);
    onOpenTool(on ? id : null);
  };

  const prepare = part === "prepare";
  const design = part === "design";

  return (
    <>
      {prepare ? (
      <>
      <StageSubsection
        title="삽입축"
        open={openTool === "insertion"}
        onOpen={openFold("insertion")}
        coach="tool-insertion"
      >
        {insertionTeeth.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {insertionTeeth.map((tooth) => (
              <Button
                key={tooth.toothNumber}
                type="button"
                size="sm"
                variant={insertionToothNumber === tooth.toothNumber ? "default" : "outline"}
                className="h-7 min-w-7 px-2 text-[11px] tabular-nums"
                aria-pressed={insertionToothNumber === tooth.toothNumber}
                onClick={() => onPickInsertionTooth?.(tooth.toothNumber)}
              >
                #{tooth.label}
              </Button>
            ))}
          </div>
        ) : null}
      </StageSubsection>

      <StageSubsection
        title={marginWord}
        open={openTool === "margin"}
        onOpen={openFold("margin")}
        coach="tool-margin"
      >
      {insertionTeeth.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {insertionTeeth.map((tooth) => (
            <Button
              key={tooth.toothNumber}
              type="button"
              size="sm"
              variant={insertionToothNumber === tooth.toothNumber ? "default" : "outline"}
              className="h-7 min-w-7 px-2 text-[11px] tabular-nums"
              aria-pressed={insertionToothNumber === tooth.toothNumber}
              onClick={() => onPickInsertionTooth?.(tooth.toothNumber)}
            >
              #{tooth.label}
            </Button>
          ))}
        </div>
      ) : null}
      {edit.pontic.on ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          폰틱은 지대치가 없어 마진을 잡지 않습니다.
          <br />
          기저면은 형상에서 고릅니다.
        </p>
      ) : (
        <div className="space-y-2">
          {implant && !edit.implant.aligned ? (
            <p className="text-[11px] leading-relaxed text-destructive">
              스캔바디를 먼저 맞춥니다.
              <br />
              EPL은 맞춘 인터페이스 둘레에서 잡습니다.
            </p>
          ) : null}
          {!axisReady ? (
            <p className="text-[11px] leading-relaxed text-destructive">
              삽입축을 먼저 잡습니다.
            </p>
          ) : null}
          <div className="grid grid-cols-3 gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-1 text-[11px]"
                  disabled={!axisReady}
                  onClick={onAutoDetect}
                >
                  자동검출
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="z-[520]">
                {cavity ? (
                  "와동 테두리를 삽입축 기준으로 잡습니다."
                ) : (
                  <>
                    잡아 둔 삽입축과 치아색·잇몸색을 보고
                    <br />
                    {marginWord}을 자동으로 잡습니다.
                  </>
                )}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant={marginResetOn ? "default" : "outline"}
                  className="h-7 px-1 text-[11px]"
                  aria-pressed={marginResetOn}
                  onClick={onMarginReset}
                >
                  재설정
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="z-[520]">
                기존 {marginWord}을 지우고 새로 잡습니다.
                <br />
                {marginWord} 위를 왼쪽 클릭으로 찍고, 시작점을 다시 누르면 닫힙니다.
                <br />
                점 사이는 스캔 형상을 따라 매끄럽게 이어집니다.
                <br />
                점을 우클릭하면 그 점을 지웁니다.
                <br />
                Esc는 찍은 점을 둔 채 멈추고, 마진편집을 누르면 그 점에서 이어 찍습니다.
                <br />
                재설정을 다시 누르면 끝내고 이전 마진으로 돌립니다.
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant={marginEditOn ? "default" : "outline"}
                  className="h-7 px-1 text-[11px]"
                  aria-pressed={marginEditOn}
                  disabled={(edit.margin.deleted && !marginResetPaused) || marginResetOn}
                  onClick={onMarginEdit}
                >
                  {marginWord}편집
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="z-[520]">
                점을 끌어 옮깁니다.
                <br />
                이웃 점이 함께 따라와 뾰족함을 줄입니다.
                <br />
                선을 누르면 점을 더하고, 점을 우클릭하면 지웁니다.
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
      )}
      </StageSubsection>
      </>
      ) : null}

      {design ? (
      <>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex min-w-0">
            <Button
              type="button"
              size="sm"
              className="h-7 w-full text-[11px]"
              disabled={generateDisabled}
              onClick={() => onGenerate?.()}
              data-coach="generate"
            >
              {generating ? "처리 중…" : "보철 생성"}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="right" className="z-[520]">
          {generateHint}
        </TooltipContent>
      </Tooltip>
      <StageSubsection
        title="내면"
        open={openTool === "inner"}
        onOpen={openFold("inner")}
        coach="tool-inner"
      >
        {edit.pontic.on ? (
          <p className="text-[11px] text-muted-foreground">폰틱은 내면이 없습니다.</p>
        ) : (
          <InnerControls
            key={`${toothLabel ?? ""}\0${innerKind}\0${JSON.stringify(edit.inner)}\0${edit.refine.minThicknessMm}`}
            edit={edit}
            kind={innerKind}
            generated={generated}
            onEdit={onEdit}
          />
        )}
      </StageSubsection>

      <StageSubsection
        title="형상"
        open={openTool === "refine"}
        onOpen={openFold("refine")}
        coach="tool-refine"
      >
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
      </StageSubsection>

      <StageSubsection
        title="교합"
        open={openTool === "occlusal"}
        onOpen={openFold("occlusal")}
        coach="tool-occlusal"
      >
        <label className="flex items-center justify-between gap-3 text-xs font-medium">
          접촉
          <Switch
            checked={contactMap}
            disabled={!canContact}
            onCheckedChange={(on) => onContactMap?.(on === true)}
            aria-label="교합 접촉 표시"
            className="h-5 w-9 data-[state=checked]:bg-primary [&>span]:h-4 [&>span]:w-4 data-[state=checked]:[&>span]:translate-x-4"
          />
        </label>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-medium">
            <span>교합 거리</span>
            <span className="tabular-nums text-muted-foreground">
              {occlusalGap.toFixed(2)} mm
            </span>
          </div>
          <Slider
            min={0}
            max={50}
            step={5}
            value={[Math.round(occlusalGap * 100)]}
            disabled={!canContact}
            onValueChange={([value]) => onOcclusalGap?.((value ?? 10) / 100)}
            aria-label="교합 거리"
          />
        </div>
        <div className="grid grid-cols-2 gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex min-w-0">
                <Button
                  type="button"
                  size="sm"
                  variant={contactMode === "cut" ? "default" : "outline"}
                  className="h-7 w-full px-2 text-[11px]"
                  onClick={() => onContactMode?.("cut")}
                >
                  절삭
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" className="z-[520]">
              목표보다 가까운 면은 붉고,
              <br />
              먼 면은 파랗습니다.
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex min-w-0">
                <Button
                  type="button"
                  size="sm"
                  variant={contactMode === "keep" ? "default" : "outline"}
                  className="h-7 w-full px-2 text-[11px]"
                  onClick={() => onContactMode?.("keep")}
                >
                  형태 유지
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" className="z-[520]">
              초록 폭을 넓혀 형태를 남깁니다.
            </TooltipContent>
          </Tooltip>
        </div>
      </StageSubsection>

      <StageSubsection
        title="훅"
        open={openTool === "hook"}
        onOpen={openFold("hook")}
        coach="tool-hook"
      >
      {cavity ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          인레이·온레이에는 훅을 붙이지 않습니다.
        </p>
      ) : (
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
      )}
      </StageSubsection>

      <StageSubsection
        title="컷백"
        open={openTool === "cutback"}
        onOpen={openFold("cutback")}
        coach="tool-cutback"
      >
      {cavity ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          인레이·온레이에는 컷백하지 않습니다.
        </p>
      ) : (
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
      )}
      </StageSubsection>

      <StageSubsection
        title="홀"
        open={openTool === "hole"}
        onOpen={openFold("hole")}
        coach="tool-hole"
      >
      {implant ? (
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
      ) : edit.pontic.on ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          폰틱에는 홀을 뚫지 않습니다.
        </p>
      ) : (
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
      )}
      </StageSubsection>

      <StageSubsection
        title="커넥터"
        open={openTool === "connector"}
        onOpen={openFold("connector")}
        coach="tool-connector"
      >
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
          ) : (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              브리지 스팬에서 조립합니다.
            </p>
          )}
        </div>
      </StageSubsection>
      </>
      ) : null}
    </>
  );
}

// 기공소 AI 보철 — 형상 도구. 변형(상자)·외면(스컬프트·스마트 편집)·맞춤(대합·인접·치은).

import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CLEARANCE_RANGE_MM,
  GINGIVAL_RANGE_MM,
  PONTIC_BASES,
  REFINE_TABS,
  SCULPT_SHAPES,
  STRETCH_RANGE,
  applyRefineTransform,
  resetRefineTransform,
  shellThicknessMm,
  transformUntouched,
  type EditBrush,
  type RefineTab,
  type SculptBrush,
  type ToothDesignEdit,
} from "@/shared/practice/labProsthesisModify";
import {
  cavityDepthMm,
  cavityThicknessMm,
  type CavityKind,
} from "@/shared/practice/labInlayDesign";
import { STAGE_NEST_CLASS } from "@/shared/components/practice/LabMeshEditSection";
import { cn } from "@/shared/ui/cn";

const SWITCH_CLASS =
  "h-5 w-9 data-[state=checked]:bg-primary [&>span]:h-4 [&>span]:w-4 data-[state=checked]:[&>span]:translate-x-4";

function Row({ label, value, children }: { label: string; value?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs font-medium">
        <span>{label}</span>
        {value ? <span className="tabular-nums text-muted-foreground">{value}</span> : null}
      </div>
      {children}
    </div>
  );
}

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

function mm(value: number) {
  return `${value.toFixed(2)} mm`;
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

const TAB_TIPS: Record<RefineTab, ReactNode> = {
  transform: (
    <>
      모서리를 끌면 반대 모서리를 두고 크기를 바꿉니다.
      <br />
      Shift를 누르고 끌면 가운데 기준으로 대칭입니다.
      <br />
      위 공은 이동, 원뿔은 높이, 주황 공은 회전입니다.
    </>
  ),
  outer: (
    <>
      스컬프트로 면을 직접 고치거나,
      <br />
      스마트 편집으로 교합면 형태를 조절합니다.
    </>
  ),
  adapt: (
    <>
      대합·인접 스캔까지 목표 간격을 맞춥니다.
      <br />
      「교합 → 접촉」을 켜면 크라운에도 거리 색이 칠해집니다.
    </>
  ),
};

export function LabRefineControls({
  edit,
  onEdit,
  generated,
  cavity,
  thin,
  measuredShellMm,
  tab,
  onTab,
  brush,
  onBrush,
  sculptBrush,
  onSculptBrush,
}: {
  edit: ToothDesignEdit;
  onEdit: (next: ToothDesignEdit) => void;
  generated: boolean;
  cavity: CavityKind | null;
  thin: boolean;
  /** 뷰어가 맞춘 크라운에서 잰 가장 얇은 외면. 맞춤이 없으면 null. */
  measuredShellMm: number | null;
  tab: RefineTab;
  onTab: (tab: RefineTab) => void;
  brush: EditBrush;
  onBrush: (brush: EditBrush) => void;
  sculptBrush: SculptBrush;
  onSculptBrush: (next: SculptBrush) => void;
}) {
  const refine = edit.refine;
  const setRefine = (patch: Partial<ToothDesignEdit["refine"]>) =>
    onEdit({ ...edit, refine: { ...refine, ...patch } });
  // 인레이·온레이는 와동 채움 형상이라 변형이 없고, 맞춤은 교합 깎기만 쓴다.
  const tabs = cavity ? REFINE_TABS.filter((item) => item.id !== "transform") : REFINE_TABS;
  const current = cavity && tab === "transform" ? "outer" : tab;
  const sculpting = brush === "sculpt";

  const pickTab = (next: RefineTab) => {
    if (next !== "outer" && sculpting) onBrush("none");
    onTab(next);
  };

  const thicknessText = cavity
    ? `와동 단면 ${cavityThicknessMm(edit, cavity, cavityDepthMm(edit, cavity)).toFixed(2)} mm`
    : `외면 ${shellThicknessMm(edit, measuredShellMm).toFixed(2)} mm`;

  return (
    <div className="space-y-2">
      <div className={cn("grid gap-1", tabs.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
        {tabs.map((item) => (
          <TipButton
            key={item.id}
            active={current === item.id}
            onClick={() => pickTab(item.id)}
            tip={TAB_TIPS[item.id]}
          >
            {item.label}
          </TipButton>
        ))}
      </div>

      <div className={cn("space-y-2", STAGE_NEST_CLASS)}>
      {current === "transform" ? (
        <div className="space-y-2">
          <Row label="크기" value={refine.scale.toFixed(2)}>
            <Slider
              min={75}
              max={135}
              step={1}
              value={[Math.round(refine.scale * 100)]}
              disabled={!generated}
              onValueChange={([value]) =>
                onEdit(applyRefineTransform(edit, { scale: (value ?? 100) / 100 }))
              }
              aria-label="크기"
            />
          </Row>
          {(
            [
              ["가로", 0],
              ["세로", 2],
              ["높이", 1],
            ] as const
          ).map(([label, axis]) => (
            <Row key={label} label={label} value={percent(refine.stretch[axis])}>
              <Slider
                min={STRETCH_RANGE.min * 100}
                max={STRETCH_RANGE.max * 100}
                step={1}
                value={[Math.round(refine.stretch[axis] * 100)]}
                disabled={!generated}
                onValueChange={([value]) => {
                  const stretch = [...refine.stretch] as [number, number, number];
                  stretch[axis] = (value ?? 100) / 100;
                  onEdit(applyRefineTransform(edit, { stretch }));
                }}
                aria-label={label}
              />
            </Row>
          ))}
          <Row label="회전" value={`${refine.rotateDeg.toFixed(0)}°`}>
            <Slider
              min={-180}
              max={180}
              step={1}
              value={[Math.round(refine.rotateDeg)]}
              disabled={!generated}
              onValueChange={([value]) =>
                onEdit(applyRefineTransform(edit, { rotateDeg: value ?? 0 }))
              }
              aria-label="회전"
            />
          </Row>
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span className="tabular-nums">
              이동 {refine.offsetMm[0].toFixed(2)} · {refine.offsetMm[1].toFixed(2)} mm
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              disabled={
                !generated || (transformUntouched(refine) && refine.scale === 1)
              }
              onClick={() => onEdit(resetRefineTransform(edit))}
            >
              초기화
            </Button>
          </div>
        </div>
      ) : null}

      {current === "outer" ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1">
            <TipButton
              active={sculpting}
              disabled={!generated}
              onClick={() => onBrush("sculpt")}
              tip={
                <>
                  보철 면을 눌러 고칩니다.
                  <br />
                  오른쪽 클릭은 더하기와 빼기를 뒤집습니다.
                </>
              }
            >
              스컬프트
            </TipButton>
            <TipButton
              active={!sculpting}
              disabled={!generated}
              onClick={() => onBrush("none")}
              tip="교합면 형태를 슬라이더로 조절합니다."
            >
              스마트 편집
            </TipButton>
          </div>
          {sculpting ? (
            <div className="space-y-2 rounded-md border px-2 py-2">
              <div className="grid grid-cols-3 gap-1">
                {SCULPT_SHAPES.map((shape) => (
                  <TipButton
                    key={shape.id}
                    active={sculptBrush.shape === shape.id}
                    onClick={() => onSculptBrush({ ...sculptBrush, shape: shape.id })}
                    tip={shape.hint}
                  >
                    {shape.label}
                  </TipButton>
                ))}
              </div>
              <Row label="브러시 크기" value={mm(sculptBrush.sizeMm)}>
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
              <Row label="강도" value={percent(sculptBrush.strength)}>
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
                  className={SWITCH_CLASS}
                />
              </label>
            </div>
          ) : (
            <div className="space-y-2">
              {(
                [
                  ["occlusalTable", "교합면 폭"],
                  ["cusp", "교두"],
                  ["ridge", "융선"],
                  ["groove", "구 깊이"],
                ] as const
              )
                .filter(([key]) => !cavity || key === "cusp" || key === "ridge")
                .map(([key, label]) => (
                <Row key={key} label={label} value={refine[key].toFixed(2)}>
                  <Slider
                    min={-100}
                    max={100}
                    step={5}
                    value={[Math.round(refine[key] * 100)]}
                    disabled={!generated}
                    onValueChange={([value]) => setRefine({ [key]: (value ?? 0) / 100 })}
                    aria-label={label}
                  />
                </Row>
              ))}
              {cavity ? null : (
                <div className="space-y-2 border-t pt-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="w-fit text-[11px] font-medium text-muted-foreground">세부</p>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="z-[520]">
                      협측은 악궁 바깥, 근심은 정중선 쪽입니다.
                      <br />
                      치아마다 번호와 이웃 치아 자리로 방향을 잡습니다.
                    </TooltipContent>
                  </Tooltip>
                  {(
                    [
                      ["buccalCusp", "협측 교두"],
                      ["lingualCusp", "설측 교두"],
                      ["mesialRidge", "근심 변연융선"],
                      ["distalRidge", "원심 변연융선"],
                    ] as const
                  ).map(([key, label]) => (
                    <Row key={key} label={label} value={refine[key].toFixed(2)}>
                      <Slider
                        min={-100}
                        max={100}
                        step={5}
                        value={[Math.round(refine[key] * 100)]}
                        disabled={!generated}
                        onValueChange={([value]) => setRefine({ [key]: (value ?? 0) / 100 })}
                        aria-label={label}
                      />
                    </Row>
                  ))}
                </div>
              )}
            </div>
          )}
          <Row label="최소 두께" value={mm(refine.minThicknessMm)}>
            <Slider
              min={30}
              max={cavity ? 250 : 120}
              step={5}
              value={[Math.round(refine.minThicknessMm * 100)]}
              onValueChange={([value]) =>
                onEdit({
                  ...edit,
                  inner: { ...edit.inner, presetId: null, presetName: "" },
                  refine: { ...refine, minThicknessMm: (value ?? 50) / 100 },
                })
              }
              aria-label="최소 두께"
            />
          </Row>
          {thin && !refine.compensate ? (
            <div className="space-y-1.5 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-2">
              <p className="flex items-center gap-1 text-[11px] font-medium text-destructive">
                <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                최소 두께 부족 · {thicknessText}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 w-full border-destructive/50 px-1 text-[11px] text-destructive"
                disabled={!generated}
                onClick={() => setRefine({ compensate: true })}
              >
                최소 두께 보상
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium text-foreground">{thicknessText}</p>
              {refine.compensate ? (
                <TipButton
                  active
                  disabled={!generated}
                  onClick={() => setRefine({ compensate: false })}
                  tip={
                    <>
                      얇은 곳을 최소 두께까지 채웁니다.
                      <br />
                      대합·인접 깎기도 최소 두께에서 멈춥니다.
                    </>
                  }
                >
                  보상 켬
                </TipButton>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {current === "adapt" ? (
        <div className="space-y-2">
          <ClearanceRow
            label="교합 간격"
            value={refine.occlusalClearanceMm}
            trim={refine.occlusalTrim}
            fit={refine.occlusalFit}
            disabled={!generated}
            target="대합"
            canFit={!cavity}
            onValue={(occlusalClearanceMm) => setRefine({ occlusalClearanceMm })}
            onTrim={(occlusalTrim) => setRefine({ occlusalTrim })}
            onFit={(occlusalFit) => setRefine({ occlusalFit })}
          />
          {cavity ? null : (
          <ClearanceRow
            label="인접 간격"
            value={refine.proximalClearanceMm}
            trim={refine.proximalTrim}
            fit={refine.proximalFit}
            disabled={!generated}
            target="인접치"
            canFit
            onValue={(proximalClearanceMm) => setRefine({ proximalClearanceMm })}
            onTrim={(proximalTrim) => setRefine({ proximalTrim })}
            onFit={(proximalFit) => setRefine({ proximalFit })}
          />
          )}
          {edit.pontic.on ? (
            <div className="space-y-2 border-t pt-2">
              <Row label="폰틱 기저면">
                <div className="grid grid-cols-3 gap-1">
                  {PONTIC_BASES.map((base) => (
                    <TipButton
                      key={base.id}
                      active={edit.pontic.base === base.id}
                      onClick={() => onEdit({ ...edit, pontic: { ...edit.pontic, base: base.id } })}
                      tip={base.hint}
                    >
                      {base.label}
                    </TipButton>
                  ))}
                </div>
              </Row>
              <Row label="치은 간격" value={mm(refine.gingivalMm)}>
                <Slider
                  min={GINGIVAL_RANGE_MM.min * 100}
                  max={GINGIVAL_RANGE_MM.max * 100}
                  step={5}
                  value={[Math.round(refine.gingivalMm * 100)]}
                  disabled={!generated}
                  onValueChange={([value]) => setRefine({ gingivalMm: (value ?? 0) / 100 })}
                  aria-label="치은 간격"
                />
              </Row>
              <Tooltip>
                <TooltipTrigger asChild>
                  <label className="flex items-center justify-between gap-3 text-xs font-medium">
                    치조정에 맞추기
                    <Switch
                      checked={refine.gingivalFit}
                      disabled={!generated}
                      onCheckedChange={(gingivalFit) => setRefine({ gingivalFit })}
                      aria-label="치조정에 맞추기"
                      className={SWITCH_CLASS}
                    />
                  </label>
                </TooltipTrigger>
                <TooltipContent side="right" className="z-[520]">
                  기저면을 치조정 스캔에서 치은 간격만큼 띄웁니다.
                  <br />
                  음수는 치조정을 누릅니다.
                </TooltipContent>
              </Tooltip>
            </div>
          ) : cavity ? null : (
            <div className="space-y-2 border-t pt-2">
              <Row label="치은 간격" value={mm(refine.gingivalMm)}>
                <Slider
                  min={GINGIVAL_RANGE_MM.min * 100}
                  max={GINGIVAL_RANGE_MM.max * 100}
                  step={5}
                  value={[Math.round(refine.gingivalMm * 100)]}
                  disabled={!generated || edit.margin.deleted}
                  onValueChange={([value]) => setRefine({ gingivalMm: (value ?? 0) / 100 })}
                  aria-label="치은 간격"
                />
              </Row>
              <Tooltip>
                <TooltipTrigger asChild>
                  <label className="flex items-center justify-between gap-3 text-xs font-medium">
                    경부를 치은에서 띄우기
                    <Switch
                      checked={refine.gingivalFit}
                      disabled={!generated || edit.margin.deleted}
                      onCheckedChange={(gingivalFit) => setRefine({ gingivalFit })}
                      aria-label="경부를 치은에서 띄우기"
                      className={SWITCH_CLASS}
                    />
                  </label>
                </TooltipTrigger>
                <TooltipContent side="right" className="z-[520]">
                  {edit.margin.deleted ? (
                    "마진이 있어야 씁니다."
                  ) : (
                    <>
                      마진 바로 위 경부를 치은 스캔에서 치은 간격만큼 띄웁니다.
                      <br />
                      마진 아래로는 내려가지 않습니다.
                    </>
                  )}
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      ) : null}
      </div>
    </div>
  );
}

function ClearanceRow({
  label,
  value,
  trim,
  fit,
  disabled,
  target,
  canFit,
  onValue,
  onTrim,
  onFit,
}: {
  label: string;
  value: number;
  trim: boolean;
  fit: boolean;
  disabled: boolean;
  target: string;
  /** 인레이·온레이는 깎기만 쓴다. */
  canFit: boolean;
  onValue: (value: number) => void;
  onTrim: (on: boolean) => void;
  onFit: (on: boolean) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Row label={label} value={mm(value)}>
        <Slider
          min={CLEARANCE_RANGE_MM.min * 100}
          max={CLEARANCE_RANGE_MM.max * 100}
          step={1}
          value={[Math.round(value * 100)]}
          disabled={disabled}
          onValueChange={([next]) => onValue((next ?? 0) / 100)}
          aria-label={label}
        />
      </Row>
      <div className={cn("grid gap-1", canFit ? "grid-cols-2" : "grid-cols-1")}>
        <TipButton
          active={trim}
          disabled={disabled}
          onClick={() => onTrim(!trim)}
          tip={
            <>
              {target === "인접치" ? (
                <>
                  인접 간격보다 가까운 크라운 면을 깎습니다.
                  <br />
                  삽입 경로에 걸리지 않게 크라운만 옮깁니다.
                </>
              ) : (
                <>
                  {target}까지 {label}보다 가까운 면을 깎습니다.
                  <br />
                  음수 간격은 그만큼 겹치게 둡니다.
                </>
              )}
            </>
          }
        >
          깎기
        </TipButton>
        {canFit ? (
        <TipButton
          active={fit}
          disabled={disabled}
          onClick={() => onFit(!fit)}
          tip={
            <>
              {target}에서 0.8mm 안쪽으로 떨어진 면을
              <br />
              {label}까지 늘려 닿게 합니다.
            </>
          }
        >
          닿게
        </TipButton>
        ) : null}
      </div>
    </div>
  );
}

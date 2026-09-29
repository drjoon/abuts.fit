// 기공소 AI 디자인 — 밀링 단계. 생성한 보철을 98.5mm 디스크에 배치하고 디스크 좌표 STL로 낸다.
// 디스크 재료는 치아 내면 프리셋 재료에서 온다. 공구 경로는 기공소 CAM이 계산한다.
// related files:
// - web/frontend/src/shared/practice/labMilling.ts
// - web/frontend/src/shared/components/practice/LabProsthesisAiDesignDialog.tsx
// - web/frontend/src/shared/components/practice/OralScanOverlayViewer.tsx

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Download, Loader2, Paperclip, Shuffle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DesignExportRestoration } from "@/shared/components/practice/DesignExportDialog";
import type { OralScanOverlayHandle } from "@/shared/components/practice/OralScanOverlayViewer";
import { downloadBlobFile } from "@/shared/components/practice/ViewPaintSurface";
import { useToast } from "@/shared/hooks/use-toast";
import { INNER_MATERIALS } from "@/shared/practice/labDesignPresets";
import {
  MILLING_DISC_DIAMETER_MM,
  MILLING_DISC_MATERIALS,
  MILLING_DISC_THICKNESSES_MM,
  MILLING_ISSUE_LABEL,
  MILLING_RANGES,
  MILLING_SKIN_MM,
  autoNest,
  cylinderTriangles,
  discMaterialOf,
  millingDiscMaterialLabel,
  millingIssues,
  millingJobJson,
  millingShapes,
  normalizeDeg,
  orientMillingPart,
  placedTriangles,
  recommendedThicknessMm,
  usableRadiusMm,
  zLimitMm,
  type MillingDiscMaterial,
  type MillingDocument,
  type MillingIssue,
  type MillingPart,
  type MillingPlacement,
  type MillingSettings,
  type MillingShape,
} from "@/shared/practice/labMilling";
import type { ToothDesignEdit } from "@/shared/practice/labProsthesisModify";
import { MeshUnionError, meshUnionErrorMessage, unionTriangleSoups } from "@/shared/practice/meshUnion";
import { encodeBinaryStl } from "@/shared/files/stlBinaryWrite";
import { ScreenSpaceOrbitControls } from "@/shared/three/screenSpaceOrbitControls";
import { cn } from "@/shared/ui/cn";

type RowState =
  | { kind: "blocked"; reason: string }
  | { kind: "print" }
  | { kind: "material"; label: string }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; shape: MillingShape };

export type LabMillingRow = {
  row: DesignExportRestoration;
  state: RowState;
  placement: MillingPlacement | null;
  issues: MillingIssue[];
};

type Args = {
  active: boolean;
  rows: readonly DesignExportRestoration[];
  edits: Record<string, ToothDesignEdit>;
  viewerRef: RefObject<OralScanOverlayHandle | null>;
  doc: MillingDocument;
  onDocChange: (next: MillingDocument) => void;
  /** 파일 이름 앞부분. */
  baseName: string;
  onAttachChatFile?: ((file: File) => void) | null;
  onAttached?: () => void;
};

function innerOf(row: DesignExportRestoration, edits: Record<string, ToothDesignEdit>) {
  for (const tooth of row.teeth) {
    const inner = edits[tooth]?.inner;
    if (inner) return inner;
  }
  return null;
}

function fitsDisc(
  inner: ToothDesignEdit["inner"] | null,
  disc: MillingDiscMaterial,
): boolean {
  if (!inner) return true;
  if (inner.method === "print") return false;
  if (disc === "wax") return true;
  return discMaterialOf(inner.material) === disc;
}

export function useLabMilling({
  active,
  rows,
  edits,
  viewerRef,
  doc,
  onDocChange,
  baseName,
  onAttachChatFile,
  onAttached,
}: Args) {
  const { toast } = useToast();
  const docRef = useRef(doc);
  docRef.current = doc;
  const settings = doc.settings;

  const readyRows = useMemo(() => rows.filter((row) => !row.blocked), [rows]);

  const derivedMaterial = useMemo((): MillingDiscMaterial | null => {
    const count = new Map<MillingDiscMaterial, number>();
    for (const row of readyRows) {
      const inner = innerOf(row, edits);
      if (inner?.method === "print") continue;
      const disc = discMaterialOf(inner?.material);
      if (disc) count.set(disc, (count.get(disc) ?? 0) + 1);
    }
    let best: MillingDiscMaterial | null = null;
    for (const [id, n] of count) if (!best || n > (count.get(best) ?? 0)) best = id;
    return best;
  }, [edits, readyRows]);
  const material = settings.material ?? derivedMaterial;

  // 활성일 때만 형상 서명을 만든다. 편집이 바뀌면 다시 꺼낸다.
  const loadKey = useMemo(() => {
    if (!active) return "";
    return JSON.stringify(
      readyRows.map((row) => [row.id, row.teeth.map((tooth) => edits[tooth] ?? null)]),
    );
  }, [active, edits, readyRows]);

  const [parts, setParts] = useState<Map<string, MillingPart>>(new Map());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [loadedKey, setLoadedKey] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"download" | "attach" | null>(null);

  useEffect(() => {
    if (!active || !loadKey || loadKey === loadedKey) return;
    const viewer = viewerRef.current;
    if (!viewer) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const nextParts = new Map<string, MillingPart>();
      const nextErrors = new Map<string, string>();
      for (const row of readyRows) {
        try {
          const [solid] = await viewer.restorationSolids([
            {
              fileName: row.fileName,
              teeth: row.teeth,
              union: row.id.startsWith("bridge:") ? { label: row.label } : undefined,
            },
          ]);
          const part = solid
            ? orientMillingPart({
                id: row.id,
                label: row.label,
                fileName: row.fileName,
                positions: solid.positions,
                axis: solid.axis,
              })
            : null;
          if (part) nextParts.set(row.id, part);
          else nextErrors.set(row.id, "메시 없음");
        } catch (error) {
          nextErrors.set(
            row.id,
            error instanceof MeshUnionError ? meshUnionErrorMessage(error) : "형상을 읽지 못했습니다.",
          );
        }
      }
      if (cancelled) return;
      setParts(nextParts);
      setErrors(nextErrors);
      setLoadedKey(loadKey);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
      setLoading(false);
    };
  }, [active, loadKey, loadedKey, readyRows, viewerRef]);

  const candidates = useMemo(
    () =>
      material
        ? readyRows.filter((row) => parts.has(row.id) && fitsDisc(innerOf(row, edits), material))
        : [],
    [edits, material, parts, readyRows],
  );

  const shapeSettingsKey = `${settings.pinCount}|${settings.pinDiameterMm}|${settings.pinLengthMm}`;
  const shapes = useMemo(
    () => millingShapes(candidates.map((row) => parts.get(row.id)!), settings),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidates, parts, shapeSettingsKey],
  );
  const shapeById = useMemo(() => new Map(shapes.map((s) => [s.part.id, s])), [shapes]);

  const recommended = useMemo(
    () => recommendedThicknessMm(shapes.map((s) => s.part)),
    [shapes],
  );
  const thicknessMm =
    settings.thicknessMm ??
    recommended ??
    MILLING_DISC_THICKNESSES_MM[MILLING_DISC_THICKNESSES_MM.length - 1]!;

  const issues = useMemo(
    () => millingIssues(shapes, doc.placements, settings, thicknessMm),
    [doc.placements, settings, shapes, thicknessMm],
  );

  const commit = useCallback(
    (patch: Partial<MillingDocument>) => {
      const next = { ...docRef.current, ...patch };
      docRef.current = next;
      onDocChange(next);
    },
    [onDocChange],
  );

  const patchSettings = useCallback(
    (patch: Partial<MillingSettings>) => {
      commit({ settings: { ...docRef.current.settings, ...patch } });
    },
    [commit],
  );

  const setPlacement = useCallback(
    (id: string, patch: Partial<MillingPlacement>) => {
      const current = docRef.current.placements[id];
      if (!current) return;
      commit({ placements: { ...docRef.current.placements, [id]: { ...current, ...patch } } });
    },
    [commit],
  );

  const warnUnplaced = useCallback(
    (ids: readonly string[]) => {
      if (ids.length === 0) return;
      toast({
        title: "디스크에 모두 들어가지 않습니다.",
        description: (
          <>
            {ids.map((id) => shapeById.get(id)?.part.label ?? id).join(", ")}은 뺐습니다.
            <br />
            간격을 줄이거나 다른 디스크로 냅니다.
          </>
        ),
      });
    },
    [shapeById, toast],
  );

  // 자리가 없는 보철은 들어 있는 보철을 그대로 두고 빈 곳에 넣는다.
  useEffect(() => {
    if (!active || shapes.length === 0) return;
    const placements = docRef.current.placements;
    const missing = shapes.filter((s) => !placements[s.part.id]);
    if (missing.length === 0) return;
    const fixed: Record<string, MillingPlacement> = {};
    for (const s of shapes) {
      const p = placements[s.part.id];
      if (p && !p.excluded) fixed[s.part.id] = p;
    }
    const result = autoNest(
      shapes.filter((s) => missing.includes(s) || fixed[s.part.id]),
      fixed,
      docRef.current.settings,
    );
    const next = { ...placements, ...result.placements };
    for (const id of result.unplaced) next[id] = { x: 0, y: 0, z: 0, rotDeg: 0, excluded: true };
    commit({ placements: next });
    warnUnplaced(result.unplaced);
  }, [active, commit, shapes, warnUnplaced]);

  const arrangeAll = useCallback(() => {
    const placements = docRef.current.placements;
    const included = shapes.filter((s) => !placements[s.part.id]?.excluded);
    const result = autoNest(included, {}, docRef.current.settings);
    const next = { ...placements, ...result.placements };
    for (const id of result.unplaced) {
      next[id] = { ...(next[id] ?? { x: 0, y: 0, z: 0, rotDeg: 0 }), excluded: true };
    }
    commit({ placements: next });
    warnUnplaced(result.unplaced);
  }, [commit, shapes, warnUnplaced]);

  const setIncluded = useCallback(
    (id: string, on: boolean) => {
      const placements = docRef.current.placements;
      const current = placements[id];
      if (!current) return;
      if (!on) {
        setPlacement(id, { excluded: true });
        return;
      }
      const shape = shapeById.get(id);
      if (!shape) return;
      const fixed = Object.fromEntries(
        Object.entries(placements).filter(([key, p]) => key !== id && !p.excluded && shapeById.has(key)),
      );
      const result = autoNest(
        shapes.filter((s) => s.part.id === id || fixed[s.part.id]),
        fixed,
        docRef.current.settings,
      );
      const placed = result.placements[id];
      setPlacement(id, placed ? { ...placed } : { excluded: false });
      setSelectedId(id);
    },
    [setPlacement, shapeById, shapes],
  );

  const millingRows: LabMillingRow[] = rows.map((row) => {
    const placement = doc.placements[row.id] ?? null;
    const base = { row, placement, issues: issues.get(row.id) ?? [] };
    if (row.blocked) return { ...base, state: { kind: "blocked", reason: row.blocked } };
    const inner = innerOf(row, edits);
    if (inner?.method === "print") return { ...base, state: { kind: "print" } };
    if (material && !fitsDisc(inner, material)) {
      const label = INNER_MATERIALS.find((m) => m.id === inner?.material)?.label ?? "다른 재료";
      return { ...base, state: { kind: "material", label } };
    }
    const error = errors.get(row.id);
    if (error) return { ...base, state: { kind: "error", message: error } };
    const shape = shapeById.get(row.id);
    if (!shape) return { ...base, state: { kind: "loading" } };
    return { ...base, state: { kind: "ready", shape } };
  });

  const placedRows = millingRows.filter(
    (r) => r.state.kind === "ready" && r.placement && !r.placement.excluded,
  );
  const blockReason = !material
    ? "디스크 재료를 고릅니다."
    : loading
      ? "보철을 불러오는 중입니다."
      : placedRows.length === 0
        ? "디스크에 넣은 보철이 없습니다."
        : placedRows.some((r) => r.issues.length > 0)
          ? "빨간 보철을 먼저 옮깁니다."
          : recommended == null
            ? "보철이 가장 두꺼운 디스크보다 높습니다."
            : null;

  const buildFiles = async (): Promise<File[] | null> => {
    if (blockReason || !material) return null;
    const scale = settings.applyShrink ? (settings.shrinkFactor ?? 1) : 1;
    const pinRadius = settings.pinDiameterMm / 2;
    const files: File[] = [];
    const items = [];
    for (const entry of placedRows) {
      if (entry.state.kind !== "ready" || !entry.placement) continue;
      const { shape } = entry.state;
      const p = entry.placement;
      let positions = placedTriangles(shape.part.local, p, scale);
      if (settings.pinsInStl && shape.pins.length > 0) {
        try {
          positions = await unionTriangleSoups(
            [
              positions,
              ...shape.pins.map((pin) =>
                placedTriangles(cylinderTriangles(pin.start, pin.end, pinRadius), p, scale),
              ),
            ],
            shape.part.label,
          );
        } catch (error) {
          if (!(error instanceof MeshUnionError)) throw error;
          toast({
            title: "핀을 보철과 합치지 못했습니다.",
            description: (
              <>
                {meshUnionErrorMessage(error)}
                <br />
                핀을 STL에 합치기를 끄고 CAM에서 커넥터를 답니다.
              </>
            ),
            variant: "destructive",
          });
          return null;
        }
      }
      files.push(new File([encodeBinaryStl(positions)], shape.part.fileName, { type: "model/stl" }));
      items.push({
        id: shape.part.id,
        label: shape.part.label,
        fileName: shape.part.fileName,
        placement: p,
        heightMm: shape.part.heightMm,
        pins: shape.pins,
      });
    }
    const json = millingJobJson({ caseName: baseName, material, thicknessMm, settings, items });
    files.push(new File([json], "밀링_배치.json", { type: "application/json" }));
    return files;
  };

  const download = async () => {
    setBusy("download");
    try {
      const files = await buildFiles();
      if (!files) return;
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (const file of files) zip.file(file.name, file);
      downloadBlobFile(await zip.generateAsync({ type: "blob" }), `${baseName}_밀링.zip`);
    } finally {
      setBusy(null);
    }
  };

  const attach = async () => {
    if (!onAttachChatFile) return;
    setBusy("attach");
    let files: File[] | null;
    try {
      files = await buildFiles();
    } finally {
      setBusy(null);
    }
    if (!files) return;
    for (const file of files) onAttachChatFile(file);
    toast({
      title: "채팅에 첨부했습니다.",
      description: (
        <>
          디스크 배치 STL {files.length - 1}개와 배치 기록이 대화 입력에 있습니다.
          <br />
          보내기를 누르면 상대에게 전달됩니다.
        </>
      ),
    });
    onAttached?.();
  };

  return {
    settings,
    material,
    derivedMaterial,
    thicknessMm,
    recommended,
    shapes,
    placements: doc.placements,
    issues,
    rows: millingRows,
    loading,
    selectedId,
    setSelectedId,
    patchSettings,
    setPlacement,
    setIncluded,
    arrangeAll,
    busy,
    blockReason,
    download,
    attach: onAttachChatFile ? attach : null,
  };
}

export type LabMillingState = ReturnType<typeof useLabMilling>;

// ─── 설정 패널 ─────────────────────────────────────────

function NumberRow({
  label,
  value,
  unit,
  digits = 1,
  range,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  digits?: number;
  range: { min: number; max: number; step: number };
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs font-medium">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {value.toFixed(digits)} {unit}
        </span>
      </div>
      <Slider
        min={range.min}
        max={range.max}
        step={range.step}
        value={[value]}
        onValueChange={([next]) => onChange(next ?? value)}
        aria-label={label}
      />
    </div>
  );
}

function rowStatus(entry: LabMillingRow): { text: string; tone: "muted" | "warn" | "bad" } {
  const s = entry.state;
  if (s.kind === "blocked") return { text: s.reason, tone: "muted" };
  if (s.kind === "print") return { text: "3D 프린트 프리셋", tone: "muted" };
  if (s.kind === "material") return { text: `${s.label} 프리셋`, tone: "muted" };
  if (s.kind === "loading") return { text: "불러오는 중", tone: "muted" };
  if (s.kind === "error") return { text: s.message, tone: "bad" };
  if (entry.placement?.excluded) return { text: "뺌", tone: "muted" };
  if (entry.issues.length > 0) {
    return { text: entry.issues.map((i) => MILLING_ISSUE_LABEL[i]).join(" · "), tone: "bad" };
  }
  const guessed = s.shape.part.axisGuessed ? " · 삽입축 없음" : "";
  return { text: `높이 ${s.shape.part.heightMm.toFixed(1)}mm${guessed}`, tone: guessed ? "warn" : "muted" };
}

export function LabMillingPanel({ milling }: { milling: LabMillingState }) {
  const { settings } = milling;
  const selected = milling.rows.find((r) => r.row.id === milling.selectedId) ?? null;
  const selectedShape = selected?.state.kind === "ready" ? selected.state.shape : null;
  const selectedPlacement =
    selected?.placement && !selected.placement.excluded ? selected.placement : null;
  const zLimit = selectedShape ? Math.max(0, zLimitMm(selectedShape.part, milling.thicknessMm)) : 0;
  const [shrinkDraft, setShrinkDraft] = useState(
    settings.shrinkFactor != null ? String(settings.shrinkFactor) : "",
  );
  useEffect(() => {
    setShrinkDraft(settings.shrinkFactor != null ? String(settings.shrinkFactor) : "");
  }, [settings.shrinkFactor]);

  return (
    <section className="space-y-3" data-coach="milling-settings">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-foreground">디스크</p>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            Ø {MILLING_DISC_DIAMETER_MM} mm
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {MILLING_DISC_MATERIALS.map((m) => (
            <Button
              key={m.id}
              type="button"
              size="sm"
              variant={milling.material === m.id ? "default" : "outline"}
              className="h-7 px-2 text-[11px]"
              aria-pressed={milling.material === m.id}
              onClick={() =>
                milling.patchSettings({ material: m.id === milling.derivedMaterial ? null : m.id })
              }
            >
              {m.label}
            </Button>
          ))}
        </div>
        {!milling.material ? (
          <p className="text-[11px] leading-relaxed text-amber-700">
            내면 프리셋 재료로 디스크를 정하지 못했습니다.
            <br />
            디스크 재료를 고릅니다.
          </p>
        ) : null}
        <div className="grid grid-cols-4 gap-1">
          {MILLING_DISC_THICKNESSES_MM.map((t) => (
            <Button
              key={t}
              type="button"
              size="sm"
              variant={milling.thicknessMm === t ? "default" : "outline"}
              className={cn(
                "h-7 px-1 text-[11px] tabular-nums",
                milling.recommended === t && milling.thicknessMm !== t && "border-primary text-primary",
              )}
              aria-pressed={milling.thicknessMm === t}
              title={milling.recommended === t ? "권장 두께" : undefined}
              onClick={() =>
                milling.patchSettings({ thicknessMm: t === milling.recommended ? null : t })
              }
            >
              {t}
            </Button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {milling.recommended != null
            ? `권장 ${milling.recommended} mm (위·아래 ${MILLING_SKIN_MM} mm 여유)`
            : "가장 두꺼운 디스크보다 높은 보철이 있습니다."}
        </p>
      </div>

      <div className="space-y-2">
        <NumberRow
          label="보철 간격"
          value={settings.gapMm}
          unit="mm"
          range={MILLING_RANGES.gapMm}
          onChange={(gapMm) => milling.patchSettings({ gapMm })}
        />
        <NumberRow
          label="가장자리"
          value={settings.edgeMm}
          unit="mm"
          range={MILLING_RANGES.edgeMm}
          onChange={(edgeMm) => milling.patchSettings({ edgeMm })}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-foreground">핀</p>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 w-6 p-0 text-xs"
              disabled={settings.pinCount <= MILLING_RANGES.pinCount.min}
              onClick={() => milling.patchSettings({ pinCount: settings.pinCount - 1 })}
              aria-label="핀 줄이기"
            >
              −
            </Button>
            <span className="w-4 text-center text-xs tabular-nums">{settings.pinCount}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 w-6 p-0 text-xs"
              disabled={settings.pinCount >= MILLING_RANGES.pinCount.max}
              onClick={() => milling.patchSettings({ pinCount: settings.pinCount + 1 })}
              aria-label="핀 늘리기"
            >
              +
            </Button>
          </div>
        </div>
        {settings.pinCount > 0 ? (
          <>
            <NumberRow
              label="핀 지름"
              value={settings.pinDiameterMm}
              unit="mm"
              range={MILLING_RANGES.pinDiameterMm}
              onChange={(pinDiameterMm) => milling.patchSettings({ pinDiameterMm })}
            />
            <NumberRow
              label="핀 길이"
              value={settings.pinLengthMm}
              unit="mm"
              range={MILLING_RANGES.pinLengthMm}
              onChange={(pinLengthMm) => milling.patchSettings({ pinLengthMm })}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <label className="flex items-center justify-between gap-3 text-xs font-medium">
                  핀을 STL에 합치기
                  <Switch
                    checked={settings.pinsInStl}
                    onCheckedChange={(pinsInStl) => milling.patchSettings({ pinsInStl })}
                    aria-label="핀을 STL에 합치기"
                    className="h-5 w-9 data-[state=checked]:bg-primary [&>span]:h-4 [&>span]:w-4 data-[state=checked]:[&>span]:translate-x-4"
                  />
                </label>
              </TooltipTrigger>
              <TooltipContent side="right" className="z-[520] max-w-64">
                끄면 핀 자리는 배치 기록에만 남고 CAM이 커넥터를 답니다.
                <br />
                켜면 핀을 보철과 한 덩어리로 합쳐 냅니다.
              </TooltipContent>
            </Tooltip>
          </>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2 text-xs font-medium">
          <span>소결 배율</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.0001"
            min={MILLING_RANGES.shrinkFactor.min}
            max={MILLING_RANGES.shrinkFactor.max}
            placeholder="디스크 라벨"
            className="h-7 w-24 rounded-md border bg-background px-2 text-right text-xs tabular-nums outline-none focus:ring-1 focus:ring-primary"
            value={shrinkDraft}
            onChange={(event) => setShrinkDraft(event.target.value)}
            onBlur={() => {
              const n = Number(shrinkDraft);
              const ok =
                shrinkDraft.trim() !== "" &&
                Number.isFinite(n) &&
                n >= MILLING_RANGES.shrinkFactor.min &&
                n <= MILLING_RANGES.shrinkFactor.max;
              milling.patchSettings(
                ok
                  ? { shrinkFactor: n }
                  : { shrinkFactor: null, applyShrink: false },
              );
              if (!ok) setShrinkDraft("");
            }}
            aria-label="소결 배율"
          />
        </div>
        <label className="flex items-center justify-between gap-3 text-xs font-medium">
          STL에 배율 적용
          <Switch
            checked={settings.applyShrink}
            disabled={settings.shrinkFactor == null}
            onCheckedChange={(applyShrink) => milling.patchSettings({ applyShrink })}
            aria-label="STL에 배율 적용"
            className="h-5 w-9 data-[state=checked]:bg-primary [&>span]:h-4 [&>span]:w-4 data-[state=checked]:[&>span]:translate-x-4"
          />
        </label>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          CAM이 디스크 배율을 적용하면 끕니다.
          <br />
          켜면 디스크 중심을 기준으로 키워 냅니다.
        </p>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-foreground">보철</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 gap-1 px-2 text-[11px]"
            disabled={milling.shapes.length === 0}
            onClick={milling.arrangeAll}
          >
            <Shuffle className="h-3 w-3" />
            자동 배치
          </Button>
        </div>
        <ul className="space-y-0.5">
          {milling.rows.map((entry) => {
            const status = rowStatus(entry);
            const ready = entry.state.kind === "ready";
            return (
              <li
                key={entry.row.id}
                className={cn(
                  "flex items-center gap-2 rounded-md px-1.5 py-1 text-[11px]",
                  milling.selectedId === entry.row.id && "bg-muted",
                  ready && "cursor-pointer",
                )}
                onClick={() => ready && milling.setSelectedId(entry.row.id)}
              >
                <Checkbox
                  checked={ready && Boolean(entry.placement) && !entry.placement?.excluded}
                  disabled={!ready || !entry.placement}
                  onClick={(event) => event.stopPropagation()}
                  onCheckedChange={(on) => milling.setIncluded(entry.row.id, on === true)}
                  aria-label={`${entry.row.label} 디스크에 넣기`}
                />
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                  {entry.row.label}
                </span>
                <span
                  className={cn(
                    "shrink-0",
                    status.tone === "bad" && "text-destructive",
                    status.tone === "warn" && "text-amber-700",
                    status.tone === "muted" && "text-muted-foreground",
                  )}
                >
                  {status.text}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {selectedShape && selectedPlacement && milling.selectedId ? (
        <div className="space-y-2 rounded-md bg-muted px-2.5 py-2">
          <p className="text-[11px] font-semibold text-foreground">{selectedShape.part.label}</p>
          <NumberRow
            label="회전"
            value={selectedPlacement.rotDeg}
            unit="°"
            digits={0}
            range={{ min: -180, max: 180, step: 1 }}
            onChange={(rotDeg) =>
              milling.setPlacement(milling.selectedId!, { rotDeg: normalizeDeg(rotDeg) })
            }
          />
          {zLimit > 0.05 ? (
            <NumberRow
              label="높이 위치"
              value={Math.max(-zLimit, Math.min(zLimit, selectedPlacement.z))}
              unit="mm"
              range={{ min: -zLimit, max: zLimit, step: 0.1 }}
              onChange={(z) => milling.setPlacement(milling.selectedId!, { z })}
            />
          ) : null}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            디스크에서 보철을 끌어 옮깁니다.
          </p>
        </div>
      ) : null}

      <div className="flex gap-1">
        {milling.attach ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 flex-1 gap-1 text-xs"
            disabled={milling.busy !== null || Boolean(milling.blockReason)}
            title={milling.blockReason ?? undefined}
            onClick={() => void milling.attach?.()}
          >
            {milling.busy === "attach" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Paperclip className="h-3.5 w-3.5" />
            )}
            {milling.busy === "attach" ? "처리 중…" : "채팅 첨부"}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          className="h-8 flex-1 gap-1 text-xs"
          disabled={milling.busy !== null || Boolean(milling.blockReason)}
          title={milling.blockReason ?? undefined}
          onClick={() => void milling.download()}
        >
          {milling.busy === "download" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          {milling.busy === "download" ? "처리 중…" : "다운로드"}
        </Button>
      </div>
      {milling.blockReason ? (
        <p className="text-[11px] text-muted-foreground">{milling.blockReason}</p>
      ) : null}
    </section>
  );
}

// ─── 디스크 뷰 ─────────────────────────────────────────

const PART_COLOR = 0xf3eee2;
const PART_SELECTED = 0x7fb3ff;
const PART_BAD = 0xf87171;

type ViewPreset = "top" | "side" | "iso";

const VIEW_PRESETS: Array<{ id: ViewPreset; label: string }> = [
  { id: "top", label: "위" },
  { id: "side", label: "옆" },
  { id: "iso", label: "3D" },
];

type SceneCtx = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: ScreenSpaceOrbitControls;
  disc: THREE.Group;
  parts: THREE.Group;
  byId: Map<string, { group: THREE.Group; material: THREE.MeshStandardMaterial }>;
};

function circleLine(radius: number, z: number, color: number, dashed = false) {
  const points: THREE.Vector3[] = [];
  for (let k = 0; k <= 128; k += 1) {
    const t = (k / 128) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(t) * radius, Math.sin(t) * radius, z));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 2, gapSize: 1.5 })
    : new THREE.LineBasicMaterial({ color });
  const line = new THREE.Line(geometry, material);
  if (dashed) line.computeLineDistances();
  return line;
}

function soupGeometry(positions: Float32Array) {
  const raw = new THREE.BufferGeometry();
  raw.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const merged = mergeVertices(raw, 1e-4);
  merged.computeVertexNormals();
  raw.dispose();
  return merged;
}

function disposeGroup(group: THREE.Object3D) {
  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material?.dispose();
  });
}

export function LabMillingDiscView({
  milling,
  className,
}: {
  milling: LabMillingState;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<SceneCtx | null>(null);
  const millingRef = useRef(milling);
  millingRef.current = milling;
  const [view, setView] = useState<ViewPreset>("iso");

  const applyView = useCallback((preset: ViewPreset) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const { camera, controls } = ctx;
    const d = 230;
    camera.up.set(0, preset === "top" ? 1 : 0, preset === "top" ? 0 : 1);
    if (preset === "top") camera.position.set(0, 0, d);
    else if (preset === "side") camera.position.set(0, -d, 0);
    else camera.position.set(0, -d * 0.62, d * 0.72);
    controls.target.set(0, 0, 0);
    camera.lookAt(controls.target);
    controls.syncFromCamera();
    setView(preset);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9);
    const camera = new THREE.PerspectiveCamera(32, 1, 1, 3000);
    scene.add(camera);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb8c2cc, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(40, 60, 120);
    camera.add(key);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0";
    host.appendChild(renderer.domElement);
    const controls = new ScreenSpaceOrbitControls(camera, renderer.domElement, {
      rotateSpeed: 1,
      zoomSpeed: 1.1,
    });
    const disc = new THREE.Group();
    const parts = new THREE.Group();
    scene.add(disc, parts);
    ctxRef.current = { scene, camera, renderer, controls, disc, parts, byId: new Map() };

    const resize = () => {
      const w = Math.max(host.clientWidth, 1);
      const h = Math.max(host.clientHeight, 1);
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    applyView("iso");

    // 보철을 누르면 끌어 옮긴다. 빈 곳은 화면 회전.
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hitPoint = new THREE.Vector3();
    let drag: { id: string; group: THREE.Group; dx: number; dy: number; pointerId: number } | null =
      null;
    const setRay = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
    };
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || event.shiftKey) return;
      setRay(event);
      const hit = raycaster
        .intersectObjects(parts.children, true)
        .find((row) => row.object.visible && row.object.parent?.visible);
      let node: THREE.Object3D | null = hit?.object ?? null;
      while (node && !node.userData.millingId) node = node.parent;
      if (!node) return;
      event.stopPropagation();
      event.preventDefault();
      const group = node as THREE.Group;
      const id = String(group.userData.millingId);
      millingRef.current.setSelectedId(id);
      plane.constant = -group.position.z;
      if (!raycaster.ray.intersectPlane(plane, hitPoint)) return;
      drag = {
        id,
        group,
        dx: group.position.x - hitPoint.x,
        dy: group.position.y - hitPoint.y,
        pointerId: event.pointerId,
      };
      host.setPointerCapture(event.pointerId);
    };
    const onMove = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      setRay(event);
      if (!raycaster.ray.intersectPlane(plane, hitPoint)) return;
      drag.group.position.x = hitPoint.x + drag.dx;
      drag.group.position.y = hitPoint.y + drag.dy;
    };
    const onUp = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const { id, group } = drag;
      drag = null;
      host.releasePointerCapture(event.pointerId);
      millingRef.current.setPlacement(id, {
        x: Math.round(group.position.x * 100) / 100,
        y: Math.round(group.position.y * 100) / 100,
      });
    };
    host.addEventListener("pointerdown", onDown, true);
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerup", onUp);
    host.addEventListener("pointercancel", onUp);

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      host.removeEventListener("pointerdown", onDown, true);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerup", onUp);
      host.removeEventListener("pointercancel", onUp);
      controls.dispose();
      disposeGroup(scene);
      renderer.dispose();
      renderer.domElement.remove();
      ctxRef.current = null;
    };
  }, [applyView]);

  const thickness = milling.thicknessMm;
  const usable = usableRadiusMm(milling.settings);
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    disposeGroup(ctx.disc);
    ctx.disc.clear();
    const r = MILLING_DISC_DIAMETER_MM / 2;
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, thickness, 128),
      new THREE.MeshStandardMaterial({
        color: 0xdfe6ee,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    body.rotation.x = Math.PI / 2;
    body.renderOrder = 2;
    ctx.disc.add(
      body,
      circleLine(r, thickness / 2, 0x94a3b8),
      circleLine(r, -thickness / 2, 0x94a3b8),
      circleLine(usable, 0, 0x0ea5e9, true),
    );
  }, [thickness, usable]);

  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    disposeGroup(ctx.parts);
    ctx.parts.clear();
    ctx.byId.clear();
    const pinRadius = milling.settings.pinDiameterMm / 2;
    for (const shape of milling.shapes) {
      const material = new THREE.MeshStandardMaterial({
        color: PART_COLOR,
        roughness: 0.55,
        metalness: 0,
      });
      const group = new THREE.Group();
      group.userData.millingId = shape.part.id;
      group.add(new THREE.Mesh(soupGeometry(shape.part.local), material));
      for (const pin of shape.pins) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          "position",
          new THREE.BufferAttribute(cylinderTriangles(pin.start, pin.end, pinRadius), 3),
        );
        geometry.computeVertexNormals();
        group.add(new THREE.Mesh(geometry, material));
      }
      ctx.parts.add(group);
      ctx.byId.set(shape.part.id, { group, material });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [milling.shapes]);

  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    for (const [id, { group, material }] of ctx.byId) {
      const p = milling.placements[id];
      group.visible = Boolean(p && !p.excluded);
      if (!p) continue;
      group.position.set(p.x, p.y, p.z);
      group.rotation.set(0, 0, (p.rotDeg * Math.PI) / 180);
      const bad = (milling.issues.get(id) ?? []).length > 0;
      material.color.setHex(bad ? PART_BAD : id === milling.selectedId ? PART_SELECTED : PART_COLOR);
    }
  }, [milling.issues, milling.placements, milling.selectedId, milling.shapes]);

  const placedCount = milling.rows.filter(
    (r) => r.state.kind === "ready" && r.placement && !r.placement.excluded,
  ).length;

  return (
    <div ref={hostRef} className={cn("overflow-hidden", className)}>
      <div className="pointer-events-none absolute left-1/2 top-3 z-10 flex -translate-x-1/2 flex-col items-center gap-1.5">
        <div className="pointer-events-auto flex items-center gap-1 rounded-md border bg-background/95 p-0.5 shadow-sm">
          {VIEW_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              size="sm"
              variant={view === preset.id ? "default" : "ghost"}
              className="h-7 px-2.5 text-xs"
              onClick={() => applyView(preset.id)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <span className="rounded-md bg-background/90 px-2 py-1 text-[11px] tabular-nums text-muted-foreground shadow-sm">
          {milling.material ? millingDiscMaterialLabel(milling.material) : "재료 미정"} · Ø{" "}
          {MILLING_DISC_DIAMETER_MM} × {thickness} mm · 보철 {placedCount}
        </span>
      </div>
      {milling.loading ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <span className="flex items-center gap-2 rounded-md bg-background/95 px-3 py-2 text-xs shadow-sm">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            보철을 불러오는 중
          </span>
        </div>
      ) : null}
    </div>
  );
}

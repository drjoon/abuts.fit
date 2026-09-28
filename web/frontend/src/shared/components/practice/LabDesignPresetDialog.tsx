// 기공소 AI 디자인 — 디자인 프리셋 관리. 프리셋마다 크라운·인레이온레이·임플란트 내면 값을 둔다.
// 치과를 연결하면 그 치과 의뢰를 열 때 이 프리셋이 기본이다.
// related files:
// - web/frontend/src/shared/practice/labDesignPresets.ts
// - web/frontend/src/shared/practice/labDesignPresetApi.ts
// - web/frontend/src/shared/components/practice/LabInnerParamFields.tsx
// - web/frontend/src/shared/components/practice/LabProsthesisAiDesignDialog.tsx

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Copy, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/shared/hooks/use-toast";
import {
  INNER_FIELDS,
  INNER_KINDS,
  isBuiltinDesignPreset,
  newDesignPresetId,
  nextDesignPresetName,
  withMethod,
  type DesignPreset,
  type DesignPresetLibrary,
  type InnerKind,
  type InnerNumberKey,
  type InnerParams,
} from "@/shared/practice/labDesignPresets";
import {
  HintLines,
  InnerMaterialSelect,
  InnerMethodSelect,
  InnerNumberInput,
  InnerParamsDiagram,
} from "@/shared/components/practice/LabInnerParamFields";
import { cn } from "@/shared/ui/cn";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  library: DesignPresetLibrary;
  onSave: (next: DesignPresetLibrary) => Promise<void>;
  /** 지금 의뢰의 치과. 연결 칸을 한 번에 채운다. */
  clinicName: string | null;
  /** 열 때 고를 프리셋. */
  initialPresetId: string | null;
};

export function LabDesignPresetDialog({
  open,
  onOpenChange,
  library,
  onSave,
  clinicName,
  initialPresetId,
}: Props) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<DesignPresetLibrary>(library);
  const [selectedId, setSelectedId] = useState(library.defaultId);
  const [focus, setFocus] = useState<InnerNumberKey | null>(null);
  const [saving, setSaving] = useState(false);
  /** 고치기 전에는 서버 목록이 늦게 와도 그 목록을 따른다. */
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTouched(false);
    setSelectedId(
      initialPresetId && library.presets.some((row) => row.id === initialPresetId)
        ? initialPresetId
        : library.defaultId,
    );
    setFocus(null);
    // 열 때만 고를 프리셋을 정한다. 저장 뒤 서버 값이 와도 고르던 프리셋을 유지한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open && !touched) setDraft(library);
  }, [library, open, touched]);

  const dirty = useMemo(
    () => touched && JSON.stringify(draft) !== JSON.stringify(library),
    [draft, library, touched],
  );
  const edit = (next: (prev: DesignPresetLibrary) => DesignPresetLibrary) => {
    setTouched(true);
    setDraft(next);
  };
  const selected =
    draft.presets.find((row) => row.id === selectedId) ?? draft.presets[0] ?? null;

  const patchSelected = (patch: (preset: DesignPreset) => DesignPreset) => {
    if (!selected) return;
    edit((prev) => ({
      ...prev,
      presets: prev.presets.map((row) => (row.id === selected.id ? patch(row) : row)),
    }));
  };

  const patchColumn = (kind: InnerKind, patch: (params: InnerParams) => InnerParams) =>
    patchSelected((preset) => ({ ...preset, [kind]: patch(preset[kind]) }));

  const duplicate = () => {
    if (!selected) return;
    const copy: DesignPreset = {
      ...selected,
      id: newDesignPresetId(),
      name: nextDesignPresetName(draft.presets),
      clinicName: "",
    };
    edit((prev) => ({ ...prev, presets: [...prev.presets, copy] }));
    setSelectedId(copy.id);
  };

  const remove = () => {
    if (!selected || isBuiltinDesignPreset(selected.id) || selected.id === draft.defaultId) return;
    const index = draft.presets.findIndex((row) => row.id === selected.id);
    const presets = draft.presets.filter((row) => row.id !== selected.id);
    edit((prev) => ({ ...prev, presets }));
    setSelectedId(presets[Math.max(0, index - 1)]?.id ?? draft.defaultId);
  };

  const clinicTaken = (name: string) =>
    Boolean(
      name &&
        draft.presets.some((row) => row.id !== selected?.id && row.clinicName === name),
    );

  const apply = async () => {
    const empty = draft.presets.find((row) => !row.name.trim());
    if (empty) {
      setSelectedId(empty.id);
      toast({ title: "프리셋 이름을 입력하세요.", variant: "destructive" });
      return;
    }
    const next: DesignPresetLibrary = {
      ...draft,
      presets: draft.presets.map((row) => ({
        ...row,
        name: row.name.trim(),
        clinicName: row.clinicName.trim(),
      })),
    };
    setSaving(true);
    try {
      await onSave(next);
      setDraft(next);
      setTouched(false);
      toast({ title: "디자인 프리셋을 저장했습니다." });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "디자인 프리셋을 저장하지 못했습니다.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const clinicDup = selected ? clinicTaken(selected.clinicName.trim()) : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="z-[500] flex h-[min(92vh,40rem)] w-[min(96vw,64rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:w-[min(96vw,64rem)] sm:max-w-none sm:p-0"
        overlayClassName="z-[500]"
      >
        <DialogHeader className="shrink-0 border-b py-3 pl-5 pr-12 text-left">
          <DialogTitle className="text-base">디자인 프리셋</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-56 shrink-0 flex-col border-r bg-muted/30">
            <div className="flex items-center justify-between gap-2 px-3 pb-1.5 pt-3">
              <span className="text-xs font-semibold text-foreground">프리셋 목록</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 bg-background px-2 text-xs"
                    aria-label="프리셋 복제"
                    disabled={!selected}
                    onClick={duplicate}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    복제
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="z-[520]">
                  고른 프리셋을 복제해 새 프리셋을 만듭니다.
                </TooltipContent>
              </Tooltip>
            </div>
            <ol className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
              {draft.presets.map((row, index) => {
                const active = row.id === selected?.id;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs",
                        active
                          ? "bg-background text-primary shadow-sm ring-1 ring-primary/30"
                          : "hover:bg-background/70",
                      )}
                      onClick={() => setSelectedId(row.id)}
                    >
                      <span className="w-4 shrink-0 text-center tabular-nums text-muted-foreground">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {row.name || "이름 없음"}
                        </span>
                        {row.clinicName ? (
                          <span className="block truncate text-[10px] text-muted-foreground">
                            {row.clinicName}
                          </span>
                        ) : null}
                      </span>
                      {row.id === draft.defaultId ? (
                        <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          기본
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ol>
          </aside>

          {selected ? (
            <section className="min-w-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="flex items-center gap-2">
                <Input
                  className="h-8 max-w-xs text-sm font-semibold"
                  value={selected.name}
                  maxLength={40}
                  aria-label="프리셋 이름"
                  onChange={(event) =>
                    patchSelected((preset) => ({ ...preset, name: event.target.value }))
                  }
                />
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    disabled={selected.id === draft.defaultId}
                    onClick={() => edit((prev) => ({ ...prev, defaultId: selected.id }))}
                  >
                    {selected.id === draft.defaultId ? "기본 프리셋" : "기본으로"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 px-0"
                    aria-label="프리셋 삭제"
                    title={
                      isBuiltinDesignPreset(selected.id)
                        ? "기본 제공 프리셋은 지울 수 없습니다."
                        : selected.id === draft.defaultId
                          ? "기본 프리셋은 지울 수 없습니다."
                          : "프리셋 삭제"
                    }
                    disabled={isBuiltinDesignPreset(selected.id) || selected.id === draft.defaultId}
                    onClick={remove}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <span className="w-24 shrink-0 text-xs font-medium">연결 치과</span>
                <Input
                  className={cn("h-7 max-w-xs text-xs", clinicDup && "border-destructive")}
                  value={selected.clinicName}
                  maxLength={80}
                  placeholder="없음"
                  aria-label="연결 치과"
                  onChange={(event) =>
                    patchSelected((preset) => ({ ...preset, clinicName: event.target.value }))
                  }
                />
                {clinicName && selected.clinicName !== clinicName ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => patchSelected((preset) => ({ ...preset, clinicName }))}
                  >
                    {clinicName}
                  </Button>
                ) : null}
              </div>
              <p
                className={cn(
                  "mt-1 pl-[6.5rem] text-[11px]",
                  clinicDup ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {clinicDup ? (
                  <>
                    다른 프리셋에 이미 연결한 치과입니다.
                    <br />
                    목록 앞의 프리셋을 씁니다.
                  </>
                ) : (
                  "이 치과 의뢰를 열면 이 프리셋을 기본으로 씁니다."
                )}
              </p>

              <p className="mt-4 text-xs font-semibold text-foreground">내면 파라미터</p>
              <div className="mt-2 grid grid-cols-[6rem_repeat(3,minmax(0,1fr))] items-center gap-x-2 gap-y-1.5">
                <span />
                {INNER_KINDS.map((kind) => (
                  <span key={kind.id} className="text-center text-[11px] font-medium text-muted-foreground">
                    {kind.label}
                  </span>
                ))}

                <span className="text-xs font-medium">가공 방식</span>
                {INNER_KINDS.map((kind) => (
                  <InnerMethodSelect
                    key={kind.id}
                    label={`${kind.label} 가공 방식`}
                    value={selected[kind.id].method}
                    onChange={(method) => patchColumn(kind.id, (row) => withMethod(row, method))}
                  />
                ))}

                <span className="text-xs font-medium">재료</span>
                {INNER_KINDS.map((kind) => (
                  <InnerMaterialSelect
                    key={kind.id}
                    label={`${kind.label} 재료`}
                    method={selected[kind.id].method}
                    value={selected[kind.id].material}
                    onChange={(material) => patchColumn(kind.id, (row) => ({ ...row, material }))}
                  />
                ))}

                {INNER_FIELDS.map((field) => (
                  <FieldRow
                    key={field.key}
                    label={field.label}
                    hint={field.hint}
                  >
                    {INNER_KINDS.map((kind) => (
                      <InnerNumberInput
                        key={kind.id}
                        field={field}
                        label={`${kind.label} ${field.label}`}
                        value={selected[kind.id][field.key]}
                        disabled={field.key === "toolRadiusMm" && selected[kind.id].method === "print"}
                        onFocus={() => setFocus(field.key)}
                        onChange={(value) =>
                          patchColumn(kind.id, (row) => ({ ...row, [field.key]: value }))
                        }
                      />
                    ))}
                  </FieldRow>
                ))}
              </div>
            </section>
          ) : null}

          <aside className="hidden w-60 shrink-0 overflow-y-auto border-l px-4 py-4 md:block">
            <p className="mb-2 text-xs font-semibold text-foreground">
              {focus ? INNER_FIELDS.find((row) => row.key === focus)?.label : "내면 단면"}
            </p>
            <InnerParamsDiagram focus={focus} />
            <p className="mt-2 text-[11px] text-muted-foreground">
              {focus ? (
                <HintLines text={INNER_FIELDS.find((row) => row.key === focus)?.hint ?? ""} />
              ) : (
                "숫자칸을 누르면 그 자리를 그림에 표시합니다."
              )}
            </p>
          </aside>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t px-5 py-3">
          {dirty ? (
            <span className="mr-auto text-xs text-muted-foreground">
              적용하지 않은 변경이 있습니다.
            </span>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!dirty || saving}
            onClick={() => {
              setDraft(library);
              setTouched(false);
              if (!library.presets.some((row) => row.id === selectedId)) {
                setSelectedId(library.defaultId);
              }
            }}
          >
            되돌리기
          </Button>
          <Button type="button" size="sm" disabled={!dirty || saving} onClick={() => void apply()}>
            {saving ? "저장 중…" : "적용"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="w-fit cursor-help text-xs font-medium">{label}</span>
        </TooltipTrigger>
        <TooltipContent side="left" className="z-[520] max-w-72">
          <HintLines text={hint} />
        </TooltipContent>
      </Tooltip>
      {children}
    </>
  );
}

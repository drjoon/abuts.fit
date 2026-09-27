// 스캔바디 라이브러리(.dme)·심플어벗 템플릿 등록. 관리자=어벗츠 공용, 기공소=자체 추가 등록.
// AI 디자인은 의뢰의 임플란트 사양·심플어벗 규격으로 여기서 자동으로 고른다.
// related files:
// - web/frontend/src/shared/practice/scanbodyLibraryApi.ts
// - web/frontend/src/shared/files/dmeLibrary.ts
// - web/frontend/src/pages/requestor/settings/SettingsPage.tsx
// - web/frontend/src/pages/admin/settings/SettingsPage.tsx

import { useMemo, useRef, useState } from "react";
import { Link2, Loader2, Trash2, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LabImplantLibraryPicker } from "@/shared/components/practice/LabImplantLibraryPicker";
import { parseDmeFiles } from "@/shared/files/dmeLibrary";
import { useToast } from "@/shared/hooks/use-toast";
import {
  buildImplantLibraries,
  readImplantFavorites,
  writeImplantFavorites,
} from "@/shared/practice/implantLibrary";
import {
  deleteAbutmentTemplate,
  deleteScanbodyLibrary,
  importDmeLibrary,
  parseTemplateFileName,
  updateScanbodyKit,
  uploadAbutmentTemplate,
  useScanbodyCatalog,
  type AbutmentTemplateRow,
  type LibraryScope,
  type ScanbodyLibraryRow,
} from "@/shared/practice/scanbodyLibraryApi";
import { SIMPLE_ABUTMENT_KINDS, type SimpleAbutmentKind } from "@/shared/practice/transferMemo";
import { useImplantConnectionCatalog } from "@/shared/practice/useImplantConnectionCatalog";
import { cn } from "@/shared/ui/cn";
import { useAuthStore } from "@/store/useAuthStore";

function ScopeBadge({ scope }: { scope: LibraryScope }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-medium",
        scope === "public" ? "bg-slate-100 text-slate-600" : "bg-primary/10 text-primary",
      )}
    >
      {scope === "public" ? "어벗츠 공용" : "우리 기공소"}
    </span>
  );
}

export function ScanbodyLibraryManager() {
  const { toast } = useToast();
  const token = useAuthStore((state) => state.token);
  const { catalog, setCatalog, loading } = useScanbodyCatalog();
  const { connections } = useImplantConnectionCatalog(token);
  const implantLibraries = useMemo(() => buildImplantLibraries(connections), [connections]);
  const implantLabel = useMemo(
    () => new Map(implantLibraries.map((row) => [row.id, `${row.manufacturer} ${row.label}`.trim()])),
    [implantLibraries],
  );
  const [favorites, setFavorites] = useState(readImplantFavorites);
  const [busy, setBusy] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<{ libraryId: string; kitId: string } | null>(null);
  const [templateKind, setTemplateKind] = useState<SimpleAbutmentKind>(SIMPLE_ABUTMENT_KINDS[0]);
  const dmeInput = useRef<HTMLInputElement>(null);
  const templateInput = useRef<HTMLInputElement>(null);

  const replaceLibrary = (row: ScanbodyLibraryRow) =>
    setCatalog((prev) => ({
      ...prev,
      libraries: [...prev.libraries.filter((lib) => lib.id !== row.id), row].sort((a, b) =>
        a.systemName.localeCompare(b.systemName),
      ),
    }));
  const replaceTemplate = (row: AbutmentTemplateRow) =>
    setCatalog((prev) => ({
      ...prev,
      templates: [...prev.templates.filter((t) => t.id !== row.id), row],
    }));

  const onDmeFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setBusy("dme");
    try {
      const libs = await parseDmeFiles(files);
      if (libs.length === 0) throw new Error("라이브러리에서 키트를 찾지 못했습니다.");
      for (const lib of libs) {
        const prev = catalog.libraries.find(
          (row) => row.canEdit && row.systemName === lib.systemName,
        );
        const keep = Object.fromEntries((prev?.kits ?? []).map((kit) => [kit.kitId, kit.catalogIds]));
        replaceLibrary(await importDmeLibrary(lib, keep));
      }
      toast({
        title: "스캔바디 라이브러리를 등록했습니다.",
        description: (
          <>
            {libs.map((lib) => `${lib.systemName} · 키트 ${lib.kits.length}개`).join(", ")}
            <br />
            키트마다 임플란트를 연결해야 AI 디자인에서 자동으로 고릅니다.
          </>
        ),
      });
    } catch (error) {
      toast({
        title: "라이브러리를 등록하지 못했습니다.",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const onTemplateFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setBusy("template");
    const failed: string[] = [];
    for (const file of files) {
      const spec = parseTemplateFileName(file.name);
      if (!spec) {
        failed.push(`${file.name}: 이름에서 직경을 읽지 못했습니다.`);
        continue;
      }
      try {
        replaceTemplate(await uploadAbutmentTemplate(file, { kind: templateKind, ...spec }));
      } catch (error) {
        failed.push(`${file.name}: ${error instanceof Error ? error.message : "실패"}`);
      }
    }
    setBusy(null);
    if (failed.length > 0) {
      toast({
        title: "일부 템플릿을 올리지 못했습니다.",
        description: (
          <>
            {failed.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </>
        ),
        variant: "destructive",
      });
    }
  };

  const setKitCatalog = async (lib: ScanbodyLibraryRow, kitId: string, catalogIds: string[]) => {
    setBusy(`kit:${lib.id}:${kitId}`);
    replaceLibrary({
      ...lib,
      kits: lib.kits.map((kit) => (kit.kitId === kitId ? { ...kit, catalogIds } : kit)),
    });
    try {
      replaceLibrary(await updateScanbodyKit(lib.id, kitId, catalogIds));
    } catch (error) {
      replaceLibrary(lib);
      toast({
        title: "임플란트 연결을 저장하지 못했습니다.",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const removeLibrary = async (lib: ScanbodyLibraryRow) => {
    if (!window.confirm(`${lib.systemName} 라이브러리를 지울까요?`)) return;
    setCatalog((prev) => ({ ...prev, libraries: prev.libraries.filter((row) => row.id !== lib.id) }));
    try {
      await deleteScanbodyLibrary(lib.id);
    } catch (error) {
      replaceLibrary(lib);
      toast({
        title: "라이브러리를 지우지 못했습니다.",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  };

  const removeTemplate = async (row: AbutmentTemplateRow) => {
    setCatalog((prev) => ({ ...prev, templates: prev.templates.filter((t) => t.id !== row.id) }));
    try {
      await deleteAbutmentTemplate(row.id);
    } catch (error) {
      replaceTemplate(row);
      toast({
        title: "템플릿을 지우지 못했습니다.",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  };

  const templatesByKind = SIMPLE_ABUTMENT_KINDS.map((kind) => ({
    kind,
    rows: catalog.templates
      .filter((row) => row.kind === kind)
      .sort(
        (a, b) =>
          Number(a.diameter) - Number(b.diameter) ||
          a.height.localeCompare(b.height) ||
          a.scope.localeCompare(b.scope),
      ),
  }));

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">스캔바디 라이브러리</CardTitle>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              3Shape용으로 배포된 .dme 파일을 올립니다.
              <br />
              연도별 파일(16v~24v)은 여러 개를 한 번에 올려도 라이브러리 하나로 합쳐집니다.
            </p>
          </div>
          <input
            ref={dmeInput}
            type="file"
            accept=".dme"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              void onDmeFiles(files);
            }}
          />
          <Button size="sm" disabled={busy === "dme"} onClick={() => dmeInput.current?.click()}>
            {busy === "dme" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
            {busy === "dme" ? "등록 중…" : ".dme 올리기"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && catalog.libraries.length === 0 ? (
            <p className="text-xs text-muted-foreground">불러오는 중입니다.</p>
          ) : catalog.libraries.length === 0 ? (
            <p className="text-xs text-muted-foreground">등록된 라이브러리가 없습니다.</p>
          ) : (
            catalog.libraries.map((lib) => {
              const partName = new Map(lib.parts.map((part) => [part.partId, part.name]));
              return (
                <div key={lib.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold">{lib.systemName}</p>
                        <ScopeBadge scope={lib.scope} />
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Dental System {lib.containerVersions.join(", ") || "-"} · 부품 {lib.parts.length}개
                      </p>
                    </div>
                    {lib.canEdit ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0"
                        aria-label="라이브러리 지우기"
                        onClick={() => void removeLibrary(lib)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {lib.kits.map((kit) => {
                      const open = pickerFor?.libraryId === lib.id && pickerFor.kitId === kit.kitId;
                      return (
                        <li key={kit.kitId} className="relative rounded-md bg-muted/40 px-2.5 py-2">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-xs font-medium">{kit.name}</span>
                            <span className="text-[11px] text-muted-foreground">
                              스캔바디{" "}
                              {kit.scanAbutmentPartIds.map((id) => partName.get(id) ?? id).join(" · ") || "없음"}
                            </span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            {kit.catalogIds.length === 0 ? (
                              <span className="text-[11px] text-amber-700">연결된 임플란트 없음</span>
                            ) : (
                              kit.catalogIds.map((id) => (
                                <span
                                  key={id}
                                  className="inline-flex items-center gap-1 rounded bg-background px-1.5 py-0.5 text-[11px] ring-1 ring-border"
                                >
                                  {implantLabel.get(id) ?? id}
                                  {lib.canEdit ? (
                                    <button
                                      type="button"
                                      aria-label="연결 해제"
                                      className="text-muted-foreground hover:text-foreground"
                                      onClick={() =>
                                        void setKitCatalog(
                                          lib,
                                          kit.kitId,
                                          kit.catalogIds.filter((row) => row !== id),
                                        )
                                      }
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  ) : null}
                                </span>
                              ))
                            )}
                            {lib.canEdit ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-[11px]"
                                onClick={() => setPickerFor(open ? null : { libraryId: lib.id, kitId: kit.kitId })}
                              >
                                <Link2 className="mr-1 h-3 w-3" />
                                임플란트 연결
                              </Button>
                            ) : null}
                          </div>
                          {open ? (
                            <div className="absolute right-0 top-full z-20 mt-1">
                              <LabImplantLibraryPicker
                                toothNumber={kit.name}
                                libraries={implantLibraries}
                                favorites={favorites}
                                value={null}
                                defaultManufacturer=""
                                onPick={(row) => {
                                  setPickerFor(null);
                                  if (!kit.catalogIds.includes(row.id)) {
                                    void setKitCatalog(lib, kit.kitId, [...kit.catalogIds, row.id]);
                                  }
                                }}
                                onToggleFavorite={(id) =>
                                  setFavorites((prev) => {
                                    const next = prev.includes(id)
                                      ? prev.filter((row) => row !== id)
                                      : [...prev, id];
                                    writeImplantFavorites(next);
                                    return next;
                                  })
                                }
                                onClose={() => setPickerFor(null)}
                              />
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">심플어벗 템플릿</CardTitle>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              3Shape 스캐너로 찍은 심플어벗 .dcm 파일을 올립니다.
              <br />
              파일 이름 6M은 직경 6, 높이 M으로 읽고, 의뢰의 종류·직경으로 자동으로 고릅니다.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <select
              className="h-8 rounded-md border bg-background px-2 text-xs"
              aria-label="심플어벗 종류"
              value={templateKind}
              onChange={(event) => setTemplateKind(event.target.value as SimpleAbutmentKind)}
            >
              {SIMPLE_ABUTMENT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
            <input
              ref={templateInput}
              type="file"
              accept=".dcm"
              multiple
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                void onTemplateFiles(files);
              }}
            />
            <Button
              size="sm"
              disabled={busy === "template"}
              onClick={() => templateInput.current?.click()}
            >
              {busy === "template" ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-1.5 h-4 w-4" />
              )}
              {busy === "template" ? "등록 중…" : ".dcm 올리기"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {templatesByKind.map(({ kind, rows }) => (
            <div key={kind}>
              <p className="mb-1 text-xs font-semibold">{kind}</p>
              {rows.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">등록된 템플릿이 없습니다.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="text-[11px] text-muted-foreground">
                    <tr className="text-left">
                      <th className="py-1 font-normal">규격</th>
                      <th className="py-1 font-normal">최대 지름</th>
                      <th className="py-1 font-normal">마진 높이</th>
                      <th className="py-1 font-normal">전체 높이</th>
                      <th className="py-1 font-normal">등록</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="py-1.5 font-medium">
                          {row.diameter}
                          {row.height}
                        </td>
                        <td>{row.maxDiameterMm.toFixed(2)} mm</td>
                        <td>{row.marginHeightMm.toFixed(2)} mm</td>
                        <td>{row.heightMm.toFixed(2)} mm</td>
                        <td>
                          <ScopeBadge scope={row.scope} />
                        </td>
                        <td className="text-right">
                          {row.canEdit ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              aria-label="템플릿 지우기"
                              onClick={() => void removeTemplate(row)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

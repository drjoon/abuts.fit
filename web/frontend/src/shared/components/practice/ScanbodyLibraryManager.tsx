// 스캔바디 라이브러리(3Shape .dme · exocad)·심플어벗 템플릿 등록. 관리자=어벗츠 공용, 기공소=자체 추가 등록.
// 라이브러리는 S3 격리 → 악성코드 검사 → 서버 해석 순으로 등록되고, 진행 상태를 폴링해 보여 준다.
// 기공소 라이브러리는 그 기공소만 쓰고, 관리자가 검토해 공용으로 올리거나 내린다.
// AI 디자인은 의뢰의 임플란트 사양·심플어벗 규격으로 여기서 자동으로 고른다.
// related files:
// - web/frontend/src/shared/practice/scanbodyLibraryApi.ts
// - web/frontend/src/shared/files/scanbodyLibraryBundle.ts
// - web/frontend/src/pages/requestor/settings/SettingsPage.tsx
// - web/frontend/src/pages/admin/settings/SettingsPage.tsx

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, FolderUp, Link2, Loader2, Trash2, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LabImplantLibraryPicker } from "@/shared/components/practice/LabImplantLibraryPicker";
import { buildScanbodyUploadBundles } from "@/shared/files/scanbodyLibraryBundle";
import { useToast } from "@/shared/hooks/use-toast";
import {
  buildImplantLibraries,
  readImplantFavorites,
  writeImplantFavorites,
} from "@/shared/practice/implantLibrary";
import {
  deleteAbutmentTemplate,
  deleteScanbodyLibrary,
  fetchScanbodyUploads,
  isUploadFinished,
  parseTemplateFileName,
  setScanbodyLibraryPublic,
  updateScanbodyKit,
  uploadAbutmentTemplate,
  uploadScanbodyBundle,
  useScanbodyCatalog,
  type AbutmentTemplateRow,
  type LibraryScope,
  type ScanbodyLibraryRow,
  type ScanbodyUploadRow,
} from "@/shared/practice/scanbodyLibraryApi";
import { SIMPLE_ABUTMENT_KINDS, type SimpleAbutmentKind } from "@/shared/practice/transferMemo";
import { useImplantConnectionCatalog } from "@/shared/practice/useImplantConnectionCatalog";
import { cn } from "@/shared/ui/cn";
import { useAuthStore } from "@/store/useAuthStore";

const PAGE = 40;

type UploadItem = {
  key: string;
  label: string;
  progress: number;
  row: ScanbodyUploadRow | null;
  error: string | null;
};

type AdminFilter = "all" | "review" | "shared";

function ScopeBadge({ scope, isAdmin }: { scope: LibraryScope; isAdmin: boolean }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-medium",
        scope === "public" ? "bg-slate-100 text-slate-600" : "bg-primary/10 text-primary",
      )}
    >
      {scope === "public" ? "어벗츠 공용" : isAdmin ? "기공소" : "우리 기공소"}
    </span>
  );
}

function uploadStatusText(item: UploadItem) {
  if (item.error) return `실패 · ${item.error}`;
  const row = item.row;
  if (!row) return `올리는 중 ${Math.round(item.progress * 100)}%`;
  switch (row.status) {
    case "uploading":
      return `올리는 중 ${Math.round(item.progress * 100)}%`;
    case "scanning":
      return "악성코드 검사 중";
    case "processing":
      return "형상 검증·등록 중";
    case "done":
      return `등록 완료 · 라이브러리 ${row.libraries.length}개`;
    case "rejected":
      return `거절 · ${row.message}`;
    default:
      return `실패 · ${row.message}`;
  }
}

function uploadTone(item: UploadItem) {
  const status = item.error ? "failed" : item.row?.status;
  if (status === "done") return "text-emerald-700";
  if (status === "rejected" || status === "failed") return "text-destructive";
  return "text-muted-foreground";
}

export function ScanbodyLibraryManager() {
  const { toast } = useToast();
  const token = useAuthStore((state) => state.token);
  const isAdmin = useAuthStore((state) => state.user?.role) === "admin";
  const { catalog, setCatalog, loading, reload } = useScanbodyCatalog();
  const { connections } = useImplantConnectionCatalog(token);
  const implantLibraries = useMemo(() => buildImplantLibraries(connections), [connections]);
  const implantLabel = useMemo(
    () => new Map(implantLibraries.map((row) => [row.id, `${row.manufacturer} ${row.label}`.trim()])),
    [implantLibraries],
  );
  const [favorites, setFavorites] = useState(readImplantFavorites);
  const [busy, setBusy] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [adminFilter, setAdminFilter] = useState<AdminFilter>("all");
  const [limit, setLimit] = useState(PAGE);
  const [pickerFor, setPickerFor] = useState<{ libraryId: string; kitId: string } | null>(null);
  const [templateKind, setTemplateKind] = useState<SimpleAbutmentKind>(SIMPLE_ABUTMENT_KINDS[0]);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const templateInput = useRef<HTMLInputElement>(null);

  const patchUpload = (key: string, patch: Partial<UploadItem>) =>
    setUploads((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  useEffect(() => {
    let cancelled = false;
    void fetchScanbodyUploads()
      .then((rows) => {
        if (cancelled) return;
        const active = rows.filter((row) => !isUploadFinished(row.status) && row.status !== "uploading");
        if (active.length === 0) return;
        setUploads((prev) => [
          ...active
            .filter((row) => !prev.some((item) => item.row?.id === row.id))
            .map((row) => ({ key: row.id, label: row.fileName, progress: 1, row, error: null })),
          ...prev,
        ]);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const pendingIds = uploads
    .filter((item) => item.row && !isUploadFinished(item.row.status) && item.row.status !== "uploading")
    .map((item) => item.row!.id)
    .join(",");
  useEffect(() => {
    if (!pendingIds) return;
    const timer = window.setInterval(() => {
      void fetchScanbodyUploads(pendingIds.split(","))
        .then((rows) => {
          const byId = new Map(rows.map((row) => [row.id, row]));
          setUploads((prev) =>
            prev.map((item) => {
              const next = item.row ? byId.get(item.row.id) : undefined;
              return next ? { ...item, row: next } : item;
            }),
          );
          // 조회 대상은 직전까지 진행 중이던 것뿐이라, done이면 이번에 끝난 것이다.
          if (rows.some((row) => row.status === "done")) reload();
        })
        .catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [pendingIds, reload]);

  const onLibraryFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setBusy("bundle");
    let bundles;
    try {
      const built = await buildScanbodyUploadBundles(files);
      bundles = built.bundles;
      if (built.notes.length > 0) {
        toast({
          title: "일부 파일은 올리지 않습니다.",
          description: (
            <>
              {built.notes.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </>
          ),
        });
      }
      if (bundles.length === 0) {
        throw new Error("올릴 라이브러리가 없습니다. 3Shape .dme 파일이나 exocad 라이브러리 폴더를 골라 주세요.");
      }
    } catch (error) {
      toast({
        title: "라이브러리를 올리지 못했습니다.",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
      setBusy(null);
      return;
    }
    const items = bundles.map((bundle, i) => ({
      key: `${Date.now()}-${i}`,
      label: bundle.label,
      progress: 0,
      row: null,
      error: null,
    }));
    setUploads((prev) => [...items, ...prev]);
    setBusy(null);
    for (const [i, bundle] of bundles.entries()) {
      const key = items[i]!.key;
      try {
        const row = await uploadScanbodyBundle(bundle, (progress) => patchUpload(key, { progress }));
        patchUpload(key, { row, progress: 1 });
        if (row.status === "done") reload();
      } catch (error) {
        patchUpload(key, { error: error instanceof Error ? error.message : "올리지 못했습니다." });
      }
    }
  };

  const replaceLibrary = (row: ScanbodyLibraryRow) =>
    setCatalog((prev) => ({
      ...prev,
      libraries: prev.libraries.map((lib) => (lib.id === row.id ? row : lib)),
    }));
  const replaceTemplate = (row: AbutmentTemplateRow) =>
    setCatalog((prev) => ({
      ...prev,
      templates: [...prev.templates.filter((t) => t.id !== row.id), row],
    }));

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
    }
  };

  const togglePublic = async (lib: ScanbodyLibraryRow) => {
    replaceLibrary({ ...lib, isPublic: !lib.isPublic });
    try {
      replaceLibrary(await setScanbodyLibraryPublic(lib.id, !lib.isPublic));
    } catch (error) {
      replaceLibrary(lib);
      toast({
        title: "공용 설정을 바꾸지 못했습니다.",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  };

  const removeLibrary = async (lib: ScanbodyLibraryRow) => {
    if (!window.confirm(`${lib.systemName} 라이브러리를 지울까요?`)) return;
    setCatalog((prev) => ({ ...prev, libraries: prev.libraries.filter((row) => row.id !== lib.id) }));
    try {
      await deleteScanbodyLibrary(lib.id);
    } catch (error) {
      setCatalog((prev) => ({ ...prev, libraries: [...prev.libraries, lib] }));
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

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.libraries.filter((lib) => {
      if (isAdmin && adminFilter === "review" && !(lib.scope === "lab" && !lib.isPublic)) return false;
      if (isAdmin && adminFilter === "shared" && lib.scope === "lab" && !lib.isPublic) return false;
      if (!q) return true;
      return (
        lib.systemName.toLowerCase().includes(q) ||
        lib.ownerName.toLowerCase().includes(q) ||
        lib.kits.some((kit) => kit.name.toLowerCase().includes(q))
      );
    });
  }, [catalog.libraries, query, isAdmin, adminFilter]);

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
              3Shape .dme 파일이나 exocad 라이브러리 폴더를 올립니다.
              <br />
              악성코드 검사와 형상 검증을 거친 뒤 등록됩니다.
              <br />
              {isAdmin ? (
                <>
                  관리자가 올린 라이브러리는 어벗츠 공용입니다.
                  <br />
                  기공소 라이브러리는 검토한 뒤 공용으로 올립니다.
                </>
              ) : (
                "올린 라이브러리는 우리 기공소에서 바로 쓰고, 어벗츠가 검토하면 공용이 됩니다."
              )}
            </p>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".dme,.zip"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              void onLibraryFiles(files);
            }}
          />
          <input
            ref={folderInput}
            type="file"
            multiple
            className="hidden"
            {...({ webkitdirectory: "" } as Record<string, string>)}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              void onLibraryFiles(files);
            }}
          />
          <div className="flex shrink-0 items-center gap-1.5">
            <Button size="sm" variant="outline" disabled={busy === "bundle"} onClick={() => folderInput.current?.click()}>
              <FolderUp className="mr-1.5 h-4 w-4" />
              폴더 올리기
            </Button>
            <Button size="sm" disabled={busy === "bundle"} onClick={() => fileInput.current?.click()}>
              {busy === "bundle" ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-1.5 h-4 w-4" />
              )}
              {busy === "bundle" ? "파일 준비 중…" : "파일 올리기"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {uploads.length > 0 ? (
            <ul className="space-y-1.5 rounded-lg border bg-muted/30 p-2.5">
              {uploads.map((item) => (
                <li key={item.key} className="text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{item.label}</span>
                    <span className={cn("shrink-0 text-[11px]", uploadTone(item))}>{uploadStatusText(item)}</span>
                  </div>
                  {!item.row && !item.error ? (
                    <div className="mt-1 h-1 overflow-hidden rounded bg-muted">
                      <div className="h-full bg-primary transition-all" style={{ width: `${item.progress * 100}%` }} />
                    </div>
                  ) : null}
                  {item.row?.notes.length ? (
                    <details className="mt-0.5 text-[11px] text-muted-foreground">
                      <summary className="cursor-pointer">참고 {item.row.notes.length}건</summary>
                      {item.row.notes.map((line) => (
                        <span key={line} className="block">
                          {line}
                        </span>
                      ))}
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex items-center gap-2">
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setLimit(PAGE);
              }}
              placeholder="시스템·키트 이름으로 찾기"
              className="h-8 text-xs"
            />
            {isAdmin ? (
              <select
                className="h-8 rounded-md border bg-background px-2 text-xs"
                aria-label="보기"
                value={adminFilter}
                onChange={(event) => {
                  setAdminFilter(event.target.value as AdminFilter);
                  setLimit(PAGE);
                }}
              >
                <option value="all">전체</option>
                <option value="review">검토 대기</option>
                <option value="shared">공용</option>
              </select>
            ) : null}
          </div>

          {loading && catalog.libraries.length === 0 ? (
            <p className="text-xs text-muted-foreground">불러오는 중입니다.</p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {catalog.libraries.length === 0 ? "등록된 라이브러리가 없습니다." : "찾는 라이브러리가 없습니다."}
            </p>
          ) : (
            <>
              {filtered.slice(0, limit).map((lib) => {
                const open = expanded.has(lib.id);
                const partName = new Map(lib.parts.map((part) => [part.partId, part.name]));
                const unlinked = lib.kits.filter((kit) => kit.catalogIds.length === 0).length;
                return (
                  <div key={lib.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-start gap-1.5 text-left"
                        onClick={() => toggleExpanded(lib.id)}
                      >
                        {open ? (
                          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-sm font-semibold">{lib.systemName}</span>
                            <ScopeBadge scope={lib.scope} isAdmin={isAdmin} />
                            {lib.scope === "lab" && lib.isPublic ? (
                              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                                공용 승격
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            {lib.source === "exocad" ? "exocad" : `3Shape ${lib.containerVersions.join(", ")}`.trim()}
                            {" · "}키트 {lib.kits.length}개 · 스캔바디 {lib.parts.length}개
                            {unlinked > 0 ? ` · 임플란트 미연결 ${unlinked}개` : ""}
                            {isAdmin && lib.ownerName ? ` · ${lib.ownerName}` : ""}
                          </span>
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-1">
                        {isAdmin && lib.scope === "lab" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => void togglePublic(lib)}
                          >
                            {lib.isPublic ? "공용에서 내리기" : "공용으로 올리기"}
                          </Button>
                        ) : null}
                        {lib.canEdit ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            aria-label="라이브러리 지우기"
                            onClick={() => void removeLibrary(lib)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {open ? (
                      <ul className="mt-2 space-y-1.5">
                        {lib.kits.map((kit) => {
                          const picking = pickerFor?.libraryId === lib.id && pickerFor.kitId === kit.kitId;
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
                                    onClick={() =>
                                      setPickerFor(picking ? null : { libraryId: lib.id, kitId: kit.kitId })
                                    }
                                  >
                                    <Link2 className="mr-1 h-3 w-3" />
                                    임플란트 연결
                                  </Button>
                                ) : null}
                              </div>
                              {picking ? (
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
                    ) : null}
                  </div>
                );
              })}
              {filtered.length > limit ? (
                <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setLimit((n) => n + PAGE)}>
                  더 보기 ({filtered.length - limit}개 남음)
                </Button>
              ) : null}
            </>
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
                          <ScopeBadge scope={row.scope} isAdmin={isAdmin} />
                          {isAdmin && row.ownerName ? (
                            <span className="ml-1 text-[11px] text-muted-foreground">{row.ownerName}</span>
                          ) : null}
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

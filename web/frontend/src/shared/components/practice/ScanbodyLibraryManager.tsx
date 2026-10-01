// 스캔바디 라이브러리(3Shape .dme · exocad)·심플 템플릿(심플어벗·심플밀링·심플힐링) 등록. 관리자=어벗츠 공용, 기공소=자체 추가 등록.
// 라이브러리·템플릿은 S3 격리 → 악성코드 검사 → 서버 해석 순으로 등록되고, 진행 상태를 폴링해 보여 준다.
// 기공소가 올린 것은 검사·해석을 통과하면 바로 공용이다. 관리자는 문제 있는 것을 내린다. 관리자는 차단 목록도 여기서 본다.
// 기공소가 공용 라이브러리를 고치면 그 기공소 사본(forkOf)에 저장해 다른 기공소에 영향을 주지 않는다.
// AI 디자인은 의뢰의 임플란트·스캔바디 사양·심플 규격으로 여기서 자동으로 고른다.
// related files:
// - web/frontend/src/shared/practice/scanbodyLibraryApi.ts
// - web/frontend/src/shared/files/scanbodyLibraryBundle.ts
// - web/frontend/src/pages/requestor/settings/SettingsPage.tsx
// - web/frontend/src/pages/admin/dashboard/ScanbodyDemandCard.tsx (관리자 대시보드는 이 화면 대신 압축 파일만 올린다)

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, FolderUp, Link2, Loader2, Trash2, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LabImplantLibraryPicker } from "@/shared/components/practice/LabImplantLibraryPicker";
import { ScanbodyLibraryUpdatePrompt } from "@/shared/components/practice/ScanbodyLibraryUpdatePrompt";
import { buildScanbodyUploadBundles } from "@/shared/files/scanbodyLibraryBundle";
import { useToast } from "@/shared/hooks/use-toast";
import {
  buildImplantLibraries,
  readImplantFavorites,
  writeImplantFavorites,
} from "@/shared/practice/implantLibrary";
import { formatKstDateTimeToKo } from "@/shared/date/kst";
import {
  approveTemplateUpload,
  deleteAbutmentTemplate,
  deleteScanbodyLibrary,
  rebaseScanbodyLibrary,
  fetchScanbodyUploads,
  fetchTemplateReviews,
  fetchTemplateUploads,
  fetchUploadBlocklist,
  isTemplateUploadActive,
  isUploadFinished,
  parseTemplateFileName,
  rejectTemplateUpload,
  setAbutmentTemplatePublic,
  setScanbodyLibraryPublic,
  TEMPLATE_KINDS,
  unblockUploader,
  updateScanbodyKit,
  uploadAbutmentTemplate,
  uploadScanbodyBundle,
  useScanbodyCatalog,
  type AbutmentTemplateReviewRow,
  type AbutmentTemplateRow,
  type AbutmentTemplateUploadRow,
  type LibraryScope,
  type ScanbodyLibraryRow,
  type ScanbodyUploadRow,
  type TemplateKind,
  type UploadBlockRow,
} from "@/shared/practice/scanbodyLibraryApi";
import { groupRegisteredLibraries, splitScanbodyCode } from "@/shared/practice/scanbodyLibraryIdentity";
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

function templateUploadStatusText(row: AbutmentTemplateUploadRow) {
  switch (row.status) {
    case "uploading":
      return "올리는 중";
    case "pending_review":
      return "관리자 검토 대기";
    case "scanning":
      return "악성코드 검사 중";
    case "processing":
      return "형상 검증·등록 중";
    case "done":
      return "등록 완료";
    case "rejected":
      return `거절 · ${row.message}`;
    default:
      return `실패 · ${row.message}`;
  }
}

function templateUploadTone(row: AbutmentTemplateUploadRow) {
  if (row.status === "done") return "text-emerald-700";
  if (row.status === "rejected" || row.status === "failed") return "text-destructive";
  if (row.status === "pending_review") return "text-amber-700";
  return "text-muted-foreground";
}

const formatMb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** 진행 중(검사·해석) 업로드를 3초마다 다시 받는다. 끝나면 onFinished. */
function usePollActive<T extends { id: string; status: AbutmentTemplateUploadRow["status"] }>(
  rows: readonly T[],
  fetchRows: (ids: string[]) => Promise<T[]>,
  onRows: (rows: T[]) => void,
  onFinished: () => void,
) {
  const activeIds = rows
    .filter((row) => isTemplateUploadActive(row.status))
    .map((row) => row.id)
    .join(",");
  const latest = useRef({ fetchRows, onRows, onFinished });
  latest.current = { fetchRows, onRows, onFinished };
  useEffect(() => {
    if (!activeIds) return;
    const timer = window.setInterval(() => {
      void latest.current
        .fetchRows(activeIds.split(","))
        .then((next) => {
          latest.current.onRows(next);
          if (next.some((row) => row.status === "done")) latest.current.onFinished();
        })
        .catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [activeIds]);
}

/** 관리자: 기공소가 올린 심플어벗 템플릿 검토. 열어 보기 = 검사·해석, 폐기 = 열지 않고 삭제. */
function AdminTemplateReviewCard({ onRegistered }: { onRegistered: () => void }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<AbutmentTemplateReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<{ id: string; reason: string; malicious: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchTemplateReviews()
      .then((next) => {
        if (!cancelled) setRows(next);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const replace = (row: AbutmentTemplateReviewRow) =>
    setRows((prev) => prev.map((item) => (item.id === row.id ? row : item)));

  usePollActive(
    rows,
    (ids) => fetchTemplateReviews(ids),
    (next) => next.forEach(replace),
    onRegistered,
  );

  const approve = async (row: AbutmentTemplateReviewRow) => {
    setBusyId(row.id);
    replace({ ...row, status: "scanning" });
    try {
      const next = await approveTemplateUpload(row.id);
      replace(next);
      if (next.status === "done") onRegistered();
    } catch (error) {
      replace(row);
      toast({
        title: "검사를 시작하지 못했습니다.",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const reject = async () => {
    if (!rejecting) return;
    const row = rows.find((item) => item.id === rejecting.id);
    if (!row) return;
    const body = { reason: rejecting.reason.trim(), malicious: rejecting.malicious };
    setBusyId(row.id);
    setRejecting(null);
    replace({ ...row, status: "rejected", message: "관리자가 폐기했습니다." });
    try {
      replace(await rejectTemplateUpload(row.id, body));
    } catch (error) {
      replace(row);
      toast({
        title: "폐기하지 못했습니다.",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const pending = rows.filter((row) => row.status === "pending_review").length;

  return (
    <Card>
      <CardHeader className="space-y-0">
        <CardTitle className="text-base">심플어벗 템플릿 검토 {pending > 0 ? `(${pending})` : ""}</CardTitle>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          기공소가 올린 .dcm은 아직 열지 않은 상태로 보관 중입니다.
          <br />
          열어 보기를 누르면 악성코드 검사를 거쳐 형상을 확인하고 등록합니다.
          <br />
          폐기하면 원본을 바로 지웁니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {loading && rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">불러오는 중입니다.</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">검토할 템플릿이 없습니다.</p>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="rounded-md border px-2.5 py-2 text-xs">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {row.fileName}
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      {formatMb(row.size)} · {row.kind} {row.diameter}
                      {row.height}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {row.uploader.businessName || "사업자 없음"} · {row.uploader.name || "이름 없음"}
                    {row.uploader.email ? ` (${row.uploader.email})` : ""} · {formatKstDateTimeToKo(row.createdAt)}
                  </p>
                </div>
                {row.status === "pending_review" ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      disabled={busyId === row.id}
                      onClick={() => void approve(row)}
                    >
                      열어 보기
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[11px] text-destructive"
                      disabled={busyId === row.id}
                      onClick={() =>
                        setRejecting(rejecting?.id === row.id ? null : { id: row.id, reason: "", malicious: false })
                      }
                    >
                      폐기
                    </Button>
                  </div>
                ) : (
                  <span className={cn("shrink-0 text-[11px]", templateUploadTone(row))}>
                    {templateUploadStatusText(row)}
                    {row.markedMalicious ? " · 업로더 차단" : ""}
                  </span>
                )}
              </div>
              {rejecting?.id === row.id ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded bg-muted/40 p-2">
                  <Input
                    value={rejecting.reason}
                    onChange={(event) => setRejecting({ ...rejecting, reason: event.target.value })}
                    placeholder="폐기 사유(선택)"
                    maxLength={300}
                    className="h-7 min-w-[12rem] flex-1 text-xs"
                  />
                  <label className="flex items-center gap-1 text-[11px]">
                    <input
                      type="checkbox"
                      checked={rejecting.malicious}
                      onChange={(event) => setRejecting({ ...rejecting, malicious: event.target.checked })}
                    />
                    악성으로 표시(올린 사용자 업로드 차단)
                  </label>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => void reject()}
                  >
                    폐기 확인
                  </Button>
                </div>
              ) : null}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

/** 관리자: 악성 파일 업로드로 막힌 사용자. GuardDuty 위협·관리자 악성 폐기에서 추가된다. */
function AdminUploadBlocklistCard() {
  const { toast } = useToast();
  const [rows, setRows] = useState<UploadBlockRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchUploadBlocklist()
      .then((next) => {
        if (!cancelled) setRows(next);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const unblock = async (row: UploadBlockRow) => {
    if (!window.confirm(`${row.userName || row.userEmail || "이 사용자"}의 업로드 차단을 풀까요?`)) return;
    setRows((prev) => prev.filter((item) => item.id !== row.id));
    try {
      await unblockUploader(row.id);
    } catch (error) {
      setRows((prev) => [row, ...prev]);
      toast({
        title: "차단을 풀지 못했습니다.",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-0">
        <CardTitle className="text-base">업로드 차단 목록</CardTitle>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          악성코드가 발견됐거나 관리자가 악성으로 폐기한 파일을 올린 사용자입니다.
          <br />
          이 사용자와 같은 사업자는 스캔바디 라이브러리·템플릿을 올릴 수 없습니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {!loaded ? (
          <p className="text-xs text-muted-foreground">불러오는 중입니다.</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">차단된 사용자가 없습니다.</p>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="flex items-start justify-between gap-2 rounded-md border px-2.5 py-2 text-xs">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {row.userName || "이름 없음"}
                  {row.userEmail ? ` (${row.userEmail})` : ""}
                  {row.businessName ? ` · ${row.businessName}` : ""}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {row.source === "guardduty" ? "GuardDuty" : `관리자${row.createdByName ? ` ${row.createdByName}` : ""}`}
                  {row.fileName ? ` · ${row.fileName}` : ""} · {formatKstDateTimeToKo(row.createdAt)}
                  {row.reason ? ` · ${row.reason}` : ""}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 shrink-0 px-2 text-[11px]"
                onClick={() => void unblock(row)}
              >
                차단 해제
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
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
  const [templateKind, setTemplateKind] = useState<TemplateKind>(TEMPLATE_KINDS[0]);
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
        throw new Error("올릴 라이브러리가 없습니다. .dme, .zip, .dcm, .stl, .stp 파일을 골라 주세요.");
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
  const replaceTemplateUploads = (rows: AbutmentTemplateUploadRow[]) =>
    setCatalog((prev) => {
      const byId = new Map(rows.map((row) => [row.id, row]));
      const kept = prev.templateUploads.map((row) => byId.get(row.id) ?? row);
      const added = rows.filter((row) => !prev.templateUploads.some((item) => item.id === row.id));
      return { ...prev, templateUploads: [...added, ...kept] };
    });

  usePollActive(catalog.templateUploads, fetchTemplateUploads, replaceTemplateUploads, reload);

  const onTemplateFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setBusy("template");
    const failed: string[] = [];
    let queued = 0;
    for (const file of files) {
      const spec = parseTemplateFileName(file.name);
      if (!spec) {
        failed.push(`${file.name}: 이름에서 직경을 읽지 못했습니다.`);
        continue;
      }
      try {
        const row = await uploadAbutmentTemplate(file, { kind: templateKind, ...spec });
        replaceTemplateUploads([row]);
        if (row.status === "done") reload();
        else if (isTemplateUploadActive(row.status)) queued += 1;
      } catch (error) {
        failed.push(`${file.name}: ${error instanceof Error ? error.message : "실패"}`);
      }
    }
    setBusy(null);
    if (queued > 0) {
      toast({
        title: `템플릿 ${queued}개를 올렸습니다.`,
        description: (
          <>
            악성코드 검사가 끝나면 바로 등록됩니다.
            <br />
            그 전에는 AI 디자인에 쓰지 않습니다.
          </>
        ),
      });
    }
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
      const saved = await updateScanbodyKit(lib.id, kitId, catalogIds);
      if (saved.id === lib.id) {
        replaceLibrary(saved);
      } else {
        // 공용 라이브러리를 고쳐 우리 기공소 사본이 생겼다. 목록에서 원본 대신 사본을 보인다.
        setCatalog((prev) => ({
          ...prev,
          libraries: [...prev.libraries.filter((row) => row.id !== lib.id && row.id !== saved.id), saved],
        }));
        setExpanded((prev) => new Set(prev).add(saved.id));
        toast({
          title: "우리 기공소 사본에 저장했습니다.",
          description: (
            <>
              공용 라이브러리는 다른 기공소도 써서 그대로 둡니다.
              <br />
              사본을 지우면 공용 라이브러리로 돌아갑니다.
            </>
          ),
        });
      }
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

  const updateFork = async (lib: ScanbodyLibraryRow) => {
    try {
      replaceLibrary(await rebaseScanbodyLibrary(lib.id));
      toast({ title: `${lib.systemName} 라이브러리를 업데이트했습니다.` });
    } catch (error) {
      toast({
        title: "라이브러리를 업데이트하지 못했습니다.",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  };

  const removeLibrary = async (lib: ScanbodyLibraryRow, confirmed = false) => {
    if (!confirmed && !window.confirm(`${lib.systemName} 라이브러리를 지울까요?`)) return;
    setCatalog((prev) => ({ ...prev, libraries: prev.libraries.filter((row) => row.id !== lib.id) }));
    try {
      await deleteScanbodyLibrary(lib.id);
      if (lib.forkOf) reload();
    } catch (error) {
      setCatalog((prev) => ({ ...prev, libraries: [...prev.libraries, lib] }));
      toast({
        title: "라이브러리를 지우지 못했습니다.",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  };

  const toggleTemplatePublic = async (row: AbutmentTemplateRow) => {
    replaceTemplate({ ...row, isPublic: !row.isPublic });
    try {
      replaceTemplate(await setAbutmentTemplatePublic(row.id, !row.isPublic));
    } catch (error) {
      replaceTemplate(row);
      toast({
        title: "공용 설정을 바꾸지 못했습니다.",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  };

  const removeTemplate = async (row: AbutmentTemplateRow) => {
    setCatalog((prev) => ({ ...prev, templates: prev.templates.filter((t) => t.id !== row.id) }));
    try {
      await deleteAbutmentTemplate(row.id);
      if (row.forkOf) reload();
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
      const blob = [
        lib.systemName,
        lib.ownerName,
        lib.implantManufacturer,
        lib.brand,
        lib.implantType,
        ...(lib.manufacturers ?? []),
        ...lib.kits.flatMap((kit) => [kit.name, kit.spec, kit.code]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [catalog.libraries, query, isAdmin, adminFilter]);

  const groups = useMemo(() => groupRegisteredLibraries(filtered), [filtered]);

  const templatesByKind = TEMPLATE_KINDS.map((kind) => ({
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
      {isAdmin ? null : <ScanbodyLibraryUpdatePrompt libraries={catalog.libraries} onUpdated={replaceLibrary} />}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">스캔바디 라이브러리</CardTitle>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              3Shape .dme, exocad 폴더(또는 .zip), 스캔바디 형상(.dcm·.stl·.stp)을 올립니다.
              <br />
              파일에 들어 있는 임플란트와 규격을 모두 등록합니다.
              <br />
              제조사·임플란트 브랜드·타입이 있으면 같이 남기고, 규격만 다른 코드는 한 묶음으로 보입니다.
              <br />
              악성코드 검사와 형상 검증을 거친 뒤 등록됩니다.
              <br />
              {isAdmin ? (
                <>
                  관리자가 올린 라이브러리는 어벗츠 공용입니다.
                  <br />
                  기공소 라이브러리도 검사를 통과하면 바로 공용이 됩니다.
                  <br />
                  문제가 있으면 공용에서 내리세요.
                </>
              ) : (
                <>
                  검사를 통과한 라이브러리는 바로 모든 기공소가 씁니다.
                  <br />
                  공용 라이브러리의 임플란트 연결을 고치면 우리 기공소 사본에만 저장됩니다.
                  <br />
                  다른 기공소가 쓰는 공용 원본은 바뀌지 않습니다.
                </>
              )}
            </p>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".dme,.zip,.dcm,.stl,.stp,.step"
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
              placeholder="제조사·브랜드·타입·규격으로 찾기"
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
                <option value="review">공용에서 내린 것</option>
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
              {groups.slice(0, limit).map((group) => {
                const head = group.libs[0]!;
                const open = expanded.has(group.key);
                const kitCount = group.libs.reduce((sum, row) => sum + row.kits.length, 0);
                const partCount = group.libs.reduce((sum, row) => sum + row.parts.length, 0);
                const unlinked = group.libs.reduce(
                  (sum, row) => sum + row.kits.filter((kit) => kit.catalogIds.length === 0).length,
                  0,
                );
                const specs = [
                  ...new Set(
                    group.libs.flatMap((row) =>
                      row.kits.map(
                        (kit) =>
                          kit.spec?.trim() ||
                          splitScanbodyCode(kit.name).spec ||
                          splitScanbodyCode(row.systemName).spec ||
                          kit.name,
                      ),
                    ),
                  ),
                ].filter(Boolean);
                const partName = new Map(group.libs.flatMap((row) => row.parts.map((part) => [part.partId, part.name] as const)));
                const source = head.source;
                const versions = [...new Set(group.libs.flatMap((row) => row.containerVersions))].filter(Boolean);
                const meta =
                  group.manufacturer || group.brand
                    ? [group.manufacturer && `제조사 ${group.manufacturer}`, group.brand && `브랜드 ${group.brand}`, group.implantType && `타입 ${group.implantType}`]
                        .filter(Boolean)
                        .join(" · ")
                    : "";
                return (
                  <div key={group.key} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-start gap-1.5 text-left"
                        onClick={() => toggleExpanded(group.key)}
                      >
                        {open ? (
                          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-sm font-semibold">{group.title}</span>
                            <ScopeBadge scope={head.scope} isAdmin={isAdmin} />
                            {head.scope === "lab" && head.isPublic ? (
                              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                                공용
                              </span>
                            ) : null}
                            {head.forkOf ? (
                              <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
                                공용 사본
                              </span>
                            ) : null}
                            {group.libs.some((row) => row.forkBehind) ? (
                              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                                새 공용 있음
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            {source === "exocad" ? "exocad" : source === "scan" ? "형상 파일" : source === "generated" ? "어벗츠 생성" : `3Shape ${versions.join(", ")}`.trim()}
                            {specs.length > 0 ? ` · ${specs.slice(0, 8).join(" · ")}${specs.length > 8 ? ` 외 ${specs.length - 8}` : ""}` : ""}
                            {" · "}키트 {kitCount}개 · 스캔바디 {partCount}개
                            {unlinked > 0 ? ` · 임플란트 미연결 ${unlinked}개` : ""}
                            {meta ? ` · ${meta}` : ""}
                            {isAdmin && head.ownerName ? ` · ${head.ownerName}` : ""}
                          </span>
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-1">
                        {isAdmin && head.scope === "lab" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => {
                              for (const row of group.libs) void togglePublic(row);
                            }}
                          >
                            {group.libs.every((row) => row.isPublic) ? "공용에서 내리기" : "공용으로 올리기"}
                          </Button>
                        ) : null}
                        {group.libs.some((row) => row.forkBehind && row.canEdit) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => {
                              for (const row of group.libs) if (row.forkBehind && row.canEdit) void updateFork(row);
                            }}
                          >
                            업데이트
                          </Button>
                        ) : null}
                        {group.libs.some((row) => row.canEdit) ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            aria-label="라이브러리 지우기"
                            onClick={() => {
                              if (group.libs.length === 1) {
                                const only = group.libs[0];
                                if (!only) return;
                                if (!window.confirm(`${group.title} 라이브러리를 지울까요?`)) return;
                                void removeLibrary(only, true);
                                return;
                              }
                              if (!window.confirm(`${group.title} 묶음 ${group.libs.length}개를 지울까요?`)) return;
                              for (const row of group.libs) void removeLibrary(row, true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {open ? (
                      <ul className="mt-2 space-y-1.5">
                        {group.libs.flatMap((lib) => lib.kits.map((kit) => {
                          const picking = pickerFor?.libraryId === lib.id && pickerFor.kitId === kit.kitId;
                          const specLabel =
                            kit.spec?.trim() ||
                            splitScanbodyCode(kit.name).spec ||
                            splitScanbodyCode(lib.systemName).spec;
                          const codeLabel = kit.code || (specLabel && lib.systemName !== specLabel ? lib.systemName : "");
                          return (
                            <li key={`${lib.id}:${kit.kitId}`} className="relative rounded-md bg-muted/40 px-2.5 py-2">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="text-xs font-medium">{specLabel || kit.name}</span>
                                {codeLabel && codeLabel !== specLabel ? (
                                  <span className="text-[11px] text-muted-foreground">{codeLabel}</span>
                                ) : null}
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
                                      {lib.canEdit || lib.canCopyEdit ? (
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
                                {lib.canEdit || lib.canCopyEdit ? (
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
                        }))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
              {groups.length > limit ? (
                <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setLimit((n) => n + PAGE)}>
                  더 보기 ({groups.length - limit}개 남음)
                </Button>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">심플 템플릿</CardTitle>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              3Shape 스캐너로 찍은 심플어벗·심플밀링·심플힐링 .dcm 파일을 올립니다.
              <br />
              파일 이름 6M은 직경 6, 높이 M으로 읽고, 의뢰의 종류·직경·높이로 자동으로 고릅니다.
              <br />
              심플힐링은 스캔바디로, 심플어벗·심플밀링은 직접어벗으로 맞춥니다.
              {isAdmin ? null : (
                <>
                  <br />
                  악성코드 검사를 통과하면 바로 공용으로 등록됩니다.
                </>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <select
              className="h-8 rounded-md border bg-background px-2 text-xs"
              aria-label="템플릿 종류"
              value={templateKind}
              onChange={(event) => setTemplateKind(event.target.value as TemplateKind)}
            >
              {TEMPLATE_KINDS.map((kind) => (
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
          {catalog.templateUploads.length > 0 ? (
            <ul className="space-y-1.5 rounded-lg border bg-muted/30 p-2.5">
              {catalog.templateUploads.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-medium">
                    {row.fileName}
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      {row.kind} {row.diameter}
                      {row.height}
                    </span>
                  </span>
                  <span className={cn("shrink-0 text-[11px]", templateUploadTone(row))}>
                    {templateUploadStatusText(row)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
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
                          {row.scope === "lab" && row.isPublic ? (
                            <span className="ml-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                              공용
                            </span>
                          ) : null}
                          {row.forkOf ? (
                            <span className="ml-1 rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
                              공용 사본
                            </span>
                          ) : null}
                          {isAdmin && row.ownerName ? (
                            <span className="ml-1 text-[11px] text-muted-foreground">{row.ownerName}</span>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap text-right">
                          {isAdmin && row.scope === "lab" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[11px]"
                              onClick={() => void toggleTemplatePublic(row)}
                            >
                              {row.isPublic ? "공용에서 내리기" : "공용으로 올리기"}
                            </Button>
                          ) : null}
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

      {isAdmin ? (
        <>
          <AdminTemplateReviewCard onRegistered={reload} />
          <AdminUploadBlocklistCard />
        </>
      ) : null}
    </div>
  );
}

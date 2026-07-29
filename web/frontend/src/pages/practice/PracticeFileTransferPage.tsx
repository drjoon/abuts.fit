/**
 * 치과병의원(practice) 파일전송 페이지.
 *
 * 목적:
 * - 제출 후 바로 도달하는 홈 화면 제공
 * - 상단: 기간필터 + 요약(좌 2x2) + 최근 의뢰(우)
 * - 하단: 스캔 전송 섹션이 남은 영역을 채움
 *
 * related files:
 * - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
 * - web/frontend/src/features/dashboard/DashboardHome.tsx
 * - web/frontend/src/features/layout/DashboardLayout.tsx
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  UploadCloud,
  ClipboardList,
  Search,
  Trash2,
  ChevronsUpDown,
  Check,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageFileDropZone } from "@/features/requests/components/PageFileDropZone";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { cn } from "@/shared/ui/cn";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import { usePeriodStore } from "@/store/usePeriodStore";
import { useToast } from "@/shared/hooks/use-toast";
import { apiFetch } from "@/shared/api/apiClient";
import { parseFilenameWithRules } from "@/shared/filename/parseFilenameWithRules";
import { useUploadWithProgressToast } from "@/shared/hooks/useUploadWithProgressToast";
import { type TempUploadedFile } from "@/shared/hooks/useS3TempUpload";
import { useAuthStore } from "@/store/useAuthStore";
import {
  PRACTICE_ACCEPTED_HINT,
  getBusinessLabel,
  usePracticeTransferStep1,
} from "@/pages/practice/hooks/usePracticeTransferStep1";

type RecentRequestItem = {
  id: string;
  createdAt: string;
  requestDate: string;
  patientName: string;
  patientKey: string;
  toothNumbers: string[];
  targetLab: string;
  status: string;
  createdAtTs: number;
  transferId: string;
};

type RecentTransferItem = {
  id: string;
  createdAt: string;
  requestDate: string;
  targetLab: string;
  status: string;
  fileCount: number;
  patientCount: number;
  searchBlob: string;
};

const extractLabNameFromMessage = (message: string) => {
  const raw = String(message || "").trim();
  const matched = raw.match(/\[\s*기공소\s*:\s*([^\]]+)\]/);
  return String(matched?.[1] || "").trim();
};

const extractTransferIdFromMessage = (message: string) => {
  const raw = String(message || "").trim();
  const matched = raw.match(/\[\s*전송ID\s*:\s*([^\]]+)\]/i);
  return String(matched?.[1] || "").trim();
};

const makeTransferId = () => {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PTX-${t}-${r}`;
};

const normalizePatientNameKey = (value: string) => {
  const raw = String(value || "").trim();
  if (!raw || raw === "-") return "";

  let normalized = raw;
  try {
    normalized = normalized.normalize("NFC");
  } catch {
    // ignore
  }

  // 파일명 fallback으로 들어온 환자명 끝 치아 suffix(_47_0, -36-1 등) 제거
  const stripped = normalized
    .replace(/\.(stl|ply|obj)$/i, "")
    .replace(/[_\-\s]*#?\d{1,2}(?:[_\-\s]\d+)?$/, "")
    .trim();

  return (stripped || normalized).toLowerCase();
};

const toDateLabel = (value: unknown) => {
  const d = new Date(String(value || ""));
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

const toDayLabel = (value: unknown) => {
  const d = new Date(String(value || ""));
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};

const toStatusLabel = (manufacturerStage: unknown) => {
  const raw = String(manufacturerStage || "").trim();
  if (!raw) return "접수대기";
  if (raw.includes("배송완료") || raw.includes("전달완료")) return "전달완료";
  if (raw.includes("의뢰") || raw.includes("접수") || raw.includes("대기")) return "접수대기";
  return raw;
};

export const PracticeFileTransferPage = () => {
  const navigate = useNavigate();
  const { period, setPeriod } = usePeriodStore();
  const { toast } = useToast();
  const authToken = useAuthStore((s) => s.token);
  const authUser = useAuthStore((s) => s.user);
  const [requestSearchTerm, setRequestSearchTerm] = useState("");
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [recentRequests, setRecentRequests] = useState<RecentRequestItem[]>([]);
  const [recentRequestsLoading, setRecentRequestsLoading] = useState(false);
  const [recentRequestsError, setRecentRequestsError] = useState("");
  const {
    files,
    totalSizeMb,
    selectedLab,
    setSelectedLab,
    requestMemo,
    setRequestMemo,
    labSearch,
    setLabSearch,
    labSearchResults,
    labOpen,
    setLabOpen,
    labSearching,
    recentLabs,
    recentLabsInitialized,
    handleIncomingFiles,
    removeFile,
    clearAllFiles,
    rememberLab,
  } = usePracticeTransferStep1();
  const { uploadFilesWithToast } = useUploadWithProgressToast({ token: authToken });

  const loadRecentRequests = useCallback(async () => {
    if (!authToken) {
      setRecentRequests([]);
      setRecentRequestsError("로그인이 필요합니다.");
      return;
    }

    setRecentRequestsLoading(true);
    setRecentRequestsError("");
    try {
      const res = await apiFetch<unknown>({
        path: "/api/requests/my?page=1&limit=100",
        method: "GET",
        token: authToken,
      });

      if (!res.ok) {
        const body =
          res.data && typeof res.data === "object"
            ? (res.data as { message?: string })
            : {};
        setRecentRequests([]);
        setRecentRequestsError(
          String(body.message || "최근 전송 내역을 불러올 권한이 없습니다."),
        );
        return;
      }

      const body = res.data;
      const data =
        body && typeof body === "object" && "data" in (body as Record<string, unknown>)
          ? (body as { data?: unknown }).data
          : body;
      const list =
        data &&
        typeof data === "object" &&
        Array.isArray((data as { requests?: unknown }).requests)
          ? ((data as { requests: unknown[] }).requests ?? [])
          : [];

      const mapped: RecentRequestItem[] = list
        .map((raw) => {
          const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
          const ci =
            r.caseInfos && typeof r.caseInfos === "object"
              ? (r.caseInfos as Record<string, unknown>)
              : {};
          const newSystemRequest =
            ci.newSystemRequest && typeof ci.newSystemRequest === "object"
              ? (ci.newSystemRequest as Record<string, unknown>)
              : {};

          const message = String(newSystemRequest.message || r.description || "").trim();
          const targetLab = extractLabNameFromMessage(message);
          const toothRaw = String(ci.tooth || "").trim();
          const createdAtRaw = String(r.createdAt || "");

          const patientName = String(ci.patientName || "").trim() || "-";
          return {
            id: String(r.requestId || r._id || "").trim(),
            createdAt: toDateLabel(createdAtRaw),
            requestDate: toDayLabel(createdAtRaw),
            patientName,
            patientKey: normalizePatientNameKey(patientName),
            toothNumbers: toothRaw ? [toothRaw] : [],
            targetLab: targetLab || "-",
            status: toStatusLabel(r.manufacturerStage),
            createdAtTs: new Date(createdAtRaw).getTime(),
            transferId: extractTransferIdFromMessage(message),
          };
        })
        .filter((item) => Boolean(item.id))
        .sort((a, b) => (b.createdAtTs || 0) - (a.createdAtTs || 0));

      setRecentRequests(mapped);
    } catch {
      setRecentRequests([]);
      setRecentRequestsError("최근 전송 내역 조회 중 오류가 발생했습니다.");
    } finally {
      setRecentRequestsLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    void loadRecentRequests();
  }, [loadRecentRequests]);

  const filteredRecentRequests = useMemo(() => {
    const query = requestSearchTerm.trim().toLowerCase();

    const periodFiltered = recentRequests.filter((request) => {
      if (!request.requestDate || request.requestDate === "-") return false;

      const createdTs = Number(request.createdAtTs || 0);
      if (!Number.isFinite(createdTs) || createdTs <= 0) return true;
      const created = new Date(createdTs);

      const now = new Date();
      const dayMs = 24 * 60 * 60 * 1000;
      const diffDays = (now.getTime() - createdTs) / dayMs;

      if (period === "7d") return diffDays <= 7;
      if (period === "30d") return diffDays <= 30;
      if (period === "90d") return diffDays <= 90;

      const y = now.getFullYear();
      const m = now.getMonth();
      const startThisMonth = new Date(y, m, 1, 0, 0, 0, 0);
      const startNextMonth = new Date(y, m + 1, 1, 0, 0, 0, 0);
      const startLastMonth = new Date(y, m - 1, 1, 0, 0, 0, 0);

      if (period === "thisMonth") {
        return created >= startThisMonth && created < startNextMonth;
      }

      return created >= startLastMonth && created < startThisMonth;
    });

    if (!query) return periodFiltered;

    return periodFiltered.filter((request) => {
      const searchableText = [
        request.id,
        request.createdAt,
        request.requestDate,
        request.patientName,
        request.toothNumbers.join(" "),
        request.targetLab,
        request.status,
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [recentRequests, requestSearchTerm, period]);

  const groupedTransfers = useMemo(() => {
    const byKey = new Map<string, RecentTransferItem & { _statuses: Set<string>; _patients: Set<string> }>();

    for (const req of filteredRecentRequests) {
      const minuteBucket = Math.floor(Number(req.createdAtTs || 0) / (60 * 1000));
      const fallbackKey = `${minuteBucket}|${String(req.targetLab || "-")}`;
      const key = req.transferId || fallbackKey;

      const patientKey = String(req.patientKey || "").trim();
      const existing = byKey.get(key);
      if (!existing) {
        const initialPatients = new Set<string>();
        if (patientKey) initialPatients.add(patientKey);

        byKey.set(key, {
          id: req.id,
          createdAt: req.createdAt,
          requestDate: req.requestDate,
          targetLab: req.targetLab,
          status: req.status,
          fileCount: 1,
          patientCount: Math.max(1, initialPatients.size),
          searchBlob: [req.id, req.createdAt, req.requestDate, req.patientName, req.toothNumbers.join(" "), req.targetLab, req.status]
            .join(" ")
            .toLowerCase(),
          _statuses: new Set([req.status]),
          _patients: initialPatients,
        });
        continue;
      }

      existing.fileCount += 1;
      if (patientKey) {
        existing._patients.add(patientKey);
      }
      existing.patientCount = Math.max(1, existing._patients.size);
      existing._statuses.add(req.status);
      existing.searchBlob = `${existing.searchBlob} ${[req.patientName, req.toothNumbers.join(" "), req.id].join(" ")}`.toLowerCase();

      const statusSet = existing._statuses;
      if (statusSet.size === 1) {
        existing.status = [...statusSet][0] || existing.status;
      } else if (statusSet.has("접수대기")) {
        existing.status = "접수대기";
      } else if (statusSet.has("전달완료")) {
        existing.status = "검토중";
      } else {
        existing.status = "검토중";
      }
    }

    return [...byKey.values()].map(({ _statuses: _s, _patients: _p, ...row }) => row);
  }, [filteredRecentRequests]);

  const statusCounts = useMemo(() => {
    return groupedTransfers.reduce(
      (acc, request) => {
        const status = String(request.status || "").trim();
        if (status === "전달완료") {
          acc.delivered += 1;
        } else if (status === "접수대기") {
          acc.waiting += 1;
        } else {
          acc.sent += 1;
        }
        return acc;
      },
      { sent: 0, waiting: 0, delivered: 0 },
    );
  }, [groupedTransfers]);

  const extractDataFromResponse = <T,>(raw: unknown): T | null => {
    if (!raw || typeof raw !== "object") return null;
    const payload = raw as { data?: unknown };
    if (payload.data === undefined) return raw as T;
    return payload.data as T;
  };

  const asApiMessagePayload = (value: unknown) => {
    if (!value || typeof value !== "object") return {} as { message?: string };
    return value as { message?: string };
  };

  const handleSubmitPracticeRequest = async () => {
    if (requestSubmitting) return;

    if (!authToken) {
      toast({
        title: "로그인이 필요합니다",
        description: "다시 로그인 후 시도해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (!files.length) {
      toast({
        title: "파일이 필요합니다",
        description: "최소 1개 STL 파일을 업로드해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedLab?._id) {
      toast({
        title: "기공소를 선택해주세요",
        variant: "destructive",
      });
      return;
    }

    if (!String(requestMemo || "").trim()) {
      toast({
        title: "의뢰 메모를 입력해주세요",
        variant: "destructive",
      });
      return;
    }

    setRequestSubmitting(true);
    try {
      const createDraftRes = await apiFetch<unknown>({
        path: "/api/requests/drafts",
        method: "POST",
        token: authToken,
        jsonBody: { caseInfos: [] },
      });
      if (!createDraftRes.ok) {
        throw new Error("드래프트 생성에 실패했습니다.");
      }

      const createdDraft = extractDataFromResponse<{ _id?: string }>(
        createDraftRes.data,
      );
      const draftId = String(createdDraft?._id || "").trim();
      if (!draftId) throw new Error("draftId를 받지 못했습니다.");

      const uploadedTempFiles: TempUploadedFile[] = await uploadFilesWithToast(files);

      const clinicName = String(
        (authUser as { business?: string } | null)?.business || authUser?.name || "",
      ).trim();
      const transferId = makeTransferId();
      const transferMemo = String(requestMemo || "").trim();
      const caseInfosPayload = files.map((file, index) => {
        const tempFile = uploadedTempFiles[index];
        const parsed = parseFilenameWithRules(file.name);
        const dotIndex = file.name.lastIndexOf(".");
        const baseName = dotIndex > 0 ? file.name.slice(0, dotIndex) : file.name;
        const fallbackPatientName = String(baseName || `케이스 ${index + 1}`).trim();
        const patientName = String(parsed.patientName || fallbackPatientName).trim();
        const tooth = String(parsed.tooth || "").trim();

        return {
          clinicName,
          patientName,
          tooth,
          workType: "abutment",
          designSoftware: "3Shape",
          file: {
            originalName: tempFile.originalName,
            size: tempFile.size,
            mimetype: tempFile.mimetype,
            s3Key: tempFile.key,
          },
          newSystemRequest: {
            requested: true,
            manufacturer: "",
            brand: "",
            family: "",
            message: `[기공소: ${String(selectedLab?.name || "")}] ${transferMemo}\n[전송ID: ${transferId}]`,
            free: true,
            tag: "practice_file_transfer",
          },
        };
      });

      const patchDraftRes = await apiFetch<unknown>({
        path: `/api/requests/drafts/${encodeURIComponent(draftId)}`,
        method: "PATCH",
        token: authToken,
        jsonBody: { caseInfos: caseInfosPayload },
      });
      if (!patchDraftRes.ok) {
        const body = asApiMessagePayload(patchDraftRes.data);
        throw new Error(String(body?.message || "드래프트 저장에 실패했습니다."));
      }

      const submitRes = await apiFetch<unknown>({
        path: "/api/requests/from-draft",
        method: "POST",
        token: authToken,
        jsonBody: { draftId },
      });
      if (!submitRes.ok) {
        const body = asApiMessagePayload(submitRes.data);
        throw new Error(String(body?.message || "의뢰 제출에 실패했습니다."));
      }

      rememberLab(selectedLab);
      await clearAllFiles();
      setRequestMemo("");

      toast({
        title: "의뢰 제출 완료",
        description: "의뢰가 정상 접수되었습니다.",
      });
      navigate("/practice/dashboard");
    } catch (error) {
      toast({
        title: "의뢰 제출 실패",
        description:
          error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.",
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setRequestSubmitting(false);
    }
  };

  return (
    <PageFileDropZone
      onFiles={handleIncomingFiles}
      activeClassName="ring-2 ring-primary/30"
      className="h-full min-h-0"
    >
      <div className="h-full min-h-0 p-3 space-y-3">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UploadCloud className="h-4 w-4 text-blue-600" />
                구강 스캔 전송
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="space-y-3">
                  <div className="rounded-xl border border-dashed bg-background p-4 text-center">
                    <p className="text-base font-semibold">파일을 드래그 & 드롭하세요</p>
                    <p className="mt-1 text-sm text-muted-foreground">{PRACTICE_ACCEPTED_HINT}</p>
                    <p className="text-sm text-muted-foreground">또는 아래 버튼으로 파일 선택</p>
                    <div className="mt-3">
                      <input
                        id="practice-file-transfer-input"
                        type="file"
                        className="hidden"
                        multiple
                        onChange={(e) => {
                          const nextFiles = Array.from(e.target.files || []);
                          if (nextFiles.length) handleIncomingFiles(nextFiles);
                          e.currentTarget.value = "";
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          const input = document.getElementById(
                            "practice-file-transfer-input",
                          ) as HTMLInputElement | null;
                          input?.click();
                        }}
                      >
                        파일 선택
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-xl border bg-background p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-base font-semibold">
                        총 {files.length}개 파일 · 약 {totalSizeMb}MB
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => void clearAllFiles()}
                        disabled={files.length === 0}
                      >
                        전체삭제
                      </Button>
                    </div>
                    {files.length === 0 ? (
                      <div className="mt-3 rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                        아직 추가된 파일이 없습니다.
                      </div>
                    ) : (
                      <div className="mt-3 max-h-[18.5rem] overflow-y-auto pr-1">
                        <div className="grid grid-cols-1 gap-2 auto-rows-[4.25rem]">
                          {files.map((file, index) => (
                            <div
                              key={`${file.name}:${file.size}:${file.lastModified}:${index}`}
                              className="flex h-[4.25rem] items-center justify-between rounded-md border px-2.5 py-2"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-base font-medium">{file.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {(file.size / (1024 * 1024)).toFixed(2)}MB
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9"
                                onClick={() => removeFile(index)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border bg-background p-4">
                  <p className="text-base font-semibold">기공소 정보 & 의뢰 메모</p>

                  <div className="mt-3 space-y-2">
                    <Label className="text-sm">기공소 선택</Label>
                    <Popover open={labOpen} onOpenChange={setLabOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          aria-expanded={labOpen}
                          className="h-11 w-full justify-between text-base"
                        >
                          <span className="truncate">
                            {selectedLab
                              ? getBusinessLabel(selectedLab)
                              : "기공소를 검색해서 선택하세요"}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[420px] p-0" align="start">
                        <Command>
                          <CommandInput
                            placeholder="기공소 검색 (사업자명/대표자명/사업자번호/주소)"
                            value={labSearch}
                            onValueChange={(v) => {
                              setLabSearch(v);
                            }}
                          />
                          <CommandList>
                            {!recentLabsInitialized ? (
                              <div className="px-3 py-2 text-sm text-muted-foreground">불러오는 중...</div>
                            ) : null}

                            {recentLabs.length > 0 ? (
                              <CommandGroup heading="최근 전송한 기공소">
                                {recentLabs.map((b) => {
                                  const selected = selectedLab?._id === b._id;
                                  const rep = String(b.representativeName || "").trim();
                                  const bn = String(b.businessNumber || "").trim();
                                  const addr = String(b.address || "").trim();
                                  const meta = [
                                    rep ? `대표: ${rep}` : "",
                                    bn ? `사업자: ${bn}` : "",
                                    addr || "",
                                  ]
                                    .filter(Boolean)
                                    .join(" · ");
                                  const searchValue = [b.name, rep, bn, addr]
                                    .filter(Boolean)
                                    .join(" ");

                                  return (
                                    <CommandItem
                                      key={`recent-${b._id}`}
                                      value={searchValue}
                                      onSelect={() => {
                                        setSelectedLab(b);
                                        setLabOpen(false);
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          selected ? "opacity-100" : "opacity-0",
                                        )}
                                      />
                                      <div className="min-w-0">
                                        <div className="truncate text-base font-medium">
                                          {getBusinessLabel(b)}
                                        </div>
                                        {meta ? (
                                          <div className="truncate text-sm text-muted-foreground">
                                            {meta}
                                          </div>
                                        ) : null}
                                      </div>
                                    </CommandItem>
                                  );
                                })}
                              </CommandGroup>
                            ) : (
                              <div className="px-3 py-2 text-sm text-muted-foreground">
                                최근 전송한 기공소가 없습니다.
                              </div>
                            )}

                            <CommandSeparator />

                            <CommandGroup heading="기공소 검색">
                              {labSearching ? (
                                <div className="px-3 py-2 text-sm text-muted-foreground">검색 중...</div>
                              ) : labSearch.trim() ? (
                                labSearchResults.length > 0 ? (
                                  labSearchResults.map((b) => {
                                    const selected = selectedLab?._id === b._id;
                                    const rep = String(b.representativeName || "").trim();
                                    const bn = String(b.businessNumber || "").trim();
                                    const addr = String(b.address || "").trim();
                                    const meta = [
                                      rep ? `대표: ${rep}` : "",
                                      bn ? `사업자: ${bn}` : "",
                                      addr || "",
                                    ]
                                      .filter(Boolean)
                                      .join(" · ");
                                    const searchValue = [b.name, rep, bn, addr]
                                      .filter(Boolean)
                                      .join(" ");

                                    return (
                                      <CommandItem
                                        key={b._id}
                                        value={searchValue}
                                        onSelect={() => {
                                          setSelectedLab(b);
                                          setLabOpen(false);
                                        }}
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            selected ? "opacity-100" : "opacity-0",
                                          )}
                                        />
                                        <div className="min-w-0">
                                          <div className="truncate text-base font-medium">
                                            {getBusinessLabel(b)}
                                          </div>
                                          {meta ? (
                                            <div className="truncate text-sm text-muted-foreground">
                                              {meta}
                                            </div>
                                          ) : null}
                                        </div>
                                      </CommandItem>
                                    );
                                  })
                                ) : (
                                  <div className="px-3 py-2 text-sm text-muted-foreground">
                                    검색 결과가 없습니다.
                                  </div>
                                )
                              ) : (
                                <div className="px-3 py-2 text-sm text-muted-foreground">
                                  검색어를 입력하면 기공소를 찾을 수 있습니다.
                                </div>
                              )}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="mt-3 space-y-2">
                    <Label htmlFor="practice-file-transfer-request-memo" className="text-sm">
                      의뢰 메모
                    </Label>
                    <Textarea
                      id="practice-file-transfer-request-memo"
                      value={requestMemo}
                      onChange={(e) => setRequestMemo(e.target.value)}
                      placeholder="예: #36 커스텀 어버트먼트, 마진 라인 메모..."
                      className="min-h-36 text-base"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end">
                <Button
                  type="button"
                  className="bg-blue-600 text-white hover:bg-blue-700"
                  onClick={() => void handleSubmitPracticeRequest()}
                  disabled={requestSubmitting}
                >
                  {requestSubmitting ? "의뢰 보내는 중..." : "의뢰 보내기"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4 text-blue-600" />
              최근 전송 내역
            </CardTitle>
            <CardDescription className="space-y-2">
              <div className="flex items-center justify-start">
                <PeriodFilter value={period} onChange={setPeriod} />
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">발송 {statusCounts.sent}건</Badge>
                <Badge variant="outline">전달대기 {statusCounts.waiting}건</Badge>
                <Badge variant="outline">전달 완료 {statusCounts.delivered}건</Badge>
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="의뢰일/환자명/치아번호/기공소/의뢰번호 검색"
                  className="h-9 pl-9"
                  value={requestSearchTerm}
                  onChange={(event) => setRequestSearchTerm(event.target.value)}
                />
              </div>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentRequestsLoading ? (
              <div className="rounded-lg border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
                최근 전송 내역을 불러오는 중입니다...
              </div>
            ) : recentRequestsError ? (
              <div className="rounded-lg border border-dashed px-3 py-8 text-center text-sm text-destructive">
                {recentRequestsError}
              </div>
            ) : groupedTransfers.length === 0 ? (
              <div className="rounded-lg border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
                검색 조건에 맞는 의뢰 내역이 없습니다.
              </div>
            ) : (
              groupedTransfers.map((transfer) => (
                <div
                  key={`${transfer.id}:${transfer.createdAt}`}
                  className="rounded-lg border px-3 py-2 text-sm flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{transfer.id}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {transfer.createdAt} · {transfer.targetLab}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      파일 {transfer.fileCount}개 · 환자 {transfer.patientCount}명
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 whitespace-nowrap">{transfer.status}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        </div>
      </div>
    </PageFileDropZone>
  );
};

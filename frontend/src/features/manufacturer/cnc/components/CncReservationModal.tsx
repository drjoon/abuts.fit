import { useEffect, useMemo, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { MultiActionDialog } from "@/components/MultiActionDialog";
import { FunctionalItemCard } from "@/components/FunctionalItemCard";
import { CncFileCard } from "./CncFileCard";
import { CncBridgePanel } from "./CncBridgePanel";
import { parseProgramNoFromName } from "../lib/programNaming";
import type { Machine } from "@/features/manufacturer/cnc/types";
import { useBridgeStore } from "@/features/manufacturer/cnc/hooks/useBridgeStore";
import { useCncRaw } from "@/features/manufacturer/cnc/hooks/useCncRaw";
import { useToast } from "@/hooks/use-toast";

type CncReservationMode = "immediate" | "reserved";

export interface CncJobItem {
  id: string;
  source: "machine" | "bridge" | "upload";
  programNo: number | string | null;
  name: string;
  qty: number;
  paused?: boolean;
}

export interface CncReservationConfig {
  mode: CncReservationMode;
  jobs: CncJobItem[];
  scheduledAt?: string;
}

const formatFileSize = (bytes?: number): string => {
  if (typeof bytes !== "number" || Number.isNaN(bytes) || bytes < 0) {
    return "-";
  }
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
};

interface CncReservationModalProps {
  open: boolean;
  machine: Machine | null;
  programList: any[];
  onRequestClose: () => void;
  onConfirm: (config: CncReservationConfig) => void;
  onCancelAll?: (machine: Machine) => void;
  onDeleteProgram?: (programNo: number) => Promise<void> | void;
  onOpenProgramDetail?: (prog: any) => void;
  onDownloadProgram?: (prog: any) => Promise<void> | void;
  initialJobs?: CncJobItem[];
}

export const CncReservationModal = ({
  open,
  machine,
  programList,
  onRequestClose,
  onConfirm,
  onDeleteProgram,
  onOpenProgramDetail,
  onDownloadProgram,
  initialJobs,
}: CncReservationModalProps) => {
  const { callRaw } = useCncRaw();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"machine" | "bridge">("machine");
  const [jobs, setJobs] = useState<CncJobItem[]>([]);
  const [highlightJobId, setHighlightJobId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [bridgeDropping, setBridgeDropping] = useState(false);
  const [mkdirModalOpen, setMkdirModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [overwriteConfirmOpen, setOverwriteConfirmOpen] = useState(false);

  const {
    bridgeEntries,
    bridgePath,
    bridgeLoading,
    bridgeError,
    selectedEntry,
    mkdirName,
    renameName,
    deleteTarget,
    deleteConfirmOpen,
    setSelectedEntry,
    setMkdirName,
    setRenameName,
    setDeleteTarget,
    setDeleteConfirmOpen,
    uploadConflict,
    setUploadConflict,
    namingConflict,
    setNamingConflict,
    loadBridgeEntries,
    handleRenameSelected,
    handleRequestDeleteEntry,
    handleCreateFolder,
    handleUploadFiles,
    performDeleteEntry,
  } = useBridgeStore();

  const pagedPrograms = useMemo(() => {
    if (!Array.isArray(programList) || programList.length === 0) return [];
    return programList;
  }, [programList]);

  const [bridgeSort, setBridgeSort] = useState<"asc" | "desc">("asc");

  const sortedBridgeEntries = useMemo(() => {
    const base = Array.isArray(bridgeEntries) ? [...bridgeEntries] : [];
    base.sort((a, b) => {
      const an = a.name || "";
      const bn = b.name || "";
      const cmp = an.localeCompare(bn, "ko");
      return bridgeSort === "asc" ? cmp : -cmp;
    });
    return base;
  }, [bridgeEntries, bridgeSort]);

  const handleActivateProgram = async (prog: any) => {
    if (!machine?.uid) return;
    const programNo = prog?.programNo ?? prog?.no;
    if (typeof programNo !== "number") return;

    try {
      const res = await callRaw(machine.uid, "UpdateActivateProg", {
        headType: 0,
        programNo,
      });
      const ok = res && res.success !== false && res.result !== -1;
      if (!ok) {
        const msg =
          res?.message ||
          res?.error ||
          "활성화 프로그램 변경 실패 (UpdateActivateProg)";
        toast({
          title: "프로그램 활성화 실패",
          description: msg,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "프로그램 활성화 완료",
        description: `프로그램 #${programNo}가 활성화되었습니다.`,
      });
    } catch (e: any) {
      const msg = e?.message ?? "활성화 프로그램 변경 중 오류";
      toast({
        title: "프로그램 활성화 오류",
        description: msg,
        variant: "destructive",
      });
    }
  };

  const handleAddProgram = (prog: any) => {
    if (!prog) return;

    const programNo = prog.programNo ?? prog.no ?? null;
    const name =
      prog.programName ??
      prog.name ??
      (programNo != null ? `#${programNo}` : "-");

    // 이미 같은 소스/프로그램 번호(또는 이름)가 가공 목록에 있으면 재추가하지 않고 해당 항목을 강조 표시한다.
    const existing = jobs.find((j) => {
      if (j.source !== activeTab) return false;
      const sameNo =
        j.programNo != null && programNo != null
          ? String(j.programNo) === String(programNo)
          : false;
      const sameName = j.name === name;
      return sameNo || sameName;
    });

    if (existing) {
      setHighlightJobId(existing.id);
      return;
    }

    const id = `${activeTab}:${String(programNo ?? name)}:${Date.now()}`;
    setJobs((prev) => [
      ...prev,
      {
        id,
        source: activeTab,
        programNo,
        name,
        qty: 1,
      },
    ]);
  };

  useEffect(() => {
    if (!open) return;
    if (activeTab === "bridge") {
      void loadBridgeEntries(bridgePath || "");
    }
  }, [open, activeTab]);

  // 모달을 열 때, 상위에서 내려온 기존 예약(initialJobs)이 있으면 로드한다.
  useEffect(() => {
    if (!open) return;
    if (Array.isArray(initialJobs) && initialJobs.length > 0) {
      setJobs(initialJobs);
    }
  }, [open, initialJobs]);

  useEffect(() => {
    if (!open) {
      // 모달이 닫힐 때는 항상 로컬 가공 목록을 초기화한다.
      setJobs([]);
      setSelectedEntry(null);
      setMkdirName("");
      setRenameName("");
      setMkdirModalOpen(false);
    }
  }, [open]);

  if (!open) return null;

  const hasBridgeOverwriteConflict = (): boolean => {
    if (!Array.isArray(programList) || programList.length === 0) return false;
    const existingNos = new Set<number>();
    for (const p of programList) {
      const no = p?.programNo ?? p?.no;
      const n = Number(no);
      if (Number.isFinite(n)) {
        existingNos.add(n);
      }
    }

    for (const job of jobs) {
      if (job.source !== "bridge") continue;
      let no: number | null = null;
      if (job.programNo != null) {
        const n = Number(job.programNo);
        no = Number.isFinite(n) ? n : null;
      }
      if (no == null && job.name) {
        no = parseProgramNoFromName(job.name);
      }
      if (no != null && existingNos.has(no)) {
        return true;
      }
    }
    return false;
  };

  const submitReservation = async (strategy: "overwrite" | "auto") => {
    if (!machine?.uid || !jobs.length) {
      onConfirm({ mode: "reserved", jobs });
      return;
    }

    setSubmitting(true);
    try {
      const existingNos = new Set<number>();
      if (Array.isArray(programList)) {
        for (const p of programList) {
          const no = p?.programNo ?? p?.no;
          const n = Number(no);
          if (Number.isFinite(n)) {
            existingNos.add(n);
          }
        }
      }

      const nextFreeNo = () => {
        let n = existingNos.size ? Math.max(...Array.from(existingNos)) + 1 : 1;
        // 안전을 위해 상한을 크게 두지만, 실제로는 수백 개 수준일 것으로 예상
        while (existingNos.has(n) && n < 999999) n += 1;
        existingNos.add(n);
        return n;
      };

      const finalJobs: CncJobItem[] = [];

      for (const job of jobs) {
        let effectiveProgramNo: number | string | null = job.programNo ?? null;

        if (job.source === "bridge") {
          let progNo: number | null = null;
          if (job.programNo != null) {
            const n = Number(job.programNo);
            progNo = Number.isFinite(n) ? n : null;
          }
          if (progNo == null && job.name) {
            progNo = parseProgramNoFromName(job.name);
          }

          if (progNo == null) {
            toast({
              title: "프로그램 번호 추출 실패",
              description: `${job.name} 파일명에서 번호를 찾을 수 없어 CNC 업로드를 건너뜁니다.`,
              variant: "destructive",
            });
            return;
          }

          if (strategy === "auto" && existingNos.has(progNo)) {
            progNo = nextFreeNo();
          } else {
            existingNos.add(progNo);
          }

          effectiveProgramNo = progNo;

          const relPath = bridgePath ? `${bridgePath}/${job.name}` : job.name;

          try {
            const res = await fetch(
              `/api/bridge-store/file?path=${encodeURIComponent(relPath)}`
            );
            if (!res.ok) {
              toast({
                title: "브리지 파일 조회 실패",
                description: `${job.name} 파일을 브리지에서 읽어오지 못했습니다.`,
                variant: "destructive",
              });
              return;
            }
            const body: any = await res.json().catch(() => ({}));
            const content = String(body?.content ?? "");

            const payload = {
              headType: 0,
              programNo: progNo,
              programData: content,
              isNew: true,
            };
            const rawRes = await callRaw(machine.uid, "UpdateProgram", payload);
            const ok = rawRes && rawRes.success !== false;
            if (!ok) {
              const msg =
                rawRes?.message ||
                rawRes?.error ||
                "CNC 프로그램 업로드 실패 (UpdateProgram)";
              toast({
                title: "CNC 업로드 실패",
                description: msg,
                variant: "destructive",
              });
              return;
            }
          } catch (e: any) {
            const msg = e?.message ?? "브리지 → CNC 프로그램 업로드 중 오류";
            toast({
              title: "CNC 업로드 오류",
              description: msg,
              variant: "destructive",
            });
            return;
          }
        }

        finalJobs.push({
          ...job,
          programNo: effectiveProgramNo,
        });
      }

      onConfirm({ mode: "reserved", jobs: finalJobs });
    } finally {
      setSubmitting(false);
      setOverwriteConfirmOpen(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 pt-16 backdrop-blur-sm"
      onClick={onRequestClose}
    >
      <div
        className="bg-white/95 p-6 sm:p-8 rounded-2xl shadow-[0_24px_80px_rgba(15,23,42,0.45)] w-full max-w-5xl transform transition-all border border-slate-100 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 border-b border-slate-100 pb-3 flex items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-baseline gap-2">
              <span>예약하기</span>
              {machine && (
                <span className="text-xs sm:text-sm text-slate-500 font-normal">
                  <span className="font-semibold">{machine.name}</span>
                </span>
              )}
            </h2>
          </div>
          <div className="flex-1 flex justify-center">
            <div className="inline-flex gap-2 text-xs sm:text-sm bg-slate-50 rounded-full px-1 py-1">
              <button
                type="button"
                className={`px-3 py-1.5 rounded-full text-xs sm:text-[13px] font-medium transition-colors ${
                  activeTab === "machine"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-transparent text-slate-600 hover:bg-slate-100"
                }`}
                onClick={() => setActiveTab("machine")}
              >
                CNC 장비
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 rounded-full text-xs sm:text-[13px] font-medium transition-colors ${
                  activeTab === "bridge"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-transparent text-slate-600 hover:bg-slate-100"
                }`}
                onClick={() => setActiveTab("bridge")}
              >
                브리지 서버
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={onRequestClose}
            className="inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-slate-100 text-xl sm:text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6 text-sm text-slate-700">
          {/* 좌측: CNC 장비 프로그램 / 브리지 / 업로드 */}
          <div className="space-y-3">
            {activeTab === "machine" && (
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 overflow-hidden">
                  <div className="max-h-64 overflow-y-auto px-3 py-2">
                    {pagedPrograms.length === 0 ? (
                      <div className="py-4 text-xs text-slate-500">
                        프로그램 목록이 없습니다.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs sm:text-[13px]">
                        {pagedPrograms.map((p, idx) => {
                          const programNo = p.programNo ?? p.no ?? null;
                          const baseName =
                            p.programName ??
                            p.name ??
                            (programNo != null ? String(programNo) : "-");

                          // 카드 표시 텍스트: 항상 `#이름` 한 줄로만 보여준다.
                          const normalizedName = String(baseName).replace(
                            /^#\s*/,
                            ""
                          );
                          const displayName = `#${normalizedName}`;

                          const canDelete =
                            typeof programNo === "number" &&
                            onDeleteProgram &&
                            !!machine?.uid &&
                            machine.allowProgramDelete === true;

                          return (
                            <div
                              key={`${programNo ?? idx}-${programNo ?? idx}`}
                              className="relative group min-w-0"
                            >
                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    try {
                                      await onDeleteProgram(
                                        programNo as number
                                      );
                                    } catch {
                                      // no-op
                                    }
                                  }}
                                  className="absolute top-0.5 right-0.5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-[11px] font-bold text-white shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  ×
                                </button>
                              )}
                              <CncFileCard onClick={() => handleAddProgram(p)}>
                                <div className="w-full flex items-center justify-between gap-2">
                                  <span className="block font-medium truncate flex-1 text-[13px] sm:text-[14px]">
                                    {displayName}
                                  </span>
                                </div>
                                {(onOpenProgramDetail || onDownloadProgram) && (
                                  <div className="mt-2 flex justify-center gap-2 w-full">
                                    {onDownloadProgram && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          void onDownloadProgram(p);
                                        }}
                                        className="inline-flex h-8 px-3 min-w-[80px] items-center justify-center rounded-md border border-slate-200 bg-white text-[11px] text-slate-700 hover:bg-slate-100"
                                        title="프로그램 다운로드"
                                      >
                                        다운로드
                                      </button>
                                    )}
                                    {onOpenProgramDetail && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onOpenProgramDetail(p);
                                        }}
                                        className="inline-flex h-9 px-4 min-w-[72px] items-center justify-center rounded-md border border-slate-200 bg-white text-[11px] text-slate-700 hover:bg-slate-100"
                                        title="프로그램 보기"
                                      >
                                        코드
                                      </button>
                                    )}
                                  </div>
                                )}
                              </CncFileCard>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "bridge" && (
              <div className="space-y-3">
                <CncBridgePanel
                  bridgePath={bridgePath}
                  bridgeSort={bridgeSort}
                  onChangeSort={setBridgeSort}
                  onOpenMkdirModal={() => setMkdirModalOpen(true)}
                  fileInputRef={fileInputRef}
                  onUploadFiles={handleUploadFiles}
                  bridgeDropping={bridgeDropping}
                  onSetBridgeDropping={setBridgeDropping}
                  bridgeLoading={bridgeLoading}
                  bridgeError={bridgeError}
                  bridgeEntries={bridgeEntries}
                  sortedBridgeEntries={sortedBridgeEntries}
                  onNavigateParent={() => {
                    const parts = bridgePath.split("/").filter(Boolean);
                    parts.pop();
                    const parent = parts.join("/");
                    void loadBridgeEntries(parent);
                  }}
                  selectedEntry={selectedEntry}
                  renameName={renameName}
                  onChangeRenameName={setRenameName}
                  onCommitRename={() => {
                    void handleRenameSelected();
                  }}
                  onClickEntry={(entry) => {
                    if (entry.type === "directory") {
                      const nextPath = bridgePath
                        ? `${bridgePath}/${entry.name}`
                        : entry.name;
                      void loadBridgeEntries(nextPath);
                    } else {
                      setSelectedEntry(entry);
                    }
                  }}
                  onDeleteEntry={async (entry) => {
                    await handleRequestDeleteEntry(entry);
                  }}
                  formatFileSize={formatFileSize}
                  onOpenBridgeProgram={
                    onOpenProgramDetail
                      ? async (entry) => {
                          const relPath = bridgePath
                            ? `${bridgePath}/${entry.name}`
                            : entry.name;
                          try {
                            const res = await fetch(
                              `/api/bridge-store/file?path=${encodeURIComponent(
                                relPath
                              )}`
                            );
                            if (!res.ok) return;
                            const body: any = await res
                              .json()
                              .catch(() => ({}));
                            const content = String(body?.content ?? "");

                            const progNo = parseProgramNoFromName(entry.name);

                            const prog: any = {
                              programNo: progNo ?? null,
                              no: progNo ?? null,
                              name: entry.name,
                              headType: 0,
                              programData: content,
                              source: "bridge",
                              bridgePath: relPath,
                            };

                            onOpenProgramDetail(prog);
                          } catch {
                            // no-op
                          }
                        }
                      : undefined
                  }
                />
              </div>
            )}
          </div>

          {/* 우측: 가공 목록 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">
                가공 목록
              </span>
              <button
                type="button"
                onClick={() => setJobs([])}
                className="px-2 py-1 rounded-md border border-slate-200 bg-white text-[11px] font-medium text-slate-600 hover:bg-slate-100"
              >
                전체 삭제
              </button>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/80 min-h-[120px] max-h-64 overflow-y-auto">
              {jobs.length === 0 ? (
                <div className="px-3 py-4 text-xs text-slate-500">
                  프로그램을 선택해 가공 목록에 추가하세요.
                </div>
              ) : (
                <ul className="p-3 grid grid-cols-1 gap-2 text-xs sm:text-[13px]">
                  {jobs.map((job, index) => (
                    <li
                      key={job.id}
                      draggable
                      onDragStart={() => {
                        setDragIndex(index);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (dragIndex === null || dragIndex === index) return;
                        setJobs((prev) => {
                          const next = [...prev];
                          const [moved] = next.splice(dragIndex, 1);
                          next.splice(index, 0, moved);
                          return next;
                        });
                        setDragIndex(index);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragIndex(null);
                      }}
                      onDragEnd={() => setDragIndex(null)}
                      className="group"
                    >
                      <FunctionalItemCard
                        className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors min-h-[56px] ${
                          highlightJobId === job.id
                            ? "border-blue-500 bg-blue-50 ring-1 ring-blue-300"
                            : "border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50/60"
                        }`}
                        onRemove={() =>
                          setJobs((prev) => prev.filter((j) => j.id !== job.id))
                        }
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="font-mono text-[11px] text-slate-500 mb-0.5">
                            {job.programNo != null ? `#${job.programNo}` : ""}
                          </span>
                          <span className="font-medium truncate">
                            {job.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            value={job.qty}
                            onChange={(e) => {
                              const v = Math.max(
                                1,
                                Number(e.target.value) || job.qty || 1
                              );
                              setJobs((prev) =>
                                prev.map((j) =>
                                  j.id === job.id ? { ...j, qty: v } : j
                                )
                              );
                            }}
                            className="w-16 bg-white border border-slate-200 rounded-md px-2 py-1 text-[11px] focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      </FunctionalItemCard>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* 하단 액션 영역 */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-end gap-3">
          <div className="flex gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              disabled={submitting}
              onClick={async () => {
                if (!jobs.length) {
                  onConfirm({ mode: "reserved", jobs });
                  return;
                }

                if (!machine?.uid) {
                  onConfirm({ mode: "reserved", jobs });
                  return;
                }

                if (hasBridgeOverwriteConflict()) {
                  setOverwriteConfirmOpen(true);
                  return;
                }

                await submitReservation("overwrite");
              }}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              가공 예약
            </button>
          </div>
        </div>

        {/* 브리지 새 폴더 모달 (공통 ConfirmDialog 사용) */}
        <ConfirmDialog
          open={mkdirModalOpen}
          title="새 폴더 만들기"
          description={
            <div className="space-y-3 text-sm">
              <div className="text-xs text-slate-500">
                현재 경로: {bridgePath || "/"}
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-slate-600">폴더 이름</label>
                <input
                  autoFocus
                  type="text"
                  value={mkdirName}
                  onChange={(e) => setMkdirName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleCreateFolder();
                    }
                  }}
                  className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[13px] focus:ring-blue-500 focus:border-blue-500"
                  placeholder="예: NEW_DIR"
                />
              </div>
            </div>
          }
          confirmLabel="생성"
          cancelLabel="취소"
          onCancel={() => {
            setMkdirModalOpen(false);
            setMkdirName("");
          }}
          onConfirm={handleCreateFolder}
        />

        {/* 브리지 폴더 삭제 확인 모달 */}
        <ConfirmDialog
          open={deleteConfirmOpen}
          title="폴더 삭제"
          description={
            deleteTarget && (
              <div className="space-y-2 text-sm">
                <div className="text-slate-700">
                  <strong>{deleteTarget.name}</strong> 폴더 안에 하위 파일 또는
                  폴더가 있습니다.
                </div>
                <div className="text-xs text-slate-500">
                  정말 이 폴더와 내부 내용을 모두 삭제하시겠습니까?
                </div>
              </div>
            )
          }
          confirmLabel="완전 삭제"
          cancelLabel="취소"
          onCancel={() => {
            setDeleteConfirmOpen(false);
            setDeleteTarget(null);
          }}
          onConfirm={async () => {
            if (!deleteTarget) return;
            await performDeleteEntry({
              name: deleteTarget.name,
              type: deleteTarget.type,
            });
            setDeleteConfirmOpen(false);
            setDeleteTarget(null);
          }}
        />

        {/* 브리지 파일 업로드 시 이름 충돌 처리 모달 (멀티 액션) */}
        <MultiActionDialog
          open={!!uploadConflict}
          title="브리지 파일 중복"
          description={
            uploadConflict && (
              <div className="space-y-3 text-sm">
                <div className="text-slate-700">
                  <strong>{uploadConflict.name}</strong> 파일이 현재 브리지
                  경로에 이미 존재합니다.
                </div>
                <div className="text-xs text-slate-500">
                  <strong>덮어쓰기</strong> 를 누르면 같은 이름으로 기존 파일을
                  교체하고,
                  <br />
                  <strong>번호 증가</strong> 를 누르면
                  <code className="mx-1">{uploadConflict.suggestedName}</code>
                  처럼 새 이름으로 저장합니다.
                </div>
              </div>
            )
          }
          actions={
            uploadConflict
              ? [
                  {
                    label: "덮어쓰기",
                    variant: "danger",
                    disabled: submitting,
                    onClick: () => {
                      uploadConflict.decide("overwrite");
                      setUploadConflict(null);
                    },
                  },
                  {
                    label: "번호 증가",
                    variant: "secondary",
                    disabled: submitting,
                    onClick: () => {
                      uploadConflict.decide("auto");
                      setUploadConflict(null);
                    },
                  },
                  {
                    label: "취소",
                    variant: "ghost",
                    disabled: submitting,
                    onClick: () => {
                      uploadConflict.decide("cancel");
                      setUploadConflict(null);
                    },
                  },
                ]
              : []
          }
        />

        {/* 브리지 파일 업로드 시 파일명 규칙 확인 모달 (멀티 액션) */}
        <MultiActionDialog
          open={!!namingConflict}
          title="CNC 프로그램 파일명 규칙"
          description={
            namingConflict && (
              <div className="space-y-3 text-sm">
                <div className="text-slate-700">
                  현재 파일명 <strong>{namingConflict.originalName}</strong>{" "}
                  과(와) 프로그램 내용의 O번호에서 추출한 이름이 다릅니다.
                </div>
                <div className="text-xs text-slate-500 space-y-1">
                  <p>
                    권장 형식: <code>O####.nc</code> (예: <code>O3001.nc</code>)
                  </p>
                  <p>
                    추천 파일명: <code>{namingConflict.suggestedName}</code>
                  </p>
                </div>
              </div>
            )
          }
          actions={
            namingConflict
              ? [
                  {
                    label: namingConflict.originalName,
                    variant: "primary",
                    disabled: submitting,
                    onClick: () => {
                      namingConflict.decide("keep");
                      setNamingConflict(null);
                    },
                  },
                  {
                    label: namingConflict.suggestedName,
                    variant: "secondary",
                    disabled: submitting,
                    onClick: () => {
                      namingConflict.decide("suggest");
                      setNamingConflict(null);
                    },
                  },
                  {
                    label: "취소",
                    variant: "ghost",
                    disabled: submitting,
                    onClick: () => {
                      namingConflict.decide("cancel");
                      setNamingConflict(null);
                    },
                  },
                ]
              : []
          }
        />

        {/* 브리지 프로그램 번호 충돌 처리 모달 (멀티 액션) */}
        <MultiActionDialog
          open={overwriteConfirmOpen}
          title="프로그램 번호 중복"
          description={
            <div className="space-y-3 text-sm">
              <div className="text-slate-700">
                브리지에서 가져온 파일 중 일부는 CNC에 이미 존재하는 프로그램
                번호를 사용합니다.
              </div>
              <div className="text-xs text-slate-500">
                <strong>덮어쓰기</strong> 를 누르면 같은 번호로 기존 프로그램을
                교체하고,
                <br />
                <strong>번호 증가</strong> 를 누르면 빈 번호를 찾아 자동으로
                증가시켜 업로드합니다.
              </div>
            </div>
          }
          actions={[
            {
              label: "덮어쓰기",
              variant: "danger",
              disabled: submitting,
              onClick: async () => {
                if (submitting) return;
                await submitReservation("overwrite");
              },
            },
            {
              label: "번호 증가",
              variant: "secondary",
              disabled: submitting,
              onClick: async () => {
                if (submitting) return;
                await submitReservation("auto");
              },
            },
            {
              label: "취소",
              variant: "ghost",
              disabled: submitting,
              onClick: () => {
                if (submitting) return;
                setOverwriteConfirmOpen(false);
              },
            },
          ]}
        />
      </div>
    </div>
  );
};

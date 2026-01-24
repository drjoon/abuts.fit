import { useCallback, useEffect, useRef, useState } from "react";

import { applyProgramNoToContent } from "../lib/programNaming";
import type { Machine } from "@/pages/manufacturer/cnc/types";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/apiClient";
import { useAuthStore } from "@/store/useAuthStore";

type CncReservationMode = "immediate" | "reserved";

export interface CncJobItem {
  id: string;
  source: "machine" | "bridge" | "upload" | "db";
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

interface CncReservationModalProps {
  open: boolean;
  machine: Machine | null;
  onRequestClose: () => void;
  onConfirm: (config: CncReservationConfig) => void;
}

export const CncReservationModal = ({
  open,
  machine,
  onRequestClose,
  onConfirm,
}: CncReservationModalProps) => {
  const { toast } = useToast();
  const { token } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dropping, setDropping] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [allocatedSlotHint, setAllocatedSlotHint] = useState<number>(3000);
  const nextSlotRef = useRef<number>(3000);

  const ensureFanucName = useCallback((slot: number) => {
    const sanitized = Number.isFinite(slot) ? Number(slot) : 3000;
    return `O${String(sanitized).padStart(4, "0")}.nc`;
  }, []);

  const setNextSlotFromServer = useCallback(
    (slot?: number | null, fallback?: number | null) => {
      const primary = Number.isFinite(slot ?? NaN) ? Number(slot) : null;
      const secondary = Number.isFinite(fallback ?? NaN)
        ? Number(fallback)
        : null;
      const resolved = primary ?? secondary ?? 3000;
      nextSlotRef.current = resolved;
      setAllocatedSlotHint(resolved);
    },
    [],
  );

  const allocateNextSlot = useCallback(() => {
    const current = Number.isFinite(nextSlotRef.current)
      ? Number(nextSlotRef.current)
      : 3000;
    const next = current === 3000 ? 3001 : 3000;
    nextSlotRef.current = next;
    setAllocatedSlotHint(next);
    return current;
  }, []);

  const resolveForcedProgram = useCallback(() => {
    if (!machine?.uid) return null;
    const slot = allocateNextSlot();
    return {
      programNo: slot,
      fileName: ensureFanucName(slot),
    };
  }, [allocateNextSlot, ensureFanucName, machine?.uid]);

  const fetchContinuousState = useCallback(async () => {
    if (!open || !machine?.uid || !token) return;
    try {
      const res = await apiFetch({
        path: `/api/cnc-machines/${encodeURIComponent(
          machine.uid,
        )}/continuous/state`,
        method: "GET",
        token,
      });
      if (!res.ok) return;
      const payload: any = res.data ?? {};
      const data = payload?.data ?? payload;
      const nextSlot = Number(data?.nextSlot);
      const currentSlot = Number(data?.currentSlot);
      setNextSlotFromServer(nextSlot, currentSlot === 3000 ? 3001 : 3000);
    } catch {
      // ignore fetch failure
      setNextSlotFromServer(null, 3000);
    }
  }, [machine?.uid, open, setNextSlotFromServer, token]);

  const handleUploadLocalFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!machine?.uid) {
        toast({
          title: "장비 정보가 없습니다.",
          description: "장비를 선택한 뒤 다시 시도해 주세요.",
          variant: "destructive",
        });
        return;
      }

      if (!token) {
        toast({
          title: "인증이 필요합니다.",
          description: "다시 로그인한 뒤 시도해 주세요.",
          variant: "destructive",
        });
        return;
      }

      const list = Array.from(files || []);
      if (list.length === 0) return;

      setSubmitting(true);
      try {
        const uploadedJobs: CncJobItem[] = [];

        // next slot을 서버에서 최신으로 받아온다.
        await fetchContinuousState();

        // 장비별 폴더 보장
        await apiFetch({
          path: "/api/bridge-store/mkdir",
          method: "POST",
          token,
          jsonBody: { path: machine.uid },
        }).catch(() => {});

        for (const file of list) {
          const raw = await file.text();
          const forced = await Promise.resolve(resolveForcedProgram());
          const fileName = String(forced?.fileName || "").trim();
          const programNo = Number(forced?.programNo);
          if (!fileName || !Number.isFinite(programNo)) {
            throw new Error("다음 슬롯 정보를 확인하지 못했습니다.");
          }

          const content = applyProgramNoToContent(programNo, raw);
          const bridgePath = `${machine.uid}/${fileName}`;

          const saveRes = await apiFetch({
            path: "/api/bridge-store/file",
            method: "POST",
            token,
            jsonBody: { path: bridgePath, content },
          });
          if (!saveRes.ok) {
            const body: any = saveRes.data ?? {};
            throw new Error(
              body?.message || body?.error || "브리지 스토어 저장 실패",
            );
          }

          const enqueueRes = await apiFetch({
            path: `/api/cnc-machines/${encodeURIComponent(
              machine.uid,
            )}/continuous/enqueue`,
            method: "POST",
            token,
            jsonBody: {
              fileName,
              bridgePath,
              requestId: null,
            },
          });

          const enqueueBody: any = enqueueRes.data ?? {};
          if (!enqueueRes.ok || enqueueBody?.success === false) {
            throw new Error(
              enqueueBody?.message ||
                enqueueBody?.error ||
                "브리지 연속 가공 큐 등록 실패",
            );
          }

          uploadedJobs.push({
            id: `upload:${fileName}:${Date.now()}`,
            source: "upload",
            programNo,
            name: fileName,
            qty: 1,
          });
        }

        toast({
          title: "업로드 완료",
          description: "다음 가공 파일로 등록되었습니다.",
        });

        onConfirm({ mode: "reserved", jobs: uploadedJobs });
        onRequestClose();
      } catch (e: any) {
        toast({
          title: "업로드 실패",
          description: e?.message || "업로드 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      } finally {
        setSubmitting(false);
      }
    },
    [
      fetchContinuousState,
      machine?.uid,
      onConfirm,
      onRequestClose,
      resolveForcedProgram,
      toast,
      token,
    ],
  );

  useEffect(() => {
    if (!open) return;
    void fetchContinuousState();
  }, [fetchContinuousState, open]);

  useEffect(() => {
    if (!open) {
      setDropping(false);
    }
  }, [open]);

  if (!open) return null;

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
          <button
            type="button"
            onClick={onRequestClose}
            className="inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-slate-100 text-xl sm:text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="mt-2 text-sm text-slate-700">
          {machine?.uid && (
            <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-[12px] text-blue-700">
              다음 업로드 파일명은 자동으로
              <code className="mx-1 font-semibold">
                {ensureFanucName(allocatedSlotHint)}
              </code>
              으로 설정되고, 브리지 서버로 전송됩니다.
            </div>
          )}

          <div
            className={`mt-4 rounded-xl border-2 border-dashed overflow-hidden transition-colors cursor-pointer ${
              dropping
                ? "border-blue-400 bg-blue-50/60"
                : "border-slate-200 bg-slate-50/80"
            }`}
            onClick={() => {
              if (!fileInputRef.current) return;
              fileInputRef.current.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDropping(true);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDropping(false);
              }
            }}
            onDrop={async (e) => {
              e.preventDefault();
              setDropping(false);
              const { files } = e.dataTransfer;
              if (files && files.length > 0) {
                await handleUploadLocalFiles(files);
              }
            }}
          >
            <div className="px-4 py-8 text-center text-slate-600">
              <div className="text-sm font-semibold text-slate-800">
                로컬 파일 업로드
              </div>
              <div className="mt-2 text-xs text-slate-500">
                여기에 <code>.nc</code>/<code>.txt</code> 파일을 드래그하거나
                클릭해서 선택하세요.
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  disabled={submitting}
                  className="inline-flex h-9 items-center justify-center rounded-md bg-blue-600 px-4 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
                >
                  {submitting ? "업로드 중..." : "파일 선택"}
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".nc,.txt"
                className="hidden"
                multiple
                onChange={(e) => {
                  const files = e.target.files;
                  if (!files || files.length === 0) return;
                  void (async () => {
                    await handleUploadLocalFiles(files);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  })();
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

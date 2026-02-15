import { useCallback, useEffect, useRef, useState } from "react";

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

  const [uploadProgress, setUploadProgress] = useState<{
    fileName: string;
    percent: number;
  } | null>(null);

  const uploadToPresignedUrl = useCallback(
    async (uploadUrl: string, file: File) => {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl);
        setUploadProgress({ fileName: file.name, percent: 0 });
        xhr.setRequestHeader(
          "Content-Type",
          file.type || "application/octet-stream",
        );

        xhr.upload.onprogress = (evt) => {
          if (!evt.lengthComputable) return;
          const percent = Math.max(
            0,
            Math.min(100, Math.round((evt.loaded / evt.total) * 100)),
          );
          setUploadProgress({ fileName: file.name, percent });
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setUploadProgress({ fileName: file.name, percent: 100 });
            resolve();
          } else reject(new Error(`S3 업로드 실패 (HTTP ${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error("S3 업로드 실패"));

        xhr.send(file);
      });
    },
    [],
  );

  const handleRequestCloseSafe = useCallback(() => {
    if (submitting) {
      toast({
        title: "업로드 중",
        description:
          "NC 업로드는 30초 이상 걸릴 수 있습니다. 업로드가 끝날 때까지 브리지 서버/페이지를 종료하지 마세요.",
        variant: "destructive",
      });
      return;
    }
    onRequestClose();
  }, [onRequestClose, submitting, toast]);

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
      setUploadProgress(null);
      try {
        const uploadedJobs: CncJobItem[] = [];

        for (const file of list) {
          const fileName = String(file.name || "").trim();
          if (!fileName) {
            throw new Error("파일명이 올바르지 않습니다.");
          }

          // smartUpload 이중 응답: 즉시 jobId 반환 후 백그라운드 처리
          const uploadRes = await apiFetch({
            path: `/api/cnc-machines/${encodeURIComponent(
              machine.uid,
            )}/smart/upload`,
            method: "POST",
            token,
            jsonBody: {
              headType: 1,
              path: fileName,
              isNew: true,
            },
          });

          const uploadBody: any = uploadRes.data ?? {};
          if (!uploadRes.ok || uploadBody?.success === false) {
            throw new Error(
              uploadBody?.message || uploadBody?.error || "스마트 업로드 실패",
            );
          }

          // 202 Accepted면 jobId로 결과 폴링
          const jobId = uploadBody?.jobId;
          if (uploadRes.status === 202 && jobId) {
            let uploadCompleted = false;
            for (let i = 0; i < 60; i += 1) {
              try {
                const jobRes = await apiFetch({
                  path: `/api/cnc-machines/${encodeURIComponent(
                    machine.uid,
                  )}/jobs/${encodeURIComponent(jobId)}`,
                  method: "GET",
                  token,
                });
                const jobBody: any = jobRes.data ?? {};
                if (jobRes.ok && jobBody?.status === "COMPLETED") {
                  uploadCompleted = true;
                  break;
                }
                if (jobRes.ok && jobBody?.status === "FAILED") {
                  throw new Error(jobBody?.result?.message || "업로드 실패");
                }
              } catch (e: any) {
                if (i === 59) throw e;
              }
              await new Promise((r) => setTimeout(r, 1000));
            }
            if (!uploadCompleted) {
              throw new Error("업로드 결과 확인 타임아웃");
            }
          }

          uploadedJobs.push({
            id: `upload:${fileName}:${Date.now()}`,
            source: "upload",
            programNo: null,
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
        setUploadProgress(null);
      }
    },
    [
      machine?.uid,
      onConfirm,
      onRequestClose,
      toast,
      token,
      uploadToPresignedUrl,
    ],
  );

  useEffect(() => {
    if (!open) {
      setDropping(false);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 pt-16 backdrop-blur-sm"
      onClick={handleRequestCloseSafe}
    >
      <div
        className="app-surface app-surface--modal p-6 sm:p-8 w-full max-w-5xl transform transition-all relative"
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
            onClick={handleRequestCloseSafe}
            className="inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-slate-100 text-xl sm:text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="mt-2 text-sm text-slate-700">
          {machine?.uid && (
            <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-[12px] text-blue-700">
              업로드한 파일은 원본 파일명 그대로 S3/예약목록(DB)에 저장됩니다.
            </div>
          )}

          {uploadProgress && (
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-700">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{uploadProgress.fileName}</span>
                <span className="tabular-nums">{uploadProgress.percent}%</span>
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-slate-100">
                <div
                  className="h-2 rounded-full bg-blue-600"
                  style={{ width: `${uploadProgress.percent}%` }}
                />
              </div>
            </div>
          )}
          <div
            className={`mt-4 rounded-xl border-2 border-dashed overflow-hidden transition-colors cursor-pointer ${
              dropping
                ? "border-blue-400 bg-blue-50/60"
                : "border-slate-200 bg-slate-50/80"
            }`}
            onClick={() => {
              if (submitting) return;
              if (!fileInputRef.current) return;
              fileInputRef.current.click();
            }}
            onDragOver={(e) => {
              if (submitting) return;
              e.preventDefault();
              setDropping(true);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDropping(false);
              }
            }}
            onDrop={async (e) => {
              if (submitting) return;
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

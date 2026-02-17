import { useCallback, useEffect, useRef, useState } from "react";

import type { Machine } from "@/pages/manufacturer/cnc/types";
import { useToast } from "@/shared/hooks/use-toast";
import { useManUpload } from "../hooks/useManUpload";

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dropping, setDropping] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { uploadMachineFiles, uploadProgress } = useManUpload();

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

      const list = Array.from(files || []);
      if (list.length === 0) return;

      setSubmitting(true);
      try {
        await uploadMachineFiles(machine.uid, list);
        toast({
          title: "업로드 완료",
          description: "다음 가공 파일로 등록되었습니다.",
        });

        onConfirm({ mode: "reserved", jobs: [] });
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
    [machine?.uid, onConfirm, onRequestClose, toast, uploadMachineFiles],
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

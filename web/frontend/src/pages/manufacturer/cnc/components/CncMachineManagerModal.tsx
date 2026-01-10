import type { MachineForm } from "@/pages/manufacturer/cnc/types";
import { useEffect, useRef } from "react";

interface CncMachineManagerModalProps {
  open: boolean;
  mode: "create" | "edit";
  form: MachineForm;
  loading: boolean;
  onChange: (field: keyof MachineForm, value: string | boolean) => void;
  onRequestClose: () => void;
  onSubmit: () => void | Promise<void>;
  onRequestDelete?: () => void;
}

export const CncMachineManagerModal = ({
  open,
  mode,
  form,
  loading,
  onChange,
  onRequestClose,
  onSubmit,
  onRequestDelete,
}: CncMachineManagerModalProps) => {
  if (!open) return null;

  const submitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSubmittedKeyRef = useRef<string>("");

  const computeKey = () => {
    return JSON.stringify({
      mode,
      name: form.name,
      ip: form.ip,
      allowJobStart: !!form.allowJobStart,
      allowProgramDelete: !!form.allowProgramDelete,
      allowAutoMachining: !!form.allowAutoMachining,
    });
  };

  useEffect(() => {
    lastSubmittedKeyRef.current = computeKey();
  }, [
    mode,
    form.allowJobStart,
    form.allowProgramDelete,
    form.allowAutoMachining,
    form.ip,
    form.name,
  ]);

  const scheduleSubmit = () => {
    if (mode !== "edit") return;
    const nextKey = computeKey();
    if (nextKey === lastSubmittedKeyRef.current) return;
    if (submitTimeoutRef.current) {
      clearTimeout(submitTimeoutRef.current);
    }
    submitTimeoutRef.current = setTimeout(() => {
      void onSubmit();
      lastSubmittedKeyRef.current = nextKey;
    }, 400);
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
      onClick={onRequestClose}
    >
      <div
        className="bg-white/95 p-6 sm:p-7 rounded-2xl shadow-[0_20px_60px_rgba(15,23,42,0.35)] w-full max-w-sm transform transition-all border border-gray-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5 gap-4">
          <div className="space-y-1">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">
              {mode === "edit" ? "장비 정보 수정" : "새 장비 추가"}
            </h2>
          </div>
        </div>
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium mb-1.5 text-gray-700">
              장비 이름
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => onChange("name", e.target.value)}
              onBlur={scheduleSubmit}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-blue-500 focus:border-blue-500 transition"
              placeholder="예: M1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5 text-gray-700">
              IP 주소
            </label>
            <input
              type="text"
              value={form.ip}
              onChange={(e) => onChange("ip", e.target.value)}
              onBlur={scheduleSubmit}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-blue-500 focus:border-blue-500 transition"
              placeholder="예: 172.22.60.30"
            />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                원격 가공 허용
              </span>
              <button
                type="button"
                onClick={() => {
                  onChange("allowJobStart", !form.allowJobStart);
                  scheduleSubmit();
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  form.allowJobStart ? "bg-blue-500" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    form.allowJobStart ? "translate-x-5" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                자동 가공 허용
              </span>
              <button
                type="button"
                onClick={() => {
                  onChange("allowAutoMachining", !form.allowAutoMachining);
                  scheduleSubmit();
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  form.allowAutoMachining ? "bg-emerald-500" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    form.allowAutoMachining ? "translate-x-5" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                원격 파일 삭제 허용
              </span>
              <button
                type="button"
                onClick={() => {
                  onChange("allowProgramDelete", !form.allowProgramDelete);
                  scheduleSubmit();
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  form.allowProgramDelete ? "bg-red-500" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    form.allowProgramDelete ? "translate-x-5" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
        <div className="flex justify-between items-center gap-3 mt-6">
          <div>
            {mode === "edit" && onRequestDelete && (
              <button
                onClick={onRequestDelete}
                className="bg-red-50 hover:bg-red-100 text-red-600 font-medium py-2.5 px-4 rounded-lg text-sm transition-colors"
              >
                장비 삭제
              </button>
            )}
          </div>
          <div className="flex gap-3 ml-auto">
            <button
              onClick={onRequestClose}
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2.5 px-5 rounded-lg text-sm transition-colors"
            >
              취소
            </button>
            {mode === "create" && (
              <button
                onClick={() => void onSubmit()}
                className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2.5 px-5 rounded-lg text-sm transition-colors"
                disabled={loading}
              >
                {loading ? "처리 중..." : "추가"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

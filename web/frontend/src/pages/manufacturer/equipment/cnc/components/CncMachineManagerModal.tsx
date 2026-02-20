import type { MachineForm } from "@/pages/manufacturer/equipment/cnc/types";
import { useRef } from "react";

interface CncMachineManagerModalProps {
  open: boolean;
  mode: "create" | "edit";
  form: MachineForm;
  loading: boolean;
  onChange: (field: keyof MachineForm, value: string | boolean) => void;
  onRequestClose: () => void;
  onSubmit: (formSnapshot?: MachineForm) => void | Promise<void>;
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
  const scheduleSubmit = (snapshot?: MachineForm) => {
    if (mode !== "edit") return;
    if (submitTimeoutRef.current) {
      clearTimeout(submitTimeoutRef.current);
    }
    submitTimeoutRef.current = setTimeout(() => {
      void onSubmit(snapshot ?? form);
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
              onBlur={() => scheduleSubmit()}
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
              onBlur={() => scheduleSubmit()}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-blue-500 focus:border-blue-500 transition"
              placeholder="예: 172.22.60.30"
            />
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

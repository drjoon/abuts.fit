import { useState, useRef } from "react";
import { useAuthStore } from "@/store/useAuthStore";

// manufacturer 전용 CNC 쓰기 보호 가드
// - 하루 1회 4자리 PIN 확인
// - Reset 및 향후 Update 계열 쓰기 명령 실행 전에 사용
export const useCncWriteGuard = () => {
  const { user } = useAuthStore();

  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinMode, setPinMode] = useState<"setup" | "verify">("verify");
  const [pinInput, setPinInput] = useState("");
  const [pinConfirmInput, setPinConfirmInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const pinResolveRef = useRef<((ok: boolean) => void) | null>(null);

  const ensureCncWriteAllowed = async (): Promise<boolean> => {
    if (!user || user.role !== "manufacturer") {
      return false;
    }

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const dateKey = `${yyyy}${mm}${dd}`;

    const userId = user.id;
    const pinKey = `cnc_pin_${userId}`;
    const verifiedKey = `cnc_write_verified_${userId}_${dateKey}`;

    if (localStorage.getItem(verifiedKey)) {
      return true;
    }

    const existingPin = localStorage.getItem(pinKey);
    setPinInput("");
    setPinConfirmInput("");
    setPinError(null);
    setPinMode(existingPin ? "verify" : "setup");
    setPinModalOpen(true);

    return await new Promise<boolean>((resolve) => {
      pinResolveRef.current = resolve;
    });
  };

  const PinModal = pinModalOpen ? (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-[9999] p-4 backdrop-blur-sm"
      onClick={() => {
        setPinModalOpen(false);
        pinResolveRef.current?.(false);
        pinResolveRef.current = null;
      }}
    >
      <div
        className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-sm transform transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-4 text-gray-900">
          {pinMode === "setup" ? "CNC 보호 PIN 설정" : "CNC 보호 PIN 확인"}
        </h2>
        <div className="space-y-4 text-sm text-gray-700">
          <p className="text-gray-600">
            위험한 CNC 제어/설정 변경 전에는 하루에 한 번 4자리 숫자 PIN을
            확인합니다. 로그인 비밀번호와는 별개입니다.
          </p>
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-gray-500">
              PIN (4자리 숫자)
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pinInput}
              onChange={(e) =>
                setPinInput(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))
              }
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          {pinMode === "setup" && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-gray-500">
                PIN 확인
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pinConfirmInput}
                onChange={(e) =>
                  setPinConfirmInput(
                    e.target.value.replace(/[^0-9]/g, "").slice(0, 4)
                  )
                }
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          )}
          {pinError && <div className="text-xs text-red-600">{pinError}</div>}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={() => {
              setPinModalOpen(false);
              pinResolveRef.current?.(false);
              pinResolveRef.current = null;
            }}
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded-lg text-sm transition-colors"
          >
            취소
          </button>
          <button
            onClick={() => {
              if (!user || user.role !== "manufacturer") {
                setPinModalOpen(false);
                pinResolveRef.current?.(false);
                pinResolveRef.current = null;
                return;
              }

              const today = new Date();
              const yyyy = today.getFullYear();
              const mm = String(today.getMonth() + 1).padStart(2, "0");
              const dd = String(today.getDate()).padStart(2, "0");
              const dateKey = `${yyyy}${mm}${dd}`;
              const userId = user.id;
              const pinKey = `cnc_pin_${userId}`;
              const verifiedKey = `cnc_write_verified_${userId}_${dateKey}`;

              if (!/^[0-9]{4}$/.test(pinInput)) {
                setPinError("PIN은 4자리 숫자여야 합니다.");
                return;
              }

              const existingPin = localStorage.getItem(pinKey);
              if (pinMode === "setup") {
                if (pinInput !== pinConfirmInput) {
                  setPinError("PIN과 PIN 확인이 일치하지 않습니다.");
                  return;
                }
                localStorage.setItem(pinKey, pinInput);
                localStorage.setItem(verifiedKey, "1");
                setPinModalOpen(false);
                pinResolveRef.current?.(true);
                pinResolveRef.current = null;
              } else {
                if (!existingPin || existingPin !== pinInput) {
                  setPinError("PIN이 올바르지 않습니다.");
                  return;
                }
                localStorage.setItem(verifiedKey, "1");
                setPinModalOpen(false);
                pinResolveRef.current?.(true);
                pinResolveRef.current = null;
              }
            }}
            className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { ensureCncWriteAllowed, PinModal };
};

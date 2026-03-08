import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type MailboxPrintSettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  printerProfile: string;
  setPrinterProfile: (value: string) => void;
  paperProfile: string;
  setPaperProfile: (value: string) => void;
  paperOptions: string[];
  paperLoading: boolean;
  paperError: string | null;
  printerOptions: string[];
  printerLoading: boolean;
  printerError: string | null;
  shippingOutputMode: "image" | "label";
  setShippingOutputMode: (value: "image" | "label") => void;
  onRefreshPrinters: () => void | Promise<void>;
};

export const MailboxPrintSettingsDialog = ({
  open,
  onOpenChange,
  printerProfile,
  setPrinterProfile,
  paperProfile,
  setPaperProfile,
  paperOptions,
  paperLoading,
  paperError,
  printerOptions,
  printerLoading,
  printerError,
  shippingOutputMode,
  setShippingOutputMode,
  onRefreshPrinters,
}: MailboxPrintSettingsDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-2xl rounded-2xl border border-slate-200 bg-white/85 backdrop-blur-md shadow-xl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-slate-900">
            프린터 설정
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="text-sm text-slate-600 leading-relaxed">
            운송장 출력은 로컬 프린터 서버(5777)의 CUPS 프린터 목록을 사용합니다.
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                프린터
              </span>
              <button
                type="button"
                onClick={() => void onRefreshPrinters()}
                disabled={printerLoading}
                className={`text-xs font-medium rounded-md px-2.5 py-1 border transition-colors ${
                  printerLoading
                    ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                새로고침
              </button>
            </div>

            <select
              value={printerProfile}
              onChange={(e) => setPrinterProfile(e.target.value)}
              title={printerProfile}
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white/90 focus:outline-none focus:ring-2 focus:ring-blue-300"
              disabled={printerLoading}
            >
              {printerLoading ? (
                <option value="">프린터 목록 불러오는 중...</option>
              ) : printerOptions.length ? (
                printerOptions.map((printer) => (
                  <option key={printer} value={printer} title={printer}>
                    {printer}
                  </option>
                ))
              ) : (
                <option value="">사용 가능한 프린터가 없습니다.</option>
              )}
            </select>

            {printerError ? (
              <div className="text-xs text-rose-600">{printerError}</div>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                용지
              </span>
            </div>

            <select
              value={paperProfile}
              onChange={(e) => setPaperProfile(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white/90 focus:outline-none focus:ring-2 focus:ring-blue-300"
              disabled={paperLoading}
            >
              {paperLoading ? (
                <option value={paperProfile}>용지 설정 불러오는 중...</option>
              ) : (
                paperOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))
              )}
            </select>
            {paperError ? (
              <div className="text-xs text-rose-600">{paperError}</div>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                출력 방식
              </span>
            </div>

            <select
              value={shippingOutputMode}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "image" || v === "label") setShippingOutputMode(v);
              }}
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white/90 focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              <option value="image">PDF 저장</option>
              <option value="label">실제 라벨 출력</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            >
              닫기
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

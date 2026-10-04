// related files:
// - web/frontend/src/shared/demo/DemoModeBadge.tsx
// - web/frontend/src/shared/demo/DemoConversionPromptModal.tsx
// - web/frontend/src/shared/demo/useDemoMode.ts
// - web/backend/services/demoConversion.service.js
// change-log:
// - 2026-10-04: 실사용 전환 = 기공소 직접 지급 확인. 완료 시 충전 페이지로 이동.
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRightLeft, Check, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { request } from "@/shared/api/apiClient";
import {
  DEMO_MODE_CONVERTED_TOAST_DESCRIPTION,
  DEMO_MODE_CONVERTED_TOAST_TITLE,
  DEMO_MODE_EXIT_CONFIRM_LABEL,
  DEMO_MODE_EXIT_TITLE,
  DEMO_MODE_EXIT_WARNING,
  DEMO_MODE_PENDING_TOAST,
  resolveDemoModeExitBody,
} from "./demoModeCopy";
import { useDemoMode, type DemoConversionLab } from "./useDemoMode";

type Props = {
  open: boolean;
  onClose: () => void;
  /** 전환 요청 후(대기 포함) 호출 */
  onRequested?: () => void;
};

type QuoteData = {
  conversionPending?: boolean;
  labs?: DemoConversionLab[];
  directTotal?: number;
};

const CHARGE_PATH = "/dashboard/credits?tab=charge";

export function DemoConversionDialog({ open, onClose, onRequested }: Props) {
  const navigate = useNavigate();
  const { exiting, requestConversion } = useDemoMode();
  const [quote, setQuote] = useState<QuoteData | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await request<{ success?: boolean; data?: QuoteData }>({
          path: "/api/credits/conversion-quote",
          method: "GET",
        });
        if (!cancelled && res.ok) setQuote(res.data?.data || null);
      } catch {
        if (!cancelled) setQuote(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const labs = quote?.labs || [];
  const pending = Boolean(quote?.conversionPending);

  return (
    <ConfirmDialog
      open={open}
      title={DEMO_MODE_EXIT_TITLE}
      panelClassName="max-w-sm"
      description={
        <div className="space-y-3">
          <div className="flex gap-3 rounded-xl border border-slate-200/90 bg-slate-50 px-3.5 py-3.5">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary-strong">
              <ArrowRightLeft className="h-4 w-4" aria-hidden />
            </div>
            <p className="min-w-0 text-sm leading-relaxed text-slate-700">
              {resolveDemoModeExitBody("practice")}
            </p>
          </div>

          {labs.length > 0 ? (
            <ul className="space-y-1.5 px-1.5 py-1.5 text-sm">
              {labs.map((lab) => (
                <li
                  key={lab.labAnchorId}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/90 bg-white px-3 py-2"
                >
                  <span className="min-w-0 truncate text-slate-800">
                    {lab.labName || "기공소"}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 tabular-nums text-slate-700">
                    <>
                        {lab.amount.toLocaleString("ko-KR")}원
                        {lab.status === "CONFIRMED" ? (
                          <Check
                            className="h-3.5 w-3.5 text-emerald-600"
                            aria-label="지급 확인됨"
                          />
                        ) : pending ? (
                          <Clock
                            className="h-3.5 w-3.5 text-amber-600"
                            aria-label="확인 대기"
                          />
                        ) : null}
                    </>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex gap-2.5 rounded-xl border border-amber-200/90 bg-amber-50 px-3.5 py-3">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
              aria-hidden
            />
            <p className="min-w-0 text-sm leading-relaxed text-amber-950/85">
              {DEMO_MODE_EXIT_WARNING}
            </p>
          </div>
        </div>
      }
      confirmLabel={pending ? "확인" : DEMO_MODE_EXIT_CONFIRM_LABEL}
      cancelLabel={pending ? "닫기" : "취소"}
      confirmTone="primary"
      busy={exiting}
      onCancel={() => {
        if (!exiting) onClose();
      }}
      onConfirm={async () => {
        if (pending) {
          onClose();
          return;
        }
        const result = await requestConversion();
        if (!result.ok) {
          toast.error("전환 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.");
          return;
        }
        onClose();
        onRequested?.();
        if (result.completed) {
          toast.success(DEMO_MODE_CONVERTED_TOAST_TITLE, {
            description: DEMO_MODE_CONVERTED_TOAST_DESCRIPTION,
          });
          navigate(CHARGE_PATH);
        } else {
          toast.success(DEMO_MODE_PENDING_TOAST);
        }
      }}
    />
  );
}

export { CHARGE_PATH as DEMO_CONVERSION_CHARGE_PATH };

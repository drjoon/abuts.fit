// related files:
// - web/frontend/src/shared/demo/DemoModeBadge.tsx
// - web/frontend/src/shared/demo/DemoConversionPromptModal.tsx
// - web/frontend/src/shared/demo/useDemoMode.ts
// - web/backend/services/demoConversion.service.js
// change-log:
// - 2026-10-04: 대기 모달 — 기공소별 확인 상태·남은 승인 문구. quote를 잔액 이벤트로 갱신.
// - 2026-10-04: 전환 대기 시 기공소 확인 대기 문구·단일 닫기. quote 전 hook pending 반영.
// - 2026-10-04: 실사용 전환 = 기공소 직접 지급 확인. 완료 시 충전 페이지로 이동.
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowRightLeft, Check, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useAppEventListener } from "@/shared/realtime/useAppEventListener";
import { isCreditEventForBusiness } from "@/shared/realtime/creditBalanceEvent";
import {
  DEMO_MODE_CONVERTED_TOAST_DESCRIPTION,
  DEMO_MODE_CONVERTED_TOAST_TITLE,
  DEMO_MODE_EXIT_CONFIRM_LABEL,
  DEMO_MODE_EXIT_TITLE,
  DEMO_MODE_EXIT_WARNING,
  DEMO_MODE_PENDING_BODY_LINES,
  DEMO_MODE_PENDING_NOTICE,
  DEMO_MODE_PENDING_TITLE,
  DEMO_MODE_PENDING_TOAST,
  resolveDemoConversionLabDisplayName,
  resolveDemoModeExitBody,
  resolveDemoModePendingBodyLines,
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
  const businessAnchorId = useAuthStore((s) => s.user?.businessAnchorId);
  const {
    exiting,
    requestConversion,
    conversionPending: hookPending,
    refresh,
  } = useDemoMode();
  const [quote, setQuote] = useState<QuoteData | null>(null);

  const loadQuote = useCallback(async () => {
    try {
      const res = await request<{ success?: boolean; data?: QuoteData }>({
        path: "/api/credits/conversion-quote",
        method: "GET",
      });
      if (res.ok) setQuote(res.data?.data || null);
    } catch {
      setQuote(null);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadQuote();
  }, [open, loadQuote]);

  useAppEventListener({
    eventTypes: ["credit:balance-updated"],
    enabled: open && Boolean(businessAnchorId),
    onMatch: (evt) => {
      if (!isCreditEventForBusiness(evt, businessAnchorId)) return;
      void loadQuote();
      void refresh();
    },
  });

  const labs = quote?.labs || [];
  const pending =
    quote != null ? Boolean(quote.conversionPending) : Boolean(hookPending);
  const pendingBodyLines = pending
    ? resolveDemoModePendingBodyLines(labs)
    : null;

  return (
    <ConfirmDialog
      open={open}
      title={pending ? DEMO_MODE_PENDING_TITLE : DEMO_MODE_EXIT_TITLE}
      panelClassName="max-w-sm"
      description={
        <div className="space-y-3">
          <div className="flex gap-3 rounded-xl border border-slate-200/90 bg-slate-50 px-3.5 py-3.5">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary-strong">
              {pending ? (
                <Clock className="h-4 w-4" aria-hidden />
              ) : (
                <ArrowRightLeft className="h-4 w-4" aria-hidden />
              )}
            </div>
            <p className="min-w-0 text-sm leading-relaxed text-slate-700">
              {pending && pendingBodyLines ? (
                pendingBodyLines.map((line, i) => (
                  <span key={`${i}-${line}`}>
                    {i > 0 ? <br /> : null}
                    {line}
                  </span>
                ))
              ) : pending ? (
                DEMO_MODE_PENDING_BODY_LINES.map((line, i) => (
                  <span key={line}>
                    {i > 0 ? <br /> : null}
                    {line}
                  </span>
                ))
              ) : (
                resolveDemoModeExitBody("practice")
              )}
            </p>
          </div>

          {labs.length > 0 ? (
            <ul className="max-h-48 space-y-1.5 overflow-y-auto px-1.5 py-1.5 text-sm">
              {labs.map((lab) => (
                <li
                  key={lab.labAnchorId}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/90 bg-white px-3 py-2"
                >
                  <span className="min-w-0 truncate text-slate-800">
                    {resolveDemoConversionLabDisplayName(lab)}
                    {lab.status === "CONFIRMED" ? (
                      <span className="ml-1.5 text-[11px] font-medium text-emerald-700">
                        확인
                      </span>
                    ) : pending ? (
                      <span className="ml-1.5 text-[11px] font-medium text-amber-700">
                        대기
                      </span>
                    ) : null}
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
              {pending ? DEMO_MODE_PENDING_NOTICE : DEMO_MODE_EXIT_WARNING}
            </p>
          </div>
        </div>
      }
      confirmLabel={pending ? "닫기" : DEMO_MODE_EXIT_CONFIRM_LABEL}
      cancelLabel="취소"
      showCancel={!pending}
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

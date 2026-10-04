// related files:
// - web/frontend/src/shared/demo/useDemoMode.ts
// - web/frontend/src/shared/demo/DemoConversionDialog.tsx
// - web/frontend/src/shared/demo/demoModeCopy.ts
// - web/frontend/src/features/layout/DashboardLayout.tsx
// change-log:
// - 2026-10-04: 만료 7일 전부터 하루 1회(KST) 실사용 전환 유도. 만료 후에는 접속마다 표시.
//   기공소 확인으로 전환이 끝나면 충전 페이지로 안내.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { toKstYmd } from "@/shared/date/kst";
import { useAuthStore } from "@/store/useAuthStore";
import {
  DEMO_CONVERSION_CHARGE_PATH,
  DemoConversionDialog,
} from "./DemoConversionDialog";
import {
  DEMO_MODE_CONVERTED_TOAST_DESCRIPTION,
  DEMO_MODE_CONVERTED_TOAST_TITLE,
  DEMO_MODE_PROMPT_CONFIRM_LABEL,
  DEMO_MODE_PROMPT_DAYS_BEFORE,
  DEMO_MODE_PROMPT_LATER_LABEL,
  DEMO_MODE_PROMPT_TITLE,
  resolveDemoModePromptLines,
} from "./demoModeCopy";
import { useDemoMode } from "./useDemoMode";

function storageKey(anchorId: string) {
  return `abuts:demo-conversion-prompt:${anchorId}`;
}

export function DemoConversionPromptModal() {
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const businessAnchorId = useAuthStore((s) => s.user?.businessAnchorId);
  const { demoMode, daysRemaining, expired, conversionPending, loading } =
    useDemoMode();
  const [promptOpen, setPromptOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const checkedRef = useRef<string | null>(null);
  const wasPendingRef = useRef(false);

  // 전환 대기 -> 완료(기공소 확인) 전이: 충전 안내.
  useEffect(() => {
    if (loading) return;
    if (conversionPending) {
      wasPendingRef.current = true;
      return;
    }
    if (wasPendingRef.current && !demoMode) {
      wasPendingRef.current = false;
      toast.success(DEMO_MODE_CONVERTED_TOAST_TITLE, {
        description: DEMO_MODE_CONVERTED_TOAST_DESCRIPTION,
      });
      navigate(DEMO_CONVERSION_CHARGE_PATH);
    }
  }, [conversionPending, demoMode, loading, navigate]);

  // 7일 전부터 하루 1회. 만료 후에는 로드마다 표시.
  useEffect(() => {
    if (loading || !demoMode || conversionPending) return;
    if (role !== "requestor" && role !== "practice") return;
    if (!businessAnchorId) return;
    if (daysRemaining == null || daysRemaining > DEMO_MODE_PROMPT_DAYS_BEFORE) {
      return;
    }
    const today = toKstYmd(new Date()) || "";
    const sessionKey = `${businessAnchorId}:${today}`;
    if (checkedRef.current === sessionKey) return;
    checkedRef.current = sessionKey;

    const key = storageKey(String(businessAnchorId));
    try {
      if (!expired && window.localStorage.getItem(key) === today) return;
      window.localStorage.setItem(key, today);
    } catch {
      /* localStorage 불가 시 세션당 1회만 */
    }
    setPromptOpen(true);
  }, [
    businessAnchorId,
    conversionPending,
    daysRemaining,
    demoMode,
    expired,
    loading,
    role,
  ]);

  const lines = resolveDemoModePromptLines(daysRemaining);

  return (
    <>
      <ConfirmDialog
        open={promptOpen}
        title={DEMO_MODE_PROMPT_TITLE}
        panelClassName="max-w-sm"
        description={
          <p className="text-sm leading-relaxed text-slate-700">
            {lines.map((line, i) => (
              <span key={line}>
                {i > 0 ? <br /> : null}
                {line}
              </span>
            ))}
          </p>
        }
        confirmLabel={DEMO_MODE_PROMPT_CONFIRM_LABEL}
        cancelLabel={DEMO_MODE_PROMPT_LATER_LABEL}
        confirmTone="primary"
        onCancel={() => setPromptOpen(false)}
        onConfirm={() => {
          setPromptOpen(false);
          setDialogOpen(true);
        }}
      />
      <DemoConversionDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </>
  );
}

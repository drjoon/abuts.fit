// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// change-log:
// - 2026-10-04: alert 토스트 — 좌측 액센트 바·소프트 그라데이션·가벼운 보기 버튼.
// - 2026-10-04: alert 토스트 — 브랜드 뱃지 + 보기 액션 레이아웃.
import { cn } from "@/shared/ui/cn";
import { useToast } from "@/shared/hooks/use-toast";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider duration={4000}>
      {toasts.map(function ({
        id,
        title,
        description,
        action,
        duration,
        className,
        variant,
        ...props
      }) {
        const isAlert = variant === "alert";
        return (
          <Toast
            key={id}
            duration={duration}
            variant={variant}
            className={cn(props.onClick ? "cursor-pointer" : undefined, className)}
            {...props}
          >
            {isAlert ? (
              <div className="flex min-w-0 flex-1 items-stretch">
                <div
                  aria-hidden
                  className="w-1 shrink-0 bg-gradient-to-b from-sky-400 via-primary to-indigo-500"
                />
                <div className="flex min-w-0 flex-1 items-center gap-3 px-3.5 py-3.5 pr-10">
                  <div
                    aria-hidden
                    className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-primary text-[0.8125rem] font-bold tracking-tight text-white shadow-[0_8px_18px_-8px_rgba(37,99,235,0.85)] ring-2 ring-white/80"
                  >
                    <span className="relative z-[1]">A</span>
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.45),transparent_55%)]"
                    />
                  </div>
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    {title ? (
                      <ToastTitle className="text-[0.875rem] font-semibold leading-snug tracking-tight text-slate-900">
                        {title}
                      </ToastTitle>
                    ) : null}
                    {description ? (
                      <ToastDescription className="line-clamp-2 text-[0.8125rem] leading-snug text-slate-500">
                        {description}
                      </ToastDescription>
                    ) : null}
                  </div>
                  {action}
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-1">
                  {title ? <ToastTitle>{title}</ToastTitle> : null}
                  {description ? (
                    <ToastDescription>{description}</ToastDescription>
                  ) : null}
                </div>
                {action}
              </>
            )}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}

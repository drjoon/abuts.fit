// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// change-log:
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
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <div
                  aria-hidden
                  className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-sm shadow-primary/30"
                >
                  A
                </div>
                <div className="grid min-w-0 flex-1 gap-0.5">
                  {title ? (
                    <ToastTitle className="text-[0.8125rem] font-semibold tracking-tight">
                      {title}
                    </ToastTitle>
                  ) : null}
                  {description ? (
                    <ToastDescription className="text-[0.8125rem] text-muted-foreground">
                      {description}
                    </ToastDescription>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="grid gap-1">
                {title ? <ToastTitle>{title}</ToastTitle> : null}
                {description ? (
                  <ToastDescription>{description}</ToastDescription>
                ) : null}
              </div>
            )}
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}

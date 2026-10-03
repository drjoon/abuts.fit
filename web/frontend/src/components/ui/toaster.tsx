// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
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
        ...props
      }) {
        return (
          <Toast
            key={id}
            duration={duration}
            className={cn(props.onClick ? "cursor-pointer" : undefined, className)}
            {...props}
          >
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}

// - 2026-10-04: alert 토스트 — 좌측 액센트·소프트 그라데이션·더 가벼운 액션.
// - 2026-10-04: alert 변형 — 채팅·의뢰 시스템 알림(브랜드 액센트·부드러운 카드).
// - 2026-10-03: 토스트 뷰포트 오른쪽 위. 클릭 가능한 알림 토스트.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import * as React from "react";
import * as ToastPrimitives from "@radix-ui/react-toast";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

import { cn } from "@/shared/ui/cn";

const ToastProvider = ToastPrimitives.Provider;

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    data-app-toast-viewport=""
    className={cn(
      "fixed top-0 right-0 z-[11000] flex max-h-screen w-full flex-col gap-2.5 p-4 sm:p-5 sm:w-auto sm:min-w-[340px] sm:max-w-[400px]",
      className,
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitives.Viewport.displayName;

const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-6 pr-8 shadow-lg transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full data-[state=open]:duration-300",
  {
    variants: {
      variant: {
        default: "border-2 border-primary bg-background text-foreground",
        alert:
          "space-x-0 gap-0 overflow-hidden rounded-[1.15rem] border-0 bg-gradient-to-br from-white via-white to-sky-50/95 p-0 pr-0 text-foreground shadow-[0_18px_50px_-18px_rgba(37,99,235,0.42),0_8px_20px_-12px_rgba(15,23,42,0.18)] ring-1 ring-sky-200/70 backdrop-blur-xl dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:ring-sky-400/20",
        destructive:
          "destructive group border-destructive bg-destructive text-destructive-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> &
    VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  return (
    <ToastPrimitives.Root
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  );
});
Toast.displayName = ToastPrimitives.Root.displayName;

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium ring-offset-background transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 group-[.destructive]:border-muted/40 group-[.destructive]:hover:border-destructive/30 group-[.destructive]:hover:bg-destructive group-[.destructive]:hover:text-destructive-foreground group-[.destructive]:focus:ring-destructive",
      className,
    )}
    {...props}
  />
));
ToastAction.displayName = ToastPrimitives.Action.displayName;

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, onClick, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      // 모바일은 hover가 없어 항상 보이게 한다.
      "absolute right-1.5 top-1.5 rounded-full p-1.5 text-slate-400 opacity-100 transition-colors hover:bg-slate-900/5 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-300/60 group-[.destructive]:text-destructive/90 group-[.destructive]:hover:bg-white/10 group-[.destructive]:hover:text-destructive-soft group-[.destructive]:focus:ring-destructive/80 group-[.destructive]:focus:ring-offset-red-600",
      className,
    )}
    toast-close=""
    aria-label="닫기"
    {...props}
    onClick={(e) => {
      e.stopPropagation();
      onClick?.(e);
    }}
  >
    <X className="h-3.5 w-3.5" />
  </ToastPrimitives.Close>
));
ToastClose.displayName = ToastPrimitives.Close.displayName;

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn("text-sm font-semibold", className)}
    {...props}
  />
));
ToastTitle.displayName = ToastPrimitives.Title.displayName;

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn("text-sm opacity-90", className)}
    {...props}
  />
));
ToastDescription.displayName = ToastPrimitives.Description.displayName;

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>;

type ToastActionElement = React.ReactElement<typeof ToastAction>;

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
};

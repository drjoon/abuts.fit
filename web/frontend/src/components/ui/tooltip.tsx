// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - .cursor/rules/tooltip-delay.mdc
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - 2026-10-06: disabled 자식(asChild)은 span으로 감싸 호버 툴팁이 뜨게 한다.
// - 2026-10-05: 마우스 호버에서만 연다. 클릭·포커스로 남지 않게 해서 3D 화면을 가리지 않는다.
// - 2026-08-28: z-[400] — 플로팅 의뢰상세(z-300)·중첩 모달(z-320) 위. z-200이면 견적 툴팁이 패널에 가려짐.
// - 2026-08-16: w-max + 대칭 px — 절대배치 툴팁이 max-w만으로 뷰포트만큼 넓어지지 않게.
import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/shared/ui/cn";

const TooltipProvider = ({
  delayDuration = 600,
  skipDelayDuration = 0,
  ...props
}: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider>) => (
  <TooltipPrimitive.Provider
    delayDuration={delayDuration}
    skipDelayDuration={skipDelayDuration}
    {...props}
  />
);

type TooltipHoverGate = {
  hovering: React.MutableRefObject<boolean>;
  justClicked: React.MutableRefObject<boolean>;
  dismiss: () => void;
};

const TooltipHoverContext = React.createContext<TooltipHoverGate | null>(null);

const Tooltip = ({
  children,
  open: openProp,
  defaultOpen,
  onOpenChange,
  disableHoverableContent = true,
  ...props
}: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>) => {
  const hovering = React.useRef(false);
  const justClicked = React.useRef(false);
  const [uncontrolled, setUncontrolled] = React.useState(Boolean(defaultOpen));
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : uncontrolled;
  const handleOpenChange = (next: boolean) => {
    if (next && (!hovering.current || justClicked.current)) return;
    if (!controlled) setUncontrolled(next);
    onOpenChange?.(next);
  };
  const dismissRef = React.useRef(() => {});
  dismissRef.current = () => {
    justClicked.current = true;
    if (!controlled) setUncontrolled(false);
    onOpenChange?.(false);
  };
  const gate = React.useMemo(
    () => ({ hovering, justClicked, dismiss: () => dismissRef.current() }),
    [],
  );
  return (
    <TooltipHoverContext.Provider value={gate}>
      <TooltipPrimitive.Root
        {...props}
        disableHoverableContent={disableHoverableContent}
        open={open}
        onOpenChange={handleOpenChange}
      >
        {children}
      </TooltipPrimitive.Root>
    </TooltipHoverContext.Provider>
  );
};

/** Button `disabled:pointer-events-none` 때문에 disabled 트리거엔 호버가 안 온다. */
function isDisabledTooltipChild(child: React.ReactElement): boolean {
  const props = child.props as {
    disabled?: boolean;
    "aria-disabled"?: boolean | "true" | "false";
  };
  return (
    props.disabled === true ||
    props["aria-disabled"] === true ||
    props["aria-disabled"] === "true"
  );
}

function disabledTooltipWrapClassName(child: React.ReactElement): string {
  const className = String(
    (child.props as { className?: unknown }).className ?? "",
  );
  if (/\b(w-full|flex-1|grow|block)\b/.test(className)) {
    return "flex w-full max-w-full";
  }
  return "inline-flex max-w-full";
}

const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>
>(
  (
    { onPointerEnter, onPointerLeave, onPointerDown, asChild, children, ...props },
    ref,
  ) => {
    const gate = React.useContext(TooltipHoverContext);
    const triggerChild =
      asChild &&
      React.isValidElement(children) &&
      isDisabledTooltipChild(children) ? (
        <span className={disabledTooltipWrapClassName(children)}>
          {children}
        </span>
      ) : (
        children
      );
    return (
      <TooltipPrimitive.Trigger
        ref={ref}
        asChild={asChild}
        {...props}
        onPointerEnter={(event) => {
          if (gate) gate.hovering.current = true;
          onPointerEnter?.(event);
        }}
        onPointerLeave={(event) => {
          if (gate) {
            gate.hovering.current = false;
            gate.justClicked.current = false;
          }
          onPointerLeave?.(event);
        }}
        onPointerDown={(event) => {
          gate?.dismiss();
          onPointerDown?.(event);
        }}
      >
        {triggerChild}
      </TooltipPrimitive.Trigger>
    );
  },
);
TooltipTrigger.displayName = TooltipPrimitive.Trigger.displayName;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "pointer-events-none z-[400] w-max max-w-[min(100vw-2rem,20rem)] overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };

import {
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
  type UIEvent,
} from "react";
import { cn } from "@/shared/ui/cn";

type HorizontalScrollTopProps = {
  children: ReactNode;
  className?: string;
  /** Extra classes for the scroll body (content row). */
  bodyClassName?: string;
  /** Sticky top offset under an existing sticky header (e.g. "2.5rem"). */
  stickyTopClassName?: string;
  /**
   * Optional external ref for the body scroll element
   * (e.g. mailbox shelf scrollContainerRef).
   */
  bodyRef?: React.RefObject<HTMLDivElement | null>;
  onBodyTouchStart?: (e: React.TouchEvent<HTMLDivElement>) => void;
  onBodyTouchEnd?: (e: React.TouchEvent<HTMLDivElement>) => void;
};

/**
 * Horizontal scroll with the scrollbar stuck to the top of the scrollport.
 * Non-touch (mouse) users can pan without hunting for a bar at the content bottom.
 */
export function HorizontalScrollTop({
  children,
  className,
  bodyClassName,
  stickyTopClassName = "top-0",
  bodyRef: bodyRefProp,
  onBodyTouchStart,
  onBodyTouchEnd,
}: HorizontalScrollTopProps) {
  const topRef = useRef<HTMLDivElement>(null);
  const innerBodyRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  const getBody = useCallback(() => {
    return bodyRefProp?.current ?? innerBodyRef.current;
  }, [bodyRefProp]);

  const syncSpacerWidth = useCallback(() => {
    const body = getBody();
    const spacer = spacerRef.current;
    if (!body || !spacer) return;
    const next = `${Math.max(body.scrollWidth, body.clientWidth)}px`;
    if (spacer.style.width !== next) spacer.style.width = next;
  }, [getBody]);

  useEffect(() => {
    const body = getBody();
    if (!body) return;

    syncSpacerWidth();
    const ro = new ResizeObserver(() => syncSpacerWidth());
    ro.observe(body);
    for (const child of Array.from(body.children)) {
      if (child instanceof Element) ro.observe(child);
    }

    const onWindowResize = () => syncSpacerWidth();
    window.addEventListener("resize", onWindowResize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onWindowResize);
    };
  }, [getBody, syncSpacerWidth, children]);

  const setBodyRef = useCallback(
    (node: HTMLDivElement | null) => {
      innerBodyRef.current = node;
      if (bodyRefProp && "current" in bodyRefProp) {
        (bodyRefProp as React.MutableRefObject<HTMLDivElement | null>).current =
          node;
      }
    },
    [bodyRefProp],
  );

  const onTopScroll = (e: UIEvent<HTMLDivElement>) => {
    if (syncingRef.current) return;
    const body = getBody();
    if (!body) return;
    syncingRef.current = true;
    body.scrollLeft = e.currentTarget.scrollLeft;
    syncingRef.current = false;
  };

  const onBodyScroll = (e: UIEvent<HTMLDivElement>) => {
    if (syncingRef.current) return;
    const top = topRef.current;
    if (!top) return;
    syncingRef.current = true;
    top.scrollLeft = e.currentTarget.scrollLeft;
    syncingRef.current = false;
  };

  return (
    <div className={cn("relative min-w-0", className)}>
      <div
        ref={topRef}
        className={cn(
          "sticky z-30 overflow-x-auto overflow-y-hidden bg-background/90 backdrop-blur-sm",
          "custom-scrollbar [scrollbar-gutter:stable]",
          stickyTopClassName,
        )}
        onScroll={onTopScroll}
        aria-hidden
      >
        <div ref={spacerRef} className="h-2.5 min-w-full" />
      </div>
      <div
        ref={setBodyRef}
        className={cn(
          "min-w-0 overflow-x-auto overflow-y-visible [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          bodyClassName,
        )}
        onScroll={onBodyScroll}
        onTouchStart={onBodyTouchStart}
        onTouchEnd={onBodyTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}

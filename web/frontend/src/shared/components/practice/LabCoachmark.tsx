// 기공소 AI 보철 — 작업 위저드 말풍선. `data-coach` 대상 버튼 옆에 붙고, 대상이 안 보이면 작업영역 아래에 둔다.

import { useLayoutEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/shared/ui/cn";

type Props = {
  container: HTMLElement | null;
  /** 앞에서부터 처음 보이는 `data-coach` 대상을 가리킨다. */
  targets: readonly string[];
  title: ReactNode;
  body: ReactNode;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
};

type Anchor = {
  x: number;
  y: number;
  top: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};

const BUBBLE_WIDTH = 280;
const GAP = 12;

function findAnchor(container: HTMLElement, targets: readonly string[]): Anchor | null {
  const box = container.getBoundingClientRect();
  for (const target of targets) {
    const nodes = container.querySelectorAll<HTMLElement>(`[data-coach="${target}"]`);
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      if (rect.bottom < box.top || rect.top > box.bottom) continue;
      return {
        x: rect.left - box.left + rect.width / 2,
        y: rect.top - box.top + rect.height / 2,
        top: rect.top - box.top,
        bottom: rect.bottom - box.top,
        left: rect.left - box.left,
        width: rect.width,
        height: rect.height,
      };
    }
  }
  return null;
}

function sameAnchor(a: Anchor | null, b: Anchor | null) {
  if (!a || !b) return a === b;
  return (
    Math.abs(a.x - b.x) < 0.5 &&
    Math.abs(a.y - b.y) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

export function LabCoachmark({
  container,
  targets,
  title,
  body,
  canPrev,
  canNext,
  onPrev,
  onNext,
}: Props) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const targetKey = targets.join("|");

  useLayoutEffect(() => {
    if (!container) return;
    const sync = () => {
      const next = findAnchor(container, targets);
      setAnchor((prev) => (sameAnchor(prev, next) ? prev : next));
      setSize((prev) =>
        prev.width === container.clientWidth && prev.height === container.clientHeight
          ? prev
          : { width: container.clientWidth, height: container.clientHeight },
      );
    };
    sync();
    const timer = window.setInterval(sync, 400);
    window.addEventListener("resize", sync);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", sync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container, targetKey]);

  const arrows = (
    <>
      <button
        type="button"
        className="pointer-events-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20 hover:bg-white/30 disabled:opacity-40"
        aria-label="이전 단계"
        disabled={!canPrev}
        onClick={onPrev}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className="pointer-events-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20 hover:bg-white/30 disabled:opacity-40"
        aria-label="다음 단계"
        disabled={!canNext}
        onClick={onNext}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </>
  );

  const content = (
    <>
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 font-semibold">{title}</p>
        {arrows}
      </div>
      <p className="mt-1 break-keep leading-relaxed text-white/90">{body}</p>
    </>
  );

  if (!anchor || size.width === 0) {
    return (
      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-30 flex justify-center">
        <div className="pointer-events-auto w-max max-w-full rounded-lg bg-sky-500 px-3.5 py-2.5 text-xs text-white shadow-lg">
          {content}
        </div>
      </div>
    );
  }

  const width = Math.min(BUBBLE_WIDTH, size.width - 24);
  const below = anchor.bottom + GAP + 96 < size.height;
  const left = Math.min(Math.max(12, anchor.x - width / 2), size.width - width - 12);
  const arrowLeft = Math.min(Math.max(14, anchor.x - left), width - 14);

  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute z-30 rounded-md ring-2 ring-sky-400 ring-offset-2 ring-offset-transparent"
        style={{
          left: anchor.left - 2,
          top: anchor.top - 2,
          width: anchor.width + 4,
          height: anchor.height + 4,
        }}
      />
      <div
        className="pointer-events-none absolute z-30"
        style={
          below
            ? { left, top: anchor.bottom + GAP, width }
            : { left, bottom: size.height - anchor.top + GAP, width }
        }
      >
        <div className="pointer-events-auto relative rounded-lg bg-sky-500 px-3.5 py-2.5 text-xs text-white shadow-lg">
          <span
            aria-hidden
            className={cn(
              "absolute h-3 w-3 rotate-45 bg-sky-500",
              below ? "-top-1.5" : "-bottom-1.5",
            )}
            style={{ left: arrowLeft - 6 }}
          />
          {content}
        </div>
      </div>
    </>
  );
}

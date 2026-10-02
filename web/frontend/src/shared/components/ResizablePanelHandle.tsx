// 뷰어 오른쪽 패널 가로폭 조절. 폭(rem)은 storageKey로 저장한다.
import { useState, type CSSProperties } from "react";

const MIN_REM = 16;
const MAX_REM = 44;
const DEFAULT_REM = 22;

function clampRem(rem: number) {
  return Math.min(MAX_REM, Math.max(MIN_REM, rem));
}

export function useResizablePanelWidth(storageKey: string) {
  const [rem, setRem] = useState(() => {
    try {
      const saved = Number(window.localStorage.getItem(storageKey));
      return Number.isFinite(saved) && saved > 0 ? clampRem(saved) : DEFAULT_REM;
    } catch {
      return DEFAULT_REM;
    }
  });
  const save = (next: number) => {
    try {
      window.localStorage.setItem(storageKey, String(next));
    } catch {
      /* 저장이 막혀도 이번 화면에서는 유지한다. */
    }
  };
  return {
    rem,
    setRem,
    save,
    style: { "--panel-w": `${rem}rem` } as CSSProperties,
  };
}

/** 패널 왼쪽 가장자리(패널은 relative)에 둔다. md 미만에서는 숨긴다. */
export function ResizablePanelHandle({
  panel,
}: {
  panel: ReturnType<typeof useResizablePanelWidth>;
}) {
  const { rem, setRem, save } = panel;
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="패널 가로폭 조절"
      aria-valuemin={MIN_REM}
      aria-valuemax={MAX_REM}
      aria-valuenow={Math.round(rem)}
      tabIndex={0}
      title="드래그해서 패널 폭 조절"
      className="absolute -left-1 top-0 z-30 hidden h-full w-2 cursor-col-resize touch-none items-center justify-center hover:bg-primary/20 active:bg-primary/30 md:flex"
      onPointerDown={(event) => {
        event.preventDefault();
        const target = event.currentTarget;
        target.setPointerCapture(event.pointerId);
        const remPx =
          parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        let latest = rem;
        const move = (e: PointerEvent) => {
          latest = clampRem((window.innerWidth - e.clientX) / remPx);
          setRem(latest);
        };
        const up = () => {
          target.removeEventListener("pointermove", move);
          target.removeEventListener("pointerup", up);
          target.removeEventListener("pointercancel", up);
          save(latest);
        };
        target.addEventListener("pointermove", move);
        target.addEventListener("pointerup", up);
        target.addEventListener("pointercancel", up);
      }}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const next = clampRem(rem + (event.key === "ArrowLeft" ? 1 : -1));
        setRem(next);
        save(next);
      }}
    >
      <span className="h-8 w-0.5 rounded-full bg-border" />
    </div>
  );
}

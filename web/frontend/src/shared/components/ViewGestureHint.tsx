// 프리뷰·AI 디자인 마우스 안내. 그만보기를 누르기 전까지 화면 가운데에 둔다.
// related files:
// - web/frontend/src/shared/components/ModelPreviewDialog.tsx
// - web/frontend/src/shared/components/WorkScanModelPreviewDialog.tsx
// - web/frontend/src/shared/components/practice/LabProsthesisAiDesignDialog.tsx
import { useState } from "react";
import { Move, Pencil, RotateCw, ZoomIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CONTENT_MEASURED_CHROME_CLASS } from "@/shared/ui/contentMeasuredChrome";
import { cn } from "@/shared/ui/cn";

/** v3: 트랙패드 두 손가락 이동을 다시 보여 준다. */
const STORAGE_KEY = "abuts.viewGestureHint.v3.dismissed";

function dismissedForever(storageKey: string) {
  try {
    return window.localStorage.getItem(storageKey) === "1";
  } catch {
    return false;
  }
}

const GESTURE_ROWS = [
  { icon: Pencil, label: "왼쪽 드래그", action: "그리기" },
  { icon: RotateCw, label: "오른쪽·두 손가락 드래그", action: "화면 회전" },
  { icon: Move, label: "휠 버튼 드래그·두 손가락 스크롤", action: "이동" },
  { icon: ZoomIn, label: "마우스 휠·핀치", action: "확대·축소" },
] as const;

/** 뷰어 캔버스 전체를 덮고 카드를 가운데 둔다. 카드 밖은 클릭이 통과한다. */
export const VIEW_GESTURE_HINT_LAYER_CLASS =
  "pointer-events-none absolute inset-0 z-40 flex items-center justify-center p-6";

/** 카드만. 위치는 뷰어가 잡는다. storageKey를 나누면 화면마다 그만보기가 따로다. */
export function ViewGestureHint({
  className,
  storageKey = STORAGE_KEY,
}: {
  className?: string;
  storageKey?: string;
}) {
  const [gone, setGone] = useState(() => dismissedForever(storageKey));
  if (gone) return null;
  const dismiss = () => {
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      /* 저장이 막혀도 이번 화면에서는 숨긴다. */
    }
    setGone(true);
  };
  return (
    <div
      role="dialog"
      aria-label="화면 조작"
      className={cn(
        CONTENT_MEASURED_CHROME_CLASS,
        "pointer-events-auto overflow-hidden rounded-2xl border-2 border-yellow-400 bg-white text-center shadow-[0_16px_40px_rgba(202,138,4,0.28)]",
        className,
      )}
    >
      <p className="px-5 pt-3 text-sm font-bold text-yellow-950">화면 조작</p>
      <ul className="flex flex-col gap-1.5 px-4 py-3 text-left">
        {GESTURE_ROWS.map(({ icon: Icon, label, action }) => (
          <li key={label} className="flex items-center gap-3 rounded-lg bg-yellow-50 px-3 py-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-yellow-950">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1 text-[0.8125rem] text-muted-foreground">{label}</span>
            <span className="shrink-0 text-sm font-semibold text-foreground">{action}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-center gap-2 border-t border-yellow-200 px-4 py-2.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 border-yellow-300 bg-white px-3 text-foreground hover:bg-yellow-50"
          onClick={() => setGone(true)}
        >
          닫기
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-8 bg-yellow-400 px-3 font-semibold text-yellow-950 hover:bg-yellow-300"
          onClick={dismiss}
        >
          그만보기
        </Button>
      </div>
    </div>
  );
}

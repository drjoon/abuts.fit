// 프리뷰·AI 디자인 마우스 안내. 그만보기를 누르기 전까지 화면 아래에 둔다.
// related files:
// - web/frontend/src/shared/components/ModelPreviewDialog.tsx
// - web/frontend/src/shared/components/WorkScanModelPreviewDialog.tsx
// - web/frontend/src/shared/components/practice/LabProsthesisAiDesignDialog.tsx
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { CONTENT_MEASURED_CHROME_CLASS } from "@/shared/ui/contentMeasuredChrome";
import { cn } from "@/shared/ui/cn";

const STORAGE_KEY = "abuts.viewGestureHint.dismissed";

function dismissedForever() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** 카드만. 위치는 뷰어가 잡는다. */
export function ViewGestureHint({ className }: { className?: string }) {
  const [gone, setGone] = useState(dismissedForever);
  if (gone) return null;
  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* 저장이 막혀도 이번 화면에서는 숨긴다. */
    }
    setGone(true);
  };
  return (
    <div
      className={cn(
        CONTENT_MEASURED_CHROME_CLASS,
        "pointer-events-auto rounded-xl border bg-background/95 px-3 py-2 text-center shadow-lg backdrop-blur",
        className,
      )}
    >
      <p className="text-xs leading-relaxed text-foreground">
        왼쪽 드래그: 그리기
        <br />
        오른쪽 드래그: 화면 회전
        <br />
        휠 버튼 드래그: 이동
        <br />
        휠: 확대·축소
      </p>
      <div className="mt-2 flex items-center justify-center gap-1.5">
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={() => setGone(true)}>
          닫기
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={dismiss}>
          그만보기
        </Button>
      </div>
    </div>
  );
}

// 3D·이미지 프리뷰 공통 헤더 기능. 페인트, 채팅 첨부, 칼라 매핑.
// 의뢰 파일 프리뷰와 작업 스캔 프리뷰가 같은 모양·동작을 쓴다.
// related files:
// - web/frontend/src/shared/components/ModelPreviewDialog.tsx
// - web/frontend/src/shared/components/WorkScanModelPreviewDialog.tsx
// - web/frontend/src/shared/components/practice/ViewPaintSurface.tsx
// - web/frontend/src/features/requests/components/StlPreviewViewer.tsx
import { useEffect, useRef, useState } from "react";
import { Eraser, Paperclip, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  VIEW_PAINT_COLORS,
  ViewPaintSurface,
  paintNoteFileName,
  viewPaintColorLabel,
  type ViewPaintHandle,
} from "@/shared/components/practice/ViewPaintSurface";
import { useToast } from "@/shared/hooks/use-toast";
import { cn } from "@/shared/ui/cn";

export const PREVIEW_HEADER_BUTTON_CLASS = "h-8 gap-1 px-2.5 [&_svg]:!size-3.5";

/** 프리뷰 위 토스트를 눌러도 프리뷰가 닫히지 않게 `onInteractOutside`에 건다. */
export function keepOpenOnToastInteract(event: { target: EventTarget | null; preventDefault: () => void }) {
  const target = event.target;
  if (target instanceof Element && target.closest("[data-app-toast-viewport]")) {
    event.preventDefault();
  }
}

/** 닫히면 표시를 지우고, `resetKey`가 바뀌면 페인트를 끈다. */
export function usePreviewPaint({ open, resetKey }: { open: boolean; resetKey: string }) {
  const paintRef = useRef<ViewPaintHandle | null>(null);
  const [paintOn, setPaintOn] = useState(false);
  const [paintColor, setPaintColor] = useState<string>(VIEW_PAINT_COLORS[0]);
  const [paintInk, setPaintInk] = useState(false);

  useEffect(() => {
    if (open) return;
    setPaintOn(false);
    setPaintInk(false);
    paintRef.current?.clear();
  }, [open]);

  useEffect(() => {
    setPaintOn(false);
    setPaintInk(false);
  }, [resetKey]);

  return { paintRef, paintOn, setPaintOn, paintColor, setPaintColor, paintInk, setPaintInk };
}

export type PreviewPaintState = ReturnType<typeof usePreviewPaint>;

export function PreviewPaintControls({
  paint,
  disabled,
}: {
  paint: PreviewPaintState;
  disabled?: boolean;
}) {
  const { paintRef, paintOn, setPaintOn, paintColor, setPaintColor, paintInk } = paint;
  return (
    <div className="mr-3 flex items-center gap-1.5">
      <Button
        type="button"
        size="sm"
        variant={paintOn ? "default" : "outline"}
        className={PREVIEW_HEADER_BUTTON_CLASS}
        disabled={disabled}
        aria-pressed={paintOn}
        aria-label="페인트"
        onClick={() => setPaintOn((on) => !on)}
        title="화면 위에 표시를 그립니다"
      >
        <Pencil />
        <span className="hidden sm:inline">페인트</span>
      </Button>
      {paintOn
        ? VIEW_PAINT_COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              className={cn(
                "h-5 w-5 rounded-full border border-black/10",
                paintColor === swatch && "ring-2 ring-primary ring-offset-1",
              )}
              style={{ backgroundColor: swatch }}
              aria-label={viewPaintColorLabel(swatch)}
              onClick={() => setPaintColor(swatch)}
            />
          ))
        : null}
      {paintOn && paintInk ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={PREVIEW_HEADER_BUTTON_CLASS}
          title="표시 지우기"
          aria-label="표시 지우기"
          onClick={() => paintRef.current?.clear()}
        >
          <Eraser />
          <span className="hidden sm:inline">표시 지우기</span>
        </Button>
      ) : null}
    </div>
  );
}

/**
 * 현재 뷰에 표시를 겹친 PNG를 채팅 입력에 넣는다. 표시가 없으면 누를 수 없다.
 * 여러 장을 연달아 붙일 수 있게 프리뷰는 열어 둔다.
 */
export function PreviewChatAttachButton({
  paint,
  disabled,
  captureCanvas,
  fileName,
  onAttachChatFile,
}: {
  paint: PreviewPaintState;
  disabled?: boolean;
  captureCanvas: () => HTMLCanvasElement | null;
  fileName: string;
  onAttachChatFile: (file: File) => void;
}) {
  const { toast } = useToast();
  const attach = async () => {
    const base = captureCanvas();
    const blob = base ? await paint.paintRef.current?.compositePng(base) : null;
    if (!blob) return;
    onAttachChatFile(new File([blob], paintNoteFileName(fileName), { type: "image/png" }));
    toast({ title: "채팅 첨부되었습니다", duration: 2000 });
  };
  return (
    <Button
      type="button"
      size="sm"
      className={PREVIEW_HEADER_BUTTON_CLASS}
      disabled={disabled || !paint.paintInk}
      onClick={() => void attach()}
      title="표시가 입혀진 이미지를 채팅에 첨부합니다"
      aria-label="채팅 첨부"
    >
      <Paperclip />
      <span className="hidden sm:inline">채팅 첨부</span>
    </Button>
  );
}

export function PreviewPaintLayer({
  paint,
  surfaceKey,
}: {
  paint: PreviewPaintState;
  surfaceKey: string;
}) {
  return (
    <ViewPaintSurface
      key={surfaceKey}
      ref={paint.paintRef}
      enabled={paint.paintOn}
      color={paint.paintColor}
      onInkChange={paint.setPaintInk}
    />
  );
}

export function PreviewColorMappingToggle({
  checked,
  onCheckedChange,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "absolute left-3 top-3 z-20 flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white/95 px-2.5 py-1.5 text-[11px] font-medium text-slate-800 shadow-sm sm:text-xs",
        className,
      )}
      title="스캔 칼라(텍스처·버텍스 컬러) 표시"
    >
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="h-5 w-9 data-[state=checked]:bg-primary [&>span]:h-4 [&>span]:w-4 data-[state=checked]:[&>span]:translate-x-4"
        aria-label="칼라 매핑"
      />
      칼라 매핑
    </label>
  );
}

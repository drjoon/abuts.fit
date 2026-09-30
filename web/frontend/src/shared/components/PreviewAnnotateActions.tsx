// 3D·이미지 프리뷰 공통 헤더 기능. 페인트, 칼라 매핑.
// 의뢰 파일 프리뷰와 작업 스캔 프리뷰가 같은 모양·동작을 쓴다.
// - 2026-09-30: 채팅 첨부는 썸네일로 남고, 「AI에게」는 프리뷰의 AI 패널로 넘긴다. 패널에 페인트 아이콘.
// - 2026-09-29: 페인트를 켜면 뷰 위에 도구 막대(도형·글자·되돌리기, 이미지 저장·채팅 첨부). 헤더에는 페인트 토글만.
// related files:
// - web/frontend/src/shared/components/ModelPreviewDialog.tsx
// - web/frontend/src/shared/components/WorkScanModelPreviewDialog.tsx
// - web/frontend/src/shared/components/practice/ViewPaintSurface.tsx
// - web/frontend/src/shared/components/practice/ViewPaintToolbar.tsx
// - web/frontend/src/features/requests/components/StlPreviewViewer.tsx
import { Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  ViewPaintSurface,
  downloadBlobFile,
  paintNoteFileName,
} from "@/shared/components/practice/ViewPaintSurface";
import {
  ViewPaintToolbar,
  useViewPaint,
  viewPaintSurfaceProps,
  type ViewPaintState,
} from "@/shared/components/practice/ViewPaintToolbar";
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

export const usePreviewPaint = useViewPaint;

export type PreviewPaintState = ViewPaintState;

export function PreviewPaintControls({
  paint,
  disabled,
}: {
  paint: PreviewPaintState;
  disabled?: boolean;
}) {
  const { paintOn, setPaintOn } = paint;
  return (
    <Button
      type="button"
      size="sm"
      variant={paintOn ? "default" : "outline"}
      className={cn(PREVIEW_HEADER_BUTTON_CLASS, "mr-3")}
      disabled={disabled}
      aria-pressed={paintOn}
      aria-label="페인트"
      onClick={() => setPaintOn((on) => !on)}
      title="화면 위에 표시를 그립니다"
    >
      <Pencil />
      <span className="hidden sm:inline">페인트</span>
    </Button>
  );
}

/**
 * 표시 레이어와 도구 막대. 채팅 첨부는 현재 뷰에 표시를 겹친 PNG를 입력에 넣고,
 * 같은 이미지를 막대 위 썸네일로 남긴다. 「AI에게」는 이 프리뷰의 AI 패널로 넘긴다.
 */
export function PreviewPaintLayer({
  paint,
  surfaceKey,
  captureCanvas,
  fileName,
  onAttachChatFile,
  onRemoveChatFile,
  onReorderChatFiles,
}: {
  paint: PreviewPaintState;
  surfaceKey: string;
  captureCanvas: () => HTMLCanvasElement | null;
  fileName: string;
  onAttachChatFile?: (file: File) => void;
  onRemoveChatFile?: (file: File) => void;
  onReorderChatFiles?: (files: File[]) => void;
}) {
  const { toast } = useToast();
  const [aiShots, setAiShots] = useState<Array<{ id: string; url: string }>>([]);
  const aiShotsRef = useRef(aiShots);
  aiShotsRef.current = aiShots;
  useEffect(() => {
    return () => {
      for (const shot of aiShotsRef.current) URL.revokeObjectURL(shot.url);
    };
  }, []);
  const composite = async () => {
    const base = captureCanvas();
    return base ? ((await paint.paintRef.current?.compositePng(base)) ?? null) : null;
  };
  const saveImage = async () => {
    const blob = await composite();
    if (blob) downloadBlobFile(blob, paintNoteFileName(fileName));
  };
  const attach = async () => {
    if (!onAttachChatFile) return null;
    const blob = await composite();
    if (!blob) return null;
    const file = new File([blob], paintNoteFileName(fileName), { type: "image/png" });
    onAttachChatFile(file);
    toast({ title: "채팅 첨부되었습니다", duration: 2000 });
    return file;
  };
  const sendToAi = async () => {
    const blob = await composite();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    setAiShots((prev) => [...prev, { id: `${Date.now().toString(36)}-${prev.length}`, url }].slice(-12));
  };
  return (
    <>
      <ViewPaintSurface key={surfaceKey} {...viewPaintSurfaceProps(paint)} />
      {paint.paintOn ? (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center">
          <ViewPaintToolbar
            paint={paint}
            onSaveImage={() => void saveImage()}
            onAttachChat={onAttachChatFile ? attach : undefined}
            onRemoveChatFile={onRemoveChatFile}
            onReorderChatFiles={onReorderChatFiles}
            onSendToAi={() => void sendToAi()}
          />
        </div>
      ) : null}
      {aiShots.length > 0 ? (
        <div className="pointer-events-auto absolute bottom-4 right-3 z-30 flex w-[min(16rem,calc(100%-1.5rem))] flex-col overflow-hidden rounded-lg border bg-background/95 text-sm shadow-md">
          <div className="flex items-center gap-1.5 border-b px-2.5 py-2 font-semibold text-foreground">
            <Pencil className="h-4 w-4" />
            AI
          </div>
          <div className="max-h-48 space-y-2 overflow-y-auto p-2">
            {aiShots.map((shot, index) => (
              <div key={shot.id} className="ml-4 rounded-md bg-primary/10 p-1.5">
                <img src={shot.url} alt={`페인트 표시 ${index + 1}`} className="max-h-24 w-full rounded object-contain" />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
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

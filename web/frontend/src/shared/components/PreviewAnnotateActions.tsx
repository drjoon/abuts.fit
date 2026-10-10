// 3D·이미지 프리뷰 공통 헤더 기능. 페인트, 칼라 매핑.
// 의뢰 파일 프리뷰와 작업 스캔 프리뷰가 같은 모양·동작을 쓴다.
// - 2026-10-07: 작업 파일 채팅 첨부는 썸네일 PNG. 클릭 시 작업 파일(페인트)을 연다.
// - 2026-10-01: 3D 프리뷰 페인트는 모델에 붙는다. 같은 ViewPaintSurface를 AI 디자인도 쓴다.
// - 2026-09-30: 프리뷰에는 「AI에게」와 오른쪽 아래 AI 채팅을 두지 않는다. 채팅 첨부는 썸네일로 남긴다.
// - 2026-09-29: 페인트를 켜면 뷰 위에 도구 막대(도형·글자·되돌리기, 이미지 저장·채팅 첨부). 헤더에는 페인트 토글만.
// related files:
// - web/frontend/src/shared/components/ModelPreviewDialog.tsx
// - web/frontend/src/shared/components/WorkScanModelPreviewDialog.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
// - web/frontend/src/shared/components/practice/ViewPaintSurface.tsx
// - web/frontend/src/shared/components/practice/ViewPaintToolbar.tsx
// - web/frontend/src/features/requests/components/StlPreviewViewer.tsx
import { Pencil } from "lucide-react";

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
import type { PaintShape } from "@/shared/components/practice/viewPaintGeom";
import type { ViewPaintSpace } from "@/shared/components/practice/viewPaintSpace";
import { markChatFileOpensWorkFiles } from "@/shared/chat/chatOpenWorkFiles";
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
  className,
  iconOnly = false,
}: {
  paint: PreviewPaintState;
  disabled?: boolean;
  className?: string;
  /** 글자 없이 연필 아이콘만. */
  iconOnly?: boolean;
}) {
  const { paintOn, setPaintOn } = paint;
  return (
    <Button
      type="button"
      size="sm"
      variant={paintOn ? "default" : "outline"}
      className={cn(
        iconOnly
          ? "h-8 w-8 shrink-0 gap-0 px-0 [&_svg]:!size-4"
          : PREVIEW_HEADER_BUTTON_CLASS,
        className ?? "mr-3",
        paintOn && "!bg-primary !text-primary-foreground hover:!bg-primary/90",
      )}
      disabled={disabled}
      aria-pressed={paintOn}
      aria-label="페인트"
      onClick={() => setPaintOn((on) => !on)}
      title="왼쪽 드래그로 표시를 그립니다. 오른쪽 드래그는 화면 회전, 휠 버튼은 이동입니다."
    >
      <Pencil />
      {iconOnly ? null : <span className="hidden sm:inline">페인트</span>}
    </Button>
  );
}

/**
 * 표시 레이어와 도구 막대. 채팅 첨부는 현재 뷰에 표시를 겹친 PNG를 입력에 넣고,
 * 같은 이미지를 막대 위 썸네일로 남긴다. 프리뷰에는 AI 전달·AI 채팅을 두지 않는다.
 */
export function PreviewPaintLayer({
  paint,
  surfaceKey,
  captureCanvas,
  fileName,
  space = null,
  onAttachChatFile,
  onRemoveChatFile,
  onReorderChatFiles,
  onShapesCommit,
  attachOpensWorkFiles = false,
  onBeforeAttach,
}: {
  paint: PreviewPaintState;
  surfaceKey: string;
  captureCanvas: () => HTMLCanvasElement | null;
  fileName: string;
  /** 3D 프리뷰. 이미지 프리뷰는 null. */
  space?: ViewPaintSpace | null;
  onAttachChatFile?: (file: File) => void;
  onRemoveChatFile?: (file: File) => void;
  onReorderChatFiles?: (files: File[]) => void;
  onShapesCommit?: (shapes: PaintShape[]) => void;
  /** 채팅 썸네일 클릭 시 작업 파일(페인트 포함)을 연다. */
  attachOpensWorkFiles?: boolean;
  onBeforeAttach?: () => void | Promise<void>;
}) {
  const { toast } = useToast();
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
    await onBeforeAttach?.();
    const blob = await composite();
    if (!blob) return null;
    const name = attachOpensWorkFiles
      ? paintNoteFileName("작업파일")
      : paintNoteFileName(fileName);
    const file = new File([blob], name, { type: "image/png" });
    if (attachOpensWorkFiles) markChatFileOpensWorkFiles(file);
    onAttachChatFile(file);
    toast({
      title: "채팅 첨부되었습니다",
      duration: 2000,
      ...(attachOpensWorkFiles
        ? {
            description: "클릭하면 작업 파일이 열립니다.",
          }
        : {}),
    });
    return file;
  };
  return (
    <>
      <ViewPaintSurface
        key={surfaceKey}
        {...viewPaintSurfaceProps(paint)}
        space={space}
        onShapesCommit={onShapesCommit}
      />
      {paint.paintOn ? (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center">
          <ViewPaintToolbar
            paint={paint}
            onSaveImage={() => void saveImage()}
            onAttachChat={onAttachChatFile ? attach : undefined}
            onRemoveChatFile={onRemoveChatFile}
            onReorderChatFiles={onReorderChatFiles}
          />
        </div>
      ) : null}
    </>
  );
}

export function PreviewColorMappingToggle({
  checked,
  onCheckedChange,
  className,
  disabled = false,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
  /** 스캔 칼라가 없는 파일(STL 등). 토글은 보이되 누를 수 없다. */
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "absolute left-3 top-3 z-20 flex h-8 items-center gap-2 rounded-md border border-slate-200 bg-white/95 px-2.5 text-xs font-medium text-slate-800 shadow-sm",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        className,
      )}
      title={
        disabled
          ? "이 파일에는 스캔 칼라가 없습니다"
          : "스캔 칼라(텍스처·버텍스 컬러) 표시"
      }
    >
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="h-5 w-9 data-[state=checked]:bg-primary [&>span]:h-4 [&>span]:w-4 data-[state=checked]:[&>span]:translate-x-4"
        aria-label="스캔색"
      />
      스캔색
    </label>
  );
}

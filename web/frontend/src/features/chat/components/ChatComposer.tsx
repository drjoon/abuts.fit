// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/hooks/useBackgroundTempUpload.ts
// - web/frontend/src/shared/components/upload/BackgroundUploadList.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferMobileOralPhotoIntake.tsx
// - 2026-08-21: textarea flex-1 제거·루트 shrink-0 — 채팅 레이아웃에서 입력칸이 내역 높이를 잠식하지 않게.
// - 2026-08-27: 모바일 사진찍기(capture) — 채팅에서 바로 촬영·업로드.
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Camera, Hash, Paperclip, Send } from "lucide-react";
import type { BackgroundUploadItem } from "@/shared/hooks/useBackgroundTempUpload";
import { BackgroundUploadList } from "@/shared/components/upload/BackgroundUploadList";
import {
  MessageReply,
  type ReplyToMessage,
} from "@/features/chat/components/MessageReply";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { useToast } from "@/shared/hooks/use-toast";
import { normalizeOralPhotoFiles } from "@/shared/components/practice/PracticeTransferMobileOralPhotoIntake";
import { cn } from "@/shared/ui/cn";

export type RequestPickItem = {
  requestId: string;
  patientName?: string;
  tooth?: string;
};

type Props = {
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;

  disabled?: boolean;
  isSending?: boolean;
  placeholder?: string;

  pendingUploads?: BackgroundUploadItem[];
  onPickFiles?: (files: File[]) => void;
  onRemovePendingFile?: (id: string) => void;
  onRetryPendingFile?: (id: string) => void;

  requestPicks?: RequestPickItem[];
  onInsertRequestId?: (requestId: string) => void;

  replyTo?: ReplyToMessage | null;
  onCancelReply?: () => void;

  /** 모달 등 — 하단 여백을 줄인 컴팩트 패딩 */
  compact?: boolean;
  className?: string;
};

export const ChatComposer = (props: Props) => {
  const {
    draft,
    onDraftChange,
    onSend,
    disabled,
    isSending,
    placeholder,
    pendingUploads,
    onPickFiles,
    onRemovePendingFile,
    onRetryPendingFile,
    requestPicks,
    onInsertRequestId,
    replyTo,
    onCancelReply,
    compact = false,
    className,
  } = props;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const isMobile = useIsMobile();
  const { toast } = useToast();

  const hasFiles = Array.isArray(pendingUploads) && pendingUploads.length > 0;
  const hasRequestPicks =
    Array.isArray(requestPicks) && requestPicks.length > 0;
  const canPickFiles = typeof onPickFiles === "function";
  const canInsertRequestId = typeof onInsertRequestId === "function";
  const controlsDisabled = !!disabled || !!isSending || cameraBusy;

  const sendDisabled =
    !!disabled || !!isSending || cameraBusy || (!draft.trim() && !hasFiles);

  const handleCameraFiles = (raw: File[]) => {
    if (!onPickFiles || !raw.length) return;
    setCameraBusy(true);
    void (async () => {
      try {
        const { files: normalized, skippedHeic, skippedEmpty } =
          await normalizeOralPhotoFiles(raw, { namePrefix: "채팅사진" });
        if (skippedEmpty > 0) {
          toast({
            title: "빈 사진은 올릴 수 없어요",
            description: "다시 촬영해 주세요.",
            variant: "destructive",
          });
        }
        if (skippedHeic > 0) {
          toast({
            title: "HEIC는 올릴 수 없어요",
            description: "카메라로 촬영하거나 JPG·PNG로 저장한 뒤 올려 주세요.",
            variant: "destructive",
          });
        }
        if (normalized.length) onPickFiles(normalized);
      } finally {
        setCameraBusy(false);
      }
    })();
  };

  const iconBtnClass = cn(
    "shrink-0",
    isMobile ? "h-11 w-11 touch-manipulation" : "h-9 w-9",
  );

  return (
    <div
      className={cn(
        "shrink-0 border-t space-y-2",
        isMobile
          ? "px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          : compact
            ? "px-3 pt-1.5 pb-1.5 sm:px-4"
            : "px-3 pt-3 pb-4 sm:px-4 sm:pt-4 sm:pb-6",
        className,
      )}
    >
      {replyTo ? (
        <MessageReply replyTo={replyTo} onCancelReply={onCancelReply} />
      ) : null}

      {hasFiles ? (
        <BackgroundUploadList
          items={pendingUploads!}
          onRemove={onRemovePendingFile}
          onRetry={onRetryPendingFile}
        />
      ) : null}

      <Textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        placeholder={placeholder || "메시지를 입력하세요"}
        className={cn(
          "resize-none",
          compact &&
            "min-h-0 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0",
          isMobile && "min-h-[4.5rem] text-base",
        )}
        rows={isMobile ? 2 : compact ? 2 : 3}
        disabled={!!disabled || !!isSending}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            if (e.nativeEvent.isComposing) return;
            e.preventDefault();
            onSend();
          }
        }}
      />

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {canPickFiles && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const list = e.target.files ? Array.from(e.target.files) : [];
                  e.target.value = "";
                  if (list.length) onPickFiles(list);
                }}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const list = e.target.files ? Array.from(e.target.files) : [];
                  e.target.value = "";
                  handleCameraFiles(list);
                }}
              />

              {isMobile ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 shrink-0 touch-manipulation gap-1.5 rounded-xl border-primary/30 bg-primary-soft/40 px-3 text-sm font-medium text-primary-strong hover:bg-primary-soft/70"
                  disabled={controlsDisabled}
                  aria-label="사진 찍기"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Camera className="h-4 w-4 shrink-0" />
                  사진찍기
                </Button>
              ) : (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={iconBtnClass}
                        disabled={controlsDisabled}
                        aria-label="사진 찍기"
                        onClick={() => cameraInputRef.current?.click()}
                      >
                        <Camera className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>사진 찍기</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={iconBtnClass}
                      disabled={controlsDisabled}
                      aria-label="파일 첨부"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip className={isMobile ? "h-5 w-5" : "h-4 w-4"} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>파일 첨부</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          )}

          {canInsertRequestId ? (
            <Popover open={requestOpen} onOpenChange={setRequestOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={iconBtnClass}
                  disabled={controlsDisabled || !hasRequestPicks}
                >
                  <Hash className={isMobile ? "h-5 w-5" : "h-4 w-4"} />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-2" align="start">
                <div className="space-y-1">
                  {hasRequestPicks
                    ? requestPicks!.map((r) => (
                        <button
                          key={r.requestId}
                          type="button"
                          className="w-full text-left rounded px-2 py-1 text-xs hover:bg-muted"
                          onClick={() => {
                            onInsertRequestId(r.requestId);
                            setRequestOpen(false);
                            window.requestAnimationFrame(() => {
                              textareaRef.current?.focus();
                            });
                          }}
                        >
                          <div className="font-medium">{r.requestId}</div>
                          {(r.patientName || r.tooth) && (
                            <div className="text-muted-foreground truncate">
                              {r.patientName || ""}
                              {r.tooth ? ` / ${r.tooth}` : ""}
                            </div>
                          )}
                        </button>
                      ))
                    : null}
                </div>
              </PopoverContent>
            </Popover>
          ) : null}
        </div>

        <Button
          type="button"
          size="icon"
          onClick={onSend}
          disabled={sendDisabled}
          className={cn(iconBtnClass, isMobile && "rounded-xl")}
          aria-label="보내기"
        >
          <Send className={isMobile ? "h-5 w-5" : "h-4 w-4"} />
        </Button>
      </div>
    </div>
  );
};

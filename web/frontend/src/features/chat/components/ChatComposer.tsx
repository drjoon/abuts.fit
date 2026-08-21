// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/hooks/useBackgroundTempUpload.ts
// - web/frontend/src/shared/components/upload/BackgroundUploadList.tsx
// - 2026-08-21: textarea flex-1 제거·루트 shrink-0 — 채팅 레이아웃에서 입력칸이 내역 높이를 잠식하지 않게.
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Hash, Paperclip, Send } from "lucide-react";
import type { BackgroundUploadItem } from "@/shared/hooks/useBackgroundTempUpload";
import { BackgroundUploadList } from "@/shared/components/upload/BackgroundUploadList";
import {
  MessageReply,
  type ReplyToMessage,
} from "@/features/chat/components/MessageReply";

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
  } = props;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);

  const hasFiles = Array.isArray(pendingUploads) && pendingUploads.length > 0;
  const hasRequestPicks =
    Array.isArray(requestPicks) && requestPicks.length > 0;
  const canPickFiles = typeof onPickFiles === "function";
  const canInsertRequestId = typeof onInsertRequestId === "function";

  const sendDisabled =
    !!disabled || !!isSending || (!draft.trim() && !hasFiles);

  return (
    <div className="shrink-0 border-t px-3 pt-3 pb-4 sm:px-4 sm:pt-4 sm:pb-6 space-y-2">
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
        className="resize-none"
        rows={3}
        disabled={!!disabled || !!isSending}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            if (e.nativeEvent.isComposing) return;
            e.preventDefault();
            onSend();
          }
        }}
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
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
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                disabled={!!disabled || !!isSending}
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="h-4 w-4" />
              </Button>
            </>
          )}

          {canInsertRequestId ? (
            <Popover open={requestOpen} onOpenChange={setRequestOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  disabled={!!disabled || !!isSending || !hasRequestPicks}
                >
                  <Hash className="h-4 w-4" />
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
          className="h-9 w-9"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

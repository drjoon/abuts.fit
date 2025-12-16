import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Hash, Paperclip, Send, X } from "lucide-react";
import type { TempUploadedFile } from "@/shared/hooks/useS3TempUpload";

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

  pendingFiles?: TempUploadedFile[];
  onPickFiles?: (files: File[]) => void;
  onRemovePendingFile?: (fileId: string) => void;

  requestPicks?: RequestPickItem[];
  onInsertRequestId?: (requestId: string) => void;
};

export const ChatComposer = (props: Props) => {
  const {
    draft,
    onDraftChange,
    onSend,
    disabled,
    isSending,
    placeholder,
    pendingFiles,
    onPickFiles,
    onRemovePendingFile,
    requestPicks,
    onInsertRequestId,
  } = props;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);

  const hasFiles = Array.isArray(pendingFiles) && pendingFiles.length > 0;
  const hasRequestPicks =
    Array.isArray(requestPicks) && requestPicks.length > 0;
  const canPickFiles = typeof onPickFiles === "function";
  const canInsertRequestId = typeof onInsertRequestId === "function";

  const sendDisabled =
    !!disabled || !!isSending || (!draft.trim() && !hasFiles);

  return (
    <div className="border-t px-3 pt-3 pb-4 sm:px-4 sm:pt-4 sm:pb-6 space-y-2">
      {hasFiles && (
        <div className="flex flex-wrap gap-2">
          {pendingFiles!.map((f) => (
            <div
              key={f._id}
              className="flex items-center gap-2 rounded border px-2 py-1 text-xs"
            >
              <span className="max-w-[220px] truncate">{f.originalName}</span>
              {typeof onRemovePendingFile === "function" && (
                <button
                  type="button"
                  className="opacity-70 hover:opacity-100"
                  onClick={() => onRemovePendingFile(f._id)}
                  aria-label="첨부 제거"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        placeholder={placeholder || "메시지를 입력하세요"}
        className="resize-none flex-1"
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

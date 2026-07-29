// related files:
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/shared/hooks/useChatRooms.ts
import type { RefObject } from "react";
import { Paperclip, Send, X, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { type ChatMessage } from "@/shared/hooks/useChatRooms";

export type PracticeTransferDialogSummaryItem = {
  label: string;
  value: string;
};

export type PracticeTransferDialogFileItem = {
  id: string;
  fileName: string;
  size: number;
  s3Key: string;
};

type PracticeTransferDetailChatDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  conversationTitle: string;
  summaryItems: PracticeTransferDialogSummaryItem[];
  memo: string;
  filesLabel: string;
  files: PracticeTransferDialogFileItem[];
  onDownloadAllFiles: () => void | Promise<void>;
  onDownloadTransferFile: (file: PracticeTransferDialogFileItem) => void | Promise<void>;
  chatLoading: boolean;
  chatError: string;
  chatMessages: ChatMessage[];
  isMyMessage: (senderId: string) => boolean;
  formatChatTime: (createdAt: string) => string;
  formatFileSize: (size: number) => string;
  onDownloadChatAttachment: (file: {
    fileName: string;
    fileSize: number;
    s3Key: string;
    s3Url: string;
  }) => void | Promise<void>;
  chatBottomRef: RefObject<HTMLDivElement | null>;
  chatAttachedFiles: File[];
  onRemoveAttachedChatFile: (index: number) => void;
  onAttachChatFiles: (files: FileList | null) => void;
  attachmentInputId: string;
  chatDraft: string;
  onChangeChatDraft: (value: string) => void;
  onSendChatMessage: () => void | Promise<void>;
  composerPlaceholder: string;
  inputDisabled: boolean;
  sendDisabled: boolean;
};

export function PracticeTransferDetailChatDialog({
  open,
  onOpenChange,
  title,
  conversationTitle,
  summaryItems,
  memo,
  filesLabel,
  files,
  onDownloadAllFiles,
  onDownloadTransferFile,
  chatLoading,
  chatError,
  chatMessages,
  isMyMessage,
  formatChatTime,
  formatFileSize,
  onDownloadChatAttachment,
  chatBottomRef,
  chatAttachedFiles,
  onRemoveAttachedChatFile,
  onAttachChatFiles,
  attachmentInputId,
  chatDraft,
  onChangeChatDraft,
  onSendChatMessage,
  composerPlaceholder,
  inputDisabled,
  sendDisabled,
}: PracticeTransferDetailChatDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-6xl h-[86vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4 text-blue-600" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 py-4 flex-1 min-h-0 overflow-hidden">
          <div className="grid h-full min-h-0 grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-lg border bg-muted/20 p-3 text-[15px] min-h-0 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {summaryItems.map((row, idx) => (
                  <div key={`${row.label}:${idx}`}>
                    <p className="text-muted-foreground">{row.label}</p>
                    <p className="font-medium break-words">{row.value || "-"}</p>
                  </div>
                ))}
              </div>

              <div>
                <p className="text-muted-foreground">의뢰 메모</p>
                <p className="mt-1 font-medium whitespace-pre-wrap break-words max-h-48 overflow-y-auto pr-1">
                  {memo || "-"}
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-muted-foreground">{filesLabel} ({files.length}개)</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void onDownloadAllFiles()}
                    disabled={files.length === 0}
                  >
                    전체 다운로드
                  </Button>
                </div>
                {files.length ? (
                  <div className="mt-2 max-h-40 overflow-y-auto pr-1 space-y-1">
                    {files.map((file, idx) => (
                      <button
                        key={`${file.id}:${idx}`}
                        type="button"
                        onClick={() => void onDownloadTransferFile(file)}
                        className="block w-full text-left rounded border px-2 py-1 text-sm hover:bg-muted/50"
                      >
                        {file.fileName} · {formatFileSize(Number(file.size || 0))}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="font-medium">-</p>
                )}
              </div>
            </div>

            <div className="rounded-lg border min-h-0 flex flex-col overflow-hidden">
              <div className="px-3 py-2 border-b text-sm text-muted-foreground">
                {conversationTitle}
              </div>

              <ScrollArea className="min-h-0 flex-1 px-3 py-3">
                <div className="space-y-2">
                  {chatLoading ? (
                    <div className="text-center text-sm text-muted-foreground py-4">
                      채팅을 불러오는 중입니다...
                    </div>
                  ) : null}

                  {!chatLoading && chatError ? (
                    <div className="text-center text-sm text-destructive py-4">
                      {chatError}
                    </div>
                  ) : null}

                  {!chatLoading && !chatError && chatMessages.length === 0 ? (
                    <div className="text-center text-sm text-muted-foreground py-4">
                      아직 메시지가 없습니다.
                    </div>
                  ) : null}

                  {chatMessages.map((message) => {
                    const senderId = String(message.sender?._id || "").trim();
                    const isMine = isMyMessage(senderId);
                    const senderName = String(message.sender?.name || "알 수 없음").trim();
                    return (
                      <div
                        key={message._id}
                        className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${isMine ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                        >
                          <p className="opacity-80 mb-1 font-medium">{senderName}</p>
                          <p className="opacity-70 mb-1">{formatChatTime(message.createdAt)}</p>
                          <p className="whitespace-pre-wrap break-words">{message.content}</p>
                          {Array.isArray(message.attachments) && message.attachments.length > 0 ? (
                            <div className="mt-2 space-y-1">
                              {message.attachments.map((file, idx) => {
                                const fileName = String(file?.fileName || "첨부파일").trim();
                                const fileSize = formatFileSize(Number(file?.fileSize || 0));
                                const s3Key = String(file?.s3Key || "").trim();
                                return s3Key ? (
                                  <button
                                    key={`${message._id}:file:${idx}`}
                                    type="button"
                                    onClick={() =>
                                      void onDownloadChatAttachment({
                                        fileName,
                                        fileSize: Number(file?.fileSize || 0),
                                        s3Key,
                                        s3Url: String(file?.s3Url || "").trim(),
                                      })
                                    }
                                    className="block w-full rounded border border-current/20 px-2 py-1 text-xs text-left underline-offset-2 hover:underline"
                                  >
                                    {fileName} · {fileSize}
                                  </button>
                                ) : (
                                  <div
                                    key={`${message._id}:file:${idx}`}
                                    className="rounded border border-current/20 px-2 py-1 text-xs"
                                  >
                                    {fileName} · {fileSize}
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={chatBottomRef} />
                </div>
              </ScrollArea>

              <div className="shrink-0 border-t bg-background px-3 pt-3 pb-4 sm:px-4 sm:pt-4 sm:pb-6 space-y-2">
                {chatAttachedFiles.length > 0 ? (
                  <div className="flex flex-wrap gap-2 max-h-20 overflow-y-auto pr-1">
                    {chatAttachedFiles.map((file, idx) => (
                      <span
                        key={`${file.name}:${file.size}:${file.lastModified}:${idx}`}
                        className="inline-flex max-w-full items-center gap-1.5 rounded border px-2 py-1 text-xs"
                      >
                        <span className="truncate max-w-[14rem] sm:max-w-[18rem]">{file.name}</span>
                        <span className="text-muted-foreground">{formatFileSize(file.size)}</span>
                        <button
                          type="button"
                          className="opacity-70 hover:opacity-100"
                          onClick={() => onRemoveAttachedChatFile(idx)}
                          aria-label="첨부파일 제거"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}

                <Textarea
                  value={chatDraft}
                  onChange={(e) => onChangeChatDraft(e.target.value)}
                  placeholder={composerPlaceholder}
                  className="resize-none"
                  rows={3}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void onSendChatMessage();
                    }
                  }}
                  disabled={inputDisabled}
                />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <input
                      id={attachmentInputId}
                      type="file"
                      className="hidden"
                      multiple
                      onChange={(e) => {
                        onAttachChatFiles(e.target.files);
                        e.currentTarget.value = "";
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => {
                        const input = document.getElementById(attachmentInputId) as HTMLInputElement | null;
                        input?.click();
                      }}
                      disabled={inputDisabled}
                      aria-label="파일 첨부"
                    >
                      <Paperclip className="h-4 w-4" />
                    </Button>
                  </div>

                  <Button
                    type="button"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => void onSendChatMessage()}
                    disabled={sendDisabled}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

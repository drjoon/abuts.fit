// related files:
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/shared/hooks/useChatRooms.ts
// - web/frontend/src/features/chat/components/ChatMessageBubble.tsx
// - web/frontend/src/features/chat/components/MessageReply.tsx
import type { RefObject } from "react";
import { Paperclip, Send, X, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { type ChatMessage } from "@/shared/hooks/useChatRooms";
import { ChatMessageBubble } from "@/features/chat/components/ChatMessageBubble";
import {
  MessageReply,
  type ReplyToMessage,
} from "@/features/chat/components/MessageReply";
import { PracticeToothWorkChartReadOnly } from "@/shared/components/practice/PracticeToothWorkChartReadOnly";
import type { ToothWorkSelection } from "@/shared/practice/transferMemo";
import { Progress } from "@/components/ui/progress";

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
  /** 보철물 치식 차트(읽기 전용). 있으면 의뢰 메모 위에 표시 */
  toothWorks?: ToothWorkSelection[];
  toothWorksKey?: string;
  filesLabel: string;
  files: PracticeTransferDialogFileItem[];
  /** 다운로드 진행 중 파일 키(s3Key 또는 id). 재클릭 방지 */
  downloadingFileKeys?: string[];
  /** 파일별 다운로드 진행률 0~100 */
  downloadProgressByKey?: Record<string, number>;
  downloadAllBusy?: boolean;
  onDownloadAllFiles: () => void | Promise<void>;
  onDownloadTransferFile: (file: PracticeTransferDialogFileItem) => void | Promise<void>;
  /** 기공소 의뢰수락 (수신 페이지에서만 전달). 작업완료/취소는 메인 카드에서 처리 */
  acceptBusy?: boolean;
  accepted?: boolean;
  /** 예: "남은 시간 3시간" → 버튼 라벨 `수락 [남은 시간 3시간]` */
  remainingLabel?: string | null;
  onAccept?: () => void | Promise<void>;
  chatLoading: boolean;
  chatError: string;
  chatMessages: ChatMessage[];
  isMyMessage: (senderId: string) => boolean;
  currentUserId?: string | null;
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
  replyTo?: ReplyToMessage | null;
  onReplyToMessage?: (message: ChatMessage) => void;
  onCancelReply?: () => void;
  onToggleReaction?: (messageId: string, emoji: string) => void | Promise<void>;
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
  toothWorks,
  toothWorksKey,
  filesLabel,
  files,
  downloadingFileKeys = [],
  downloadProgressByKey = {},
  downloadAllBusy = false,
  onDownloadAllFiles,
  onDownloadTransferFile,
  acceptBusy = false,
  accepted = false,
  onAccept,
  remainingLabel = null,
  chatLoading,
  chatError,
  chatMessages,
  isMyMessage,
  currentUserId,
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
  replyTo,
  onReplyToMessage,
  onCancelReply,
  onToggleReaction,
  composerPlaceholder,
  inputDisabled,
  sendDisabled,
}: PracticeTransferDetailChatDialogProps) {
  const hasToothWorks = Array.isArray(toothWorks) && toothWorks.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[90rem] h-[86vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4 text-primary-strong" />
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

              {hasToothWorks ? (
                <PracticeToothWorkChartReadOnly
                  key={toothWorksKey || "tooth-works"}
                  toothWorks={toothWorks}
                />
              ) : null}

              <div>
                <p className="text-muted-foreground">의뢰 메모</p>
                <p className="mt-1 font-medium whitespace-pre-wrap break-words max-h-48 overflow-y-auto pr-1">
                  {memo || "-"}
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-muted-foreground">{filesLabel} ({files.length}개)</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void onDownloadAllFiles()}
                      disabled={files.length === 0 || downloadAllBusy}
                    >
                      {downloadAllBusy ? "다운로드 중..." : "전체 다운로드"}
                    </Button>
                    {onAccept ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void onAccept()}
                        disabled={accepted || acceptBusy}
                      >
                        {acceptBusy
                          ? "수락 중..."
                          : remainingLabel
                            ? `수락 [${remainingLabel}]`
                            : accepted
                              ? "수락완료"
                              : "수락"}
                      </Button>
                    ) : null}
                  </div>
                </div>
                {files.length ? (
                  <div className="mt-2 max-h-40 overflow-y-auto pr-1 space-y-1">
                    {files.map((file, idx) => {
                      const busyKey = String(file.s3Key || file.id || "").trim();
                      const isBusy =
                        downloadAllBusy ||
                        (busyKey
                          ? downloadingFileKeys.includes(busyKey)
                          : false);
                      const progress = busyKey
                        ? Number(downloadProgressByKey[busyKey] ?? 0)
                        : 0;
                      return (
                        <div
                          key={`${file.id}:${idx}`}
                          className="rounded border px-2 py-1 space-y-1"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              if (isBusy) return;
                              void onDownloadTransferFile(file);
                            }}
                            disabled={isBusy}
                            className="block w-full text-left text-sm hover:underline disabled:opacity-60 disabled:pointer-events-none disabled:no-underline"
                          >
                            {isBusy
                              ? `다운로드 중 ${Math.round(progress)}% · `
                              : ""}
                            {file.fileName} ·{" "}
                            {formatFileSize(Number(file.size || 0))}
                          </button>
                          {isBusy ? (
                            <Progress value={progress} className="h-1.5" />
                          ) : null}
                        </div>
                      );
                    })}
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
                <div className="w-full min-w-0 max-w-full space-y-2">
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
                    return (
                      <ChatMessageBubble
                        key={message._id}
                        message={message}
                        isMine={isMyMessage(senderId)}
                        currentUserId={currentUserId}
                        formatTime={formatChatTime}
                        formatFileSize={formatFileSize}
                        onReply={onReplyToMessage}
                        onToggleReaction={onToggleReaction}
                        onOpenAttachment={(file) =>
                          void onDownloadChatAttachment({
                            fileName: file.fileName,
                            fileSize: Number(file.fileSize || 0),
                            s3Key: String(file.s3Key || ""),
                            s3Url: String(file.s3Url || ""),
                          })
                        }
                      />
                    );
                  })}
                  <div ref={chatBottomRef} />
                </div>
              </ScrollArea>

              <div className="shrink-0 border-t bg-background px-3 pt-3 pb-4 sm:px-4 sm:pt-4 sm:pb-6 space-y-2">
                {replyTo ? (
                  <MessageReply replyTo={replyTo} onCancelReply={onCancelReply} />
                ) : null}

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

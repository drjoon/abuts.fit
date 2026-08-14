// related files:
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/shared/hooks/useChatRooms.ts
// - web/frontend/src/features/chat/components/ChatMessageBubble.tsx
// - web/frontend/src/features/chat/components/MessageReply.tsx
// - web/frontend/src/shared/hooks/useBackgroundTempUpload.ts
// - web/frontend/src/shared/components/upload/BackgroundUploadList.tsx
// - 2026-08-13: 기공소 상세 모달 — 수락 전에도 치과 채팅 내역 표시. 수락 CTA는 채팅 상단 바.
// - 2026-08-13: 채팅 첨부 다운로드 프로그레스를 버블에 전달.
// - 2026-08-14: 기공소 기공수가 할증은 치과 채팅 헤더에 배치(자동매칭 포함).
// - 2026-08-14: 수락 후 같은 자리(채팅 상단 바)에 작업취소 버튼.
import type { ReactNode, RefObject } from "react";
import { CircleHelp, Paperclip, Send, MessageSquare } from "lucide-react";
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
import type {
  PracticeTransferFeeQuote,
  PracticeTransferFeeQuoteViewer,
} from "@/shared/practice/practiceTransferFeeQuote";
import { Progress } from "@/components/ui/progress";
import type { BackgroundUploadItem } from "@/shared/hooks/useBackgroundTempUpload";
import { BackgroundUploadList } from "@/shared/components/upload/BackgroundUploadList";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  /** 치과 채팅 헤더 오른쪽(예: 기공수가 할증) */
  chatHeaderAction?: ReactNode;
  summaryItems: PracticeTransferDialogSummaryItem[];
  memo: string;
  /** 보철물 치식 차트(읽기 전용). 있으면 의뢰 메모 위에 표시 */
  toothWorks?: ToothWorkSelection[];
  toothWorksKey?: string;
  feeQuote?: PracticeTransferFeeQuote | null;
  feeViewer?: PracticeTransferFeeQuoteViewer;
  labAnchorId?: string | null;
  filesLabel: string;
  files: PracticeTransferDialogFileItem[];
  /** 기공소 작업완료 결과 파일 (있을 때만 표시) */
  resultFilesLabel?: string;
  resultFiles?: PracticeTransferDialogFileItem[];
  /** 치과 「생산 진행」 컨펌 (작업완료 후) */
  productionConfirmBusy?: boolean;
  showProductionConfirm?: boolean;
  onConfirmProduction?: () => void | Promise<void>;
  /** 다운로드 진행 중 파일 키(s3Key 또는 id). 재클릭 방지 */
  downloadingFileKeys?: string[];
  /** 파일별 다운로드 진행률 0~100 */
  downloadProgressByKey?: Record<string, number>;
  downloadAllBusy?: boolean;
  onDownloadAllFiles: () => void | Promise<void>;
  onDownloadTransferFile: (file: PracticeTransferDialogFileItem) => void | Promise<void>;
  /** 기공소 의뢰수락 (수신 페이지에서만 전달). 미수락이면 채팅 상단 CTA */
  acceptBusy?: boolean;
  accepted?: boolean;
  /**
   * 이미 채팅방이 연결된 경우(수락 이력·작업취소 후 등).
   * 수락 전이라도 지정 기공소는 치과 메시지를 볼 수 있다.
   */
  chatUnlocked?: boolean;
  /** 기공소 작업취소 후 재수락이 필요한 상태 */
  workCanceled?: boolean;
  /** 작업완료된 건 — 작업취소 CTA 숨김 */
  workCompleted?: boolean;
  /** 레거시: 자동매칭 남은시간 라벨(강제 클레임 만료 폐기 후 미사용) */
  remainingLabel?: string | null;
  onAccept?: () => void | Promise<void>;
  /** 수락 후 같은 자리의 작업취소 */
  releaseBusy?: boolean;
  onRelease?: () => void | Promise<void>;
  chatLoading: boolean;
  chatError: string;
  chatMessages: ChatMessage[];
  isMyMessage: (senderId: string) => boolean;
  currentUserId?: string | null;
  formatChatTime: (createdAt: string) => string;
  formatFileSize: (size: number) => string;
  onDownloadChatAttachment: (file: {
    fileId?: string;
    fileName: string;
    fileSize: number;
    s3Key: string;
    s3Url: string;
  }) => void | Promise<void>;
  chatBottomRef: RefObject<HTMLDivElement | null>;
  chatAttachedFiles: BackgroundUploadItem[];
  onRemoveAttachedChatFile: (id: string) => void;
  onRetryAttachedChatFile?: (id: string) => void;
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
  chatHeaderAction = null,
  summaryItems,
  memo,
  toothWorks,
  toothWorksKey,
  feeQuote = null,
  feeViewer = "practice",
  labAnchorId = null,
  filesLabel,
  files,
  resultFilesLabel = "작업 결과 파일",
  resultFiles = [],
  productionConfirmBusy = false,
  showProductionConfirm = false,
  onConfirmProduction,
  downloadingFileKeys = [],
  downloadProgressByKey = {},
  downloadAllBusy = false,
  onDownloadAllFiles,
  onDownloadTransferFile,
  acceptBusy = false,
  accepted = false,
  workCanceled = false,
  workCompleted = false,
  onAccept,
  releaseBusy = false,
  onRelease,
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
  onRetryAttachedChatFile,
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
  const hasCustomAbutment = Boolean(
    toothWorks?.some((work) => Boolean(work.customAbutment)),
  );
  /** 최초 미수락: 채팅은 유지하고 상단에 수락 CTA */
  const showAcceptBar = Boolean(onAccept) && !accepted && !workCanceled;
  /** 작업취소 후 수락이 풀렸지만 채팅은 이어갈 때 */
  const showReacceptBar =
    Boolean(onAccept) && !accepted && workCanceled;
  /** 수락 직후: 수락 버튼 자리에 작업취소 */
  const showReleaseBar =
    Boolean(onRelease) && accepted && !workCanceled && !workCompleted;
  const rawChatError = String(chatError || "").trim();
  const isPreAcceptChatHint =
    rawChatError === "의뢰수락 후 치과와 채팅할 수 있습니다." ||
    rawChatError === "기공소에서 의뢰 수락 후 채팅방을 열 수 있습니다.";
  /** 자동매칭 공개 풀 등 방이 없을 때: 수락 바와 같은 안내를 메시지 영역에 중복하지 않음 */
  const visibleChatError =
    showAcceptBar && isPreAcceptChatHint ? "" : rawChatError;
  const acceptButtonLabel = acceptBusy
    ? "수락 중..."
    : remainingLabel
      ? `수락 [${remainingLabel}]`
      : "수락";
  const reacceptButtonLabel = acceptBusy
    ? "수락 중..."
    : remainingLabel
      ? `다시 수락 [${remainingLabel}]`
      : "다시 수락";
  const releaseButtonLabel = releaseBusy ? "취소 중..." : "작업취소";
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
                  feeQuote={feeQuote}
                  feeViewer={feeViewer}
                  labAnchorId={labAnchorId}
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void onDownloadAllFiles()}
                    disabled={files.length === 0 || downloadAllBusy}
                  >
                    {downloadAllBusy ? "다운로드 중..." : "전체 다운로드"}
                  </Button>
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

              {Array.isArray(resultFiles) && resultFiles.length > 0 ? (
                <div>
                  <p className="text-muted-foreground">
                    {resultFilesLabel} ({resultFiles.length}개)
                  </p>
                  <div className="mt-2 max-h-40 overflow-y-auto pr-1 space-y-1">
                    {resultFiles.map((file, idx) => {
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
                          key={`${file.id}:result:${idx}`}
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
                </div>
              ) : null}

              {showProductionConfirm && onConfirmProduction ? (
                <div className="rounded-md border border-primary/30 bg-primary-soft/40 p-3">
                  <p className="text-sm text-primary-strong">
                    작업 결과를 확인한 뒤 생산을 진행하세요.
                  </p>
                  <Button
                    type="button"
                    className="mt-2"
                    disabled={productionConfirmBusy}
                    onClick={() => void onConfirmProduction()}
                  >
                    {productionConfirmBusy ? "처리 중..." : "생산 진행"}
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border min-h-0 flex flex-col overflow-hidden">
              <div className="flex shrink-0 items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2.5">
                <div className="min-w-0 text-sm font-medium text-slate-700">
                  {conversationTitle}
                </div>
                {chatHeaderAction ? (
                  <div className="shrink-0">{chatHeaderAction}</div>
                ) : null}
              </div>

              {showAcceptBar ? (
                <div className="shrink-0 border-b bg-muted/40 px-3 py-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      치과 메시지를 확인한 뒤 수락하면 작업을 진행할 수 있습니다.
                    </p>
                    {hasCustomAbutment ? (
                      <TooltipProvider delayDuration={0}>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span>커스텀 어벗 디자인은 1일 내 작업 완료</span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex hover:text-foreground"
                                aria-label="커스텀 어벗 디자인 책임 안내"
                              >
                                <CircleHelp className="h-3.5 w-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs leading-relaxed">
                              작업 완료 책임은 의뢰를 수락한 기공소에 있으며, 혹시 지연될
                              경우 치과와 미리 상의하시기 바랍니다.
                              <br />
                              커스텀어벗 디자인은 1영업일 내 어벗츠가 만들어서 기공소에
                              전달합니다.
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </TooltipProvider>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void onAccept?.()}
                      disabled={acceptBusy}
                    >
                      {acceptButtonLabel}
                    </Button>
                  </div>
                </div>
              ) : null}

              {showReacceptBar ? (
                <div className="shrink-0 border-b bg-muted/40 px-3 py-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    작업이 취소된 상태입니다. 채팅은 이어갈 수 있고, 다시 수락하면 작업을
                    진행할 수 있습니다.
                  </p>
                  <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void onAccept?.()}
                      disabled={acceptBusy}
                    >
                      {reacceptButtonLabel}
                    </Button>
                  </div>
                </div>
              ) : null}

              {showReleaseBar ? (
                <div className="shrink-0 border-b bg-muted/40 px-3 py-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    수락된 의뢰입니다. 작업취소하면 수락이 해제됩니다.
                  </p>
                  <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void onRelease?.()}
                      disabled={releaseBusy}
                    >
                      {releaseButtonLabel}
                    </Button>
                  </div>
                </div>
              ) : null}

              <ScrollArea className="min-h-0 flex-1 px-3 py-3">
                    <div className="w-full min-w-0 max-w-full space-y-2">
                      {chatLoading ? (
                        <div className="text-center text-sm text-muted-foreground py-4">
                          채팅을 불러오는 중입니다...
                        </div>
                      ) : null}

                      {!chatLoading && visibleChatError ? (
                        <div className="flex min-h-[12rem] items-center justify-center py-4">
                          <p className="text-center text-sm text-muted-foreground">
                            {visibleChatError}
                          </p>
                        </div>
                      ) : null}

                      {!chatLoading && !visibleChatError && chatMessages.length === 0 ? (
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
                            downloadingFileKeys={downloadingFileKeys}
                            downloadProgressByKey={downloadProgressByKey}
                            onReply={onReplyToMessage}
                            onToggleReaction={onToggleReaction}
                            onOpenAttachment={(file) =>
                              void onDownloadChatAttachment({
                                fileId: file.fileId,
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
                      <div className="max-h-28 overflow-y-auto pr-1">
                        <BackgroundUploadList
                          items={chatAttachedFiles}
                          onRemove={onRemoveAttachedChatFile}
                          onRetry={onRetryAttachedChatFile}
                          formatFileSize={formatFileSize}
                        />
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

// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/hooks/useBackgroundTempUpload.ts
// - web/frontend/src/shared/components/upload/BackgroundUploadList.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferMobileOralPhotoIntake.tsx
// - web/frontend/src/features/chat/components/NewChatWidget.tsx
// change-log:
// - 2026-09-07: $ 목록 화살표 선택·의뢰ID+환자이름 토큰 삽입.
// - 2026-09-07: $ 입력으로 의뢰건 불러오기·placeholder 안내.
// - 2026-08-21: textarea flex-1 제거·루트 shrink-0 — 채팅 레이아웃에서 입력칸이 내역 높이를 잠식하지 않게.
// - 2026-08-27: 모바일 사진찍기(capture) — 채팅에서 바로 촬영·업로드.
import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  buildCaseMentionToken,
} from "@/features/chat/components/chatCaseMention";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { useToast } from "@/shared/hooks/use-toast";
import { normalizeOralPhotoFiles } from "@/shared/components/practice/PracticeTransferMobileOralPhotoIntake";
import { cn } from "@/shared/ui/cn";

export type RequestPickItem = {
  /** 삽입 토큰에 쓰는 ID (전송ID / 의뢰ID) */
  requestId: string;
  patientName?: string;
  tooth?: string;
};

/** `$검색어` 멘션 — 커서 앞 구간에서 마지막 `$…` */
export const getDollarMentionAtCursor = (
  value: string,
  cursor: number,
): { start: number; query: string } | null => {
  const safeCursor = Math.max(0, Math.min(cursor, value.length));
  const before = value.slice(0, safeCursor);
  const match = before.match(/\$([^\s$]*)$/);
  if (!match || match.index == null) return null;
  return { start: match.index, query: String(match[1] || "") };
};

export const CHAT_CASE_MENTION_PLACEHOLDER =
  "메시지를 입력하세요 ($ 로 의뢰건 불러오기)";

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
  /** $ / # 로 의뢰 목록이 필요할 때(지연 로드) */
  onRequestPicksNeeded?: () => void;
  requestPicksLoading?: boolean;
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
    onRequestPicksNeeded,
    requestPicksLoading,
    onInsertRequestId,
    replyTo,
    onCancelReply,
    compact = false,
    className,
  } = props;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pickItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [hashOpen, setHashOpen] = useState(false);
  const [dollarOpen, setDollarOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [cameraBusy, setCameraBusy] = useState(false);
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const pickListOpen = dollarOpen || hashOpen;

  const hasFiles = Array.isArray(pendingUploads) && pendingUploads.length > 0;
  const hasRequestPicks =
    Array.isArray(requestPicks) && requestPicks.length > 0;
  const canPickFiles = typeof onPickFiles === "function";
  const canInsertRequestId = typeof onInsertRequestId === "function";
  const controlsDisabled = !!disabled || !!isSending || cameraBusy;

  const sendDisabled =
    !!disabled || !!isSending || cameraBusy || (!draft.trim() && !hasFiles);

  const resolvedPlaceholder =
    placeholder ||
    (canInsertRequestId
      ? CHAT_CASE_MENTION_PLACEHOLDER
      : "메시지를 입력하세요");

  const mention = useMemo(
    () => getDollarMentionAtCursor(draft, cursor),
    [draft, cursor],
  );

  const filteredPicks = useMemo(() => {
    const list = Array.isArray(requestPicks) ? requestPicks : [];
    const q = String(mention?.query || "").trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => {
      const id = String(r.requestId || "").toLowerCase();
      const patient = String(r.patientName || "").toLowerCase();
      const tooth = String(r.tooth || "").toLowerCase();
      return id.includes(q) || patient.includes(q) || tooth.includes(q);
    });
  }, [requestPicks, mention?.query]);

  const onRequestPicksNeededRef = useRef(onRequestPicksNeeded);
  onRequestPicksNeededRef.current = onRequestPicksNeeded;

  useEffect(() => {
    if (!canInsertRequestId) {
      setDollarOpen(false);
      return;
    }
    if (!mention) {
      setDollarOpen(false);
      return;
    }
    setDollarOpen(true);
    onRequestPicksNeededRef.current?.();
  }, [canInsertRequestId, mention?.start, mention?.query]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [mention?.query, filteredPicks.length, dollarOpen, hashOpen]);

  useEffect(() => {
    if (!pickListOpen) return;
    const el = pickItemRefs.current[highlightIndex];
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex, pickListOpen, filteredPicks.length]);

  const syncCursor = () => {
    const el = textareaRef.current;
    if (!el) return;
    setCursor(el.selectionStart ?? el.value.length);
  };

  const insertCaseToken = (pick: RequestPickItem | string) => {
    if (!canInsertRequestId) return;
    const requestId =
      typeof pick === "string"
        ? String(pick || "").trim()
        : String(pick.requestId || "").trim();
    if (!requestId) return;
    const patientName =
      typeof pick === "string"
        ? ""
        : String(pick.patientName || "").trim();
    const token = buildCaseMentionToken(requestId, patientName);
    if (!token) return;
    const el = textareaRef.current;
    const cur = el?.selectionStart ?? cursor;
    const activeMention = getDollarMentionAtCursor(draft, cur);

    let next: string;
    let nextCursor: number;
    if (activeMention) {
      const after = draft.slice(cur);
      next = `${draft.slice(0, activeMention.start)}${token}${after}`;
      nextCursor = activeMention.start + token.length;
    } else {
      const base = draft || "";
      const spacer = base && !base.endsWith(" ") ? " " : "";
      next = `${base}${spacer}${token}`;
      nextCursor = next.length;
    }

    onDraftChange(next);
    setDollarOpen(false);
    setHashOpen(false);
    window.requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(nextCursor, nextCursor);
      setCursor(nextCursor);
    });
  };

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

  const renderPickList = (onPick: (pick: RequestPickItem) => void) => (
    <div className="max-h-56 space-y-1 overflow-y-auto" role="listbox">
      {requestPicksLoading && !hasRequestPicks ? (
        <div className="px-2 py-3 text-center text-xs text-muted-foreground">
          의뢰건을 불러오는 중…
        </div>
      ) : null}
      {!requestPicksLoading && filteredPicks.length === 0 ? (
        <div className="px-2 py-3 text-center text-xs text-muted-foreground">
          {hasRequestPicks
            ? "검색 결과가 없습니다."
            : "불러올 의뢰건이 없습니다."}
        </div>
      ) : null}
      {filteredPicks.map((r, index) => {
        const selected = pickListOpen && index === highlightIndex;
        return (
          <button
            key={r.requestId}
            ref={(el) => {
              pickItemRefs.current[index] = el;
            }}
            type="button"
            role="option"
            aria-selected={selected}
            className={cn(
              "w-full rounded px-2 py-1.5 text-left text-xs hover:bg-muted",
              selected && "bg-muted",
            )}
            onMouseEnter={() => setHighlightIndex(index)}
            onClick={() => onPick(r)}
          >
            <div className="font-medium">{r.requestId}</div>
            {r.patientName ? (
              <div className="truncate text-muted-foreground">
                {r.patientName}
              </div>
            ) : null}
            {r.tooth ? (
              <div className="truncate text-muted-foreground">{r.tooth}</div>
            ) : null}
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      className={cn(
        "relative shrink-0 border-t space-y-2",
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

      {canInsertRequestId && dollarOpen ? (
        <div className="absolute bottom-[calc(100%-0.25rem)] left-3 right-3 z-20 sm:left-4 sm:right-4">
          <div className="rounded-lg border bg-popover p-2 shadow-md">
            <div className="mb-1 px-1 text-[11px] font-medium text-muted-foreground">
              의뢰건 선택
              {mention?.query ? ` · “${mention.query}”` : " · $ 검색"}
            </div>
            {renderPickList(insertCaseToken)}
          </div>
        </div>
      ) : null}

      <Textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => {
          onDraftChange(e.target.value);
          setCursor(e.target.selectionStart ?? e.target.value.length);
        }}
        onClick={syncCursor}
        onKeyUp={syncCursor}
        onSelect={syncCursor}
        placeholder={resolvedPlaceholder}
        className={cn(
          "resize-none",
          compact &&
            "min-h-0 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0",
          isMobile && "min-h-[4.5rem] text-base",
        )}
        rows={isMobile ? 2 : compact ? 2 : 3}
        disabled={!!disabled || !!isSending}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;

          if (e.key === "Escape" && (dollarOpen || hashOpen)) {
            e.preventDefault();
            setDollarOpen(false);
            setHashOpen(false);
            return;
          }

          if (pickListOpen && filteredPicks.length > 0) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlightIndex((prev) =>
                Math.min(filteredPicks.length - 1, prev + 1),
              );
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlightIndex((prev) => Math.max(0, prev - 1));
              return;
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              const pick =
                filteredPicks[highlightIndex] || filteredPicks[0] || null;
              if (pick) insertCaseToken(pick);
              return;
            }
            if (e.key === "Tab") {
              e.preventDefault();
              const pick =
                filteredPicks[highlightIndex] || filteredPicks[0] || null;
              if (pick) insertCaseToken(pick);
              return;
            }
          }

          if (e.key === "Enter" && !e.shiftKey) {
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
            <Popover
              open={hashOpen}
              onOpenChange={(open) => {
                setHashOpen(open);
                if (open) onRequestPicksNeeded?.();
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={iconBtnClass}
                  disabled={controlsDisabled}
                  title="의뢰건 불러오기 ($)"
                  aria-label="의뢰건 불러오기"
                >
                  <Hash className={isMobile ? "h-5 w-5" : "h-4 w-4"} />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-2" align="start">
                <div className="mb-1 px-1 text-[11px] font-medium text-muted-foreground">
                  의뢰건 선택 · $ 로도 불러올 수 있습니다
                </div>
                {renderPickList(insertCaseToken)}
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

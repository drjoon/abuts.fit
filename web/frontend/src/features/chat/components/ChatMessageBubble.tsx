// related files:
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - web/frontend/src/features/chat/components/NewChatWidget.tsx
// - web/frontend/src/pages/admin/support/AdminChatManagement.tsx
// - web/frontend/src/features/chat/components/MessageReply.tsx
// - web/frontend/src/features/chat/components/chatReactions.ts
// - web/frontend/src/shared/files/useS3FileDownload.ts
// - web/frontend/src/shared/files/s3BlobCache.ts
// - web/frontend/src/shared/components/ModelPreviewDialog.tsx
// - web/frontend/src/features/requests/components/StlPreviewThumbnail.tsx
// - web/frontend/src/shared/files/modelPreviewFile.ts
// - 2026-08-13: 채팅 첨부 다운로드 중 프로그레스바.
// - 2026-08-27: 이미지 첨부 썸네일 + ModelPreviewDialog 미리보기(의뢰상세와 동일).
// - 2026-08-28: PLY/OBJ 칼라 텍스처(동반 이미지) 프리뷰 전달.
// - 2026-08-28: STL/PLY/OBJ도 의뢰상세와 동일 썸네일·ModelPreviewDialog.
// - 2026-08-28: 모델 확장자 우선 분류(잘못된 image MIME 오인 방지).
import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Reply, SmilePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/shared/ui/cn";
import type { ChatMessage, ChatMessageReaction } from "@/shared/hooks/useChatRooms";
import { MessageReply } from "@/features/chat/components/MessageReply";
import {
  CHAT_REACTION_EMOJIS,
  formatReactionUserNames,
} from "@/features/chat/components/chatReactions";
import { StlPreviewThumbnail } from "@/features/requests/components/StlPreviewThumbnail";
import {
  ModelPreviewDialog,
  type ModelPreviewKind,
} from "@/shared/components/ModelPreviewDialog";
import { fetchS3BlobCached } from "@/shared/files/s3BlobCache";
import { loadS3ImageThumbUrlsParallel } from "@/shared/files/s3ImageThumb";
import {
  fileFromImageBlob,
  fileFromModelBlob,
  getModelExtLower,
  isModelPreviewExt,
  peekPlyHeaderInfo,
  resolveCompanionTextureFileName,
} from "@/shared/files/modelPreviewFile";
import { buildS3ProxyDownloadUrl } from "@/shared/files/useS3FileDownload";
import {
  getPracticeTransferFileExtension,
  PRACTICE_TRANSFER_IMAGE_EXTENSIONS,
} from "@/shared/practice/practiceTransferAccept";
import { PracticeTransferSystemChatBody } from "@/shared/practice/practiceTransferSystemChatMessage";

export type ChatBubbleAttachment = {
  fileId?: string;
  fileName: string;
  fileSize?: number;
  fileType?: string;
  s3Key?: string;
  s3Url?: string;
};

type ChatMessageBubbleProps = {
  message: ChatMessage;
  isMine: boolean;
  currentUserId?: string | null;
  formatTime: (createdAt: string) => string;
  showSenderName?: boolean;
  compact?: boolean;
  /** S3 프록시 썸네일·미리보기용 JWT */
  authToken?: string | null;
  onReply?: (message: ChatMessage) => void;
  onToggleReaction?: (messageId: string, emoji: string) => void | Promise<void>;
  /** 리액션 툴팁용 userId → 표시 이름 */
  reactionUserNameById?: Record<string, string>;
  onOpenAttachment?: (file: ChatBubbleAttachment) => void | Promise<void>;
  formatFileSize?: (size: number) => string;
  downloadingFileKeys?: string[];
  downloadProgressByKey?: Record<string, number>;
  /** 후속 보철 채팅 카드 견적용 */
  practiceTransferLabAnchorId?: string | null;
  practiceTransferProsthesisFollowUps?: import("@/shared/practice/prosthesisFollowUp").ProsthesisFollowUpRecord[] | null;
};

export function chatAttachmentBusyKey(file: {
  s3Key?: string;
  fileId?: string;
}): string {
  return String(file?.s3Key || file?.fileId || "").trim();
}

export function isChatImageAttachment(file: {
  fileName?: string;
  fileType?: string;
}): boolean {
  const type = String(file.fileType || "").toLowerCase();
  if (
    type.startsWith("image/") &&
    !type.includes("heic") &&
    !type.includes("heif")
  ) {
    return true;
  }
  const ext = getPracticeTransferFileExtension(String(file.fileName || ""));
  return PRACTICE_TRANSFER_IMAGE_EXTENSIONS.has(ext);
}

export function isChatModelAttachment(file: { fileName?: string }): boolean {
  return isModelPreviewExt(getModelExtLower(String(file.fileName || "")));
}

export function resolveChatPreviewKind(
  file: ChatBubbleAttachment,
): ModelPreviewKind | null {
  // 확장자 우선 — STL이 잘못된 image/* MIME으로 올라와도 이미지로 오인하지 않음
  if (isChatModelAttachment(file)) return "model";
  if (isChatImageAttachment(file)) return "image";
  return null;
}

function mimeTypeForImageFileName(name: string): string {
  const ext = getPracticeTransferFileExtension(name);
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".bmp") return "image/bmp";
  return "image/jpeg";
}

function fileFromPreviewBlob(
  blob: Blob,
  fileName: string,
  kind: ModelPreviewKind,
): File {
  if (kind === "model") return fileFromModelBlob(blob, fileName);
  return fileFromImageBlob(blob, fileName);
}

function toBubbleAttachment(
  file: NonNullable<ChatMessage["attachments"]>[number],
): ChatBubbleAttachment {
  return {
    fileId: file?.fileId,
    fileName: String(file?.fileName || "첨부파일").trim() || "첨부파일",
    fileSize: Number(file?.fileSize || 0),
    fileType: String(file?.fileType || "").trim(),
    s3Key: String(file?.s3Key || "").trim(),
    s3Url: String(file?.s3Url || "").trim(),
  };
}

type ReactionGroup = {
  emoji: string;
  count: number;
  reactedByMe: boolean;
  userIds: string[];
};

export const chatMessageDomId = (messageId: string) =>
  `chat-msg-${String(messageId || "").trim()}`;

const HIGHLIGHT_CLASS = "chat-msg-flash";
const HIGHLIGHT_MS = 1600;

export const scrollToChatMessage = (messageId: string) => {
  const id = String(messageId || "").trim();
  if (!id) return false;

  const el = document.getElementById(chatMessageDomId(id));
  if (!el) return false;

  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove(HIGHLIGHT_CLASS);
  // reflow so animation can restart
  void el.offsetWidth;
  el.classList.add(HIGHLIGHT_CLASS);
  window.setTimeout(() => {
    el.classList.remove(HIGHLIGHT_CLASS);
  }, HIGHLIGHT_MS);
  return true;
};

const normalizeReplyTo = (message: ChatMessage) => {
  const raw = message.replyTo;
  if (!raw) return null;
  if (typeof raw === "string") {
    const id = String(raw || "").trim();
    if (!id) return null;
    return {
      _id: id,
      sender: { name: "원본 메시지", role: "" },
      content: "원본 메시지로 이동",
    };
  }
  if (raw.isDeleted) {
    return {
      _id: String(raw._id || ""),
      sender: { name: "알 수 없음", role: "" },
      content: "삭제된 메시지입니다.",
    };
  }
  return {
    _id: String(raw._id || ""),
    sender: {
      name: String(raw.sender?.name || "알 수 없음").trim() || "알 수 없음",
      role: String(raw.sender?.role || "").trim(),
    },
    content: String(raw.content || "").trim() || "(내용 없음)",
  };
};

const groupReactions = (
  reactions: ChatMessageReaction[] | undefined,
  currentUserId: string,
): ReactionGroup[] => {
  const map = new Map<string, ReactionGroup>();
  for (const row of Array.isArray(reactions) ? reactions : []) {
    const emoji = String(row?.emoji || "").trim();
    if (!emoji) continue;
    const uid = String(row?.userId || "").trim();
    const prev = map.get(emoji) || {
      emoji,
      count: 0,
      reactedByMe: false,
      userIds: [],
    };
    prev.count += 1;
    if (uid) prev.userIds.push(uid);
    if (currentUserId && uid === currentUserId) prev.reactedByMe = true;
    map.set(emoji, prev);
  }
  return Array.from(map.values()).sort(
    (a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji),
  );
};

export function ChatMessageBubble({
  message,
  isMine,
  currentUserId,
  formatTime,
  showSenderName = true,
  compact = false,
  authToken,
  onReply,
  onToggleReaction,
  reactionUserNameById = {},
  onOpenAttachment,
  formatFileSize,
  downloadingFileKeys = [],
  downloadProgressByKey = {},
  practiceTransferLabAnchorId = null,
  practiceTransferProsthesisFollowUps = null,
}: ChatMessageBubbleProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const senderName = String(message.sender?.name || "알 수 없음").trim();
  const myId = String(currentUserId || "").trim();
  const isSystem = String(message.messageKind || "").trim() === "system";
  const replyPreview = normalizeReplyTo(message);
  const reactionGroups = useMemo(
    () => groupReactions(message.reactions, myId),
    [message.reactions, myId],
  );

  const canInteract =
    !isSystem &&
    (typeof onReply === "function" || typeof onToggleReaction === "function");
  const replyTargetId = String(replyPreview?._id || "").trim();
  const canJumpToReply =
    Boolean(replyTargetId) && replyPreview?.content !== "삭제된 메시지입니다.";

  const attachments = useMemo(() => {
    const list = Array.isArray(message.attachments) ? message.attachments : [];
    return list.map(toBubbleAttachment);
  }, [message.attachments]);

  const previewableAttachments = useMemo(
    () =>
      attachments.filter((file) => resolveChatPreviewKind(file) != null),
    [attachments],
  );
  const otherAttachments = useMemo(
    () =>
      attachments.filter((file) => resolveChatPreviewKind(file) == null),
    [attachments],
  );

  const imageThumbKey = useMemo(
    () =>
      previewableAttachments
        .filter((file) => resolveChatPreviewKind(file) === "image")
        .map((file) => String(file.s3Key || "").trim())
        .filter(Boolean)
        .join("|"),
    [previewableAttachments],
  );

  const modelThumbKey = useMemo(
    () =>
      previewableAttachments
        .filter((file) => resolveChatPreviewKind(file) === "model")
        .map((file) => String(file.s3Key || "").trim())
        .filter(Boolean)
        .join("|"),
    [previewableAttachments],
  );

  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const thumbUrlsRef = useRef<Record<string, string>>({});
  const [modelThumbFiles, setModelThumbFiles] = useState<Record<string, File>>(
    {},
  );
  const modelThumbFilesRef = useRef<Record<string, File>>({});

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewItems, setPreviewItems] = useState<ChatBubbleAttachment[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewKind, setPreviewKind] = useState<ModelPreviewKind>("image");
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewTextureFile, setPreviewTextureFile] = useState<File | null>(
    null,
  );
  const [previewCompanionFiles, setPreviewCompanionFiles] = useState<File[]>(
    [],
  );
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);
  const previewAbortRef = useRef<AbortController | null>(null);

  const revokeThumbs = () => {
    for (const url of Object.values(thumbUrlsRef.current)) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }
    thumbUrlsRef.current = {};
    setThumbUrls({});
  };

  const clearModelThumbs = () => {
    modelThumbFilesRef.current = {};
    setModelThumbFiles({});
  };

  useEffect(() => {
    const token = String(authToken || "").trim();
    if (!token || !imageThumbKey) {
      revokeThumbs();
      return;
    }

    const ac = new AbortController();
    let cancelled = false;
    const files = previewableAttachments.filter(
      (file) =>
        resolveChatPreviewKind(file) === "image" &&
        String(file.s3Key || "").trim(),
    );

    void loadS3ImageThumbUrlsParallel({
      items: files.map((file) => ({
        s3Key: String(file.s3Key || "").trim(),
        fileName: String(file.fileName || "image").trim() || "image",
      })),
      token,
      signal: ac.signal,
      existing: thumbUrlsRef.current,
      onReady: (s3Key, url) => {
        if (cancelled || ac.signal.aborted) {
          try {
            URL.revokeObjectURL(url);
          } catch {
            // ignore
          }
          return;
        }
        thumbUrlsRef.current = { ...thumbUrlsRef.current, [s3Key]: url };
        setThumbUrls({ ...thumbUrlsRef.current });
      },
    });

    return () => {
      cancelled = true;
      ac.abort();
      revokeThumbs();
    };
    // previewableAttachments identity changes with message; key captures s3 list
    // eslint-disable-next-line react-hooks/exhaustive-deps -- imageThumbKey is SSOT
  }, [authToken, imageThumbKey]);

  useEffect(() => {
    const token = String(authToken || "").trim();
    if (!token || !modelThumbKey) {
      clearModelThumbs();
      return;
    }

    const ac = new AbortController();
    let cancelled = false;
    const files = previewableAttachments.filter(
      (file) =>
        resolveChatPreviewKind(file) === "model" &&
        String(file.s3Key || "").trim(),
    );

    void Promise.all(
      files.map(async (file) => {
        if (cancelled || ac.signal.aborted) return;
        const s3Key = String(file.s3Key || "").trim();
        const fileName =
          String(file.fileName || "model.stl").trim() || "model.stl";
        if (modelThumbFilesRef.current[s3Key]) return;
        try {
          const blob = await fetchS3BlobCached({
            s3Key,
            fileName,
            token,
            buildUrl: buildS3ProxyDownloadUrl,
            signal: ac.signal,
          });
          if (cancelled || ac.signal.aborted) return;
          modelThumbFilesRef.current = {
            ...modelThumbFilesRef.current,
            [s3Key]: fileFromModelBlob(blob, fileName),
          };
          setModelThumbFiles({ ...modelThumbFilesRef.current });
        } catch {
          // 썸네일 실패 시 Box placeholder
        }
      }),
    );

    return () => {
      cancelled = true;
      ac.abort();
      clearModelThumbs();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- modelThumbKey is SSOT
  }, [authToken, modelThumbKey]);

  const resetPreview = () => {
    previewAbortRef.current?.abort();
    previewAbortRef.current = null;
    setPreviewOpen(false);
    setPreviewItems([]);
    setPreviewIndex(0);
    setPreviewKind("image");
    setPreviewFile(null);
    setPreviewTextureFile(null);
    setPreviewCompanionFiles([]);
    setPreviewLoading(false);
    setPreviewProgress(0);
  };

  const loadPreviewAt = async (
    items: ChatBubbleAttachment[],
    index: number,
  ) => {
    const token = String(authToken || "").trim();
    const target = items[index];
    const kind = resolveChatPreviewKind(target || { fileName: "" }) || "image";
    const s3Key = String(target?.s3Key || "").trim();
    const fileName =
      String(
        target?.fileName || (kind === "image" ? "image" : "model.stl"),
      ).trim() || (kind === "image" ? "image" : "model.stl");
    if (!token || !s3Key) {
      setPreviewFile(null);
      setPreviewTextureFile(null);
      setPreviewCompanionFiles([]);
      setPreviewLoading(false);
      return;
    }

    previewAbortRef.current?.abort();
    const ac = new AbortController();
    previewAbortRef.current = ac;
    setPreviewKind(kind);
    setPreviewLoading(true);
    setPreviewProgress(0);
    setPreviewFile(null);
    setPreviewTextureFile(null);
    setPreviewCompanionFiles([]);

    try {
      const blob = await fetchS3BlobCached({
        s3Key,
        fileName,
        token,
        buildUrl: buildS3ProxyDownloadUrl,
        signal: ac.signal,
        onProgress: setPreviewProgress,
      });
      if (ac.signal.aborted) return;
      const mainFile = fileFromPreviewBlob(blob, fileName, kind);
      setPreviewFile(mainFile);

      if (kind === "model") {
        const imageItems = items.filter((item) => isChatImageAttachment(item));
        const companionFiles: File[] = [];
        for (const item of imageItems) {
          const key = String(item.s3Key || "").trim();
          const name = String(item.fileName || "image").trim() || "image";
          if (!key) continue;
          try {
            const imgBlob = await fetchS3BlobCached({
              s3Key: key,
              fileName: name,
              token,
              buildUrl: buildS3ProxyDownloadUrl,
              signal: ac.signal,
            });
            if (ac.signal.aborted) return;
            companionFiles.push(fileFromImageBlob(imgBlob, name));
          } catch {
            // skip missing companion
          }
        }

        let preferredTexture: string | null = null;
        if (getModelExtLower(fileName) === ".ply") {
          preferredTexture = peekPlyHeaderInfo(
            await mainFile.arrayBuffer(),
          ).textureFileName;
        }
        const matchedName = resolveCompanionTextureFileName(
          fileName,
          preferredTexture,
          companionFiles.map((f) => f.name),
        );
        const textureFile = matchedName
          ? companionFiles.find(
              (f) =>
                f.name.toLowerCase() === matchedName.toLowerCase() ||
                f.name.split("/").pop()?.toLowerCase() ===
                  matchedName.toLowerCase(),
            ) || null
          : null;

        if (!ac.signal.aborted) {
          setPreviewTextureFile(textureFile);
          setPreviewCompanionFiles(companionFiles);
        }
      }
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      setPreviewFile(null);
      setPreviewTextureFile(null);
      setPreviewCompanionFiles([]);
    } finally {
      if (previewAbortRef.current === ac) {
        previewAbortRef.current = null;
        setPreviewLoading(false);
      }
    }
  };

  const openAttachmentPreview = (index: number) => {
    if (!previewableAttachments.length) return;
    const nextIndex = Math.max(
      0,
      Math.min(index, previewableAttachments.length - 1),
    );
    setPreviewItems(previewableAttachments);
    setPreviewIndex(nextIndex);
    setPreviewOpen(true);
    void loadPreviewAt(previewableAttachments, nextIndex);
  };

  const goPreviewRelative = (delta: number) => {
    if (previewLoading || previewItems.length <= 1) return;
    const next =
      (previewIndex + delta + previewItems.length) % previewItems.length;
    setPreviewIndex(next);
    void loadPreviewAt(previewItems, next);
  };

  const handleToggle = (emoji: string) => {
    if (!onToggleReaction) return;
    void onToggleReaction(String(message._id), emoji);
    setPickerOpen(false);
  };

  const handleJumpToReply = () => {
    if (!canJumpToReply) return;
    scrollToChatMessage(replyTargetId);
  };

  const previewMeta = previewItems[previewIndex] || null;
  const previewDownloadBusy = Boolean(
    previewMeta &&
      (() => {
        const busyKey = chatAttachmentBusyKey(previewMeta);
        return busyKey && downloadingFileKeys.includes(busyKey);
      })(),
  );

  const hasTextContent = Boolean(String(message.content || "").trim());

  if (isSystem) {
    const customBody = PracticeTransferSystemChatBody({
      message,
      compact,
      formatTime,
      messageDomId: chatMessageDomId(String(message._id || "")),
      labAnchorId: practiceTransferLabAnchorId,
      prosthesisFollowUps: practiceTransferProsthesisFollowUps,
    });
    if (customBody) return customBody;

    return (
      <div
        id={chatMessageDomId(String(message._id || ""))}
        className="flex w-full justify-center scroll-mt-4 py-1.5"
      >
        <div
          className={cn(
            "max-w-[min(92%,28rem)] rounded-md bg-muted/70 px-4 py-1.5 text-center text-muted-foreground",
            compact ? "text-[11px] sm:text-xs" : "text-xs sm:text-sm",
          )}
        >
          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-snug">
            {message.content}
          </p>
          <p className={cn("mt-0.5 opacity-70", compact ? "text-[10px]" : "text-[11px]")}>
            {formatTime(message.createdAt)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        id={chatMessageDomId(String(message._id || ""))}
        className={cn(
          "group flex w-full min-w-0 scroll-mt-4 rounded-lg transition-[box-shadow,background-color]",
          isMine ? "justify-end" : "justify-start",
        )}
      >
        <div
          className={cn(
            "relative w-fit max-w-[min(80%,100%)] min-w-0 flex flex-col gap-1",
            isMine ? "items-end" : "items-start",
          )}
        >
          <div
            className={cn(
              "min-w-0 max-w-full rounded-lg px-3.5 py-2.5 shadow-sm",
              compact ? "text-xs sm:text-sm" : "text-sm",
              isMine ? "bg-primary text-primary-foreground" : "bg-muted",
            )}
          >
            {showSenderName ? (
              <p className="opacity-80 mb-1 font-medium break-words">{senderName}</p>
            ) : null}
            <p className={cn("opacity-70 mb-1", compact ? "text-[10px]" : "")}>
              {formatTime(message.createdAt)}
            </p>

            {replyPreview ? (
              <button
                type="button"
                onClick={handleJumpToReply}
                disabled={!canJumpToReply}
                className={cn(
                  "mb-2 block w-full min-w-0 rounded border-l-2 px-2 py-1 text-left transition-opacity",
                  isMine
                    ? "border-primary-foreground/50 bg-primary-foreground/10"
                    : "border-primary bg-background/60",
                  canJumpToReply
                    ? "cursor-pointer hover:opacity-90"
                    : "cursor-default opacity-80",
                )}
                aria-label="원본 메시지로 이동"
                title={canJumpToReply ? "원본 메시지로 이동" : undefined}
              >
                <MessageReply replyTo={replyPreview} embedded />
              </button>
            ) : null}

            {hasTextContent ? (
              <p className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-snug">
                {message.content}
              </p>
            ) : null}

            {previewableAttachments.length > 0 ? (
              <div
                className={cn(
                  "grid gap-1.5",
                  hasTextContent ? "mt-2" : "mt-0.5",
                  previewableAttachments.length === 1
                    ? "grid-cols-1 max-w-[13.5rem] sm:max-w-[15rem]"
                    : "grid-cols-2 max-w-[15rem] sm:max-w-[17rem]",
                )}
              >
                {previewableAttachments.map((file, idx) => {
                  const kind = resolveChatPreviewKind(file) || "image";
                  const s3Key = String(file.s3Key || "").trim();
                  const thumbUrl = s3Key ? thumbUrls[s3Key] : "";
                  const modelThumb = s3Key ? modelThumbFiles[s3Key] : undefined;
                  const canPreview =
                    Boolean(authToken && s3Key) ||
                    (typeof onOpenAttachment === "function" &&
                      (s3Key || file.s3Url));
                  const busyKey = chatAttachmentBusyKey(file);
                  const isBusy = Boolean(
                    busyKey && downloadingFileKeys.includes(busyKey),
                  );
                  const progress = busyKey
                    ? Number(downloadProgressByKey[busyKey] ?? 0)
                    : 0;
                  const barWidth = isBusy
                    ? Math.max(6, Math.min(100, Math.round(progress)))
                    : 0;

                  return (
                    <button
                      key={`${message._id}:preview:${idx}`}
                      type="button"
                      disabled={!canPreview || isBusy}
                      onClick={() => {
                        if (isBusy) return;
                        if (authToken && s3Key) {
                          openAttachmentPreview(idx);
                          return;
                        }
                        if (onOpenAttachment) void onOpenAttachment(file);
                      }}
                      className={cn(
                        "relative aspect-square w-full overflow-hidden rounded-md border text-left transition-opacity",
                        isMine
                          ? "border-primary-foreground/25 bg-primary-foreground/10"
                          : "border-border/70 bg-background/70",
                        canPreview && !isBusy
                          ? "cursor-zoom-in hover:opacity-95"
                          : "cursor-default opacity-80",
                      )}
                      aria-busy={isBusy}
                      aria-label={
                        isBusy
                          ? `${file.fileName} 다운로드 중 ${Math.round(progress)}%`
                          : kind === "model"
                            ? `${file.fileName} 3D 미리보기`
                            : `${file.fileName} 미리보기`
                      }
                      title={
                        kind === "model"
                          ? "클릭하여 3D 미리보기"
                          : "클릭하여 이미지 미리보기"
                      }
                    >
                      {kind === "model" && modelThumb ? (
                        <StlPreviewThumbnail
                          file={modelThumb}
                          className="pointer-events-none"
                        />
                      ) : kind === "image" && thumbUrl ? (
                        <img
                          src={thumbUrl}
                          alt=""
                          className="h-full w-full object-cover"
                          draggable={false}
                        />
                      ) : (
                        <span
                          className={cn(
                            "flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center text-[10px] leading-snug",
                            isMine
                              ? "bg-primary-foreground/15 text-primary-foreground/80"
                              : "bg-muted-foreground/10 text-muted-foreground",
                          )}
                        >
                          {kind === "model" ? (
                            <Box className="h-7 w-7 shrink-0" aria-hidden />
                          ) : null}
                          <span className="line-clamp-3">{file.fileName}</span>
                        </span>
                      )}
                      {isBusy ? (
                        <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1.5 py-1">
                          <span className="mb-0.5 block text-[10px] text-white tabular-nums">
                            {Math.round(progress)}%
                          </span>
                          <span className="block h-1 w-full overflow-hidden rounded-full bg-white/25">
                            <span
                              className="block h-full rounded-full bg-white transition-[width]"
                              style={{ width: `${barWidth}%` }}
                            />
                          </span>
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {otherAttachments.length > 0 ? (
              <div
                className={cn(
                  "space-y-1",
                  previewableAttachments.length > 0 || hasTextContent
                    ? "mt-2"
                    : "mt-0.5",
                )}
              >
                {otherAttachments.map((file, idx) => {
                  const fileName = file.fileName;
                  const fileSizeNum = Number(file.fileSize || 0);
                  const sizeLabel =
                    typeof formatFileSize === "function"
                      ? formatFileSize(fileSizeNum)
                      : fileSizeNum > 0
                        ? `${fileSizeNum} B`
                        : "";
                  const s3Key = String(file.s3Key || "").trim();
                  const canOpen =
                    typeof onOpenAttachment === "function" &&
                    (s3Key || file.s3Url);
                  const busyKey = chatAttachmentBusyKey(file);
                  const isBusy = Boolean(
                    busyKey && downloadingFileKeys.includes(busyKey),
                  );
                  const progress = busyKey
                    ? Number(downloadProgressByKey[busyKey] ?? 0)
                    : 0;
                  const barWidth = isBusy
                    ? Math.max(6, Math.min(100, Math.round(progress)))
                    : 0;

                  return canOpen ? (
                    <button
                      key={`${message._id}:file:${idx}`}
                      type="button"
                      disabled={isBusy}
                      onClick={() => {
                        if (isBusy) return;
                        void onOpenAttachment(file);
                      }}
                      className="block w-full rounded border border-current/20 px-2 py-1 text-xs text-left underline-offset-2 hover:underline disabled:pointer-events-none disabled:no-underline disabled:opacity-80"
                      aria-busy={isBusy}
                      aria-label={
                        isBusy
                          ? `${fileName} 다운로드 중 ${Math.round(progress)}%`
                          : fileName
                      }
                    >
                      <span className="block">
                        {isBusy
                          ? `다운로드 중 ${Math.round(progress)}% · `
                          : ""}
                        {fileName}
                        {sizeLabel ? ` · ${sizeLabel}` : ""}
                      </span>
                      {isBusy ? (
                        <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-current/20">
                          <span
                            className="block h-full rounded-full bg-current/80 transition-[width]"
                            style={{ width: `${barWidth}%` }}
                          />
                        </span>
                      ) : null}
                    </button>
                  ) : (
                    <div
                      key={`${message._id}:file:${idx}`}
                      className="rounded border border-current/20 px-2 py-1 text-xs"
                    >
                      {fileName}
                      {sizeLabel ? ` · ${sizeLabel}` : ""}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          {reactionGroups.length > 0 ? (
            <div
              className={cn(
                "flex flex-wrap gap-1 max-w-full",
                isMine ? "justify-end" : "justify-start",
              )}
            >
              {reactionGroups.map((group) => {
                const reactorNames = formatReactionUserNames(
                  group.userIds,
                  reactionUserNameById,
                  myId,
                );
                return (
                  <Tooltip key={`${message._id}:rx:${group.emoji}`}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        disabled={!onToggleReaction}
                        onClick={() => handleToggle(group.emoji)}
                        className={cn(
                          "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs bg-background shadow-sm transition-colors",
                          group.reactedByMe
                            ? "border-primary/70 bg-primary-soft text-primary-strong"
                            : "border-border text-foreground hover:bg-muted",
                          !onToggleReaction && "cursor-default",
                        )}
                        aria-label={`${group.emoji} 리액션 ${group.count}개${reactorNames ? ` · ${reactorNames}` : ""}`}
                      >
                        <span>{group.emoji}</span>
                        <span className="tabular-nums text-[10px]">
                          {group.count}
                        </span>
                      </button>
                    </TooltipTrigger>
                    {reactorNames ? (
                      <TooltipContent side="top" className="text-xs">
                        {reactorNames}
                      </TooltipContent>
                    ) : null}
                  </Tooltip>
                );
              })}
            </div>
          ) : null}

          {canInteract ? (
            <div
              className={cn(
                "flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100",
                isMine ? "flex-row-reverse" : "flex-row",
              )}
            >
              {typeof onReply === "function" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onReply(message)}
                  aria-label="답글"
                  title="답글"
                >
                  <Reply className="h-3.5 w-3.5" />
                </Button>
              ) : null}

              {typeof onToggleReaction === "function" ? (
                <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label="리액션"
                      title="리액션"
                    >
                      <SmilePlus className="h-3.5 w-3.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-auto p-1.5"
                    align={isMine ? "end" : "start"}
                  >
                    <div className="flex items-center gap-0.5">
                      {CHAT_REACTION_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          className="h-8 w-8 rounded-md text-base hover:bg-muted"
                          onClick={() => handleToggle(emoji)}
                          aria-label={`${emoji} 리액션`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <ModelPreviewDialog
        open={previewOpen}
        onOpenChange={(next) => {
          if (!next) {
            resetPreview();
            return;
          }
          setPreviewOpen(true);
        }}
        kind={previewKind}
        fileName={previewMeta?.fileName || ""}
        file={previewFile}
        textureFile={previewTextureFile}
        companionFiles={previewCompanionFiles}
        loading={previewLoading}
        progress={previewProgress}
        downloadBusy={previewDownloadBusy}
        onDownload={
          previewMeta && onOpenAttachment
            ? () => void onOpenAttachment(previewMeta)
            : undefined
        }
        previewIndex={previewItems.length > 1 ? previewIndex : -1}
        previewCount={previewItems.length}
        onPrev={
          previewItems.length > 1 ? () => goPreviewRelative(-1) : undefined
        }
        onNext={
          previewItems.length > 1 ? () => goPreviewRelative(1) : undefined
        }
      />
    </>
  );
}

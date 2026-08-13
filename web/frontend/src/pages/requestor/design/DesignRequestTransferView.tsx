// change-log:
// - 2026-08-10: 의뢰 메모는 자유 메모만(치아/임플란트 폴백 제거). 파일 목록 s3Key 중복 제거.
// - 2026-08-10: 개별/전체 다운로드 중 재클릭 방지. 채팅 라벨·상대를 치과(발신 의뢰자)로 정렬.
// - 2026-08-10: 디자인 큐 기공의뢰서형 카드 + 상세/채팅 모달 호스트.
// - 2026-08-13: 채팅 첨부 즉시 백그라운드 업로드 + 칩 프로그레스바.
// - 2026-08-13: 채팅 첨부 다운로드 프로그레스바.
// related files:
// - web/frontend/src/pages/requestor/design/DesignPage.tsx
// - web/frontend/src/pages/requestor/design/DesignRequestCardGrid.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - web/frontend/src/shared/hooks/useBackgroundTempUpload.ts
// - web/frontend/src/shared/components/upload/BackgroundUploadList.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/backend/controllers/chats/chat.controller.js
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { useChatRooms, type ChatRoom } from "@/shared/hooks/useChatRooms";
import { useChatMessages } from "@/shared/hooks/useChatMessages";
import {
  toChatMessageAttachments,
  useBackgroundTempUpload,
} from "@/shared/hooks/useBackgroundTempUpload";
import {
  PracticeTransferDetailChatDialog,
  type PracticeTransferDialogFileItem,
  type PracticeTransferDialogSummaryItem,
} from "@/shared/components/PracticeTransferDetailChatDialog";
import {
  parsePracticeTransferMemoMeta,
  type ToothWorkSelection,
} from "@/shared/practice/transferMemo";
import type { ManufacturerRequest } from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";
import { DesignRequestCardGrid } from "./DesignRequestCardGrid";
import { useS3FileDownload } from "@/shared/files/useS3FileDownload";

const formatDateTime = (value: unknown) => {
  const d = new Date(String(value || ""));
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  });
};

const formatBytes = (bytes: number) => {
  const n = Number(bytes || 0);
  if (!Number.isFinite(n) || n <= 0) return "0B";
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(2)}MB`;
};

const formatShipYmd = (ymd?: string | null) => {
  const raw = String(ymd || "").trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "-";
  return `${Number(m[2])}.${Number(m[3])}`;
};

const normalizeToothWorks = (raw: unknown): ToothWorkSelection[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const toothNumber = String(r.toothNumber || r.tooth || "").trim();
      const prosthesisType = String(r.prosthesisType || "").trim();
      if (!toothNumber && !prosthesisType) return null;
      return {
        toothNumber,
        prosthesisType,
        customAbutment: Boolean(r.customAbutment),
        bridgeLinkedTeeth: Array.isArray(r.bridgeLinkedTeeth)
          ? r.bridgeLinkedTeeth.map((t) => String(t || "").trim()).filter(Boolean)
          : [],
        implantManufacturer: String(r.implantManufacturer || "").trim() || undefined,
        implantBrand: String(r.implantBrand || "").trim() || undefined,
        implantFamily: String(r.implantFamily || "").trim() || undefined,
        implantType: String(r.implantType || "").trim() || undefined,
        abutmentManufacturer: String(r.abutmentManufacturer || "").trim() || undefined,
        abutmentDiameter: String(r.abutmentDiameter || "").trim() || undefined,
        abutmentHeight: String(r.abutmentHeight || "").trim() || undefined,
      } satisfies ToothWorkSelection;
    })
    .filter((row): row is ToothWorkSelection => Boolean(row));
};

const collectRequestFiles = (
  request: ManufacturerRequest | null,
): PracticeTransferDialogFileItem[] => {
  if (!request) return [];
  const caseInfos = request.caseInfos || {};
  const out: PracticeTransferDialogFileItem[] = [];
  const seenKeys = new Set<string>();

  const pushFile = (file: {
    originalName?: string;
    filePath?: string;
    fileSize?: number;
    size?: number;
    s3Key?: string;
  } | null | undefined, id: string) => {
    if (!file) return;
    const s3Key = String(file.s3Key || "").trim();
    const fileName =
      String(file.originalName || file.filePath || "").trim() || "원본.stl";
    if (!s3Key && !file.originalName && !file.filePath) return;
    if (s3Key) {
      if (seenKeys.has(s3Key)) return;
      seenKeys.add(s3Key);
    } else {
      const dedupeName = fileName.toLowerCase();
      if (seenKeys.has(`name:${dedupeName}`)) return;
      seenKeys.add(`name:${dedupeName}`);
    }
    out.push({
      id,
      fileName,
      size: Number(file.fileSize ?? file.size ?? 0),
      s3Key,
    });
  };

  // caseInfos.file(primary)과 caseInfos.files에 동일 s3Key가 중복 저장되는 경우가 있어 제거한다.
  pushFile(
    caseInfos.file,
    `primary:${request._id || request.requestId || "file"}`,
  );
  const extras = Array.isArray(caseInfos.files) ? caseInfos.files : [];
  extras.forEach((file, idx) => {
    pushFile(file, `extra:${idx}:${file?.s3Key || file?.originalName || idx}`);
  });
  return out.filter((f) => f.fileName);
};

export type DesignRequestTransferViewProps = {
  requests: ManufacturerRequest[];
  hasMoreLabel: string;
  sentinelRef: RefObject<HTMLDivElement | null>;
  onDesignClaim?: (request: ManufacturerRequest) => void;
  onApprove?: (request: ManufacturerRequest) => void;
  designClaimBusyIds?: Record<string, boolean>;
};

export function DesignRequestTransferView({
  requests,
  hasMoreLabel,
  sentinelRef,
  onDesignClaim,
  onApprove,
  designClaimBusyIds,
}: DesignRequestTransferViewProps) {
  const { token, user } = useAuthStore();
  const { toast } = useToast();
  const chatUploads = useBackgroundTempUpload({ token });
  const { rooms } = useChatRooms();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ManufacturerRequest | null>(
    null,
  );
  const [activeChatRoom, setActiveChatRoom] = useState<ChatRoom | null>(null);
  const [chatError, setChatError] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const [chatReplyTo, setChatReplyTo] = useState<{
    _id: string;
    sender: { name: string; role: string };
    content: string;
  } | null>(null);
  const [chatSending, setChatSending] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const chatRoomResolveSeqRef = useRef(0);
  const {
    downloadingKeys,
    downloadProgressByKey,
    downloadAllBusy,
    downloadS3File,
    downloadAll,
    resetDownloads,
  } = useS3FileDownload(token);

  const {
    messages,
    loading: chatLoading,
    sendMessage,
    toggleReaction,
    prefetchMessages,
    setMessages: setChatMessages,
  } = useChatMessages({
    roomId: activeChatRoom?._id,
    autoFetch: dialogOpen,
  });

  const unreadByRequestId = useMemo(() => {
    const map = new Map<string, number>();
    for (const room of rooms) {
      const requestId = String(room.relatedRequestId?.requestId || "").trim();
      if (!requestId) continue;
      map.set(requestId, Number(room.unreadCount || 0));
    }
    return map;
  }, [rooms]);

  const openRequestDialog = useCallback(
    async (request: ManufacturerRequest) => {
      if (!token) return;
      const resolveSeq = ++chatRoomResolveSeqRef.current;

      setSelectedRequest(request);
      setDialogOpen(true);
      setChatError("");
      chatUploads.clear();
      setActiveChatRoom(null);
      setChatMessages([]);

      const requestId = String(request.requestId || "").trim();
      const mongoId = String(request._id || "").trim();

      const cachedRoom = rooms.find((room) => {
        const relatedId = String(room.relatedRequestId?.requestId || "").trim();
        const relatedMongo = String(room.relatedRequestId?._id || "").trim();
        return (
          (requestId && relatedId === requestId) ||
          (mongoId && relatedMongo === mongoId)
        );
      });
      if (cachedRoom?._id) {
        void prefetchMessages(cachedRoom._id);
        if (resolveSeq !== chatRoomResolveSeqRef.current) return;
        setActiveChatRoom(cachedRoom);
        return;
      }

      try {
        const pathId = encodeURIComponent(mongoId || requestId);
        const res = await apiFetch<unknown>({
          path: `/api/chats/request-room/${pathId}`,
          method: "GET",
          token,
        });

        if (!res.ok) {
          if (resolveSeq !== chatRoomResolveSeqRef.current) return;
          const body =
            res.data && typeof res.data === "object"
              ? (res.data as Record<string, unknown>)
              : {};
          setChatError(String(body.message || "치과 채팅방을 열 수 없습니다."));
          return;
        }

        const body =
          res.data && typeof res.data === "object"
            ? (res.data as Record<string, unknown>)
            : {};
        const room =
          body.data && typeof body.data === "object"
            ? (body.data as ChatRoom)
            : null;
        if (room?._id) {
          void prefetchMessages(room._id);
        }
        if (resolveSeq !== chatRoomResolveSeqRef.current) return;
        setActiveChatRoom(room);
      } catch {
        if (resolveSeq !== chatRoomResolveSeqRef.current) return;
        setChatError("치과 채팅방 조회 중 오류가 발생했습니다.");
      }
    },
    [prefetchMessages, rooms, setChatMessages, token],
  );

  const dialogFiles = useMemo(
    () => collectRequestFiles(selectedRequest),
    [selectedRequest],
  );

  const handleDownloadFile = useCallback(
    async (file: PracticeTransferDialogFileItem) => {
      await downloadS3File({
        s3Key: file.s3Key,
        fileName: file.fileName,
        busyKey: String(file.s3Key || file.id || "").trim(),
      });
    },
    [downloadS3File],
  );

  const handleDownloadAllFiles = useCallback(async () => {
    await downloadAll(
      dialogFiles.map((file) => ({
        s3Key: file.s3Key,
        fileName: file.fileName,
        busyKey: String(file.s3Key || file.id || "").trim(),
      })),
    );
  }, [dialogFiles, downloadAll]);

  const handleDownloadChatAttachment = useCallback(
    async (attachment: {
      fileId?: string;
      fileName?: string;
      fileSize?: number;
      s3Key?: string;
      s3Url?: string;
    }) => {
      const s3Key = String(attachment?.s3Key || "").trim();
      await downloadS3File({
        s3Key,
        fileName: String(attachment?.fileName || "첨부파일").trim() || "첨부파일",
        busyKey: s3Key || String(attachment?.fileId || "").trim(),
      });
    },
    [downloadS3File],
  );

  const handleAttachChatFiles = useCallback((files: FileList | null) => {
    if (!files?.length) return;
    chatUploads.addFiles(Array.from(files));
  }, [chatUploads.addFiles]);

  const handleSendChat = useCallback(async () => {
    const text = chatDraft.trim();
    if ((!text && chatUploads.items.length === 0) || !activeChatRoom?._id || chatSending) {
      return;
    }

    setChatSending(true);
    try {
      let attachments = toChatMessageAttachments([]);
      if (chatUploads.items.length > 0) {
        const uploadedFiles = await chatUploads.ensureUploaded();
        attachments = toChatMessageAttachments(uploadedFiles);
        if (!attachments.length) {
          throw new Error("파일 업로드에 실패했습니다.");
        }
      }

      const sent = await sendMessage(text, attachments, {
        replyTo: chatReplyTo?._id || null,
      });
      if (sent) {
        setChatDraft("");
        setChatReplyTo(null);
        chatUploads.clear();
      }
    } catch (error) {
      toast({
        title: "업로드 실패",
        description:
          error instanceof Error
            ? error.message
            : "파일 업로드 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setChatSending(false);
    }
  }, [
    activeChatRoom?._id,
    chatDraft,
    chatReplyTo?._id,
    chatSending,
    chatUploads,
    sendMessage,
    toast,
  ]);

  useEffect(() => {
    if (!dialogOpen || !activeChatRoom?._id) return;
    const el = chatBottomRef.current;
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  }, [dialogOpen, activeChatRoom?._id, messages.length, chatLoading]);

  const caseInfos = selectedRequest?.caseInfos;
  const toothWorks = normalizeToothWorks(caseInfos?.toothWorks);
  // 보철물 차트에 치아/임플란트가 있으므로 메모는 의뢰인 자유 텍스트만 표시.
  const displayMemo = String(
    parsePracticeTransferMemoMeta(String(caseInfos?.memo || "")).memo || "",
  ).trim();

  const summaryItems: PracticeTransferDialogSummaryItem[] = [
    { label: "의뢰ID", value: selectedRequest?.requestId || "-" },
    {
      label: "전송시각",
      value: selectedRequest ? formatDateTime(selectedRequest.createdAt) : "-",
    },
    {
      label: "기공소",
      value:
        String(selectedRequest?.requestor?.business || "").trim() ||
        String(
          (selectedRequest as { business?: { name?: string } } | null)?.business
            ?.name || "",
        ).trim() ||
        "-",
    },
    {
      label: "담당자",
      value: String(selectedRequest?.requestor?.name || "").trim() || "-",
    },
    {
      label: "치과",
      value: String(caseInfos?.clinicName || "").trim() || "-",
    },
    {
      label: "환자명",
      value: String(caseInfos?.patientName || "").trim() || "-",
    },
    {
      label: "출고예정",
      value: formatShipYmd(selectedRequest?.timeline?.estimatedShipYmd),
    },
  ];

  return (
    <>
      <DesignRequestCardGrid
        requests={requests}
        unreadByRequestId={unreadByRequestId}
        onOpen={(req) => void openRequestDialog(req)}
        onDesignClaim={onDesignClaim}
        onApprove={onApprove}
        designClaimBusyIds={designClaimBusyIds}
      />

      <div ref={sentinelRef} className="py-4 text-center text-gray-500">
        {hasMoreLabel}
      </div>

      <PracticeTransferDetailChatDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            chatRoomResolveSeqRef.current += 1;
            setSelectedRequest(null);
            setActiveChatRoom(null);
            setChatMessages([]);
            setChatDraft("");
            setChatReplyTo(null);
            chatUploads.clear();
            setChatError("");
            resetDownloads();
          }
        }}
        title="의뢰 상세 · 치과 채팅"
        conversationTitle="치과와의 소통"
        summaryItems={summaryItems}
        memo={displayMemo || "-"}
        toothWorks={toothWorks}
        toothWorksKey={selectedRequest?.requestId || "design-request"}
        filesLabel="의뢰 파일"
        files={dialogFiles}
        downloadingFileKeys={downloadingKeys}
        downloadProgressByKey={downloadProgressByKey}
        downloadAllBusy={downloadAllBusy}
        onDownloadAllFiles={() => void handleDownloadAllFiles()}
        onDownloadTransferFile={(file) => void handleDownloadFile(file)}
        chatLoading={chatLoading}
        chatError={String(chatError || "")}
        chatMessages={messages}
        isMyMessage={(senderId) =>
          senderId === String(user?.id || (user as { _id?: string } | null)?._id || "")
        }
        currentUserId={String(
          user?.id || (user as { _id?: string } | null)?._id || "",
        ).trim()}
        formatChatTime={formatDateTime}
        formatFileSize={formatBytes}
        onDownloadChatAttachment={handleDownloadChatAttachment}
        chatBottomRef={chatBottomRef}
        chatAttachedFiles={chatUploads.items}
        onRemoveAttachedChatFile={chatUploads.removeItem}
        onRetryAttachedChatFile={chatUploads.retryItem}
        onAttachChatFiles={handleAttachChatFiles}
        attachmentInputId="design-request-chat-attachment-input"
        chatDraft={chatDraft}
        onChangeChatDraft={setChatDraft}
        onSendChatMessage={() => void handleSendChat()}
        replyTo={chatReplyTo}
        onReplyToMessage={(message) => {
          setChatReplyTo({
            _id: String(message._id),
            sender: {
              name: String(message.sender?.name || "").trim() || "알 수 없음",
              role: String(message.sender?.role || "").trim(),
            },
            content: String(message.content || "").trim() || "(내용 없음)",
          });
        }}
        onCancelReply={() => setChatReplyTo(null)}
        onToggleReaction={(messageId, emoji) => void toggleReaction(messageId, emoji)}
        composerPlaceholder="치과에 전달할 내용을 입력하세요"
        inputDisabled={chatLoading || chatSending || !activeChatRoom?._id}
        sendDisabled={
          chatLoading ||
          chatSending ||
          !activeChatRoom?._id ||
          (!chatDraft.trim() && chatUploads.items.length === 0)
        }
      />
    </>
  );
}

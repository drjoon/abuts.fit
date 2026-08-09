// change-log:
// - 2026-08-10: 디자인 큐 기공의뢰서형 카드 + 상세/채팅 모달 호스트.
// related files:
// - web/frontend/src/pages/requestor/design/DesignPage.tsx
// - web/frontend/src/pages/requestor/design/DesignRequestCardGrid.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
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
import { useUploadWithProgressToast } from "@/shared/hooks/useUploadWithProgressToast";
import { type TempUploadedFile } from "@/shared/hooks/useS3TempUpload";
import {
  PracticeTransferDetailChatDialog,
  type PracticeTransferDialogFileItem,
  type PracticeTransferDialogSummaryItem,
} from "@/shared/components/PracticeTransferDetailChatDialog";
import {
  formatToothWorksForDisplay,
  type ToothWorkSelection,
} from "@/shared/practice/transferMemo";
import type { ManufacturerRequest } from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";
import { DesignRequestCardGrid } from "./DesignRequestCardGrid";

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
  const primary = caseInfos.file;
  if (primary?.s3Key || primary?.filePath || primary?.originalName) {
    out.push({
      id: `primary:${request._id || request.requestId || "file"}`,
      fileName:
        String(primary.originalName || primary.filePath || "원본.stl").trim() ||
        "원본.stl",
      size: Number(primary.fileSize || 0),
      s3Key: String(primary.s3Key || "").trim(),
    });
  }
  const extras = Array.isArray(caseInfos.files) ? caseInfos.files : [];
  extras.forEach((file, idx) => {
    if (!file) return;
    out.push({
      id: `extra:${idx}:${file.s3Key || file.originalName || idx}`,
      fileName: String(file.originalName || file.filePath || `파일${idx + 1}`).trim(),
      size: Number(file.fileSize || 0),
      s3Key: String(file.s3Key || "").trim(),
    });
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
  const { uploadFilesWithToast } = useUploadWithProgressToast({ token });
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
  const [chatAttachedFiles, setChatAttachedFiles] = useState<File[]>([]);
  const [chatSending, setChatSending] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const chatRoomResolveSeqRef = useRef(0);

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
      setChatAttachedFiles([]);
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
          setChatError(String(body.message || "기공소 채팅방을 열 수 없습니다."));
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
        setChatError("기공소 채팅방 조회 중 오류가 발생했습니다.");
      }
    },
    [prefetchMessages, rooms, setChatMessages, token],
  );

  const handleDownloadFile = useCallback(
    async (file: PracticeTransferDialogFileItem) => {
      if (!token || !file.s3Key) {
        toast({
          title: "다운로드 실패",
          description: "파일 키가 없어 다운로드할 수 없습니다.",
          variant: "destructive",
        });
        return;
      }

      try {
        const downloadPath = `/api/files/s3/download?key=${encodeURIComponent(file.s3Key)}&fileName=${encodeURIComponent(file.fileName || "download")}&_ts=${Date.now()}`;
        const resp = await fetch(downloadPath, {
          method: "GET",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!resp.ok) {
          throw new Error("다운로드 응답이 올바르지 않습니다.");
        }

        const blob = await resp.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = String(file.fileName || "download").trim() || "download";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objectUrl);
      } catch {
        toast({
          title: "다운로드 실패",
          description: "다운로드 요청 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      }
    },
    [toast, token],
  );

  const dialogFiles = useMemo(
    () => collectRequestFiles(selectedRequest),
    [selectedRequest],
  );

  const handleDownloadAllFiles = useCallback(async () => {
    if (!dialogFiles.length) return;
    await Promise.all(dialogFiles.map((file) => handleDownloadFile(file)));
  }, [dialogFiles, handleDownloadFile]);

  const handleDownloadChatAttachment = useCallback(
    async (attachment: {
      fileName?: string;
      fileSize?: number;
      s3Key?: string;
      s3Url?: string;
    }) => {
      if (!token) return;
      const rawName =
        String(attachment?.fileName || "첨부파일").trim() || "첨부파일";
      const s3Key = String(attachment?.s3Key || "").trim();
      if (!s3Key) return;

      try {
        const downloadPath = `/api/files/s3/download?key=${encodeURIComponent(s3Key)}&fileName=${encodeURIComponent(rawName)}&_ts=${Date.now()}`;
        const resp = await fetch(downloadPath, {
          method: "GET",
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) throw new Error("download failed");
        const blob = await resp.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = rawName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objectUrl);
      } catch {
        toast({
          title: "다운로드 실패",
          description: "채팅 첨부 다운로드 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      }
    },
    [toast, token],
  );

  const handleAttachChatFiles = useCallback((files: FileList | null) => {
    if (!files?.length) return;
    setChatAttachedFiles((prev) => [...prev, ...Array.from(files)]);
  }, []);

  const handleRemoveAttachedChatFile = useCallback((index: number) => {
    setChatAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSendChat = useCallback(async () => {
    const text = chatDraft.trim();
    const files = [...chatAttachedFiles];
    if ((!text && files.length === 0) || !activeChatRoom?._id || chatSending) return;

    setChatSending(true);
    try {
      let attachments: Array<{
        fileId?: string;
        fileName: string;
        fileType: string;
        fileSize: number;
        s3Key: string;
        s3Url: string;
      }> = [];

      if (files.length > 0) {
        const uploadedFiles: TempUploadedFile[] = await uploadFilesWithToast(files);
        attachments = uploadedFiles
          .map((f) => ({
            fileId: String(f._id || "").trim() || undefined,
            fileName: String(f.originalName || "").trim(),
            fileType: String(f.mimetype || f.fileType || "application/octet-stream").trim(),
            fileSize: Number(f.size || 0),
            s3Key: String(f.key || "").trim(),
            s3Url: String(f.location || "").trim(),
          }))
          .filter((row) => row.fileName && row.s3Key);
      }

      const sent = await sendMessage(text, attachments, {
        replyTo: chatReplyTo?._id || null,
      });
      if (sent) {
        setChatDraft("");
        setChatReplyTo(null);
        setChatAttachedFiles([]);
      }
    } finally {
      setChatSending(false);
    }
  }, [
    activeChatRoom?._id,
    chatAttachedFiles,
    chatDraft,
    chatReplyTo?._id,
    chatSending,
    sendMessage,
    uploadFilesWithToast,
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
  const toothWorksPreview = formatToothWorksForDisplay(toothWorks);
  const memoParts = [
    String(caseInfos?.memo || "").trim(),
    !toothWorks.length && caseInfos?.prosthesisType
      ? `형태: ${String(caseInfos.prosthesisType).trim()}`
      : "",
    caseInfos?.tooth && !toothWorks.length
      ? `치아: ${String(caseInfos.tooth).trim()}`
      : "",
  ].filter(Boolean);
  const displayMemo =
    memoParts.join("\n") ||
    (toothWorksPreview ? `치아별 ${toothWorksPreview}` : "");

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
            setChatAttachedFiles([]);
            setChatError("");
          }
        }}
        title="의뢰 상세 · 기공소 채팅"
        conversationTitle="기공소와의 소통"
        summaryItems={summaryItems}
        memo={displayMemo || "-"}
        toothWorks={toothWorks}
        toothWorksKey={selectedRequest?.requestId || "design-request"}
        filesLabel="의뢰 파일"
        files={dialogFiles}
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
        chatAttachedFiles={chatAttachedFiles}
        onRemoveAttachedChatFile={handleRemoveAttachedChatFile}
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
        composerPlaceholder="기공소에 전달할 내용을 입력하세요"
        inputDisabled={chatLoading || chatSending || !activeChatRoom?._id}
        sendDisabled={
          chatLoading ||
          chatSending ||
          !activeChatRoom?._id ||
          (!chatDraft.trim() && chatAttachedFiles.length === 0)
        }
      />
    </>
  );
}

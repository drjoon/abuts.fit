// related files:
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/realtime/useAppEventListener.ts
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/backend/controllers/practiceTransfers/practiceTransferSettings.controller.js
// - web/backend/models/practiceTransfer.model.js
// - web/backend/modules/chat/chat.routes.js
// - web/backend/controllers/chats/chat.controller.js
// - web/backend/modules/files/file.routes.js
// - web/backend/controllers/files/file.controller.js
// - web/frontend/src/shared/hooks/useUploadWithProgressToast.ts
// - web/frontend/src/shared/hooks/useBackgroundTempUpload.ts
// - web/frontend/src/shared/components/upload/BackgroundUploadList.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - 2026-08-14: 자동매칭 채팅 헤더에도 기공수가 할증(표시명 비공개·practiceAnchorId 내부 키).
// - 2026-08-14: 자동매칭 수락·3시간 남은시간 뱃지 제거(도착일·소통 기한. 강제 클레임 만료 없음).
// - 2026-08-14: 의뢰수락 busy — transfer-room 재연결을 await하지 않음(수락 API만 대기).
// - 2026-08-14: 의뢰수락 — 낙관적 UI(즉시 수락 표시) + API는 백그라운드 확정/롤백.
// - 2026-08-14: 수락/취소 버튼 — 처리 즉시 시작, UI는 최소 1초「…중」후 전환.
// - 2026-08-14: 상세 모달 수락 자리에 작업취소(mark-release) 노출.
// - 2026-08-14: 작업취소 — 서버 사이드이펙트 비동기. UI는 수락과 동일 1초 딜레이.
// - 2026-08-11: 역할 로딩 스켈레톤(발신/수신)·수신 목록 카드 스켈레톤.
// - 2026-08-11: 디자인 페이지 삭제 — DesignQueueSection을 의뢰수신 UI에 통합(기간필터 공유).
// - 2026-08-11: 기공소 의뢰수신 — 발신/수신 탭 제거·항상 수신. 디자인 큐를 의뢰수신으로 편입.
// - 2026-08-11: 치과 기공의뢰 — 발신/수신 탭 제거·항상 발신.
// - 2026-08-11: 사이드메뉴 딥링크용 ?mode=send|receive 동기화.
// - 2026-08-11: 기공소 기공의뢰수신 — 내역 카드 제거·검색/뱃지를 의뢰수신으로 통합·제목 삭제.
// - 2026-08-13: 치과초대 우측 카드 제거·작업영역 카드가 화면 남은 높이를 채움.
// - 2026-08-11: 치과초대 우측 상단(9:3)·의뢰수신 상단 필터左/검색右.
// - 2026-08-11: 치과 링크 전달 — 파일전송(/p) → 기공소 소개코드 가입 링크.
// - 2026-08-11: 상단 뱃지에 포장.발송·추적관리 추가(기공 파이프라인 UI).
// - 2026-08-11: 디자인 큐 빈 상태 카드 제거 — 전송 내역만 표시(둘 다 없으면 안내 문구).
// - 2026-08-11: 기공소 거래 치과 등록 D-day 배너(설정 이동).
// - 2026-08-12: 상단 기공의뢰서 promo alert 제거. 소개치과+가입이유 2열 배너.
// - 2026-08-11: [안내 복사] 문구 — 이모티콘·부드러운 말투로 정리.
// - 2026-08-11: 다운로드→의뢰수락 뱃지/상태. 수락 API 과금. 파일 다운로드는 상태 미전이.
// - 2026-08-11: 의뢰수락 후 치과 transfer-room 재연결. 모달 폭·lab peer 채팅 연결.
// - 2026-08-13: 의뢰 상세 모달 — 수락 전에도 지정 기공소는 치과 채팅 내역을 표시.
// - 2026-08-11: 수락 카드에 작업완료/작업취소 버튼. mark-release API.
// - 2026-08-14: 자동매칭(공개 풀)도 의뢰 뱃지 집계·필터에 포함. 치과/기공소 표시명은 마스킹.
// - 2026-08-13: 상단 뱃지 6칸 — 의뢰·수락·완료·취소·발송·리메이크(작업취소는 취소 집계).
// - 2026-08-11: 상단 뱃지 5칸 — 의뢰·수락·완료·발송·추적관리(수신 제거, 수신완료는 의뢰 집계).
// - 2026-08-12: 수락 카드 — 별도 결과파일 드롭존 제거·카드 점선 외곽·작업완료 왼쪽 드롭 아이콘.
// - 2026-08-13: 채팅 첨부 즉시 백그라운드 업로드 + 칩 프로그레스바.
// - 2026-08-13: 채팅/의뢰 파일 다운로드 프로그레스바.
// - 2026-08-15: 기공기간 5일 미만 빨간 표시·거부 가능 툴팁(목록·상세).
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { LabDashboardTopBanners } from "@/features/lab/LabDashboardTopBanners";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import { usePeriodStore } from "@/store/usePeriodStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { apiFetch } from "@/shared/api/apiClient";
import { useChatMessages } from "@/shared/hooks/useChatMessages";
import { useChatRooms, type ChatRoom } from "@/shared/hooks/useChatRooms";
import { anonymizeAutoMatchChatSenderName } from "@/shared/practice/autoMatchIdentity";
import { useAppEventListener } from "@/shared/realtime/useAppEventListener";
import { useUploadWithProgressToast } from "@/shared/hooks/useUploadWithProgressToast";
import {
  toChatMessageAttachments,
  useBackgroundTempUpload,
} from "@/shared/hooks/useBackgroundTempUpload";
import { useS3FileDownload } from "@/shared/files/useS3FileDownload";
import { type TempUploadedFile } from "@/shared/hooks/useS3TempUpload";
import { Building2, Search, UploadCloud } from "lucide-react";
import { cn } from "@/shared/ui/cn";
import {
  PRACTICE_REMAKE_BADGE_CLASS,
  toStatusBadgeLabel,
} from "@/shared/practice/practiceRecentTransferList";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  PracticeTransferDetailChatDialog,
  type PracticeTransferDialogFileItem,
  type PracticeTransferDialogSummaryItem,
} from "@/shared/components/PracticeTransferDetailChatDialog";
import {
  PracticeTransferFileDropTarget,
  openPracticeTransferFilePicker,
} from "@/shared/components/practice/PracticeTransferFileDropTarget";
import { PracticeTransferFeeEstimate } from "@/shared/components/practice/PracticeTransferFeeEstimate";
import { LabPracticeFeeSurchargeControl } from "@/shared/components/practice/LabPracticeFeeSurchargeControl";
import {
  parsePracticeTransferFeeQuote,
  type PracticeTransferFeeQuote,
} from "@/shared/practice/practiceTransferFeeQuote";
import { normalizeLabFeeMultiplier } from "@/shared/practice/labFeeSchedule";
import { PRACTICE_ACCEPTED_HINT } from "@/shared/practice/practiceTransferAccept";
import { buildPracticeWorkPeriodSummaryItem } from "@/shared/practice/practiceWorkPeriod";
import { PracticeWorkPeriodText } from "@/shared/components/practice/PracticeWorkPeriodText";
import { useRequestorBusinessAccess } from "@/shared/business/useRequestorBusinessAccess";
import { REQUESTOR_KIND_LABEL } from "@/shared/business/requestorCapabilities";
import { PracticeFileTransferPage } from "@/pages/practice/PracticeFileTransferPage";
import { DesignQueueSection } from "@/pages/requestor/design/DesignQueueSection";
import {
  RequestorPracticePageSkeleton,
  RequestorPracticeTransferCardsSkeleton,
} from "@/shared/ui/skeletons/RequestorPracticePageSkeleton";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  formatToothWorksForDisplay,
  parsePracticeTransferMemoMeta as parsePracticeTransferMemoMetaShared,
  parseToothWorks,
  serializeToothWorks,
} from "@/shared/practice/transferMemo";
import type { ReactNode } from "react";

type ReceivedPracticeFile = {
  id: string;
  patientName: string;
  tooth: string;
  originalName: string;
  mimetype: string;
  size: number;
  s3Key: string;
};

type ReceivedPracticeTransfer = {
  _id: string;
  transferId: string;
  targetLabName: string;
  transferMemo: string;
  rawTransferMemo: string;
  orderDate: string;
  arrivalDate: string;
  prosthesisTypes: string[];
  toothWorksSummary: string;
  status: string;
  manufacturerStage?: string;
  createdAt: string;
  updatedAt: string;
  isRead: boolean;
  requestorReadAt: string | null;
  isDownloaded: boolean;
  isAccepted: boolean;
  requestorDownloadedAt: string | null;
  requestorAcceptedAt: string | null;
  workCanceledAt?: string | null;
  matchingMode?: "direct" | "auto";
  autoMatch?: {
    claimedAt?: string | null;
    deadlineAt?: string | null;
    claimHours?: number | null;
    completedAt?: string | null;
    openPool?: boolean;
    claimActive?: boolean;
    completed?: boolean;
    mine?: boolean;
    remainingMs?: number | null;
    releaseCount?: number;
  } | null;
  hasCustomAbutment?: boolean;
  production?: {
    shippingMode?: "normal" | "express" | null;
    skipDesignConfirm?: boolean;
    designReadyAt?: string | null;
    designFileCount?: number;
    designFiles?: ReceivedPracticeFile[];
    labDesignConfirmedAt?: string | null;
    practiceDesignConfirmedAt?: string | null;
    abutmentProductionStartedAt?: string | null;
    confirmedAt?: string | null;
    relatedRequestIds?: string[];
  } | null;
  practice: {
    businessName: string;
    userName: string;
  };
  practiceBusinessAnchorId?: string | null;
  labFeeMultiplier?: number;
  fileCount: number;
  files: ReceivedPracticeFile[];
  resultFileCount?: number;
  resultFiles?: ReceivedPracticeFile[];
  feeQuote?: PracticeTransferFeeQuote | null;
  isRemake?: boolean;
  remakeSourceTransferId?: string;
};

type ReceivedTransfersResponse = {
  transfers: unknown[];
  unreadCount: number;
  pagination?: {
    page?: number;
    limit?: number;
    count?: number;
    total?: number;
    hasMore?: boolean;
  };
};

const PAGE_SIZE = 10; // 2열 x 5행

const formatDateTime = (value: unknown) => {
  const d = new Date(String(value || ""));
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
};

const formatBytes = (bytes: number) => {
  const n = Number(bytes || 0);
  if (!Number.isFinite(n) || n <= 0) return "0B";
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(2)}MB`;
};

const formatToothWorksSummary = (
  raw: string,
  options?: { multiline?: boolean; labFacing?: boolean },
) => formatToothWorksForDisplay(parseToothWorks(raw), options);

const parsePracticeTransferMemoMeta = (rawMemo: string) => {
  const parsed = parsePracticeTransferMemoMetaShared(rawMemo);
  return {
    orderDate: parsed.orderDate,
    arrivalDate: parsed.arrivalDate,
    prosthesisTypes: parsed.prosthesisTypes,
    toothWorksSummary: serializeToothWorks(parsed.toothWorks),
    memo: parsed.memo,
  };
};

const getTransferDisplayStatus = (transfer: {
  status?: string;
  manufacturerStage?: string;
  isRead?: boolean;
  isDownloaded?: boolean;
  isAccepted?: boolean;
  requestorDownloadedAt?: string | null;
  requestorAcceptedAt?: string | null;
  workCanceledAt?: string | null;
  matchingMode?: string | null;
  production?: {
    confirmedAt?: string | null;
  } | null;
  autoMatch?: {
    openPool?: boolean;
    completed?: boolean;
    claimActive?: boolean;
    mine?: boolean;
  } | null;
}) => {
  if (transfer.production?.confirmedAt || transfer.manufacturerStage === "생산진행") {
    return "생산진행" as const;
  }
  if (transfer.autoMatch?.completed || transfer.manufacturerStage === "작업완료") {
    return "작업완료" as const;
  }

  const stage = String(transfer.manufacturerStage || "").trim();
  if (
    stage === "작업취소" ||
    stage === "취소" ||
    Boolean(String(transfer.workCanceledAt || "").trim())
  ) {
    // 기공소 작업취소 — 카드 뱃지는 「취소」
    return "취소" as const;
  }

  if (
    String(transfer.matchingMode || "") === "auto" &&
    transfer.autoMatch?.openPool
  ) {
    return "자동매칭" as const;
  }

  const rawStatus = String(transfer.status || "").trim().toLowerCase();
  if (
    Boolean(transfer.isAccepted) ||
    Boolean(transfer.isDownloaded) ||
    Boolean(String(transfer.requestorAcceptedAt || "").trim()) ||
    Boolean(String(transfer.requestorDownloadedAt || "").trim()) ||
    rawStatus === "downloaded" ||
    rawStatus === "accepted" ||
    rawStatus === "다운로드완료" ||
    rawStatus === "의뢰수락"
  ) {
    return "의뢰수락" as const;
  }

  return transfer.isRead ? ("수신완료" as const) : ("발송완료" as const);
};

const transferHasCustomAbutment = (transfer: ReceivedPracticeTransfer) => {
  if (typeof transfer.hasCustomAbutment === "boolean") {
    return transfer.hasCustomAbutment;
  }
  return parseToothWorks(transfer.toothWorksSummary).some((row) =>
    Boolean(row.customAbutment),
  );
};

export default function RequestorPracticePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    loading,
    canSendTransfer,
    canReceiveTransfer,
    kind,
    designAccessEnabled,
  } = useRequestorBusinessAccess();
  const modeParam = searchParams.get("mode");

  useEffect(() => {
    if (loading) return;
    const desired = kind === "lab" ? "receive" : "send";
    if (modeParam === desired) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("mode", desired);
    setSearchParams(nextParams, { replace: true });
  }, [kind, loading, modeParam, searchParams, setSearchParams]);

  if (loading) {
    // kind 확정 전: 사이드메뉴 mode 힌트로 발신/수신 스켈레톤 선택
    const hintMode =
      modeParam === "receive" || modeParam === "send"
        ? modeParam
        : "send";
    return <RequestorPracticePageSkeleton mode={hintMode} />;
  }

  // 기공소: 항상 수신만. 지정 기공소 디자인 큐도 의뢰수신에 통합 표시.
  if (kind === "lab") {
    if (!canReceiveTransfer && !designAccessEnabled) {
      return (
        <div className="flex min-h-[50vh] items-center justify-center p-6">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-lg">역할 선택 필요</CardTitle>
              <CardDescription>
                기공의뢰서 이용을 위해 설정 &gt; 사업자에서{" "}
                {REQUESTOR_KIND_LABEL.lab} 역할을 선택해주세요.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full"
                onClick={() => navigate("/dashboard/settings?tab=business")}
              >
                사업자 설정으로 이동
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return (
      <RequestorPracticeReceivePage
        showDesignQueue={designAccessEnabled}
        showTransfers={canReceiveTransfer}
      />
    );
  }

  // 치과: 항상 발신만.
  if (!canSendTransfer) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-lg">역할 선택 필요</CardTitle>
            <CardDescription>
              기공의뢰서 이용을 위해 설정 &gt; 사업자에서{" "}
              {REQUESTOR_KIND_LABEL.practice} 역할을 선택해주세요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              onClick={() => navigate("/dashboard/settings?tab=business")}
            >
              사업자 설정으로 이동
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <PracticeFileTransferPage />;
}

function RequestorPracticeReceivePage({
  roleSwitcher,
  showDesignQueue = false,
  showTransfers = true,
}: {
  roleSwitcher?: ReactNode;
  /** 지정 기공소: 디자인+생산 준비 큐를 의뢰수신에 통합 */
  showDesignQueue?: boolean;
  /** 무료 기공의뢰서 수신 목록 표시 */
  showTransfers?: boolean;
}) {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const { period, setPeriod } = usePeriodStore();
  const { toast } = useToast();
  const { rooms } = useChatRooms();
  const { uploadFilesWithToast } = useUploadWithProgressToast({ token });
  const chatUploads = useBackgroundTempUpload({ token });
  const {
    downloadingKeys,
    downloadProgressByKey,
    downloadAllBusy,
    downloadS3File,
    downloadAll,
    resetDownloads,
  } = useS3FileDownload(token);

  const [transfers, setTransfers] = useState<ReceivedPracticeTransfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "발송완료" | "의뢰수락" | "작업완료" | "취소" | "포장.발송" | "리메이크"
  >("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<ReceivedPracticeTransfer | null>(null);
  const [acceptBusy, setAcceptBusy] = useState(false);
  const [releaseBusy, setReleaseBusy] = useState(false);
  const [cardActionBusyId, setCardActionBusyId] = useState<string>("");
  const [designConfirmBusyId, setDesignConfirmBusyId] = useState<string>("");
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
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const realtimeReloadTimerRef = useRef<number | null>(null);
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

  const displayChatMessages = useMemo(() => {
    const currentUserId = String(user?.id || "");
    return messages.map((message) => {
      const senderId = String(message.sender?._id || "");
      const name = anonymizeAutoMatchChatSenderName({
        matchingMode: selectedTransfer?.matchingMode,
        isOwn: senderId === currentUserId,
        counterpartLabel: "치과",
        name: String(message.sender?.name || ""),
      });
      return {
        ...message,
        sender: { ...message.sender, name },
      };
    });
  }, [messages, selectedTransfer?.matchingMode, user?.id]);

  const unreadByTransferId = useMemo(() => {
    const map = new Map<string, number>();
    for (const room of rooms) {
      const transferId = String(room.relatedPracticeTransferId?.transferId || "").trim();
      if (!transferId) continue;
      map.set(transferId, Number(room.unreadCount || 0));
    }
    return map;
  }, [rooms]);

  const emitUnreadBadgeRefresh = useCallback((nextUnreadCount?: number) => {
    window.dispatchEvent(
      new CustomEvent("abuts:practice-transfers:unread-updated", {
        detail: {
          unreadCount:
            Number.isFinite(Number(nextUnreadCount)) && Number(nextUnreadCount) >= 0
              ? Number(nextUnreadCount)
              : undefined,
        },
      }),
    );
  }, []);

  const parseTransfersBody = useCallback((raw: unknown): ReceivedTransfersResponse => {
    const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const data =
      body.data && typeof body.data === "object"
        ? (body.data as Record<string, unknown>)
        : body;

    const transfers = Array.isArray(data.transfers) ? data.transfers : [];
    const unreadCount = Number(data.unreadCount || 0);
    const pagination =
      data.pagination && typeof data.pagination === "object"
        ? (data.pagination as Record<string, unknown>)
        : undefined;

    return {
      transfers,
      unreadCount,
      pagination: pagination
        ? {
            page: Number(pagination.page || 0),
            limit: Number(pagination.limit || 0),
            count: Number(pagination.count || 0),
            total: Number(pagination.total || 0),
            hasMore: Boolean(pagination.hasMore),
          }
        : undefined,
    };
  }, []);

  const mapTransferRows = useCallback((rows: unknown[]) => {
    const mapped: ReceivedPracticeTransfer[] = rows
      .map((row) => {
        const r = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
        const practiceRaw =
          r.practice && typeof r.practice === "object"
            ? (r.practice as Record<string, unknown>)
            : {};
        const filesRaw = Array.isArray(r.files) ? r.files : [];
        const resultFilesRaw = Array.isArray(r.resultFiles) ? r.resultFiles : [];

        const mapFileRow = (f: unknown, idx: number, prefix = "") => {
          const item = f && typeof f === "object" ? (f as Record<string, unknown>) : {};
          return {
            id: String(item.id || `${String(r._id || "")}${prefix}:${idx + 1}`),
            patientName: String(item.patientName || "").trim(),
            tooth: String(item.tooth || "").trim(),
            originalName: String(item.originalName || "").trim(),
            mimetype: String(item.mimetype || "application/octet-stream").trim(),
            size: Number(item.size || 0),
            s3Key: String(item.s3Key || "").trim(),
          };
        };

        const files: ReceivedPracticeFile[] = filesRaw
          .map((f, idx) => mapFileRow(f, idx))
          .filter((f) => f.originalName && f.s3Key);
        const resultFiles: ReceivedPracticeFile[] = resultFilesRaw
          .map((f, idx) => mapFileRow(f, idx, ":result"))
          .filter((f) => f.originalName && f.s3Key);

        const parsedMemo = parsePracticeTransferMemoMeta(String(r.transferMemo || ""));
        const requestorDownloadedAt = r.requestorDownloadedAt
          ? String(r.requestorDownloadedAt)
          : null;
        const rawStatus = String(r.status || "").trim().toLowerCase();
        const matchingMode =
          String(r.matchingMode || "").trim() === "auto" ? "auto" : "direct";
        const autoMatchRaw =
          r.autoMatch && typeof r.autoMatch === "object"
            ? (r.autoMatch as Record<string, unknown>)
            : null;
        const autoMatch = autoMatchRaw
          ? {
              claimedAt: autoMatchRaw.claimedAt
                ? String(autoMatchRaw.claimedAt)
                : null,
              deadlineAt: autoMatchRaw.deadlineAt
                ? String(autoMatchRaw.deadlineAt)
                : null,
              claimHours:
                autoMatchRaw.claimHours != null
                  ? Number(autoMatchRaw.claimHours)
                  : null,
              completedAt: autoMatchRaw.completedAt
                ? String(autoMatchRaw.completedAt)
                : null,
              openPool: Boolean(autoMatchRaw.openPool),
              claimActive: Boolean(autoMatchRaw.claimActive),
              completed: Boolean(autoMatchRaw.completed),
              mine: Boolean(autoMatchRaw.mine),
              remainingMs:
                autoMatchRaw.remainingMs != null
                  ? Number(autoMatchRaw.remainingMs)
                  : null,
              releaseCount: Number(autoMatchRaw.releaseCount || 0),
            }
          : null;
        const productionRaw =
          r.production && typeof r.production === "object"
            ? (r.production as Record<string, unknown>)
            : null;
        const production = productionRaw
          ? {
              shippingMode:
                productionRaw.shippingMode === "express"
                  ? ("express" as const)
                  : productionRaw.shippingMode === "normal"
                    ? ("normal" as const)
                    : null,
              skipDesignConfirm: productionRaw.skipDesignConfirm !== false,
              designReadyAt: productionRaw.designReadyAt
                ? String(productionRaw.designReadyAt)
                : null,
              designFileCount: Number(productionRaw.designFileCount || 0),
              designFiles: Array.isArray(productionRaw.designFiles)
                ? (productionRaw.designFiles as unknown[])
                    .map((row, idx) => {
                      if (!row || typeof row !== "object") return null;
                      const f = row as Record<string, unknown>;
                      const s3Key = String(f.s3Key || "").trim();
                      if (!s3Key) return null;
                      return {
                        id: String(f.id || `design-${idx + 1}`),
                        patientName: String(f.patientName || "").trim(),
                        tooth: String(f.tooth || "").trim(),
                        originalName: String(f.originalName || "").trim(),
                        mimetype: String(f.mimetype || "application/octet-stream").trim(),
                        size: Number(f.size || 0),
                        s3Key,
                      };
                    })
                    .filter(Boolean) as ReceivedPracticeFile[]
                : [],
              labDesignConfirmedAt: productionRaw.labDesignConfirmedAt
                ? String(productionRaw.labDesignConfirmedAt)
                : null,
              practiceDesignConfirmedAt: productionRaw.practiceDesignConfirmedAt
                ? String(productionRaw.practiceDesignConfirmedAt)
                : null,
              abutmentProductionStartedAt: productionRaw.abutmentProductionStartedAt
                ? String(productionRaw.abutmentProductionStartedAt)
                : null,
              confirmedAt: productionRaw.confirmedAt
                ? String(productionRaw.confirmedAt)
                : null,
              relatedRequestIds: Array.isArray(productionRaw.relatedRequestIds)
                ? productionRaw.relatedRequestIds.map((id) => String(id))
                : [],
            }
          : null;
        const toothWorksFromApi = Array.isArray(r.toothWorks) ? r.toothWorks : null;
        const hasCustomAbutment =
          typeof r.hasCustomAbutment === "boolean"
            ? r.hasCustomAbutment
            : toothWorksFromApi
              ? toothWorksFromApi.some((row) =>
                  Boolean(
                    row &&
                      typeof row === "object" &&
                      (row as { customAbutment?: boolean }).customAbutment,
                  ),
                )
              : parseToothWorks(parsedMemo.toothWorksSummary).some((row) =>
                  Boolean(row.customAbutment),
                );

        return {
          _id: String(r._id || "").trim(),
          transferId: String(r.transferId || "").trim(),
          targetLabName: String(r.targetLabName || "").trim(),
          transferMemo: parsedMemo.memo,
          rawTransferMemo: String(r.transferMemo || "").trim(),
          orderDate: String(r.orderDate || parsedMemo.orderDate || "").trim(),
          arrivalDate: String(r.arrivalDate || parsedMemo.arrivalDate || "").trim(),
          prosthesisTypes: parsedMemo.prosthesisTypes,
          toothWorksSummary: parsedMemo.toothWorksSummary,
          status: String(r.status || "active").trim(),
          manufacturerStage: String(r.manufacturerStage || "").trim() || undefined,
          createdAt: String(r.createdAt || "").trim(),
          updatedAt: String(r.updatedAt || "").trim(),
          isRead: Boolean(r.isRead),
          requestorReadAt: r.requestorReadAt ? String(r.requestorReadAt) : null,
          isDownloaded:
            Boolean(r.isDownloaded) ||
            Boolean(r.isAccepted) ||
            Boolean(requestorDownloadedAt) ||
            rawStatus === "downloaded" ||
            rawStatus === "accepted" ||
            rawStatus === "다운로드완료" ||
            rawStatus === "의뢰수락",
          isAccepted:
            Boolean(r.isAccepted) ||
            Boolean(r.isDownloaded) ||
            Boolean(requestorDownloadedAt) ||
            rawStatus === "downloaded" ||
            rawStatus === "accepted" ||
            rawStatus === "다운로드완료" ||
            rawStatus === "의뢰수락",
          requestorDownloadedAt,
          requestorAcceptedAt: requestorDownloadedAt,
          workCanceledAt: r.workCanceledAt ? String(r.workCanceledAt) : null,
          matchingMode,
          autoMatch,
          hasCustomAbutment,
          production,
          practice: {
            businessName: String(practiceRaw.businessName || "").trim(),
            userName: String(practiceRaw.userName || "").trim(),
          },
          practiceBusinessAnchorId: String(
            r.practiceBusinessAnchorId || "",
          ).trim() || null,
          labFeeMultiplier: normalizeLabFeeMultiplier(
            r.labFeeMultiplier ??
              (r.feeQuote &&
              typeof r.feeQuote === "object"
                ? (r.feeQuote as { labFeeMultiplier?: unknown }).labFeeMultiplier
                : 1),
          ),
          fileCount: Number(r.fileCount || files.length || 0),
          files,
          resultFileCount: Number(r.resultFileCount || resultFiles.length || 0),
          resultFiles,
          feeQuote: parsePracticeTransferFeeQuote(r.feeQuote),
          isRemake: Boolean(
            r.isRemake ||
              (r.remake &&
                typeof r.remake === "object" &&
                (String(
                  (r.remake as { sourceTransferId?: unknown }).sourceTransferId || "",
                ).trim() ||
                  String(
                    (r.remake as { sourceTransferMongoId?: unknown }).sourceTransferMongoId ||
                      "",
                  ).trim())) ||
              (r.feeQuote &&
                typeof r.feeQuote === "object" &&
                (r.feeQuote as { isRemake?: boolean }).isRemake),
          ),
          remakeSourceTransferId: String(
            (r.remake && typeof r.remake === "object"
              ? (r.remake as { sourceTransferId?: unknown }).sourceTransferId
              : r.remakeSourceTransferId) || "",
          ).trim(),
        };
      })
      .filter((x) => x.transferId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return mapped;
  }, []);

  const fetchTransferPage = useCallback(
    async (nextPage: number, append: boolean, options?: { silent?: boolean }) => {
      if (!token) return;
      const silent = options?.silent === true;

      if (append) setLoadingMore(true);
      else if (!silent) setLoading(true);
      if (!append && !silent) setError("");

      try {
        const res = await apiFetch<unknown>({
          path: `/api/practice/transfers/received?page=${nextPage}&limit=${PAGE_SIZE}`,
          method: "GET",
          token,
        });

        if (!res.ok) {
          const body =
            res.data && typeof res.data === "object"
              ? (res.data as Record<string, unknown>)
              : {};
          if (!append && !silent) {
            setTransfers([]);
            setError(String(body.message || "치과 전송 내역 조회에 실패했습니다."));
            setHasMore(false);
            setPage(1);
          }
          return;
        }

        const parsed = parseTransfersBody(res.data);
        const mapped = mapTransferRows(parsed.transfers);

        setTransfers((prev) => {
          if (!append) return mapped;
          const merged = [...prev];
          const existingIds = new Set(prev.map((x) => x._id || x.transferId));
          for (const row of mapped) {
            const key = row._id || row.transferId;
            if (!existingIds.has(key)) {
              merged.push(row);
              existingIds.add(key);
            }
          }
          return merged;
        });

        setPage(nextPage);

        const paginationHasMore = parsed.pagination?.hasMore;
        if (typeof paginationHasMore === "boolean") {
          setHasMore(paginationHasMore);
        } else {
          setHasMore(mapped.length === PAGE_SIZE);
        }

        emitUnreadBadgeRefresh(parsed.unreadCount);
      } catch {
        if (!append && !silent) {
          setTransfers([]);
          setError("치과 전송 내역 조회 중 오류가 발생했습니다.");
          setHasMore(false);
          setPage(1);
        }
      } finally {
        if (append) setLoadingMore(false);
        else if (!silent) setLoading(false);
      }
    },
    [emitUnreadBadgeRefresh, mapTransferRows, parseTransfersBody, token],
  );

  const loadFirstPage = useCallback(
    async (options?: { silent?: boolean }) => {
      setHasMore(false);
      setPage(1);
      await fetchTransferPage(1, false, options);
    },
    [fetchTransferPage],
  );

  useEffect(() => {
    if (!token) {
      setTransfers([]);
      setError("로그인이 필요합니다.");
      setHasMore(false);
      return;
    }
    void loadFirstPage();
  }, [loadFirstPage, token]);

  useAppEventListener({
    enabled: Boolean(token),
    eventTypes: ["practice:transfer-created", "practice:transfer-updated"],
    onMatch: (evt) => {
      const type = String(evt?.type || "").trim();
      const payload =
        evt?.data && typeof evt.data === "object"
          ? (evt.data as Record<string, unknown>)
          : {};

      const transferId = String(payload.transferId || "").trim();
      const action = String(payload.action || "").trim().toLowerCase();
      const hasUnreadCount =
        payload.unreadCount != null &&
        Number.isFinite(Number(payload.unreadCount)) &&
        Number(payload.unreadCount) >= 0;
      const unreadCount = hasUnreadCount ? Number(payload.unreadCount) : undefined;
      const status = String(payload.status || "").trim();
      const statusLower = status.toLowerCase();
      const isRemovedEvent =
        action === "canceled" ||
        action === "cancelled" ||
        action === "deleted" ||
        action === "removed" ||
        action === "purged" ||
        statusLower === "canceled" ||
        statusLower === "cancelled" ||
        statusLower === "deleted" ||
        statusLower === "removed" ||
        status === "취소";
      const requestorReadAt = payload.requestorReadAt
        ? String(payload.requestorReadAt)
        : null;
      const requestorDownloadedAt = payload.requestorDownloadedAt
        ? String(payload.requestorDownloadedAt)
        : null;

      if (type === "practice:transfer-updated" && transferId) {
        if (
          action === "auto-match-released" ||
          action === "auto-match-claimed" ||
          action === "completed"
        ) {
          void loadFirstPage({ silent: true });
          if (hasUnreadCount) {
            emitUnreadBadgeRefresh(unreadCount);
          }
          return;
        }
        if (isRemovedEvent) {
          setTransfers((prev) => prev.filter((row) => row.transferId !== transferId));
          setSelectedTransfer((prev) => {
            if (!prev || prev.transferId !== transferId) return prev;
            return null;
          });
          setDialogOpen(false);
        } else {
          setTransfers((prev) =>
            prev.map((row) => {
              if (row.transferId !== transferId) return row;
              return {
                ...row,
                status: status || row.status,
                isRead:
                  action === "read" || action === "downloaded" || action === "accepted"
                    ? true
                    : row.isRead,
                requestorReadAt:
                  action === "read" || action === "downloaded" || action === "accepted"
                    ? requestorReadAt || row.requestorReadAt
                    : row.requestorReadAt,
                isDownloaded:
                  action === "downloaded" || action === "accepted"
                    ? true
                    : row.isDownloaded,
                isAccepted:
                  action === "downloaded" || action === "accepted"
                    ? true
                    : row.isAccepted,
                requestorDownloadedAt:
                  action === "downloaded" || action === "accepted"
                    ? requestorDownloadedAt || row.requestorDownloadedAt
                    : row.requestorDownloadedAt,
                requestorAcceptedAt:
                  action === "downloaded" || action === "accepted"
                    ? requestorDownloadedAt || row.requestorAcceptedAt
                    : row.requestorAcceptedAt,
              };
            }),
          );

          setSelectedTransfer((prev) => {
            if (!prev || prev.transferId !== transferId) return prev;
            return {
              ...prev,
              status: status || prev.status,
              isRead: action === "read" || action === "downloaded" || action === "accepted" ? true : prev.isRead,
              requestorReadAt:
                action === "read" || action === "downloaded" || action === "accepted"
                  ? requestorReadAt || prev.requestorReadAt
                  : prev.requestorReadAt,
              isDownloaded:
                action === "downloaded" || action === "accepted" ? true : prev.isDownloaded,
              isAccepted:
                action === "downloaded" || action === "accepted" ? true : prev.isAccepted,
              requestorDownloadedAt:
                action === "downloaded" || action === "accepted"
                  ? requestorDownloadedAt || prev.requestorDownloadedAt
                  : prev.requestorDownloadedAt,
              requestorAcceptedAt:
                action === "downloaded" || action === "accepted"
                  ? requestorDownloadedAt || prev.requestorAcceptedAt
                  : prev.requestorAcceptedAt,
            };
          });
        }
      }

      // unreadCount 없는 fan-out(null/omit)을 0으로 강제하면 사이드바 배지가 잠깐 사라진다.
      if (hasUnreadCount) {
        emitUnreadBadgeRefresh(unreadCount);
      }

      const shouldReload =
        type === "practice:transfer-created" ||
        isRemovedEvent ||
        !transferId;

      if (shouldReload) {
        if (realtimeReloadTimerRef.current) {
          window.clearTimeout(realtimeReloadTimerRef.current);
        }
        realtimeReloadTimerRef.current = window.setTimeout(() => {
          void loadFirstPage({ silent: true });
        }, 140);
      }
    },
  });

  useEffect(() => {
    return () => {
      if (realtimeReloadTimerRef.current) {
        window.clearTimeout(realtimeReloadTimerRef.current);
        realtimeReloadTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!dialogOpen) return;
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [dialogOpen, messages]);

  useEffect(() => {
    if (!hasMore || loading || loadingMore) return;
    const target = loadMoreRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) return;
        void fetchTransferPage(page + 1, true);
      },
      { rootMargin: "200px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchTransferPage, hasMore, loading, loadingMore, page]);

  const baseFilteredTransfers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const now = new Date();

    const periodFiltered = transfers.filter((t) => {
      const rawStatus = String(t.status || "").trim().toLowerCase();
      if (["canceled", "cancelled", "deleted", "removed", "취소"].includes(rawStatus)) {
        return false;
      }

      const ts = new Date(t.createdAt).getTime();
      if (!Number.isFinite(ts) || ts <= 0) return true;
      const created = new Date(ts);
      const diffDays = (now.getTime() - ts) / (24 * 60 * 60 * 1000);

      if (period === "30d") return diffDays <= 30;
      if (period === "90d") return diffDays <= 90;

      const y = now.getFullYear();
      const m = now.getMonth();
      const startThisMonth = new Date(y, m, 1, 0, 0, 0, 0);
      const startNextMonth = new Date(y, m + 1, 1, 0, 0, 0, 0);
      const startLastMonth = new Date(y, m - 1, 1, 0, 0, 0, 0);

      if (period === "thisMonth") {
        return created >= startThisMonth && created < startNextMonth;
      }

      return created >= startLastMonth && created < startThisMonth;
    });

    if (!query) return periodFiltered;

    return periodFiltered.filter((t) => {
      const fileText = t.files
        .map((f) => `${f.originalName} ${f.patientName} ${f.tooth}`)
        .join(" ")
        .toLowerCase();
      const statusLabel = getTransferDisplayStatus(t);
      const blob = [
        t.transferId,
        t.practice.businessName,
        t.practice.userName,
        t.transferMemo,
        t.orderDate,
        t.arrivalDate,
        t.prosthesisTypes.join(" "),
        t.toothWorksSummary,
        statusLabel,
        fileText,
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(query);
    });
  }, [period, search, transfers]);

  const statusCounts = useMemo(() => {
    const counts = baseFilteredTransfers.reduce(
      (acc, transfer) => {
        const status = getTransferDisplayStatus(transfer);
        if (status === "작업완료") acc.completed += 1;
        else if (status === "생산진행") acc.shipping += 1;
        else if (status === "의뢰수락") acc.accepted += 1;
        else if (status === "취소") acc.canceled += 1;
        else if (
          status === "발송완료" ||
          status === "수신완료" ||
          status === "자동매칭"
        ) {
          acc.sent += 1;
        }
        if (transfer.isRemake) acc.remake += 1;
        return acc;
      },
      { sent: 0, accepted: 0, completed: 0, canceled: 0, shipping: 0, remake: 0 },
    );
    return counts;
  }, [baseFilteredTransfers]);

  const filteredTransfers = useMemo(() => {
    if (statusFilter === "all") return baseFilteredTransfers;
    return baseFilteredTransfers.filter((transfer) => {
      const status = getTransferDisplayStatus(transfer);
      if (statusFilter === "발송완료") {
        return (
          status === "발송완료" ||
          status === "수신완료" ||
          status === "자동매칭"
        );
      }
      if (statusFilter === "포장.발송") {
        return status === "생산진행";
      }
      if (statusFilter === "리메이크") {
        return Boolean(transfer.isRemake);
      }
      return status === statusFilter;
    });
  }, [baseFilteredTransfers, statusFilter]);

  const sortedFilteredTransfers = useMemo(() => {
    const latestChatTsByTransferId = new Map<string, number>();
    for (const room of rooms) {
      const transferId = String(room.relatedPracticeTransferId?.transferId || "").trim();
      if (!transferId) continue;
      const lastTs = new Date(String(room.lastMessageAt || "")).getTime();
      if (Number.isFinite(lastTs) && lastTs > 0) {
        latestChatTsByTransferId.set(transferId, lastTs);
      }
    }

    return [...filteredTransfers].sort((a, b) => {
      const aChatTs = Number(latestChatTsByTransferId.get(a.transferId) || 0);
      const bChatTs = Number(latestChatTsByTransferId.get(b.transferId) || 0);
      const aCreatedTs = new Date(a.createdAt).getTime();
      const bCreatedTs = new Date(b.createdAt).getTime();
      const aSortTs = aChatTs > 0 ? aChatTs : Number(aCreatedTs || 0);
      const bSortTs = bChatTs > 0 ? bChatTs : Number(bCreatedTs || 0);
      return bSortTs - aSortTs;
    });
  }, [filteredTransfers, rooms]);

  const selectedTransferDisplayMemo = useMemo(
    () =>
      String(
        parsePracticeTransferMemoMetaShared(String(selectedTransfer?.rawTransferMemo || "")).memo ||
          "",
      ).trim(),
    [selectedTransfer?.rawTransferMemo],
  );

  const selectedTransferPatientName = useMemo(() => {
    const fromMemo = String(
      parsePracticeTransferMemoMetaShared(String(selectedTransfer?.rawTransferMemo || ""))
        .patientName || "",
    ).trim();
    if (fromMemo) return fromMemo;
    const fromFiles = (selectedTransfer?.files || [])
      .map((file) => String(file.patientName || "").trim())
      .find(Boolean);
    return fromFiles || "";
  }, [selectedTransfer?.files, selectedTransfer?.rawTransferMemo]);

  const selectedTransferWorkPeriodSummary = useMemo(
    () =>
      buildPracticeWorkPeriodSummaryItem(
        selectedTransfer?.orderDate,
        selectedTransfer?.arrivalDate,
      ),
    [selectedTransfer?.arrivalDate, selectedTransfer?.orderDate],
  );

  const selectedTransferToothWorks = useMemo(
    () =>
      parsePracticeTransferMemoMetaShared(String(selectedTransfer?.rawTransferMemo || ""))
        .toothWorks,
    [selectedTransfer?.rawTransferMemo],
  );
  const markTransferRead = useCallback(
    async (transfer: ReceivedPracticeTransfer) => {
      if (!token || transfer.isRead) return;
      // 자동매칭 공개 풀은 서버가 requestorReadAt을 세팅하지 않음(특정 기공소 read로 잠금 금지).
      // 로컬 isRead/배지를 내리면 새로고침 때 다시 뜨는 불일치가 난다.
      const isOpenPool =
        transfer.matchingMode === "auto" && Boolean(transfer.autoMatch?.openPool);
      if (isOpenPool) return;

      try {
        const res = await apiFetch<unknown>({
          path: `/api/practice/transfers/${encodeURIComponent(transfer.transferId)}/mark-read`,
          method: "POST",
          token,
        });

        if (!res.ok) return;

        const body = res.data && typeof res.data === "object" ? (res.data as Record<string, unknown>) : {};
        const data =
          body.data && typeof body.data === "object"
            ? (body.data as Record<string, unknown>)
            : body;
        // 서버가 읽음 미적용(공개 풀 no-op 등)이면 로컬/배지를 갱신하지 않는다.
        if (!data.requestorReadAt) return;
        const readAt = String(data.requestorReadAt);
        const hasUnreadCount =
          data.unreadCount != null &&
          Number.isFinite(Number(data.unreadCount)) &&
          Number(data.unreadCount) >= 0;
        const unreadCount = hasUnreadCount ? Number(data.unreadCount) : undefined;

        setTransfers((prev) =>
          prev.map((row) =>
            row._id === transfer._id || row.transferId === transfer.transferId
              ? { ...row, isRead: true, requestorReadAt: readAt }
              : row,
          ),
        );
        setSelectedTransfer((prev) =>
          prev && (prev._id === transfer._id || prev.transferId === transfer.transferId)
            ? { ...prev, isRead: true, requestorReadAt: readAt }
            : prev,
        );

        if (hasUnreadCount) {
          emitUnreadBadgeRefresh(unreadCount);
        }
      } catch {
        // ignore
      }
    },
    [emitUnreadBadgeRefresh, token],
  );

  const applyAcceptedLocalPatch = useCallback(
    (
      transfer: ReceivedPracticeTransfer,
      patch: Partial<ReceivedPracticeTransfer>,
    ) => {
      setTransfers((prev) =>
        prev.map((row) =>
          row._id === transfer._id || row.transferId === transfer.transferId
            ? { ...row, ...patch }
            : row,
        ),
      );
      setSelectedTransfer((prev) =>
        prev &&
        (prev._id === transfer._id || prev.transferId === transfer.transferId)
          ? { ...prev, ...patch }
          : prev,
      );
    },
    [],
  );

  /** 수락/취소 버튼 UI 전환 최소 딜레이(처리는 병렬로 즉시 진행) */
  const ACTION_UI_MIN_MS = 1000;

  const markTransferAccepted = useCallback(
    async (transfer: ReceivedPracticeTransfer) => {
      if (!token) return false;
      const isOpenPool =
        transfer.matchingMode === "auto" && Boolean(transfer.autoMatch?.openPool);
      if (
        !isOpenPool &&
        (transfer.isAccepted || transfer.isDownloaded || transfer.requestorDownloadedAt)
      ) {
        return true;
      }

      try {
        const [res] = await Promise.all([
          apiFetch<unknown>({
            path: `/api/practice/transfers/${encodeURIComponent(transfer.transferId)}/mark-accepted`,
            method: "POST",
            token,
          }),
          new Promise<void>((resolve) => {
            window.setTimeout(resolve, ACTION_UI_MIN_MS);
          }),
        ]);

        if (!res.ok) {
          const body =
            res.data && typeof res.data === "object"
              ? (res.data as Record<string, unknown>)
              : {};
          toast({
            title: "의뢰수락 실패",
            description: String(body.message || "의뢰수락 중 오류가 발생했습니다."),
            variant: "destructive",
          });
          if (String(body.message || "").includes("다른 기공소")) {
            void loadFirstPage({ silent: true });
          }
          return false;
        }

        const body = res.data && typeof res.data === "object" ? (res.data as Record<string, unknown>) : {};
        const data =
          body.data && typeof body.data === "object"
            ? (body.data as Record<string, unknown>)
            : body;
        const readAt = data.requestorReadAt
          ? String(data.requestorReadAt)
          : transfer.requestorReadAt || new Date().toISOString();
        const acceptedAt = data.requestorAcceptedAt
          ? String(data.requestorAcceptedAt)
          : data.requestorDownloadedAt
            ? String(data.requestorDownloadedAt)
            : transfer.requestorDownloadedAt || new Date().toISOString();
        const unreadCount = Number(data.unreadCount || 0);
        const autoMatchRaw =
          data.autoMatch && typeof data.autoMatch === "object"
            ? (data.autoMatch as Record<string, unknown>)
            : null;
        const autoMatchPatch = autoMatchRaw
          ? {
              claimedAt: autoMatchRaw.claimedAt
                ? String(autoMatchRaw.claimedAt)
                : null,
              deadlineAt: autoMatchRaw.deadlineAt
                ? String(autoMatchRaw.deadlineAt)
                : null,
              claimHours:
                autoMatchRaw.claimHours != null
                  ? Number(autoMatchRaw.claimHours)
                  : null,
              completedAt: autoMatchRaw.completedAt
                ? String(autoMatchRaw.completedAt)
                : null,
              openPool: Boolean(autoMatchRaw.openPool),
              claimActive: Boolean(autoMatchRaw.claimActive),
              completed: Boolean(autoMatchRaw.completed),
              mine: Boolean(autoMatchRaw.mine),
              remainingMs:
                autoMatchRaw.remainingMs != null
                  ? Number(autoMatchRaw.remainingMs)
                  : null,
              releaseCount: Number(autoMatchRaw.releaseCount || 0),
            }
          : {
              openPool: false,
              claimActive: true,
              completed: false,
              mine: true,
              remainingMs: null,
            };

        const patch = {
          isRead: true,
          requestorReadAt: readAt,
          isDownloaded: true,
          isAccepted: true,
          requestorDownloadedAt: acceptedAt,
          requestorAcceptedAt: acceptedAt,
          workCanceledAt: null,
          manufacturerStage: "의뢰수락",
          matchingMode:
            String(data.matchingMode || transfer.matchingMode || "direct") ===
            "auto"
              ? ("auto" as const)
              : ("direct" as const),
          autoMatch: autoMatchPatch,
          targetLabName: data.targetLabName
            ? String(data.targetLabName)
            : transfer.targetLabName,
        };

        applyAcceptedLocalPatch(transfer, patch);

        emitUnreadBadgeRefresh(unreadCount);
        toast({
          title: "의뢰수락 완료",
          description:
            transfer.matchingMode === "auto"
              ? "선착순 수락되었습니다."
              : "기공의뢰를 수락했습니다.",
        });
        return true;
      } catch {
        toast({
          title: "의뢰수락 실패",
          description: "의뢰수락 요청 중 오류가 발생했습니다.",
          variant: "destructive",
        });
        return false;
      }
    },
    [ACTION_UI_MIN_MS, applyAcceptedLocalPatch, emitUnreadBadgeRefresh, loadFirstPage, toast, token],
  );

  const markTransferComplete = useCallback(
    async (
      transfer: ReceivedPracticeTransfer,
      options: {
        files: File[];
      },
    ) => {
      if (!token) return false;
      if (transfer.autoMatch?.completed) return true;

      const files = Array.isArray(options.files) ? options.files : [];
      if (files.length === 0) {
        toast({
          title: "결과 파일 필요",
          description: "작업 완료하려면 크라운 결과 파일을 선택해주세요.",
          variant: "destructive",
        });
        return false;
      }

      try {
        const uploadedFiles: TempUploadedFile[] = await uploadFilesWithToast(files);
        const resultFiles = uploadedFiles
          .map((f) => ({
            patientName: "",
            tooth: "",
            file: {
              originalName: String(f.originalName || "").trim(),
              mimetype: String(f.mimetype || f.fileType || "application/octet-stream").trim(),
              size: Number(f.size || 0),
              s3Key: String(f.key || "").trim(),
            },
          }))
          .filter((row) => row.file.originalName && row.file.s3Key);

        if (resultFiles.length === 0) {
          toast({
            title: "업로드 실패",
            description: "결과 파일 업로드에 실패했습니다.",
            variant: "destructive",
          });
          return false;
        }

        const res = await apiFetch<unknown>({
          path: `/api/practice/transfers/${encodeURIComponent(transfer.transferId)}/mark-complete`,
          method: "POST",
          token,
          body: {
            resultFiles,
          },
        });
        if (!res.ok) {
          const body =
            res.data && typeof res.data === "object"
              ? (res.data as Record<string, unknown>)
              : {};
          toast({
            title: "작업 완료 실패",
            description: String(body.message || "작업 완료 처리 중 오류가 발생했습니다."),
            variant: "destructive",
          });
          return false;
        }

        const body =
          res.data && typeof res.data === "object"
            ? (res.data as Record<string, unknown>)
            : {};
        const data =
          body.data && typeof body.data === "object"
            ? (body.data as Record<string, unknown>)
            : body;
        const autoMatchRaw =
          data.autoMatch && typeof data.autoMatch === "object"
            ? (data.autoMatch as Record<string, unknown>)
            : null;
        const autoMatchPatch = {
          ...(transfer.autoMatch || {}),
          completedAt: autoMatchRaw?.completedAt
            ? String(autoMatchRaw.completedAt)
            : new Date().toISOString(),
          openPool: false,
          claimActive: false,
          completed: true,
          mine: true,
          remainingMs: null,
        };
        const mappedResultFiles: ReceivedPracticeFile[] = (
          Array.isArray(data.resultFiles) ? data.resultFiles : resultFiles
        )
          .map((row, idx) => {
            const item = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
            const fileObj =
              item.file && typeof item.file === "object"
                ? (item.file as Record<string, unknown>)
                : item;
            return {
              id: String(item.id || `${transfer._id}:result:${idx + 1}`),
              patientName: String(item.patientName || "").trim(),
              tooth: String(item.tooth || "").trim(),
              originalName: String(
                fileObj.originalName || item.originalName || "",
              ).trim(),
              mimetype: String(
                fileObj.mimetype || item.mimetype || "application/octet-stream",
              ).trim(),
              size: Number(fileObj.size || item.size || 0),
              s3Key: String(fileObj.s3Key || item.s3Key || "").trim(),
            };
          })
          .filter((f) => f.originalName && f.s3Key);
        const productionRawFromRes =
          data.production && typeof data.production === "object"
            ? (data.production as Record<string, unknown>)
            : null;
        const autoConfirmedAt = productionRawFromRes?.confirmedAt
          ? String(productionRawFromRes.confirmedAt)
          : null;
        const manufacturerStage =
          String(data.manufacturerStage || "").trim() === "생산진행" || autoConfirmedAt
            ? "생산진행"
            : "작업완료";
        const productionPatch = {
          shippingMode:
            productionRawFromRes?.shippingMode === "express"
              ? ("express" as const)
              : productionRawFromRes?.shippingMode === "normal"
                ? ("normal" as const)
                : transfer.production?.shippingMode || null,
          skipDesignConfirm:
            productionRawFromRes?.skipDesignConfirm !== false &&
            transfer.production?.skipDesignConfirm !== false,
          designReadyAt: productionRawFromRes?.designReadyAt
            ? String(productionRawFromRes.designReadyAt)
            : transfer.production?.designReadyAt || null,
          designFileCount: Number(
            productionRawFromRes?.designFileCount ??
              transfer.production?.designFileCount ??
              0,
          ),
          designFiles: Array.isArray(productionRawFromRes?.designFiles)
            ? (transfer.production?.designFiles || [])
            : transfer.production?.designFiles || [],
          labDesignConfirmedAt: productionRawFromRes?.labDesignConfirmedAt
            ? String(productionRawFromRes.labDesignConfirmedAt)
            : transfer.production?.labDesignConfirmedAt || null,
          practiceDesignConfirmedAt: productionRawFromRes?.practiceDesignConfirmedAt
            ? String(productionRawFromRes.practiceDesignConfirmedAt)
            : transfer.production?.practiceDesignConfirmedAt || null,
          abutmentProductionStartedAt: productionRawFromRes?.abutmentProductionStartedAt
            ? String(productionRawFromRes.abutmentProductionStartedAt)
            : transfer.production?.abutmentProductionStartedAt || null,
          confirmedAt: autoConfirmedAt,
          relatedRequestIds: Array.isArray(productionRawFromRes?.relatedRequestIds)
            ? productionRawFromRes.relatedRequestIds.map((id) => String(id))
            : transfer.production?.relatedRequestIds || [],
        };

        setTransfers((prev) =>
          prev.map((row) =>
            row._id === transfer._id || row.transferId === transfer.transferId
              ? {
                  ...row,
                  autoMatch: autoMatchPatch,
                  manufacturerStage,
                  resultFiles: mappedResultFiles,
                  resultFileCount: mappedResultFiles.length,
                  production: productionPatch,
                }
              : row,
          ),
        );
        setSelectedTransfer((prev) =>
          prev &&
          (prev._id === transfer._id || prev.transferId === transfer.transferId)
            ? {
                ...prev,
                autoMatch: autoMatchPatch,
                manufacturerStage,
                resultFiles: mappedResultFiles,
                resultFileCount: mappedResultFiles.length,
                production: productionPatch,
              }
            : prev,
        );

        toast({
          title: "작업 완료",
          description: autoConfirmedAt
            ? "크라운 결과 파일을 올렸습니다. 생산이 자동 진행되었습니다."
            : "크라운 결과 파일을 올렸습니다. 치과에서 생산 진행을 컨펌하면 됩니다.",
        });
        return true;
      } catch {
        toast({
          title: "작업 완료 실패",
          description: "작업 완료 요청 중 오류가 발생했습니다.",
          variant: "destructive",
        });
        return false;
      }
    },
    [toast, token, uploadFilesWithToast],
  );

  const beginCompleteWithFiles = useCallback(
    (transfer: ReceivedPracticeTransfer, files: File[]) => {
      const nextFiles = Array.from(files || []).filter(Boolean);
      if (!nextFiles.length) return;
      const id = String(transfer.transferId || transfer._id || "").trim();
      if (!id || cardActionBusyId) return;
      setCardActionBusyId(id);
      void (async () => {
        try {
          await markTransferComplete(transfer, { files: nextFiles });
        } finally {
          setCardActionBusyId("");
        }
      })();
    },
    [cardActionBusyId, markTransferComplete],
  );

  const confirmAbutmentDesign = useCallback(
    async (transfer: ReceivedPracticeTransfer) => {
      if (!token) return false;
      const id = String(transfer.transferId || transfer._id || "").trim();
      if (!id || designConfirmBusyId) return false;
      setDesignConfirmBusyId(id);
      try {
        const res = await apiFetch<{
          production?: ReceivedPracticeTransfer["production"];
          abutmentProductionStarted?: boolean;
          awaitingPracticeDesignConfirm?: boolean;
        }>({
          path: `/api/practice/transfers/${encodeURIComponent(transfer.transferId)}/confirm-abutment-design`,
          method: "POST",
          token,
        });
        if (!res.ok) {
          const body =
            res.data && typeof res.data === "object"
              ? (res.data as Record<string, unknown>)
              : {};
          toast({
            title: "디자인 확인 실패",
            description: String(body.message || "어벗 디자인 확인 중 오류가 발생했습니다."),
            variant: "destructive",
          });
          return false;
        }
        const data =
          res.data && typeof res.data === "object"
            ? (res.data as Record<string, unknown>)
            : {};
        const productionRaw =
          data.production && typeof data.production === "object"
            ? (data.production as Record<string, unknown>)
            : null;
        const productionPatch: ReceivedPracticeTransfer["production"] = productionRaw
          ? {
              ...transfer.production,
              skipDesignConfirm: productionRaw.skipDesignConfirm !== false,
              labDesignConfirmedAt: productionRaw.labDesignConfirmedAt
                ? String(productionRaw.labDesignConfirmedAt)
                : new Date().toISOString(),
              practiceDesignConfirmedAt: productionRaw.practiceDesignConfirmedAt
                ? String(productionRaw.practiceDesignConfirmedAt)
                : transfer.production?.practiceDesignConfirmedAt || null,
              abutmentProductionStartedAt: productionRaw.abutmentProductionStartedAt
                ? String(productionRaw.abutmentProductionStartedAt)
                : transfer.production?.abutmentProductionStartedAt || null,
              designReadyAt: productionRaw.designReadyAt
                ? String(productionRaw.designReadyAt)
                : transfer.production?.designReadyAt || null,
              designFileCount: Number(
                productionRaw.designFileCount ?? transfer.production?.designFileCount ?? 0,
              ),
              designFiles: transfer.production?.designFiles || [],
            }
          : {
              ...transfer.production,
              labDesignConfirmedAt: new Date().toISOString(),
            };

        setTransfers((prev) =>
          prev.map((row) =>
            row._id === transfer._id || row.transferId === transfer.transferId
              ? { ...row, production: productionPatch }
              : row,
          ),
        );
        setSelectedTransfer((prev) =>
          prev &&
          (prev._id === transfer._id || prev.transferId === transfer.transferId)
            ? { ...prev, production: productionPatch }
            : prev,
        );

        toast({
          title: "어벗 디자인 확인",
          description: data.abutmentProductionStarted
            ? "디자인을 확인했습니다. 어벗츠 생산이 시작됩니다."
            : data.awaitingPracticeDesignConfirm
              ? "디자인을 확인했습니다. 치과 컨펌 후 생산이 시작됩니다."
              : "디자인을 확인했습니다.",
        });
        return true;
      } catch {
        toast({
          title: "디자인 확인 실패",
          description: "어벗 디자인 확인 요청 중 오류가 발생했습니다.",
          variant: "destructive",
        });
        return false;
      } finally {
        setDesignConfirmBusyId("");
      }
    },
    [designConfirmBusyId, toast, token],
  );

  const markTransferRelease = useCallback(
    async (transfer: ReceivedPracticeTransfer) => {
      if (!token) return false;
      if (transfer.autoMatch?.completed) return false;

      const isAuto = String(transfer.matchingMode || "") === "auto";
      const canceledAt = new Date().toISOString();

      try {
        const [res] = await Promise.all([
          apiFetch<unknown>({
            path: `/api/practice/transfers/${encodeURIComponent(transfer.transferId)}/mark-release`,
            method: "POST",
            token,
          }),
          new Promise<void>((resolve) => {
            window.setTimeout(resolve, ACTION_UI_MIN_MS);
          }),
        ]);
        if (!res.ok) {
          const body =
            res.data && typeof res.data === "object"
              ? (res.data as Record<string, unknown>)
              : {};
          toast({
            title: "작업 취소 실패",
            description: String(body.message || "작업 취소 처리 중 오류가 발생했습니다."),
            variant: "destructive",
          });
          return false;
        }

        const body =
          res.data && typeof res.data === "object"
            ? (res.data as Record<string, unknown>)
            : {};
        const data =
          body.data && typeof body.data === "object"
            ? (body.data as Record<string, unknown>)
            : body;
        const autoMatchRaw =
          data.autoMatch && typeof data.autoMatch === "object"
            ? (data.autoMatch as Record<string, unknown>)
            : null;

        const releasePatch: Partial<ReceivedPracticeTransfer> = isAuto
          ? {
              isAccepted: false,
              isDownloaded: false,
              requestorDownloadedAt: null,
              requestorAcceptedAt: null,
              workCanceledAt: canceledAt,
              manufacturerStage: "작업취소",
              targetLabName: "자동 매칭",
              autoMatch: {
                ...(transfer.autoMatch || {}),
                claimedAt: null,
                deadlineAt: null,
                completedAt: null,
                openPool: true,
                claimActive: false,
                completed: false,
                mine: false,
                remainingMs: null,
                releaseCount:
                  autoMatchRaw?.releaseCount != null
                    ? Number(autoMatchRaw.releaseCount)
                    : Number(transfer.autoMatch?.releaseCount || 0) + 1,
              },
            }
          : {
              isAccepted: false,
              isDownloaded: false,
              requestorDownloadedAt: null,
              requestorAcceptedAt: null,
              workCanceledAt: canceledAt,
              manufacturerStage: "작업취소",
              autoMatch: transfer.autoMatch
                ? {
                    ...transfer.autoMatch,
                    completedAt: null,
                    completed: false,
                    claimActive: false,
                  }
                : transfer.autoMatch,
            };
        applyAcceptedLocalPatch(transfer, releasePatch);

        toast({
          title: "작업 취소",
          description: isAuto
            ? "수락을 취소해 공개 풀로 되돌렸습니다."
            : "의뢰수락을 취소했습니다.",
        });
        return true;
      } catch {
        toast({
          title: "작업 취소 실패",
          description: "작업 취소 요청 중 오류가 발생했습니다.",
          variant: "destructive",
        });
        return false;
      }
    },
    [ACTION_UI_MIN_MS, applyAcceptedLocalPatch, toast, token],
  );

  const resolveTransferChatRoom = useCallback(
    async (transfer: ReceivedPracticeTransfer, resolveSeq: number) => {
      if (!token) return;

      const transferId = String(transfer.transferId || "").trim();
      const cachedRoom = rooms.find(
        (room) => String(room.relatedPracticeTransferId?.transferId || "").trim() === transferId,
      );
      if (cachedRoom?._id) {
        void prefetchMessages(cachedRoom._id);
        if (resolveSeq !== chatRoomResolveSeqRef.current) return;
        setActiveChatRoom(cachedRoom);
        setChatError("");
        return;
      }

      try {
        const res = await apiFetch<unknown>({
          path: `/api/chats/practice/transfer-room/${encodeURIComponent(transfer.transferId)}`,
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
        setChatError("");
      } catch {
        if (resolveSeq !== chatRoomResolveSeqRef.current) return;
        setChatError("치과 채팅방 조회 중 오류가 발생했습니다.");
      }
    },
    [prefetchMessages, rooms, token],
  );

  const handleAcceptTransfer = useCallback(async () => {
    if (!selectedTransfer || acceptBusy || releaseBusy) return;
    setAcceptBusy(true);
    try {
      const ok = await markTransferAccepted(selectedTransfer);
      if (ok && dialogOpen) {
        const resolveSeq = ++chatRoomResolveSeqRef.current;
        setChatError("");
        void resolveTransferChatRoom(selectedTransfer, resolveSeq);
      }
    } finally {
      setAcceptBusy(false);
    }
  }, [
    acceptBusy,
    dialogOpen,
    markTransferAccepted,
    releaseBusy,
    resolveTransferChatRoom,
    selectedTransfer,
  ]);

  const handleReleaseTransfer = useCallback(async () => {
    if (!selectedTransfer || releaseBusy || acceptBusy) return;
    setReleaseBusy(true);
    try {
      await markTransferRelease(selectedTransfer);
    } finally {
      setReleaseBusy(false);
    }
  }, [acceptBusy, markTransferRelease, releaseBusy, selectedTransfer]);

  const handleCardComplete = useCallback(
    (transfer: ReceivedPracticeTransfer, event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const id = String(transfer.transferId || transfer._id || "").trim();
      if (!id || cardActionBusyId) return;
      openPracticeTransferFilePicker(`practice-complete-${id}`);
    },
    [cardActionBusyId],
  );

  const handleCardDropFiles = useCallback(
    (transfer: ReceivedPracticeTransfer, files: File[]) => {
      beginCompleteWithFiles(transfer, files);
    },
    [beginCompleteWithFiles],
  );

  const handleCardRelease = useCallback(
    async (transfer: ReceivedPracticeTransfer, event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const id = String(transfer.transferId || transfer._id || "").trim();
      if (!id || cardActionBusyId) return;
      setCardActionBusyId(id);
      try {
        await markTransferRelease(transfer);
      } finally {
        setCardActionBusyId("");
      }
    },
    [cardActionBusyId, markTransferRelease],
  );

  const openTransferDialog = useCallback(
    async (transfer: ReceivedPracticeTransfer) => {
      if (!token) return;
      const resolveSeq = ++chatRoomResolveSeqRef.current;

      setSelectedTransfer(transfer);
      setDialogOpen(true);
      setChatError("");
      chatUploads.clear();
      setActiveChatRoom(null);
      setChatMessages([]);
      void markTransferRead(transfer);
      await resolveTransferChatRoom(transfer, resolveSeq);
    },
    [markTransferRead, resolveTransferChatRoom, setChatMessages, token],
  );

  const handleDownload = useCallback(
    async (file: ReceivedPracticeFile) => {
      const s3Key = String(file.s3Key || "").trim();
      await downloadS3File({
        s3Key,
        fileName: String(file.originalName || "download").trim() || "download",
        busyKey: s3Key,
      });
    },
    [downloadS3File],
  );

  const handleDownloadAllFiles = useCallback(async () => {
    const files = [
      ...(Array.isArray(selectedTransfer?.files) ? selectedTransfer.files : []),
      ...(Array.isArray(selectedTransfer?.production?.designFiles)
        ? selectedTransfer.production.designFiles
        : []),
      ...(Array.isArray(selectedTransfer?.resultFiles)
        ? selectedTransfer.resultFiles
        : []),
    ];
    await downloadAll(
      files.map((file) => ({
        s3Key: String(file.s3Key || "").trim(),
        fileName: String(file.originalName || "download").trim() || "download",
        busyKey: String(file.s3Key || "").trim(),
      })),
    );
  }, [downloadAll, selectedTransfer]);

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

  const handleAttachChatFiles = useCallback((inputFiles: FileList | null) => {
    const nextFiles = Array.from(inputFiles || []);
    if (!nextFiles.length) return;
    chatUploads.addFiles(nextFiles);
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

  const transferSearchAndBadges = (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <PeriodFilter
          value={period}
          onChange={setPeriod}
          presets={["thisMonth", "lastMonth"]}
          className="shrink-0"
        />
        <div className="relative w-full md:max-w-md md:ml-auto">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            placeholder="전송ID, 치과명, 파일명, 환자명 검색"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-full"
          onClick={() => setStatusFilter((prev) => (prev === "발송완료" ? "all" : "발송완료"))}
          aria-pressed={statusFilter === "발송완료"}
        >
          <Badge
            variant="outline"
            className={cn(
              "cursor-pointer",
              statusFilter === "발송완료"
                ? "border-primary/70 bg-primary-soft text-primary-strong"
                : "hover:bg-muted/40",
            )}
          >
            의뢰 {statusCounts.sent}건
          </Badge>
        </button>

        <button
          type="button"
          className="rounded-full"
          onClick={() =>
            setStatusFilter((prev) => (prev === "의뢰수락" ? "all" : "의뢰수락"))
          }
          aria-pressed={statusFilter === "의뢰수락"}
        >
          <Badge
            variant="outline"
            className={cn(
              "cursor-pointer",
              statusFilter === "의뢰수락"
                ? "border-primary/70 bg-primary-soft text-primary-strong"
                : "hover:bg-muted/40",
            )}
          >
            수락 {statusCounts.accepted}건
          </Badge>
        </button>

        <button
          type="button"
          className="rounded-full"
          onClick={() =>
            setStatusFilter((prev) => (prev === "작업완료" ? "all" : "작업완료"))
          }
          aria-pressed={statusFilter === "작업완료"}
        >
          <Badge
            variant="outline"
            className={cn(
              "cursor-pointer",
              statusFilter === "작업완료"
                ? "border-primary/70 bg-primary-soft text-primary-strong"
                : "hover:bg-muted/40",
            )}
          >
            완료 {statusCounts.completed}건
          </Badge>
        </button>

        <button
          type="button"
          className="rounded-full"
          onClick={() => setStatusFilter((prev) => (prev === "취소" ? "all" : "취소"))}
          aria-pressed={statusFilter === "취소"}
        >
          <Badge
            variant="outline"
            className={cn(
              "cursor-pointer",
              statusFilter === "취소"
                ? "border-primary/70 bg-primary-soft text-primary-strong"
                : "hover:bg-muted/40",
            )}
          >
            취소 {statusCounts.canceled}건
          </Badge>
        </button>

        <button
          type="button"
          className="rounded-full"
          onClick={() => setStatusFilter((prev) => (prev === "포장.발송" ? "all" : "포장.발송"))}
          aria-pressed={statusFilter === "포장.발송"}
        >
          <Badge
            variant="outline"
            className={cn(
              "cursor-pointer",
              statusFilter === "포장.발송"
                ? "border-primary/70 bg-primary-soft text-primary-strong"
                : "hover:bg-muted/40",
            )}
          >
            발송 {statusCounts.shipping}건
          </Badge>
        </button>

        <button
          type="button"
          className="rounded-full"
          onClick={() => setStatusFilter((prev) => (prev === "리메이크" ? "all" : "리메이크"))}
          aria-pressed={statusFilter === "리메이크"}
        >
          <Badge
            variant="outline"
            className={cn(
              "cursor-pointer",
              statusFilter === "리메이크"
                ? PRACTICE_REMAKE_BADGE_CLASS
                : "border-amber-200 bg-amber-50/70 text-amber-800 hover:bg-amber-50",
            )}
          >
            리메이크 {statusCounts.remake}건
          </Badge>
        </button>
      </div>
    </div>
  );

  const transferListBody = (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {error ? <div className="shrink-0 text-sm text-destructive">{error}</div> : null}
      {!error &&
      loading &&
      sortedFilteredTransfers.length === 0 ? (
        <RequestorPracticeTransferCardsSkeleton />
      ) : null}
      {!error && !loading && sortedFilteredTransfers.length === 0 ? (
        <div className="shrink-0 text-sm text-muted-foreground">표시할 의뢰가 없습니다.</div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {sortedFilteredTransfers.map((transfer) => {
            const chatUnreadCount = unreadByTransferId.get(transfer.transferId) || 0;
            const toothWorksPreview = formatToothWorksSummary(
              transfer.toothWorksSummary,
              { labFacing: true },
            );
            const displayStatus = getTransferDisplayStatus(transfer);
            const cardId = String(transfer.transferId || transfer._id || "").trim();
            const cardBusy = Boolean(cardActionBusyId) && cardActionBusyId === cardId;
            const showWorkActions = displayStatus === "의뢰수락";
            const resultCount = Number(transfer.resultFileCount || transfer.resultFiles?.length || 0);
            const completeInputId = `practice-complete-${cardId}`;

            const renderCardBody = () => (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">{transfer.transferId}</span>
                    {chatUnreadCount > 0 ? (
                      <Badge
                        variant="destructive"
                        className="h-5 min-w-5 justify-center px-1 text-[11px] leading-none"
                      >
                        {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(transfer.createdAt)}
                    </span>
                    <Badge
                      variant={
                        displayStatus === "발송완료" ||
                        displayStatus === "자동매칭" ||
                        displayStatus === "취소"
                          ? "destructive"
                          : "secondary"
                      }
                      className={cn(
                        "shrink-0 whitespace-nowrap",
                        displayStatus === "의뢰수락" ||
                          displayStatus === "작업완료" ||
                          displayStatus === "생산진행"
                          ? "bg-primary-soft text-primary-strong hover:bg-primary-soft"
                          : "",
                      )}
                    >
                      {toStatusBadgeLabel(displayStatus)}
                    </Badge>
                    {transfer.isRemake ? (
                      <Badge
                        variant="outline"
                        className={cn("shrink-0 whitespace-nowrap", PRACTICE_REMAKE_BADGE_CLASS)}
                      >
                        리메이크
                      </Badge>
                    ) : null}
                  </div>
                </div>

                <div className="mt-2 text-sm text-muted-foreground">
                  치과:{" "}
                  {transfer.matchingMode === "auto"
                    ? "자동 매칭"
                    : transfer.practice.businessName || "-"}
                  {transfer.matchingMode === "auto"
                    ? ""
                    : transfer.practice.userName
                      ? ` · 담당자 ${transfer.practice.userName}`
                      : ""}
                </div>

                <p className="mt-2 text-xs text-muted-foreground truncate">
                  파일 {transfer.fileCount}개
                  {Number(transfer.production?.designFileCount || transfer.production?.designFiles?.length || 0) >
                  0
                    ? ` · 어벗디자인 ${Number(transfer.production?.designFileCount || transfer.production?.designFiles?.length || 0)}개`
                    : ""}
                  {resultCount > 0 ? ` · 결과 ${resultCount}개` : ""}
                  {transfer.orderDate ? ` · 주문 ${transfer.orderDate}` : ""}
                  {transfer.arrivalDate ? ` · 도착 ${transfer.arrivalDate}` : ""}
                  {transfer.orderDate && transfer.arrivalDate ? (
                    <>
                      {" · "}
                      <PracticeWorkPeriodText
                        orderDate={transfer.orderDate}
                        arrivalDate={transfer.arrivalDate}
                        variant="labeled"
                        className="text-xs"
                      />
                    </>
                  ) : null}
                  {toothWorksPreview
                    ? ` · 치아별 ${toothWorksPreview}`
                    : transfer.prosthesisTypes.length
                      ? ` · 형태 ${transfer.prosthesisTypes.join(", ")}`
                      : ""}
                  {String(transfer.transferMemo || "").trim()
                    ? ` · 메모: ${String(transfer.transferMemo || "").replace(/\s+/g, " ").trim()}`
                    : ""}
                </p>
                {transfer.feeQuote ? (
                  <PracticeTransferFeeEstimate
                    quote={transfer.feeQuote}
                    viewer="lab"
                    density="card"
                  />
                ) : null}

                {showWorkActions &&
                transferHasCustomAbutment(transfer) &&
                Number(transfer.production?.designFileCount || transfer.production?.designFiles?.length || 0) >
                  0 &&
                !transfer.production?.labDesignConfirmedAt ? (
                  <div className="mt-2 rounded-md border border-dashed border-primary/40 bg-primary-soft/40 px-3 py-2 text-xs text-primary-strong">
                    어벗츠 디자인이 도착했습니다. 확인 후 크라운 작업을 진행하세요.
                    {!transfer.production?.abutmentProductionStartedAt
                      ? " 「어벗 디자인 확인」을 누르면 생산이 시작됩니다."
                      : ""}
                  </div>
                ) : null}

                {showWorkActions ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {transferHasCustomAbutment(transfer) &&
                    Number(
                      transfer.production?.designFileCount ||
                        transfer.production?.designFiles?.length ||
                        0,
                    ) > 0 &&
                    !transfer.production?.labDesignConfirmedAt ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={
                          Boolean(designConfirmBusyId) && designConfirmBusyId === cardId
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          void confirmAbutmentDesign(transfer);
                        }}
                      >
                        {designConfirmBusyId === cardId
                          ? "확인 중..."
                          : "어벗 디자인 확인"}
                      </Button>
                    ) : null}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          size="sm"
                          disabled={cardBusy}
                          className="focus-visible:ring-0 focus-visible:ring-offset-0"
                          onClick={(event) => handleCardComplete(transfer, event)}
                        >
                          <UploadCloud className="h-4 w-4" />
                          {cardBusy ? "처리 중..." : "작업완료"}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">
                        크라운 결과 파일을 올려 작업완료합니다.
                        {PRACTICE_ACCEPTED_HINT ? ` ${PRACTICE_ACCEPTED_HINT}` : ""}
                      </TooltipContent>
                    </Tooltip>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={cardBusy}
                      onClick={(event) => void handleCardRelease(transfer, event)}
                    >
                      작업취소
                    </Button>
                  </div>
                ) : null}
              </>
            );

            const openCardDialog = () => {
              void openTransferDialog(transfer);
            };

            const onCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openCardDialog();
              }
            };

            if (showWorkActions) {
              return (
                <PracticeTransferFileDropTarget
                  key={transfer._id || transfer.transferId}
                  fileInputId={completeInputId}
                  disabled={cardBusy}
                  acceptedHint={PRACTICE_ACCEPTED_HINT}
                  showDefaultUi={false}
                  className={cn(
                    "w-full cursor-pointer rounded-lg border-2 border-dashed border-slate-300 p-4 text-left transition",
                    "hover:bg-muted/20",
                  )}
                  activeClassName="border-primary bg-primary-soft/40"
                  onFiles={(files) => handleCardDropFiles(transfer, files)}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={openCardDialog}
                    onKeyDown={onCardKeyDown}
                    className="focus-visible:outline-none"
                    data-transfer-card="true"
                  >
                    {renderCardBody()}
                  </div>
                </PracticeTransferFileDropTarget>
              );
            }

            return (
              <div
                key={transfer._id || transfer.transferId}
                role="button"
                tabIndex={0}
                onClick={openCardDialog}
                onKeyDown={onCardKeyDown}
                className="w-full cursor-pointer rounded-lg border p-4 text-left transition hover:border-primary/40 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-transfer-card="true"
              >
                {renderCardBody()}
              </div>
            );
          })}
        </div>

        {!error && hasMore ? (
          <div ref={loadMoreRef} className="py-4 text-center text-xs text-muted-foreground">
            {loadingMore ? "더 불러오는 중..." : "아래로 스크롤하면 더 불러옵니다."}
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-4">
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="shrink-0">
          <LabDashboardTopBanners />
        </div>
        {showDesignQueue && !showTransfers ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            <div className="flex flex-wrap items-center justify-end gap-3">
              <PeriodFilter
                value={period}
                onChange={setPeriod}
                presets={["thisMonth", "lastMonth"]}
                className="shrink-0"
              />
            </div>
            <DesignQueueSection />
          </div>
        ) : null}

        {showTransfers ? (
          <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <CardHeader className="shrink-0 space-y-3">
              {roleSwitcher ? (
                <div className="flex flex-wrap items-center gap-3">{roleSwitcher}</div>
              ) : null}
              {transferSearchAndBadges}
            </CardHeader>
            <CardContent
              className={cn(
                "flex min-h-0 flex-1 flex-col overflow-hidden pt-0",
                showDesignQueue && "gap-4",
              )}
            >
              {showDesignQueue ? (
                <div className="shrink-0">
                  <DesignQueueSection />
                </div>
              ) : null}
              {transferListBody}
            </CardContent>
          </Card>
        ) : null}
      </div>

      {showTransfers ? (
      <>
      <PracticeTransferDetailChatDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            chatRoomResolveSeqRef.current += 1;
            setSelectedTransfer(null);
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
        chatHeaderAction={
          selectedTransfer?.practiceBusinessAnchorId ? (
            <LabPracticeFeeSurchargeControl
              practiceAnchorId={selectedTransfer.practiceBusinessAnchorId}
              multiplier={selectedTransfer.labFeeMultiplier}
              size="sm"
              onChanged={(next) => {
                const practiceAnchorId =
                  selectedTransfer.practiceBusinessAnchorId;
                setTransfers((prev) =>
                  prev.map((row) =>
                    row.practiceBusinessAnchorId === practiceAnchorId
                      ? { ...row, labFeeMultiplier: next }
                      : row,
                  ),
                );
                setSelectedTransfer((prev) =>
                  prev && prev.practiceBusinessAnchorId === practiceAnchorId
                    ? { ...prev, labFeeMultiplier: next }
                    : prev,
                );
                void loadFirstPage({ silent: true });
              }}
            />
          ) : null
        }
        summaryItems={[
          { label: "전송ID", value: selectedTransfer?.transferId || "-" },
          { label: "전송시각", value: selectedTransfer ? formatDateTime(selectedTransfer.createdAt) : "-" },
          { label: "치과", value: selectedTransfer?.matchingMode === "auto"
            ? "자동 매칭"
            : selectedTransfer?.practice.businessName || "-" },
          { label: "담당자", value: selectedTransfer?.matchingMode === "auto"
            ? "비공개"
            : selectedTransfer?.practice.userName || "-" },
          { label: "환자명", value: selectedTransferPatientName || "-" },
          { label: "주문일", value: selectedTransfer?.orderDate || "-" },
          { label: "도착일", value: selectedTransfer?.arrivalDate || "-" },
          ...(selectedTransferWorkPeriodSummary
            ? [selectedTransferWorkPeriodSummary]
            : []),
          {
            label: "어벗디자인",
            value: `${Number(selectedTransfer?.production?.designFileCount || selectedTransfer?.production?.designFiles?.length || 0)}개`,
          },
          {
            label: "결과파일",
            value: `${Number(selectedTransfer?.resultFileCount || selectedTransfer?.resultFiles?.length || 0)}개`,
          },
        ] satisfies PracticeTransferDialogSummaryItem[]}
        memo={selectedTransferDisplayMemo}
        toothWorks={selectedTransferToothWorks}
        toothWorksKey={selectedTransfer?.transferId || "requestor-transfer"}
        feeQuote={selectedTransfer?.feeQuote || null}
        feeViewer="lab"
        filesLabel="의뢰·어벗 디자인 파일"
        files={
          [
            ...(selectedTransfer?.files || []).map((file) => ({
              id: file.id,
              fileName: file.originalName,
              size: Number(file.size || 0),
              s3Key: String(file.s3Key || "").trim(),
            })),
            ...(selectedTransfer?.production?.designFiles || []).map((file) => ({
              id: file.id,
              fileName: `[어벗디자인] ${file.originalName}`,
              size: Number(file.size || 0),
              s3Key: String(file.s3Key || "").trim(),
            })),
          ] satisfies PracticeTransferDialogFileItem[]
        }
        resultFilesLabel="작업 결과 파일"
        resultFiles={
          (selectedTransfer?.resultFiles || []).map((file) => ({
            id: file.id,
            fileName: file.originalName,
            size: Number(file.size || 0),
            s3Key: String(file.s3Key || "").trim(),
          })) satisfies PracticeTransferDialogFileItem[]
        }
        downloadingFileKeys={downloadingKeys}
        downloadProgressByKey={downloadProgressByKey}
        downloadAllBusy={downloadAllBusy}
        onDownloadAllFiles={() => void handleDownloadAllFiles()}
        onDownloadTransferFile={(file) =>
          void handleDownload({
            id: file.id,
            patientName: "",
            tooth: "",
            originalName: file.fileName,
            mimetype: "",
            size: file.size,
            s3Key: file.s3Key,
          })
        }
        acceptBusy={acceptBusy}
        accepted={Boolean(
          selectedTransfer &&
            !(
              selectedTransfer.matchingMode === "auto" &&
              selectedTransfer.autoMatch?.openPool
            ) &&
            (selectedTransfer.isAccepted ||
              selectedTransfer.isDownloaded ||
              selectedTransfer.requestorDownloadedAt ||
              selectedTransfer.autoMatch?.completed ||
              selectedTransfer.production?.confirmedAt),
        )}
        chatUnlocked={Boolean(activeChatRoom?._id)}
        workCanceled={Boolean(
          String(selectedTransfer?.workCanceledAt || "").trim() ||
            selectedTransfer?.manufacturerStage === "작업취소" ||
            selectedTransfer?.manufacturerStage === "취소",
        )}
        workCompleted={Boolean(
          selectedTransfer?.autoMatch?.completed ||
            selectedTransfer?.production?.confirmedAt ||
            selectedTransfer?.manufacturerStage === "작업완료",
        )}
        remainingLabel={null}
        onAccept={() => void handleAcceptTransfer()}
        releaseBusy={releaseBusy}
        onRelease={() => void handleReleaseTransfer()}
        chatLoading={chatLoading}
        chatError={String(chatError || "")}
        chatMessages={displayChatMessages}
        isMyMessage={(senderId) => senderId === String(user?.id || "")}
        currentUserId={String(user?.id || "").trim()}
        formatChatTime={formatDateTime}
        formatFileSize={formatBytes}
        onDownloadChatAttachment={handleDownloadChatAttachment}
        chatBottomRef={chatBottomRef}
        chatAttachedFiles={chatUploads.items}
        onRemoveAttachedChatFile={chatUploads.removeItem}
        onRetryAttachedChatFile={chatUploads.retryItem}
        onAttachChatFiles={handleAttachChatFiles}
        attachmentInputId="requestor-practice-chat-attachment-input"
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
      ) : null}
    </div>
  );
}

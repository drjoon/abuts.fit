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
// - web/frontend/src/shared/hooks/useBackgroundTempUpload.ts
// - web/frontend/src/shared/hooks/useFilePreUpload.ts
// - web/frontend/src/shared/components/upload/BackgroundUploadList.tsx
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - web/frontend/src/shared/components/practice/LabReceiveWorkUploadDialog.tsx
// - 2026-08-16: 보철 — 위치 확정되면 지정 다이얼로그 생략·바로 저장/완료. 초과 시 슬롯 라벨 안내.
// - 2026-08-16: 어벗·보철 — 프리뷰 치아 지정·백그라운드 preUpload·분할 업로드.
// - 2026-08-16: 어벗은 3D 확인 모달에서 치아 지정(중간 지정 다이얼로그 생략).
// - 2026-08-16: 다파일 어벗 드롭 — 파일명 AI로 치아번호 확인 후 의뢰 매칭.
// - 2026-08-16: 어벗 확인 모달 기본값 — 파일명 AI 대신 치과 메모·치식·사업체명.
// - 2026-08-16: 카드 드롭 — 어벗 미완이면 디자인 업로드, 완료 후 보철 완료로 라우팅.
// - 2026-08-16: 어벗 STL 다중 선택·치아별 handoff 큐(relatedRequestIds 매칭).
// - 2026-08-16: internalLab도 디자인SW·아노 사업체 저장 가능(개인 requestor* 미전송).
// - 2026-08-16: 수락 직후 relatedRequestIds 로컬 반영(어벗 업로드 stale toast 방지).
// - 2026-08-16: 의뢰 수락 취소 — API 성공 후에만 UI 반영. 가공중 409면 abutmentPastReady 로컬 고정.
// - 2026-08-16: 수락 취소 성공·accept-released 실시간 — 로컬 해제 패치 + 목록 재동기화(수락 잔상/409 방지).
// - 2026-08-16: 어벗 가공 시작(준비 아님)이면 의뢰 수락·생산 취소 차단.
// - 2026-08-16: 수신 카드에 디자인SW·아노 메타 뱃지(어벗생산의뢰와 동일 스타일).
// - 2026-08-16: 어벗디자인 업로드 시 3D 확인 모달(기본값 채움·유지홈 필수) 후 handoff.
// - 2026-08-16: 기간필터 옆에 디자인SW·아노다이징 공통 툴바. 미설정 시 진입 강제.
// - 2026-08-16: 어벗디자인 업로드 후 로컬 production.designFiles 반영 → 상세「작업 파일」표시.
// - 2026-08-16: 디자인 없이 완료 플래그만 남은 stuck 건 — 목록 로드 시 stage reopen + CTA 복원.
// - 2026-08-16: 생산 취소 후 로컬 패치 — 결과파일·완료·확정 클리어 → 뱃지「의뢰수락」·업로드 CTA 복원.
// - 2026-08-16: mark-complete apiFetch body→jsonBody (결과파일 미전달 400 수정).
// - 2026-08-16: 상세 파일 — 의뢰(구강스캔)/작업(어벗디자인·보철물). 완료 토스트 문구.
// - 2026-08-16: 보철 완료 후 카드 — 업로드 2개 비활성·오른쪽 취소로 의뢰수락 재오픈.
// - 2026-08-16: 디자인 STL 업로드 후 버튼 라벨「어벗 생산 취소」(준비 단계만).
// - 2026-08-15: 수신 카드 → PracticeTransferLabReceiveCard(어벗츠기공소·lab 공통).
// - 2026-08-15: 디자인 STL 업로드 후 버튼 라벨「어벗생산 취소」(준비 단계만).
// - 2026-08-15: 어벗디자인 취소·재업로드(제조사 준비 단계만). 업로드 후 준비 큐 등록.
// - 2026-08-15: 수락 카드 — 어벗디자인 업로드 / 보철 업로드&작업완료 / 취소 3버튼.
// - 2026-08-15: 수락 기공소 CA 디자인 — 상세 모달 구강스캔 업로드 UI 제거(스캔 없이 수락).
// - 2026-08-15: 자동매칭 CA — 치과 구강스캔 필수. 지정은 스캔 없이 수락.
// - 2026-08-14: 자동매칭 채팅 헤더에도 기공수가 할증(표시명 비공개·practiceAnchorId 내부 키).
// - 2026-08-14: 자동매칭 수락·3시간 남은시간 뱃지 제거(도착일·소통 기한. 강제 클레임 만료 없음).
// - 2026-08-14: 의뢰수락 busy — transfer-room 재연결을 await하지 않음(수락 API만 대기).
// - 2026-08-14: 의뢰수락 — 낙관적 UI(즉시 수락 표시) + API는 백그라운드 확정/롤백.
// - 2026-08-15: 수락/취소 — API(~1.8s) 대기 없이 최소 딜레이 후 UI 전환, 실패 시 롤백.
// - 2026-08-14: 수락/취소 버튼 — 처리 즉시 시작, UI는 최소 0.5초「…중」후 전환.
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
// - 2026-08-15: 주문 후 1영업일 미수락 「수락대기」뱃지(목록).
// - 2026-08-16: 지정 거부=치과 취소 상태 전달(휴지통 아님). 자동매칭 거부는 타 기공소 공개.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { LabDashboardTopBanners } from "@/features/lab/LabDashboardTopBanners";
import { DesignSoftwareSettingsDialog } from "@/features/requestSettings/DesignSoftwareSettingsDialog";
import { RequestSettingsToolbar } from "@/features/requestSettings/RequestSettingsToolbar";
import { useRequestorRequestSettings } from "@/features/requestSettings/useRequestorRequestSettings";
import {
  AbutmentDesignConfirmDialog,
  type AbutmentDesignConfirmCaseInfos,
} from "@/shared/components/practice/AbutmentDesignConfirmDialog";
import {
  LabReceiveWorkUploadDialog,
  toLabReceiveSlotOptionsFromProsthetic,
  tryAutoAssignProstheticSlots,
  type LabReceiveUploadSlotOption,
  type LabReceiveWorkUploadAssignment,
} from "@/shared/components/practice/LabReceiveWorkUploadDialog";
import { useNewRequestImplant } from "@/pages/requestor/new_request/hooks/useNewRequestImplant";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { useFilePreUpload } from "@/shared/hooks/useFilePreUpload";
import {
  toChatMessageAttachments,
  useBackgroundTempUpload,
} from "@/shared/hooks/useBackgroundTempUpload";
import { useS3FileDownload } from "@/shared/files/useS3FileDownload";
import { Search } from "lucide-react";
import { cn } from "@/shared/ui/cn";
import {
  PracticeTransferDetailChatDialog,
  type PracticeTransferDialogFileItem,
  type PracticeTransferDialogSummaryItem,
} from "@/shared/components/PracticeTransferDetailChatDialog";
import { openPracticeTransferFilePicker } from "@/shared/components/practice/PracticeTransferFileDropTarget";
import { LabPracticeFeeSurchargeControl } from "@/shared/components/practice/LabPracticeFeeSurchargeControl";
import { PracticeTransferLabReceiveCard } from "@/shared/components/practice/PracticeTransferLabReceiveCard";
import { parsePracticeTransferFeeQuote } from "@/shared/practice/practiceTransferFeeQuote";
import { normalizeLabFeeMultiplier } from "@/shared/practice/labFeeSchedule";
import { parseStarDowngrade, parseLabRatingSummary } from "@/shared/practice/practiceLabRating";
import { buildPracticeWorkPeriodSummaryItem } from "@/shared/practice/practiceWorkPeriod";
import {
  ORAL_SCAN_REQUIRED_FROM_PRACTICE,
  needsOralScanForAccept,
} from "@/shared/practice/oralScanRequirement";
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
  parsePracticeTransferMemoMeta as parsePracticeTransferMemoMetaShared,
  parseToothWorks,
  serializeToothWorks,
  type ToothWorkSelection,
} from "@/shared/practice/transferMemo";
import { parseFilenameWithRules } from "@/shared/filename/parseFilenameWithRules";
import {
  getFilenameAiCache,
  setFilenameAiCache,
  toFilenameAiCacheKey,
} from "@/pages/requestor/new_request/utils/filenameAiCache";
import {
  formatPracticeTransferProstheticSlotLabels,
  getPracticeTransferLabReceiveDisplayStatus,
  listPracticeTransferPendingProstheticSlots,
  practiceTransferAbutmentMachiningStarted,
  practiceTransferHasCustomAbutment,
  practiceTransferNeedsMoreAbutmentDesigns,
  type PracticeTransferLabReceiveFile as ReceivedPracticeFile,
  type PracticeTransferLabReceiveItem as ReceivedPracticeTransfer,
} from "@/shared/practice/practiceTransferLabReceive";
import { getPracticeTransferFileExtension } from "@/shared/practice/practiceTransferAccept";
import { resolvePracticeTransferListPatientName } from "@/shared/components/practice/PracticeRecentTransferListCardDetail";
import type { ReactNode } from "react";

type AbutmentPendingMeta = {
  requestId: string;
  tooth: string;
  caseInfos: Record<string, unknown> | null;
  designCompletedAt: string;
};

type LabReceiveSplitAskState = {
  mode: "abutment" | "prosthetic";
  transfer: ReceivedPracticeTransfer;
  files: File[];
  pendingCount: number;
  abutmentPending?: AbutmentPendingMeta[];
  prostheticSlots?: LabReceiveUploadSlotOption[];
};

type LabReceiveWorkUploadState = {
  mode: "abutment" | "prosthetic";
  transfer: ReceivedPracticeTransfer;
  files: File[];
  slots: LabReceiveUploadSlotOption[];
  initialSlotIds: Array<string | null>;
  splitMode: boolean;
  abutmentPending?: AbutmentPendingMeta[];
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

const getTransferDisplayStatus = getPracticeTransferLabReceiveDisplayStatus;
const transferHasCustomAbutment = practiceTransferHasCustomAbutment;

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
        showDesignQueue={designAccessEnabled && !canReceiveTransfer}
        designQueueListMode="partner"
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

export function RequestorPracticeReceivePage({
  roleSwitcher,
  showDesignQueue = false,
  designQueueListMode = "partner",
  showTransfers = true,
}: {
  roleSwitcher?: ReactNode;
  /** 지정 기공소: 디자인+생산 준비 큐를 의뢰수신에 통합 */
  showDesignQueue?: boolean;
  /** partner=디자인 파트너 전역 큐. acceptingLab은 렌더 없음(호환용). */
  designQueueListMode?: "partner" | "acceptingLab";
  /** 무료 기공의뢰서 수신 목록 표시 */
  showTransfers?: boolean;
}) {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const { period, setPeriod } = usePeriodStore();
  const { toast } = useToast();
  const {
    designSoftwareValue,
    anodizingEnabled,
    anodizingSaving,
    designSoftwareSaving,
    settingsComplete,
    retentionGrooveDefault,
    saveRetentionGroove,
    modalOpen: requestSettingsModalOpen,
    designSoftwareMode,
    setDesignSoftwareMode,
    customDesignSoftware,
    setCustomDesignSoftware,
    modalAnodizingEnabled,
    setModalAnodizingEnabled,
    forceRequired: requestSettingsForceRequired,
    dialogDescription: requestSettingsDialogDescription,
    openDesignSoftwareModal,
    handleSaveDesignSoftware,
    handleToggleAnodizing,
    handleModalOpenChange: handleRequestSettingsModalOpenChange,
  } = useRequestorRequestSettings({
    enabled: true,
    forceOnEntry: true,
  });
  const { rooms } = useChatRooms();
  const {
    ensureFilesUploaded,
    preUploadFiles,
    uploadProgress,
  } = useFilePreUpload({ token });
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
    | "all"
    | "발송완료"
    | "의뢰수락"
    | "작업완료"
    | "취소"
    | "거부"
    | "포장.발송"
    | "리메이크"
  >("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<ReceivedPracticeTransfer | null>(null);
  const [acceptBusy, setAcceptBusy] = useState(false);
  const [rejectBusy, setRejectBusy] = useState(false);
  const [releaseBusy, setReleaseBusy] = useState(false);
  const [cardActionBusyId, setCardActionBusyId] = useState<string>("");
  const cardActionBusyIdRef = useRef<string>("");
  const [designConfirmBusyId, setDesignConfirmBusyId] = useState<string>("");
  const [designConfirmOpen, setDesignConfirmOpen] = useState(false);
  const [designConfirmBusy, setDesignConfirmBusy] = useState(false);
  const [designConfirmQueue, setDesignConfirmQueue] = useState<
    Array<{
      file: File;
      requestId: string;
      caseInfos: AbutmentDesignConfirmCaseInfos;
    }>
  >([]);
  const [designConfirmQueueIndex, setDesignConfirmQueueIndex] = useState(0);
  const [designConfirmTransfer, setDesignConfirmTransfer] =
    useState<ReceivedPracticeTransfer | null>(null);
  const [designConfirmPendingMetas, setDesignConfirmPendingMetas] = useState<
    AbutmentPendingMeta[]
  >([]);
  const designConfirmEntry =
    designConfirmQueue[designConfirmQueueIndex] || null;
  const designConfirmFile = designConfirmEntry?.file || null;
  const designConfirmRequestId = designConfirmEntry?.requestId || "";
  const designConfirmCaseInfos = designConfirmEntry?.caseInfos || null;
  const designConfirmTeethOptions = useMemo(() => {
    const fromPending = designConfirmPendingMetas
      .map((meta) => String(meta.tooth || "").trim())
      .filter(Boolean);
    const teeth =
      fromPending.length > 0
        ? fromPending
        : parseToothWorks(designConfirmTransfer?.toothWorksSummary || "")
            .filter((row) => Boolean(row.customAbutment))
            .map((row) => String(row.toothNumber || "").trim())
            .filter(Boolean);
    return [...new Set(teeth)].map((tooth) => ({ id: tooth, label: tooth }));
  }, [designConfirmPendingMetas, designConfirmTransfer?.toothWorksSummary]);
  const [splitAskState, setSplitAskState] =
    useState<LabReceiveSplitAskState | null>(null);
  const [workUploadState, setWorkUploadState] =
    useState<LabReceiveWorkUploadState | null>(null);
  const [workUploadBusy, setWorkUploadBusy] = useState(false);
  const { connections } = useNewRequestImplant({ token });
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
              declinedByMe: Boolean(autoMatchRaw.declinedByMe),
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
              skipJig: Boolean(productionRaw.skipJig),
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
              abutmentPastReady: Boolean(productionRaw.abutmentPastReady),
              confirmedAt: productionRaw.confirmedAt
                ? String(productionRaw.confirmedAt)
                : null,
              relatedRequestIds: Array.isArray(productionRaw.relatedRequestIds)
                ? productionRaw.relatedRequestIds.map((id) => String(id))
                : [],
            }
          : null;
        const toothWorksFromApi = Array.isArray(r.toothWorks)
          ? (r.toothWorks as ToothWorkSelection[])
          : null;
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
          toothWorksSummary: toothWorksFromApi?.length
            ? serializeToothWorks(toothWorksFromApi)
            : parsedMemo.toothWorksSummary,
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
          labRejected:
            Boolean(r.labRejected) ||
            Boolean(autoMatch?.declinedByMe) ||
            String(r.manufacturerStage || "").trim() === "거부",
          labRejectedAt: r.labRejectedAt ? String(r.labRejectedAt) : null,
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
          starDowngrade: parseStarDowngrade(r.starDowngrade),
          labRatingSummary: parseLabRatingSummary(r.labRatingSummary),
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

  const buildProductionCancelLocalPatch = useCallback(
    (transfer: ReceivedPracticeTransfer): ReceivedPracticeTransfer => {
      const clearedProduction: ReceivedPracticeTransfer["production"] = {
        ...transfer.production,
        designFileCount: 0,
        designFiles: [],
        designReadyAt: null,
        labDesignConfirmedAt: null,
        abutmentProductionStartedAt: null,
        abutmentPastReady: false,
        confirmedAt: null,
      };
      const clearedAutoMatch = transfer.autoMatch
        ? {
            ...transfer.autoMatch,
            completed: false,
            completedAt: null,
          }
        : transfer.autoMatch;
      return {
        ...transfer,
        manufacturerStage: "의뢰수락",
        resultFiles: [],
        resultFileCount: 0,
        production: clearedProduction,
        autoMatch: clearedAutoMatch,
      };
    },
    [],
  );

  const isStuckNeedsStageReopen = useCallback(
    (transfer: ReceivedPracticeTransfer) => {
      const designCount = Number(
        transfer.production?.designFileCount ||
          transfer.production?.designFiles?.length ||
          0,
      );
      const resultCount = Number(
        transfer.resultFileCount || transfer.resultFiles?.length || 0,
      );
      const accepted =
        Boolean(transfer.isAccepted) ||
        Boolean(transfer.isDownloaded) ||
        Boolean(String(transfer.requestorDownloadedAt || "").trim());
      const started = practiceTransferAbutmentMachiningStarted(transfer);
      const relatedIds = transfer.production?.relatedRequestIds || [];
      if (!accepted || started || designCount > 0 || relatedIds.length === 0) {
        return false;
      }
      return (
        resultCount > 0 ||
        Boolean(transfer.production?.confirmedAt) ||
        Boolean(transfer.autoMatch?.completed) ||
        transfer.manufacturerStage === "생산진행" ||
        transfer.manufacturerStage === "작업완료"
      );
    },
    [],
  );

  const reopenStuckTransfers = useCallback(
    async (rows: ReceivedPracticeTransfer[]) => {
      if (!token) return;
      const stuck = rows.filter(isStuckNeedsStageReopen);
      if (!stuck.length) return;

      const results = await Promise.all(
        stuck.map(async (transfer) => {
          const requestId = String(
            transfer.production?.relatedRequestIds?.[0] || "",
          ).trim();
          if (!requestId) return null;
          const cancelRes = await apiFetch<{ success?: boolean }>({
            path: `/api/requests/${encodeURIComponent(requestId)}/design-handoff/cancel`,
            method: "POST",
            token,
          });
          if (!cancelRes.ok) return null;
          return transfer.transferId || transfer._id;
        }),
      );
      const reopened = new Set(results.filter(Boolean).map((id) => String(id)));
      if (!reopened.size) return;

      setTransfers((prev) =>
        prev.map((row) => {
          const key = row.transferId || row._id;
          return reopened.has(key) ? buildProductionCancelLocalPatch(row) : row;
        }),
      );
      setSelectedTransfer((prev) => {
        if (!prev) return prev;
        const key = prev.transferId || prev._id;
        return reopened.has(key) ? buildProductionCancelLocalPatch(prev) : prev;
      });
    },
    [buildProductionCancelLocalPatch, isStuckNeedsStageReopen, token],
  );

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
        void reopenStuckTransfers(mapped);
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
    [
      emitUnreadBadgeRefresh,
      mapTransferRows,
      parseTransfersBody,
      reopenStuckTransfers,
      token,
    ],
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
        action !== "rejected" &&
        (action === "canceled" ||
          action === "cancelled" ||
          action === "deleted" ||
          action === "removed" ||
          action === "purged" ||
          statusLower === "canceled" ||
          statusLower === "cancelled" ||
          statusLower === "deleted" ||
          statusLower === "removed" ||
          status === "취소");
      const requestorReadAt = payload.requestorReadAt
        ? String(payload.requestorReadAt)
        : null;
      const requestorDownloadedAt = payload.requestorDownloadedAt
        ? String(payload.requestorDownloadedAt)
        : null;

      if (type === "practice:transfer-updated" && transferId) {
        if (
          action === "auto-match-released" ||
          action === "accept-released" ||
          action === "auto-match-claimed" ||
          action === "completed"
        ) {
          if (action === "auto-match-released" || action === "accept-released") {
            const isAutoRelease = action === "auto-match-released";
            const workCanceledAt =
              payload.workCanceledAt != null
                ? String(payload.workCanceledAt)
                : new Date().toISOString();
            const autoMatchRaw =
              payload.autoMatch && typeof payload.autoMatch === "object"
                ? (payload.autoMatch as Record<string, unknown>)
                : null;
            const releaseLocalPatch = (
              row: ReceivedPracticeTransfer,
            ): ReceivedPracticeTransfer => ({
              ...row,
              isAccepted: false,
              isDownloaded: false,
              requestorDownloadedAt: null,
              requestorAcceptedAt: null,
              workCanceledAt,
              manufacturerStage: isAutoRelease
                ? "자동매칭"
                : String(payload.manufacturerStage || "작업취소").trim() ||
                  "작업취소",
              targetLabName: isAutoRelease
                ? "자동 매칭"
                : row.targetLabName,
              autoMatch: isAutoRelease
                ? {
                    ...(row.autoMatch || {}),
                    claimedAt: null,
                    deadlineAt: null,
                    completedAt: null,
                    openPool:
                      autoMatchRaw?.openPool != null
                        ? Boolean(autoMatchRaw.openPool)
                        : true,
                    claimActive: false,
                    completed: false,
                    mine: false,
                    remainingMs: null,
                    releaseCount:
                      autoMatchRaw?.releaseCount != null
                        ? Number(autoMatchRaw.releaseCount)
                        : Number(row.autoMatch?.releaseCount || 0) + 1,
                  }
                : row.autoMatch
                  ? {
                      ...row.autoMatch,
                      completedAt: null,
                      completed: false,
                      claimActive: false,
                    }
                  : row.autoMatch,
            });
            setTransfers((prev) =>
              prev.map((row) =>
                row.transferId === transferId ? releaseLocalPatch(row) : row,
              ),
            );
            setSelectedTransfer((prev) =>
              prev && prev.transferId === transferId
                ? releaseLocalPatch(prev)
                : prev,
            );
          }
          void loadFirstPage({ silent: true });
          if (hasUnreadCount) {
            emitUnreadBadgeRefresh(unreadCount);
          }
          return;
        }
        if (action === "rejected") {
          const rejectedAt =
            payload.labRejectedAt != null
              ? String(payload.labRejectedAt)
              : new Date().toISOString();
          setTransfers((prev) =>
            prev.map((row) => {
              if (row.transferId !== transferId) return row;
              return {
                ...row,
                status: status || row.status,
                labRejected: true,
                labRejectedAt: rejectedAt,
                manufacturerStage: "거부",
                autoMatch: row.autoMatch
                  ? {
                      ...row.autoMatch,
                      declinedByMe: true,
                      claimActive: false,
                      mine: false,
                    }
                  : row.autoMatch,
              };
            }),
          );
          setSelectedTransfer((prev) => {
            if (!prev || prev.transferId !== transferId) return prev;
            return {
              ...prev,
              status: status || prev.status,
              labRejected: true,
              labRejectedAt: rejectedAt,
              manufacturerStage: "거부",
              autoMatch: prev.autoMatch
                ? {
                    ...prev.autoMatch,
                    declinedByMe: true,
                    claimActive: false,
                    mine: false,
                  }
                : prev.autoMatch,
            };
          });
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
          const relatedFromRealtime = pickRelatedRequestIdsFromPayload(payload);
          const productionRawFromRealtime =
            payload.production && typeof payload.production === "object"
              ? (payload.production as Record<string, unknown>)
              : null;
          setTransfers((prev) =>
            prev.map((row) => {
              if (row.transferId !== transferId) return row;
              const productionPatch =
                relatedFromRealtime.length > 0
                  ? mergeProductionRelatedRequestIds(
                      row.production,
                      relatedFromRealtime,
                      productionRawFromRealtime,
                    )
                  : null;
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
                ...(productionPatch ? { production: productionPatch } : {}),
              };
            }),
          );

          setSelectedTransfer((prev) => {
            if (!prev || prev.transferId !== transferId) return prev;
            const productionPatch =
              relatedFromRealtime.length > 0
                ? mergeProductionRelatedRequestIds(
                    prev.production,
                    relatedFromRealtime,
                    productionRawFromRealtime,
                  )
                : null;
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
              ...(productionPatch ? { production: productionPatch } : {}),
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
      const isCanceled = ["canceled", "cancelled", "deleted", "removed", "취소"].includes(
        rawStatus,
      );
      // 기공소 거부(지정)는 canceled이어도 희미한 카드로 남긴다.
      if (isCanceled && !t.labRejected && t.manufacturerStage !== "거부") {
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
        if (status === "거부") acc.rejected += 1;
        else if (status === "작업완료") acc.completed += 1;
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
      {
        sent: 0,
        accepted: 0,
        completed: 0,
        canceled: 0,
        rejected: 0,
        shipping: 0,
        remake: 0,
      },
    );
    return counts;
  }, [baseFilteredTransfers]);

  const filteredTransfers = useMemo(() => {
    if (statusFilter === "all") return baseFilteredTransfers;
    return baseFilteredTransfers.filter((transfer) => {
      const status = getTransferDisplayStatus(transfer);
      if (statusFilter === "거부") {
        return status === "거부";
      }
      if (status === "거부") return false;
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
        "lab",
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

  /** mark-accepted / realtime production 페이로드에서 CA Request id 추출 */
  const pickRelatedRequestIdsFromPayload = useCallback(
    (data: Record<string, unknown>): string[] => {
      const productionRaw =
        data.production && typeof data.production === "object"
          ? (data.production as Record<string, unknown>)
          : null;
      const fromProduction = Array.isArray(productionRaw?.relatedRequestIds)
        ? productionRaw.relatedRequestIds
            .map((raw) => String(raw || "").trim())
            .filter(Boolean)
        : [];
      if (fromProduction.length > 0) return fromProduction;
      return Array.isArray(data.abutmentRequestIds)
        ? data.abutmentRequestIds
            .map((raw) => String(raw || "").trim())
            .filter(Boolean)
        : [];
    },
    [],
  );

  const mergeProductionRelatedRequestIds = useCallback(
    (
      prev: ReceivedPracticeTransfer["production"] | null | undefined,
      relatedRequestIds: string[],
      productionRaw?: Record<string, unknown> | null,
    ): NonNullable<ReceivedPracticeTransfer["production"]> => {
      const shippingMode =
        productionRaw?.shippingMode === "express"
          ? ("express" as const)
          : productionRaw?.shippingMode === "normal"
            ? ("normal" as const)
            : prev?.shippingMode || null;
      return {
        ...(prev || {}),
        shippingMode,
        relatedRequestIds,
      };
    },
    [],
  );

  /** 수락/취소 버튼 UI 전환 최소 딜레이(API는 백그라운드, UI는 이 시간만 대기) */
  const ACTION_UI_MIN_MS = 500;

  const markTransferAccepted = useCallback(
    async (transfer: ReceivedPracticeTransfer) => {
      if (!token) return false;

      if (!settingsComplete) {
        openDesignSoftwareModal();
        toast({
          title: "설정이 필요합니다",
          description:
            "기공소 디자인 소프트웨어와 아노다이징을 먼저 설정한 뒤 수락해주세요.",
          variant: "destructive",
        });
        return false;
      }

      const isOpenPool =
        transfer.matchingMode === "auto" && Boolean(transfer.autoMatch?.openPool);
      const fileCount = transfer.files?.length || transfer.fileCount || 0;
      const hasCa = transferHasCustomAbutment(transfer);

      if (
        !isOpenPool &&
        (transfer.isAccepted ||
          transfer.isDownloaded ||
          transfer.requestorDownloadedAt)
      ) {
        return true;
      }

      if (
        needsOralScanForAccept({
          hasCustomAbutment: hasCa,
          fileCount,
          matchingMode: transfer.matchingMode,
        })
      ) {
        toast({
          title: "의뢰수락 실패",
          description: ORAL_SCAN_REQUIRED_FROM_PRACTICE,
          variant: "destructive",
        });
        return false;
      }

      try {
        const acceptedAtIso = new Date().toISOString();
        const rollbackPatch: Partial<ReceivedPracticeTransfer> = {
          isRead: transfer.isRead,
          requestorReadAt: transfer.requestorReadAt,
          isDownloaded: transfer.isDownloaded,
          isAccepted: transfer.isAccepted,
          requestorDownloadedAt: transfer.requestorDownloadedAt,
          requestorAcceptedAt: transfer.requestorAcceptedAt,
          workCanceledAt: transfer.workCanceledAt,
          manufacturerStage: transfer.manufacturerStage,
          matchingMode: transfer.matchingMode,
          autoMatch: transfer.autoMatch,
          targetLabName: transfer.targetLabName,
          files: transfer.files,
          fileCount: transfer.fileCount,
        };

        const optimisticPatch: Partial<ReceivedPracticeTransfer> = {
          isRead: true,
          requestorReadAt: transfer.requestorReadAt || acceptedAtIso,
          isDownloaded: true,
          isAccepted: true,
          requestorDownloadedAt: acceptedAtIso,
          requestorAcceptedAt: acceptedAtIso,
          workCanceledAt: null,
          manufacturerStage: "의뢰수락",
          matchingMode: transfer.matchingMode === "auto" ? "auto" : "direct",
          autoMatch:
            transfer.matchingMode === "auto"
              ? {
                  ...(transfer.autoMatch || {}),
                  claimedAt: acceptedAtIso,
                  deadlineAt: null,
                  claimHours: null,
                  completedAt: null,
                  openPool: false,
                  claimActive: true,
                  completed: false,
                  mine: true,
                  remainingMs: null,
                  releaseCount: Number(transfer.autoMatch?.releaseCount || 0),
                }
              : transfer.autoMatch,
        };

        const apiPromise = apiFetch<unknown>({
          path: `/api/practice/transfers/${encodeURIComponent(transfer.transferId)}/mark-accepted`,
          method: "POST",
          token,
        });

        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, ACTION_UI_MIN_MS);
        });

        applyAcceptedLocalPatch(transfer, optimisticPatch);
        toast({
          title: "의뢰수락 완료",
          description:
            transfer.matchingMode === "auto"
              ? "선착순 수락되었습니다."
              : "기공의뢰를 수락했습니다.",
        });

        void apiPromise
          .then((res) => {
            if (!res.ok) {
              const body =
                res.data && typeof res.data === "object"
                  ? (res.data as Record<string, unknown>)
                  : {};
              applyAcceptedLocalPatch(transfer, rollbackPatch);
              toast({
                title: "의뢰수락 실패",
                description: String(
                  body.message || "의뢰수락 중 오류가 발생했습니다.",
                ),
                variant: "destructive",
              });
              if (String(body.message || "").includes("다른 기공소")) {
                void loadFirstPage({ silent: true });
              }
              return;
            }

            const body =
              res.data && typeof res.data === "object"
                ? (res.data as Record<string, unknown>)
                : {};
            const data =
              body.data && typeof body.data === "object"
                ? (body.data as Record<string, unknown>)
                : body;
            const readAt = data.requestorReadAt
              ? String(data.requestorReadAt)
              : optimisticPatch.requestorReadAt;
            const acceptedAt = data.requestorAcceptedAt
              ? String(data.requestorAcceptedAt)
              : data.requestorDownloadedAt
                ? String(data.requestorDownloadedAt)
                : optimisticPatch.requestorAcceptedAt;
            const unreadCount = Number(data.unreadCount);
            if (Number.isFinite(unreadCount)) {
              emitUnreadBadgeRefresh(unreadCount);
            }
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
              : optimisticPatch.autoMatch;

            const responseFilesRaw = Array.isArray(data.files) ? data.files : null;
            const responseFiles: ReceivedPracticeFile[] | undefined = responseFilesRaw
              ? (responseFilesRaw
                  .map((row, idx) => {
                    const item =
                      row && typeof row === "object"
                        ? (row as Record<string, unknown>)
                        : {};
                    const fileObj =
                      item.file && typeof item.file === "object"
                        ? (item.file as Record<string, unknown>)
                        : item;
                    const originalName = String(
                      fileObj.originalName || item.originalName || "",
                    ).trim();
                    const s3Key = String(fileObj.s3Key || item.s3Key || "").trim();
                    if (!originalName || !s3Key) return null;
                    return {
                      id: String(item.id || `${transfer.id}::scan::${idx + 1}`),
                      patientName: String(item.patientName || "").trim(),
                      tooth: String(item.tooth || "").trim(),
                      originalName,
                      mimetype: String(
                        fileObj.mimetype ||
                          item.mimetype ||
                          "application/octet-stream",
                      ).trim(),
                      size: Number(fileObj.size || item.size || 0),
                      s3Key,
                    } satisfies ReceivedPracticeFile;
                  })
                  .filter(Boolean) as ReceivedPracticeFile[])
              : undefined;

            const relatedFromAccept = pickRelatedRequestIdsFromPayload(data);
            const productionRawFromAccept =
              data.production && typeof data.production === "object"
                ? (data.production as Record<string, unknown>)
                : null;
            const productionPatch =
              relatedFromAccept.length > 0
                ? mergeProductionRelatedRequestIds(
                    transfer.production,
                    relatedFromAccept,
                    productionRawFromAccept,
                  )
                : null;

            applyAcceptedLocalPatch(transfer, {
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
              ...(responseFiles
                ? { files: responseFiles, fileCount: responseFiles.length }
                : {}),
              ...(productionPatch ? { production: productionPatch } : {}),
            });
          })
          .catch(() => {
            applyAcceptedLocalPatch(transfer, rollbackPatch);
            toast({
              title: "의뢰수락 실패",
              description: "의뢰수락 요청 중 오류가 발생했습니다.",
              variant: "destructive",
            });
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
    [
      ACTION_UI_MIN_MS,
      applyAcceptedLocalPatch,
      emitUnreadBadgeRefresh,
      loadFirstPage,
      mergeProductionRelatedRequestIds,
      openDesignSoftwareModal,
      pickRelatedRequestIdsFromPayload,
      settingsComplete,
      toast,
      token,
    ],
  );

  const mapApiResultFiles = useCallback(
    (
      transfer: ReceivedPracticeTransfer,
      raw: unknown,
      fallback: Array<{
        patientName: string;
        tooth: string;
        file: {
          originalName: string;
          mimetype: string;
          size: number;
          s3Key: string;
        };
      }>,
    ): ReceivedPracticeFile[] => {
      const source = Array.isArray(raw) ? raw : fallback;
      return source
        .map((row, idx) => {
          const item =
            row && typeof row === "object" ? (row as Record<string, unknown>) : {};
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
    },
    [],
  );

  const buildResultFilePayloadFromAssignments = useCallback(
    async (assignments: LabReceiveWorkUploadAssignment[]) => {
      const files = assignments.map((row) => row.file);
      const uploadedFiles = await ensureFilesUploaded(files);
      return uploadedFiles
        .map((f, idx) => ({
          patientName: "",
          tooth: String(assignments[idx]?.tooth || "").trim(),
          file: {
            originalName: String(f.originalName || "").trim(),
            mimetype: String(
              f.mimetype || f.fileType || "application/octet-stream",
            ).trim(),
            size: Number(f.size || 0),
            s3Key: String(f.key || "").trim(),
          },
        }))
        .filter((row) => row.file.originalName && row.file.s3Key);
    },
    [ensureFilesUploaded],
  );

  const markTransferComplete = useCallback(
    async (
      transfer: ReceivedPracticeTransfer,
      options: {
        assignments: LabReceiveWorkUploadAssignment[];
      },
    ) => {
      if (!token) return false;
      if (transfer.autoMatch?.completed) return true;

      const assignments = Array.isArray(options.assignments)
        ? options.assignments
        : [];
      if (assignments.length === 0) {
        toast({
          title: "결과 파일 필요",
          description: "작업 완료하려면 보철 결과 파일을 선택해주세요.",
          variant: "destructive",
        });
        return false;
      }

      try {
        const incoming = await buildResultFilePayloadFromAssignments(assignments);
        if (incoming.length === 0) {
          toast({
            title: "업로드 실패",
            description: "결과 파일 업로드에 실패했습니다.",
            variant: "destructive",
          });
          return false;
        }

        const existingPayload = (transfer.resultFiles || [])
          .filter((row) => row.originalName && row.s3Key)
          .map((row) => ({
            patientName: String(row.patientName || "").trim(),
            tooth: String(row.tooth || "").trim(),
            file: {
              originalName: String(row.originalName || "").trim(),
              mimetype: String(row.mimetype || "application/octet-stream").trim(),
              size: Number(row.size || 0),
              s3Key: String(row.s3Key || "").trim(),
            },
          }));
        const byKey = new Map(
          existingPayload.map((row) => [row.file.s3Key, row] as const),
        );
        for (const row of incoming) {
          byKey.set(row.file.s3Key, row);
        }
        const resultFiles = [...byKey.values()];

        const res = await apiFetch<unknown>({
          path: `/api/practice/transfers/${encodeURIComponent(transfer.transferId)}/mark-complete`,
          method: "POST",
          token,
          jsonBody: {
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
        const mappedResultFiles = mapApiResultFiles(
          transfer,
          data.resultFiles,
          resultFiles,
        );
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
          skipJig:
            Boolean(productionRawFromRes?.skipJig) ||
            Boolean(transfer.production?.skipJig),
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
          abutmentPastReady:
            productionRawFromRes?.abutmentPastReady != null
              ? Boolean(productionRawFromRes.abutmentPastReady)
              : Boolean(transfer.production?.abutmentPastReady),
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
          title: autoConfirmedAt
            ? "기공 디자인 완료 처리합니다. 생산 후 배송해주세요"
            : "기공 디자인 완료. 치과의 컨펌을 기다리겠습니다.",
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
    [
      buildResultFilePayloadFromAssignments,
      mapApiResultFiles,
      toast,
      token,
    ],
  );

  const appendTransferResultFiles = useCallback(
    async (
      transfer: ReceivedPracticeTransfer,
      assignments: LabReceiveWorkUploadAssignment[],
    ) => {
      if (!token) return false;
      if (assignments.length === 0) return false;
      try {
        const incoming = await buildResultFilePayloadFromAssignments(assignments);
        if (incoming.length === 0) {
          toast({
            title: "업로드 실패",
            description: "결과 파일 업로드에 실패했습니다.",
            variant: "destructive",
          });
          return false;
        }
        const res = await apiFetch<unknown>({
          path: `/api/practice/transfers/${encodeURIComponent(transfer.transferId)}/result-files`,
          method: "POST",
          token,
          jsonBody: { resultFiles: incoming },
        });
        if (!res.ok) {
          const body =
            res.data && typeof res.data === "object"
              ? (res.data as Record<string, unknown>)
              : {};
          toast({
            title: "보철 저장 실패",
            description: String(body.message || "보철 파일 저장 중 오류가 발생했습니다."),
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
        const mappedResultFiles = mapApiResultFiles(
          transfer,
          data.resultFiles,
          [
            ...(transfer.resultFiles || []).map((row) => ({
              patientName: row.patientName,
              tooth: row.tooth,
              file: {
                originalName: row.originalName,
                mimetype: row.mimetype,
                size: row.size,
                s3Key: row.s3Key,
              },
            })),
            ...incoming,
          ],
        );
        setTransfers((prev) =>
          prev.map((row) =>
            row._id === transfer._id || row.transferId === transfer.transferId
              ? {
                  ...row,
                  resultFiles: mappedResultFiles,
                  resultFileCount: mappedResultFiles.length,
                }
              : row,
          ),
        );
        setSelectedTransfer((prev) =>
          prev &&
          (prev._id === transfer._id || prev.transferId === transfer.transferId)
            ? {
                ...prev,
                resultFiles: mappedResultFiles,
                resultFileCount: mappedResultFiles.length,
              }
            : prev,
        );
        toast({
          title: "보철 일부 저장",
          description: `${incoming.length}개 파일을 저장했습니다. 나머지 작업 후 이어서 올려주세요.`,
        });
        return true;
      } catch {
        toast({
          title: "보철 저장 실패",
          description: "보철 파일 저장 중 오류가 발생했습니다.",
          variant: "destructive",
        });
        return false;
      }
    },
    [buildResultFilePayloadFromAssignments, mapApiResultFiles, toast, token],
  );

  const openWorkUploadDialog = useCallback(
    (state: LabReceiveWorkUploadState) => {
      preUploadFiles(state.files);
      setWorkUploadState(state);
    },
    [preUploadFiles],
  );

  const resolveProstheticAssignments = useCallback(
    (
      files: File[],
      slotOptions: LabReceiveUploadSlotOption[],
      pendingSlots: ReturnType<typeof listPracticeTransferPendingProstheticSlots>,
    ): LabReceiveWorkUploadAssignment[] | null => {
      if (files.length === 1 && slotOptions.length === 1) {
        const slot = slotOptions[0];
        return [
          {
            file: files[0],
            slotId: slot.id,
            tooth: slot.tooth,
            label: slot.label,
          },
        ];
      }
      const teethBySlotId = new Map(
        pendingSlots.map((slot) => [slot.id, slot.teeth] as const),
      );
      return tryAutoAssignProstheticSlots(
        files,
        slotOptions,
        teethBySlotId,
        (filename) =>
          String(parseFilenameWithRules(filename)?.tooth || "").trim(),
      );
    },
    [],
  );

  const submitProstheticAssignments = useCallback(
    async (params: {
      transfer: ReceivedPracticeTransfer;
      assignments: LabReceiveWorkUploadAssignment[];
      pendingSlotCount: number;
      splitMode: boolean;
    }) => {
      const { transfer, assignments, pendingSlotCount, splitMode } = params;
      if (!assignments.length || workUploadBusy) return false;
      preUploadFiles(assignments.map((row) => row.file));
      setWorkUploadBusy(true);
      setCardActionBusyId(String(transfer.transferId || transfer._id || ""));
      try {
        const remainingAfter = pendingSlotCount - assignments.length;
        const shouldComplete = !splitMode || remainingAfter <= 0;
        const ok = shouldComplete
          ? await markTransferComplete(transfer, { assignments })
          : await appendTransferResultFiles(transfer, assignments);
        if (ok) setWorkUploadState(null);
        return ok;
      } finally {
        setWorkUploadBusy(false);
        setCardActionBusyId("");
      }
    },
    [
      appendTransferResultFiles,
      markTransferComplete,
      preUploadFiles,
      workUploadBusy,
    ],
  );

  const beginCompleteWithFiles = useCallback(
    (transfer: ReceivedPracticeTransfer, files: File[]) => {
      const nextFiles = Array.from(files || []).filter(Boolean);
      if (!nextFiles.length) return;
      const id = String(transfer.transferId || transfer._id || "").trim();
      if (!id || cardActionBusyId || workUploadBusy) return;

      const pendingSlots = listPracticeTransferPendingProstheticSlots(transfer);
      const slotOptions = toLabReceiveSlotOptionsFromProsthetic(pendingSlots);

      // 보철 슬롯 없음(CA만 등) — 치아 지정 없이 업로드 후 작업완료
      if (slotOptions.length === 0) {
        const freeSlots: LabReceiveUploadSlotOption[] = nextFiles.map(
          (file, idx) => {
            const tooth = String(
              parseFilenameWithRules(file.name)?.tooth || "",
            ).trim();
            return {
              id: `free:${idx}:${file.name}`,
              label: tooth ? `${tooth} 보철` : `파일 ${idx + 1}`,
              tooth,
            };
          },
        );
        const freeAssignments: LabReceiveWorkUploadAssignment[] = nextFiles.map(
          (file, idx) => ({
            file,
            slotId: freeSlots[idx].id,
            tooth: freeSlots[idx].tooth,
            label: freeSlots[idx].label,
          }),
        );
        void submitProstheticAssignments({
          transfer,
          assignments: freeAssignments,
          pendingSlotCount: freeAssignments.length,
          splitMode: false,
        });
        return;
      }

      if (nextFiles.length > slotOptions.length) {
        const labels = formatPracticeTransferProstheticSlotLabels(transfer, {
          pendingOnly: true,
        });
        toast({
          title: "파일 수 초과",
          description: `남은 보철은 ${slotOptions.length}개${
            labels ? ` (${labels})` : ""
          }입니다. ${slotOptions.length}개만 선택해주세요.`,
          variant: "destructive",
        });
        return;
      }

      if (nextFiles.length < slotOptions.length) {
        preUploadFiles(nextFiles);
        setSplitAskState({
          mode: "prosthetic",
          transfer,
          files: nextFiles,
          pendingCount: slotOptions.length,
          prostheticSlots: slotOptions,
        });
        return;
      }

      const auto = resolveProstheticAssignments(
        nextFiles,
        slotOptions,
        pendingSlots,
      );
      if (auto) {
        void submitProstheticAssignments({
          transfer,
          assignments: auto,
          pendingSlotCount: slotOptions.length,
          splitMode: false,
        });
        return;
      }

      const suggestedIds = nextFiles.map((file) => {
        const tooth = String(parseFilenameWithRules(file.name)?.tooth || "").trim();
        if (!tooth) return null;
        const matched = slotOptions.find(
          (slot) =>
            slot.tooth === tooth ||
            pendingSlots.some(
              (row) => row.id === slot.id && row.teeth.includes(tooth),
            ),
        );
        return matched?.id || null;
      });

      openWorkUploadDialog({
        mode: "prosthetic",
        transfer,
        files: nextFiles,
        slots: slotOptions,
        initialSlotIds: suggestedIds,
        splitMode: false,
      });
    },
    [
      cardActionBusyId,
      openWorkUploadDialog,
      preUploadFiles,
      resolveProstheticAssignments,
      submitProstheticAssignments,
      toast,
      workUploadBusy,
    ],
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
              skipJig: Boolean(productionRaw.skipJig),
              labDesignConfirmedAt: productionRaw.labDesignConfirmedAt
                ? String(productionRaw.labDesignConfirmedAt)
                : new Date().toISOString(),
              practiceDesignConfirmedAt: productionRaw.practiceDesignConfirmedAt
                ? String(productionRaw.practiceDesignConfirmedAt)
                : transfer.production?.practiceDesignConfirmedAt || null,
              abutmentProductionStartedAt: productionRaw.abutmentProductionStartedAt
                ? String(productionRaw.abutmentProductionStartedAt)
                : transfer.production?.abutmentProductionStartedAt || null,
              abutmentPastReady:
                productionRaw.abutmentPastReady != null
                  ? Boolean(productionRaw.abutmentPastReady)
                  : Boolean(transfer.production?.abutmentPastReady),
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
      if (practiceTransferAbutmentMachiningStarted(transfer)) {
        toast({
          title: "의뢰 수락 취소 불가",
          description:
            "어벗 가공이 시작된 의뢰는 수락 취소할 수 없습니다. 제조사가 준비 단계일 때만 가능합니다.",
          variant: "destructive",
        });
        return false;
      }

      const isAuto = String(transfer.matchingMode || "") === "auto";
      const canceledAt = new Date().toISOString();

      const releasePatch: Partial<ReceivedPracticeTransfer> = isAuto
        ? {
            isAccepted: false,
            isDownloaded: false,
            requestorDownloadedAt: null,
            requestorAcceptedAt: null,
            workCanceledAt: canceledAt,
            manufacturerStage: "자동매칭",
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
              releaseCount: Number(transfer.autoMatch?.releaseCount || 0) + 1,
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

      const markLocalMachiningStarted = () => {
        const productionPatch: ReceivedPracticeTransfer["production"] = {
          ...transfer.production,
          abutmentPastReady: true,
          abutmentProductionStartedAt:
            transfer.production?.abutmentProductionStartedAt ||
            new Date().toISOString(),
        };
        applyAcceptedLocalPatch(transfer, { production: productionPatch });
      };

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
          const code = String(body.code || "").trim();
          if (code === "abutment_machining_started") {
            markLocalMachiningStarted();
          }
          toast({
            title: "의뢰 수락 취소 불가",
            description: String(
              body.message ||
                "어벗 가공이 시작된 의뢰는 수락 취소할 수 없습니다.",
            ),
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

        applyAcceptedLocalPatch(
          transfer,
          isAuto && autoMatchRaw?.releaseCount != null
            ? {
                ...releasePatch,
                autoMatch: {
                  ...(releasePatch.autoMatch || {}),
                  releaseCount: Number(autoMatchRaw.releaseCount),
                  openPool:
                    autoMatchRaw.openPool != null
                      ? Boolean(autoMatchRaw.openPool)
                      : true,
                },
                manufacturerStage:
                  String(data.manufacturerStage || "").trim() ||
                  releasePatch.manufacturerStage,
              }
            : releasePatch,
        );
        void loadFirstPage({ silent: true });
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
    [ACTION_UI_MIN_MS, applyAcceptedLocalPatch, loadFirstPage, toast, token],
  );

  const markTransferReject = useCallback(
    async (transfer: ReceivedPracticeTransfer) => {
      if (!token) return false;
      const isOpenPool =
        transfer.matchingMode === "auto" && Boolean(transfer.autoMatch?.openPool);
      if (
        !isOpenPool &&
        (transfer.isAccepted || transfer.isDownloaded || transfer.requestorDownloadedAt)
      ) {
        toast({
          title: "거부 불가",
          description: "이미 수락한 의뢰는 거부할 수 없습니다. 작업취소를 이용해주세요.",
          variant: "destructive",
        });
        return false;
      }

      try {
        const [res] = await Promise.all([
          apiFetch<unknown>({
            path: `/api/practice/transfers/${encodeURIComponent(transfer.transferId)}/mark-reject`,
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
            title: "거부 실패",
            description: String(body.message || "의뢰 거부 중 오류가 발생했습니다."),
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
        const canceled = Boolean(data.canceled);
        const rejectedAt =
          data.labRejectedAt != null
            ? String(data.labRejectedAt)
            : new Date().toISOString();
        const workCanceledAt =
          data.workCanceledAt != null
            ? String(data.workCanceledAt)
            : !isOpenPool
              ? rejectedAt
              : transfer.workCanceledAt || null;

        applyAcceptedLocalPatch(transfer, {
          labRejected: true,
          labRejectedAt: rejectedAt,
          workCanceledAt,
          manufacturerStage: "거부",
          status: canceled ? "canceled" : transfer.status,
          autoMatch: transfer.autoMatch
            ? {
                ...transfer.autoMatch,
                declinedByMe: true,
                openPool:
                  transfer.matchingMode === "auto"
                    ? true
                    : transfer.autoMatch.openPool,
                claimActive: false,
                mine: false,
              }
            : transfer.matchingMode === "auto"
              ? {
                  declinedByMe: true,
                  openPool: true,
                  claimActive: false,
                  mine: false,
                  completed: false,
                }
              : transfer.autoMatch,
        });

        setDialogOpen(false);
        chatRoomResolveSeqRef.current += 1;
        setSelectedTransfer(null);
        setActiveChatRoom(null);
        setChatMessages([]);
        setChatDraft("");
        setChatReplyTo(null);
        chatUploads.clear();
        setChatError("");
        resetDownloads();

        toast({
          title: "의뢰 거부",
          description: isOpenPool
            ? "의뢰를 거부했습니다. 다른 기공소에 계속 공개됩니다."
            : "의뢰를 거부했습니다. 치과에 취소 상태로 전달됩니다.",
        });
        return true;
      } catch {
        toast({
          title: "거부 실패",
          description: "의뢰 거부 요청 중 오류가 발생했습니다.",
          variant: "destructive",
        });
        return false;
      }
    },
    [ACTION_UI_MIN_MS, applyAcceptedLocalPatch, chatUploads, resetDownloads, toast, token],
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
    if (!selectedTransfer || acceptBusy || releaseBusy || rejectBusy) return;
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
    rejectBusy,
    releaseBusy,
    resolveTransferChatRoom,
    selectedTransfer,
  ]);

  const handleRejectTransfer = useCallback(async () => {
    if (!selectedTransfer || rejectBusy || acceptBusy || releaseBusy) return;
    setRejectBusy(true);
    try {
      await markTransferReject(selectedTransfer);
    } finally {
      setRejectBusy(false);
    }
  }, [
    acceptBusy,
    markTransferReject,
    rejectBusy,
    releaseBusy,
    selectedTransfer,
  ]);

  const handleReleaseTransfer = useCallback(async () => {
    if (!selectedTransfer || releaseBusy || acceptBusy || rejectBusy) return;
    setReleaseBusy(true);
    try {
      await markTransferRelease(selectedTransfer);
    } finally {
      setReleaseBusy(false);
    }
  }, [acceptBusy, markTransferRelease, rejectBusy, releaseBusy, selectedTransfer]);

  const pickDesignAbutmentFiles = useCallback((): Promise<File[]> => {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".stl,model/stl,application/sla";
      input.multiple = true;
      input.style.display = "none";
      let settled = false;
      const finish = (files: File[]) => {
        if (settled) return;
        settled = true;
        window.removeEventListener("focus", onWindowFocus);
        input.removeEventListener("change", onChange);
        input.remove();
        resolve(files);
      };
      const onChange = () => {
        finish(Array.from(input.files || []));
      };
      const onWindowFocus = () => {
        window.setTimeout(() => {
          if (!settled) finish(Array.from(input.files || []));
        }, 400);
      };
      input.addEventListener("change", onChange);
      window.addEventListener("focus", onWindowFocus);
      document.body.appendChild(input);
      input.click();
    });
  }, []);

  const clearDesignConfirmState = useCallback(() => {
    setDesignConfirmOpen(false);
    setDesignConfirmBusy(false);
    setDesignConfirmQueue([]);
    setDesignConfirmQueueIndex(0);
    setDesignConfirmTransfer(null);
    setDesignConfirmPendingMetas([]);
  }, []);

  const buildDesignConfirmDefaults = useCallback(
    (
      transfer: ReceivedPracticeTransfer,
      requestCaseInfos?: Record<string, unknown> | null,
      toothOverride?: string,
    ): AbutmentDesignConfirmCaseInfos => {
      const toothRows = parseToothWorks(transfer.toothWorksSummary || "");
      const overrideTooth = String(toothOverride || "").trim();
      const matchedToothRow =
        (overrideTooth
          ? toothRows.find(
              (row) => String(row.toothNumber || "").trim() === overrideTooth,
            )
          : null) ||
        toothRows.find((row) => Boolean(row.customAbutment)) ||
        toothRows[0];

      // 환자/치과/임플란트: 치과 전송 정보 우선. 구강스캔·어벗 파일명 AI 추정은 쓰지 않는다.
      const practicePatient = resolvePracticeTransferListPatientName({
        rawTransferMemo: transfer.rawTransferMemo,
        transferMemo: transfer.transferMemo,
        files: [],
      });
      const practiceClinic = String(transfer.practice?.businessName || "").trim();
      const requestClinic = String(requestCaseInfos?.clinicName || "").trim();

      return {
        // Request.clinicName = 치과 BusinessAnchor (파일명 AI 아님)
        clinicName: requestClinic || practiceClinic,
        patientName: practicePatient,
        tooth:
          overrideTooth ||
          String(matchedToothRow?.toothNumber || "").trim() ||
          String(requestCaseInfos?.tooth || "").trim(),
        implantManufacturer:
          String(matchedToothRow?.implantManufacturer || "").trim() ||
          String(requestCaseInfos?.implantManufacturer || "").trim(),
        implantBrand:
          String(matchedToothRow?.implantBrand || "").trim() ||
          String(requestCaseInfos?.implantBrand || "").trim(),
        implantFamily:
          String(matchedToothRow?.implantFamily || "").trim() ||
          String(requestCaseInfos?.implantFamily || "").trim(),
        implantType:
          String(matchedToothRow?.implantType || "").trim() ||
          String(requestCaseInfos?.implantType || "").trim(),
        retentionGroove: "",
      };
    },
    [],
  );

  const fetchRequestCaseInfos = useCallback(
    async (requestId: string) => {
      if (!token || !requestId) {
        return {
          caseInfos: null as Record<string, unknown> | null,
          designCompletedAt: "",
        };
      }
      try {
        const res = await apiFetch<{
          data?: {
            caseInfos?: Record<string, unknown>;
            designCompletedAt?: string | null;
          };
          caseInfos?: Record<string, unknown>;
          designCompletedAt?: string | null;
        }>({
          path: `/api/requests/${encodeURIComponent(requestId)}`,
          method: "GET",
          token,
        });
        if (!res.ok) {
          return { caseInfos: null, designCompletedAt: "" };
        }
        const body = (res.data || {}) as {
          data?: {
            caseInfos?: Record<string, unknown>;
            designCompletedAt?: string | null;
          };
          caseInfos?: Record<string, unknown>;
          designCompletedAt?: string | null;
        };
        const data = body.data || body;
        return {
          caseInfos:
            data?.caseInfos && typeof data.caseInfos === "object"
              ? data.caseInfos
              : null,
          designCompletedAt: String(data?.designCompletedAt || "").trim(),
        };
      } catch {
        return { caseInfos: null, designCompletedAt: "" };
      }
    },
    [token],
  );

  const resolveAbutmentDesignTeethFromFiles = useCallback(
    async (files: File[]): Promise<string[]> => {
      const ruleTeeth = files.map((file) =>
        String(parseFilenameWithRules(file.name)?.tooth || "").trim(),
      );
      if (files.length <= 1) return ruleTeeth;

      // 다파일: 순서 fallback은 치아 꼬임 가능 → 파일명 AI로 치아번호 확인
      const teeth = [...ruleTeeth];
      const filenamesForAi: string[] = [];
      const indicesForAi: number[] = [];

      files.forEach((file, idx) => {
        const cacheKey = toFilenameAiCacheKey(file.name, file.size);
        const cachedTooth = String(getFilenameAiCache(cacheKey)?.tooth || "").trim();
        if (cachedTooth) {
          teeth[idx] = cachedTooth;
          return;
        }
        filenamesForAi.push(file.name);
        indicesForAi.push(idx);
      });

      if (!filenamesForAi.length || !token) return teeth;

      try {
        const res = await apiFetch<{
          success?: boolean;
          data?: Array<{
            filename?: string | null;
            tooth?: string | null;
            clinicName?: string | null;
            patientName?: string | null;
          }>;
          provider?: string;
        }>({
          path: "/api/ai/parse-filenames",
          method: "POST",
          token,
          jsonBody: { filenames: filenamesForAi },
        });
        if (!res.ok) return teeth;

        const body =
          res.data && typeof res.data === "object"
            ? (res.data as Record<string, unknown>)
            : {};
        if (String(body.provider || "") === "fallback-quota-exceeded") {
          return teeth;
        }

        const items = Array.isArray(body.data)
          ? body.data
          : Array.isArray(res.data)
            ? res.data
            : [];
        if (!items.length) return teeth;

        const queueByFilename = new Map<string, number[]>();
        filenamesForAi.forEach((name, idx) => {
          const q = queueByFilename.get(name) || [];
          q.push(idx);
          queueByFilename.set(name, q);
        });

        items.forEach((item) => {
          if (!item || typeof item !== "object") return;
          const row = item as {
            filename?: string | null;
            tooth?: string | null;
            clinicName?: string | null;
            patientName?: string | null;
          };
          const queue = queueByFilename.get(String(row.filename || ""));
          if (!queue?.length) return;
          const aiIdx = queue.shift() as number;
          const fileIdx = indicesForAi[aiIdx];
          if (fileIdx == null) return;
          const aiTooth = String(row.tooth || "").trim();
          if (aiTooth) teeth[fileIdx] = aiTooth;

          const file = files[fileIdx];
          if (!file) return;
          setFilenameAiCache(toFilenameAiCacheKey(file.name, file.size), {
            clinicName: String(row.clinicName || "").trim(),
            patientName: String(row.patientName || "").trim(),
            tooth: aiTooth || teeth[fileIdx] || "",
          });
        });
      } catch {
        // 룰 파싱 결과 유지
      }

      return teeth;
    },
    [token],
  );

  /** 어벗: 지정 다이얼로그 없이 3D 확인 모달에서 치아·임플란트 확정 */
  const openAbutmentDesignConfirmQueue = useCallback(
    async (
      transfer: ReceivedPracticeTransfer,
      files: File[],
      pendingMetas: AbutmentPendingMeta[],
    ) => {
      if (!files.length || !pendingMetas.length) return;
      preUploadFiles(files);
      const fileTeeth = await resolveAbutmentDesignTeethFromFiles(files);
      const usedRequestIds = new Set<string>();
      const queue: Array<{
        file: File;
        requestId: string;
        caseInfos: AbutmentDesignConfirmCaseInfos;
      }> = [];

      for (let i = 0; i < files.length; i += 1) {
        if (queue.length >= pendingMetas.length) break;
        const file = files[i];
        const parsedTooth = String(fileTeeth[i] || "").trim();
        const byTooth = parsedTooth
          ? pendingMetas.find(
              (meta) =>
                !usedRequestIds.has(meta.requestId) &&
                meta.tooth === parsedTooth,
            )
          : null;
        // 파일명 치아 없으면 남은 pending 중 첫 치아(이미 올린 치아는 beginDesign에서 제외됨)
        const meta =
          byTooth ||
          pendingMetas.find((row) => !usedRequestIds.has(row.requestId));
        if (!meta) continue;
        usedRequestIds.add(meta.requestId);
        queue.push({
          file,
          requestId: meta.requestId,
          caseInfos: buildDesignConfirmDefaults(
            transfer,
            meta.caseInfos,
            meta.tooth || parsedTooth,
          ),
        });
      }

      if (queue.length === 0) {
        toast({
          title: "업로드 대상 없음",
          description: "연결할 어벗 의뢰를 찾지 못했습니다.",
          variant: "destructive",
        });
        return;
      }

      setDesignConfirmPendingMetas(pendingMetas);
      setDesignConfirmTransfer(transfer);
      setDesignConfirmQueue(queue);
      setDesignConfirmQueueIndex(0);
      setDesignConfirmOpen(true);
    },
    [
      buildDesignConfirmDefaults,
      preUploadFiles,
      resolveAbutmentDesignTeethFromFiles,
      toast,
    ],
  );

  const beginDesignUploadWithFiles = useCallback(
    async (transfer: ReceivedPracticeTransfer, files: File[]) => {
      if (!token) return;
      const id = String(transfer.transferId || transfer._id || "").trim();
      if (!id || cardActionBusyId || designConfirmBusy || workUploadBusy) return;

      const stlFiles = Array.from(files || []).filter(
        (file) => getPracticeTransferFileExtension(file.name) === ".stl",
      );
      if (!stlFiles.length) {
        toast({
          title: "STL 필요",
          description: "어벗디자인은 STL 파일만 업로드할 수 있습니다.",
          variant: "destructive",
        });
        return;
      }

      let relatedIds = (transfer.production?.relatedRequestIds || [])
        .map((raw) => String(raw || "").trim())
        .filter(Boolean);
      let workingTransfer = transfer;

      // 낙관적 수락 직후: API가 relatedRequestIds를 아직 로컬에 안 심었을 수 있음 → idempotent 재조회
      if (relatedIds.length === 0) {
        try {
          const refreshRes = await apiFetch<unknown>({
            path: `/api/practice/transfers/${encodeURIComponent(id)}/mark-accepted`,
            method: "POST",
            token,
          });
          if (refreshRes.ok) {
            const body =
              refreshRes.data && typeof refreshRes.data === "object"
                ? (refreshRes.data as Record<string, unknown>)
                : {};
            const data =
              body.data && typeof body.data === "object"
                ? (body.data as Record<string, unknown>)
                : body;
            relatedIds = pickRelatedRequestIdsFromPayload(data);
            if (relatedIds.length > 0) {
              const productionRaw =
                data.production && typeof data.production === "object"
                  ? (data.production as Record<string, unknown>)
                  : null;
              const productionPatch = mergeProductionRelatedRequestIds(
                transfer.production,
                relatedIds,
                productionRaw,
              );
              applyAcceptedLocalPatch(transfer, { production: productionPatch });
              workingTransfer = { ...transfer, production: productionPatch };
            }
          }
        } catch {
          // fall through to toast
        }
      }

      if (relatedIds.length === 0) {
        toast({
          title: "디자인 의뢰 준비 중",
          description:
            "구강스캔이 확보되면 디자인 큐에 의뢰가 생성됩니다. 스캔 업로드 후 다시 시도해주세요.",
          variant: "destructive",
        });
        return;
      }

      const existingTeeth = new Set(
        (workingTransfer.production?.designFiles || [])
          .map((row) => String(row.tooth || "").trim())
          .filter(Boolean),
      );
      const designFileCount = Number(
        workingTransfer.production?.designFileCount ||
          workingTransfer.production?.designFiles?.length ||
          0,
      );
      const caTeethOrdered = parseToothWorks(workingTransfer.toothWorksSummary || "")
        .filter((row) => Boolean(row.customAbutment))
        .map((row) => String(row.toothNumber || "").trim())
        .filter(Boolean);

      const requestMetas = await Promise.all(
        relatedIds.map(async (requestId, idx) => {
          const meta = await fetchRequestCaseInfos(requestId);
          const fromRequest = String(meta.caseInfos?.tooth || "").trim();
          const tooth = fromRequest || caTeethOrdered[idx] || "";
          return {
            requestId,
            tooth,
            caseInfos: meta.caseInfos,
            designCompletedAt: meta.designCompletedAt,
          };
        }),
      );

      // 치아 중복 보강: Request에 tooth가 비어 있으면 치식 CA 순서로 채움(이미 쓴 치아 제외)
      const usedEnrichTeeth = new Set(
        requestMetas.map((row) => String(row.tooth || "").trim()).filter(Boolean),
      );
      const enrichedMetas = requestMetas.map((meta, idx) => {
        if (String(meta.tooth || "").trim()) return meta;
        const fallback =
          caTeethOrdered.find((tooth) => !usedEnrichTeeth.has(tooth)) ||
          caTeethOrdered[idx] ||
          "";
        if (fallback) usedEnrichTeeth.add(fallback);
        return { ...meta, tooth: fallback };
      });

      let pendingMetas = enrichedMetas.filter((meta) => {
        if (meta.designCompletedAt) return false;
        if (meta.tooth && existingTeeth.has(meta.tooth)) return false;
        return true;
      });

      // designFiles에 치아가 비어 있는 경우: 개수만큼 앞에서 제외
      const assignedDesignCount = existingTeeth.size;
      const orphanDesignCount = Math.max(0, designFileCount - assignedDesignCount);
      if (orphanDesignCount > 0 && pendingMetas.length > 0) {
        pendingMetas = pendingMetas.slice(orphanDesignCount);
      }

      if (pendingMetas.length === 0) {
        toast({
          title: "어벗디자인 완료",
          description: "이미 모든 치아의 어벗디자인이 업로드되어 있습니다.",
        });
        return;
      }

      if (stlFiles.length > pendingMetas.length) {
        toast({
          title: "파일 수 초과",
          description: `남은 어벗 ${pendingMetas.length}개보다 파일이 많습니다. ${pendingMetas.length}개만 선택해주세요.`,
          variant: "destructive",
        });
        return;
      }

      if (stlFiles.length < pendingMetas.length) {
        preUploadFiles(stlFiles);
        setSplitAskState({
          mode: "abutment",
          transfer: workingTransfer,
          files: stlFiles,
          pendingCount: pendingMetas.length,
          abutmentPending: pendingMetas,
        });
        return;
      }

      await openAbutmentDesignConfirmQueue(
        workingTransfer,
        stlFiles,
        pendingMetas,
      );
    },
    [
      applyAcceptedLocalPatch,
      cardActionBusyId,
      designConfirmBusy,
      fetchRequestCaseInfos,
      mergeProductionRelatedRequestIds,
      openAbutmentDesignConfirmQueue,
      pickRelatedRequestIdsFromPayload,
      preUploadFiles,
      toast,
      token,
      workUploadBusy,
    ],
  );

  const handleCardDesignUpload = useCallback(
    async (transfer: ReceivedPracticeTransfer, event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const id = String(transfer.transferId || transfer._id || "").trim();
      if (!id || cardActionBusyId || designConfirmBusy) return;
      const pickedFiles = await pickDesignAbutmentFiles();
      if (!pickedFiles.length) return;
      await beginDesignUploadWithFiles(transfer, pickedFiles);
    },
    [
      beginDesignUploadWithFiles,
      cardActionBusyId,
      designConfirmBusy,
      pickDesignAbutmentFiles,
    ],
  );

  const handleDesignConfirmSubmit = useCallback(
    async (caseInfos: AbutmentDesignConfirmCaseInfos) => {
      if (!token || !designConfirmFile || !designConfirmTransfer) return;
      const transfer = designConfirmTransfer;
      const file = designConfirmFile;
      const queueTotal = designConfirmQueue.length;
      const queueIndex = designConfirmQueueIndex;
      const selectedTooth = String(caseInfos.tooth || "").trim();
      const reservedIds = new Set(
        designConfirmQueue
          .map((row, idx) =>
            idx === queueIndex ? "" : String(row.requestId || "").trim(),
          )
          .filter(Boolean),
      );
      const matchedMeta =
        (selectedTooth
          ? designConfirmPendingMetas.find(
              (meta) =>
                !reservedIds.has(meta.requestId) &&
                String(meta.tooth || "").trim() === selectedTooth,
            )
          : null) ||
        designConfirmPendingMetas.find(
          (meta) =>
            !reservedIds.has(meta.requestId) &&
            meta.requestId === designConfirmRequestId,
        ) ||
        designConfirmPendingMetas.find(
          (meta) => !reservedIds.has(meta.requestId),
        );
      const requestId = String(
        matchedMeta?.requestId || designConfirmRequestId || "",
      ).trim();
      if (!requestId) return;

      // 사용자가 치아를 바꿨으면 큐 항목도 맞춘다
      if (
        matchedMeta &&
        (designConfirmRequestId !== matchedMeta.requestId ||
          String(designConfirmCaseInfos?.tooth || "").trim() !== selectedTooth)
      ) {
        setDesignConfirmQueue((prev) =>
          prev.map((row, idx) =>
            idx === queueIndex
              ? {
                  ...row,
                  requestId: matchedMeta.requestId,
                  caseInfos: {
                    ...row.caseInfos,
                    ...caseInfos,
                    tooth: selectedTooth || matchedMeta.tooth,
                  },
                }
              : row,
          ),
        );
      }

      setDesignConfirmBusy(true);
      setCardActionBusyId(String(transfer.transferId || transfer._id || ""));
      try {
        const uploaded = await ensureFilesUploaded([file]);
        const temp = uploaded?.[0];
        const s3Key = String(temp?.key || "").trim();
        if (!s3Key) {
          throw new Error("파일 업로드에 실패했습니다.");
        }

        const res = await apiFetch<{
          success?: boolean;
          message?: string;
          data?: {
            productionStarted?: boolean;
            message?: string;
          };
        }>({
          path: `/api/requests/${encodeURIComponent(requestId)}/design-handoff`,
          method: "POST",
          token,
          jsonBody: {
            file: {
              originalName: temp?.originalName || file.name,
              size: temp?.size ?? file.size,
              mimetype: temp?.mimetype || file.type || "application/octet-stream",
              s3Key,
              s3Url: temp?.location || "",
            },
            retentionGroove: caseInfos.retentionGroove,
            caseInfos: {
              clinicName: caseInfos.clinicName,
              patientName: caseInfos.patientName,
              tooth: caseInfos.tooth,
              implantManufacturer: caseInfos.implantManufacturer,
              implantBrand: caseInfos.implantBrand,
              implantFamily: caseInfos.implantFamily,
              implantType: caseInfos.implantType,
              retentionGroove: caseInfos.retentionGroove,
            },
          },
        });
        if (!res.ok) {
          const body =
            res.data && typeof res.data === "object"
              ? (res.data as Record<string, unknown>)
              : {};
          throw new Error(
            String(body.message || "어벗디자인 파일 업로드에 실패했습니다."),
          );
        }

        const nowIso = new Date().toISOString();
        const uploadedDesignFile: ReceivedPracticeFile = {
          id: `design-local-${Date.now()}-${queueIndex}`,
          patientName: String(caseInfos.patientName || "").trim(),
          tooth: String(caseInfos.tooth || "").trim(),
          originalName: String(temp?.originalName || file.name || "").trim(),
          mimetype: String(
            temp?.mimetype || file.type || "application/octet-stream",
          ).trim(),
          size: Number(temp?.size ?? file.size ?? 0),
          s3Key,
        };
        const prevDesignFiles = Array.isArray(transfer.production?.designFiles)
          ? transfer.production.designFiles
          : [];
        const nextDesignFiles = [
          ...prevDesignFiles.filter((row) => row.s3Key !== s3Key),
          uploadedDesignFile,
        ];
        const productionPatch: ReceivedPracticeTransfer["production"] = {
          ...transfer.production,
          designFileCount: nextDesignFiles.length,
          designFiles: nextDesignFiles,
          designReadyAt: transfer.production?.designReadyAt || nowIso,
          labDesignConfirmedAt:
            transfer.production?.labDesignConfirmedAt || nowIso,
          skipDesignConfirm: true,
          abutmentProductionStartedAt: null,
          abutmentPastReady: false,
        };
        const patchedTransfer: ReceivedPracticeTransfer = {
          ...transfer,
          production: productionPatch,
        };

        setTransfers((prev) =>
          prev.map((row) =>
            row._id === transfer._id || row.transferId === transfer.transferId
              ? patchedTransfer
              : row,
          ),
        );
        setSelectedTransfer((prev) =>
          prev &&
          (prev._id === transfer._id || prev.transferId === transfer.transferId)
            ? patchedTransfer
            : prev,
        );
        setDesignConfirmTransfer(patchedTransfer);

        const nextIndex = queueIndex + 1;
        if (nextIndex < queueTotal) {
          setDesignConfirmQueueIndex(nextIndex);
          toast({
            title: `어벗디자인 업로드 (${nextIndex}/${queueTotal})`,
            description: "다음 파일을 확인해주세요.",
          });
          return;
        }

        clearDesignConfirmState();
        toast({
          title: "어벗디자인 업로드",
          description:
            queueTotal > 1
              ? `${queueTotal}개 완성 어벗 STL이 업로드되어 제조사 준비 큐에 등록되었습니다. 준비 단계에서는 취소·재업로드할 수 있습니다.`
              : "완성 어벗 STL이 업로드되어 제조사 준비 큐에 등록되었습니다. 준비 단계에서는 취소·재업로드할 수 있습니다.",
        });
      } catch (error) {
        toast({
          title: "업로드 실패",
          description:
            error instanceof Error
              ? error.message
              : "어벗디자인 파일 업로드 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      } finally {
        setDesignConfirmBusy(false);
        setCardActionBusyId("");
      }
    },
    [
      clearDesignConfirmState,
      designConfirmCaseInfos?.tooth,
      designConfirmFile,
      designConfirmPendingMetas,
      designConfirmQueue,
      designConfirmQueueIndex,
      designConfirmRequestId,
      designConfirmTransfer,
      toast,
      token,
      ensureFilesUploaded,
    ],
  );

  const handleSplitAskConfirm = useCallback(() => {
    const ask = splitAskState;
    setSplitAskState(null);
    if (!ask) return;

    if (ask.mode === "abutment") {
      void openAbutmentDesignConfirmQueue(
        ask.transfer,
        ask.files,
        ask.abutmentPending || [],
      );
      return;
    }

    const slots = ask.prostheticSlots || [];
    const pendingSlots = listPracticeTransferPendingProstheticSlots(ask.transfer);
    const auto = resolveProstheticAssignments(ask.files, slots, pendingSlots);
    if (auto) {
      void submitProstheticAssignments({
        transfer: ask.transfer,
        assignments: auto,
        pendingSlotCount: ask.pendingCount,
        splitMode: true,
      });
      return;
    }

    const suggestedIds = ask.files.map((file) => {
      const tooth = String(parseFilenameWithRules(file.name)?.tooth || "").trim();
      if (!tooth) return null;
      return slots.find((slot) => slot.tooth === tooth)?.id || null;
    });
    openWorkUploadDialog({
      mode: "prosthetic",
      transfer: ask.transfer,
      files: ask.files,
      slots,
      initialSlotIds: suggestedIds,
      splitMode: true,
    });
  }, [
    openAbutmentDesignConfirmQueue,
    openWorkUploadDialog,
    resolveProstheticAssignments,
    splitAskState,
    submitProstheticAssignments,
  ]);

  const handleSplitAskDecline = useCallback(() => {
    const ask = splitAskState;
    setSplitAskState(null);
    if (!ask) return;
    toast({
      title: ask.mode === "abutment" ? "어벗 전체 업로드" : "보철 전체 업로드",
      description:
        ask.mode === "abutment"
          ? `남은 어벗 ${ask.pendingCount}개에 맞춰 STL을 모두 선택한 뒤 다시 올려주세요.`
          : `남은 보철 ${ask.pendingCount}개에 맞춰 파일을 모두 선택한 뒤 다시 올려주세요.`,
    });
  }, [splitAskState, toast]);

  const handleWorkUploadConfirm = useCallback(
    async (assignments: LabReceiveWorkUploadAssignment[]) => {
      const state = workUploadState;
      if (!state || workUploadBusy || state.mode !== "prosthetic") return;
      await submitProstheticAssignments({
        transfer: state.transfer,
        assignments,
        pendingSlotCount: state.slots.length,
        splitMode: Boolean(state.splitMode),
      });
    },
    [submitProstheticAssignments, workUploadBusy, workUploadState],
  );

  const handleCardAbutmentProductionCancel = useCallback(
    async (transfer: ReceivedPracticeTransfer, event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!token) return;
      const id = String(transfer.transferId || transfer._id || "").trim();
      if (!id || cardActionBusyId) return;

      const relatedIds = (transfer.production?.relatedRequestIds || [])
        .map((raw) => String(raw || "").trim())
        .filter(Boolean);
      if (relatedIds.length === 0) {
        toast({
          title: "디자인 의뢰 없음",
          description: "연결된 제조 의뢰를 찾지 못했습니다.",
          variant: "destructive",
        });
        return;
      }

      setCardActionBusyId(id);
      try {
        const requestId = relatedIds[0];
        const cancelRes = await apiFetch<{
          success?: boolean;
          message?: string;
        }>({
          path: `/api/requests/${encodeURIComponent(requestId)}/design-handoff/cancel`,
          method: "POST",
          token,
        });
        if (!cancelRes.ok) {
          const body =
            cancelRes.data && typeof cancelRes.data === "object"
              ? (cancelRes.data as Record<string, unknown>)
              : {};
          const code = String(body.code || "").trim();
          if (code === "manufacturer_not_ready") {
            applyAcceptedLocalPatch(transfer, {
              production: {
                ...transfer.production,
                abutmentPastReady: true,
                abutmentProductionStartedAt:
                  transfer.production?.abutmentProductionStartedAt ||
                  new Date().toISOString(),
              },
            });
          }
          throw new Error(
            String(
              body.message ||
                "제조사가 준비 단계일 때만 생산을 취소할 수 있습니다.",
            ),
          );
        }

        // 디자인 미러 + 작업완료/생산진행 스테이지 클리어 → 뱃지「의뢰수락」, 업로드 CTA 재표시.
        // billing/escrow는 서버도 유지(이미 정산된 건은 원장 되돌리지 않음).
        const patched = buildProductionCancelLocalPatch(transfer);
        setTransfers((prev) =>
          prev.map((row) =>
            row._id === transfer._id || row.transferId === transfer.transferId
              ? patched
              : row,
          ),
        );
        setSelectedTransfer((prev) =>
          prev &&
          (prev._id === transfer._id || prev.transferId === transfer.transferId)
            ? patched
            : prev,
        );

        toast({
          title: "작업 단계 되돌림",
          description:
            "발송(작업완료)을 의뢰수락으로 되돌렸습니다. 어벗·보철을 다시 올리거나 작업 취소할 수 있습니다.",
        });
      } catch (error) {
        toast({
          title: "작업 단계 되돌림 실패",
          description:
            error instanceof Error
              ? error.message
              : "작업 단계를 되돌리는 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      } finally {
        setCardActionBusyId("");
      }
    },
    [applyAcceptedLocalPatch, buildProductionCancelLocalPatch, cardActionBusyId, toast, token],
  );

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
      if (practiceTransferNeedsMoreAbutmentDesigns(transfer)) {
        void beginDesignUploadWithFiles(transfer, files);
        return;
      }
      beginCompleteWithFiles(transfer, files);
    },
    [beginCompleteWithFiles, beginDesignUploadWithFiles],
  );

  const handleCardRelease = useCallback(
    async (transfer: ReceivedPracticeTransfer, event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const id = String(transfer.transferId || transfer._id || "").trim();
      if (!id || cardActionBusyIdRef.current) return;
      cardActionBusyIdRef.current = id;
      setCardActionBusyId(id);
      try {
        await markTransferRelease(transfer);
      } finally {
        cardActionBusyIdRef.current = "";
        setCardActionBusyId("");
      }
    },
    [markTransferRelease],
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
    [chatUploads, markTransferRead, resolveTransferChatRoom, setChatMessages, token],
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

  const handleAttachChatFiles = useCallback((nextFiles: File[]) => {
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
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <PeriodFilter
            value={period}
            onChange={setPeriod}
            presets={["thisMonth", "lastMonth"]}
            className="shrink-0"
          />
          <RequestSettingsToolbar
            designSoftwareLabel={String(designSoftwareValue || "").trim()}
            onOpenDesignSoftwareModal={openDesignSoftwareModal}
            anodizingEnabled={anodizingEnabled}
            anodizingSaving={anodizingSaving}
            onToggleAnodizing={handleToggleAnodizing}
          />
        </div>
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
          onClick={() => setStatusFilter((prev) => (prev === "거부" ? "all" : "거부"))}
          aria-pressed={statusFilter === "거부"}
        >
          <Badge
            variant="outline"
            className={cn(
              "cursor-pointer",
              statusFilter === "거부"
                ? "border-primary/70 bg-primary-soft text-primary-strong"
                : "hover:bg-muted/40",
            )}
          >
            거부 {statusCounts.rejected}건
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
            const displayStatus = getTransferDisplayStatus(transfer);
            const isRejectedCard = displayStatus === "거부";
            const dimRejectedCard = isRejectedCard && statusFilter !== "거부";
            const cardId = String(transfer.transferId || transfer._id || "").trim();
            const cardBusy = Boolean(cardActionBusyId) && cardActionBusyId === cardId;

            return (
              <PracticeTransferLabReceiveCard
                key={transfer._id || transfer.transferId}
                transfer={transfer}
                chatUnreadCount={chatUnreadCount}
                cardBusy={cardBusy}
                designConfirmBusy={
                  Boolean(designConfirmBusyId) && designConfirmBusyId === cardId
                }
                dimRejected={dimRejectedCard}
                designSoftwareLabel={String(designSoftwareValue || "").trim()}
                anodizingEnabled={anodizingEnabled}
                onOpen={() => {
                  void openTransferDialog(transfer);
                }}
                onDesignUpload={(event) =>
                  void handleCardDesignUpload(transfer, event)
                }
                onAbutmentProductionCancel={(event) =>
                  void handleCardAbutmentProductionCancel(transfer, event)
                }
                onComplete={(event) => handleCardComplete(transfer, event)}
                onRelease={(event) => void handleCardRelease(transfer, event)}
                onDesignConfirm={() => {
                  void confirmAbutmentDesign(transfer);
                }}
                onDropFiles={(files) => handleCardDropFiles(transfer, files)}
              />
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
      <DesignSoftwareSettingsDialog
        open={requestSettingsModalOpen}
        onOpenChange={handleRequestSettingsModalOpenChange}
        mode={designSoftwareMode}
        onModeChange={setDesignSoftwareMode}
        customValue={customDesignSoftware}
        onCustomValueChange={setCustomDesignSoftware}
        saving={designSoftwareSaving}
        onSave={() => {
          void handleSaveDesignSoftware();
        }}
        forceRequired={requestSettingsForceRequired}
        description={requestSettingsDialogDescription}
        showAnodizing
        anodizingEnabled={modalAnodizingEnabled}
        onAnodizingChange={setModalAnodizingEnabled}
      />
      <AbutmentDesignConfirmDialog
        key={`${designConfirmRequestId}:${designConfirmQueueIndex}`}
        open={designConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !designConfirmBusy) clearDesignConfirmState();
          else setDesignConfirmOpen(open);
        }}
        file={designConfirmFile}
        initialCaseInfos={designConfirmCaseInfos}
        defaultRetentionGroove={retentionGrooveDefault}
        onRetentionGrooveAccountSave={saveRetentionGroove}
        connections={connections}
        confirming={designConfirmBusy}
        teethOptions={designConfirmTeethOptions}
        queueCurrent={
          designConfirmQueue.length > 0 ? designConfirmQueueIndex + 1 : undefined
        }
        queueTotal={
          designConfirmQueue.length > 0 ? designConfirmQueue.length : undefined
        }
        onConfirm={handleDesignConfirmSubmit}
        onCancel={clearDesignConfirmState}
      />
      <LabReceiveWorkUploadDialog
        open={Boolean(workUploadState)}
        onOpenChange={(open) => {
          if (!open && !workUploadBusy) setWorkUploadState(null);
        }}
        mode="prosthetic"
        files={workUploadState?.files || []}
        slots={workUploadState?.slots || []}
        initialSlotIds={workUploadState?.initialSlotIds}
        uploadProgress={uploadProgress}
        submitting={workUploadBusy}
        splitMode={Boolean(workUploadState?.splitMode)}
        onConfirm={handleWorkUploadConfirm}
      />
      <AlertDialog
        open={Boolean(splitAskState)}
        onOpenChange={(open) => {
          if (!open) setSplitAskState(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>일부만 올리시나요?</AlertDialogTitle>
            <AlertDialogDescription>
              {splitAskState
                ? splitAskState.mode === "abutment"
                  ? `남은 어벗은 ${splitAskState.pendingCount}개인데 파일은 ${splitAskState.files.length}개입니다. 작업된 것만 먼저 올리고 나머지는 나중에 올릴 수 있습니다.`
                  : `남은 보철은 ${splitAskState.pendingCount}개인데 파일은 ${splitAskState.files.length}개입니다. 작업된 것만 먼저 저장하고 나머지는 나중에 올릴 수 있습니다.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleSplitAskDecline}>
              모두 올리기
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleSplitAskConfirm}>
              일부만 올리기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
              <RequestSettingsToolbar
                designSoftwareLabel={String(designSoftwareValue || "").trim()}
                onOpenDesignSoftwareModal={openDesignSoftwareModal}
                anodizingEnabled={anodizingEnabled}
                anodizingSaving={anodizingSaving}
                onToggleAnodizing={handleToggleAnodizing}
              />
            </div>
            <DesignQueueSection listMode={designQueueListMode} />
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
                  <DesignQueueSection listMode={designQueueListMode} />
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
        authToken={token}
        chatHeaderAction={
          selectedTransfer?.practiceBusinessAnchorId ? (
            <LabPracticeFeeSurchargeControl
              practiceAnchorId={selectedTransfer.practiceBusinessAnchorId}
              multiplier={selectedTransfer.labFeeMultiplier}
              size="sm"
              buttonLabel="치과 평가"
              onChanged={(next) => {
                // live 설정만 갱신. 해당 의뢰 feeQuote(스냅샷)는 바꾸지 않는다.
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
          { label: "치과도착일", value: selectedTransfer?.arrivalDate || "-" },
          ...(selectedTransferWorkPeriodSummary
            ? [selectedTransferWorkPeriodSummary]
            : []),
          {
            label: "어벗디자인",
            value: `${Number(selectedTransfer?.production?.designFileCount || selectedTransfer?.production?.designFiles?.length || 0)}개`,
          },
          {
            label: "보철물",
            value: `${Number(selectedTransfer?.resultFileCount || selectedTransfer?.resultFiles?.length || 0)}개`,
          },
        ] satisfies PracticeTransferDialogSummaryItem[]}
        memo={selectedTransferDisplayMemo}
        toothWorks={selectedTransferToothWorks}
        toothWorksKey={selectedTransfer?.transferId || "requestor-transfer"}
        feeQuote={selectedTransfer?.feeQuote || null}
        skipJig={Boolean(selectedTransfer?.production?.skipJig)}
        feeViewer="lab"
        labEffectiveStars={
          selectedTransfer?.labRatingSummary?.effectiveStars ??
          selectedTransfer?.starDowngrade?.labEffectiveStars ??
          null
        }
        filesLabel="의뢰 파일 (구강 스캔)"
        files={
          (selectedTransfer?.files || []).map((file) => ({
            id: file.id,
            fileName: file.originalName,
            size: Number(file.size || 0),
            s3Key: String(file.s3Key || "").trim(),
          })) satisfies PracticeTransferDialogFileItem[]
        }
        oralScanAttachMode={(() => {
          if (!selectedTransfer) return null;
          const hasCa = transferHasCustomAbutment(selectedTransfer);
          const fileCount =
            selectedTransfer.files?.length || selectedTransfer.fileCount || 0;
          if (!hasCa || fileCount > 0) return null;
          // 지정: 스캔 없이 수락. 자동매칭만 치과 스캔 필수 안내.
          if (String(selectedTransfer.matchingMode || "").trim() !== "auto") {
            return null;
          }
          const accepted =
            selectedTransfer.isAccepted ||
            selectedTransfer.isDownloaded ||
            selectedTransfer.requestorDownloadedAt;
          return accepted ? null : "practice_required";
        })()}
        requestFilesDownloadLocked={false}
        designFiles={
          (selectedTransfer?.production?.designFiles || []).map((file) => ({
            id: file.id,
            fileName: file.originalName,
            size: Number(file.size || 0),
            s3Key: String(file.s3Key || "").trim(),
          })) satisfies PracticeTransferDialogFileItem[]
        }
        resultFilesLabel="보철물"
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
        abutmentMachiningStarted={practiceTransferAbutmentMachiningStarted(
          selectedTransfer,
        )}
        remainingLabel={null}
        onAccept={
          selectedTransfer?.labRejected ||
          selectedTransfer?.manufacturerStage === "거부" ||
          selectedTransfer?.autoMatch?.declinedByMe
            ? undefined
            : () => void handleAcceptTransfer()
        }
        rejectBusy={rejectBusy}
        onReject={
          selectedTransfer?.labRejected ||
          selectedTransfer?.manufacturerStage === "거부" ||
          selectedTransfer?.autoMatch?.declinedByMe
            ? undefined
            : () => void handleRejectTransfer()
        }
        orderDate={selectedTransfer?.orderDate || null}
        arrivalDate={selectedTransfer?.arrivalDate || null}
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
        sendDisabled={chatSending}
      />
      </>
      ) : null}
    </div>
  );
}

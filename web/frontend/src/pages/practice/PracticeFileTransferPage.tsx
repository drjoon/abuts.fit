/**
 * 치과병의원(practice) 파일전송 페이지.
 *
 * 목적:
 * - 제출 후 바로 도달하는 홈 화면 제공
 * - 상단: 기간필터 + 요약(좌 2x2) + 최근 의뢰(우)
 * - 하단: 스캔 전송 섹션이 남은 영역을 채움
 * - 최근 전송 카드 클릭 시 의뢰 정보 + 기공소 채팅 모달 제공
 *
 * related files:
 * - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
 * - web/frontend/src/shared/hooks/useChatRooms.ts
 * - web/frontend/src/shared/hooks/useChatMessages.ts
 * - web/backend/modules/chat/chat.routes.js
 * - web/backend/controllers/chats/chat.controller.js
 * - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
 * - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
 * - web/backend/controllers/practiceTransfers/practiceTransferSettings.controller.js
 * - web/backend/models/practiceTransferDraft.model.js
 * - web/backend/models/businessAnchor.model.js
 * - web/backend/modules/files/file.routes.js
 * - web/backend/controllers/files/file.controller.js
 * - web/frontend/src/pages/practice/hooks/usePracticeTransferStep1.ts
 * - web/frontend/src/shared/realtime/socket.ts
 * - web/frontend/src/shared/realtime/useAppEventDebouncedReload.ts
 * - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
 * - web/frontend/src/shared/components/practice/PracticeLabRatingControl.tsx
 * - web/frontend/src/shared/practice/practiceLabRating.ts
 * - 2026-08-14: 의뢰 상세 · 기공소 채팅 rating(1~5)·메모. 자동매칭 최소 별.
 * - 2026-08-15: 기공기간 5일 미만 빨간 표시·거부 가능 툴팁(목록·상세).
 * - web/frontend/src/shared/components/practice/PracticeTransferFilePane.tsx
 * - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
 * - web/frontend/src/shared/practice/usePracticeToothWorkEditor.ts
 * - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
 * - web/frontend/src/features/layout/WorkspaceModeSwitch.tsx
 * - web/frontend/src/shared/workspace/workspaceMode.ts
 * - web/frontend/src/shared/components/practice/PracticeTransferExpressWizard.tsx
 * - 2026-08-15: 익스프레스 모드 위저드(한 화면 한 질문). 최근의뢰는 전송 후 표시.
 * - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
 * - web/frontend/src/shared/practice/toothWorkDraft.ts
 * - web/frontend/src/shared/hooks/useS3TempUpload.ts
 * - web/frontend/src/shared/hooks/useFilePreUpload.ts
 * - web/frontend/src/shared/hooks/useBackgroundTempUpload.ts
 * - web/frontend/src/shared/components/upload/BackgroundUploadList.tsx
 * - 2026-08-11: 최근 전송 뱃지 「다운로드」→「의뢰수락」(requestorDownloadedAt=수락 SSOT)
 * - 2026-08-11: 생산의뢰식 레이아웃·안내문구 최소화(즉시툴팁). 프로모 카피 축소.
 * - 2026-08-11: 기공의뢰 Card 유지, [기공소로 전송]만 카드 아래. intake는 plain.
 * - 2026-08-14: 자동매칭(공개 풀)도 최근전송「의뢰」뱃지 집계·필터에 포함. 기공소명 UI 마스킹.
 * - 2026-08-13: 상단 뱃지 6칸 — 의뢰·수락·완료·취소·발송·리메이크(취소=기공소 작업취소).
 * - 2026-08-12: 최근전송 — 기공소 의뢰수락 이후 삭제(휴지통) 비활성. 수락 전(발송/수신/자동매칭)만 가능.
 * - 2026-08-12: [기공소로 전송] 옆 「디자인 컨펌 생략」— 계정 마지막 설정. 전송 시 의뢰건에 스냅샷.
 * - 2026-08-13: 커스텀어벗 설정 모달 기본=디자인+생산. 선택값은 practiceTransferSettings.defaultAbutmentProductMode.
 * - 2026-08-13: 기공의뢰 모달에서 디자인+생산 고정. 생산만 클릭은 어벗생산의뢰로 이동.
 * - 2026-08-12: 임시저장 목록 「전체삭제」— 활성 draft 전부 휴지통(확인 없음).
 * - 2026-08-13: 임시저장/동기화는 기공소·완성형 한글 환자명 둘 다 입력된 뒤에만 수행.
 * - 2026-08-13: 최근전송 취소 뱃지=기공소 작업취소만(치과 휴지통 제외). 6뱃지 빠른툴팁.
 * - 2026-08-13: 파일카드에 사전 업로드 프로그레스바.
 * - 2026-08-13: 채팅 첨부도 즉시 백그라운드 업로드 + 칩 프로그레스바.
 * - 2026-08-13: 채팅/의뢰 파일 다운로드 프로그레스바.
 * - 2026-08-14: 최근전송 전체보기 — 사이드바 /my 1페이지 재사용, 중복 GET 제거.
 * - 2026-08-14: 임시저장 활성+휴지통 1회 조회(`drafts?trashed=all`).
 * - 2026-08-13: [기공소로 전송]은 사전 업로드 재사용·미완료만 대기. 재업로드 토스트 없음.
 * - 2026-08-13: 어벗 체크인데 임플란트·스캔바디 프리셋 없으면 전송 불가.
 * - 2026-08-14: 프리셋 편집을 열 때 도입 스펙을 서버에서 다시 불러온다.
 * - 2026-08-14: 환봉 도입 이벤트 수신 시 프리셋 배지 즉시 갱신. 계정 프리셋은 서버 우선.
 * - 2026-08-14: 기공의뢰 상단 「임시 저장」버튼 제거. 목록 반영은 자동 동기화만.
 * - 2026-08-14: 임시저장 디바운스·한글 IME 게이트. stale 저장 응답에서도 draftId 회수.
 * - 2026-08-14: 기공수가 할증 변경(practice:lab-fee-multiplier-updated) 시 견적·리메이크 미리보기 갱신.
 * - 2026-08-14: 기공소 수락 시 웹소켓 feeQuote로 치과「확정 기공비」즉시 반영.
 * - 2026-08-15: 치과 기공의뢰 카드 상단에 익스프레스/엑스퍼트 모드 전환.
 * - 2026-08-15: 기공소 전송은 작성 중 draft만. 전송/빈 폼 후 최신 임시저장을 폼에 자동 주입하지 않음.
 * - 2026-08-15: Express는 툴바 최근의뢰/임시저장/휴지통(다이얼로그). Expert는 xl 우측 접이식 카드.
 * - 2026-08-15: 「새로 작성」을 기공의뢰 카드 위 툴바로 이동.
 * - 2026-08-15: 「새로 작성」을 모드 전환 바로 오른쪽으로. 익스프레스 진행률·스텝 한 줄.
 * - 2026-08-15: 익스프레스 스텝·진행률을 기공의뢰 제목과 같은 헤더 행(좌·우)에 둔다.
 * - 2026-08-15: 주문 후 1영업일 미수락 「수락대기」뱃지(최근의뢰·전체보기).
 * - 2026-08-16: 전체보기에서 휴지통 확인 후 최근의뢰 모달로 복귀(중첩 Confirm에 닫히지 않음).
 * - 2026-08-16: 기공소 거부·이미 취소 건이 「의뢰」로 남는 휴지통 이동 실패 수정.
 * - 2026-08-16: 기공소 취소 — 자동매칭은 재공개, 지정은 치과 「취소」로 다음 조치 유도.
 * - 2026-08-16: 최근전송 조치대기(작업취소) 알림 뱃지·카드 깜빡임 하이라이트.
 * - 2026-08-16: 취소 건 클릭 시 전용 모달로 거부 안내·기공소 재선택.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import {
  UploadCloud,
  ClipboardList,
  Search,
  Trash2,
  RotateCcw,
  BookmarkPlus,
  ChevronsUpDown,
  Check,
  Download,
  Plus,
  Settings,
  ChevronDown,
  LayoutGrid,
  Repeat,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageFileDropZone } from "@/features/requests/components/PageFileDropZone";
import { WorkspaceModeSwitch } from "@/features/layout/WorkspaceModeSwitch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { cn } from "@/shared/ui/cn";
import { Skeleton } from "@/components/ui/skeleton";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import { usePeriodStore } from "@/store/usePeriodStore";
import { useToast } from "@/shared/hooks/use-toast";
import { apiFetch, invalidateApiGetCache } from "@/shared/api/apiClient";
import { parseFilenameWithRules } from "@/shared/filename/parseFilenameWithRules";
import { toTempUploadFileKey, useFilePreUpload } from "@/shared/hooks/useFilePreUpload";
import {
  toChatMessageAttachments,
  useBackgroundTempUpload,
} from "@/shared/hooks/useBackgroundTempUpload";
import { useS3FileDownload } from "@/shared/files/useS3FileDownload";
import { type TempUploadedFile } from "@/shared/hooks/useS3TempUpload";
import { useAuthStore } from "@/store/useAuthStore";
import {
  PRACTICE_ACCEPTED_HINT,
  AUTO_MATCH_LAB,
  coerceAutoMatchLab,
  getBusinessLabel,
  usePracticeTransferStep1,
  isAutoMatchLab,
  type SearchBusinessResult,
} from "@/pages/practice/hooks/usePracticeTransferStep1";
import { useChatRooms, type ChatRoom } from "@/shared/hooks/useChatRooms";
import { useChatMessages } from "@/shared/hooks/useChatMessages";
import { anonymizeAutoMatchChatSenderName } from "@/shared/practice/autoMatchIdentity";
import {
  resolveAutoMatchBudgetOrDefaults,
  type AbutsLabFeeCatalogItem,
  type PracticeTransferAutoMatchBudget,
} from "@/shared/practice/autoMatchBudget";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { useAppEventDebouncedReload } from "@/shared/realtime/useAppEventDebouncedReload";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  PracticeTransferDetailChatDialog,
  type PracticeTransferDialogFileItem,
  type PracticeTransferDialogSummaryItem,
} from "@/shared/components/PracticeTransferDetailChatDialog";
import { PracticeLabRatingControl } from "@/shared/components/practice/PracticeLabRatingControl";
import { PracticeTransferIntakeSection } from "@/shared/components/practice/PracticeTransferIntakeSection";
import {
  PracticeTransferExpressDonePanel,
  PracticeTransferExpressStepProgress,
  PracticeTransferExpressWizard,
  normalizeExpressStepId,
  resolveExpressLabLabel,
  type PracticeTransferExpressStepId,
} from "@/shared/components/practice/PracticeTransferExpressWizard";
import type { PracticeTransferFilePaneProps } from "@/shared/components/practice/PracticeTransferFilePane";
import type { PracticeTransferRequestIntakePanelProps } from "@/shared/components/practice/PracticeTransferRequestIntakePanel";
import { PracticeRecentTransfersAllModal } from "@/pages/practice/components/PracticeRecentTransfersAllModal";
import {
  DEFAULT_WORKSPACE_MODE,
  normalizeWorkspaceMode,
} from "@/shared/workspace/workspaceMode";
import {
  PRACTICE_MY_TRANSFERS_PAGE_SIZE,
  PRACTICE_RECENT_STATUS_BADGES,
  PRACTICE_REMAKE_BADGE_CLASS,
  canRemakePracticeTransferByStatus,
  computeGroupedStatusCounts,
  filterGroupedTransfersByStatus,
  isPracticeTransferActionNeededStatus,
  isPracticeTransferTrashStatus,
  type PracticeRecentStatusFilter,
} from "@/shared/practice/practiceRecentTransferList";
import { isPracticeTransferAcceptOverdue } from "@/shared/practice/practiceAcceptOverdue";
import { PracticeAcceptOverdueBadge } from "@/shared/components/practice/PracticeAcceptOverdueBadge";
import { formatWon } from "@/shared/practice/practiceTransferFeeQuote";
import {
  DEFAULT_AUTO_MATCH_MIN_LAB_RATING,
  normalizeAutoMatchMinLabRating,
  parsePracticeLabRatingPublic,
  type PracticeLabRatingPublic,
} from "@/shared/practice/practiceLabRating";
import { PracticeLabRejectedReselectDialog } from "@/shared/components/practice/PracticeLabRejectedReselectDialog";
import { normalizeMemoSnippets } from "@/shared/components/practice/PracticeTransferRequestIntakePanel";
import { restoreToothWorksFromDraft } from "@/shared/practice/toothWorkDraft";
import { deleteFile as deleteFileFromIndexedDb } from "@/shared/storage/fileIndexedDB";
import {
  PRACTICE_TRANSFER_FORM_LOCAL_KEY,
  PRACTICE_TRANSFER_TEMP_DRAFT_KEY,
  type PracticeTransferFormLocalDraft as PracticeTransferLocalFormDraft,
  adoptDropzoneDraftIntoTransferFormIfNeeded,
  clearPracticeSharedFormLocalStorage,
} from "@/shared/practice/practiceTransferFormLocal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
      buildPracticeTransferMemo as buildPracticeTransferMemoShared,
      extractTransferMemoFromMessage as extractTransferMemoFromMessageShared,
      formatPracticeTransferMemoDetail as formatPracticeTransferMemoDetailShared,
      formatTransferMemoForDisplay as formatTransferMemoForDisplayShared,
      normalizeToothWorksForSync,
      emptyToothWorkCustomSpecs,
      isLinkableProsthesisType,
      listMissingAbutmentPresetTeeth,
      pickToothWorkAbutmentProductMode,
      pickToothWorkCustomSpecs,
      ABUTMENT_PRODUCT_MODE,
      normalizeAccountAbutmentProductMode,
      normalizeImplantFavorites,
      normalizeAbutmentFavorites,
      resolveToothAbutmentProductMode,
      resolvePracticeTransferSkipJig,
      type AbutmentProductMode,
      parsePracticeTransferMemoMeta as parsePracticeTransferMemoMetaShared,
      stripPracticeTransferMessageEnvelope,
      type PracticeAbutmentFavorite,
      type PracticeImplantFavorite,
      type ToothWorkSelection as SharedToothWorkSelection,
} from "@/shared/practice/transferMemo";
import {
  parsePracticeTransferFeeQuote,
  type PracticeTransferFeeQuote,
} from "@/shared/practice/practiceTransferFeeQuote";
import { useImplantConnectionCatalog } from "@/shared/practice/useImplantConnectionCatalog";
import {
  ROUND_BAR_REQUEST_UPDATED_EVENT,
  applyRoundBarRequestUpdate,
  type RoundBarRequestUpdatedPayload,
} from "@/shared/practice/roundBarAbutment";
import {
  LAB_FEE_MULTIPLIER_UPDATED_EVENT,
  invalidatePracticeTransferQuoteContextCache,
} from "@/shared/practice/usePracticeTransferFeeQuote";
import { kstYmdDiffDays } from "@/shared/date/kst";
import { buildPracticeWorkPeriodSummaryItem } from "@/shared/practice/practiceWorkPeriod";
import {
  ORAL_SCAN_REQUIRED_FOR_AUTO_MATCH_CREATE,
} from "@/shared/practice/oralScanRequirement";
import { PracticeWorkPeriodText } from "@/shared/components/practice/PracticeWorkPeriodText";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type RecentRequestItem = {
  id: string; // 전송 내 파일 row 식별자(표시/그룹/optimistic 삭제용)
  requestMongoId: string; // PracticeTransfer _id (삭제 API 호출용)
  createdAt: string;
  requestDate: string;
  patientName: string;
  patientKey: string;
  toothNumbers: string[];
  targetLab: string;
  targetLabAnchorId: string;
  status: string;
  createdAtTs: number;
  transferId: string;
  orderDate: string;
  arrivalDate: string;
  transferMemo: string;
  /** 메타 태그 포함 원본 메모 — 보철물 차트 파싱용 */
  rawTransferMemo: string;
  fileName: string;
  fileS3Key: string;
  fileSize: number;
  resultFiles?: TransferFileItem[];
  hasCustomAbutment?: boolean;
  productionConfirmedAt?: string | null;
  skipDesignConfirm?: boolean;
  skipJig?: boolean;
  designReadyAt?: string | null;
  designFileCount?: number;
  practiceDesignConfirmedAt?: string | null;
  labDesignConfirmedAt?: string | null;
  feeQuote?: PracticeTransferFeeQuote | null;
  remakeFeeQuote?: PracticeTransferFeeQuote | null;
  isRemake?: boolean;
  remakeSourceTransferId?: string;
  matchingMode?: "direct" | "auto";
  canRateLab?: boolean;
  labRating?: PracticeLabRatingPublic | null;
};

type TransferFileItem = {
  fileName: string;
  s3Key: string;
  size: number;
};

type DraftTransferFileItem = {
  fileId: string;
  originalName: string;
  mimetype: string;
  size: number;
  s3Key: string;
  location?: string;
};

type PracticeTransferDraftPayload = {
  _id: string;
  practiceUserId?: string | null;
  practiceUserLabel?: string | null;
  targetLabAnchorId: string | null;
  targetLabName: string;
  transferMemo: string;
  orderDate?: string;
  arrivalDate?: string;
  arrivalDefaultDays?: number;
  prosthesisTypes?: string[];
  files: DraftTransferFileItem[];
  updatedAt?: string | null;
  createdAt?: string | null;
};

type DraftListSummary = {
  id: string;
  practiceUserId: string;
  practiceUserLabel: string;
  isMine: boolean;
  targetLabAnchorId: string | null;
  targetLabName: string;
  transferMemo: string;
  patientName: string;
  fileCount: number;
  files: DraftTransferFileItem[];
  updatedAt: string | null;
  createdAt: string | null;
};

const PRACTICE_DRAFT_TRANSFER_ID = "DRAFT-TEMP";

const toDraftListSummary = (
  payload: PracticeTransferDraftPayload,
  myUserId: string,
): DraftListSummary | null => {
  const files = Array.isArray(payload.files)
    ? payload.files
        .map((row) => ({
          fileId: String(row?.fileId || "").trim(),
          originalName: String(row?.originalName || "").trim(),
          mimetype: String(row?.mimetype || "application/octet-stream").trim(),
          size: Number(row?.size || 0),
          s3Key: String(row?.s3Key || "").trim(),
          location: String(row?.location || "").trim(),
        }))
        .filter((row) => row.fileId && row.originalName && row.s3Key)
    : [];

  const practiceUserId = String(payload.practiceUserId || "").trim();
  const parsed = parsePracticeTransferMemoMetaShared(String(payload.transferMemo || ""));
  // 목록 노출: 환자명·메모·기공소·파일. 치아만 있는 건은 빈 임시저장으로 보지 않는다.
  const hasFormContent =
    Boolean(String(parsed.patientName || "").trim()) ||
    Boolean(String(parsed.memo || "").trim()) ||
    Boolean(String(payload.targetLabName || "").trim()) ||
    Boolean(String(payload.targetLabAnchorId || "").trim());
  if (files.length === 0 && !hasFormContent) return null;

  return {
    id: String(payload._id || "").trim() || "draft-local",
    practiceUserId,
    practiceUserLabel: String(payload.practiceUserLabel || "").trim() || "담당자",
    isMine: Boolean(myUserId) && practiceUserId === myUserId,
    targetLabAnchorId: String(payload.targetLabAnchorId || "").trim() || null,
    targetLabName: String(payload.targetLabName || "").trim(),
    transferMemo: String(payload.transferMemo || "").trim(),
    patientName: String(parsed.patientName || "").trim(),
    fileCount: files.length,
    files,
    updatedAt: payload.updatedAt ? String(payload.updatedAt) : null,
    createdAt: payload.createdAt ? String(payload.createdAt) : null,
  };
};

type RecentTransferItem = {
  id: string;
  transferId: string;
  deleteTargetLabel: string;
  createdAt: string;
  createdAtTs: number;
  requestDate: string;
  targetLab: string;
  orderDate: string;
  arrivalDate: string;
  status: string;
  fileCount: number;
  patientCount: number;
  requestIds: string[];
  transferMongoIds: string[];
  fileNames: string[];
  files: TransferFileItem[];
  resultFiles?: TransferFileItem[];
  hasCustomAbutment?: boolean;
  productionConfirmedAt?: string | null;
  skipDesignConfirm?: boolean;
  skipJig?: boolean;
  designReadyAt?: string | null;
  designFileCount?: number;
  practiceDesignConfirmedAt?: string | null;
  labDesignConfirmedAt?: string | null;
  transferMemo: string;
  /** 메타 태그 포함 원본 메모 — 보철물 차트 파싱용 */
  rawTransferMemo?: string;
  unreadCount: number;
  searchBlob: string;
  practiceUserId?: string;
  practiceUserLabel?: string;
  isMineDraft?: boolean;
  draftPatientName?: string;
  targetLabAnchorId?: string;
  feeQuote?: PracticeTransferFeeQuote | null;
  remakeFeeQuote?: PracticeTransferFeeQuote | null;
  isRemake?: boolean;
  remakeSourceTransferId?: string;
  matchingMode?: "direct" | "auto";
  canRateLab?: boolean;
  labRating?: PracticeLabRatingPublic | null;
};

const extractLabNameFromMessage = (message: string) => {
  const raw = String(message || "").trim();
  const matched = raw.match(/\[\s*기공소\s*:\s*([^\]]+)\]/);
  return String(matched?.[1] || "").trim();
};

const extractTransferIdFromMessage = (message: string) => {
  const raw = String(message || "").trim();
  const matched = raw.match(/\[\s*전송ID\s*:\s*([^\]]+)\]/i);
  return String(matched?.[1] || "").trim();
};

const formatTransferMemoForDisplay = (rawMemo: string) =>
  formatPracticeTransferMemoDetailShared(rawMemo, { includeDateSummary: false }) ||
  formatTransferMemoForDisplayShared(rawMemo);

const extractTransferMemoFromMessage = (message: string) =>
  extractTransferMemoFromMessageShared(message, { includeDateSummary: false });

const makeTransferId = () => {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PTX-${t}-${r}`;
};

const DEFAULT_ARRIVAL_OFFSET_DAYS = 7;
const PRESET_PROSTHESIS_TYPES = ["인레이", "크라운", "커스텀어벗", "브리지", "Pontic", "유지장치", "임시치아", "작업X"] as const;
const PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY = "practice_transfer_settings_v1";

type ToothWorkSelection = SharedToothWorkSelection;

type ParsedPracticeTransferMemoMeta = {
  orderDate: string;
  arrivalDate: string;
  arrivalDefaultDays: number;
  prosthesisTypes: string[];
  toothWorks: ToothWorkSelection[];
  patientName: string;
  memo: string;
  skipDesignConfirm: boolean;
  skipJig: boolean;
};

type PracticeTransferFormFingerprintInput = {
  targetLabAnchorId?: string | null;
  targetLabName?: string | null;
  patientName?: string | null;
  orderDate?: string | null;
  arrivalDate?: string | null;
  arrivalDefaultDays?: number | null;
  requestMemo?: string | null;
  prosthesisTypes?: string[] | null;
  toothWorks?: ToothWorkSelection[] | null;
};

const isMongoObjectIdString = (value: unknown) =>
  /^[a-f\d]{24}$/i.test(String(value || "").trim());

const normalizeFingerprintLabAnchorId = (value: unknown) => {
  const id = String(value || "").trim();
  // recent:/draft-lab: 등 로컬 임시 id는 서버에서 null로 저장되므로 fingerprint도 비운다.
  return isMongoObjectIdString(id) ? id : "";
};

const buildPracticeTransferFormFingerprint = (
  input: PracticeTransferFormFingerprintInput,
) =>
  JSON.stringify({
    targetLabAnchorId: normalizeFingerprintLabAnchorId(input.targetLabAnchorId),
    targetLabName: String(input.targetLabName || "").trim(),
    patientName: String(input.patientName || "")
      .trim()
      .normalize("NFC"),
    orderDate: String(input.orderDate || "").trim(),
    arrivalDate: String(input.arrivalDate || "").trim(),
    arrivalDefaultDays: normalizeArrivalDefaultDays(Number(input.arrivalDefaultDays || 0)),
    requestMemo: String(input.requestMemo || "").trim(),
    prosthesisTypes: ensurePresetProsthesisTypes(
      Array.isArray(input.prosthesisTypes) ? input.prosthesisTypes : [],
    ),
    toothWorks: normalizeToothWorksForSync(
      Array.isArray(input.toothWorks) ? input.toothWorks : [],
    ),
  });

const toApiLabAnchorId = (value: unknown): string | null => {
  const id = String(value || "").trim();
  return isMongoObjectIdString(id) ? id : null;
};

type PracticeTransferSettingsPayload = {
  arrivalDefaultDays?: number;
  prosthesisTypes?: string[];
  memoSnippets?: string[];
  implantFavorites?: PracticeImplantFavorite[];
  abutmentFavorites?: PracticeAbutmentFavorite[];
  skipDesignConfirm?: boolean;
  skipJig?: boolean;
  defaultAbutmentProductMode?: AbutmentProductMode;
  autoMatchBudget?: PracticeTransferAutoMatchBudget | null;
  autoMatchMinLabRating?: number;
  abutsLabFeeCatalog?: AbutsLabFeeCatalogItem[] | null;
  updatedAt?: string | null;
};

const toKstDateInputValue = (date = new Date()) => {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date);
};

const addDaysToDateInput = (dateInput: string, days: number) => {
  const base = String(dateInput || "").trim();
  if (!base) return "";
  const d = new Date(`${base}T00:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + Number(days || 0));
  return toKstDateInputValue(d);
};

const normalizeArrivalDefaultDays = (value: number) => {
  if (!Number.isFinite(Number(value))) return DEFAULT_ARRIVAL_OFFSET_DAYS;
  return Math.max(0, Math.min(365, Math.floor(Number(value))));
};

const isMissingToothProsthesisType = (prosthesisType: string) => {
  const raw = String(prosthesisType || "").trim();
  const compact = raw.replace(/\s+/g, "");
  return (
    raw === "작업X" ||
    raw === "상실치" ||
    compact.toLowerCase() === "작업x" ||
    /^missing(?:tooth)?$/i.test(compact)
  );
};

const isBridgeLikeProsthesisType = (prosthesisType: string) =>
  prosthesisType === "브리지" ||
  prosthesisType === "Pontic" ||
  prosthesisType === "유지장치" ||
  isMissingToothProsthesisType(prosthesisType);

const isCustomAbutmentSupportedProsthesisType = (prosthesisType: string) => {
  const compact = String(prosthesisType || "").trim().replace(/\s+/g, "");
  return (
    compact === "커스텀어벗" ||
    prosthesisType === "크라운" ||
    prosthesisType === "브리지" ||
    /^(?:커스텀)?어벗디자인$/i.test(compact)
  );
};

const sanitizeProsthesisTypeLabel = (value: string) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";

  const compact = trimmed.replace(/\s+/g, "");
  if (/^커스텀어벗\+?크라운$/i.test(compact)) return "크라운";
  if (/^커스텀어벗\+?브리지$/i.test(compact)) return "브리지";
  if (/^(?:커스텀)?어벗디자인$/i.test(compact)) return "커스텀어벗";
  if (/^커스텀어벗$/i.test(compact)) return "커스텀어벗";
  if (compact === "가철성임시치아" || compact === "임시치아") return "임시치아";
  return trimmed;
};

const normalizeProsthesisTypes = (items: string[]) => {
  const canonical = items
    .map((item) => sanitizeProsthesisTypeLabel(String(item || "")))
    .filter(Boolean)
    .map((item) => {
      if (/^pontic$/i.test(item)) return "Pontic";
      if (
        item === "작업X" ||
        item === "상실치" ||
        /^작업x$/i.test(item) ||
        /^missing(?:\s*tooth)?$/i.test(item)
      ) {
        return "작업X";
      }
      return item;
    });

  const deduped = Array.from(
    new Map(canonical.map((item) => [item.toLowerCase(), item])).values(),
  );

  const withPontic = [...deduped];
  if (!withPontic.some((item) => /^pontic$/i.test(item))) withPontic.push("Pontic");
  if (!withPontic.some((item) => item === "작업X" || item === "상실치")) withPontic.push("작업X");
  return withPontic.length ? withPontic : [...PRESET_PROSTHESIS_TYPES];
};

/** 케이스 동기화가 목록을 Pontic만으로 줄이지 않도록 프리셋을 항상 병합한다. */
const ensurePresetProsthesisTypes = (items: string[] | null | undefined) =>
  normalizeProsthesisTypes([
    ...PRESET_PROSTHESIS_TYPES,
    ...(Array.isArray(items) ? items : []),
  ]);

const resolveDefaultProsthesisType = (types: string[]) =>
  types.includes("크라운") ? "크라운" : types[0] || "크라운";

const getAdjacentTeeth = (toothNumber: string) => {
  const raw = String(toothNumber || "").trim();
  if (!/^[1-4][1-8]$/.test(raw)) return [] as string[];
  const tens = Number(raw[0]);
  const ones = Number(raw[1]);
  const out: string[] = [];

  // 같은 사분면 내 인접 치아
  if (ones > 1) out.push(`${tens}${ones - 1}`);
  if (ones < 8) out.push(`${tens}${ones + 1}`);

  // 정중선 연결: 11 ↔ 21, 31 ↔ 41
  if (ones === 1) {
    if (tens === 1) out.push("21");
    if (tens === 2) out.push("11");
    if (tens === 3) out.push("41");
    if (tens === 4) out.push("31");
  }

  return Array.from(new Set(out));
};

const toToothSortNumber = (toothNumber: string) => {
  const raw = String(toothNumber || "").trim();
  if (!/^[1-4][1-8]$/.test(raw)) return Number.MAX_SAFE_INTEGER;
  return Number(raw);
};

const toToothMemoSortNumber = (toothNumber: string) => {
  const raw = String(toothNumber || "").trim();
  if (!/^[1-4][1-8]$/.test(raw)) return Number.MAX_SAFE_INTEGER;
  const tens = Number(raw[0]);
  const ones = Number(raw[1]);

  if (tens === 1) return 9 - ones; // 18..11 (상악 우측 -> 정중선)
  if (tens === 2) return 8 + ones; // 21..28 (정중선 -> 상악 좌측)
  if (tens === 4) return 16 + (9 - ones); // 48..41 (하악 우측 -> 정중선)
  if (tens === 3) return 24 + ones; // 31..38 (정중선 -> 하악 좌측)

  return Number.MAX_SAFE_INTEGER;
};

const normalizeToothWorks = (items: ToothWorkSelection[]) =>
  items
    .map((row) => {
      const toothNumber = String(row?.toothNumber || "").trim();
      const prosthesisTypeRaw = String(row?.prosthesisType || "").trim();
      const prosthesisType = isMissingToothProsthesisType(prosthesisTypeRaw)
        ? "작업X"
        : prosthesisTypeRaw;
      const customAbutment = /커스텀어벗|(?:커스텀)?어벗디자인/i.test(
        String(prosthesisType || "").replace(/\s+/g, ""),
      )
        ? true
        : isCustomAbutmentSupportedProsthesisType(prosthesisType)
          ? Boolean(row?.customAbutment)
          : false;
      const adjacent = getAdjacentTeeth(toothNumber);
      const bridgeLinkedTeeth =
        isLinkableProsthesisType(prosthesisType) && Array.isArray(row?.bridgeLinkedTeeth)
          ? row.bridgeLinkedTeeth
              .map((v) => String(v || "").trim())
              .filter((v) => adjacent.includes(v))
          : [];

      return {
        toothNumber,
        prosthesisType,
        customAbutment,
        bridgeLinkedTeeth,
        ...pickToothWorkCustomSpecs(row, customAbutment),
      };
    })
    .filter((row) => /^[1-4][1-8]$/.test(row.toothNumber) && row.prosthesisType);

const serializeToothWorks = (rows: ToothWorkSelection[]) =>
  normalizeToothWorks(rows)
    .slice()
    .sort((a, b) => toToothMemoSortNumber(a.toothNumber) - toToothMemoSortNumber(b.toothNumber))
    .map((row) => {
      const orderedLinks = [...row.bridgeLinkedTeeth].sort(
        (a, b) => toToothMemoSortNumber(a) - toToothMemoSortNumber(b),
      );
      const linked =
        isLinkableProsthesisType(row.prosthesisType) && orderedLinks.length > 0
          ? `(${[row.toothNumber, ...orderedLinks].join("-")})`
          : "";
      const implantParts = [
        row.implantManufacturer,
        row.implantBrand,
        row.implantFamily,
        row.implantType,
      ].map((v) => String(v || "").trim());
      const hasImplant = implantParts.some(Boolean);
      const abutmentParts = [
        row.abutmentManufacturer,
        row.abutmentDiameter,
        row.abutmentHeight,
      ].map((v) => String(v || "").trim());
      const hasAbutment = abutmentParts.some(Boolean);
      const custom =
        isCustomAbutmentSupportedProsthesisType(row.prosthesisType) && row.customAbutment
          ? `+커스텀어벗${hasImplant ? `{${implantParts.join("/")}}` : ""}${
              hasAbutment ? `[${abutmentParts.join("/")}]` : ""
            }`
          : "";
      return `${row.toothNumber}=${row.prosthesisType}${custom}${linked}`;
    })
    .join(" | ");

const parseToothWorks = (value: string) =>
  String(value || "")
    .split("|")
    .map((chunk) => String(chunk || "").trim())
    .filter(Boolean)
    .map((chunk) => {
      const [toothRaw, ...rest] = chunk.split("=");
      const rawTooth = String(toothRaw || "").trim();
      const toothNumber = !rawTooth || rawTooth === "-" ? "" : rawTooth;
      const rhs = String(rest.join("=") || "").trim();
      if (!rhs) {
        return {
          toothNumber,
          prosthesisType: "",
          customAbutment: false,
          bridgeLinkedTeeth: [] as string[],
          ...emptyToothWorkCustomSpecs(),
        };
      }

      const linkedMatch = rhs.match(/\(([^)]+)\)\s*$/);
      const linkedRaw = linkedMatch ? linkedMatch[1] : "";
      let withoutLinked = linkedMatch ? rhs.replace(/\(([^)]+)\)\s*$/, "").trim() : rhs;
      const abutMatch = withoutLinked.match(/\[([^\]]*)\]\s*$/);
      const abutRaw = abutMatch ? abutMatch[1] : "";
      if (abutMatch) withoutLinked = withoutLinked.replace(/\[[^\]]*\]\s*$/, "").trim();
      const abutParts = String(abutRaw || "").split("/");
      const abutment = {
        abutmentManufacturer: String(abutParts[0] || "").trim(),
        abutmentDiameter: String(abutParts[1] || "").trim(),
        abutmentHeight: abutParts.slice(2).join("/").trim(),
      };

      const implantMatch = withoutLinked.match(/\{([^}]*)\}\s*$/);
      const implantRaw = implantMatch ? implantMatch[1] : "";
      if (implantMatch) withoutLinked = withoutLinked.replace(/\{[^}]*\}\s*$/, "").trim();
      const implantParts = String(implantRaw || "").split("/");
      const implant = {
        implantManufacturer: String(implantParts[0] || "").trim(),
        implantBrand: String(implantParts[1] || "").trim(),
        implantFamily: String(implantParts[2] || "").trim(),
        implantType: implantParts.slice(3).join("/").trim(),
      };

      let customAbutment = false;
      if (withoutLinked.startsWith("커스텀어벗+")) {
        customAbutment = true;
        withoutLinked = withoutLinked.replace("커스텀어벗+", "").trim();
      }
      if (withoutLinked.includes("+커스텀어벗")) {
        customAbutment = true;
        withoutLinked = withoutLinked.replace("+커스텀어벗", "").trim();
      }
      if (
        implant.implantManufacturer ||
        implant.implantBrand ||
        implant.implantFamily ||
        implant.implantType ||
        abutment.abutmentManufacturer ||
        abutment.abutmentDiameter ||
        abutment.abutmentHeight
      ) {
        customAbutment = true;
      }
      const prosthesisType = withoutLinked;
      const bridgeLinkedTeeth = linkedRaw
        ? linkedRaw
            .split("-")
            .map((v) => String(v || "").trim())
            .filter((v) => v && v !== toothNumber && v !== "-")
        : [];

      return {
        toothNumber,
        prosthesisType,
        customAbutment,
        bridgeLinkedTeeth,
        ...pickToothWorkCustomSpecs({ ...implant, ...abutment }, customAbutment),
      };
    })
    .filter((row) => Boolean(row.prosthesisType) || Boolean(row.toothNumber));

const parsePracticeTransferMemoMeta = (rawMemo: string): ParsedPracticeTransferMemoMeta => {
  const source = String(rawMemo || "").trim();
  const defaultOrderDate = toKstDateInputValue(new Date());
  const defaults: ParsedPracticeTransferMemoMeta = {
    orderDate: defaultOrderDate,
    arrivalDate: addDaysToDateInput(defaultOrderDate, DEFAULT_ARRIVAL_OFFSET_DAYS),
    arrivalDefaultDays: DEFAULT_ARRIVAL_OFFSET_DAYS,
    prosthesisTypes: [...PRESET_PROSTHESIS_TYPES],
    toothWorks: [],
    patientName: "",
    memo: source,
    skipDesignConfirm: true,
    skipJig: true,
  };
  if (!source) return defaults;

  const parsed = parsePracticeTransferMemoMetaShared(source);
  return {
    orderDate: parsed.orderDate || defaults.orderDate,
    arrivalDate:
      parsed.arrivalDate ||
      addDaysToDateInput(parsed.orderDate || defaults.orderDate, parsed.arrivalDefaultDays),
    arrivalDefaultDays: Number.isFinite(Number(parsed.arrivalDefaultDays))
      ? normalizeArrivalDefaultDays(Number(parsed.arrivalDefaultDays))
      : defaults.arrivalDefaultDays,
    prosthesisTypes: ensurePresetProsthesisTypes(parsed.prosthesisTypes),
    toothWorks: normalizeToothWorksForSync(parsed.toothWorks),
    patientName: String(parsed.patientName || "").trim(),
    memo: String(parsed.memo || ""),
    // 미설정·레거시는 생략(true). 명시 false만 미생략
    skipDesignConfirm: parsed.skipDesignConfirm !== false,
    skipJig: parsed.skipJig !== false,
  };
};

const buildPracticeTransferMemo = (params: {
  memo: string;
  orderDate: string;
  arrivalDate: string;
  arrivalDefaultDays: number;
  prosthesisTypes: string[];
  toothWorks: ToothWorkSelection[];
  patientName?: string;
  skipDesignConfirm?: boolean;
  skipJig?: boolean;
}) =>
  buildPracticeTransferMemoShared({
    ...params,
    prosthesisTypes: ensurePresetProsthesisTypes(params.prosthesisTypes),
    skipDesignConfirm: params.skipDesignConfirm !== false,
    skipJig: params.skipJig !== false,
  });

const normalizePatientNameKey = (value: string) => {
  const raw = String(value || "").trim();
  if (!raw || raw === "-") return "";

  let normalized = raw;
  try {
    normalized = normalized.normalize("NFC");
  } catch {
    // ignore
  }

  // 파일명 fallback으로 들어온 환자명 끝 치아 suffix(_47_0, -36-1 등) 제거
  const stripped = normalized
    .replace(/\.(stl|ply|obj)$/i, "")
    .replace(/[_\-\s]*#?\d{1,2}(?:[_\-\s]\d+)?$/, "")
    .trim();

  return (stripped || normalized).toLowerCase();
};

/** 완성형 한글 음절이 있어야 임시저장. IME Latin(r/rh) mid-type은 제외. */
const hasAutosaveReadyPatientName = (value: string) => /[가-힣]/.test(String(value || "").trim());

const toDateLabel = (value: unknown) => {
  const d = new Date(String(value || ""));
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

const toDayLabel = (value: unknown) => {
  const d = new Date(String(value || ""));
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};

const toStatusLabel = (manufacturerStage: unknown) => {
  const raw = String(manufacturerStage || "").trim();
  const lowered = raw.toLowerCase();
  if (!raw) return "발송완료";

  // 정확값 우선
  if (raw === "취소") return "취소";
  if (raw === "거부") return "거부";
  // 기공소 작업취소 — 휴지통(취소)과 구분. 뱃지 표시는 toStatusBadgeLabel에서 「취소」
  if (raw === "작업취소") return "작업취소";
  if (raw === "발송완료") return "발송완료";
  if (raw === "수신완료") return "수신완료";
  if (raw === "의뢰수락" || raw === "다운로드완료") return "의뢰수락";
  if (raw === "자동매칭") return "자동매칭";
  if (raw === "작업완료") return "작업완료";
  if (raw === "생산진행") return "생산진행";
  if (raw === "포장.발송") return "포장.발송";
  if (raw === "추적관리") return "추적관리";

  // 레거시/과거 데이터 호환
  if (raw === "수신전" || raw === "확인전") return "발송완료";
  if (raw === "확인") return "수신완료";
  if (lowered === "downloaded" || lowered === "accepted") return "의뢰수락";
  if (raw.includes("전달완료") || raw.includes("배송완료")) return "수신완료";
  if (raw.includes("의뢰") || raw.includes("접수") || raw.includes("대기")) return "발송완료";

  return "발송완료";
};

/** 목록/카드 뱃지 라벨 — 상단 필터(의뢰·수락·완료·취소·발송)와 동일 문구 */
const toStatusBadgeLabel = (status: unknown) => {
  const s = String(status || "").trim();
  if (!s) return "-";
  if (s === "발송완료" || s === "수신완료" || s === "자동매칭") return "의뢰";
  if (s === "의뢰수락" || s === "다운로드완료") return "수락";
  if (s === "작업완료") return "완료";
  if (s === "작업취소" || s === "취소") return "취소";
  if (s === "거부") return "거부";
  if (s === "생산진행" || s === "포장.발송") return "발송";
  return s;
};

/** 최근의뢰 카드와 동일한 메타(시각·뱃지·기공소·파일·일정·메모) */
const PracticeListCardDetail = ({
  createdAt,
  statusLabel,
  statusBadgeClassName,
  extraBadges,
  targetLabText,
  fileCount,
  orderDate,
  arrivalDate,
  transferMemo,
  layout = "compact",
}: {
  createdAt: string;
  statusLabel?: string;
  statusBadgeClassName?: string;
  extraBadges?: ReactNode;
  targetLabText: string;
  fileCount: number;
  orderDate?: string;
  arrivalDate?: string;
  transferMemo?: string;
  layout?: "compact" | "comfortable";
}) => {
  const memo = String(transferMemo || "")
    .replace(/\s+/g, " ")
    .trim();
  const hasPeriod = Boolean(String(orderDate || "").trim() && String(arrivalDate || "").trim());
  const periodNode = hasPeriod ? (
    <PracticeWorkPeriodText
      orderDate={String(orderDate)}
      arrivalDate={String(arrivalDate)}
      variant="orderArrival"
      className="text-xs"
    />
  ) : null;

  if (layout === "comfortable") {
    return (
      <div className="mt-2 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">{createdAt}</p>
          {statusLabel ? (
            <Badge
              variant="outline"
              className={cn("h-5 whitespace-nowrap px-1.5 text-[10px]", statusBadgeClassName)}
            >
              {statusLabel}
            </Badge>
          ) : null}
          {extraBadges}
        </div>
        <p className="truncate text-sm text-slate-700">{targetLabText}</p>
        <p className="text-xs text-muted-foreground">
          파일 {fileCount}개
          {periodNode ? (
            <>
              {" · "}
              {periodNode}
            </>
          ) : null}
        </p>
        {memo ? (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            메모: {memo}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div className="mt-0.5 flex flex-wrap items-center gap-2">
        <p className="truncate text-xs text-muted-foreground">{createdAt}</p>
        {statusLabel ? (
          <Badge
            variant="outline"
            className={cn("whitespace-nowrap", statusBadgeClassName)}
          >
            {statusLabel}
          </Badge>
        ) : null}
        {extraBadges}
      </div>
      <p className="truncate text-xs text-muted-foreground">{targetLabText}</p>
      <p className="truncate text-xs text-muted-foreground">
        파일 {fileCount}개
        {periodNode ? (
          <>
            {" · "}
            {periodNode}
          </>
        ) : null}
        {memo ? ` · 메모: ${memo}` : ""}
      </p>
    </>
  );
};

/** 기공소 의뢰수락 이전만 치과에서 휴지통 이동 가능 */
const canDeletePracticeTransferByStatus = (status: unknown) => {
  const s = String(status || "").trim();
  if (s === "임시저장") return true;
  return (
    s === "발송완료" ||
    s === "수신완료" ||
    s === "자동매칭" ||
    s === "작업취소"
  );
};

const formatChatTs = (value: unknown) => {
  const d = new Date(String(value || ""));
  if (Number.isNaN(d.getTime())) return "";
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

const formatFileSize = (bytes: number) => {
  const n = Number(bytes || 0);
  if (!Number.isFinite(n) || n <= 0) return "0B";
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(2)}MB`;
};

const PRACTICE_FILE_CACHE_META_KEY = "practice_dropzone_file_cache_meta_v1";
const clearPracticeFileTransferCaches = async () => {
  let keys: string[] = [];
  try {
    const raw = localStorage.getItem(PRACTICE_FILE_CACHE_META_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      keys = parsed
        .map((row) => String((row as { key?: unknown })?.key || "").trim())
        .filter(Boolean);
    }
  } catch {
    // ignore
  }

  const uniqueKeys = Array.from(new Set(keys));
  await Promise.all(
    uniqueKeys.map((key) =>
      deleteFileFromIndexedDb(key).catch(() => {
        // ignore
      }),
    ),
  );

  try {
    localStorage.removeItem(PRACTICE_FILE_CACHE_META_KEY);
  } catch {
    // ignore
  }
  clearPracticeSharedFormLocalStorage();
};

const toDraftFileKey = (file: { originalName: string; size: number; s3Key: string }) =>
  `${String(file.originalName || "").trim()}:${Number(file.size || 0)}:${String(file.s3Key || "").trim()}`;

export const PracticeFileTransferPage = ({
  roleSwitcher,
}: {
  roleSwitcher?: ReactNode;
} = {}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { period, setPeriod } = usePeriodStore();
  const { toast } = useToast();
  const authToken = useAuthStore((s) => s.token);
  const authUser = useAuthStore((s) => s.user);
  const workspaceMode = normalizeWorkspaceMode(
    authUser?.workspaceMode ?? DEFAULT_WORKSPACE_MODE,
  );
  const isExpressMode = workspaceMode === "express";
  const [requestSearchTerm, setRequestSearchTerm] = useState("");
  const [recentStatusFilter, setRecentStatusFilter] =
    useState<PracticeRecentStatusFilter>("all");
  const [remakeSelectedIds, setRemakeSelectedIds] = useState<string[]>([]);
  const [remakeConfirmOpen, setRemakeConfirmOpen] = useState(false);
  const [remakeBusy, setRemakeBusy] = useState(false);
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const requestSubmittingRef = useRef(false);
  const [skipDesignConfirm, setSkipDesignConfirm] = useState(true);
  const [skipDesignConfirmUncheckOpen, setSkipDesignConfirmUncheckOpen] = useState(false);
  const [skipJig, setSkipJig] = useState(true);
  const [expressStepId, setExpressStepId] =
    useState<PracticeTransferExpressStepId>("lab");
  const [expressDone, setExpressDone] = useState(false);
  /** 새로 작성 시 위저드 방문 단계(체크) 초기화용 */
  const [expressWizardEpoch, setExpressWizardEpoch] = useState(0);
  const expressStepRestoredRef = useRef(false);
  const prevWorkspaceModeRef = useRef<"express" | "expert" | null>(null);
  const [autoMatchBudget, setAutoMatchBudget] =
    useState<PracticeTransferAutoMatchBudget | null>(null);
  const [autoMatchMinLabRating, setAutoMatchMinLabRating] = useState(
    DEFAULT_AUTO_MATCH_MIN_LAB_RATING,
  );
  const [abutsLabFeeCatalog, setAbutsLabFeeCatalog] = useState<
    AbutsLabFeeCatalogItem[] | null
  >(null);
  const [defaultAbutmentProductMode, setDefaultAbutmentProductMode] =
    useState<AbutmentProductMode>(() => normalizeAccountAbutmentProductMode(undefined));
  const [lastSavedFormFingerprint, setLastSavedFormFingerprint] = useState<string | null>(null);
  const [formSyncStatus, setFormSyncStatus] = useState<
    "idle" | "pending" | "saving" | "saved" | "error"
  >("idle");
  const [draftFiles, setDraftFiles] = useState<DraftTransferFileItem[]>([]);
  const [draftSummary, setDraftSummary] = useState<DraftListSummary | null>(null);
  const [practiceDraftList, setPracticeDraftList] = useState<DraftListSummary[]>([]);
  const [trashedDraftList, setTrashedDraftList] = useState<DraftListSummary[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [toothChartResetNonce, setToothChartResetNonce] = useState(0);
  const [recentRequests, setRecentRequests] = useState<RecentRequestItem[]>([]);
  const [recentRequestsLoading, setRecentRequestsLoading] = useState(false);
  const [recentRequestsError, setRecentRequestsError] = useState("");
  const [recentRequestsHasMore, setRecentRequestsHasMore] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<RecentTransferItem | null>(null);
  const [labRejectedReselectTarget, setLabRejectedReselectTarget] =
    useState<RecentTransferItem | null>(null);
  const [labRejectedRetargetBusy, setLabRejectedRetargetBusy] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [productionConfirmBusy, setProductionConfirmBusy] = useState(false);
  const [activeChatRoom, setActiveChatRoom] = useState<ChatRoom | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const [chatReplyTo, setChatReplyTo] = useState<{
    _id: string;
    sender: { name: string; role: string };
    content: string;
  } | null>(null);
  const [chatSending, setChatSending] = useState(false);
  const chatUploads = useBackgroundTempUpload({ token: authToken });
  const {
    downloadingKeys,
    downloadProgressByKey,
    downloadAllBusy,
    downloadS3File,
    downloadAll,
    resetDownloads,
  } = useS3FileDownload(authToken);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetTransfer, setDeleteTargetTransfer] = useState<RecentTransferItem | null>(null);
  const [deletingTransfer, setDeletingTransfer] = useState(false);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [restoreTargetTransfer, setRestoreTargetTransfer] = useState<RecentTransferItem | null>(null);
  const [restoringTransfer, setRestoringTransfer] = useState(false);
  const [emptyTrashConfirmOpen, setEmptyTrashConfirmOpen] = useState(false);
  const [emptyingTrash, setEmptyingTrash] = useState(false);
  const [clearingAllDrafts, setClearingAllDrafts] = useState(false);
  const [localFormHydrated, setLocalFormHydrated] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const chatRoomResolveSeqRef = useRef(0);
  const transferDialogOpenRef = useRef(false);
  const returnToAllModalRef = useRef(false);
  /** 전체보기 모달에서 휴지통 확인을 연 경우 — Confirm이 닫혀도 최근의뢰 모달 유지 */
  const deleteReturnToAllModalRef = useRef(false);
  const suppressRecentAllModalCloseRef = useRef(false);
  const selectedTransferIdRef = useRef("");
  const localFormUpdatedAtRef = useRef(0);
  const skipNextArrivalAutoSyncRef = useRef(false);
  const suppressLocalFormPersistRef = useRef(false);
  const skipFormAutosaveRef = useRef(false);
  const pendingLocalFormEditRef = useRef(false);
  const lastSavedFormFingerprintRef = useRef<string | null>(null);
  const currentFormFingerprintRef = useRef("");
  const lastAppliedServerUpdatedAtRef = useRef(0);
  const formAutosaveSeqRef = useRef(0);
  const formAutosaveTimerRef = useRef<number | null>(null);
  const draftListSeqRef = useRef(0);
  const draftListLoadedRef = useRef(false);
  /** 목록에 실제로 등장했던 activeDraftId. 저장 직후 목록 레이스로 폼을 비우지 않기 위함. */
  const activeDraftSeenInListRef = useRef<string | null>(null);
  const pendingLocalFilesRef = useRef<File[]>([]);
  const draftFilesRef = useRef<DraftTransferFileItem[]>([]);
  const draftSummaryIdRef = useRef<string | null>(null);
  const activeDraftIdRef = useRef<string | null>(null);
  /** 어벗생산의뢰 등에서 navigate state.prefilledFiles 1회만 소비 */
  const consumedPrefillLocationKeyRef = useRef<string | null>(null);
  /** 파일 업로드 동기화 중 원격 draft 적용으로 폼이 깜빡이지 않게 한다. */
  const fileSyncInFlightRef = useRef(false);
  const resetIntakeFormAfterTransferRef = useRef<() => Promise<void>>(async () => {});
  // 한글 음절 사이 composition 공백을 넘기도록 여유. 200ms면 r/rh 같은 중간값이 저장됨.
  const FORM_AUTOSAVE_DEBOUNCE_MS = 900;
  const FORM_AUTOSAVE_IME_RETRY_MS = 120;
  const imeComposingRef = useRef(false);
  /** draftId 없는 동시 POST가 각각 새 draft를 만들지 않도록 upsert를 직렬화한다. */
  const formAutosaveGateRef = useRef<Promise<void> | null>(null);
  const pendingDraftApplyRef = useRef<
    (PracticeTransferDraftPayload & { forceResync?: boolean }) | null
  >(null);
  const {
    files,
    selectedLab,
    setSelectedLab,
    requestMemo,
    setRequestMemo,
    labSearch,
    setLabSearch,
    labSearchResults,
    labOpen,
    setLabOpen,
    labSearching,
    recentLabs,
    recentLabsInitialized,
    pinnedLabs,
    handleIncomingFiles,
    removeFile,
    clearAllFiles,
    rememberLab,
    removeRecentLab,
    togglePinLab,
    syncRecentLabsFromTransfers,
  } = usePracticeTransferStep1();

  // 임시저장/서버 echo가 `draft-lab:자동 매칭`으로 남기면 센티널로 되돌린다.
  useEffect(() => {
    if (!selectedLab) return;
    if (!isAutoMatchLab(selectedLab)) return;
    if (String(selectedLab._id || "").trim() === AUTO_MATCH_LAB._id) return;
    setSelectedLab(AUTO_MATCH_LAB);
  }, [selectedLab, setSelectedLab]);
  pendingLocalFilesRef.current = files;
  draftFilesRef.current = draftFiles;
  activeDraftIdRef.current = activeDraftId;
  draftSummaryIdRef.current = String(draftSummary?.id || "").trim() || null;
  const recentLabsRef = useRef(recentLabs);
  recentLabsRef.current = recentLabs;
  const pinnedLabsRef = useRef(pinnedLabs);
  pinnedLabsRef.current = pinnedLabs;
  const findCachedLab = useCallback(
    (labId: string, labName: string) =>
      [...pinnedLabsRef.current, ...recentLabsRef.current].find((b) => {
        const id = String(b?._id || "").trim();
        if (labId && id === labId) return true;
        return String(b?.name || "").trim() === labName;
      }),
    [],
  );
  const todayDate = useMemo(() => toKstDateInputValue(new Date()), []);
  const [orderDate, setOrderDate] = useState(todayDate);
  const [arrivalDefaultDays, setArrivalDefaultDays] = useState(DEFAULT_ARRIVAL_OFFSET_DAYS);
  const [arrivalDate, setArrivalDate] = useState(
    addDaysToDateInput(todayDate, DEFAULT_ARRIVAL_OFFSET_DAYS),
  );

  const [prosthesisTypeSettingsDialogOpen, setProsthesisTypeSettingsDialogOpen] = useState(false);
  const [prosthesisTypeInput, setProsthesisTypeInput] = useState("");
  const [prosthesisTypeCatalog, setProsthesisTypeCatalog] = useState<string[]>([...PRESET_PROSTHESIS_TYPES]);
  const [prosthesisTypeCatalogDraft, setProsthesisTypeCatalogDraft] = useState<string[]>([
    ...PRESET_PROSTHESIS_TYPES,
  ]);
  const [savingProsthesisTypeSettings, setSavingProsthesisTypeSettings] = useState(false);
  const [memoSnippets, setMemoSnippets] = useState<string[]>([]);
  const [implantFavorites, setImplantFavorites] = useState<PracticeImplantFavorite[]>([]);
  const [abutmentFavorites, setAbutmentFavorites] = useState<PracticeAbutmentFavorite[]>([]);
  const [recentTransfersAllOpen, setRecentTransfersAllOpen] = useState(false);
  const [recentTransfersOpen, setRecentTransfersOpen] = useState(true);
  const [draftsPanelOpen, setDraftsPanelOpen] = useState(true);
  const [trashPanelOpen, setTrashPanelOpen] = useState(true);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const { connections: implantConnections } = useImplantConnectionCatalog(authToken);

  const [toothWorks, setToothWorks] = useState<ToothWorkSelection[]>([]);
  const [patientName, setPatientName] = useState("");

  const normalizedProsthesisTypes = useMemo(
    () => ensurePresetProsthesisTypes(prosthesisTypeCatalog),
    [prosthesisTypeCatalog],
  );
  const normalizedToothWorks = useMemo(() => normalizeToothWorks(toothWorks), [toothWorks]);
  const syncToothWorks = useMemo(
    () => normalizeToothWorksForSync(toothWorks),
    [toothWorks],
  );
  const effectiveSkipJig = useMemo(
    () => resolvePracticeTransferSkipJig(normalizedToothWorks, skipJig),
    [normalizedToothWorks, skipJig],
  );
  const normalizedPatientName = useMemo(
    () => String(patientName || "").trim().normalize("NFC"),
    [patientName],
  );
  const currentFormFingerprint = useMemo(
    () =>
      buildPracticeTransferFormFingerprint({
        targetLabAnchorId: selectedLab?._id,
        targetLabName: selectedLab?.name,
        patientName: normalizedPatientName,
        orderDate,
        arrivalDate,
        arrivalDefaultDays,
        requestMemo,
        prosthesisTypes: normalizedProsthesisTypes,
        toothWorks: syncToothWorks,
      }),
    [
      selectedLab?._id,
      selectedLab?.name,
      normalizedPatientName,
      orderDate,
      arrivalDate,
      arrivalDefaultDays,
      requestMemo,
      normalizedProsthesisTypes,
      syncToothWorks,
    ],
  );
  const autoClinicName = useMemo(() => {
    const profileClinic = String(authUser?.practiceProfile?.clinicName || "").trim();
    if (profileClinic) return profileClinic;
    return String(
      (authUser as { business?: string } | null)?.business ||
        authUser?.companyName ||
        authUser?.name ||
        "",
    ).trim();
  }, [authUser]);

  const orderedToothWorkRows = useMemo(() => {
    if (toothWorks.length === 0) return [] as Array<{
      row: ToothWorkSelection;
      originalIndex: number;
      linkPrev: boolean;
      linkNext: boolean;
    }>;

    const rows = toothWorks.map((row, idx) => ({ row, idx }));
    const toothIndices = rows
      .filter(({ row }) => /^[1-4][1-8]$/.test(String(row.toothNumber || "").trim()))
      .map(({ idx }) => idx);

    const byTooth = new Map<string, number>();
    for (const { row, idx } of rows) {
      const tooth = String(row.toothNumber || "").trim();
      if (!/^[1-4][1-8]$/.test(tooth)) continue;
      if (!byTooth.has(tooth)) byTooth.set(tooth, idx);
    }

    const toothSet = new Set(toothIndices);
    const adjacency = new Map<number, Set<number>>();
    toothIndices.forEach((idx) => adjacency.set(idx, new Set<number>()));

    for (const idx of toothIndices) {
      const row = rows[idx].row;
      const links = Array.isArray(row.bridgeLinkedTeeth) ? row.bridgeLinkedTeeth : [];
      for (const linked of links) {
        const linkedIdx = byTooth.get(String(linked || "").trim());
        if (linkedIdx == null) continue;
        if (!toothSet.has(linkedIdx)) continue;
        adjacency.get(idx)?.add(linkedIdx);
        adjacency.get(linkedIdx)?.add(idx);
      }
    }

    const componentKeyByIdx = new Map<number, string>();
    const visited = new Set<number>();

    for (const seed of toothIndices) {
      if (visited.has(seed)) continue;
      const stack = [seed];
      const component: number[] = [];
      visited.add(seed);

      while (stack.length > 0) {
        const cur = stack.pop() as number;
        component.push(cur);
        const nexts = adjacency.get(cur) || new Set<number>();
        for (const n of nexts) {
          if (visited.has(n)) continue;
          visited.add(n);
          stack.push(n);
        }
      }

      component.sort(
        (a, b) =>
          toToothSortNumber(rows[a].row.toothNumber) - toToothSortNumber(rows[b].row.toothNumber),
      );
      const key = component.map((idx) => rows[idx].row.toothNumber).join("-");
      component.forEach((idx) => componentKeyByIdx.set(idx, key));
    }

    const emitted = new Set<number>();
    const orderedIndices: number[] = [];

    for (let i = 0; i < rows.length; i += 1) {
      if (emitted.has(i)) continue;
      const key = componentKeyByIdx.get(i);
      if (!key) {
        orderedIndices.push(i);
        emitted.add(i);
        continue;
      }

      const componentIndices = toothIndices.filter((idx) => componentKeyByIdx.get(idx) === key);
      const componentSet = new Set(componentIndices);
      const sortedByTooth = [...componentIndices].sort(
        (a, b) =>
          toToothSortNumber(rows[a].row.toothNumber) - toToothSortNumber(rows[b].row.toothNumber),
      );
      const endpoints = sortedByTooth.filter((idx) => {
        const degree = [...(adjacency.get(idx) || new Set<number>())].filter((n) => componentSet.has(n))
          .length;
        return degree <= 1;
      });
      const start = endpoints[0] ?? sortedByTooth[0];

      const orderedComponent: number[] = [];
      const componentVisited = new Set<number>();
      let current = start;
      let prev = -1;

      while (current >= 0 && !componentVisited.has(current)) {
        orderedComponent.push(current);
        componentVisited.add(current);

        const nextCandidates = [...(adjacency.get(current) || new Set<number>())]
          .filter((n) => componentSet.has(n) && !componentVisited.has(n))
          .sort(
            (a, b) =>
              toToothSortNumber(rows[a].row.toothNumber) - toToothSortNumber(rows[b].row.toothNumber),
          );

        if (nextCandidates.length === 0) break;
        const preferred = nextCandidates.find((n) => n !== prev);
        const nextIdx = preferred ?? nextCandidates[0];
        prev = current;
        current = nextIdx;
      }

      if (orderedComponent.length < componentIndices.length) {
        const remains = sortedByTooth.filter((idx) => !componentVisited.has(idx));
        orderedComponent.push(...remains);
      }

      orderedComponent.forEach((idx) => {
        if (emitted.has(idx)) return;
        orderedIndices.push(idx);
        emitted.add(idx);
      });
    }

    return orderedIndices.map((originalIndex, orderedIndex, arr) => {
      const row = rows[originalIndex].row;
      const key = componentKeyByIdx.get(originalIndex) || "";
      const prevIdx = orderedIndex > 0 ? arr[orderedIndex - 1] : -1;
      const nextIdx = orderedIndex < arr.length - 1 ? arr[orderedIndex + 1] : -1;
      const linkPrev =
        key.length > 0 && prevIdx >= 0 && componentKeyByIdx.get(prevIdx) === key;
      const linkNext =
        key.length > 0 && nextIdx >= 0 && componentKeyByIdx.get(nextIdx) === key;

      return { row, originalIndex, linkPrev, linkNext };
    });
  }, [toothWorks]);

  const {
    ensureFilesUploaded,
    peekCachedUploadedFiles,
    preUploadFiles,
    forgetFile,
    clearPreUploadCache,
    uploadProgress,
  } = useFilePreUpload({ token: authToken });
  const { rooms: chatRooms } = useChatRooms();

  const resolveUploadedTempFiles = useCallback(
    async (targetFiles: File[]) => {
      if (!targetFiles.length) return [];
      return (
        peekCachedUploadedFiles(targetFiles) ??
        (await ensureFilesUploaded(targetFiles))
      );
    },
    [ensureFilesUploaded, peekCachedUploadedFiles],
  );

  useEffect(() => {
    if (!authToken || files.length === 0) return;
    preUploadFiles(files);
  }, [authToken, files, preUploadFiles]);

  const clearLocalFilesWithCache = useCallback(async () => {
    clearPreUploadCache();
    await clearAllFiles();
  }, [clearAllFiles, clearPreUploadCache]);

  const {
    messages: chatMessages,
    loading: chatMessagesLoading,
    error: chatMessagesError,
    sendMessage,
    toggleReaction,
    prefetchMessages,
    setMessages: setChatMessages,
  } = useChatMessages({ roomId: activeChatRoom?._id, autoFetch: transferDialogOpen });

  const displayChatMessages = useMemo(() => {
    const currentUserId = String(authUser?.id || "");
    return chatMessages.map((message) => {
      const senderId = String(message.sender?._id || "");
      const name = anonymizeAutoMatchChatSenderName({
        matchingMode: selectedTransfer?.matchingMode,
        isOwn: senderId === currentUserId,
        counterpartLabel: "기공소",
        name: String(message.sender?.name || ""),
      });
      return {
        ...message,
        sender: { ...message.sender, name },
      };
    });
  }, [authUser, chatMessages, selectedTransfer?.matchingMode]);

  const combinedFilesSizeMb = useMemo(() => {
    const localBytes = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
    const draftBytes = draftFiles.reduce((sum, file) => sum + Number(file.size || 0), 0);
    return ((localBytes + draftBytes) / (1024 * 1024)).toFixed(1);
  }, [files, draftFiles]);

  const combinedDisplayFiles = useMemo(
    () => [
      ...files.map((file, index) => ({
        kind: "local" as const,
        key: `${file.name}:${file.size}:${file.lastModified}:${index}`,
        name: String(file.name || "").trim(),
        size: Number(file.size || 0),
        localIndex: index,
      })),
      ...draftFiles.map((file, index) => ({
        kind: "draft" as const,
        key: `${file.fileId}:${file.s3Key}:${index}`,
        name: String(file.originalName || "").trim(),
        size: Number(file.size || 0),
        draftIndex: index,
      })),
    ],
    [files, draftFiles],
  );

  const applyPracticeTransferSettings = useCallback((payload: PracticeTransferSettingsPayload | null) => {
    if (!payload || typeof payload !== "object") return;
    const nextArrivalDefaultDays = normalizeArrivalDefaultDays(
      Number(payload.arrivalDefaultDays ?? DEFAULT_ARRIVAL_OFFSET_DAYS),
    );
    const nextProsthesisTypes = ensurePresetProsthesisTypes(
      Array.isArray(payload.prosthesisTypes) ? payload.prosthesisTypes : [...PRESET_PROSTHESIS_TYPES],
    );
    const nextMemoSnippets = normalizeMemoSnippets(payload.memoSnippets);
    const nextImplantFavorites = normalizeImplantFavorites(payload.implantFavorites);
    const nextAbutmentFavorites = normalizeAbutmentFavorites(payload.abutmentFavorites);
    const nextSkipDesignConfirm = payload.skipDesignConfirm !== false;
    const nextSkipJig = payload.skipJig !== false;
    const nextDefaultAbutmentProductMode = normalizeAccountAbutmentProductMode(
      payload.defaultAbutmentProductMode,
    );
    const hasAutoMatchMinLabRating = Object.prototype.hasOwnProperty.call(
      payload,
      "autoMatchMinLabRating",
    );
    const nextMinStars = hasAutoMatchMinLabRating
      ? normalizeAutoMatchMinLabRating(payload.autoMatchMinLabRating)
      : null;
    const hasAutoMatchBudget = Object.prototype.hasOwnProperty.call(
      payload,
      "autoMatchBudget",
    );
    const nextAutoMatchBudget =
      hasAutoMatchBudget || nextMinStars != null
        ? resolveAutoMatchBudgetOrDefaults(
            payload.autoMatchBudget,
            payload.abutsLabFeeCatalog,
            nextMinStars != null ? { minStars: nextMinStars } : undefined,
          )
        : null;
    if (Array.isArray(payload.abutsLabFeeCatalog)) {
      setAbutsLabFeeCatalog(payload.abutsLabFeeCatalog);
    }

    setArrivalDefaultDays(nextArrivalDefaultDays);
    setProsthesisTypeCatalog(nextProsthesisTypes);
    setProsthesisTypeCatalogDraft(nextProsthesisTypes);
    setMemoSnippets(nextMemoSnippets);
    setImplantFavorites(nextImplantFavorites);
    setAbutmentFavorites(nextAbutmentFavorites);
    setSkipDesignConfirm(nextSkipDesignConfirm);
    setSkipJig(nextSkipJig);
    setDefaultAbutmentProductMode(nextDefaultAbutmentProductMode);
    // 로컬 캐시에 키가 없으면 기본값으로 덮지 않음(서버 응답·명시 저장만 반영)
    if (nextAutoMatchBudget) {
      setAutoMatchBudget(nextAutoMatchBudget);
    }
    if (hasAutoMatchMinLabRating) {
      setAutoMatchMinLabRating(
        normalizeAutoMatchMinLabRating(payload.autoMatchMinLabRating),
      );
    }
    setToothWorks((prev) =>
      prev.map((row) => {
        const customAbutment = Boolean(row.customAbutment);
        return {
          toothNumber: row.toothNumber,
          prosthesisType: nextProsthesisTypes.some((type) => type === row.prosthesisType)
            ? row.prosthesisType
            : resolveDefaultProsthesisType(nextProsthesisTypes),
          customAbutment,
          ...pickToothWorkAbutmentProductMode(row, customAbutment),
          bridgeLinkedTeeth: Array.isArray(row.bridgeLinkedTeeth) ? row.bridgeLinkedTeeth : [],
          ...pickToothWorkCustomSpecs(row, customAbutment),
        };
      }),
    );
  }, []);

  const savePracticeTransferSettingsToServer = useCallback(
    async (params: Partial<PracticeTransferSettingsPayload>) => {
      if (!authToken) return false;

      const hasArrivalDefaultDays = typeof params.arrivalDefaultDays === "number";
      const hasProsthesisTypes = Array.isArray(params.prosthesisTypes);
      const hasMemoSnippets = Array.isArray(params.memoSnippets);
      const hasImplantFavorites = Array.isArray(params.implantFavorites);
      const hasAbutmentFavorites = Array.isArray(params.abutmentFavorites);
      const hasSkipDesignConfirm = Object.prototype.hasOwnProperty.call(
        params,
        "skipDesignConfirm",
      );
      const hasSkipJig = Object.prototype.hasOwnProperty.call(params, "skipJig");
      const hasDefaultAbutmentProductMode = Object.prototype.hasOwnProperty.call(
        params,
        "defaultAbutmentProductMode",
      );
      const hasAutoMatchMinLabRating = Object.prototype.hasOwnProperty.call(
        params,
        "autoMatchMinLabRating",
      );

      const jsonBody: Record<string, unknown> = {};
      if (hasArrivalDefaultDays) {
        jsonBody.arrivalDefaultDays = normalizeArrivalDefaultDays(Number(params.arrivalDefaultDays));
      }
      if (hasProsthesisTypes) {
        jsonBody.prosthesisTypes = normalizeProsthesisTypes(params.prosthesisTypes || []);
      }
      if (hasMemoSnippets) {
        jsonBody.memoSnippets = normalizeMemoSnippets(params.memoSnippets || []);
      }
      if (hasImplantFavorites) {
        jsonBody.implantFavorites = normalizeImplantFavorites(params.implantFavorites || []);
      }
      if (hasAbutmentFavorites) {
        jsonBody.abutmentFavorites = normalizeAbutmentFavorites(params.abutmentFavorites || []);
      }
      if (hasSkipDesignConfirm) {
        jsonBody.skipDesignConfirm = params.skipDesignConfirm !== false;
      }
      if (hasSkipJig) {
        jsonBody.skipJig = params.skipJig !== false;
      }
      if (hasDefaultAbutmentProductMode) {
        jsonBody.defaultAbutmentProductMode = normalizeAccountAbutmentProductMode(
          params.defaultAbutmentProductMode,
        );
      }
      // autoMatchBudget는 서버에서 무시(v4: 별점으로 조립).
      if (hasAutoMatchMinLabRating) {
        jsonBody.autoMatchMinLabRating = normalizeAutoMatchMinLabRating(
          params.autoMatchMinLabRating,
        );
      }
      if (Object.keys(jsonBody).length === 0) return true;

      const res = await apiFetch<unknown>({
        path: "/api/practice/transfers/settings",
        method: "POST",
        token: authToken,
        jsonBody,
      });

      if (!res.ok) {
        const body = asApiMessagePayload(res.data);
        throw new Error(String(body?.message || "전송 설정 저장에 실패했습니다."));
      }

      const body =
        res.data && typeof res.data === "object"
          ? (res.data as { data?: unknown })
          : {};
      const payload =
        body.data && typeof body.data === "object"
          ? (body.data as PracticeTransferSettingsPayload)
          : null;

      applyPracticeTransferSettings(payload);

      try {
        localStorage.setItem(
          PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY,
          JSON.stringify({
            arrivalDefaultDays: normalizeArrivalDefaultDays(
              Number(payload?.arrivalDefaultDays ?? DEFAULT_ARRIVAL_OFFSET_DAYS),
            ),
            prosthesisTypes: normalizeProsthesisTypes(
              Array.isArray(payload?.prosthesisTypes)
                ? payload?.prosthesisTypes
                : [...PRESET_PROSTHESIS_TYPES],
            ),
            memoSnippets: normalizeMemoSnippets(
              Array.isArray(payload?.memoSnippets) ? payload?.memoSnippets : memoSnippets,
            ),
            implantFavorites: normalizeImplantFavorites(
              Array.isArray(payload?.implantFavorites) ? payload?.implantFavorites : implantFavorites,
            ),
            abutmentFavorites: normalizeAbutmentFavorites(
              Array.isArray(payload?.abutmentFavorites)
                ? payload?.abutmentFavorites
                : abutmentFavorites,
            ),
            skipDesignConfirm: payload?.skipDesignConfirm !== false,
            skipJig: payload?.skipJig !== false,
            defaultAbutmentProductMode: normalizeAccountAbutmentProductMode(
              payload?.defaultAbutmentProductMode,
            ),
            autoMatchMinLabRating: normalizeAutoMatchMinLabRating(
              payload?.autoMatchMinLabRating ??
                (hasAutoMatchMinLabRating
                  ? params.autoMatchMinLabRating
                  : undefined),
            ),
            savedAt: Date.now(),
          }),
        );
      } catch {
        // ignore
      }

      return true;
    },
    [applyPracticeTransferSettings, authToken, memoSnippets, implantFavorites, abutmentFavorites, abutsLabFeeCatalog],
  );

  const myUserId = String(authUser?.id || (authUser as { _id?: string } | null)?._id || "").trim();

  const loadPracticeTransferDraftList = useCallback(async () => {
    if (!authToken) {
      setPracticeDraftList([]);
      setTrashedDraftList([]);
      return;
    }

    const seq = ++draftListSeqRef.current;

    try {
      const res = await apiFetch<unknown>({
        path: "/api/practice/transfers/drafts?trashed=all",
        method: "GET",
        token: authToken,
        skipCache: true,
      });

      if (seq !== draftListSeqRef.current) return;

      // 목록 조회가 실패하면 stale-form 검증을 돌리지 않는다(오삭제 방지)
      if (!res.ok) return;

      const body =
        res.data && typeof res.data === "object"
          ? (res.data as { data?: unknown })
          : {};
      const payload = body.data;
      const parseRows = (rows: unknown) => {
        if (!Array.isArray(rows)) return [] as DraftListSummary[];
        return rows
          .map((row) =>
            row && typeof row === "object"
              ? toDraftListSummary(row as PracticeTransferDraftPayload, myUserId)
              : null,
          )
          .filter((row): row is DraftListSummary => Boolean(row));
      };

      if (Array.isArray(payload)) {
        setPracticeDraftList(parseRows(payload));
        setTrashedDraftList([]);
      } else if (payload && typeof payload === "object") {
        const grouped = payload as { drafts?: unknown; trashed?: unknown };
        setPracticeDraftList(parseRows(grouped.drafts));
        setTrashedDraftList(parseRows(grouped.trashed));
      } else {
        setPracticeDraftList([]);
        setTrashedDraftList([]);
      }
      draftListLoadedRef.current = true;
    } catch {
      // ignore
    }
  }, [authToken, myUserId]);

  const applyPracticeDraftPayload = useCallback(
    (
      payload: PracticeTransferDraftPayload & { forceResync?: boolean },
      options?: { keepActiveDraftIdOnEmpty?: boolean; forceResync?: boolean },
    ) => {
      if (imeComposingRef.current) {
        pendingDraftApplyRef.current = payload;
        return;
      }

      const forceResync = Boolean(options?.forceResync || payload.forceResync);

      // 파일 업로드 중에는 HTTP 응답이 SSOT. forceResync echo는 업로드 종료 후 적용.
      if (fileSyncInFlightRef.current) {
        if (forceResync) {
          pendingDraftApplyRef.current = { ...payload, forceResync: true };
        }
        return;
      }

      const keepActiveDraftIdOnEmpty = Boolean(options?.keepActiveDraftIdOnEmpty);
      const ownedPayload: PracticeTransferDraftPayload = {
        ...payload,
        practiceUserId: String(payload.practiceUserId || myUserId).trim() || myUserId,
      };
      const summary = toDraftListSummary(ownedPayload, myUserId);
      const restoredFiles = summary?.files || [];

      setDraftFiles(restoredFiles);
      if (!summary) {
        setDraftSummary(null);
        if (!keepActiveDraftIdOnEmpty) setActiveDraftId(null);
        lastSavedFormFingerprintRef.current = null;
        setLastSavedFormFingerprint(null);
        lastAppliedServerUpdatedAtRef.current = 0;
        pendingLocalFormEditRef.current = false;
        setFormSyncStatus("idle");
        return;
      }

      setDraftSummary(summary);
      setActiveDraftId(summary.id);

      const serverUpdatedAt = payload.updatedAt
        ? new Date(String(payload.updatedAt)).getTime()
        : 0;
      const parsed = parsePracticeTransferMemoMeta(String(payload.transferMemo || ""));
      const serverFingerprint = buildPracticeTransferFormFingerprint({
        targetLabAnchorId: payload.targetLabAnchorId,
        targetLabName: payload.targetLabName,
        patientName: parsed.patientName,
        orderDate: parsed.orderDate,
        arrivalDate: parsed.arrivalDate,
        arrivalDefaultDays: parsed.arrivalDefaultDays,
        requestMemo: parsed.memo,
        prosthesisTypes: parsed.prosthesisTypes,
        toothWorks: parsed.toothWorks,
      });
      const currentFingerprint = currentFormFingerprintRef.current;
      // 서버 updatedAt 기준 LWW. 로컬 입력 중이라도 커밋된 원격 스냅샷이 더 최신이면 반영한다.
      // (같은 계정 다중 탭/창에서도 동기화가 막히지 않게 한다.)

      // 동일 내용 echo는 타임스탬프만 맞추고 폼 setState는 생략한다.
      // 파일 재동기화(forceResync)는 동료/다른 PC에 전체 스냅샷을 다시 밀어 넣는다.
      if (
        !forceResync &&
        restoredFiles.length > 0 &&
        serverFingerprint === currentFingerprint
      ) {
        lastSavedFormFingerprintRef.current = serverFingerprint;
        setLastSavedFormFingerprint(serverFingerprint);
        pendingLocalFormEditRef.current = false;
        if (Number.isFinite(serverUpdatedAt) && serverUpdatedAt > 0) {
          lastAppliedServerUpdatedAtRef.current = Math.max(
            lastAppliedServerUpdatedAtRef.current,
            serverUpdatedAt,
          );
          localFormUpdatedAtRef.current = Math.max(localFormUpdatedAtRef.current, serverUpdatedAt);
        }
        setFormSyncStatus("saved");
        return;
      }

      // 같은 updatedAt echo(방금 HTTP로 이미 반영)는 폼을 다시 덮지 않는다.
      // forceResync는 파일 재동기화로 전체 폼을 맞춤.
      // 드롭존→대시보드 handoff 등 로컬 폼이 더 최신이면 서버 스냅샷으로 덮지 않는다.
      const shouldRestoreForm =
        restoredFiles.length > 0 &&
        (forceResync ||
          (Number.isFinite(serverUpdatedAt) &&
            serverUpdatedAt > 0 &&
            serverUpdatedAt > lastAppliedServerUpdatedAtRef.current &&
            serverUpdatedAt > localFormUpdatedAtRef.current));

      if (shouldRestoreForm) {
        suppressLocalFormPersistRef.current = true;
        skipFormAutosaveRef.current = true;
        // 주문일 setState가 도착일 자동계산 effect를 돌리기 전에 먼저 막는다.
        skipNextArrivalAutoSyncRef.current = true;

        const labId = String(payload.targetLabAnchorId || "").trim();
        const labName = String(payload.targetLabName || "").trim();
        // 서버 스냅샷이 비어 있으면 로컬/최근 기공소 캐시를 남기지 않는다.
        if (labName) {
          setSelectedLab((prev) => {
            const coerced = coerceAutoMatchLab({
              labId,
              labName,
              matchingMode:
                (payload as { matchingMode?: string | null })?.matchingMode ??
                null,
            });
            if (coerced) return coerced;
            const fromRecent = findCachedLab(labId, labName);
            const samePrev =
              prev &&
              ((labId && String(prev._id || "").trim() === labId) ||
                String(prev.name || "").trim() === labName)
                ? prev
                : null;
            return {
              _id:
                (isMongoObjectIdString(labId) ? labId : "") ||
                (isMongoObjectIdString(fromRecent?._id) ? String(fromRecent?._id) : "") ||
                (isMongoObjectIdString(samePrev?._id) ? String(samePrev?._id) : "") ||
                `draft-lab:${labName}`,
              name: labName || String(fromRecent?.name || samePrev?.name || "").trim(),
              businessNumber: String(
                fromRecent?.businessNumber || samePrev?.businessNumber || "",
              ).trim(),
              representativeName: String(
                fromRecent?.representativeName || samePrev?.representativeName || "",
              ).trim(),
              address: String(fromRecent?.address || samePrev?.address || "").trim(),
              businessType: String(
                fromRecent?.businessType || samePrev?.businessType || "requestor",
              ).trim() || "requestor",
            };
          });
        } else {
          setSelectedLab(null);
        }

        skipNextArrivalAutoSyncRef.current = true;
        setOrderDate(todayDate);
        {
          const restoredArrival = String(parsed.arrivalDate || "").trim();
          setArrivalDate(
            restoredArrival && restoredArrival >= todayDate
              ? restoredArrival
              : addDaysToDateInput(todayDate, normalizeArrivalDefaultDays(Number(parsed.arrivalDefaultDays ?? arrivalDefaultDays))),
          );
        }
        if (Number.isFinite(Number(parsed.arrivalDefaultDays))) {
          const days = normalizeArrivalDefaultDays(Number(parsed.arrivalDefaultDays));
          setArrivalDefaultDays(days);
        }
        {
          const types = ensurePresetProsthesisTypes(parsed.prosthesisTypes);
          setProsthesisTypeCatalog(types);
          setProsthesisTypeCatalogDraft(types);
        }
        setPatientName(String(parsed.patientName || "").normalize("NFC"));
        setRequestMemo(String(parsed.memo || ""));

        const prosthesisTypesForRestore = ensurePresetProsthesisTypes(parsed.prosthesisTypes);
        const fallbackToothRow = {
          toothNumber: "",
          prosthesisType: resolveDefaultProsthesisType(prosthesisTypesForRestore),
          customAbutment: false,
          bridgeLinkedTeeth: [] as string[],
        };
        let nextToothWorks: ToothWorkSelection[] = [fallbackToothRow];
        if (parsed.toothWorks.length > 0) {
          const restoredRows = restoreToothWorksFromDraft(parsed.toothWorks, {
            prosthesisTypes: prosthesisTypesForRestore,
            isCustomAbutmentSupportedProsthesisType,
            isBridgeLikeProsthesisType,
            getAdjacentTeeth,
            fallbackProsthesisType: "크라운",
          });
          if (restoredRows.length > 0) nextToothWorks = restoredRows;
        }
        setToothWorks(nextToothWorks);

        const alignedFingerprint = buildPracticeTransferFormFingerprint({
          targetLabAnchorId: payload.targetLabAnchorId,
          targetLabName: payload.targetLabName,
          patientName: String(parsed.patientName || "").normalize("NFC"),
          orderDate: parsed.orderDate,
          arrivalDate: parsed.arrivalDate,
          arrivalDefaultDays: parsed.arrivalDefaultDays,
          requestMemo: parsed.memo,
          prosthesisTypes: prosthesisTypesForRestore,
          toothWorks: nextToothWorks,
        });
        lastSavedFormFingerprintRef.current = alignedFingerprint;
        setLastSavedFormFingerprint(alignedFingerprint);
        currentFormFingerprintRef.current = alignedFingerprint;
        pendingLocalFormEditRef.current = false;
        if (Number.isFinite(serverUpdatedAt) && serverUpdatedAt > 0) {
          lastAppliedServerUpdatedAtRef.current = Math.max(
            lastAppliedServerUpdatedAtRef.current,
            serverUpdatedAt,
          );
          localFormUpdatedAtRef.current = Math.max(localFormUpdatedAtRef.current, serverUpdatedAt);
        }
        setFormSyncStatus("saved");

        // useEffect(local persist)보다 뒤에 suppress를 풀어야
        // 반영 직후 localUpdatedAt이 Date.now()로 덮여 이후 동기화가 막히지 않는다.
        window.setTimeout(() => {
          suppressLocalFormPersistRef.current = false;
          skipFormAutosaveRef.current = false;
        }, 0);
      } else if (restoredFiles.length > 0) {
        // 서버 스냅샷은 알되, 이미 적용한 버전 이하면 로컬 유지 + 필요 시 재업로드.
        lastSavedFormFingerprintRef.current = serverFingerprint;
        setLastSavedFormFingerprint(serverFingerprint);
        if (currentFingerprint !== serverFingerprint) {
          pendingLocalFormEditRef.current = true;
          setFormSyncStatus("pending");
        } else {
          pendingLocalFormEditRef.current = false;
          setFormSyncStatus("saved");
        }
      }

      if (import.meta.env.DEV) {
        console.info("[practice-transfer] applyDraftPayload", {
          restoredFilesCount: restoredFiles.length,
          shouldRestoreForm,
          localFormUpdatedAt: localFormUpdatedAtRef.current,
          serverUpdatedAt,
        });
      }
    },
    [myUserId, setRequestMemo, setSelectedLab],
  );

  const loadPracticeTransferDraft = useCallback(async (options?: { draftId?: string | null }) => {
    if (!authToken) {
      setDraftFiles([]);
      setDraftSummary(null);
      setActiveDraftId(null);
      return;
    }

    // options.draftId를 넘긴 호출만 해당 건을 로드. 미지정 시 activeDraftId만 사용.
    // draftId가 비면 최신 임시저장을 폼에 자동 주입하지 않는다(다중 임시저장·전송 후 연속 전송 방지).
    const requestedDraftId = String(
      options && "draftId" in options
        ? options.draftId || ""
        : activeDraftIdRef.current || "",
    ).trim();
    if (!requestedDraftId) return;

    try {
      const res = await apiFetch<unknown>({
        path: `/api/practice/transfers/draft?draftId=${encodeURIComponent(requestedDraftId)}`,
        method: "GET",
        token: authToken,
      });
      if (!res.ok) return;

      const body =
        res.data && typeof res.data === "object"
          ? (res.data as { data?: unknown })
          : {};
      const payload =
        body.data && typeof body.data === "object"
          ? (body.data as PracticeTransferDraftPayload)
          : null;

      if (!payload) {
        setDraftFiles([]);
        setDraftSummary(null);
        // 요청한 draftId가 없거나(삭제/휴지통)면 stale id를 비운다.
        setActiveDraftId(null);
        activeDraftSeenInListRef.current = null;
        lastSavedFormFingerprintRef.current = null;
        setLastSavedFormFingerprint(null);
        lastAppliedServerUpdatedAtRef.current = 0;
        pendingLocalFormEditRef.current = false;
        setFormSyncStatus("idle");
        return;
      }

      applyPracticeDraftPayload(payload, {
        keepActiveDraftIdOnEmpty: true,
      });
    } catch {
      // ignore (초안 불러오기 실패는 사용자 흐름 중단 금지)
    }
  }, [applyPracticeDraftPayload, authToken]);

  const buildOwnDraftSummary = useCallback(
    (
      payload: PracticeTransferDraftPayload | null | undefined,
      fallbackFiles: DraftTransferFileItem[],
      transferMemo: string,
    ): DraftListSummary | null => {
      const merged: PracticeTransferDraftPayload = {
        _id: String(payload?._id || draftSummary?.id || "").trim() || "draft-local",
        practiceUserId: String(payload?.practiceUserId || myUserId).trim() || myUserId,
        practiceUserLabel:
          String(payload?.practiceUserLabel || draftSummary?.practiceUserLabel || "").trim() ||
          "나",
        targetLabAnchorId:
          payload?.targetLabAnchorId ??
          (String(selectedLab?._id || "").trim() || null),
        targetLabName: String(
          payload?.targetLabName || selectedLab?.name || draftSummary?.targetLabName || "",
        ).trim(),
        transferMemo: String(payload?.transferMemo || transferMemo || "").trim(),
        files:
          Array.isArray(payload?.files) && payload.files.length > 0
            ? payload.files
            : fallbackFiles,
        updatedAt: payload?.updatedAt
          ? String(payload.updatedAt)
          : new Date().toISOString(),
        createdAt: payload?.createdAt
          ? String(payload.createdAt)
          : draftSummary?.createdAt || new Date().toISOString(),
      };
      return toDraftListSummary(merged, myUserId);
    },
    [
      draftSummary?.createdAt,
      draftSummary?.id,
      draftSummary?.practiceUserLabel,
      draftSummary?.targetLabName,
      myUserId,
      selectedLab?._id,
      selectedLab?.name,
    ],
  );

  const loadPracticeTransferSettingsFromServer = useCallback(async () => {
    if (!authToken) return;
    try {
      const res = await apiFetch<unknown>({
        path: "/api/practice/transfers/settings",
        method: "GET",
        token: authToken,
      });
      if (!res.ok) return;

      const body =
        res.data && typeof res.data === "object"
          ? (res.data as { data?: unknown })
          : {};
      const payload =
        body.data && typeof body.data === "object"
          ? (body.data as PracticeTransferSettingsPayload)
          : null;

      if (localFormUpdatedAtRef.current <= 0) {
        applyPracticeTransferSettings(payload);
      } else if (payload) {
        // 폼 로컬값이 있어도 계정 세팅(문장·프리셋·디자인컨펌생략·지그생략·커스텀어벗 기본모드·자동매칭 예산·최소 별)은 서버를 우선 반영
        setMemoSnippets(normalizeMemoSnippets(payload.memoSnippets));
        setSkipDesignConfirm(payload.skipDesignConfirm !== false);
        setSkipJig(payload.skipJig !== false);
        setDefaultAbutmentProductMode(
          normalizeAccountAbutmentProductMode(payload.defaultAbutmentProductMode),
        );
        setImplantFavorites(normalizeImplantFavorites(payload.implantFavorites));
        setAbutmentFavorites(normalizeAbutmentFavorites(payload.abutmentFavorites));
        setAutoMatchMinLabRating(
          normalizeAutoMatchMinLabRating(payload.autoMatchMinLabRating),
        );
        setAutoMatchBudget(
          resolveAutoMatchBudgetOrDefaults(
            payload.autoMatchBudget,
            payload.abutsLabFeeCatalog ?? abutsLabFeeCatalog,
            {
              minStars: normalizeAutoMatchMinLabRating(
                payload.autoMatchMinLabRating,
              ),
            },
          ),
        );
        if (Array.isArray(payload.abutsLabFeeCatalog)) {
          setAbutsLabFeeCatalog(payload.abutsLabFeeCatalog);
        }
      }
      try {
        localStorage.setItem(
          PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY,
          JSON.stringify({
            arrivalDefaultDays: normalizeArrivalDefaultDays(Number(payload?.arrivalDefaultDays ?? DEFAULT_ARRIVAL_OFFSET_DAYS)),
            prosthesisTypes: normalizeProsthesisTypes(
              Array.isArray(payload?.prosthesisTypes)
                ? payload?.prosthesisTypes
                : [...PRESET_PROSTHESIS_TYPES],
            ),
            memoSnippets: normalizeMemoSnippets(
              Array.isArray(payload?.memoSnippets) ? payload?.memoSnippets : [],
            ),
            implantFavorites: normalizeImplantFavorites(
              Array.isArray(payload?.implantFavorites) ? payload?.implantFavorites : [],
            ),
            abutmentFavorites: normalizeAbutmentFavorites(
              Array.isArray(payload?.abutmentFavorites) ? payload?.abutmentFavorites : [],
            ),
            skipDesignConfirm: payload?.skipDesignConfirm !== false,
            skipJig: payload?.skipJig !== false,
            defaultAbutmentProductMode: normalizeAccountAbutmentProductMode(
              payload?.defaultAbutmentProductMode,
            ),
            autoMatchMinLabRating: normalizeAutoMatchMinLabRating(
              payload?.autoMatchMinLabRating,
            ),
            savedAt: Date.now(),
          }),
        );
      } catch {
        // ignore
      }
    } catch {
      // ignore
    }
  }, [applyPracticeTransferSettings, authToken]);

  const loadRecentRequests = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent === true;
      if (!authToken) {
        if (!silent) {
          setRecentRequests([]);
          setRecentRequestsHasMore(false);
          setRecentRequestsError("로그인이 필요합니다.");
        }
        return;
      }

      if (!silent) {
        setRecentRequestsLoading(true);
        setRecentRequestsError("");
      }
      try {
      const res = await apiFetch<unknown>({
        path: `/api/practice/transfers/my?page=1&limit=${PRACTICE_MY_TRANSFERS_PAGE_SIZE}`,
        method: "GET",
        token: authToken,
      });

      if (!res.ok) {
        const body =
          res.data && typeof res.data === "object"
            ? (res.data as { message?: string })
            : {};
        if (!silent) {
          setRecentRequests([]);
          setRecentRequestsHasMore(false);
          setRecentRequestsError(
            String(body.message || "최근 전송 내역을 불러올 권한이 없습니다."),
          );
        }
        return;
      }

      const body = res.data;
      const data =
        body && typeof body === "object" && "data" in (body as Record<string, unknown>)
          ? (body as { data?: unknown }).data
          : body;
      const list =
        data &&
        typeof data === "object" &&
        Array.isArray((data as { requests?: unknown }).requests)
          ? ((data as { requests: unknown[] }).requests ?? [])
          : [];
      const pagination =
        data &&
        typeof data === "object" &&
        (data as { pagination?: unknown }).pagination &&
        typeof (data as { pagination?: unknown }).pagination === "object"
          ? ((data as { pagination: Record<string, unknown> }).pagination ?? {})
          : {};
      const paginationHasMore = pagination.hasMore;

      const mapped: RecentRequestItem[] = list
        .map((raw) => {
          const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
          const ci =
            r.caseInfos && typeof r.caseInfos === "object"
              ? (r.caseInfos as Record<string, unknown>)
              : {};
          const newSystemRequest =
            ci.newSystemRequest && typeof ci.newSystemRequest === "object"
              ? (ci.newSystemRequest as Record<string, unknown>)
              : {};

          const message = String(newSystemRequest.message || r.description || "").trim();
          const practiceRouting =
            ci.practiceRouting && typeof ci.practiceRouting === "object"
              ? (ci.practiceRouting as Record<string, unknown>)
              : {};
          const targetLabAnchorId = String(
            practiceRouting.targetLabAnchorId || r.targetLabAnchorId || "",
          ).trim();
          const targetLabFromRouting = String(
            practiceRouting.targetLabName || r.targetLabName || "",
          ).trim();
          const matchingMode =
            String(practiceRouting.matchingMode || r.matchingMode || "").trim() === "auto"
              ? "auto"
              : "direct";
          const targetLab =
            matchingMode === "auto"
              ? "자동 매칭"
              : targetLabFromRouting || extractLabNameFromMessage(message) || "-";
          const toothRaw = String(ci.tooth || "").trim();
          const createdAtRaw = String(r.createdAt || "");
          const strippedTransferMemo = stripPracticeTransferMessageEnvelope(message);
          const parsedMemo = parsePracticeTransferMemoMetaShared(strippedTransferMemo);
          const transferMemo = extractTransferMemoFromMessage(message);
          const orderDate = String(r.orderDate || parsedMemo.orderDate || "").trim();
          const arrivalDate = String(r.arrivalDate || parsedMemo.arrivalDate || "").trim();
          const fileObj =
            ci.file && typeof ci.file === "object"
              ? (ci.file as Record<string, unknown>)
              : {};

          const patientName = String(ci.patientName || "").trim() || "-";
          const requestId = String(r.requestId || r._id || "").trim();
          const requestMongoId = String(r.practiceTransferId || r._id || "").trim();
          const resultFilesRaw = Array.isArray(r.resultFiles) ? r.resultFiles : [];
          const resultFiles: TransferFileItem[] = resultFilesRaw
            .map((row) => {
              const item =
                row && typeof row === "object" ? (row as Record<string, unknown>) : {};
              return {
                fileName: String(item.originalName || item.fileName || "").trim(),
                s3Key: String(item.s3Key || "").trim(),
                size: Number(item.size || 0),
              };
            })
            .filter((f) => f.fileName && f.s3Key);
          const productionRaw =
            r.production && typeof r.production === "object"
              ? (r.production as Record<string, unknown>)
              : null;

          return {
            id: requestId,
            requestMongoId,
            createdAt: toDateLabel(createdAtRaw),
            requestDate: toDayLabel(createdAtRaw),
            patientName,
            patientKey: normalizePatientNameKey(patientName),
            toothNumbers: toothRaw ? [toothRaw] : [],
            targetLab,
            targetLabAnchorId: matchingMode === "auto" ? "" : targetLabAnchorId,
            matchingMode,
            status: toStatusLabel(r.manufacturerStage),
            createdAtTs: new Date(createdAtRaw).getTime(),
            transferId: extractTransferIdFromMessage(message),
            orderDate,
            arrivalDate,
            transferMemo,
            rawTransferMemo: strippedTransferMemo,
            fileName: String(fileObj.originalName || fileObj.name || "").trim(),
            fileS3Key: String(fileObj.s3Key || "").trim(),
            fileSize: Number(fileObj.size || 0),
            resultFiles,
            hasCustomAbutment: Boolean(r.hasCustomAbutment),
            productionConfirmedAt: productionRaw?.confirmedAt
              ? String(productionRaw.confirmedAt)
              : null,
            skipDesignConfirm: productionRaw?.skipDesignConfirm !== false,
            skipJig: Boolean(productionRaw?.skipJig),
            designReadyAt: productionRaw?.designReadyAt
              ? String(productionRaw.designReadyAt)
              : null,
            designFileCount: Number(productionRaw?.designFileCount || 0),
            practiceDesignConfirmedAt: productionRaw?.practiceDesignConfirmedAt
              ? String(productionRaw.practiceDesignConfirmedAt)
              : null,
            labDesignConfirmedAt: productionRaw?.labDesignConfirmedAt
              ? String(productionRaw.labDesignConfirmedAt)
              : null,
            feeQuote: parsePracticeTransferFeeQuote(r.feeQuote),
            remakeFeeQuote: parsePracticeTransferFeeQuote(
              (r.feeQuote && typeof r.feeQuote === "object"
                ? (r.feeQuote as Record<string, unknown>).remakeFeeQuote
                : null) ?? r.remakeFeeQuote,
            ),
            isRemake: Boolean(
              r.isRemake ||
                (r.remake &&
                  typeof r.remake === "object" &&
                  (String(
                    (r.remake as { sourceTransferId?: unknown }).sourceTransferId || "",
                  ).trim() ||
                    String(
                      (r.remake as { sourceTransferMongoId?: unknown })
                        .sourceTransferMongoId || "",
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
            canRateLab: Boolean(r.canRateLab),
            labRating: parsePracticeLabRatingPublic(r.labRating),
          };
        })
        .filter((item) => Boolean(item.id))
        .sort((a, b) => (b.createdAtTs || 0) - (a.createdAtTs || 0));

      setRecentRequests(mapped);
      setRecentRequestsHasMore(
        typeof paginationHasMore === "boolean"
          ? paginationHasMore
          : mapped.length >= PRACTICE_MY_TRANSFERS_PAGE_SIZE,
      );

      // 열린 상세가 있으면 목록 재조회의 확정 feeQuote·상태를 동기화
      const openTransferId = String(selectedTransferIdRef.current || "").trim();
      if (transferDialogOpenRef.current && openTransferId) {
        const openRow = mapped.find(
          (row) => String(row.transferId || "").trim() === openTransferId,
        );
        if (openRow) {
          setSelectedTransfer((prev) => {
            if (!prev || String(prev.transferId || "").trim() !== openTransferId) {
              return prev;
            }
            const nextFee = openRow.feeQuote;
            const keepBilled =
              prev.feeQuote?.billed && (!nextFee || !nextFee.billed);
            return {
              ...prev,
              status: openRow.status || prev.status,
              ...(keepBilled
                ? {}
                : nextFee
                  ? { feeQuote: nextFee }
                  : {}),
              ...(openRow.remakeFeeQuote
                ? { remakeFeeQuote: openRow.remakeFeeQuote }
                : {}),
            };
          });
        }
      }

      const labsFromTransfers: SearchBusinessResult[] = [];
      const seenLabKeys = new Set<string>();
      for (const row of mapped) {
        const labName = String(row.targetLab || "").trim();
        if (!labName || labName === "-") continue;
        const labId = String(row.targetLabAnchorId || "").trim();
        const key = labId || `name:${labName}`;
        if (seenLabKeys.has(key)) continue;
        seenLabKeys.add(key);
        labsFromTransfers.push({
          _id: labId || `recent:${labName}`,
          name: labName,
          businessType: "requestor",
        });
      }
      if (labsFromTransfers.length > 0) {
        syncRecentLabsFromTransfers(labsFromTransfers);
      }

      if (silent) {
        setRecentRequestsError("");
      }
    } catch {
      if (!silent) {
        setRecentRequests([]);
        setRecentRequestsHasMore(false);
        setRecentRequestsError("최근 전송 내역 조회 중 오류가 발생했습니다.");
      }
    } finally {
      if (!silent) {
        setRecentRequestsLoading(false);
      }
    }
  },
  [authToken, syncRecentLabsFromTransfers],
);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PracticeTransferSettingsPayload;
        applyPracticeTransferSettings(parsed);
        return;
      }
    } catch {
      // ignore
    }

    // 레거시 단독 키 마이그레이션
    try {
      const legacyRaw = localStorage.getItem("practice_transfer_memo_snippets_v1");
      if (!legacyRaw) return;
      const legacy = normalizeMemoSnippets(JSON.parse(legacyRaw));
      if (legacy.length > 0) setMemoSnippets(legacy);
    } catch {
      // ignore
    }
  }, [applyPracticeTransferSettings]);

  useEffect(() => {
    void loadPracticeTransferSettingsFromServer();
  }, [loadPracticeTransferSettingsFromServer]);

  useEffect(() => {
    void loadRecentRequests();
  }, [loadRecentRequests]);

  useEffect(() => {
    const state = location.state as { practiceTransferSubmittedToast?: boolean } | null;
    if (!state?.practiceTransferSubmittedToast) return;

    toast({
      title: "의뢰 제출 완료",
      description:
        "기공소로 의뢰가 접수되었습니다. 작성 폼은 비워 두었으니, 다음 의뢰는 대시보드에서 작성·전송하세요.",
      duration: 10000,
      className:
        "border-2 border-primary bg-primary-soft text-primary-strong shadow-xl sm:min-w-[360px]",
    });
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate, toast]);

  useEffect(() => {
    if (consumedPrefillLocationKeyRef.current === location.key) return;

    const state =
      location.state && typeof location.state === "object"
        ? (location.state as { prefilledFiles?: unknown })
        : null;

    const incomingFiles = Array.isArray(state?.prefilledFiles)
      ? state.prefilledFiles.filter((item): item is File => item instanceof File)
      : [];

    consumedPrefillLocationKeyRef.current = location.key;

    if (incomingFiles.length === 0) return;

    handleIncomingFiles(incomingFiles);
  }, [handleIncomingFiles, location.key, location.state]);

  useEffect(() => {
    try {
      const parsed = adoptDropzoneDraftIntoTransferFormIfNeeded();
      if (!parsed) return;
      const localUpdatedAt = Number(parsed.updatedAt || 0);
      if (Number.isFinite(localUpdatedAt) && localUpdatedAt > 0) {
        localFormUpdatedAtRef.current = localUpdatedAt;
      } else {
        localFormUpdatedAtRef.current = Date.now();
      }

      const restoredOrderDate = String(parsed.orderDate || "").trim() || todayDate;
      const restoredArrivalDate = String(parsed.arrivalDate || "").trim();
      const restoredArrivalDefaultDays = normalizeArrivalDefaultDays(
        Number(parsed.arrivalDefaultDays ?? DEFAULT_ARRIVAL_OFFSET_DAYS),
      );
      const restoredProsthesisTypes = ensurePresetProsthesisTypes(
        Array.isArray(parsed.prosthesisTypes)
          ? parsed.prosthesisTypes
          : [...PRESET_PROSTHESIS_TYPES],
      );
      const restoredMemo = String(parsed.requestMemo || "");
      const restoredPatientName = String(parsed.patientName || "");
      const restoredActiveDraftId = String(parsed.activeDraftId || "").trim();

      if (import.meta.env.DEV) {
        console.info("[practice-transfer] restore local form", {
          localUpdatedAt: localFormUpdatedAtRef.current,
          restoredOrderDate,
          restoredArrivalDate,
          restoredArrivalDefaultDays,
          restoredProsthesisTypes,
          restoredToothWorksCount: Array.isArray(parsed.toothWorks) ? parsed.toothWorks.length : 0,
          restoredActiveDraftId: restoredActiveDraftId || null,
        });
      }

      if (restoredArrivalDate) {
        skipNextArrivalAutoSyncRef.current = true;
      }
      setOrderDate(todayDate);
      if (restoredArrivalDate && restoredArrivalDate >= todayDate) {
        setArrivalDate(restoredArrivalDate);
      } else {
        setArrivalDate(addDaysToDateInput(todayDate, restoredArrivalDefaultDays));
      }
      setArrivalDefaultDays(restoredArrivalDefaultDays);
      setProsthesisTypeCatalog(restoredProsthesisTypes);
      setProsthesisTypeCatalogDraft(restoredProsthesisTypes);
      setRequestMemo(restoredMemo);
      setPatientName(restoredPatientName);
      if (restoredActiveDraftId) {
        setActiveDraftId(restoredActiveDraftId);
      }

      const lab = parsed.selectedLab;
      if (lab && typeof lab === "object") {
        const id = String(lab._id || "").trim();
        const name = String(lab.name || "").trim();
        if (id && name) {
          const coerced = coerceAutoMatchLab({ labId: id, labName: name });
          setSelectedLab(
            coerced || {
              _id: id,
              name,
              businessNumber: String(lab.businessNumber || "").trim(),
              representativeName: String(lab.representativeName || "").trim(),
              address: String(lab.address || "").trim(),
              businessType: String(lab.businessType || "requestor").trim(),
            },
          );
        }
      }

      if (Array.isArray(parsed.toothWorks)) {
        const restoredRows = restoreToothWorksFromDraft(parsed.toothWorks, {
          prosthesisTypes: restoredProsthesisTypes,
          isCustomAbutmentSupportedProsthesisType,
          isBridgeLikeProsthesisType,
          getAdjacentTeeth,
          fallbackProsthesisType: "크라운",
        });

        if (import.meta.env.DEV) {
          console.info("[practice-transfer] restore toothWorks from local", {
            rawCount: parsed.toothWorks.length,
            restoredCount: restoredRows.length,
            firstRow: restoredRows[0] || null,
          });
        }

        if (restoredRows.length > 0) {
          setToothWorks(restoredRows);
        }
      }

      const restoredExpressStep = normalizeExpressStepId(parsed.expressStepId);
      if (restoredExpressStep) {
        setExpressStepId(restoredExpressStep);
        expressStepRestoredRef.current = true;
      }
    } catch {
      // ignore
    } finally {
      setLocalFormHydrated(true);
    }
  }, [setRequestMemo, setSelectedLab, todayDate]);

  useEffect(() => {
    if (!localFormHydrated) return;
    if (suppressLocalFormPersistRef.current) return;

    const updatedAt = Date.now();

    const payload: PracticeTransferLocalFormDraft = {
      orderDate,
      arrivalDate,
      arrivalDefaultDays,
      prosthesisTypes: normalizedProsthesisTypes,
      requestMemo,
      patientName,
      selectedLab: selectedLab
        ? isAutoMatchLab(selectedLab)
          ? {
              _id: AUTO_MATCH_LAB._id,
              name: AUTO_MATCH_LAB.name,
              businessNumber: "",
              representativeName: "",
              address: "",
              businessType: "requestor",
            }
          : {
              _id: String(selectedLab._id || "").trim(),
              name: String(selectedLab.name || "").trim(),
              businessNumber: String(selectedLab.businessNumber || "").trim(),
              representativeName: String(selectedLab.representativeName || "").trim(),
              address: String(selectedLab.address || "").trim(),
              businessType: String(selectedLab.businessType || "requestor").trim(),
            }
        : null,
      toothWorks,
      expressStepId,
      activeDraftId: String(activeDraftId || "").trim() || null,
      updatedAt,
    };

    try {
      localStorage.setItem(PRACTICE_TRANSFER_FORM_LOCAL_KEY, JSON.stringify(payload));
      localFormUpdatedAtRef.current = updatedAt;
      currentFormFingerprintRef.current = currentFormFingerprint;
      if (
        lastSavedFormFingerprintRef.current !== null &&
        currentFormFingerprint !== lastSavedFormFingerprintRef.current
      ) {
        pendingLocalFormEditRef.current = true;
      }
      if (import.meta.env.DEV) {
        console.info("[practice-transfer] save local form", {
          updatedAt,
          orderDate,
          arrivalDate,
          arrivalDefaultDays,
          prosthesisTypes: normalizedProsthesisTypes,
          toothWorksCount: toothWorks.length,
          expressStepId,
          firstToothWork: toothWorks[0]
            ? {
                toothNumber: String(toothWorks[0].toothNumber || ""),
                prosthesisType: String(toothWorks[0].prosthesisType || ""),
              }
            : null,
        });
      }
    } catch {
      // ignore
    }
  }, [
    activeDraftId,
    arrivalDate,
    arrivalDefaultDays,
    currentFormFingerprint,
    expressStepId,
    localFormHydrated,
    normalizedProsthesisTypes,
    orderDate,
    requestMemo,
    patientName,
    selectedLab,
    toothWorks,
  ]);

  const persistFormDraftAutosave = useCallback(
    async (seq: number) => {
      if (seq !== formAutosaveSeqRef.current) return;
      if (!authToken) return;
      if (requestSubmitting || fileSyncInFlightRef.current) return;

      const filesForSave = draftFilesRef.current;
      // 파일 없이도 의뢰서 내용만으로 임시저장/동기화 가능
      const transferMemo = buildPracticeTransferMemo({
        memo: requestMemo,
        orderDate,
        arrivalDate,
        arrivalDefaultDays,
        prosthesisTypes: normalizedProsthesisTypes,
        toothWorks: syncToothWorks,
        patientName: normalizedPatientName,
        skipDesignConfirm,
        skipJig: effectiveSkipJig,
      });
      const hasLab =
        Boolean(String(selectedLab?.name || "").trim()) ||
        Boolean(toApiLabAnchorId(selectedLab?._id));
      // 기공소·완성형 한글 환자명 둘 다 있어야 임시저장/동기화한다(신규·갱신 공통).
      // IME 중간 Latin(r/rh)이나 자모만으로는 저장하지 않는다.
      if (!hasAutosaveReadyPatientName(normalizedPatientName) || !hasLab) return;

      const fingerprintAtSend = currentFormFingerprintRef.current;
      const savedFingerprint = lastSavedFormFingerprintRef.current;
      if (savedFingerprint !== null && fingerprintAtSend === savedFingerprint) {
        pendingLocalFormEditRef.current = false;
        setFormSyncStatus("saved");
        return;
      }

      // debounce 동안 파일 동기화/원격 반영이 있었으면 stale POST로 파일 목록을 되돌리지 않는다.
      const serverUpdatedAtAtStart = lastAppliedServerUpdatedAtRef.current;
      const filesCountAtStart = filesForSave.length;

      setFormSyncStatus("saving");
      let releaseAutosaveGate: (() => void) | null = null;
      try {
        const prevGate = formAutosaveGateRef.current;
        const gate = new Promise<void>((resolve) => {
          releaseAutosaveGate = resolve;
        });
        formAutosaveGateRef.current = gate;
        if (prevGate) {
          try {
            await prevGate;
          } catch {
            // ignore
          }
        }

        if (
          seq !== formAutosaveSeqRef.current ||
          fileSyncInFlightRef.current ||
          lastAppliedServerUpdatedAtRef.current > serverUpdatedAtAtStart ||
          draftFilesRef.current.length > filesCountAtStart
        ) {
          return;
        }

        const latestFilesForSave = draftFilesRef.current;
        const res = await apiFetch<unknown>({
          path: "/api/practice/transfers/draft",
          method: "POST",
          token: authToken,
          jsonBody: {
            draftId: activeDraftIdRef.current || undefined,
            targetLabAnchorId: toApiLabAnchorId(selectedLab?._id),
            targetLabName: String(selectedLab?.name || "").trim(),
            orderDate,
            arrivalDate,
            arrivalDefaultDays,
            transferMemo,
            files: latestFilesForSave.map((row) => ({
              fileId: row.fileId,
            })),
          },
        });

        if (!res.ok) {
          if (seq !== formAutosaveSeqRef.current) return;
          const body = asApiMessagePayload(res.data);
          throw new Error(String(body?.message || "임시저장 동기화에 실패했습니다."));
        }

        const body =
          res.data && typeof res.data === "object"
            ? (res.data as { data?: unknown })
            : {};
        const payload =
          body.data && typeof body.data === "object"
            ? (body.data as PracticeTransferDraftPayload)
            : null;

        // seq가 바뀌어도 draftId 없는 POST가 만든 id는 회수한다(미회수 시 r/rh/완성명이 각각 새 draft).
        const returnedDraftId = String(payload?._id || "").trim();
        if (returnedDraftId && !activeDraftIdRef.current) {
          setActiveDraftId(returnedDraftId);
          activeDraftIdRef.current = returnedDraftId;
          activeDraftSeenInListRef.current = returnedDraftId;
        }

        if (seq !== formAutosaveSeqRef.current) {
          if (returnedDraftId) {
            const orphanSummary = buildOwnDraftSummary(
              payload,
              latestFilesForSave,
              transferMemo,
            );
            if (orphanSummary?.id) {
              setPracticeDraftList((prev) => {
                const without = prev.filter((row) => row.id !== orphanSummary.id);
                return [orphanSummary, ...without];
              });
            }
          }
          return;
        }

        const nextDraftFiles = Array.isArray(payload?.files)
          ? payload.files
              .map((row) => ({
                fileId: String(row?.fileId || "").trim(),
                originalName: String(row?.originalName || "").trim(),
                mimetype: String(row?.mimetype || "application/octet-stream").trim(),
                size: Number(row?.size || 0),
                s3Key: String(row?.s3Key || "").trim(),
                location: String(row?.location || "").trim(),
              }))
              .filter((row) => row.fileId && row.originalName && row.s3Key)
          : filesForSave;

        setDraftFiles(nextDraftFiles);
        {
          const nextSummary = buildOwnDraftSummary(payload, nextDraftFiles, transferMemo);
          setDraftSummary(nextSummary);
          if (nextSummary?.id) {
            setActiveDraftId(nextSummary.id);
            activeDraftSeenInListRef.current = nextSummary.id;
            setPracticeDraftList((prev) => {
              const without = prev.filter((row) => row.id !== nextSummary.id);
              return [nextSummary, ...without];
            });
          }
          void loadPracticeTransferDraftList();
        }

        const serverUpdatedAt = payload?.updatedAt
          ? new Date(String(payload.updatedAt)).getTime()
          : Date.now();
        if (Number.isFinite(serverUpdatedAt) && serverUpdatedAt > 0) {
          lastAppliedServerUpdatedAtRef.current = Math.max(
            lastAppliedServerUpdatedAtRef.current,
            serverUpdatedAt,
          );
          localFormUpdatedAtRef.current = Math.max(
            localFormUpdatedAtRef.current,
            serverUpdatedAt,
          );
        }

        if (currentFormFingerprintRef.current === fingerprintAtSend) {
          lastSavedFormFingerprintRef.current = fingerprintAtSend;
          setLastSavedFormFingerprint(fingerprintAtSend);
          pendingLocalFormEditRef.current = false;
          setFormSyncStatus("saved");
        } else {
          pendingLocalFormEditRef.current = true;
          setFormSyncStatus("pending");
        }
      } catch {
        if (seq !== formAutosaveSeqRef.current) return;
        setFormSyncStatus("error");
      } finally {
        releaseAutosaveGate?.();
      }
    },
    [
      arrivalDate,
      arrivalDefaultDays,
      authToken,
      draftSummary?.createdAt,
      draftSummary?.id,
      loadPracticeTransferDraftList,
      buildOwnDraftSummary,
      normalizedPatientName,
      normalizedProsthesisTypes,
      syncToothWorks,
      orderDate,
      requestMemo,
      requestSubmitting,
      selectedLab?._id,
      selectedLab?.name,
      skipDesignConfirm,
      effectiveSkipJig,
    ],
  );

  /** 기공소·완성형 한글 환자명 둘 다 있어야 신규 임시저장·자동 동기화. */
  const hasSubstantialContentForNewDraft = useMemo(() => {
    const hasLab = Boolean(
      String(selectedLab?._id || selectedLab?.name || "").trim(),
    );
    return hasAutosaveReadyPatientName(normalizedPatientName) && hasLab;
  }, [normalizedPatientName, selectedLab?._id, selectedLab?.name]);

  useEffect(() => {
    if (!localFormHydrated) return;
    if (skipFormAutosaveRef.current) return;
    if (!authToken) return;
    if (requestSubmitting) return;

    const fingerprintUnchanged =
      lastSavedFormFingerprint !== null &&
      currentFormFingerprint === lastSavedFormFingerprint;

    if (fingerprintUnchanged) {
      pendingLocalFormEditRef.current = false;
      setFormSyncStatus((prev) =>
        prev === "pending" || prev === "error" || prev === "saving" ? "saved" : prev,
      );
      return;
    }

    // 기공소·완성형 한글 환자명이 모두 있을 때만 서버 동기화(치아/메모/파일만으로는 목록에 올리지 않음).
    if (!hasSubstantialContentForNewDraft) {
      pendingLocalFormEditRef.current = false;
      setFormSyncStatus((prev) =>
        prev === "pending" || prev === "saving" ? "idle" : prev,
      );
      return;
    }

    pendingLocalFormEditRef.current = true;
    setFormSyncStatus((prev) => (prev === "saving" ? prev : "pending"));

    if (formAutosaveTimerRef.current) {
      window.clearTimeout(formAutosaveTimerRef.current);
    }
    const seq = ++formAutosaveSeqRef.current;

    const scheduleAutosave = () => {
      formAutosaveTimerRef.current = window.setTimeout(() => {
        // 한글 조합 중에는 부분 글자가 저장·원격 반영되어 입력을 깨지 않도록 미룬다.
        if (imeComposingRef.current) {
          scheduleAutosave();
          return;
        }
        void persistFormDraftAutosave(seq);
      }, imeComposingRef.current ? FORM_AUTOSAVE_IME_RETRY_MS : FORM_AUTOSAVE_DEBOUNCE_MS);
    };
    scheduleAutosave();

    return () => {
      if (formAutosaveTimerRef.current) {
        window.clearTimeout(formAutosaveTimerRef.current);
        formAutosaveTimerRef.current = null;
      }
    };
  }, [
    FORM_AUTOSAVE_DEBOUNCE_MS,
    FORM_AUTOSAVE_IME_RETRY_MS,
    authToken,
    currentFormFingerprint,
    hasSubstantialContentForNewDraft,
    lastSavedFormFingerprint,
    localFormHydrated,
    persistFormDraftAutosave,
    requestSubmitting,
  ]);

  useEffect(() => {
    if (!localFormHydrated) return;
    // 로컬에 이어쓸 draftId가 있을 때만 해당 건을 폼에 복원. 목록만 항상 갱신.
    const resumeDraftId = String(activeDraftIdRef.current || "").trim();
    if (resumeDraftId) {
      void loadPracticeTransferDraft({ draftId: resumeDraftId });
    }
    void loadPracticeTransferDraftList();
    // hydrate 직후 1회. 콜백 identity 변경으로 다른 임시저장을 폼에 넣지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-shot after local hydrate
  }, [localFormHydrated]);

  /** 기공소 전송 성공 후 작성자·동료 모두 폼/로컬캐시를 비운다 */
  const resetIntakeFormAfterTransfer = useCallback(async () => {
    suppressLocalFormPersistRef.current = true;
    skipFormAutosaveRef.current = true;
    formAutosaveSeqRef.current += 1;
    if (formAutosaveTimerRef.current) {
      window.clearTimeout(formAutosaveTimerRef.current);
      formAutosaveTimerRef.current = null;
    }

    setLabOpen(false);
    setLabSearch("");
    setSelectedLab(null);
    setPatientName("");
    setRequestMemo("");
    setOrderDate(todayDate);
    setArrivalDate(addDaysToDateInput(todayDate, arrivalDefaultDays));
    setToothWorks([]);
    setDraftFiles([]);
    setDraftSummary(null);
    setActiveDraftId(null);
    activeDraftSeenInListRef.current = null;
    draftSummaryIdRef.current = null;
    lastSavedFormFingerprintRef.current = null;
    setLastSavedFormFingerprint(null);
    lastAppliedServerUpdatedAtRef.current = 0;
    pendingLocalFormEditRef.current = false;
    setFormSyncStatus("idle");
    localFormUpdatedAtRef.current = 0;

    // selectedLab: null 을 명시적으로 남겨 remount/다른 탭 hydrate가 최근 기공소를 되살리지 않게 한다.
    try {
      localStorage.setItem(
        PRACTICE_TRANSFER_FORM_LOCAL_KEY,
        JSON.stringify({
          orderDate: todayDate,
          arrivalDate: addDaysToDateInput(todayDate, arrivalDefaultDays),
          arrivalDefaultDays,
          prosthesisTypes: [],
          requestMemo: "",
          patientName: "",
          selectedLab: null,
          toothWorks: [],
          activeDraftId: null,
          updatedAt: Date.now(),
        } satisfies PracticeTransferLocalFormDraft),
      );
      localStorage.removeItem(PRACTICE_TRANSFER_TEMP_DRAFT_KEY);
    } catch {
      clearPracticeSharedFormLocalStorage();
    }

    await clearLocalFilesWithCache();
    await clearPracticeFileTransferCaches();

    // clearPracticeFileTransferCaches가 form local key를 지우므로, 빈 스냅샷을 다시 쓴다.
    try {
      localStorage.setItem(
        PRACTICE_TRANSFER_FORM_LOCAL_KEY,
        JSON.stringify({
          orderDate: todayDate,
          arrivalDate: addDaysToDateInput(todayDate, arrivalDefaultDays),
          arrivalDefaultDays,
          prosthesisTypes: [],
          requestMemo: "",
          patientName: "",
          selectedLab: null,
          toothWorks: [],
          activeDraftId: null,
          updatedAt: Date.now(),
        } satisfies PracticeTransferLocalFormDraft),
      );
    } catch {
      // ignore
    }

    window.setTimeout(() => {
      suppressLocalFormPersistRef.current = false;
      skipFormAutosaveRef.current = false;
    }, 0);
  }, [
    arrivalDefaultDays,
    clearAllFiles,
    setLabOpen,
    setLabSearch,
    setRequestMemo,
    setSelectedLab,
    todayDate,
  ]);
  resetIntakeFormAfterTransferRef.current = resetIntakeFormAfterTransfer;

  // 전송/삭제로 draft가 활성 목록에서 사라진 뒤에만 폼을 비운다.
  // 파일 동기화 직후 activeDraftId만 먼저 바뀐 순간(목록 fetch 전)은 초기화하지 않는다.
  // 휴지통에만 있는 id·로컬 stale id는 작성 폼에서 분리한다(전체 초기화는 하지 않음).
  useEffect(() => {
    if (!localFormHydrated || !draftListLoadedRef.current) return;
    const activeId = String(activeDraftId || "").trim();
    if (!activeId) {
      activeDraftSeenInListRef.current = null;
      return;
    }
    const stillActive = practiceDraftList.some((row) => row.id === activeId);
    if (stillActive) {
      activeDraftSeenInListRef.current = activeId;
      return;
    }
    if (activeDraftSeenInListRef.current === activeId) {
      activeDraftSeenInListRef.current = null;
      void resetIntakeFormAfterTransferRef.current();
      return;
    }
    // 목록에 없던 stale draftId(삭제·휴지통·유실) — 폼 내용은 유지하고 id만 비운다.
    setActiveDraftId(null);
    setDraftSummary(null);
    activeDraftSeenInListRef.current = null;
  }, [activeDraftId, localFormHydrated, practiceDraftList]);

  const periodAndSearchFilteredRequests = useMemo(() => {
    const query = requestSearchTerm.trim().toLowerCase();

    const periodFiltered = recentRequests.filter((request) => {
      if (!request.requestDate || request.requestDate === "-") return false;

      const createdTs = Number(request.createdAtTs || 0);
      if (!Number.isFinite(createdTs) || createdTs <= 0) return true;
      const created = new Date(createdTs);

      const now = new Date();
      const dayMs = 24 * 60 * 60 * 1000;
      const diffDays = (now.getTime() - createdTs) / dayMs;

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

    return periodFiltered.filter((request) => {
      const searchableText = [
        request.id,
        request.transferId,
        request.createdAt,
        request.requestDate,
        request.patientName,
        request.toothNumbers.join(" "),
        request.targetLab,
        request.orderDate,
        request.arrivalDate,
        request.status,
        request.fileName,
        request.transferMemo,
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [recentRequests, requestSearchTerm, period]);

  const filteredRecentRequests = useMemo(
    () =>
      periodAndSearchFilteredRequests.filter(
        (request) => !isPracticeTransferTrashStatus(request.status),
      ),
    [periodAndSearchFilteredRequests],
  );

  const trashRecentRequests = useMemo(
    () =>
      periodAndSearchFilteredRequests.filter((request) =>
        isPracticeTransferTrashStatus(request.status),
      ),
    [periodAndSearchFilteredRequests],
  );

  const groupedTransfers = useMemo(() => {
    const unreadByTransferId = new Map<string, number>();
    const latestChatTsByTransferId = new Map<string, number>();
    for (const room of chatRooms) {
      const transferId = String(room.relatedPracticeTransferId?.transferId || "").trim();
      if (!transferId) continue;
      unreadByTransferId.set(transferId, Number(room.unreadCount || 0));

      const lastTs = new Date(String(room.lastMessageAt || "")).getTime();
      if (Number.isFinite(lastTs) && lastTs > 0) {
        latestChatTsByTransferId.set(transferId, lastTs);
      }
    }

    const byKey = new Map<
      string,
      RecentTransferItem & {
        _statuses: Set<string>;
        _patients: Set<string>;
        _requestIds: Set<string>;
        _transferMongoIds: Set<string>;
        _files: Map<string, TransferFileItem>;
      }
    >();

    for (const req of filteredRecentRequests) {
      const minuteBucket = Math.floor(Number(req.createdAtTs || 0) / (60 * 1000));
      const fallbackKey = `${minuteBucket}|${String(req.targetLab || "-")}`;
      const key = req.transferId || fallbackKey;

      const patientKey = String(req.patientKey || "").trim();
      const existing = byKey.get(key);
      if (!existing) {
        const initialPatients = new Set<string>();
        if (patientKey) initialPatients.add(patientKey);

        const requestIds = new Set<string>([req.id]);
        const transferMongoIds = new Set<string>();
        if (req.requestMongoId) transferMongoIds.add(req.requestMongoId);
        const files = new Map<string, TransferFileItem>();
        if (req.fileName && req.fileS3Key) {
          files.set(req.fileS3Key, {
            fileName: req.fileName,
            s3Key: req.fileS3Key,
            size: Number(req.fileSize || 0),
          });
        }
        const unreadCount = Number(unreadByTransferId.get(req.transferId) || 0);
        const hasFile = Boolean(req.fileName && req.fileS3Key);
        byKey.set(key, {
          id: req.id,
          transferId: req.transferId || "-",
          deleteTargetLabel: req.transferId || req.id,
          createdAt: req.createdAt,
          createdAtTs: req.createdAtTs,
          requestDate: req.requestDate,
          targetLab: req.targetLab,
          orderDate: req.orderDate,
          arrivalDate: req.arrivalDate,
          status: req.status,
          fileCount: hasFile ? 1 : 0,
          patientCount: Math.max(1, initialPatients.size),
          requestIds: [req.id],
          transferMongoIds: req.requestMongoId ? [req.requestMongoId] : [],
          fileNames: hasFile ? [req.fileName] : [],
          files: hasFile
            ? [{ fileName: req.fileName, s3Key: req.fileS3Key, size: Number(req.fileSize || 0) }]
            : [],
          resultFiles: Array.isArray(req.resultFiles) ? [...req.resultFiles] : [],
          hasCustomAbutment: Boolean(req.hasCustomAbutment),
          productionConfirmedAt: req.productionConfirmedAt || null,
          skipDesignConfirm: req.skipDesignConfirm !== false,
          skipJig: Boolean(req.skipJig),
          designReadyAt: req.designReadyAt || null,
          designFileCount: Number(req.designFileCount || 0),
          practiceDesignConfirmedAt: req.practiceDesignConfirmedAt || null,
          labDesignConfirmedAt: req.labDesignConfirmedAt || null,
          transferMemo: req.transferMemo,
          rawTransferMemo: req.rawTransferMemo,
          targetLabAnchorId: req.targetLabAnchorId,
          matchingMode: req.matchingMode,
          feeQuote: req.feeQuote || null,
          remakeFeeQuote: req.remakeFeeQuote || req.feeQuote?.remakeFeeQuote || null,
          isRemake: Boolean(req.isRemake),
          remakeSourceTransferId: req.remakeSourceTransferId || "",
          canRateLab: Boolean(req.canRateLab),
          labRating: req.labRating || null,
          unreadCount,
          searchBlob: [
            req.id,
            req.createdAt,
            req.requestDate,
            req.patientName,
            req.toothNumbers.join(" "),
            req.targetLab,
            req.orderDate,
            req.arrivalDate,
            req.status,
            req.transferMemo,
            req.transferId,
            req.fileName,
          ]
            .join(" ")
            .toLowerCase(),
          _statuses: new Set([req.status]),
          _patients: initialPatients,
          _requestIds: requestIds,
          _transferMongoIds: transferMongoIds,
          _files: files,
        });
        continue;
      }

      if (req.fileName && req.fileS3Key) {
        existing._files.set(req.fileS3Key, {
          fileName: req.fileName,
          s3Key: req.fileS3Key,
          size: Number(req.fileSize || 0),
        });
      }
      existing.files = Array.from(existing._files.values());
      existing.fileNames = existing.files.map((f) => f.fileName).filter(Boolean);
      existing.fileCount = existing.files.length;
      if (patientKey) {
        existing._patients.add(patientKey);
      }
      existing.patientCount = Math.max(1, existing._patients.size);
      existing._statuses.add(req.status);
      existing._requestIds.add(req.id);
      existing.requestIds = Array.from(existing._requestIds);
      if (req.requestMongoId) {
        existing._transferMongoIds.add(req.requestMongoId);
      }
      existing.transferMongoIds = Array.from(existing._transferMongoIds);

      if (!existing.transferMemo && req.transferMemo) {
        existing.transferMemo = req.transferMemo;
      }
      if (!existing.rawTransferMemo && req.rawTransferMemo) {
        existing.rawTransferMemo = req.rawTransferMemo;
      }
      if (!existing.orderDate && req.orderDate) {
        existing.orderDate = req.orderDate;
      }
      if (!existing.arrivalDate && req.arrivalDate) {
        existing.arrivalDate = req.arrivalDate;
      }
      if (Array.isArray(req.resultFiles) && req.resultFiles.length > 0) {
        const byKey = new Map(
          (existing.resultFiles || []).map((f) => [f.s3Key, f] as const),
        );
        for (const f of req.resultFiles) {
          if (f.s3Key) byKey.set(f.s3Key, f);
        }
        existing.resultFiles = Array.from(byKey.values());
      }
      if (req.hasCustomAbutment) existing.hasCustomAbutment = true;
      if (req.skipDesignConfirm === false) existing.skipDesignConfirm = false;
      if (req.skipJig === false) existing.skipJig = false;
      else if (req.skipJig) existing.skipJig = true;
      if (req.designReadyAt) existing.designReadyAt = req.designReadyAt;
      if (Number(req.designFileCount || 0) > Number(existing.designFileCount || 0)) {
        existing.designFileCount = Number(req.designFileCount || 0);
      }
      if (req.practiceDesignConfirmedAt) {
        existing.practiceDesignConfirmedAt = req.practiceDesignConfirmedAt;
      }
      if (req.labDesignConfirmedAt) {
        existing.labDesignConfirmedAt = req.labDesignConfirmedAt;
      }
      // 수락·청구 후 확정 feeQuote가 오면 예산 구간 견적을 덮어쓴다.
      if (req.feeQuote) {
        if (!existing.feeQuote || req.feeQuote.billed || !existing.feeQuote.billed) {
          existing.feeQuote = req.feeQuote;
        }
      }
      if (!existing.remakeFeeQuote && req.remakeFeeQuote) {
        existing.remakeFeeQuote = req.remakeFeeQuote;
      }
      if (req.isRemake) existing.isRemake = true;
      if (!existing.remakeSourceTransferId && req.remakeSourceTransferId) {
        existing.remakeSourceTransferId = req.remakeSourceTransferId;
      }
      if (!existing.targetLabAnchorId && req.targetLabAnchorId) {
        existing.targetLabAnchorId = req.targetLabAnchorId;
      }
      if (!existing.matchingMode && req.matchingMode) {
        existing.matchingMode = req.matchingMode;
      }
      if (req.productionConfirmedAt) {
        existing.productionConfirmedAt = req.productionConfirmedAt;
      }
      if (req.createdAtTs > existing.createdAtTs) {
        existing.createdAtTs = req.createdAtTs;
        existing.createdAt = req.createdAt;
        existing.requestDate = req.requestDate;
      }

      existing.unreadCount = Number(unreadByTransferId.get(existing.transferId) || 0);

      existing.searchBlob = `${existing.searchBlob} ${[
        req.patientName,
        req.toothNumbers.join(" "),
        req.id,
        req.orderDate,
        req.arrivalDate,
        req.transferMemo,
        req.fileName,
      ].join(" ")}`.toLowerCase();
      if (!existing.transferId || existing.transferId === "-") {
        existing.deleteTargetLabel = req.id;
      }

      const statusSet = existing._statuses;
      if (statusSet.size === 1) {
        existing.status = [...statusSet][0] || existing.status;
      } else if (statusSet.has("생산진행")) {
        existing.status = "생산진행";
      } else if (statusSet.has("작업완료")) {
        existing.status = "작업완료";
      } else if (statusSet.has("발송완료")) {
        existing.status = "발송완료";
      } else if (statusSet.has("수신완료")) {
        existing.status = "수신완료";
      } else if (statusSet.has("의뢰수락") || statusSet.has("다운로드완료")) {
        existing.status = "의뢰수락";
      } else if (statusSet.has("작업취소")) {
        existing.status = "작업취소";
      } else if (statusSet.has("거부")) {
        existing.status = "거부";
      } else if (statusSet.has("취소")) {
        existing.status = "취소";
      } else {
        existing.status = "발송완료";
      }
    }

    return [...byKey.values()]
      .map(({ _statuses: _s, _patients: _p, _requestIds: _r, _transferMongoIds: _tm, _files: _f, ...row }) => ({
        ...row,
        files: Array.isArray(row.files) ? row.files : [],
        fileNames: Array.isArray(row.fileNames) ? row.fileNames : [],
        deleteTargetLabel:
          row.transferId && row.transferId !== "-"
            ? row.transferId
            : row.id,
      }))
      .sort((a, b) => {
        const aChatTs = Number(latestChatTsByTransferId.get(a.transferId) || 0);
        const bChatTs = Number(latestChatTsByTransferId.get(b.transferId) || 0);
        const aSortTs = aChatTs > 0 ? aChatTs : Number(a.createdAtTs || 0);
        const bSortTs = bChatTs > 0 ? bChatTs : Number(b.createdAtTs || 0);
        return bSortTs - aSortTs;
      });
  }, [filteredRecentRequests, chatRooms]);

  const statusCounts = useMemo(
    () => computeGroupedStatusCounts(groupedTransfers),
    [groupedTransfers],
  );

  const recentActionNeededCount = statusCounts.canceled;

  const filteredGroupedTransfers = useMemo(
    () => filterGroupedTransfersByStatus(groupedTransfers, recentStatusFilter),
    [groupedTransfers, recentStatusFilter],
  );

  const draftGroupedTransfers = useMemo(() => {
    const query = requestSearchTerm.trim().toLowerCase();

    return practiceDraftList
      .map((draft): RecentTransferItem => {
        const updatedAtRaw = draft.updatedAt || draft.createdAt || new Date().toISOString();
        const createdAtTs = new Date(updatedAtRaw).getTime();
        const safeTs = Number.isFinite(createdAtTs) && createdAtTs > 0 ? createdAtTs : Date.now();
        const targetLab = String(draft.targetLabName || "-").trim() || "-";
        const parsedMemo = parsePracticeTransferMemoMeta(String(draft.transferMemo || ""));
        const displayMemo = formatTransferMemoForDisplay(String(draft.transferMemo || ""));
        const files = draft.files.map((file) => ({
          fileName: file.originalName,
          s3Key: file.s3Key,
          size: Number(file.size || 0),
        }));
        const ownerLabel = draft.isMine ? "나" : draft.practiceUserLabel || "동료";

        return {
          id: draft.id,
          transferId: PRACTICE_DRAFT_TRANSFER_ID,
          deleteTargetLabel: draft.isMine ? "내 임시저장" : `${ownerLabel} 임시저장`,
          createdAt: toDateLabel(updatedAtRaw),
          createdAtTs: safeTs,
          requestDate: toDayLabel(updatedAtRaw),
          targetLab,
          orderDate: String(parsedMemo.orderDate || "").trim(),
          arrivalDate: String(parsedMemo.arrivalDate || "").trim(),
          status: "임시저장",
          fileCount: files.length,
          patientCount: 1,
          requestIds: [],
          transferMongoIds: [],
          fileNames: files.map((file) => file.fileName).filter(Boolean),
          files,
          transferMemo: displayMemo,
          rawTransferMemo: String(draft.transferMemo || "").trim(),
          unreadCount: 0,
          practiceUserId: draft.practiceUserId,
          practiceUserLabel: ownerLabel,
          isMineDraft: draft.isMine,
          draftPatientName: draft.patientName,
          searchBlob: [
            "임시저장",
            PRACTICE_DRAFT_TRANSFER_ID,
            ownerLabel,
            draft.patientName,
            targetLab,
            displayMemo,
            ...files.map((file) => file.fileName),
          ]
            .join(" ")
            .toLowerCase(),
        };
      })
      .filter((transfer) => !query || transfer.searchBlob.includes(query));
  }, [practiceDraftList, requestSearchTerm]);

  const trashGroupedTransfers = useMemo(() => {
    const byKey = new Map<string, RecentTransferItem>();

    for (const req of trashRecentRequests) {
      const key =
        req.transferId && req.transferId !== "-"
          ? `tid:${req.transferId}`
          : req.requestMongoId
            ? `mid:${req.requestMongoId}`
            : `id:${req.id}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, {
          id: req.id,
          transferId: req.transferId || "-",
          deleteTargetLabel:
            req.transferId && req.transferId !== "-" ? req.transferId : req.id,
          createdAt: req.createdAt,
          createdAtTs: req.createdAtTs,
          requestDate: req.requestDate,
          targetLab: req.targetLab,
          orderDate: req.orderDate,
          arrivalDate: req.arrivalDate,
          status: "취소",
          fileCount: req.fileName ? 1 : 0,
          patientCount: 1,
          requestIds: [req.id],
          transferMongoIds: req.requestMongoId ? [req.requestMongoId] : [],
          fileNames: req.fileName ? [req.fileName] : [],
          files:
            req.fileName && req.fileS3Key
              ? [{ fileName: req.fileName, s3Key: req.fileS3Key, size: req.fileSize }]
              : [],
          transferMemo: req.transferMemo,
          rawTransferMemo: req.rawTransferMemo,
          unreadCount: 0,
          searchBlob: "",
        });
        continue;
      }

      existing.requestIds = Array.from(new Set([...existing.requestIds, req.id]));
      if (req.requestMongoId) {
        existing.transferMongoIds = Array.from(
          new Set([...existing.transferMongoIds, req.requestMongoId]),
        );
      }
      if (req.fileName && req.fileS3Key) {
        const already = existing.files.some((file) => file.s3Key === req.fileS3Key);
        if (!already) {
          existing.files = [
            ...existing.files,
            { fileName: req.fileName, s3Key: req.fileS3Key, size: req.fileSize },
          ];
          existing.fileNames = existing.files.map((file) => file.fileName);
          existing.fileCount = existing.files.length;
        }
      }
      if (!existing.rawTransferMemo && req.rawTransferMemo) {
        existing.rawTransferMemo = req.rawTransferMemo;
      }
      if (req.createdAtTs > existing.createdAtTs) {
        existing.createdAtTs = req.createdAtTs;
        existing.createdAt = req.createdAt;
        existing.requestDate = req.requestDate;
      }
    }

    const canceled = [...byKey.values()];

    const draftTrash = trashedDraftList.map((draft): RecentTransferItem => {
      const updatedAtRaw = draft.updatedAt || draft.createdAt || new Date().toISOString();
      const createdAtTs = new Date(updatedAtRaw).getTime();
      const safeTs = Number.isFinite(createdAtTs) && createdAtTs > 0 ? createdAtTs : Date.now();
      const ownerLabel = draft.isMine ? "나" : draft.practiceUserLabel || "동료";
      const patientLabel = draft.patientName || "환자명 미입력";
      const parsedMemo = parsePracticeTransferMemoMeta(String(draft.transferMemo || ""));
      const files = draft.files.map((file) => ({
        fileName: file.originalName,
        s3Key: file.s3Key,
        size: Number(file.size || 0),
      }));

      return {
        id: draft.id,
        transferId: PRACTICE_DRAFT_TRANSFER_ID,
        deleteTargetLabel: `임시저장 · ${patientLabel}`,
        createdAt: toDateLabel(updatedAtRaw),
        createdAtTs: safeTs,
        requestDate: toDayLabel(updatedAtRaw),
        targetLab: draft.targetLabName || "-",
        orderDate: String(parsedMemo.orderDate || "").trim(),
        arrivalDate: String(parsedMemo.arrivalDate || "").trim(),
        status: "임시저장",
        fileCount: files.length,
        patientCount: 1,
        requestIds: [],
        transferMongoIds: [],
        fileNames: files.map((f) => f.fileName),
        files,
        transferMemo: formatTransferMemoForDisplay(String(draft.transferMemo || "")),
        rawTransferMemo: String(draft.transferMemo || "").trim(),
        unreadCount: 0,
        practiceUserId: draft.practiceUserId,
        practiceUserLabel: ownerLabel,
        isMineDraft: draft.isMine,
        draftPatientName: draft.patientName,
        searchBlob: "",
      };
    });

    return [...draftTrash, ...canceled].sort(
      (a, b) => Number(b.createdAtTs || 0) - Number(a.createdAtTs || 0),
    );
  }, [trashRecentRequests, trashedDraftList]);

  const displayGroupedTransfers = filteredGroupedTransfers;

  const remakeSelectedTransfers = useMemo(() => {
    const selected = new Set(remakeSelectedIds);
    return groupedTransfers.filter((transfer) => {
      const key = String(transfer.transferMongoIds?.[0] || transfer.id || "").trim();
      return key && selected.has(key) && canRemakePracticeTransferByStatus(transfer.status);
    });
  }, [groupedTransfers, remakeSelectedIds]);

  const remakeSelectedTotal = useMemo(
    () =>
      remakeSelectedTransfers.reduce((sum, transfer) => {
        const quote = transfer.remakeFeeQuote || transfer.feeQuote?.remakeFeeQuote;
        return sum + Math.max(0, Math.round(Number(quote?.total || 0)));
      }, 0),
    [remakeSelectedTransfers],
  );

  const toggleRemakeSelect = useCallback((transfer: RecentTransferItem) => {
    const key = String(transfer.transferMongoIds?.[0] || transfer.id || "").trim();
    if (!key || !canRemakePracticeTransferByStatus(transfer.status)) return;
    setRemakeSelectedIds((prev) =>
      prev.includes(key) ? prev.filter((id) => id !== key) : [...prev, key],
    );
  }, []);

  const handleConfirmRemake = useCallback(async () => {
    if (!authToken || remakeSelectedTransfers.length === 0) return;
    setRemakeBusy(true);
    try {
      const res = await apiFetch<{
        message?: string;
        data?: { created?: unknown[]; failed?: Array<{ message?: string }> };
      }>({
        path: "/api/practice/transfers/remake",
        method: "POST",
        token: authToken,
        jsonBody: {
          transferMongoIds: remakeSelectedTransfers.map((transfer) =>
            String(transfer.transferMongoIds?.[0] || transfer.id || "").trim(),
          ),
        },
      });
      if (!res.ok) {
        const body = res.data && typeof res.data === "object" ? res.data : {};
        toast({
          title: "리메이크 의뢰 실패",
          description: String(body.message || "다시 시도해주세요."),
          variant: "destructive",
        });
        return;
      }
      const createdCount = Array.isArray(res.data?.data?.created)
        ? res.data.data.created.length
        : remakeSelectedTransfers.length;
      toast({
        title: "리메이크 의뢰를 전송했습니다",
        description: createdCount > 1 ? `${createdCount}건` : undefined,
      });
      setRemakeSelectedIds([]);
      setRemakeConfirmOpen(false);
      await loadRecentRequests({ silent: true });
    } catch (error) {
      toast({
        title: "리메이크 의뢰 실패",
        description:
          error instanceof Error ? error.message : "다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setRemakeBusy(false);
    }
  }, [authToken, loadRecentRequests, remakeSelectedTransfers, toast]);

  const extractDataFromResponse = <T,>(raw: unknown): T | null => {
    if (!raw || typeof raw !== "object") return null;
    const payload = raw as { data?: unknown };
    if (payload.data === undefined) return raw as T;
    return payload.data as T;
  };

  const asApiMessagePayload = (value: unknown) => {
    if (!value || typeof value !== "object") return {} as { message?: string };
    return value as { message?: string };
  };

  const myIdCandidates = useMemo(() => {
    const ids = [authUser?.id, (authUser as { _id?: string } | null)?._id]
      .map((v) => String(v || "").trim())
      .filter(Boolean);
    return new Set(ids);
  }, [authUser]);

  const selectedTransferRawMemo = useMemo(
    () =>
      String(selectedTransfer?.rawTransferMemo || selectedTransfer?.transferMemo || "").trim(),
    [selectedTransfer?.rawTransferMemo, selectedTransfer?.transferMemo],
  );

  // 상세 의 메모: 메타 태그 원본에서 자유 입력 메모만 (환자명·보철물 요약 제외)
  const selectedTransferDisplayMemo = useMemo(() => {
    const raw = String(selectedTransfer?.rawTransferMemo || "").trim();
    if (!raw) return "";
    return String(parsePracticeTransferMemoMetaShared(raw).memo || "").trim();
  }, [selectedTransfer?.rawTransferMemo]);

  const selectedTransferPatientName = useMemo(() => {
    const fromMemo = String(
      parsePracticeTransferMemoMetaShared(selectedTransferRawMemo).patientName || "",
    ).trim();
    if (fromMemo) return fromMemo;
    return String(selectedTransfer?.draftPatientName || "").trim();
  }, [selectedTransfer?.draftPatientName, selectedTransferRawMemo]);

  const selectedTransferWorkPeriodSummary = useMemo(
    () =>
      buildPracticeWorkPeriodSummaryItem(
        selectedTransfer?.orderDate,
        selectedTransfer?.arrivalDate,
      ),
    [selectedTransfer?.arrivalDate, selectedTransfer?.orderDate],
  );

  const selectedTransferToothWorks = useMemo(
    () => parsePracticeTransferMemoMetaShared(selectedTransferRawMemo).toothWorks,
    [selectedTransferRawMemo],
  );

  const applyDraftSummaryToForm = useCallback(
    (draft: DraftListSummary) => {
      suppressLocalFormPersistRef.current = true;
      skipFormAutosaveRef.current = true;
      formAutosaveSeqRef.current += 1;
      if (formAutosaveTimerRef.current) {
        window.clearTimeout(formAutosaveTimerRef.current);
        formAutosaveTimerRef.current = null;
      }

      const parsed = parsePracticeTransferMemoMeta(String(draft.transferMemo || ""));
      const labId = String(draft.targetLabAnchorId || "").trim();
      const labName = String(draft.targetLabName || "").trim();
      // transferMemo가 SSOT. 목록 카드의 patientName은 stale일 수 있어 memo 빈 값에 fallback하지 않는다.
      const nextPatientName = String(parsed.patientName || "").trim().normalize("NFC");

      skipNextArrivalAutoSyncRef.current = true;

      // 케이스에 기공소가 없으면 로컬/최근 기공소 캐시를 반드시 비운다.
      if (labName) {
        const coerced = coerceAutoMatchLab({
          labId,
          labName,
          matchingMode: (draft as { matchingMode?: string | null })?.matchingMode,
        });
        if (coerced) {
          setSelectedLab(coerced);
        } else {
          const fromRecent = findCachedLab(labId, labName);
          setSelectedLab({
            _id:
              (isMongoObjectIdString(labId) ? labId : "") ||
              (isMongoObjectIdString(fromRecent?._id) ? String(fromRecent?._id) : "") ||
              `draft-lab:${labName}`,
            name: labName,
            businessNumber: String(fromRecent?.businessNumber || "").trim(),
            representativeName: String(fromRecent?.representativeName || "").trim(),
            address: String(fromRecent?.address || "").trim(),
            businessType: "requestor",
          });
        }
      } else {
        setSelectedLab(null);
      }
      setLabOpen(false);
      setLabSearch("");

      skipNextArrivalAutoSyncRef.current = true;
      setOrderDate(todayDate);
      {
        const restoredArrival = String(parsed.arrivalDate || "").trim();
        setArrivalDate(
          restoredArrival && restoredArrival >= todayDate
            ? restoredArrival
            : addDaysToDateInput(
                todayDate,
                normalizeArrivalDefaultDays(Number(parsed.arrivalDefaultDays ?? arrivalDefaultDays)),
              ),
        );
      }
      if (Number.isFinite(Number(parsed.arrivalDefaultDays))) {
        const days = normalizeArrivalDefaultDays(Number(parsed.arrivalDefaultDays));
        setArrivalDefaultDays(days);
      }
      const prosthesisTypesForRestore = ensurePresetProsthesisTypes(parsed.prosthesisTypes);
      setProsthesisTypeCatalog(prosthesisTypesForRestore);
      setProsthesisTypeCatalogDraft(prosthesisTypesForRestore);
      setPatientName(nextPatientName);
      setRequestMemo(String(parsed.memo || ""));

      const fallbackToothRow = {
        toothNumber: "",
        prosthesisType: resolveDefaultProsthesisType(prosthesisTypesForRestore),
        customAbutment: false,
        bridgeLinkedTeeth: [] as string[],
      };
      let nextToothWorks: ToothWorkSelection[] = [fallbackToothRow];
      if (parsed.toothWorks.length > 0) {
        const restoredRows = restoreToothWorksFromDraft(parsed.toothWorks, {
          prosthesisTypes: prosthesisTypesForRestore,
          isCustomAbutmentSupportedProsthesisType,
          isBridgeLikeProsthesisType,
          getAdjacentTeeth,
          fallbackProsthesisType: "크라운",
        });
        if (restoredRows.length > 0) nextToothWorks = restoredRows;
      }
      setToothWorks(nextToothWorks);

      setDraftFiles(draft.files);
      setDraftSummary(draft);
      setActiveDraftId(draft.id);
      setExpressDone(false);
      setExpressStepId("confirm");

      const fingerprint = buildPracticeTransferFormFingerprint({
        targetLabAnchorId: labId,
        targetLabName: labName,
        patientName: nextPatientName,
        orderDate: parsed.orderDate,
        arrivalDate: parsed.arrivalDate,
        arrivalDefaultDays: parsed.arrivalDefaultDays,
        requestMemo: parsed.memo,
        prosthesisTypes: prosthesisTypesForRestore,
        toothWorks: nextToothWorks,
      });
      currentFormFingerprintRef.current = fingerprint;
      lastSavedFormFingerprintRef.current = fingerprint;
      setLastSavedFormFingerprint(fingerprint);
      pendingLocalFormEditRef.current = false;
      const ts = draft.updatedAt ? new Date(draft.updatedAt).getTime() : Date.now();
      if (Number.isFinite(ts) && ts > 0) {
        lastAppliedServerUpdatedAtRef.current = ts;
        localFormUpdatedAtRef.current = ts;
      }
      setFormSyncStatus("saved");

      // 반영된(비어 있을 수 있는) 스냅샷을 localStorage에도 즉시 기록해 캐시 잔존을 막는다.
      try {
        localStorage.setItem(
          PRACTICE_TRANSFER_FORM_LOCAL_KEY,
          JSON.stringify({
            orderDate: parsed.orderDate,
            arrivalDate: parsed.arrivalDate,
            arrivalDefaultDays: parsed.arrivalDefaultDays,
            prosthesisTypes: prosthesisTypesForRestore,
            requestMemo: String(parsed.memo || ""),
            patientName: nextPatientName,
            selectedLab: labName
              ? coerceAutoMatchLab({ labId, labName }) || {
                  _id:
                    (isMongoObjectIdString(labId) ? labId : "") ||
                    `draft-lab:${labName}`,
                  name: labName,
                  businessNumber: "",
                  representativeName: "",
                  address: "",
                  businessType: "requestor",
                }
              : null,
            toothWorks: nextToothWorks,
            activeDraftId: draft.id,
            updatedAt: Number.isFinite(ts) && ts > 0 ? ts : Date.now(),
          } satisfies PracticeTransferLocalFormDraft),
        );
      } catch {
        // ignore
      }

      queueMicrotask(() => {
        suppressLocalFormPersistRef.current = false;
        skipFormAutosaveRef.current = false;
      });
    },
    [findCachedLab, setLabOpen, setLabSearch, setRequestMemo, setSelectedLab],
  );

  const handleAdoptDraftTransfer = useCallback(
    (transfer: RecentTransferItem) => {
      const draft = practiceDraftList.find((row) => row.id === transfer.id);
      if (!draft) {
        toast({
          title: "임시저장을 찾지 못했습니다",
          description: "목록을 새로고침한 뒤 다시 시도해주세요.",
          variant: "destructive",
        });
        return;
      }

      // 다른 케이스의 로컬(미동기화) 파일이 섞여 전송되지 않게 비운다.
      void clearLocalFilesWithCache();
      applyDraftSummaryToForm(draft);
      // 목록 카드보다 서버 최신 스냅샷을 우선해, 빈 기공소/환자명도 정확히 맞춘다.
      void loadPracticeTransferDraft({ draftId: draft.id });
      setDraftsOpen(false);
      toast({
        title: draft.isMine ? "임시저장 불러옴" : "같은 케이스로 이어쓰기",
        description: draft.isMine
          ? "작성 폼에 반영했습니다. 같은 계정·동료가 이 건을 불러오면 함께 동기화됩니다."
          : `${draft.practiceUserLabel || "동료"}의 임시저장에 참여했습니다. 입력 내용이 같은 케이스에 실시간 동기화됩니다.`,
      });
    },
    [
      applyDraftSummaryToForm,
      clearLocalFilesWithCache,
      loadPracticeTransferDraft,
      practiceDraftList,
      toast,
    ],
  );

  const handleOpenTransferDialog = async (
    transfer: RecentTransferItem,
    options?: { fromTrash?: boolean; returnToAllModal?: boolean },
  ) => {
    const fromTrash = Boolean(options?.fromTrash);
    const returnToAllModal = Boolean(options?.returnToAllModal);
    returnToAllModalRef.current = returnToAllModal;
    if (returnToAllModal) {
      setRecentTransfersAllOpen(false);
    }
    const isDraftTransfer =
      transfer.status === "임시저장" ||
      transfer.transferId === PRACTICE_DRAFT_TRANSFER_ID;

    if (isDraftTransfer && !fromTrash) {
      handleAdoptDraftTransfer(transfer);
      return;
    }

    if (
      !fromTrash &&
      isPracticeTransferActionNeededStatus(transfer.status)
    ) {
      // 의뢰 상세가 남아 있으면 닫고 전용 모달만 연다
      setTransferDialogOpen(false);
      transferDialogOpenRef.current = false;
      setSelectedTransfer(null);
      selectedTransferIdRef.current = "";
      setActiveChatRoom(null);
      setChatMessages([]);
      setChatError("");

      const rejectedLabId = String(transfer.targetLabAnchorId || "").trim();
      const currentLabId = String(selectedLab?._id || "").trim();
      if (rejectedLabId && currentLabId && rejectedLabId === currentLabId) {
        setSelectedLab(null);
      }
      setLabRejectedReselectTarget(transfer);
      return;
    }

    const resolveSeq = ++chatRoomResolveSeqRef.current;

    setSelectedTransfer(transfer);
    setTransferDialogOpen(true);
    transferDialogOpenRef.current = true;
    selectedTransferIdRef.current = String(transfer.transferId || "").trim();
    setChatDraft("");
    chatUploads.clear();
    setActiveChatRoom(null);
    setChatMessages([]);
    setChatError("");

    if (isDraftTransfer) {
      setChatError("휴지통 임시저장은 채팅방이 없습니다. 복구 후 이어서 작성할 수 있습니다.");
      return;
    }

    if (String(transfer.status || "").trim() === "취소") {
      setChatError("휴지통으로 이동된 전송은 채팅할 수 없습니다. 복구 후 다시 열어주세요.");
      return;
    }

    await resolvePracticeTransferChatRoom(String(transfer.transferId || "").trim(), resolveSeq);
  };

  const resolvePracticeTransferChatRoom = useCallback(
    async (transferIdRaw: string, resolveSeq: number) => {
      if (!authToken) {
        if (resolveSeq !== chatRoomResolveSeqRef.current) return;
        setChatError("로그인이 필요합니다.");
        return;
      }

      const transferId = String(transferIdRaw || "").trim();
      if (!transferId || transferId === "-") {
        if (resolveSeq !== chatRoomResolveSeqRef.current) return;
        setChatError("전송 ID를 확인할 수 없어 채팅방을 열 수 없습니다.");
        return;
      }

      const cachedRoom = chatRooms.find(
        (room) => String(room.relatedPracticeTransferId?.transferId || "").trim() === transferId,
      );
      if (cachedRoom?._id) {
        void prefetchMessages(cachedRoom._id);
        if (resolveSeq !== chatRoomResolveSeqRef.current) return;
        setActiveChatRoom(cachedRoom);
        setChatError("");
        return;
      }

      setChatLoading(true);
      try {
        const res = await apiFetch<unknown>({
          path: `/api/chats/practice/transfer-room/${encodeURIComponent(transferId)}`,
          method: "GET",
          token: authToken,
        });

        if (!res.ok) {
          const body = asApiMessagePayload(res.data);
          throw new Error(String(body?.message || "채팅방을 불러오지 못했습니다."));
        }

        const payload = extractDataFromResponse<ChatRoom>(res.data);
        if (!payload?._id) {
          throw new Error("채팅방 정보가 올바르지 않습니다.");
        }

        void prefetchMessages(payload._id);
        if (resolveSeq !== chatRoomResolveSeqRef.current) return;
        setActiveChatRoom(payload);
        setChatError("");
      } catch (error) {
        if (resolveSeq !== chatRoomResolveSeqRef.current) return;
        setChatError(
          error instanceof Error
            ? error.message
            : "채팅방을 불러오는 중 오류가 발생했습니다.",
        );
      } finally {
        if (resolveSeq === chatRoomResolveSeqRef.current) {
          setChatLoading(false);
        }
      }
    },
    [authToken, chatRooms, prefetchMessages],
  );

  const handleCloseTransferDialog = () => {
    chatRoomResolveSeqRef.current += 1;
    const reopenAllModal = returnToAllModalRef.current;
    returnToAllModalRef.current = false;
    setTransferDialogOpen(false);
    transferDialogOpenRef.current = false;
    selectedTransferIdRef.current = "";
    setSelectedTransfer(null);
    setActiveChatRoom(null);
    setChatMessages([]);
    setChatDraft("");
    setChatReplyTo(null);
    chatUploads.clear();
    setChatError("");
    resetDownloads();
    if (reopenAllModal) {
      setRecentTransfersAllOpen(true);
    }
  };

  const handleSendChatMessage = async () => {
    if (!activeChatRoom?._id || chatSending) return;

    const content = String(chatDraft || "").trim();
    if (!content && chatUploads.items.length === 0) return;

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

      const sent = await sendMessage(content, attachments, {
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
  };

  const handleDownloadTransferFile = useCallback(
    async (file: TransferFileItem) => {
      const s3Key = String(file?.s3Key || "").trim();
      await downloadS3File({
        s3Key,
        fileName: String(file?.fileName || "첨부파일").trim() || "첨부파일",
        busyKey: s3Key,
      });
    },
    [downloadS3File],
  );

  const handleDownloadAllTransferFiles = useCallback(async () => {
    const files = [
      ...(Array.isArray(selectedTransfer?.files) ? selectedTransfer.files : []),
      ...(Array.isArray(selectedTransfer?.resultFiles)
        ? selectedTransfer.resultFiles
        : []),
    ];
    await downloadAll(
      files.map((file) => ({
        s3Key: String(file.s3Key || "").trim(),
        fileName: String(file.fileName || "첨부파일").trim() || "첨부파일",
        busyKey: String(file.s3Key || "").trim(),
      })),
    );
  }, [downloadAll, selectedTransfer]);

  const handleConfirmProduction = useCallback(async () => {
    if (!authToken || !selectedTransfer || productionConfirmBusy) return;
    const transferId = String(selectedTransfer.transferId || "").trim();
    if (!transferId || transferId === "-" || transferId === PRACTICE_DRAFT_TRANSFER_ID) {
      return;
    }
    setProductionConfirmBusy(true);
    try {
      const res = await apiFetch<unknown>({
        path: `/api/practice/transfers/${encodeURIComponent(transferId)}/confirm-production`,
        method: "POST",
        token: authToken,
      });
      if (!res.ok) {
        const body =
          res.data && typeof res.data === "object"
            ? (res.data as Record<string, unknown>)
            : {};
        toast({
          title: "생산 진행 실패",
          description: String(body.message || "생산 진행 처리 중 오류가 발생했습니다."),
          variant: "destructive",
        });
        return;
      }
      const data =
        res.data && typeof res.data === "object"
          ? (res.data as Record<string, unknown>)
          : {};
      const mode = String(data.mode || "").trim();
      const isDesignGate = mode === "abutment-design-gate";
      const confirmedAt = new Date().toISOString();
      setSelectedTransfer((prev) =>
        prev && prev.transferId === transferId
          ? {
              ...prev,
              ...(isDesignGate
                ? { practiceDesignConfirmedAt: confirmedAt }
                : {
                    status: "생산진행",
                    productionConfirmedAt: confirmedAt,
                  }),
            }
          : prev,
      );
      setRecentRequests((prev) =>
        prev.map((row) =>
          row.transferId === transferId
            ? {
                ...row,
                ...(isDesignGate
                  ? { practiceDesignConfirmedAt: confirmedAt }
                  : {
                      status: "생산진행",
                      productionConfirmedAt: confirmedAt,
                    }),
              }
            : row,
        ),
      );
      toast({
        title: isDesignGate ? "어벗 디자인 컨펌" : "생산 진행",
        description: isDesignGate
          ? data.abutmentProductionStarted
            ? "디자인을 컨펌했습니다. 어벗츠 생산이 시작됩니다."
            : "디자인을 컨펌했습니다. 기공소 확인 후 생산이 시작됩니다."
          : "생산을 확정했습니다.",
      });
    } catch {
      toast({
        title: "생산 진행 실패",
        description: "생산 진행 요청 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setProductionConfirmBusy(false);
    }
  }, [authToken, productionConfirmBusy, selectedTransfer, toast]);

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

  const handleAttachChatFiles = (inputFiles: FileList | null) => {
    const nextFiles = Array.from(inputFiles || []);
    if (!nextFiles.length) return;
    chatUploads.addFiles(nextFiles);
  };

  const syncDraftFilesToServer = async (nextDraftFiles: DraftTransferFileItem[]) => {
    if (!authToken) return;

    if (nextDraftFiles.length === 0) {
      const draftId = String(activeDraftIdRef.current || "").trim();
      await apiFetch<unknown>({
        path: draftId
          ? `/api/practice/transfers/draft?draftId=${encodeURIComponent(draftId)}`
          : "/api/practice/transfers/draft",
        method: "DELETE",
        token: authToken,
      });
      setDraftSummary(null);
      lastSavedFormFingerprintRef.current = null;
      setLastSavedFormFingerprint(null);
      lastAppliedServerUpdatedAtRef.current = 0;
      pendingLocalFormEditRef.current = false;
      setFormSyncStatus("idle");
      setActiveDraftId(null);
      return;
    }

    const hasLab =
      Boolean(String(selectedLab?.name || "").trim()) ||
      Boolean(toApiLabAnchorId(selectedLab?._id));
    // 파일 반영도 기공소·완성형 한글 환자명이 있을 때만 서버 draft를 만든다/갱신한다.
    if (!hasAutosaveReadyPatientName(normalizedPatientName) || !hasLab) return;

    const transferMemo = buildPracticeTransferMemo({
      memo: requestMemo,
      orderDate,
      arrivalDate,
      arrivalDefaultDays,
      prosthesisTypes: normalizedProsthesisTypes,
      toothWorks: syncToothWorks,
      patientName: normalizedPatientName,
      skipDesignConfirm,
      skipJig: effectiveSkipJig,
    });

    await apiFetch<unknown>({
      path: "/api/practice/transfers/draft",
      method: "POST",
      token: authToken,
      jsonBody: {
        draftId: activeDraftIdRef.current || undefined,
        targetLabAnchorId: toApiLabAnchorId(selectedLab?._id),
        targetLabName: String(selectedLab?.name || "").trim(),
        orderDate,
        arrivalDate,
        arrivalDefaultDays,
        transferMemo,
        files: nextDraftFiles.map((row) => ({ fileId: row.fileId })),
      },
    });
  };

  const handleRemoveCombinedFile = async (target: {
    kind: "local" | "draft";
    localIndex?: number;
    draftIndex?: number;
  }) => {
    if (target.kind === "local" && Number.isFinite(Number(target.localIndex))) {
      const idx = Number(target.localIndex);
      const targetFile = files[idx];
      if (targetFile) forgetFile(targetFile);
      removeFile(idx);
      return;
    }

    if (target.kind === "draft" && Number.isFinite(Number(target.draftIndex))) {
      const removeIndex = Number(target.draftIndex);
      const prevDraftFiles = [...draftFiles];
      const nextDraftFiles = prevDraftFiles.filter((_, idx) => idx !== removeIndex);
      setDraftFiles(nextDraftFiles);

      try {
        await syncDraftFilesToServer(nextDraftFiles);
      } catch {
        setDraftFiles(prevDraftFiles);
        toast({
          title: "파일 삭제 실패",
          description: "임시저장 파일 반영 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      }
    }
  };

  const handleClearAllTransferFiles = async () => {
    await clearLocalFilesWithCache();
    if (draftFiles.length > 0) {
      const prevDraftFiles = [...draftFiles];
      setDraftFiles([]);
      try {
        await syncDraftFilesToServer([]);
      } catch {
        setDraftFiles(prevDraftFiles);
        toast({
          title: "전체삭제 실패",
          description: "임시저장 파일 반영 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      }
    }
  };

  const finishDeleteConfirmAndReturnToAllModal = () => {
    setDeleteConfirmOpen(false);
    setDeleteTargetTransfer(null);
    if (deleteReturnToAllModalRef.current) {
      setRecentTransfersAllOpen(true);
      // Confirm 포털 unmount 직후 Radix Dialog onOpenChange(false)가 한 틱 더 올 수 있음
      window.setTimeout(() => {
        suppressRecentAllModalCloseRef.current = false;
        deleteReturnToAllModalRef.current = false;
      }, 0);
      return;
    }
    suppressRecentAllModalCloseRef.current = false;
  };

  const handleAskDeleteTransfer = (transfer: RecentTransferItem) => {
    if (
      transfer.status !== "임시저장" &&
      transfer.transferId !== PRACTICE_DRAFT_TRANSFER_ID &&
      !canDeletePracticeTransferByStatus(transfer.status)
    ) {
      toast({
        title: "삭제할 수 없습니다",
        description: "기공소가 의뢰를 수락한 이후에는 삭제할 수 없습니다.",
        variant: "destructive",
      });
      return;
    }
    if (
      transfer.status === "임시저장" ||
      transfer.transferId === PRACTICE_DRAFT_TRANSFER_ID
    ) {
      void handleDeleteDraftTransfer(transfer);
      return;
    }
    if (recentTransfersAllOpen) {
      deleteReturnToAllModalRef.current = true;
      suppressRecentAllModalCloseRef.current = true;
    }
    setDeleteTargetTransfer(transfer);
    setDeleteConfirmOpen(true);
  };

  const handleCancelDeleteTransfer = () => {
    if (deletingTransfer) return;
    finishDeleteConfirmAndReturnToAllModal();
  };

  const handleDeleteDraftTransfer = async (target: RecentTransferItem) => {
    if (deletingTransfer) return;
    if (!authToken) {
      toast({
        title: "로그인이 필요합니다",
        variant: "destructive",
      });
      return;
    }

    setDeletingTransfer(true);
    try {
      const draftId = String(target.id || "").trim();
      const activeId = String(activeDraftIdRef.current || "").trim();
      await apiFetch<unknown>({
        path: draftId
          ? `/api/practice/transfers/draft?draftId=${encodeURIComponent(draftId)}`
          : "/api/practice/transfers/draft",
        method: "DELETE",
        token: authToken,
      });
      if (!activeId || target.id === activeId) {
        setDraftFiles([]);
        setDraftSummary(null);
        setActiveDraftId(null);
        lastSavedFormFingerprintRef.current = null;
        setLastSavedFormFingerprint(null);
        pendingLocalFormEditRef.current = false;
        setFormSyncStatus("idle");
      }
      invalidateApiGetCache("/api/practice/transfers/drafts");
      await loadPracticeTransferDraftList();
      toast({
        title: "휴지통으로 이동",
        description: "임시저장을 휴지통으로 옮겼습니다. 아래에서 복구할 수 있습니다.",
      });
    } catch (error) {
      toast({
        title: "휴지통 이동 실패",
        description:
          error instanceof Error ? error.message : "임시저장 삭제 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setDeletingTransfer(false);
    }
  };

  const handleConfirmDeleteTransfer = async () => {
    if (deletingTransfer) return;
    if (!authToken) {
      toast({
        title: "로그인이 필요합니다",
        variant: "destructive",
      });
      return;
    }

    const target = deleteTargetTransfer;
    if (!target) {
      finishDeleteConfirmAndReturnToAllModal();
      return;
    }

    if (
      target.status === "임시저장" ||
      target.transferId === PRACTICE_DRAFT_TRANSFER_ID
    ) {
      finishDeleteConfirmAndReturnToAllModal();
      void handleDeleteDraftTransfer(target);
      return;
    }

    if (!canDeletePracticeTransferByStatus(target.status)) {
      toast({
        title: "삭제할 수 없습니다",
        description: "기공소가 의뢰를 수락한 이후에는 삭제할 수 없습니다.",
        variant: "destructive",
      });
      finishDeleteConfirmAndReturnToAllModal();
      return;
    }

    const requestIds = Array.isArray(target?.requestIds)
      ? target!.requestIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    const transferIds = target?.transferId && target.transferId !== "-" ? [target.transferId] : [];
    const transferMongoIds = Array.isArray(target?.transferMongoIds)
      ? target!.transferMongoIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];

    if (!target || (transferIds.length === 0 && transferMongoIds.length === 0)) {
      toast({
        title: "삭제할 전송건이 없습니다",
        variant: "destructive",
      });
      finishDeleteConfirmAndReturnToAllModal();
      return;
    }

    setDeletingTransfer(true);

    const deletedSet = new Set(requestIds);
    const previousRecentRequests = recentRequests;

    // optimistic UI: 최근 내역에서 제외하고 휴지통(취소)으로 이동
    setRecentRequests((prev) =>
      prev.map((row) =>
        deletedSet.has(row.id) ? { ...row, status: "취소" } : row,
      ),
    );
    finishDeleteConfirmAndReturnToAllModal();

    try {
      // related files:
      // - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
      // - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
      // practice 전용 배치 취소 라우트 사용 (PracticeTransfer SSOT)
      const res = await apiFetch<unknown>({
        path: "/api/practice/transfers/cancel-batch",
        method: "POST",
        token: authToken,
        jsonBody: {
          transferIds,
          transferMongoIds,
        },
      });

      if (!res.ok) {
        const body = asApiMessagePayload(res.data);
        throw new Error(String(body?.message || "의뢰서 전송 내역 삭제(취소)에 실패했습니다."));
      }

      const body =
        res.data && typeof res.data === "object"
          ? (res.data as { data?: { successCount?: number; failedIds?: string[] } })
          : {};
      const data = body.data || {};
      const successCount = Number(data.successCount || 0);
      const failedIds = (Array.isArray(data.failedIds) ? data.failedIds : [])
        .map((v) => String(v || "").trim())
        .filter(Boolean);

      if (successCount <= 0) {
        // 전건 실패 시 optimistic 변경 롤백
        setRecentRequests(previousRecentRequests);
        toast({
          title: "휴지통 이동 실패",
          description: "삭제 권한 또는 대상 상태를 확인해주세요.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "휴지통으로 이동 완료",
          description:
            failedIds.length > 0
              ? `${successCount}건 이동, ${failedIds.length}건은 권한/상태 제한으로 이동되지 않았습니다.`
              : `${successCount}건을 휴지통으로 옮겼습니다. 아래에서 복구할 수 있습니다.`,
        });

        // 부분 실패면 서버 기준으로 재동기화(실패 건을 다시 표시)
        if (failedIds.length > 0) {
          void loadRecentRequests();
        }
      }

    } catch (error) {
      // 통신/서버 오류 시 optimistic 변경 롤백
      setRecentRequests(previousRecentRequests);
      toast({
        title: "휴지통 이동 실패",
        description:
          error instanceof Error
            ? error.message
            : "의뢰서 전송 내역 삭제 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setDeletingTransfer(false);
    }
  };

  const handleAskRestoreTransfer = (transfer: RecentTransferItem) => {
    setRestoreTargetTransfer(transfer);
    setRestoreConfirmOpen(true);
  };

  const handleCancelRestoreTransfer = () => {
    if (restoringTransfer) return;
    setRestoreConfirmOpen(false);
    setRestoreTargetTransfer(null);
  };

  const handleConfirmRestoreTransfer = async () => {
    if (restoringTransfer) return;
    if (!authToken) {
      toast({
        title: "로그인이 필요합니다",
        variant: "destructive",
      });
      return;
    }

    const target = restoreTargetTransfer;
    if (!target) {
      setRestoreConfirmOpen(false);
      setRestoreTargetTransfer(null);
      return;
    }

    if (
      target.status === "임시저장" ||
      target.transferId === PRACTICE_DRAFT_TRANSFER_ID
    ) {
      setRestoringTransfer(true);
      try {
        const draftId = String(target.id || "").trim();
        const res = await apiFetch<unknown>({
          path: "/api/practice/transfers/draft/restore",
          method: "POST",
          token: authToken,
          jsonBody: { draftId },
        });
        if (!res.ok) {
          const body = asApiMessagePayload(res.data);
          throw new Error(String(body?.message || "임시저장 복구에 실패했습니다."));
        }
        await loadPracticeTransferDraftList();
        toast({
          title: "임시저장 복구 완료",
          description: "임시저장 목록으로 되돌렸습니다. 카드를 눌러 이어서 작성할 수 있습니다.",
        });
      } catch (error) {
        toast({
          title: "복구 실패",
          description:
            error instanceof Error ? error.message : "임시저장 복구 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      } finally {
        setRestoringTransfer(false);
        setRestoreConfirmOpen(false);
        setRestoreTargetTransfer(null);
      }
      return;
    }

    const transferIds =
      target.transferId && target.transferId !== "-" ? [target.transferId] : [];
    const transferMongoIds = Array.isArray(target.transferMongoIds)
      ? target.transferMongoIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];

    if (transferIds.length === 0 && transferMongoIds.length === 0) {
      toast({
        title: "복구할 전송건이 없습니다",
        variant: "destructive",
      });
      setRestoreConfirmOpen(false);
      setRestoreTargetTransfer(null);
      return;
    }

    setRestoringTransfer(true);
    const previousRecentRequests = recentRequests;
    const restoreIdSet = new Set(
      Array.isArray(target.requestIds)
        ? target.requestIds.map((id) => String(id || "").trim()).filter(Boolean)
        : [],
    );

    // optimistic: 취소 → 발송완료로 되돌림
    setRecentRequests((prev) =>
      prev.map((row) =>
        restoreIdSet.has(row.id) ||
        (target.transferId &&
          target.transferId !== "-" &&
          row.transferId === target.transferId)
          ? { ...row, status: "발송완료" }
          : row,
      ),
    );
    setRestoreConfirmOpen(false);
    setRestoreTargetTransfer(null);

    try {
      const res = await apiFetch<unknown>({
        path: "/api/practice/transfers/restore-batch",
        method: "POST",
        token: authToken,
        jsonBody: {
          transferIds,
          transferMongoIds,
        },
      });

      if (!res.ok) {
        const body = asApiMessagePayload(res.data);
        throw new Error(String(body?.message || "휴지통 복구에 실패했습니다."));
      }

      const body =
        res.data && typeof res.data === "object"
          ? (res.data as { data?: { successCount?: number; failedIds?: string[] } })
          : {};
      const data = body.data || {};
      const successCount = Number(data.successCount || 0);
      const failedIds = (Array.isArray(data.failedIds) ? data.failedIds : [])
        .map((v) => String(v || "").trim())
        .filter(Boolean);

      if (successCount <= 0) {
        setRecentRequests(previousRecentRequests);
        toast({
          title: "복구 실패",
          description: "복구 권한 또는 대상 상태를 확인해주세요.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "복구 완료",
          description:
            failedIds.length > 0
              ? `${successCount}건 복구, ${failedIds.length}건은 복구되지 않았습니다.`
              : `${successCount}건을 최근 전송 내역으로 복구했습니다.`,
        });
        void loadRecentRequests({ silent: true });
      }
    } catch (error) {
      setRecentRequests(previousRecentRequests);
      toast({
        title: "복구 실패",
        description:
          error instanceof Error ? error.message : "휴지통 복구 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setRestoringTransfer(false);
    }
  };

  const handleAskClearAllDrafts = () => {
    if (clearingAllDrafts) return;
    if (draftGroupedTransfers.length === 0) return;
    void handleClearAllDrafts();
  };

  const handleClearAllDrafts = async () => {
    if (clearingAllDrafts) return;
    if (!authToken) {
      toast({
        title: "로그인이 필요합니다",
        variant: "destructive",
      });
      return;
    }

    const previousDrafts = practiceDraftList;
    const previousActiveId = String(activeDraftIdRef.current || "").trim();
    const previousDraftFiles = [...draftFiles];
    const previousDraftSummary = draftSummary;

    skipFormAutosaveRef.current = true;
    formAutosaveSeqRef.current += 1;
    if (formAutosaveTimerRef.current) {
      window.clearTimeout(formAutosaveTimerRef.current);
      formAutosaveTimerRef.current = null;
    }

    setPracticeDraftList([]);
    if (previousActiveId) {
      setDraftFiles([]);
      setDraftSummary(null);
      setActiveDraftId(null);
      activeDraftIdRef.current = null;
      draftSummaryIdRef.current = null;
      activeDraftSeenInListRef.current = null;
      const fingerprint = currentFormFingerprintRef.current;
      lastSavedFormFingerprintRef.current = fingerprint;
      setLastSavedFormFingerprint(fingerprint);
      pendingLocalFormEditRef.current = false;
      setFormSyncStatus("idle");
    }

    setClearingAllDrafts(true);
    try {
      const res = await apiFetch<unknown>({
        path: "/api/practice/transfers/drafts/clear-all",
        method: "POST",
        token: authToken,
      });
      if (!res.ok) {
        const body = asApiMessagePayload(res.data);
        throw new Error(String(body?.message || "임시저장 전체삭제에 실패했습니다."));
      }

      const body =
        res.data && typeof res.data === "object"
          ? (res.data as { data?: { draftClearedCount?: number } })
          : {};
      const draftClearedCount = Number(body.data?.draftClearedCount || previousDrafts.length || 0);
      invalidateApiGetCache("/api/practice/transfers/drafts");

      toast({
        title: "휴지통으로 이동",
        description:
          draftClearedCount > 0
            ? `임시저장 ${draftClearedCount}건을 휴지통으로 옮겼습니다. 아래에서 복구할 수 있습니다.`
            : "옮길 임시저장이 없었습니다.",
      });

      await loadPracticeTransferDraftList();
    } catch (error) {
      setPracticeDraftList(previousDrafts);
      if (previousActiveId) {
        setDraftFiles(previousDraftFiles);
        setDraftSummary(previousDraftSummary);
        setActiveDraftId(previousActiveId);
      }
      toast({
        title: "전체삭제 실패",
        description:
          error instanceof Error ? error.message : "임시저장 전체삭제 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setClearingAllDrafts(false);
      skipFormAutosaveRef.current = false;
    }
  };

  const handleAskEmptyTrash = () => {
    if (emptyingTrash) return;
    if (trashGroupedTransfers.length === 0) return;
    setEmptyTrashConfirmOpen(true);
  };

  const handleCancelEmptyTrash = () => {
    if (emptyingTrash) return;
    setEmptyTrashConfirmOpen(false);
  };

  const handleConfirmEmptyTrash = async () => {
    if (emptyingTrash) return;
    if (!authToken) {
      toast({
        title: "로그인이 필요합니다",
        variant: "destructive",
      });
      return;
    }

    setEmptyingTrash(true);
    try {
      const res = await apiFetch<unknown>({
        path: "/api/practice/transfers/trash/empty",
        method: "POST",
        token: authToken,
      });
      if (!res.ok) {
        const body = asApiMessagePayload(res.data);
        throw new Error(String(body?.message || "휴지통 비우기에 실패했습니다."));
      }

      const body =
        res.data && typeof res.data === "object"
          ? (res.data as {
              data?: { draftDeletedCount?: number; transferDeletedCount?: number };
            })
          : {};
      const draftDeletedCount = Number(body.data?.draftDeletedCount || 0);
      const transferDeletedCount = Number(body.data?.transferDeletedCount || 0);
      const totalDeleted = draftDeletedCount + transferDeletedCount;

      setTrashedDraftList([]);
      setRecentRequests((prev) =>
        prev.filter((row) => !isPracticeTransferTrashStatus(row.status)),
      );
      setEmptyTrashConfirmOpen(false);

      if (
        selectedTransfer &&
        (isPracticeTransferTrashStatus(selectedTransfer.status) ||
          selectedTransfer.status === "임시저장" ||
          selectedTransfer.transferId === PRACTICE_DRAFT_TRANSFER_ID)
      ) {
        handleCloseTransferDialog();
      }

      toast({
        title: "휴지통을 비웠습니다",
        description:
          totalDeleted > 0
            ? `임시저장 ${draftDeletedCount}건, 취소 전송 ${transferDeletedCount}건을 영구 삭제했습니다.`
            : "삭제할 항목이 없었습니다.",
      });

      void loadPracticeTransferDraftList();
      void loadRecentRequests({ silent: true });
    } catch (error) {
      toast({
        title: "휴지통 비우기 실패",
        description:
          error instanceof Error ? error.message : "휴지통 비우기 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setEmptyingTrash(false);
    }
  };

  useEffect(() => {
    if (!transferDialogOpen || !activeChatRoom?._id) return;
    const raf = window.requestAnimationFrame(() => {
      chatBottomRef.current?.scrollIntoView({ block: "end" });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [transferDialogOpen, activeChatRoom?._id, chatMessages.length, chatMessagesLoading]);

  useAppEventDebouncedReload({
    enabled: Boolean(authToken),
    eventTypes: [ROUND_BAR_REQUEST_UPDATED_EVENT],
    delayMs: 0,
    deferWhenEditing: false,
    onMatch: (evt) => {
      const payload =
        evt?.data && typeof evt.data === "object"
          ? (evt.data as RoundBarRequestUpdatedPayload)
          : {};
      setImplantFavorites((prev) => applyRoundBarRequestUpdate(prev, payload));
    },
  });

  useAppEventDebouncedReload({
    enabled: Boolean(authToken),
    eventTypes: [LAB_FEE_MULTIPLIER_UPDATED_EVENT],
    delayMs: 120,
    deferWhenEditing: false,
    shouldHandle: (evt) => {
      const data =
        evt?.data && typeof evt.data === "object"
          ? (evt.data as { labAnchorId?: unknown })
          : null;
      return Boolean(String(data?.labAnchorId || "").trim());
    },
    onMatch: (evt) => {
      const data =
        evt?.data && typeof evt.data === "object"
          ? (evt.data as { labAnchorId?: unknown })
          : null;
      const labId = String(data?.labAnchorId || "").trim();
      invalidatePracticeTransferQuoteContextCache(labId || null);
      void loadRecentRequests({ silent: true });
    },
  });

  useAppEventDebouncedReload({
    enabled: Boolean(authToken),
    eventTypes: ["practice:transfer-created", "practice:transfer-updated"],
    // draft 공동 작성은 입력 포커스 중에도 즉시 반영. pendingLocalFormEditRef가 덮어쓰기 보호.
    delayMs: 0,
    deferWhenEditing: false,
    onMatch: (evt) => {
      const payload =
        evt?.data && typeof evt.data === "object"
          ? (evt.data as Record<string, unknown>)
          : {};
      const action = String(payload.action || "").trim().toLowerCase();
      const isDraftEvent =
        action === "draft-upserted" || action === "draft-cleared";
      const eventDraftId = String(payload.draftId || "").trim();
      const activeId = String(activeDraftIdRef.current || "").trim();
      const summaryId = String(draftSummaryIdRef.current || "").trim();
      const linkedDraftId = activeId || summaryId;
      const isLinkedCaseEvent =
        Boolean(eventDraftId) && Boolean(linkedDraftId) && eventDraftId === linkedDraftId;
      const isActiveCaseEvent = Boolean(activeId) && eventDraftId === activeId;

      if (action === "trash-emptied") {
        setTrashedDraftList([]);
        setRecentRequests((prev) =>
          prev.filter((row) => !isPracticeTransferTrashStatus(row.status)),
        );
        void loadPracticeTransferDraftList();
        void loadRecentRequests({ silent: true });
        return;
      }

      if (action === "drafts-cleared") {
        const ids = (Array.isArray(payload.draftIds) ? payload.draftIds : [])
          .map((id) => String(id || "").trim())
          .filter(Boolean);
        setPracticeDraftList((prev) =>
          ids.length > 0 ? prev.filter((row) => !ids.includes(row.id)) : [],
        );
        invalidateApiGetCache("/api/practice/transfers/drafts");
        void loadPracticeTransferDraftList();
        if (linkedDraftId && ids.includes(linkedDraftId)) {
          void resetIntakeFormAfterTransferRef.current();
        }
        return;
      }

      if (isDraftEvent) {
        void loadPracticeTransferDraftList();
        if (action === "draft-cleared") {
          if (eventDraftId) {
            setPracticeDraftList((prev) => prev.filter((row) => row.id !== eventDraftId));
            setTrashedDraftList((prev) => prev.filter((row) => row.id !== eventDraftId));
          }
          if (isLinkedCaseEvent) {
            // 작성자·동료·다른 탭: activeDraftId가 유실돼도 draftSummary로 같은 케이스면 폼을 비운다
            void resetIntakeFormAfterTransferRef.current();
          }
          return;
        }
        // 같은 케이스(불러온 draftId)만 작성 폼에 반영
        if (isActiveCaseEvent && action === "draft-upserted") {
          // 같은 계정 다른 탭/창도 반영해야 하므로 editorUserId echo skip 하지 않는다.
          // 동일 내용은 applyPracticeDraftPayload 내부 fingerprint 비교로 no-op 처리.
          const hasEventSnapshot =
            typeof payload.transferMemo === "string" || Array.isArray(payload.files);
          if (hasEventSnapshot) {
            applyPracticeDraftPayload({
              _id: eventDraftId || activeId,
              practiceUserId: String(payload.practiceUserId || "").trim() || myUserId,
              practiceUserLabel: String(payload.practiceUserLabel || "").trim() || null,
              targetLabAnchorId:
                payload.targetLabAnchorId != null
                  ? String(payload.targetLabAnchorId).trim() || null
                  : null,
              targetLabName: String(payload.targetLabName || "").trim(),
              transferMemo: String(payload.transferMemo || ""),
              files: Array.isArray(payload.files)
                ? (payload.files as DraftTransferFileItem[])
                : [],
              updatedAt: payload.updatedAt ? String(payload.updatedAt) : null,
              createdAt: payload.createdAt ? String(payload.createdAt) : null,
              forceResync: Boolean(payload.forceResync),
            });
            return;
          }

          void loadPracticeTransferDraft({ draftId: activeId });
        }
        return;
      }

      void loadRecentRequests({ silent: true });
      if (String(evt?.type || "").trim() === "practice:transfer-created") {
        const clearedDraftId = String(payload.clearedDraftId || "").trim();
        if (clearedDraftId) {
          setPracticeDraftList((prev) => prev.filter((row) => row.id !== clearedDraftId));
          setTrashedDraftList((prev) => prev.filter((row) => row.id !== clearedDraftId));
          const linkedId =
            String(activeDraftIdRef.current || draftSummaryIdRef.current || "").trim();
          if (linkedId && linkedId === clearedDraftId) {
            // 동료/다른 탭: 전송된 케이스의 작성 폼·localStorage를 함께 비운다
            void resetIntakeFormAfterTransferRef.current();
          }
        }
        void loadPracticeTransferDraftList();
      }

      // 기공소 작업취소·지정 거부: 토스트 + 열린 상세 모달 상태 갱신
      // (자동매칭 데드라인 만료 auto-match-released는 제외)
      const releaseSource = String(payload.source || "").trim();
      const isWorkCancelRelease =
        action === "accept-released" ||
        action === "lab-rejected" ||
        (action === "auto-match-released" && releaseSource === "workCancelRelease");
      if (isWorkCancelRelease) {
        const isAutoRelease = String(payload.matchingMode || "").trim() === "auto";
        const releaseLabName = isAutoRelease
          ? ""
          : String(payload.previousLabName || "").trim() ||
            String(payload.targetLabName || "").trim();
        const isLabReject = action === "lab-rejected" || releaseSource === "labReject";
        toast({
          title: isLabReject ? "기공소 거부" : "작업 취소",
          description: isAutoRelease
            ? "기공소가 작업을 취소했습니다. 다른 기공소에 다시 공개됩니다."
            : releaseLabName
              ? `기공소「${releaseLabName}」이(가) ${
                  isLabReject ? "의뢰를 거부" : "작업을 취소"
                }했습니다. 다른 기공소를 지정하거나 휴지통으로 옮길 수 있습니다.`
              : isLabReject
                ? "기공소가 의뢰를 거부했습니다. 다른 기공소를 지정하거나 휴지통으로 옮길 수 있습니다."
                : "작업을 취소했습니다. 다른 기공소를 지정하거나 휴지통으로 옮길 수 있습니다.",
        });
        const releaseTransferId = String(payload.transferId || "").trim();
        const stageRaw =
          String(payload.manufacturerStage || "").trim() ||
          (isAutoRelease ? "자동매칭" : "작업취소");
        const stage = toStatusLabel(stageRaw);
        if (releaseTransferId) {
          setRecentRequests((prev) =>
            prev.map((row) =>
              String(row.transferId || "").trim() === releaseTransferId
                ? { ...row, status: stage }
                : row,
            ),
          );
        }
        if (
          transferDialogOpenRef.current &&
          releaseTransferId &&
          releaseTransferId === selectedTransferIdRef.current
        ) {
          const labName = String(payload.targetLabName || "").trim();
          const labAnchorId =
            payload.targetLabAnchorId != null
              ? String(payload.targetLabAnchorId).trim()
              : "";
          setSelectedTransfer((prev) => {
            if (!prev || String(prev.transferId || "").trim() !== releaseTransferId) {
              return prev;
            }
            return {
              ...prev,
              status: stage,
              ...(labName ? { targetLab: labName } : {}),
              targetLabAnchorId: isAutoRelease ? "" : labAnchorId,
            };
          });
        }
      }

      // 기공소 의뢰수락 시: 확정 기공비·상태·기공소명 갱신 + 열린 상세 채팅 재연결
      const eventTransferId = String(payload.transferId || "").trim();
      const isAcceptChatEvent =
        action === "accepted" ||
        action === "auto-match-claimed" ||
        action === "downloaded";
      if (isAcceptChatEvent && eventTransferId) {
        const labName = String(payload.targetLabName || "").trim();
        const labAnchorId = String(payload.targetLabAnchorId || "").trim();
        const stageRaw = String(payload.manufacturerStage || "").trim();
        const stage = stageRaw ? toStatusLabel(stageRaw) : "";
        const acceptedFeeQuote = parsePracticeTransferFeeQuote(payload.feeQuote);
        const patchRow = <T extends {
          transferId?: string;
          targetLab?: string;
          targetLabAnchorId?: string;
          status?: string;
          feeQuote?: ReturnType<typeof parsePracticeTransferFeeQuote>;
        }>(row: T): T => {
          if (String(row.transferId || "").trim() !== eventTransferId) return row;
          return {
            ...row,
            ...(labName ? { targetLab: labName } : {}),
            ...(labAnchorId ? { targetLabAnchorId: labAnchorId } : {}),
            ...(stage ? { status: stage } : {}),
            ...(acceptedFeeQuote ? { feeQuote: acceptedFeeQuote } : {}),
          };
        };
        setRecentRequests((prev) => prev.map(patchRow));
        if (
          transferDialogOpenRef.current &&
          eventTransferId === selectedTransferIdRef.current
        ) {
          setSelectedTransfer((prev) => (prev ? patchRow(prev) : prev));
          const resolveSeq = ++chatRoomResolveSeqRef.current;
          setChatError("");
          void resolvePracticeTransferChatRoom(eventTransferId, resolveSeq);
        }
      }
    },
  });

  const handleSubmitPracticeRequest = async () => {
    if (requestSubmittingRef.current || requestSubmitting) return;

    if (!authToken) {
      toast({
        title: "로그인이 필요합니다",
        description: "다시 로그인 후 시도해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (missingRequiredFields.length > 0) {
      const needsOralScan = missingRequiredFields.includes("구강스캔 파일");
      toast({
        title: "필수 입력 항목을 확인해주세요",
        description: needsOralScan
          ? ORAL_SCAN_REQUIRED_FOR_AUTO_MATCH_CREATE
          : `미입력 항목: ${missingRequiredFields.join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    if (!orderDate || !arrivalDate) {
      toast({
        title: "날짜를 확인해주세요",
        description: "주문일과 치과도착일을 모두 선택해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (arrivalDate < orderDate) {
      toast({
        title: "치과도착일을 확인해주세요",
        description: "치과도착일은 주문일보다 빠를 수 없습니다.",
        variant: "destructive",
      });
      return;
    }



    const hasBridgeLikeWithoutLinkedTooth = normalizedToothWorks.some(
      (row) => isBridgeLikeProsthesisType(row.prosthesisType) && row.bridgeLinkedTeeth.length === 0,
    );
    if (hasBridgeLikeWithoutLinkedTooth) {
      toast({
        title: "브리지/Pontic/작업X/유지장치 연결 치아를 선택해주세요",
        description: "브리지, Pontic, 작업X, 유지장치 형태는 인접 치아를 최소 1개 연결해야 합니다.",
        variant: "destructive",
      });
      return;
    }

    // 전송 시작 시점의 작성 중 draft만 대상. 다른 임시저장은 목록에 남긴다.
    const draftIdToSubmit = String(
      activeDraftIdRef.current || draftSummary?.id || "",
    ).trim();
    const remainingDraftCount = practiceDraftList.filter(
      (row) => row.id !== draftIdToSubmit,
    ).length;

    requestSubmittingRef.current = true;
    setRequestSubmitting(true);
    try {
      const uploadedTempFiles: TempUploadedFile[] =
        await resolveUploadedTempFiles(files);

      const localTempFiles = uploadedTempFiles
        .map((f) => ({
          fileId: String(f._id || "").trim(),
          originalName: String(f.originalName || "").trim(),
          mimetype: String(f.mimetype || f.fileType || "application/octet-stream").trim(),
          size: Number(f.size || 0),
          s3Key: String(f.key || "").trim(),
          location: String(f.location || "").trim(),
        }))
        .filter((row) => row.originalName && row.s3Key);

      const transferFiles = [...draftFiles, ...localTempFiles];
      const clinicName = autoClinicName;
      const transferId = makeTransferId();
      const transferMemo = buildPracticeTransferMemo({
        memo: requestMemo,
        orderDate,
        arrivalDate,
        arrivalDefaultDays,
        prosthesisTypes: normalizedProsthesisTypes,
        toothWorks: syncToothWorks,
        patientName: normalizedPatientName,
        skipDesignConfirm,
        skipJig: effectiveSkipJig,
      });
      const autoMatch = isAutoMatchLab(selectedLab);
      const budgetForAuto = resolveAutoMatchBudgetOrDefaults(
        autoMatchBudget,
        abutsLabFeeCatalog,
        { minStars: autoMatchMinLabRating },
      );
      const practiceRouting = {
        targetLabAnchorId: autoMatch ? null : toApiLabAnchorId(selectedLab?._id),
        targetLabName: String(selectedLab?.name || "").trim(),
        matchingMode: autoMatch ? "auto" : "direct",
        skipDesignConfirm,
        skipJig: effectiveSkipJig,
        autoMatchBudget: autoMatch ? budgetForAuto : undefined,
      };
      const newSystemRequestBase = {
        requested: true,
        manufacturer: "",
        brand: "",
        family: "",
        message: `[기공소: ${String(selectedLab?.name || "")}] ${transferMemo}\n[전송ID: ${transferId}]`,
        free: true,
        tag: "practice_file_transfer",
      };
      const caseInfosPayload =
        transferFiles.length > 0
          ? transferFiles.map((tempFile) => {
              const originalName = String(tempFile.originalName || "").trim();
              const parsed = parseFilenameWithRules(originalName);
              const tooth = String(parsed.tooth || "").trim();

              return {
                clinicName,
                patientName: normalizedPatientName,
                tooth,
                workType: "abutment",
                designSoftware: "3Shape",
                file: {
                  originalName,
                  size: Number(tempFile.size || 0),
                  mimetype: String(tempFile.mimetype || "application/octet-stream").trim(),
                  s3Key: String(tempFile.s3Key || "").trim(),
                },
                newSystemRequest: newSystemRequestBase,
                // related files:
                // - web/backend/models/practiceTransfer.model.js
                // - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
                // - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
                // practice 제출은 PracticeTransfer SSOT로 저장 (Request 컬렉션 경유 금지)
                practiceRouting,
              };
            })
          : [
              {
                clinicName,
                patientName: normalizedPatientName,
                tooth: "",
                workType: "abutment",
                designSoftware: "3Shape",
                newSystemRequest: newSystemRequestBase,
                practiceRouting,
              },
            ];

      const submitRes = await apiFetch<unknown>({
        path: "/api/practice/transfers",
        method: "POST",
        token: authToken,
        jsonBody: {
          transferId,
          draftId: draftIdToSubmit || undefined,
          matchingMode: autoMatch ? "auto" : "direct",
          targetLabAnchorId: autoMatch ? null : toApiLabAnchorId(selectedLab?._id),
          targetLabName: String(selectedLab?.name || "").trim(),
          orderDate,
          arrivalDate,
          arrivalDefaultDays,
          transferMemo,
          toothWorks: syncToothWorks,
          skipDesignConfirm,
          skipJig: effectiveSkipJig,
          autoMatchBudget: autoMatch ? budgetForAuto : undefined,
          caseInfos: caseInfosPayload,
        },
      });
      if (!submitRes.ok) {
        const body = asApiMessagePayload(submitRes.data);
        throw new Error(String(body?.message || "기공소 전송에 실패했습니다."));
      }

      suppressLocalFormPersistRef.current = true;
      skipFormAutosaveRef.current = true;
      formAutosaveSeqRef.current += 1;
      if (formAutosaveTimerRef.current) {
        window.clearTimeout(formAutosaveTimerRef.current);
        formAutosaveTimerRef.current = null;
      }

      // 작성자 UI: transfer-created 목록 재조회가 DELETE보다 늦게 끝나 draft가 다시 붙는 레이스 방지
      if (draftIdToSubmit) {
        setPracticeDraftList((prev) => prev.filter((row) => row.id !== draftIdToSubmit));
        setTrashedDraftList((prev) => prev.filter((row) => row.id !== draftIdToSubmit));
      }
      rememberLab(selectedLab);

      // 전송 시 해당 draft만 서버에서 완전 삭제. 다른 임시저장·휴지통은 그대로.
      draftListSeqRef.current += 1;
      await resetIntakeFormAfterTransfer();
      await loadPracticeTransferDraftList();

      toast({
        title: "기공소 전송 완료",
        description:
          remainingDraftCount > 0
            ? `작성 중이던 의뢰만 전송했습니다. 임시저장 ${remainingDraftCount}건은 목록에 남아 있습니다.`
            : "기공소로 정상 전송되었습니다.",
      });
      if (isExpressMode) {
        setExpressDone(true);
        setExpressStepId("lab");
        void loadRecentRequests({ silent: true });
        setRecentTransfersAllOpen(true);
      } else {
        navigate("/practice/dashboard");
      }
    } catch (error) {
      toast({
        title: "기공소 전송 실패",
        description:
          error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.",
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      requestSubmittingRef.current = false;
      setRequestSubmitting(false);
    }
  };

  const formSyncStatusLabel =
    formSyncStatus === "pending"
      ? "동기화 대기…"
      : formSyncStatus === "saving"
        ? "동기화 중…"
        : formSyncStatus === "saved" && (draftFiles.length > 0 || Boolean(activeDraftId))
          ? activeDraftId
            ? "동기화됨"
            : "임시저장됨"
          : formSyncStatus === "error"
            ? "동기화 실패 · 다시 시도"
            : "";

  const missingAbutmentPresetTeeth = useMemo(
    () => listMissingAbutmentPresetTeeth(normalizedToothWorks),
    [normalizedToothWorks],
  );

  const missingRequiredFields = useMemo(() => {
    const missing: string[] = [];
    if (!String(selectedLab?._id || "").trim()) missing.push("기공소");
    if (!normalizedPatientName) missing.push("환자명");
    if (normalizedToothWorks.length === 0) missing.push("보철물");
    if (missingAbutmentPresetTeeth.length > 0) {
      missing.push(`어벗 프리셋 (#${missingAbutmentPresetTeeth.join(", #")})`);
    }
    const attachmentCount = files.length + draftFiles.length;
    if (isAutoMatchLab(selectedLab) && attachmentCount === 0) {
      missing.push("구강스캔 파일");
    }
    return missing;
  }, [
    selectedLab,
    normalizedPatientName,
    normalizedToothWorks,
    missingAbutmentPresetTeeth,
    files.length,
    draftFiles.length,
  ]);

  const hasRequiredSubmitFields = missingRequiredFields.length === 0;

  const showExpressWizard = isExpressMode && !expressDone;

  const expressOralScanRequired = isAutoMatchLab(selectedLab);

  const expressStepGate = useMemo(() => {
    const hasLab = Boolean(String(selectedLab?._id || "").trim());
    const hasPatient = Boolean(normalizedPatientName);
    const hasSchedule = Boolean(orderDate && arrivalDate && arrivalDate >= orderDate);
    const hasProsthesis = normalizedToothWorks.length > 0;
    const hasBridgeLinkIssue = normalizedToothWorks.some(
      (row) =>
        isBridgeLikeProsthesisType(row.prosthesisType) &&
        row.bridgeLinkedTeeth.length === 0,
    );
    const hasAbutmentPresetIssue = missingAbutmentPresetTeeth.length > 0;
    const attachmentCount = files.length + draftFiles.length;
    const hasRequiredFiles = !expressOralScanRequired || attachmentCount > 0;

    const byStep: Record<
      PracticeTransferExpressStepId,
      { ok: boolean; reason: string }
    > = {
      lab: {
        ok: hasLab,
        reason: "기공소를 선택해 주세요.",
      },
      patient: {
        ok: hasPatient,
        reason: "환자명을 입력해 주세요.",
      },
      schedule: {
        ok: hasSchedule,
        reason: "치과 도착일을 확인해 주세요.",
      },
      prosthesis: {
        ok: hasProsthesis && !hasBridgeLinkIssue && !hasAbutmentPresetIssue,
        reason: !hasProsthesis
          ? "보철할 치아를 선택해 주세요."
          : hasBridgeLinkIssue
            ? "브리지 등은 인접 치아를 연결해 주세요."
            : hasAbutmentPresetIssue
              ? `어벗 프리셋을 설정해 주세요 (#${missingAbutmentPresetTeeth.join(", #")}).`
              : "",
      },
      files: {
        ok: hasRequiredFiles,
        reason: "자동 매칭은 구강스캔 파일이 필요합니다.",
      },
      confirm: {
        ok: hasRequiredSubmitFields,
        reason:
          missingRequiredFields.length > 0
            ? `미입력: ${missingRequiredFields.join(", ")}`
            : "",
      },
    };
    return byStep;
  }, [
    selectedLab,
    normalizedPatientName,
    orderDate,
    arrivalDate,
    normalizedToothWorks,
    missingAbutmentPresetTeeth,
    files.length,
    draftFiles.length,
    expressOralScanRequired,
    hasRequiredSubmitFields,
    missingRequiredFields,
  ]);

  useEffect(() => {
    if (!isExpressMode) {
      prevWorkspaceModeRef.current = workspaceMode;
      return;
    }
    const order: PracticeTransferExpressStepId[] = [
      "lab",
      "patient",
      "schedule",
      "prosthesis",
      "files",
      "confirm",
    ];
    const firstIncomplete =
      order.find((id) => !expressStepGate[id]?.ok) || "confirm";
    const prev = prevWorkspaceModeRef.current;
    if (prev === null) {
      if (!localFormHydrated) return;
      prevWorkspaceModeRef.current = workspaceMode;
      if (expressStepRestoredRef.current) return;
      expressStepRestoredRef.current = true;
      setExpressStepId(firstIncomplete);
      return;
    }
    prevWorkspaceModeRef.current = workspaceMode;
    if (prev === "express") return;
    setExpressDone(false);
    expressStepRestoredRef.current = true;
    setExpressStepId(firstIncomplete);
  }, [expressStepGate, isExpressMode, localFormHydrated, workspaceMode]);

  useEffect(() => {
    if (!orderDate) return;
    if (skipNextArrivalAutoSyncRef.current) {
      skipNextArrivalAutoSyncRef.current = false;
      return;
    }
    setArrivalDate(addDaysToDateInput(orderDate, arrivalDefaultDays));
  }, [orderDate, arrivalDefaultDays]);

  // 주문일은 항상 오늘(KST)로 고정
  useEffect(() => {
    if (orderDate === todayDate) return;
    skipNextArrivalAutoSyncRef.current = true;
    setOrderDate(todayDate);
    setArrivalDate((prev) => {
      const current = String(prev || "").trim();
      if (current && current >= todayDate) return current;
      return addDaysToDateInput(todayDate, arrivalDefaultDays);
    });
  }, [arrivalDefaultDays, orderDate, todayDate]);

  useEffect(() => {
    if (!localFormHydrated) return;
    if (toothWorks.length > 0) return;
    if (normalizedProsthesisTypes.length === 0) return;
    setToothWorks([
      {
        toothNumber: "",
        prosthesisType: resolveDefaultProsthesisType(normalizedProsthesisTypes),
        customAbutment: false,
        bridgeLinkedTeeth: [],
        ...emptyToothWorkCustomSpecs(),
      },
    ]);
  }, [localFormHydrated, normalizedProsthesisTypes, toothWorks.length]);

  const handleAddToothWorkRow = () => {
    setToothWorks((prev) => [
      ...prev,
      {
        toothNumber: "",
        prosthesisType: resolveDefaultProsthesisType(normalizedProsthesisTypes),
        customAbutment: false,
        bridgeLinkedTeeth: [],
        ...emptyToothWorkCustomSpecs(),
      },
    ]);
  };

  const handleStartNewTransfer = async () => {
    clearPracticeSharedFormLocalStorage();

    formAutosaveSeqRef.current += 1;
    if (formAutosaveTimerRef.current) {
      window.clearTimeout(formAutosaveTimerRef.current);
      formAutosaveTimerRef.current = null;
    }
    skipFormAutosaveRef.current = true;
    lastAppliedServerUpdatedAtRef.current = 0;
    pendingLocalFormEditRef.current = false;
    setFormSyncStatus("idle");

    setLabOpen(false);
    setLabSearch("");
    // 최근 기공소(localStorage + 서버 전송내역)는 드롭다운 후보로만 유지. 선택은 비워 다시 고르게 한다.
    setSelectedLab(null);
    setPatientName("");
    setRequestMemo("");
    const nextOrderDate = todayDate;
    const nextArrivalDate = addDaysToDateInput(todayDate, arrivalDefaultDays);
    setOrderDate(nextOrderDate);
    setArrivalDate(nextArrivalDate);
    const nextToothWorks: ToothWorkSelection[] = [
      {
        toothNumber: "",
        prosthesisType: resolveDefaultProsthesisType(normalizedProsthesisTypes),
        customAbutment: false,
        bridgeLinkedTeeth: [],
        ...emptyToothWorkCustomSpecs(),
      },
    ];
    setToothWorks(nextToothWorks);

    // 화면만 비움. 서버 임시저장은 목록에 유지(삭제는 임시저장 카드에서).
    await clearLocalFilesWithCache();
    setDraftFiles([]);
    setDraftSummary(null);
    setActiveDraftId(null);
    activeDraftSeenInListRef.current = null;
    setToothChartResetNonce((n) => n + 1);
    setExpressDone(false);
    setExpressStepId("lab");
    setExpressWizardEpoch((n) => n + 1);
    expressStepRestoredRef.current = true;

    // 빈 폼 baseline — 이후 의뢰서 항목을 바꾸거나 파일을 업로드하면 그때 동기화된다.
    const baselineFingerprint = buildPracticeTransferFormFingerprint({
      targetLabAnchorId: undefined,
      targetLabName: undefined,
      patientName: "",
      orderDate: nextOrderDate,
      arrivalDate: nextArrivalDate,
      arrivalDefaultDays,
      requestMemo: "",
      prosthesisTypes: normalizedProsthesisTypes,
      toothWorks: normalizeToothWorksForSync(nextToothWorks),
    });
    lastSavedFormFingerprintRef.current = baselineFingerprint;
    setLastSavedFormFingerprint(baselineFingerprint);
    currentFormFingerprintRef.current = baselineFingerprint;

    void loadPracticeTransferDraftList();
    queueMicrotask(() => {
      skipFormAutosaveRef.current = false;
    });

    toast({
      title: "새로 작성",
      description: isExpressMode
        ? "작성 화면을 비웠습니다. 전송 후에는 최근 의뢰에서 다시 확인할 수 있습니다."
        : "작성 화면을 비웠습니다. 임시저장은 임시저장 목록에 남아 다시 불러올 수 있습니다.",
    });
  };

  const persistArrivalDefaultDaysFromRange = useCallback(
    (nextOrder: string, nextArrival: string) => {
      const diff = kstYmdDiffDays(nextOrder, nextArrival);
      if (diff == null) return;
      const nextDays = normalizeArrivalDefaultDays(diff);
      if (nextDays === arrivalDefaultDays) return;

      // orderDate effect가 도착일을 덮어쓰지 않도록 한 틱 스킵
      skipNextArrivalAutoSyncRef.current = true;
      setArrivalDefaultDays(nextDays);

      try {
        const existingRaw = localStorage.getItem(PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY);
        const existing =
          existingRaw && typeof existingRaw === "string"
            ? (JSON.parse(existingRaw) as Record<string, unknown>)
            : {};
        localStorage.setItem(
          PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY,
          JSON.stringify({
            ...existing,
            arrivalDefaultDays: nextDays,
            prosthesisTypes: normalizedProsthesisTypes,
            memoSnippets,
            implantFavorites,
            abutmentFavorites,
            savedAt: Date.now(),
          }),
        );
      } catch {
        // ignore
      }

      void savePracticeTransferSettingsToServer({ arrivalDefaultDays: nextDays }).catch(() => {
        // 날짜 적용은 유지하고, 서버 저장 실패는 다음 저장 기회에 재시도
      });
    },
    [
      abutmentFavorites,
      arrivalDefaultDays,
      implantFavorites,
      memoSnippets,
      normalizedProsthesisTypes,
      savePracticeTransferSettingsToServer,
    ],
  );

  const persistSkipDesignConfirmSetting = useCallback(
    (next: boolean) => {
      if (next === skipDesignConfirm) return;
      setSkipDesignConfirm(next);

      try {
        const existingRaw = localStorage.getItem(PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY);
        const existing =
          existingRaw && typeof existingRaw === "string"
            ? (JSON.parse(existingRaw) as Record<string, unknown>)
            : {};
        localStorage.setItem(
          PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY,
          JSON.stringify({
            ...existing,
            arrivalDefaultDays,
            prosthesisTypes: normalizedProsthesisTypes,
            memoSnippets,
            implantFavorites,
            abutmentFavorites,
            skipDesignConfirm: next,
            skipJig,
            savedAt: Date.now(),
          }),
        );
      } catch {
        // ignore
      }

      void savePracticeTransferSettingsToServer({ skipDesignConfirm: next }).catch(() => {
        // UI 값은 유지하고, 서버 저장 실패는 다음 저장 기회에 재시도
      });
    },
    [
      abutmentFavorites,
      arrivalDefaultDays,
      implantFavorites,
      memoSnippets,
      normalizedProsthesisTypes,
      savePracticeTransferSettingsToServer,
      skipDesignConfirm,
      skipJig,
    ],
  );

  const persistSkipJigSetting = useCallback(
    (next: boolean) => {
      if (next === skipJig) return;
      setSkipJig(next);

      try {
        const existingRaw = localStorage.getItem(PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY);
        const existing =
          existingRaw && typeof existingRaw === "string"
            ? (JSON.parse(existingRaw) as Record<string, unknown>)
            : {};
        localStorage.setItem(
          PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY,
          JSON.stringify({
            ...existing,
            arrivalDefaultDays,
            prosthesisTypes: normalizedProsthesisTypes,
            memoSnippets,
            implantFavorites,
            abutmentFavorites,
            skipDesignConfirm,
            skipJig: next,
            savedAt: Date.now(),
          }),
        );
      } catch {
        // ignore
      }

      void savePracticeTransferSettingsToServer({ skipJig: next }).catch(() => {
        // UI 값은 유지하고, 서버 저장 실패는 다음 저장 기회에 재시도
      });
    },
    [
      abutmentFavorites,
      arrivalDefaultDays,
      implantFavorites,
      memoSnippets,
      normalizedProsthesisTypes,
      savePracticeTransferSettingsToServer,
      skipDesignConfirm,
      skipJig,
    ],
  );

  const persistDefaultAbutmentProductModeSetting = useCallback(
    (next: AbutmentProductMode) => {
      const normalized = normalizeAccountAbutmentProductMode(next);
      if (normalized === defaultAbutmentProductMode) return;
      setDefaultAbutmentProductMode(normalized);

      try {
        const existingRaw = localStorage.getItem(PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY);
        const existing =
          existingRaw && typeof existingRaw === "string"
            ? (JSON.parse(existingRaw) as Record<string, unknown>)
            : {};
        localStorage.setItem(
          PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY,
          JSON.stringify({
            ...existing,
            arrivalDefaultDays,
            prosthesisTypes: normalizedProsthesisTypes,
            memoSnippets,
            implantFavorites,
            abutmentFavorites,
            skipDesignConfirm,
            skipJig,
            defaultAbutmentProductMode: normalized,
            savedAt: Date.now(),
          }),
        );
      } catch {
        // ignore
      }

      void savePracticeTransferSettingsToServer({
        defaultAbutmentProductMode: normalized,
      }).catch(() => {
        // UI 값은 유지하고, 서버 저장 실패는 다음 저장 기회에 재시도
      });
    },
    [
      abutmentFavorites,
      arrivalDefaultDays,
      defaultAbutmentProductMode,
      implantFavorites,
      memoSnippets,
      normalizedProsthesisTypes,
      savePracticeTransferSettingsToServer,
      skipDesignConfirm,
      skipJig,
    ],
  );

  const handleSaveProsthesisTypeSettings = async () => {
    if (savingProsthesisTypeSettings) return;
    setSavingProsthesisTypeSettings(true);
    try {
      const nextTypes = ensurePresetProsthesisTypes(prosthesisTypeCatalogDraft);
      const ok = await savePracticeTransferSettingsToServer({
        arrivalDefaultDays,
        prosthesisTypes: nextTypes,
      });
      if (!ok) throw new Error("설정 저장에 실패했습니다.");

      setToothWorks((prev) =>
        prev.map((row) => {
          const customAbutment = Boolean(row.customAbutment);
          return {
            toothNumber: row.toothNumber,
            prosthesisType: nextTypes.some((type) => type === row.prosthesisType)
              ? row.prosthesisType
              : resolveDefaultProsthesisType(nextTypes),
            customAbutment,
            ...pickToothWorkAbutmentProductMode(row, customAbutment),
            bridgeLinkedTeeth: Array.isArray(row.bridgeLinkedTeeth) ? row.bridgeLinkedTeeth : [],
            ...pickToothWorkCustomSpecs(row, customAbutment),
          };
        }),
      );
      setProsthesisTypeSettingsDialogOpen(false);
      toast({ title: "보철물 설정 저장", description: "목록을 저장했습니다." });
    } catch (error) {
      toast({
        title: "설정 저장 실패",
        description: error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setSavingProsthesisTypeSettings(false);
    }
  };


  const practiceTransferFilePaneProps: PracticeTransferFilePaneProps = {
    acceptedHint: PRACTICE_ACCEPTED_HINT,
                    fileInputId: "practice-file-transfer-input",
                    requirementNote:
                      isAutoMatchLab(selectedLab)
                        ? "자동매칭은 구강스캔 첨부가 필수입니다."
                        : null,
                    files: combinedDisplayFiles.map((file) => {
                      const localFile =
                        file.kind === "local" ? files[file.localIndex] : null;
                      const progress = localFile
                        ? uploadProgress[toTempUploadFileKey(localFile)]
                        : undefined;
                      return {
                        key: file.key,
                        name: file.name,
                        size: file.size,
                        metaSuffix: file.kind === "draft" ? "동기화됨" : "대기",
                        uploadPercent: progress?.percent,
                        uploadStatus:
                          file.kind === "draft" ? "done" : progress?.status,
                      };
                    }),
                    totalSizeMb: combinedFilesSizeMb,
                    onPickFiles: handleIncomingFiles,
                    onRemoveFile: (key) => {
                      const target = combinedDisplayFiles.find((file) => file.key === key);
                      if (!target) return;
                      void handleRemoveCombinedFile({
                        kind: target.kind,
                        localIndex: target.kind === "local" ? target.localIndex : undefined,
                        draftIndex: target.kind === "draft" ? target.draftIndex : undefined,
                      });
                    },
                    onClearAllFiles: () => {
                      void handleClearAllTransferFiles();
                    },
  };

  const practiceTransferRequestIntakeProps: PracticeTransferRequestIntakePanelProps = {
    variant: "plain",
                    selectedLab,
                  setSelectedLab,
                  labOpen,
                  setLabOpen,
                  labSearch,
                  setLabSearch,
                  labSearchResults,
                  labSearching,
                  recentLabs,
                  recentLabsInitialized,
                  pinnedLabs,
                  onRemoveRecentLab: removeRecentLab,
                  onTogglePinLab: togglePinLab,
                  patientName,
                  setPatientName,
                  orderDate,
                  setOrderDate,
                  arrivalDate,
                  setArrivalDate,
                  onOrderArrivalDatesChange: ({ arrivalDate: nextArrival }) => {
                    skipNextArrivalAutoSyncRef.current = true;
                    setOrderDate(todayDate);
                    const arrival =
                      String(nextArrival || "").trim() >= todayDate
                        ? String(nextArrival || "").trim()
                        : addDaysToDateInput(todayDate, arrivalDefaultDays);
                    setArrivalDate(arrival);
                    persistArrivalDefaultDaysFromRange(todayDate, arrival);
                  },
                  arrivalDefaultDays,
                  normalizedProsthesisTypes,
                  setProsthesisTypeCatalogDraft,
                  setProsthesisTypeSettingsDialogOpen,
                  toothWorks,
                  setToothWorks,
                  requestMemo,
                  setRequestMemo,
                  memoInputId: "practice-file-transfer-request-memo",
                  toothChartResetNonce,
                  memoSnippets,
                  autoMatchBudget,
                  abutsLabFeeCatalog,
                  autoMatchMinLabRating,
                  onAutoMatchMinLabRatingChange: (next) => {
                    const normalized = normalizeAutoMatchMinLabRating(next);
                    setAutoMatchMinLabRating(normalized);
                    setAutoMatchBudget(
                      resolveAutoMatchBudgetOrDefaults(null, abutsLabFeeCatalog, {
                        minStars: normalized,
                      }),
                    );
                    void savePracticeTransferSettingsToServer({
                      autoMatchMinLabRating: normalized,
                    }).catch(() => {});
                  },
                  onMemoSnippetsChange: async (next) => {
                    const normalized = normalizeMemoSnippets(next);
                    setMemoSnippets(normalized);
                    try {
                      const existingRaw = localStorage.getItem(PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY);
                      const existing =
                        existingRaw && typeof existingRaw === "string"
                          ? (JSON.parse(existingRaw) as Record<string, unknown>)
                          : {};
                      localStorage.setItem(
                        PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY,
                        JSON.stringify({
                          ...existing,
                          arrivalDefaultDays,
                          prosthesisTypes: normalizedProsthesisTypes,
                          memoSnippets: normalized,
                          implantFavorites,
                          abutmentFavorites,
                          savedAt: Date.now(),
                        }),
                      );
                      localStorage.setItem(
                        "practice_transfer_memo_snippets_v1",
                        JSON.stringify(normalized),
                      );
                    } catch {
                      // ignore
                    }
                    await savePracticeTransferSettingsToServer({ memoSnippets: normalized });
                  },
                  implantConnections,
                  defaultAbutmentProductMode,
                  onDefaultAbutmentProductModeChange: persistDefaultAbutmentProductModeSetting,
                  lockedAbutmentProductMode: ABUTMENT_PRODUCT_MODE.DESIGN_AND_PRODUCTION,
                  onAlternateAbutmentModeNavigate: () => {
                    navigate("/dashboard/new-request");
                  },
                  implantFavorites,
                  onPresetEditorOpen: () => {
                    void loadPracticeTransferSettingsFromServer();
                  },
                  onImplantFavoritesChange: (next) => {
                    const normalized = normalizeImplantFavorites(next);
                    setImplantFavorites(normalized);
                    try {
                      const existingRaw = localStorage.getItem(PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY);
                      const existing =
                        existingRaw && typeof existingRaw === "string"
                          ? (JSON.parse(existingRaw) as Record<string, unknown>)
                          : {};
                      localStorage.setItem(
                        PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY,
                        JSON.stringify({
                          ...existing,
                          arrivalDefaultDays,
                          prosthesisTypes: normalizedProsthesisTypes,
                          memoSnippets,
                          implantFavorites: normalized,
                          abutmentFavorites,
                          savedAt: Date.now(),
                        }),
                      );
                    } catch {
                      // ignore
                    }
                    void savePracticeTransferSettingsToServer({ implantFavorites: normalized });
                  },
                  abutmentFavorites,
                  onAbutmentFavoritesChange: (next) => {
                    const normalized = normalizeAbutmentFavorites(next);
                    setAbutmentFavorites(normalized);
                    try {
                      const existingRaw = localStorage.getItem(PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY);
                      const existing =
                        existingRaw && typeof existingRaw === "string"
                          ? (JSON.parse(existingRaw) as Record<string, unknown>)
                          : {};
                      localStorage.setItem(
                        PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY,
                        JSON.stringify({
                          ...existing,
                          arrivalDefaultDays,
                          prosthesisTypes: normalizedProsthesisTypes,
                          memoSnippets,
                          implantFavorites,
                          abutmentFavorites: normalized,
                          savedAt: Date.now(),
                        }),
                      );
                    } catch {
                      // ignore
                    }
                    void savePracticeTransferSettingsToServer({ abutmentFavorites: normalized });
                  },
                  onImeComposingChange: (composing) => {
                    imeComposingRef.current = composing;
                    if (composing) return;
                    const pending = pendingDraftApplyRef.current;
                    if (!pending) return;
                    pendingDraftApplyRef.current = null;
                    applyPracticeDraftPayload(pending, {
                      forceResync: Boolean(pending.forceResync),
                    });
                  },
                  prosthesisTypeSelectWidthClassName: "w-[7rem]",
                  showBridgeConnections: true,
                  skipJig,
                  onSkipJigChange: persistSkipJigSetting,
  };

  return (
    <PageFileDropZone
      onFiles={handleIncomingFiles}
      activeClassName="ring-2 ring-primary/30"
      className="h-full min-h-0 bg-gradient-subtle"
    >
      <div className="mx-auto h-full min-h-0 max-w-6xl space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {roleSwitcher}
          <WorkspaceModeSwitch />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 px-3"
                onClick={() => void handleStartNewTransfer()}
              >
                새로 작성
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              작성 화면만 비웁니다. 임시저장은 목록에 남습니다.
            </TooltipContent>
          </Tooltip>
          {isExpressMode ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 px-3"
                onClick={() => setRecentTransfersAllOpen(true)}
              >
                <ClipboardList className="h-4 w-4 shrink-0" />
                최근 의뢰
                {recentActionNeededCount > 0 ? (
                  <Badge variant="secondary" className="ml-0.5">
                    {recentActionNeededCount}
                  </Badge>
                ) : null}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 px-3"
                onClick={() => setDraftsOpen(true)}
              >
                <BookmarkPlus className="h-4 w-4 shrink-0" />
                임시저장
                {draftGroupedTransfers.length > 0 ? (
                  <Badge variant="secondary" className="ml-0.5">
                    {draftGroupedTransfers.length}
                  </Badge>
                ) : null}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 px-3"
                onClick={() => setTrashOpen(true)}
              >
                <Trash2 className="h-4 w-4 shrink-0" />
                휴지통
                {trashGroupedTransfers.length > 0 ? (
                  <Badge variant="secondary" className="ml-0.5">
                    {trashGroupedTransfers.length}
                  </Badge>
                ) : null}
              </Button>
            </>
          ) : null}
        </div>

        <div className={cn("grid grid-cols-1 gap-3", !isExpressMode && "xl:grid-cols-10")}>
          <div className={cn("flex min-w-0 flex-col gap-3", !isExpressMode && "xl:col-span-7")}>
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="pb-2 pt-3">
              <div className="flex items-center gap-4">
                <CardTitle className="flex shrink-0 items-center gap-2 text-xl font-bold tracking-tight">
                  <UploadCloud className="h-5 w-5 shrink-0 text-primary-strong" />
                  <span className="shrink-0">기공의뢰</span>
                  {formSyncStatusLabel ? (
                    <span
                      className={cn(
                        "truncate text-xs font-normal",
                        formSyncStatus === "error"
                          ? "text-destructive"
                          : "text-muted-foreground",
                      )}
                    >
                      {formSyncStatusLabel}
                    </span>
                  ) : null}
                </CardTitle>
              <div className="flex flex-1 items-center justify-end gap-4">
                {showExpressWizard ? (
                  <PracticeTransferExpressStepProgress
                    key={expressWizardEpoch}
                    className="min-w-0"
                    stepId={expressStepId}
                    onStepIdChange={setExpressStepId}
                    stepOkById={{
                      lab: expressStepGate.lab.ok,
                      patient: expressStepGate.patient.ok,
                      // 일정은 항상 기본값이 있어 게이트 ok여도 체크하지 않는다
                      schedule: false,
                      prosthesis: expressStepGate.prosthesis.ok,
                      // 파일은 실제 첨부가 있을 때만 체크(선택 첨부의 빈 상태 제외)
                      files: files.length + draftFiles.length > 0,
                      confirm: expressStepGate.confirm.ok,
                    }}
                  />
                ) : null}
              </div>
              </div>
            </CardHeader>
            <CardContent className="pt-5">
              {showExpressWizard ? (
                <PracticeTransferExpressWizard
                  key={expressWizardEpoch}
                  stepId={expressStepId}
                  onStepIdChange={setExpressStepId}
                  filePaneProps={practiceTransferFilePaneProps}
                  requestIntakeProps={practiceTransferRequestIntakeProps}
                  summary={{
                    labLabel: resolveExpressLabLabel(selectedLab),
                    patientName: normalizedPatientName,
                    orderDate,
                    arrivalDate,
                    toothCount: normalizedToothWorks.length,
                    fileCount: files.length + draftFiles.length,
                  }}
                  canProceed={expressStepGate[expressStepId]?.ok ?? false}
                  proceedBlockedReason={expressStepGate[expressStepId]?.reason}
                  oralScanRequired={expressOralScanRequired}
                  skipDesignConfirm={skipDesignConfirm}
                  onSkipDesignConfirmChange={persistSkipDesignConfirmSetting}
                  onOpenSkipDesignConfirmUncheck={() =>
                    setSkipDesignConfirmUncheckOpen(true)
                  }
                  onSubmit={() => void handleSubmitPracticeRequest()}
                  submitting={requestSubmitting}
                  canSubmit={hasRequiredSubmitFields}
                  missingRequiredFields={missingRequiredFields}
                />
              ) : isExpressMode && expressDone ? (
                <PracticeTransferExpressDonePanel
                  onStartNew={() => void handleStartNewTransfer()}
                  onViewRecent={() => setRecentTransfersAllOpen(true)}
                />
              ) : (
                <PracticeTransferIntakeSection
                  filePaneProps={practiceTransferFilePaneProps}
                  requestIntakeProps={practiceTransferRequestIntakeProps}
                />
              )}
            </CardContent>
          </Card>

          {!isExpressMode ? (
          <div className="flex items-center justify-end gap-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <label
                  htmlFor="practice-skip-design-confirm"
                  className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 select-none"
                >
                  <Checkbox
                    id="practice-skip-design-confirm"
                    checked={skipDesignConfirm}
                    onCheckedChange={(value) => {
                      if (value === true) {
                        persistSkipDesignConfirmSetting(true);
                        return;
                      }
                      // 해제 시 안내 모달 후 확인
                      setSkipDesignConfirmUncheckOpen(true);
                    }}
                    disabled={requestSubmitting}
                  />
                  <span>디자인 컨펌 생략</span>
                </label>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                <p>
                  커스텀어벗은 어벗츠가 디자인한 뒤 기공소가 확인하면 생산합니다.
                  체크를 해제하면 치과도 디자인을 컨펌해야 생산이 시작되어 일정이
                  늦어질 수 있습니다. 기본은 생략(체크)입니다.
                </p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    type="button"
                    className="bg-primary-strong text-white hover:bg-primary-strong disabled:pointer-events-none disabled:opacity-40"
                    onClick={() => void handleSubmitPracticeRequest()}
                    disabled={requestSubmitting || !hasRequiredSubmitFields}
                  >
                    {requestSubmitting ? "기공소로 전송 중..." : "기공소로 전송"}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                align="end"
                className="max-w-xs border-slate-200 bg-white px-3 py-2 text-sm font-medium leading-snug text-slate-900 shadow-lg"
              >
                {requestSubmitting ? (
                  <p>전송 중…</p>
                ) : hasRequiredSubmitFields ? (
                  <p className="text-primary-strong">전송 가능</p>
                ) : (
                  <ul className="space-y-1">
                    {(
                      [
                        { key: "기공소", ok: Boolean(String(selectedLab?._id || "").trim()) },
                        { key: "환자명", ok: Boolean(normalizedPatientName) },
                        { key: "보철물", ok: normalizedToothWorks.length > 0 },
                        ...(missingAbutmentPresetTeeth.length > 0 ||
                        normalizedToothWorks.some((row) => row.customAbutment)
                          ? [
                              {
                                key:
                                  missingAbutmentPresetTeeth.length > 0
                                    ? `어벗 프리셋 (#${missingAbutmentPresetTeeth.join(", #")})`
                                    : "어벗 프리셋",
                                ok: missingAbutmentPresetTeeth.length === 0,
                              },
                            ]
                          : []),
                        ...(isAutoMatchLab(selectedLab)
                          ? [
                              {
                                key: "구강스캔 파일",
                                ok: files.length + draftFiles.length > 0,
                              },
                            ]
                          : []),
                      ]
                    ).map((item) => (
                      <li
                        key={item.key}
                        className={
                          item.ok
                            ? "text-primary-strong"
                            : "font-semibold text-accent-strong"
                        }
                      >
                        {item.key}
                        {item.ok ? " ✓" : " · 필요"}
                      </li>
                    ))}
                  </ul>
                )}
              </TooltipContent>
            </Tooltip>
          </div>
          ) : null}

          <Dialog
            open={skipDesignConfirmUncheckOpen}
            onOpenChange={setSkipDesignConfirmUncheckOpen}
          >
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>디자인 컨펌을 직접 하시겠어요?</DialogTitle>
                <DialogDescription className="leading-relaxed">
                  생략을 해제하면 어벗츠 디자인 후 치과 컨펌을 기다려야 생산이
                  시작됩니다. 기일이 촉박한 경우 지연될 수 있습니다. 꼭 확인이
                  필요한 의뢰만 해제해 주세요.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSkipDesignConfirmUncheckOpen(false)}
                >
                  취소
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    persistSkipDesignConfirmSetting(false);
                    setSkipDesignConfirmUncheckOpen(false);
                  }}
                >
                  컨펌 받기로 설정
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>

          {!isExpressMode ? (
          <div className="space-y-3 xl:col-span-3">
            <Card className="border-slate-200/80 shadow-sm">
              <Collapsible open={recentTransfersOpen} onOpenChange={setRecentTransfersOpen}>
              <CardHeader className="pb-2 pt-3">
                <div className="mb-2 flex w-full items-center justify-between gap-2">
                  <CollapsibleTrigger asChild>
                    <button type="button" className="flex min-w-0 flex-1 items-center text-left">
                      <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                        <ClipboardList className="h-4 w-4 text-primary-strong" />
                        최근 전송
                        {recentActionNeededCount > 0 ? (
                          <Badge variant="secondary" className="ml-1">
                            {recentActionNeededCount}
                          </Badge>
                        ) : null}
                      </CardTitle>
                    </button>
                  </CollapsibleTrigger>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 px-2 border-primary-muted text-primary-strong hover:bg-primary-soft hover:text-primary-strong"
                      onClick={() => setRecentTransfersAllOpen(true)}
                    >
                      <LayoutGrid className="h-3.5 w-3.5" />
                      전체 보기
                    </Button>
                    {remakeSelectedTransfers.length > 0 ? (
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 gap-1 px-2 bg-amber-600 text-white hover:bg-amber-700"
                        onClick={() => setRemakeConfirmOpen(true)}
                      >
                        <Repeat className="h-3.5 w-3.5" />
                        리메이크 {remakeSelectedTransfers.length}
                      </Button>
                    ) : null}
                    <CollapsibleTrigger asChild>
                      <button type="button" className="shrink-0 text-muted-foreground">
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${recentTransfersOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                    </CollapsibleTrigger>
                  </div>
                </div>
                <CollapsibleContent>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center justify-start">
                    <PeriodFilter
                      value={period}
                      onChange={setPeriod}
                      presets={[]}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {PRACTICE_RECENT_STATUS_BADGES.map((item) => (
                      <Tooltip key={item.filter}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="rounded-full"
                            onClick={() =>
                              setRecentStatusFilter((prev) =>
                                prev === item.filter ? "all" : item.filter,
                              )
                            }
                            aria-pressed={recentStatusFilter === item.filter}
                          >
                            <Badge
                              variant="outline"
                              className={cn(
                                "cursor-pointer",
                                item.filter === "리메이크"
                                  ? recentStatusFilter === item.filter
                                    ? PRACTICE_REMAKE_BADGE_CLASS
                                    : "border-amber-200 bg-amber-50/70 text-amber-800 hover:bg-amber-50"
                                  : recentStatusFilter === item.filter
                                    ? "border-primary/70 bg-primary-soft text-primary-strong"
                                    : "hover:bg-muted/40",
                              )}
                            >
                              {item.label} {statusCounts[item.countKey]}건
                            </Badge>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                          {item.tooltip}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>

                  <div className="relative w-full md:max-w-md">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={requestSearchTerm}
                      onChange={(e) => setRequestSearchTerm(e.target.value)}
                      className="pl-9"
                      placeholder="전송ID, 환자명 검색"
                    />
                  </div>
                </div>
                </CollapsibleContent>
              </CardHeader>
              <CollapsibleContent>
              <CardContent className="space-y-2">
                {recentRequestsLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, idx) => (
                      <div
                        key={`recent-skel-${idx}`}
                        className="rounded-lg border px-3 py-2 space-y-2"
                      >
                        <Skeleton className="h-4 w-28" />
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-3 w-24" />
                          <Skeleton className="h-5 w-14 rounded-full" />
                        </div>
                        <Skeleton className="h-3 w-40" />
                      </div>
                    ))}
                  </div>
                ) : recentRequestsError ? (
                  <div className="rounded-lg border border-dashed px-3 py-8 text-center text-sm text-destructive">
                    {recentRequestsError}
                  </div>
                ) : displayGroupedTransfers.length === 0 ? (
                  <div className="rounded-lg border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
                    {recentStatusFilter === "all"
                      ? "전송 내역 없음"
                      : `${
                          recentStatusFilter === "발송완료"
                            ? "의뢰"
                            : recentStatusFilter === "포장.발송"
                              ? "발송"
                              : recentStatusFilter === "의뢰수락"
                                ? "수락"
                                : recentStatusFilter === "작업완료"
                                  ? "완료"
                                  : recentStatusFilter === "취소"
                                    ? "취소"
                                  : recentStatusFilter === "리메이크"
                                    ? "리메이크"
                                  : recentStatusFilter
                        } 없음`}
                  </div>
                ) : (
                  <div className="max-h-[19rem] space-y-2 overflow-y-auto pr-1">
                    {displayGroupedTransfers.map((transfer) => {
                      const targetLabText =
                        String(transfer.targetLab || "-")
                          .replace(/\s*→.*$/g, "")
                          .trim() || "-";
                      const isDraftTransfer =
                        transfer.status === "임시저장" ||
                        transfer.transferId === PRACTICE_DRAFT_TRANSFER_ID;
                      const remakeKey = String(
                        transfer.transferMongoIds?.[0] || transfer.id || "",
                      ).trim();
                      const canRemake = canRemakePracticeTransferByStatus(transfer.status);
                      const remakeChecked = remakeSelectedIds.includes(remakeKey);
                      const acceptOverdue =
                        !isDraftTransfer &&
                        isPracticeTransferAcceptOverdue({
                          status: transfer.status,
                          orderDate: transfer.orderDate,
                          createdAtTs: transfer.createdAtTs,
                        });
                      const needsAction = isPracticeTransferActionNeededStatus(
                        transfer.status,
                      );

                      return (
                        <div
                          key={`${transfer.id}:${transfer.createdAt}`}
                          role="button"
                          tabIndex={0}
                          className={cn(
                            "w-full cursor-pointer rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            needsAction && "practice-transfer-attention",
                          )}
                          aria-label={
                            needsAction
                              ? `${transfer.transferId !== "-" ? transfer.transferId : transfer.id} 조치 대기`
                              : undefined
                          }
                          onClick={() => void handleOpenTransferDialog(transfer)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              void handleOpenTransferDialog(transfer);
                            }
                          }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {isDraftTransfer
                                  ? "임시저장"
                                  : transfer.transferId !== "-"
                                    ? transfer.transferId
                                    : transfer.id}
                              </p>
                              <div className="mt-0.5 flex items-center gap-2">
                                <p className="truncate text-xs text-muted-foreground">{transfer.createdAt}</p>
                                <Badge variant="outline" className="whitespace-nowrap">
                                  {toStatusBadgeLabel(transfer.status)}
                                </Badge>
                                {acceptOverdue ? (
                                  <PracticeAcceptOverdueBadge viewer="practice" />
                                ) : null}
                                {transfer.isRemake ? (
                                  <Badge
                                    variant="outline"
                                    className={cn("whitespace-nowrap", PRACTICE_REMAKE_BADGE_CLASS)}
                                  >
                                    리메이크
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="truncate text-xs text-muted-foreground">{targetLabText}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                파일 {transfer.fileCount}개
                                {transfer.orderDate && transfer.arrivalDate ? (
                                  <>
                                    {" · "}
                                    <PracticeWorkPeriodText
                                      orderDate={transfer.orderDate}
                                      arrivalDate={transfer.arrivalDate}
                                      variant="orderArrival"
                                      className="text-xs"
                                    />
                                  </>
                                ) : null}
                                {String(transfer.transferMemo || "").trim()
                                  ? ` · 메모: ${String(transfer.transferMemo || "")
                                      .replace(/\s+/g, " ")
                                      .trim()}`
                                  : ""}
                              </p>
                            </div>

                            <div className="flex shrink-0 items-center gap-1.5">
                              {canRemake ? (
                                <TooltipProvider delayDuration={0}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span
                                        className="inline-flex"
                                        onClick={(e) => e.stopPropagation()}
                                        onKeyDown={(e) => e.stopPropagation()}
                                      >
                                        <Checkbox
                                          checked={remakeChecked}
                                          onCheckedChange={() => toggleRemakeSelect(transfer)}
                                          aria-label="리메이크 대상 선택"
                                        />
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="left" className="max-w-xs text-xs">
                                      발송 건 리메이크 의뢰
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : null}
                              {transfer.unreadCount > 0 ? (
                                <span
                                  className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-semibold leading-none text-white"
                                  aria-label={`읽지 않은 채팅 ${transfer.unreadCount}건`}
                                >
                                  {transfer.unreadCount > 99 ? "99+" : transfer.unreadCount}
                                </span>
                              ) : null}
                              {(() => {
                                const deleteLocked =
                                  !canDeletePracticeTransferByStatus(transfer.status);
                                return (
                                  <TooltipProvider delayDuration={0}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="inline-flex">
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-muted-foreground hover:text-destructive disabled:pointer-events-none"
                                            disabled={deleteLocked}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              void handleAskDeleteTransfer(transfer);
                                            }}
                                            aria-label={
                                              deleteLocked
                                                ? "의뢰수락 이후 삭제 불가"
                                                : "의뢰서 전송 내역 삭제"
                                            }
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent side="left" className="max-w-xs text-xs">
                                        {deleteLocked
                                          ? "기공소가 의뢰를 수락한 이후에는 삭제할 수 없습니다."
                                          : "휴지통으로 이동"}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
              </CollapsibleContent>
              </Collapsible>
            </Card>

            <Card className="border-slate-200/80 shadow-sm">
              <Collapsible open={draftsPanelOpen} onOpenChange={setDraftsPanelOpen}>
              <CardHeader className="pb-2 pt-3">
                <div className="flex items-center justify-between gap-2">
                  <CollapsibleTrigger asChild>
                    <button type="button" className="flex min-w-0 flex-1 items-center text-left">
                      <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                        <BookmarkPlus className="h-4 w-4 text-slate-500" />
                        임시저장
                        {draftGroupedTransfers.length > 0 ? (
                          <Badge variant="secondary" className="ml-1">
                            {draftGroupedTransfers.length}
                          </Badge>
                        ) : null}
                      </CardTitle>
                    </button>
                  </CollapsibleTrigger>
                  <div className="flex shrink-0 items-center gap-2">
                    {draftGroupedTransfers.length > 0 ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 px-2 border-destructive-muted text-destructive hover:bg-destructive-soft hover:text-destructive"
                        disabled={clearingAllDrafts}
                        onClick={handleAskClearAllDrafts}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {clearingAllDrafts ? "삭제 중..." : "전체삭제"}
                      </Button>
                    ) : null}
                    <CollapsibleTrigger asChild>
                      <button type="button" className="shrink-0 text-muted-foreground">
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${draftsPanelOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                    </CollapsibleTrigger>
                  </div>
                </div>
              </CardHeader>
              <CollapsibleContent>
              <CardContent className="space-y-2">
                {draftGroupedTransfers.length === 0 ? (
                  <div className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                    없음
                  </div>
                ) : (
                  <div className="max-h-[19rem] space-y-2 overflow-y-auto pr-1">
                    {draftGroupedTransfers.map((transfer) => {
                      const targetLabText =
                        String(transfer.targetLab || "-")
                          .replace(/\s*→.*$/g, "")
                          .trim() || "-";
                      const ownerLabel = transfer.isMineDraft
                        ? "나"
                        : transfer.practiceUserLabel || "동료";
                      const patientLabel =
                        String(transfer.draftPatientName || "").trim() || "환자명 미입력";
                      const isActive = transfer.id === activeDraftId;

                      return (
                        <div
                          key={`draft:${transfer.id}:${transfer.createdAt}`}
                          role="button"
                          tabIndex={0}
                          className={cn(
                            "w-full cursor-pointer rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            isActive
                              ? "border-primary/70 bg-primary-soft ring-1 ring-primary-muted"
                              : transfer.isMineDraft
                                ? "border-primary-muted bg-primary-soft/50"
                                : "border-slate-200 bg-slate-50/70",
                          )}
                          onClick={() => handleAdoptDraftTransfer(transfer)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleAdoptDraftTransfer(transfer);
                            }
                          }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {patientLabel}
                                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                  · {ownerLabel}
                                </span>
                              </p>
                              <PracticeListCardDetail
                                createdAt={transfer.createdAt}
                                statusLabel="임시저장"
                                extraBadges={
                                  isActive ? (
                                    <Badge className="h-5 whitespace-nowrap rounded-md border-0 bg-primary-strong px-1.5 text-[10px] font-medium text-white hover:bg-primary-strong">
                                      작성 중
                                    </Badge>
                                  ) : null
                                }
                                targetLabText={targetLabText}
                                fileCount={transfer.fileCount}
                                orderDate={transfer.orderDate}
                                arrivalDate={transfer.arrivalDate}
                                transferMemo={transfer.transferMemo}
                              />
                            </div>
                            <TooltipProvider delayDuration={0}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void handleAskDeleteTransfer(transfer);
                                    }}
                                    aria-label="임시저장을 휴지통으로"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="max-w-xs text-xs">
                                  휴지통으로 이동
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
              </CollapsibleContent>
              </Collapsible>
            </Card>

            <Card className="border-slate-200/80 shadow-sm">
              <Collapsible open={trashPanelOpen} onOpenChange={setTrashPanelOpen}>
              <CardHeader className="pb-2 pt-3">
                <div className="flex items-center justify-between gap-2">
                  <CollapsibleTrigger asChild>
                    <button type="button" className="flex min-w-0 flex-1 items-center text-left">
                      <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                        <Trash2 className="h-4 w-4 text-slate-500" />
                        휴지통
                        {trashGroupedTransfers.length > 0 ? (
                          <Badge variant="secondary" className="ml-1">
                            {trashGroupedTransfers.length}
                          </Badge>
                        ) : null}
                      </CardTitle>
                    </button>
                  </CollapsibleTrigger>
                  <div className="flex shrink-0 items-center gap-2">
                    {trashGroupedTransfers.length > 0 ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 px-2 border-destructive-muted text-destructive hover:bg-destructive-soft hover:text-destructive"
                        disabled={emptyingTrash}
                        onClick={handleAskEmptyTrash}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {emptyingTrash ? "비우는 중..." : "비우기"}
                      </Button>
                    ) : null}
                    <CollapsibleTrigger asChild>
                      <button type="button" className="shrink-0 text-muted-foreground">
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${trashPanelOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                    </CollapsibleTrigger>
                  </div>
                </div>
              </CardHeader>
              <CollapsibleContent>
              <CardContent className="space-y-2">
                {trashGroupedTransfers.length === 0 ? (
                  <div className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                    비어 있음
                  </div>
                ) : (
                  <div className="max-h-[19rem] space-y-2 overflow-y-auto pr-1">
                    {trashGroupedTransfers.map((transfer) => {
                      const targetLabText =
                        String(transfer.targetLab || "-")
                          .replace(/\s*→.*$/g, "")
                          .trim() || "-";
                      const isDraftTrash =
                        transfer.status === "임시저장" ||
                        transfer.transferId === PRACTICE_DRAFT_TRANSFER_ID;
                      const titleLabel = isDraftTrash
                        ? transfer.draftPatientName ||
                          transfer.deleteTargetLabel ||
                          "임시저장"
                        : transfer.transferId !== "-"
                          ? transfer.transferId
                          : transfer.id;

                      return (
                        <div
                          key={`trash:${transfer.id}:${transfer.createdAt}`}
                          role="button"
                          tabIndex={0}
                          className="w-full cursor-pointer rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-left text-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => void handleOpenTransferDialog(transfer, { fromTrash: true })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              void handleOpenTransferDialog(transfer, { fromTrash: true });
                            }
                          }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {titleLabel}
                                {isDraftTrash && transfer.practiceUserLabel ? (
                                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                    · {transfer.practiceUserLabel}
                                  </span>
                                ) : null}
                              </p>
                              <PracticeListCardDetail
                                createdAt={transfer.createdAt}
                                statusLabel={isDraftTrash ? "임시저장" : toStatusBadgeLabel(transfer.status)}
                                targetLabText={targetLabText}
                                fileCount={transfer.fileCount}
                                orderDate={transfer.orderDate}
                                arrivalDate={transfer.arrivalDate}
                                transferMemo={transfer.transferMemo}
                              />
                            </div>

                            <TooltipProvider delayDuration={0}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 shrink-0 text-slate-500 hover:text-primary-strong"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAskRestoreTransfer(transfer);
                                    }}
                                    aria-label={isDraftTrash ? "임시저장 복구" : "의뢰서 복구"}
                                  >
                                    <RotateCcw className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="max-w-xs text-xs leading-relaxed">
                                  {isDraftTrash
                                    ? "임시저장 목록으로 되돌립니다. 복구 후 카드를 눌러 이어서 작성할 수 있습니다."
                                    : "최근 전송 내역으로 되돌립니다. 기공소에서도 다시 확인할 수 있습니다."}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
              </CollapsibleContent>
              </Collapsible>
            </Card>
          </div>
          ) : null}
        </div>

        {isExpressMode ? (
          <>
        <Dialog open={draftsOpen} onOpenChange={setDraftsOpen}>
          <DialogContent className="flex max-h-[min(90vh,820px)] w-[min(96vw,720px)] max-w-none flex-col gap-0 overflow-hidden p-0">
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200/80 px-6 pb-4 pt-5 pr-14">
              <DialogHeader className="min-w-0 space-y-0 text-left">
                <DialogTitle className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                  <BookmarkPlus className="h-5 w-5 shrink-0 text-primary-strong" />
                  임시저장
                  {draftGroupedTransfers.length > 0 ? (
                    <Badge
                      variant="secondary"
                      className="rounded-md px-1.5 py-0 text-[11px] font-medium tabular-nums"
                    >
                      {draftGroupedTransfers.length}
                    </Badge>
                  ) : null}
                </DialogTitle>
              </DialogHeader>
              {draftGroupedTransfers.length > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0 gap-1.5 border-destructive-muted px-3 text-xs text-destructive hover:bg-destructive-soft hover:text-destructive"
                  disabled={clearingAllDrafts}
                  onClick={handleAskClearAllDrafts}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {clearingAllDrafts ? "삭제 중..." : "전체삭제"}
                </Button>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
              {draftGroupedTransfers.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 px-6 py-14 text-center">
                  <BookmarkPlus className="h-9 w-9 text-slate-300" />
                  <p className="text-sm font-medium text-slate-600">임시저장 없음</p>
                  <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                    기공소와 환자명을 입력하면 자동으로 저장됩니다.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {draftGroupedTransfers.map((transfer) => {
                    const targetLabText =
                      String(transfer.targetLab || "-")
                        .replace(/\s*→.*$/g, "")
                        .trim() || "-";
                    const ownerLabel = transfer.isMineDraft
                      ? "나"
                      : transfer.practiceUserLabel || "동료";
                    const patientLabel =
                      String(transfer.draftPatientName || "").trim() || "환자명 미입력";
                    const isActive = transfer.id === activeDraftId;

                    return (
                      <div
                        key={`draft:${transfer.id}:${transfer.createdAt}`}
                        role="button"
                        tabIndex={0}
                        className={cn(
                          "group flex w-full items-start gap-3 rounded-xl border bg-white px-4 py-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          isActive
                            ? "border-primary/50 bg-primary-soft/70 shadow-sm ring-1 ring-primary/20"
                            : "border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/80",
                        )}
                        onClick={() => handleAdoptDraftTransfer(transfer)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleAdoptDraftTransfer(transfer);
                          }
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-base font-semibold text-slate-900">
                            {patientLabel}
                            <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                              · {ownerLabel}
                            </span>
                          </p>
                          <PracticeListCardDetail
                            layout="comfortable"
                            createdAt={transfer.createdAt}
                            statusLabel="임시저장"
                            extraBadges={
                              isActive ? (
                                <Badge className="h-5 whitespace-nowrap rounded-md border-0 bg-primary-strong px-1.5 text-[10px] font-medium text-white hover:bg-primary-strong">
                                  작성 중
                                </Badge>
                              ) : null
                            }
                            targetLabText={targetLabText}
                            fileCount={transfer.fileCount}
                            orderDate={transfer.orderDate}
                            arrivalDate={transfer.arrivalDate}
                            transferMemo={transfer.transferMemo}
                          />
                        </div>
                        <TooltipProvider delayDuration={0}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="mt-0.5 h-9 w-9 shrink-0 text-slate-400 opacity-70 hover:bg-destructive-soft hover:text-destructive group-hover:opacity-100"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleAskDeleteTransfer(transfer);
                                }}
                                aria-label="임시저장을 휴지통으로"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-xs text-xs">
                              휴지통으로 이동
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={trashOpen} onOpenChange={setTrashOpen}>
          <DialogContent className="flex max-h-[min(90vh,820px)] w-[min(96vw,720px)] max-w-none flex-col gap-0 overflow-hidden p-0">
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200/80 px-6 pb-4 pt-5 pr-14">
              <DialogHeader className="min-w-0 space-y-0 text-left">
                <DialogTitle className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                  <Trash2 className="h-5 w-5 shrink-0 text-slate-500" />
                  휴지통
                  {trashGroupedTransfers.length > 0 ? (
                    <Badge
                      variant="secondary"
                      className="rounded-md px-1.5 py-0 text-[11px] font-medium tabular-nums"
                    >
                      {trashGroupedTransfers.length}
                    </Badge>
                  ) : null}
                </DialogTitle>
              </DialogHeader>
              {trashGroupedTransfers.length > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0 gap-1.5 border-destructive-muted px-3 text-xs text-destructive hover:bg-destructive-soft hover:text-destructive"
                  disabled={emptyingTrash}
                  onClick={handleAskEmptyTrash}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {emptyingTrash ? "비우는 중..." : "비우기"}
                </Button>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
              {trashGroupedTransfers.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 px-6 py-14 text-center">
                  <Trash2 className="h-9 w-9 text-slate-300" />
                  <p className="text-sm font-medium text-slate-600">휴지통이 비어 있습니다</p>
                  <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                    삭제한 임시저장·의뢰가 여기에 모입니다.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {trashGroupedTransfers.map((transfer) => {
                    const targetLabText =
                      String(transfer.targetLab || "-")
                        .replace(/\s*→.*$/g, "")
                        .trim() || "-";
                    const isDraftTrash =
                      transfer.status === "임시저장" ||
                      transfer.transferId === PRACTICE_DRAFT_TRANSFER_ID;
                    const titleLabel = isDraftTrash
                      ? transfer.draftPatientName ||
                        transfer.deleteTargetLabel ||
                        "임시저장"
                      : transfer.transferId !== "-"
                        ? transfer.transferId
                        : transfer.id;

                    return (
                      <div
                        key={`trash:${transfer.id}:${transfer.createdAt}`}
                        role="button"
                        tabIndex={0}
                        className="group flex w-full items-start gap-3 rounded-xl border border-slate-200/90 bg-white px-4 py-3.5 text-left transition-colors hover:border-slate-300 hover:bg-slate-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => void handleOpenTransferDialog(transfer, { fromTrash: true })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            void handleOpenTransferDialog(transfer, { fromTrash: true });
                          }
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-base font-semibold text-slate-900">
                            {titleLabel}
                            {isDraftTrash && transfer.practiceUserLabel ? (
                              <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                                · {transfer.practiceUserLabel}
                              </span>
                            ) : null}
                          </p>
                          <PracticeListCardDetail
                            layout="comfortable"
                            createdAt={transfer.createdAt}
                            statusLabel={
                              isDraftTrash ? "임시저장" : toStatusBadgeLabel(transfer.status)
                            }
                            targetLabText={targetLabText}
                            fileCount={transfer.fileCount}
                            orderDate={transfer.orderDate}
                            arrivalDate={transfer.arrivalDate}
                            transferMemo={transfer.transferMemo}
                          />
                        </div>

                        <TooltipProvider delayDuration={0}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="mt-0.5 h-9 w-9 shrink-0 text-slate-400 opacity-70 hover:bg-primary-soft hover:text-primary-strong group-hover:opacity-100"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAskRestoreTransfer(transfer);
                                }}
                                aria-label={isDraftTrash ? "임시저장 복구" : "의뢰서 복구"}
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-xs text-xs leading-relaxed">
                              {isDraftTrash
                                ? "임시저장 목록으로 되돌립니다. 복구 후 카드를 눌러 이어서 작성할 수 있습니다."
                                : "최근 전송 내역으로 되돌립니다. 기공소에서도 다시 확인할 수 있습니다."}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
          </>
        ) : null}

        <PracticeRecentTransfersAllModal
          open={recentTransfersAllOpen}
          onOpenChange={(open) => {
            // ConfirmDialog(포털) 포커스/아웃사이드 상호작용으로 전체보기가 같이 닫히지 않게 함
            if (!open && suppressRecentAllModalCloseRef.current) return;
            setRecentTransfersAllOpen(open);
          }}
          token={authToken}
          chatRooms={chatRooms}
          initialPeriod={period}
          initialSearch={requestSearchTerm}
          initialStatusFilter={recentStatusFilter}
          initialRequests={recentRequests}
          initialHasMore={recentRequestsHasMore}
          initialLoading={recentRequestsLoading}
          initialError={recentRequestsError}
          onSelectTransfer={(transfer) => {
            void handleOpenTransferDialog(transfer as RecentTransferItem, {
              returnToAllModal: true,
            });
          }}
          onDeleteTransfer={(transfer) => {
            handleAskDeleteTransfer(transfer as RecentTransferItem);
          }}
          remakeSelectedIds={remakeSelectedIds}
          onToggleRemakeSelect={(transfer) =>
            toggleRemakeSelect(transfer as RecentTransferItem)
          }
          onAskRemake={() => setRemakeConfirmOpen(true)}
        />

        <PracticeTransferDetailChatDialog
          open={transferDialogOpen}
          onOpenChange={(open) => {
            if (open) {
              setTransferDialogOpen(true);
              return;
            }
            handleCloseTransferDialog();
          }}
          title="의뢰 상세 · 기공소 채팅"
          conversationTitle="기공소와의 소통"
          chatHeaderAction={
            selectedTransfer &&
            selectedTransfer.canRateLab &&
            selectedTransfer.transferMongoIds?.[0] ? (
              <PracticeLabRatingControl
                transferMongoId={String(selectedTransfer.transferMongoIds[0])}
                rating={selectedTransfer.labRating || null}
                size="sm"
                onChanged={(next) => {
                  setSelectedTransfer((prev) =>
                    prev ? { ...prev, labRating: next, canRateLab: true } : prev,
                  );
                  setRecentRequests((prev) =>
                    prev.map((row) =>
                      row.requestMongoId ===
                        String(selectedTransfer.transferMongoIds?.[0] || "")
                        ? { ...row, labRating: next, canRateLab: true }
                        : row,
                    ),
                  );
                }}
              />
            ) : null
          }
          summaryItems={[
            {
              label: "전송ID",
              value:
                selectedTransfer?.transferId && selectedTransfer.transferId !== "-"
                  ? selectedTransfer.transferId
                  : selectedTransfer?.id || "-",
            },
            { label: "전송시각", value: selectedTransfer?.createdAt || "-" },
            { label: "기공소", value: selectedTransfer?.targetLab || "-" },
            { label: "환자명", value: selectedTransferPatientName || "-" },
            { label: "주문일", value: selectedTransfer?.orderDate || "-" },
            { label: "치과도착일", value: selectedTransfer?.arrivalDate || "-" },
            ...(selectedTransferWorkPeriodSummary
              ? [selectedTransferWorkPeriodSummary]
              : []),
            { label: "파일 수", value: `${selectedTransfer?.fileCount || 0}개` },
            {
              label: "보철물",
              value: `${Number(selectedTransfer?.resultFiles?.length || 0)}개`,
            },
          ] satisfies PracticeTransferDialogSummaryItem[]}
          memo={selectedTransferDisplayMemo}
          toothWorks={selectedTransferToothWorks}
          toothWorksKey={
            selectedTransfer?.transferId && selectedTransfer.transferId !== "-"
              ? selectedTransfer.transferId
              : selectedTransfer?.id || "practice-transfer"
          }
          feeQuote={selectedTransfer?.feeQuote || null}
          skipJig={Boolean(selectedTransfer?.skipJig)}
          feeViewer="practice"
          labAnchorId={selectedTransfer?.targetLabAnchorId || null}
          filesLabel="의뢰 파일 (구강 스캔)"
          files={
            (selectedTransfer?.files || []).map((file, idx) => ({
              id: `${file.s3Key}:${idx}`,
              fileName: file.fileName,
              size: Number(file.size || 0),
              s3Key: String(file.s3Key || "").trim(),
            })) satisfies PracticeTransferDialogFileItem[]
          }
          resultFilesLabel="보철물"
          resultFiles={
            (selectedTransfer?.resultFiles || []).map((file, idx) => ({
              id: `${file.s3Key}:result:${idx}`,
              fileName: file.fileName,
              size: Number(file.size || 0),
              s3Key: String(file.s3Key || "").trim(),
            })) satisfies PracticeTransferDialogFileItem[]
          }
          showProductionConfirm={
            (String(selectedTransfer?.status || "").trim() === "작업완료" &&
              !selectedTransfer?.productionConfirmedAt &&
              Number(selectedTransfer?.resultFiles?.length || 0) > 0) ||
            Boolean(
              selectedTransfer?.hasCustomAbutment &&
                selectedTransfer?.skipDesignConfirm === false &&
                (selectedTransfer?.designReadyAt ||
                  Number(selectedTransfer?.designFileCount || 0) > 0) &&
                !selectedTransfer?.practiceDesignConfirmedAt &&
                String(selectedTransfer?.status || "").trim() !== "작업완료" &&
                String(selectedTransfer?.status || "").trim() !== "생산진행" &&
                String(selectedTransfer?.status || "").trim() !== "포장.발송",
            )
          }
          productionConfirmTitle={
            selectedTransfer?.hasCustomAbutment &&
            selectedTransfer?.skipDesignConfirm === false &&
            !selectedTransfer?.practiceDesignConfirmedAt &&
            String(selectedTransfer?.status || "").trim() !== "작업완료"
              ? "어벗츠 디자인을 확인한 뒤 컨펌하세요. 기공소 확인과 함께 생산이 시작됩니다."
              : "작업 결과를 확인한 뒤 생산을 진행하세요."
          }
          productionConfirmButtonLabel={
            selectedTransfer?.hasCustomAbutment &&
            selectedTransfer?.skipDesignConfirm === false &&
            !selectedTransfer?.practiceDesignConfirmedAt &&
            String(selectedTransfer?.status || "").trim() !== "작업완료"
              ? "어벗 디자인 컨펌"
              : "생산 진행"
          }
          productionConfirmBusy={productionConfirmBusy}
          onConfirmProduction={() => void handleConfirmProduction()}
          downloadingFileKeys={downloadingKeys}
          downloadProgressByKey={downloadProgressByKey}
          downloadAllBusy={downloadAllBusy}
          onDownloadAllFiles={() => void handleDownloadAllTransferFiles()}
          onDownloadTransferFile={(file) =>
            void handleDownloadTransferFile({
              fileName: file.fileName,
              s3Key: file.s3Key,
              size: file.size,
            })
          }
          chatLoading={chatLoading || chatMessagesLoading}
          chatError={String(chatError || chatMessagesError || "")}
          chatMessages={displayChatMessages}
          isMyMessage={(senderId) => myIdCandidates.has(senderId)}
          currentUserId={String(authUser?.id || (authUser as { _id?: string } | null)?._id || "").trim()}
          formatChatTime={formatChatTs}
          formatFileSize={formatFileSize}
          onDownloadChatAttachment={handleDownloadChatAttachment}
          chatBottomRef={chatBottomRef}
          chatAttachedFiles={chatUploads.items}
          onRemoveAttachedChatFile={chatUploads.removeItem}
          onRetryAttachedChatFile={chatUploads.retryItem}
          onAttachChatFiles={handleAttachChatFiles}
          attachmentInputId="practice-transfer-chat-attachment-input"
          chatDraft={chatDraft}
          onChangeChatDraft={setChatDraft}
          onSendChatMessage={() => void handleSendChatMessage()}
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
          composerPlaceholder="문의 내용을 입력하세요"
          inputDisabled={chatLoading || chatMessagesLoading || chatSending || !activeChatRoom?._id}
          sendDisabled={
            chatLoading ||
            chatMessagesLoading ||
            chatSending ||
            !activeChatRoom?._id ||
            (!String(chatDraft || "").trim() && chatUploads.items.length === 0)
          }
        />

        <Dialog
          open={prosthesisTypeSettingsDialogOpen}
          onOpenChange={(open) => {
            setProsthesisTypeSettingsDialogOpen(open);
            if (open) {
              setProsthesisTypeCatalogDraft(normalizedProsthesisTypes);
            }
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>보철물 항목 설정</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              {prosthesisTypeCatalogDraft.map((item, index) => (
                <div key={`${item}:${index}`} className="flex items-center gap-1.5">
                  <Input
                    value={item}
                    onChange={(e) =>
                      setProsthesisTypeCatalogDraft((prev) => {
                        const next = [...prev];
                        next[index] = e.target.value;
                        return next;
                      })
                    }
                    className="h-9 text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() =>
                      setProsthesisTypeCatalogDraft((prev) => {
                        const next = prev.filter((_, i) => i !== index);
                        return next.length ? next : [...PRESET_PROSTHESIS_TYPES];
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              <div className="flex items-center gap-1.5">
                <Input
                  value={prosthesisTypeInput}
                  onChange={(e) => setProsthesisTypeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    const trimmed = String(prosthesisTypeInput || "").trim();
                    if (!trimmed) return;
                    setProsthesisTypeCatalogDraft((prev) =>
                      normalizeProsthesisTypes([...prev, trimmed]),
                    );
                    setProsthesisTypeInput("");
                  }}
                  placeholder="형태 추가"
                  className="h-9 text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() => {
                    const trimmed = String(prosthesisTypeInput || "").trim();
                    if (!trimmed) return;
                    setProsthesisTypeCatalogDraft((prev) =>
                      normalizeProsthesisTypes([...prev, trimmed]),
                    );
                    setProsthesisTypeInput("");
                  }}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  추가
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setProsthesisTypeSettingsDialogOpen(false)}
              >
                취소
              </Button>
              <Button
                type="button"
                onClick={() => void handleSaveProsthesisTypeSettings()}
                disabled={savingProsthesisTypeSettings}
              >
                {savingProsthesisTypeSettings ? "저장 중..." : "저장"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <PracticeLabRejectedReselectDialog
          open={Boolean(labRejectedReselectTarget)}
          onOpenChange={(open) => {
            if (!open && !labRejectedRetargetBusy) {
              setLabRejectedReselectTarget(null);
            }
          }}
          rejectedLabName={labRejectedReselectTarget?.targetLab}
          transferId={labRejectedReselectTarget?.transferId}
          confirming={labRejectedRetargetBusy}
          labIntakeProps={{
            selectedLab,
            setSelectedLab,
            labSearch,
            setLabSearch,
            labSearchResults,
            labSearching,
            recentLabs,
            recentLabsInitialized,
            pinnedLabs,
            onRemoveRecentLab: removeRecentLab,
            onTogglePinLab: togglePinLab,
            autoMatchMinLabRating,
            onAutoMatchMinLabRatingChange: (next) => {
              const normalized = normalizeAutoMatchMinLabRating(next);
              setAutoMatchMinLabRating(normalized);
              setAutoMatchBudget(
                resolveAutoMatchBudgetOrDefaults(null, abutsLabFeeCatalog, {
                  minStars: normalized,
                }),
              );
              void savePracticeTransferSettingsToServer({
                autoMatchMinLabRating: normalized,
              }).catch(() => {});
            },
            autoMatchBudget,
            abutsLabFeeCatalog,
          }}
          onConfirm={async () => {
            const target = labRejectedReselectTarget;
            const transferId = String(target?.transferId || "").trim();
            if (!target || !transferId || !selectedLab) return;

            const autoMatch = isAutoMatchLab(selectedLab);
            const targetLabAnchorId = autoMatch
              ? null
              : toApiLabAnchorId(selectedLab._id);
            if (!autoMatch && !targetLabAnchorId) {
              toast({
                title: "기공소를 선택해 주세요",
                variant: "destructive",
              });
              return;
            }

            setLabRejectedRetargetBusy(true);
            try {
              const budgetForAuto = resolveAutoMatchBudgetOrDefaults(
                autoMatchBudget,
                abutsLabFeeCatalog,
                { minStars: autoMatchMinLabRating },
              );
              const res = await apiFetch<{
                success?: boolean;
                message?: string;
                data?: {
                  targetLabName?: string;
                  matchingMode?: string;
                };
              }>({
                path: `/api/practice/transfers/${encodeURIComponent(transferId)}/retarget-lab`,
                method: "POST",
                token: authToken,
                jsonBody: {
                  matchingMode: autoMatch ? "auto" : "direct",
                  targetLabAnchorId: autoMatch
                    ? "__auto_match__"
                    : targetLabAnchorId,
                  targetLabName: String(selectedLab.name || "").trim(),
                  autoMatchMinLabRating: autoMatch
                    ? autoMatchMinLabRating
                    : undefined,
                  autoMatchBudget: autoMatch ? budgetForAuto : undefined,
                },
              });
              if (!res.ok) {
                const body = asApiMessagePayload(res.data);
                throw new Error(
                  String(body?.message || "기공소 변경 전송에 실패했습니다."),
                );
              }

              const labName =
                String(
                  (res.data as { data?: { targetLabName?: string } } | null)
                    ?.data?.targetLabName || selectedLab.name || "",
                ).trim() || "기공소";
              rememberLab(selectedLab);
              setLabRejectedReselectTarget(null);
              await loadRecentRequests({ silent: true });
              toast({
                title: "기공소 변경 전송 완료",
                description: autoMatch
                  ? "자동 매칭으로 다시 전송했습니다."
                  : `「${labName}」으로 다시 전송했습니다.`,
              });
            } catch (error) {
              toast({
                title: "기공소 변경 전송 실패",
                description:
                  error instanceof Error
                    ? error.message
                    : "잠시 후 다시 시도해주세요.",
                variant: "destructive",
              });
            } finally {
              setLabRejectedRetargetBusy(false);
            }
          }}
        />

        <ConfirmDialog
          open={deleteConfirmOpen}
          title="이 의뢰서를 휴지통으로 이동할까요?"
          description={
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">
                대상:{" "}
                {deleteTargetTransfer?.transferId && deleteTargetTransfer.transferId !== "-"
                  ? deleteTargetTransfer.transferId
                  : deleteTargetTransfer?.id || "-"}
              </div>
              <div className="text-sm text-muted-foreground">
                {`첨부 파일 ${deleteTargetTransfer?.fileCount || 0}건과 함께 휴지통으로 이동합니다. 아래에서 다시 복구할 수 있습니다.`}
              </div>
            </div>
          }
          confirmLabel={
            deletingTransfer
              ? "처리 중..."
              : "휴지통으로 이동"
          }
          cancelLabel="취소"
          onConfirm={handleConfirmDeleteTransfer}
          onCancel={handleCancelDeleteTransfer}
        />

        <ConfirmDialog
          open={restoreConfirmOpen}
          title={
            restoreTargetTransfer?.status === "임시저장" ||
            restoreTargetTransfer?.transferId === PRACTICE_DRAFT_TRANSFER_ID
              ? "임시저장을 복구할까요?"
              : "이 의뢰서를 복구할까요?"
          }
          description={
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">
                대상:{" "}
                {restoreTargetTransfer?.transferId === PRACTICE_DRAFT_TRANSFER_ID
                  ? restoreTargetTransfer.deleteTargetLabel || "임시저장"
                  : restoreTargetTransfer?.transferId && restoreTargetTransfer.transferId !== "-"
                    ? restoreTargetTransfer.transferId
                    : restoreTargetTransfer?.id || "-"}
              </div>
              <div className="text-sm text-muted-foreground">
                {restoreTargetTransfer?.status === "임시저장" ||
                restoreTargetTransfer?.transferId === PRACTICE_DRAFT_TRANSFER_ID
                  ? "임시저장 목록으로 되돌아가며, 카드를 눌러 이어서 작성할 수 있습니다."
                  : "최근 전송 내역으로 되돌아가며, 기공소에서도 다시 확인할 수 있습니다."}
              </div>
            </div>
          }
          confirmLabel={restoringTransfer ? "복구 중..." : "복구"}
          cancelLabel="취소"
          onConfirm={() => void handleConfirmRestoreTransfer()}
          onCancel={handleCancelRestoreTransfer}
        />

        <ConfirmDialog
          open={remakeConfirmOpen}
          title="선택한 발송 건을 리메이크 의뢰할까요?"
          description={
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">
                {remakeSelectedTransfers.length}건 · 리메이크 비용{" "}
                {formatWon(remakeSelectedTotal)}
              </div>
              <div className="text-sm text-muted-foreground">
                기공소 설정 기공료의 리메이크 수가로 청구되며, 의뢰부터 발송까지
                다시 진행됩니다.
              </div>
            </div>
          }
          confirmLabel={remakeBusy ? "전송 중..." : "리메이크 의뢰"}
          cancelLabel="취소"
          onConfirm={() => void handleConfirmRemake()}
          onCancel={() => {
            if (remakeBusy) return;
            setRemakeConfirmOpen(false);
          }}
        />

        <ConfirmDialog
          open={emptyTrashConfirmOpen}
          title="휴지통을 비울까요?"
          description={
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">
                휴지통의 임시저장·취소된 전송을 모두 영구 삭제합니다.
                {trashGroupedTransfers.length > 0
                  ? ` (현재 목록 ${trashGroupedTransfers.length}건)`
                  : ""}
              </div>
              <div className="text-sm text-muted-foreground">
                이 작업은 되돌릴 수 없습니다.
              </div>
            </div>
          }
          confirmLabel={emptyingTrash ? "비우는 중..." : "영구 삭제"}
          cancelLabel="취소"
          onConfirm={() => void handleConfirmEmptyTrash()}
          onCancel={handleCancelEmptyTrash}
        />
      </div>
    </PageFileDropZone>
  );
};

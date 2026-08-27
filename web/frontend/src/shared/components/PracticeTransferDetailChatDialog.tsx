// related files:
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/shared/hooks/useChatRooms.ts
// - web/frontend/src/features/chat/components/ChatMessageBubble.tsx
// - web/frontend/src/features/chat/components/MessageReply.tsx
// - web/frontend/src/features/chat/components/ChatComposer.tsx
// - web/frontend/src/features/chat/components/NewChatWidget.tsx
// - web/frontend/src/shared/hooks/useBackgroundTempUpload.ts
// - web/frontend/src/shared/components/ModelPreviewDialog.tsx
// - web/frontend/src/shared/files/modelPreviewFile.ts
// - web/frontend/src/shared/files/downloadWithProgress.ts
// - web/frontend/src/shared/files/s3BlobCache.ts
// - web/frontend/src/features/requests/components/StlPreviewThumbnail.tsx
// - 2026-08-27: 채팅 버블에 보낸사람 이름 표시.
// - 2026-08-27: 재도착일 — 오늘=재주문일·선택일=재도착일 동시 누적(주문일/도착일 캘린더).
// - 2026-08-27: 재도착일 — 오늘 이후 1개만(다시 고르면 교체). 과거·오늘만 캘린더 이력.
// - 2026-08-27: 치과도착일 옆 「재도착일」날짜 선택(누적·과금 없음).
// - 2026-08-27: 치과도착일 +1주 누적(동일 건·크레딧 미중복).
// - 2026-08-23: 작업 파일 STL/PLY/OBJ 타일에 3D 썸네일 표시.
// - 2026-08-23: 미제공 CA 안내 1줄 압축·수락 바 중복 안내 제거로 채팅 높이 확보.
// - 2026-08-21: 수락 바 — "치과 메시지 확인 후 수락" 안내 제거.
// - 2026-08-21: 수락 바 — "커스텀 어벗 디자인은 수락 기공소가 진행" 문구 제거.
// - 2026-08-21: 수락 바 — 작업취소를 업로드 CTA와 같은 버튼 행에 배치.
// - 2026-08-21: 미제공 CA 수락 바 — 치아·임플란트 상세 + 자체 처리 안내.
// - 2026-08-21: 미제공(요청중) CA — 수락 바 안내·어벗츠 자동주문 문구 분리.
// - 2026-08-21: 모바일 채팅 — 상세/채팅·메시지/입력을 grid fr로 나눠 내역 높이 확보.
// - 2026-08-21: 어벗 가공 고정 안내 문구 제거. 수락/생산 취소는 클릭 시 API로 판정·토스트.
// - 2026-08-21: 컨펌 필요 시 작업 파일 프리뷰를 먼저 열고 안내·CTA를 프리뷰에 표시.
// - 2026-08-21: 작업 파일도 의뢰 파일과 동일 4열 타일 미리보기.
// - 2026-08-21: 의뢰 파일 — 4열 썸네일(이미지)·유형 아이콘(기타) + 파일명.
// - 2026-08-21: 수락 바 — 안내 1줄 + CTA 1줄(항상 2단), 작업취소 툴팁.
// - 2026-08-21: 수락 후 채팅 상단 바에 어벗·보철 업로드 CTA(acceptedWorkActions).
// - 2026-08-20: 수락 바 작업기간 — 전송 시각 기준 12시 컷오프.
// - 2026-08-27: 채팅 이미지 첨부 — authToken으로 썸네일·미리보기.
// - 2026-08-16: 채팅 패널을 ChatComposer·위젯(compact) 패턴에 맞춤.
// - 2026-08-16: 이미지 미리보기(다운로드 오버레이) + IndexedDB 캐시.
// - 2026-08-16: 프리뷰 파일 여러 개일 때 이전/다음 이동.
// - 2026-08-16: STL/PLY/OBJ 클릭 시 3D 미리보기(다운로드는 모달).
// - 2026-08-18: 치과 수락 전 의뢰 수정 CTA(좌측 의뢰정보 패널 상단).
// - 2026-08-19: 치과 발신 상세에서 수락 전 의뢰 취소(휴지통).
// - 2026-08-16: 어벗 가공 시작 시 상세 모달 작업취소(수락 취소) 비활성 안내.
// - 2026-08-16: 파일 섹션 — 의뢰 파일(구강 스캔·쉐이드 포토 등) / 작업 파일(어벗 디자인·보철물).
// - 2026-08-21: 구강스캔은 선택 — practice_required 수락 차단은 레거시(호출부 null).
// - 2026-08-15: 수락 기공소 CA 디자인 — 왼쪽 구강스캔 업로드 UI 제거(스캔 없이 수락).
// - 2026-08-15: 수락 바 — 구강스캔 나중에 올리기 안내 문구 제거.
// - 2026-08-15: 수락 기공소 CA 디자인 — 스캔 없이도 수락. 어벗디자인비 안내.
// - 2026-08-15: 기공소 CA — 어벗츠 디자인 미도착 시 구강스캔(의뢰 파일) 다운로드 잠금.
// - 2026-08-15: 자동매칭 CA — 치과 구강스캔 필수(미첨부 시 수락 차단 안내).
// - 2026-08-13: 기공소 상세 모달 — 수락 전에도 치과 채팅 내역 표시. 수락 CTA는 채팅 상단 바.
// - 2026-08-13: 채팅 첨부 다운로드 프로그레스를 버블에 전달.
// - 2026-08-14: 기공소 기공수가 할증은 치과 채팅 헤더에 배치(자동매칭 포함).
// - 2026-08-14: 수락 후 같은 자리(채팅 상단 바)에 작업취소 버튼.
// - 2026-08-15: 요약 작업기간 — 5일 미만 빨간 표시·툴팁. 수락 바 거부·짧은 작업기간.
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Box, CalendarClock, FileIcon, MessageSquare, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/shared/ui/cn";
import { RESPONSIVE } from "@/shared/ui/responsive";
import { toKstYmd, ymdToKstDate } from "@/shared/date/kst";
import { type ChatMessage } from "@/shared/hooks/useChatRooms";
import { ChatComposer } from "@/features/chat/components/ChatComposer";
import { ChatMessageBubble } from "@/features/chat/components/ChatMessageBubble";
import { type ReplyToMessage } from "@/features/chat/components/MessageReply";
import { PracticeToothWorkChartReadOnly } from "@/shared/components/practice/PracticeToothWorkChartReadOnly";
import type { ToothWorkSelection } from "@/shared/practice/transferMemo";
import type {
  PracticeTransferFeeQuote,
  PracticeTransferFeeQuoteViewer,
} from "@/shared/practice/practiceTransferFeeQuote";
import { Progress } from "@/components/ui/progress";
import type { BackgroundUploadItem } from "@/shared/hooks/useBackgroundTempUpload";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PracticeWorkPeriodText } from "@/shared/components/practice/PracticeWorkPeriodText";
import {
  getPracticeWorkPeriodDays,
  isPracticeWorkPeriodShort,
} from "@/shared/practice/practiceWorkPeriod";
import {
  ORAL_SCAN_DOWNLOAD_LOCKED_UNTIL_ABUTS_DESIGN,
  ORAL_SCAN_REQUIRED_FROM_PRACTICE,
} from "@/shared/practice/oralScanRequirement";
import { ModelPreviewDialog, type ModelPreviewKind } from "@/shared/components/ModelPreviewDialog";
import { StlPreviewThumbnail } from "@/features/requests/components/StlPreviewThumbnail";
import {
  fileFromModelBlob,
  getModelExtLower,
  isModelPreviewExt,
} from "@/shared/files/modelPreviewFile";
import {
  buildS3ProxyDownloadUrl,
  s3DownloadBusyKey,
} from "@/shared/files/useS3FileDownload";
import { fetchS3BlobCached } from "@/shared/files/s3BlobCache";
import { useToast } from "@/shared/hooks/use-toast";
import {
  formatLabFeeMultiplierLabel,
  isPendingRoundBarAbutment,
  normalizeLabFeeMultiplier,
} from "@/shared/practice/labFeeSchedule";
import { LabPendingAbutmentGuide } from "@/shared/components/practice/LabPendingAbutmentGuide";
import {
  getPracticeTransferFileExtension,
  PRACTICE_TRANSFER_IMAGE_EXTENSIONS,
} from "@/shared/practice/practiceTransferAccept";

function isImagePreviewExt(ext: string): boolean {
  return PRACTICE_TRANSFER_IMAGE_EXTENSIONS.has(String(ext || "").toLowerCase());
}

function mimeTypeForImageFileName(name: string): string {
  const ext = getPracticeTransferFileExtension(name);
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".bmp") return "image/bmp";
  return "application/octet-stream";
}

function resolvePreviewKind(fileName: string): ModelPreviewKind | null {
  const ext =
    getModelExtLower(fileName) || getPracticeTransferFileExtension(fileName);
  if (isModelPreviewExt(ext)) return "model";
  if (isImagePreviewExt(ext)) return "image";
  return null;
}

function fileTypeLabel(fileName: string): string {
  const ext = getPracticeTransferFileExtension(fileName).replace(/^\./, "");
  return ext ? ext.toUpperCase() : "FILE";
}

function fileFromPreviewBlob(blob: Blob, fileName: string, kind: ModelPreviewKind): File {
  if (kind === "model") return fileFromModelBlob(blob, fileName);
  const name = String(fileName || "image").trim() || "image";
  const blobType = String(blob?.type || "").trim().toLowerCase();
  const type =
    blobType && blobType !== "application/octet-stream"
      ? blob.type
      : mimeTypeForImageFileName(name);
  return new File([blob], name, { type });
}

export type PracticeTransferDialogSummaryItem = {
  label: string;
  value: string;
  valueClassName?: string;
  tooltip?: string;
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
  /** S3 프록시 미리보기용 JWT */
  authToken?: string | null;
  /** 치과 채팅 헤더 오른쪽(예: 치과 평가 → 기공수가 할증) */
  chatHeaderAction?: ReactNode;
  /** 채팅 헤더 바로 아래 — 상대방 내부 메모 */
  counterpartyMemoStrip?: ReactNode;
  /** 요약 그리드 아래 — 예: 미가입 치과 초대 CTA */
  summaryBanner?: ReactNode;
  summaryItems: PracticeTransferDialogSummaryItem[];
  memo: string;
  /** 보철물 치식 차트(읽기 전용). 있으면 의뢰 메모 위에 표시 */
  toothWorks?: ToothWorkSelection[];
  toothWorksKey?: string;
  feeQuote?: PracticeTransferFeeQuote | null;
  skipJig?: boolean;
  feeViewer?: PracticeTransferFeeQuoteViewer;
  labAnchorId?: string | null;
  /** 기공소 뷰 — 자동매칭 기공비 별점 확정가 */
  labEffectiveStars?: number | null;
  /** 예: 의뢰 파일 (구강 스캔, 쉐이드 포토 등) */
  filesLabel: string;
  files: PracticeTransferDialogFileItem[];
  /** 수락 전 구강스캔 미첨부(CA). 자동매칭만 치과 필수 안내 */
  oralScanAttachMode?: "practice_required" | null;
  /**
   * 기공소: 어벗츠 CA 디자인 미도착 시 의뢰(구강스캔) 파일 다운로드 잠금.
   * 디자인 큐·치과 발신 모달에서는 쓰지 않는다.
   */
  requestFilesDownloadLocked?: boolean;
  requestFilesDownloadLockedReason?: string;
  /** 어벗 디자인·보철물을 묶는 섹션 제목 */
  workFilesLabel?: string;
  designFilesLabel?: string;
  designFiles?: PracticeTransferDialogFileItem[];
  /** 보철물(작업완료 결과). 있을 때만 표시 */
  resultFilesLabel?: string;
  resultFiles?: PracticeTransferDialogFileItem[];
  /** 치과 「생산 진행」/디자인 컨펌 */
  productionConfirmBusy?: boolean;
  showProductionConfirm?: boolean;
  productionConfirmTitle?: string;
  productionConfirmButtonLabel?: string;
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
  /** 어벗 가공 시작(준비 아님) — 의뢰 수락 취소 불가 */
  abutmentMachiningStarted?: boolean;
  /** 레거시: 자동매칭 남은시간 라벨(강제 클레임 만료 폐기 후 미사용) */
  remainingLabel?: string | null;
  onAccept?: () => void | Promise<void>;
  /** 수락 전 거부 (수신 페이지). 자동매칭=풀에서 숨김, 지정=의뢰 취소 */
  rejectBusy?: boolean;
  onReject?: () => void | Promise<void>;
  /** 어벗츠 우선창을 끊고 하청 풀을 즉시 연다 */
  openSubcontractBusy?: boolean;
  onOpenSubcontract?: () => void | Promise<void>;
  /** 수락 바 짧은 작업기간 표시용 */
  orderDate?: string | null;
  arrivalDate?: string | null;
  /** 주문 시각. 있으면 12시 컷오프를 전송 시각에 고정 */
  orderedAt?: string | number | Date | null;
  /** 수락 후 같은 자리의 작업취소 */
  releaseBusy?: boolean;
  onRelease?: () => void | Promise<void>;
  /**
   * 기공의뢰수신: 수락 후 어벗·보철 업로드 CTA.
   * 캘린더 전환으로 카드 actionBar가 없어져 상세 모달 상단에 둔다.
   * 함수면 `releaseAction`(작업취소)을 버튼 행 trailing에 넣을 수 있다.
   */
  acceptedWorkActions?:
    | ReactNode
    | ((slots: { releaseAction: ReactNode | null }) => ReactNode);
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
  onAttachChatFiles: (files: File[]) => void;
  chatDraft: string;
  onChangeChatDraft: (value: string) => void;
  onSendChatMessage: () => void | Promise<void>;
  replyTo?: ReplyToMessage | null;
  onReplyToMessage?: (message: ChatMessage) => void;
  onCancelReply?: () => void;
  onToggleReaction?: (messageId: string, emoji: string) => void | Promise<void>;
  composerPlaceholder: string;
  inputDisabled: boolean;
  /** 전송 중(ChatComposer isSending). 빈 draft 차단은 Composer가 처리 */
  sendDisabled?: boolean;
  /** 치과: 수락 전 의뢰 내용을 작성 폼으로 불러와 수정 */
  onEditRequest?: () => void;
  editRequestDisabled?: boolean;
  /** 치과: 쉐이드 변경 등 — 동일 건 재도착일(오늘 이후 1개·교체, 과금 없음). 선택 YMD 전달 */
  onAppendArrival?: (arrivalYmd: string) => void;
  appendArrivalDisabled?: boolean;
  appendArrivalBusy?: boolean;
  /** 치과: 수락 전·작업취소 건을 휴지통으로 */
  onCancelRequest?: () => void;
  cancelRequestDisabled?: boolean;
};

export function PracticeTransferDetailChatDialog({
  open,
  onOpenChange,
  title,
  conversationTitle,
  authToken = null,
  chatHeaderAction = null,
  counterpartyMemoStrip = null,
  summaryBanner = null,
  summaryItems,
  memo,
  toothWorks,
  toothWorksKey,
  feeQuote = null,
  skipJig = false,
  feeViewer = "practice",
  labAnchorId = null,
  labEffectiveStars = null,
  filesLabel,
  files,
  oralScanAttachMode = null,
  requestFilesDownloadLocked = false,
  requestFilesDownloadLockedReason = ORAL_SCAN_DOWNLOAD_LOCKED_UNTIL_ABUTS_DESIGN,
  workFilesLabel = "작업 파일",
  designFilesLabel = "어벗 디자인",
  designFiles = [],
  resultFilesLabel = "보철물",
  resultFiles = [],
  productionConfirmBusy = false,
  showProductionConfirm = false,
  productionConfirmTitle = "작업 결과를 확인한 뒤 생산을 진행하세요.",
  productionConfirmButtonLabel = "생산 진행",
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
  abutmentMachiningStarted: _abutmentMachiningStarted = false,
  onAccept,
  rejectBusy = false,
  onReject,
  openSubcontractBusy = false,
  onOpenSubcontract,
  orderDate = null,
  arrivalDate = null,
  orderedAt = null,
  releaseBusy = false,
  onRelease,
  remainingLabel = null,
  acceptedWorkActions = null,
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
  chatDraft,
  onChangeChatDraft,
  onSendChatMessage,
  replyTo,
  onReplyToMessage,
  onCancelReply,
  onToggleReaction,
  composerPlaceholder,
  inputDisabled,
  sendDisabled = false,
  onEditRequest,
  editRequestDisabled = false,
  onAppendArrival,
  appendArrivalDisabled = false,
  appendArrivalBusy = false,
  onCancelRequest,
  cancelRequestDisabled = false,
}: PracticeTransferDetailChatDialogProps) {
  const { toast } = useToast();
  const [rearrivalOpen, setRearrivalOpen] = useState(false);
  const [rearrivalDraft, setRearrivalDraft] = useState<Date | undefined>(undefined);
  const [previewOpen, setPreviewOpen] = useState(false);
  const todayYmd = useMemo(() => toKstYmd(new Date()) || "", []);
  const currentArrivalYmd = useMemo(
    () => String(arrivalDate || "").trim(),
    [arrivalDate],
  );
  const rearrivalMinYmd = todayYmd;

  useEffect(() => {
    if (!rearrivalOpen) return;
    const seedYmd = currentArrivalYmd || todayYmd;
    setRearrivalDraft(ymdToKstDate(seedYmd) || undefined);
  }, [rearrivalOpen, currentArrivalYmd, todayYmd]);

  const confirmRearrival = useCallback(() => {
    const ymd = toKstYmd(rearrivalDraft) || "";
    if (!ymd || !onAppendArrival) return;
    if (todayYmd && ymd < todayYmd) {
      toast({
        title: "재도착일 확인",
        description: "재도착일은 오늘 이후로 선택해 주세요.",
        variant: "destructive",
      });
      return;
    }
    setRearrivalOpen(false);
    onAppendArrival(ymd);
  }, [onAppendArrival, rearrivalDraft, todayYmd, toast]);
  const [previewKind, setPreviewKind] = useState<ModelPreviewKind>("model");
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewMeta, setPreviewMeta] =
    useState<PracticeTransferDialogFileItem | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);
  const previewAbortRef = useRef<AbortController | null>(null);
  /** 의뢰·작업 파일 이미지 썸네일 object URL (s3Key → url) */
  const [fileThumbUrls, setFileThumbUrls] = useState<Record<string, string>>(
    {},
  );
  const fileThumbUrlsRef = useRef<Record<string, string>>({});
  /** STL/PLY/OBJ 썸네일용 File (s3Key → file) */
  const [modelThumbFiles, setModelThumbFiles] = useState<Record<string, File>>(
    {},
  );
  const modelThumbFilesRef = useRef<Record<string, File>>({});

  const collectImageThumbFiles = useCallback(() => {
    const out: PracticeTransferDialogFileItem[] = [];
    const seen = new Set<string>();
    const append = (
      list: PracticeTransferDialogFileItem[] | undefined,
      locked: boolean,
    ) => {
      if (locked) return;
      for (const file of Array.isArray(list) ? list : []) {
        const s3Key = String(file.s3Key || "").trim();
        if (!s3Key || seen.has(s3Key)) continue;
        if (
          !isImagePreviewExt(getPracticeTransferFileExtension(file.fileName))
        ) {
          continue;
        }
        seen.add(s3Key);
        out.push(file);
      }
    };
    append(files, requestFilesDownloadLocked);
    append(designFiles, false);
    append(resultFiles, false);
    return out;
  }, [designFiles, files, requestFilesDownloadLocked, resultFiles]);

  const collectModelThumbFiles = useCallback(() => {
    const out: PracticeTransferDialogFileItem[] = [];
    const seen = new Set<string>();
    const append = (
      list: PracticeTransferDialogFileItem[] | undefined,
      locked: boolean,
    ) => {
      if (locked) return;
      for (const file of Array.isArray(list) ? list : []) {
        const s3Key = String(file.s3Key || "").trim();
        if (!s3Key || seen.has(s3Key)) continue;
        if (!isModelPreviewExt(getModelExtLower(file.fileName))) continue;
        seen.add(s3Key);
        out.push(file);
      }
    };
    append(files, requestFilesDownloadLocked);
    append(designFiles, false);
    append(resultFiles, false);
    return out;
  }, [designFiles, files, requestFilesDownloadLocked, resultFiles]);

  const fileImageThumbKey = useMemo(() => {
    if (!open) return "";
    return collectImageThumbFiles()
      .map((file) => String(file.s3Key || "").trim())
      .join("|");
  }, [collectImageThumbFiles, open]);

  const fileModelThumbKey = useMemo(() => {
    if (!open) return "";
    return collectModelThumbFiles()
      .map((file) => String(file.s3Key || "").trim())
      .join("|");
  }, [collectModelThumbFiles, open]);

  const revokeFileThumbs = useCallback(() => {
    for (const url of Object.values(fileThumbUrlsRef.current)) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }
    fileThumbUrlsRef.current = {};
    setFileThumbUrls({});
  }, []);

  const clearModelThumbs = useCallback(() => {
    modelThumbFilesRef.current = {};
    setModelThumbFiles({});
  }, []);

  useEffect(() => {
    if (!fileImageThumbKey || !authToken) {
      revokeFileThumbs();
      return;
    }
    const imageFiles = collectImageThumbFiles();
    if (!imageFiles.length) {
      revokeFileThumbs();
      return;
    }

    const ac = new AbortController();
    let cancelled = false;

    void (async () => {
      const next: Record<string, string> = {};
      for (const file of imageFiles) {
        if (cancelled || ac.signal.aborted) return;
        const s3Key = String(file.s3Key || "").trim();
        const fileName = String(file.fileName || "image").trim() || "image";
        try {
          const blob = await fetchS3BlobCached({
            s3Key,
            fileName,
            token: authToken,
            buildUrl: buildS3ProxyDownloadUrl,
            signal: ac.signal,
          });
          if (cancelled || ac.signal.aborted) return;
          const typed =
            blob.type && blob.type !== "application/octet-stream"
              ? blob
              : new Blob([blob], { type: mimeTypeForImageFileName(fileName) });
          next[s3Key] = URL.createObjectURL(typed);
        } catch {
          // 썸네일 실패 시 아이콘 placeholder
        }
      }
      if (cancelled || ac.signal.aborted) {
        for (const url of Object.values(next)) {
          try {
            URL.revokeObjectURL(url);
          } catch {
            // ignore
          }
        }
        return;
      }
      for (const url of Object.values(fileThumbUrlsRef.current)) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      }
      fileThumbUrlsRef.current = next;
      setFileThumbUrls(next);
    })();

    return () => {
      cancelled = true;
      ac.abort();
      revokeFileThumbs();
    };
  }, [
    authToken,
    collectImageThumbFiles,
    fileImageThumbKey,
    revokeFileThumbs,
  ]);

  useEffect(() => {
    if (!fileModelThumbKey || !authToken) {
      clearModelThumbs();
      return;
    }
    const modelFiles = collectModelThumbFiles();
    if (!modelFiles.length) {
      clearModelThumbs();
      return;
    }

    const ac = new AbortController();
    let cancelled = false;

    void (async () => {
      const next: Record<string, File> = {};
      for (const file of modelFiles) {
        if (cancelled || ac.signal.aborted) return;
        const s3Key = String(file.s3Key || "").trim();
        const fileName =
          String(file.fileName || "model.stl").trim() || "model.stl";
        try {
          const blob = await fetchS3BlobCached({
            s3Key,
            fileName,
            token: authToken,
            buildUrl: buildS3ProxyDownloadUrl,
            signal: ac.signal,
          });
          if (cancelled || ac.signal.aborted) return;
          next[s3Key] = fileFromModelBlob(blob, fileName);
        } catch {
          // 썸네일 실패 시 Box placeholder
        }
      }
      if (cancelled || ac.signal.aborted) return;
      modelThumbFilesRef.current = next;
      setModelThumbFiles(next);
    })();

    return () => {
      cancelled = true;
      ac.abort();
      clearModelThumbs();
    };
  }, [
    authToken,
    clearModelThumbs,
    collectModelThumbFiles,
    fileModelThumbKey,
  ]);

  const previewableFiles = useMemo(() => {
    const out: Array<{
      file: PracticeTransferDialogFileItem;
      kind: ModelPreviewKind;
    }> = [];
    const append = (
      list: PracticeTransferDialogFileItem[],
      locked: boolean,
    ) => {
      if (locked) return;
      for (const file of list) {
        const kind = resolvePreviewKind(file.fileName);
        if (!kind) continue;
        if (!String(file.s3Key || "").trim()) continue;
        out.push({ file, kind });
      }
    };
    append(Array.isArray(files) ? files : [], requestFilesDownloadLocked);
    append(Array.isArray(designFiles) ? designFiles : [], false);
    append(Array.isArray(resultFiles) ? resultFiles : [], false);
    return out;
  }, [designFiles, files, requestFilesDownloadLocked, resultFiles]);

  const previewIndex = useMemo(() => {
    if (!previewMeta) return -1;
    const key = s3DownloadBusyKey(previewMeta);
    return previewableFiles.findIndex(
      (item) => s3DownloadBusyKey(item.file) === key,
    );
  }, [previewMeta, previewableFiles]);

  const resetPreview = useCallback(() => {
    previewAbortRef.current?.abort();
    previewAbortRef.current = null;
    setPreviewOpen(false);
    setPreviewKind("model");
    setPreviewFile(null);
    setPreviewMeta(null);
    setPreviewLoading(false);
    setPreviewProgress(0);
  }, []);

  useEffect(() => {
    if (!open) resetPreview();
  }, [open, resetPreview]);

  const openFilePreview = useCallback(
    async (file: PracticeTransferDialogFileItem, kind: ModelPreviewKind) => {
      const s3Key = String(file.s3Key || "").trim();
      const fileName =
        String(file.fileName || (kind === "image" ? "image" : "model.stl")).trim() ||
        (kind === "image" ? "image" : "model.stl");
      if (!authToken || !s3Key) {
        toast({
          title: "미리보기 실패",
          description: !authToken
            ? "로그인이 필요합니다."
            : "파일 키가 없어 불러올 수 없습니다.",
          variant: "destructive",
        });
        return;
      }

      previewAbortRef.current?.abort();
      const ac = new AbortController();
      previewAbortRef.current = ac;

      setPreviewKind(kind);
      setPreviewMeta(file);
      setPreviewFile(null);
      setPreviewLoading(true);
      setPreviewProgress(0);
      setPreviewOpen(true);

      try {
        const blob = await fetchS3BlobCached({
          s3Key,
          fileName,
          token: authToken,
          buildUrl: buildS3ProxyDownloadUrl,
          signal: ac.signal,
          onProgress: setPreviewProgress,
        });
        if (ac.signal.aborted) return;
        setPreviewFile(fileFromPreviewBlob(blob, fileName, kind));
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        toast({
          title: "미리보기 실패",
          description:
            err instanceof Error
              ? err.message
              : "파일을 불러오는 중 오류가 발생했습니다.",
          variant: "destructive",
        });
        // 다음/이전 이동 중 실패해도 모달은 유지(빈 상태)
        setPreviewFile(null);
        setPreviewLoading(false);
        if (previewAbortRef.current === ac) previewAbortRef.current = null;
        return;
      } finally {
        if (previewAbortRef.current === ac) {
          previewAbortRef.current = null;
          setPreviewLoading(false);
        }
      }
    },
    [authToken, toast],
  );

  const handleFileRowClick = useCallback(
    (file: PracticeTransferDialogFileItem, locked: boolean) => {
      if (locked) return;
      const busyKey = s3DownloadBusyKey(file);
      const isBusy =
        downloadAllBusy ||
        (busyKey ? downloadingFileKeys.includes(busyKey) : false);
      if (isBusy) return;

      const kind = resolvePreviewKind(file.fileName);
      if (kind) {
        void openFilePreview(file, kind);
        return;
      }
      void onDownloadTransferFile(file);
    },
    [
      downloadAllBusy,
      downloadingFileKeys,
      onDownloadTransferFile,
      openFilePreview,
    ],
  );

  const goPreviewRelative = useCallback(
    (delta: number) => {
      if (previewLoading) return;
      if (previewIndex < 0) return;
      const next = previewableFiles[previewIndex + delta];
      if (!next) return;
      void openFilePreview(next.file, next.kind);
    },
    [openFilePreview, previewIndex, previewLoading, previewableFiles],
  );

  /** 컨펌 대상 작업 파일(디자인 우선, 없으면 보철물) */
  const confirmPreviewTarget = useMemo(() => {
    if (!showProductionConfirm || !onConfirmProduction) return null;
    const preferDesign = String(productionConfirmButtonLabel || "").includes(
      "디자인",
    );
    const lists = preferDesign
      ? [designFiles, resultFiles]
      : [resultFiles, designFiles];
    for (const list of lists) {
      for (const file of Array.isArray(list) ? list : []) {
        const kind = resolvePreviewKind(file.fileName);
        if (!kind) continue;
        if (!String(file.s3Key || "").trim()) continue;
        return { file, kind };
      }
    }
    return null;
  }, [
    designFiles,
    onConfirmProduction,
    productionConfirmButtonLabel,
    resultFiles,
    showProductionConfirm,
  ]);

  const confirmPreviewKey = confirmPreviewTarget
    ? `${s3DownloadBusyKey(confirmPreviewTarget.file)}:${productionConfirmButtonLabel}`
    : "";
  const autoConfirmPreviewKeyRef = useRef("");
  const confirmPreviewSessionRef = useRef(false);

  const openConfirmPreview = useCallback(() => {
    if (!confirmPreviewTarget) return;
    confirmPreviewSessionRef.current = true;
    void openFilePreview(confirmPreviewTarget.file, confirmPreviewTarget.kind);
  }, [confirmPreviewTarget, openFilePreview]);

  // 컨펌이 필요하면 상세 진입 직후 프리뷰를 먼저 연다.
  useEffect(() => {
    if (!open || !confirmPreviewKey || !confirmPreviewTarget) {
      if (!open) {
        autoConfirmPreviewKeyRef.current = "";
        confirmPreviewSessionRef.current = false;
      }
      return;
    }
    if (autoConfirmPreviewKeyRef.current === confirmPreviewKey) return;
    autoConfirmPreviewKeyRef.current = confirmPreviewKey;
    confirmPreviewSessionRef.current = true;
    void openFilePreview(confirmPreviewTarget.file, confirmPreviewTarget.kind);
  }, [confirmPreviewKey, confirmPreviewTarget, open, openFilePreview]);

  // 컨펌 완료 후 프리뷰 닫기
  useEffect(() => {
    if (
      open &&
      !showProductionConfirm &&
      previewOpen &&
      confirmPreviewSessionRef.current
    ) {
      confirmPreviewSessionRef.current = false;
      autoConfirmPreviewKeyRef.current = "";
      resetPreview();
    }
  }, [open, previewOpen, resetPreview, showProductionConfirm]);

  const handleConfirmFromPreview = useCallback(async () => {
    if (!onConfirmProduction || productionConfirmBusy) return;
    await onConfirmProduction();
  }, [onConfirmProduction, productionConfirmBusy]);

  const handleConfirmPanelClick = useCallback(() => {
    if (productionConfirmBusy) return;
    if (confirmPreviewTarget) {
      openConfirmPreview();
      return;
    }
    void onConfirmProduction?.();
  }, [
    confirmPreviewTarget,
    onConfirmProduction,
    openConfirmPreview,
    productionConfirmBusy,
  ]);

  const previewBusyKey = previewMeta ? s3DownloadBusyKey(previewMeta) : "";
  const previewDownloadBusy =
    Boolean(previewBusyKey) &&
    (downloadAllBusy || downloadingFileKeys.includes(previewBusyKey));
  const previewCount = previewableFiles.length;
  const canPreviewPrev = previewIndex > 0;
  const canPreviewNext =
    previewIndex >= 0 && previewIndex < previewCount - 1;
  const previewMetaIsConfirmWorkFile = useMemo(() => {
    if (!previewMeta || !showProductionConfirm) return false;
    const key = s3DownloadBusyKey(previewMeta);
    if (!key) return false;
    const lists = [
      ...(Array.isArray(designFiles) ? designFiles : []),
      ...(Array.isArray(resultFiles) ? resultFiles : []),
    ];
    return lists.some((file) => s3DownloadBusyKey(file) === key);
  }, [designFiles, previewMeta, resultFiles, showProductionConfirm]);
  const previewShowsConfirm = Boolean(
    showProductionConfirm &&
      onConfirmProduction &&
      previewMetaIsConfirmWorkFile,
  );

  const hasToothWorks = Array.isArray(toothWorks) && toothWorks.length > 0;
  const hasPendingLabCustomAbutment = Boolean(
    toothWorks?.some(
      (work) => Boolean(work.customAbutment) && isPendingRoundBarAbutment(work),
    ),
  );
  const hasAbutsCustomAbutment = Boolean(
    toothWorks?.some(
      (work) => Boolean(work.customAbutment) && !isPendingRoundBarAbutment(work),
    ),
  );
  /** 최초 미수락: 채팅은 유지하고 상단에 수락 CTA */
  const showAcceptBar = Boolean(onAccept) && !accepted && !workCanceled;
  /** 작업취소 후 수락이 풀렸지만 채팅은 이어갈 때 */
  const showReacceptBar =
    Boolean(onAccept) && !accepted && workCanceled;
  /** 수락 직후: 수락 버튼 자리에 작업취소(가공 여부는 클릭 시 API 판정) */
  const showReleaseBar =
    Boolean(onRelease) &&
    accepted &&
    !workCanceled &&
    !workCompleted;
  /** 지정 기공소: 스캔 없이도 수락 가능. 자동매칭(practice_required)만 차단 */
  const oralScanBlocksAccept = oralScanAttachMode === "practice_required";
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
  const releaseAction =
    showReleaseBar && onRelease ? (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 border-destructive-muted text-destructive hover:bg-destructive-soft hover:text-destructive"
              onClick={() => void onRelease()}
              disabled={releaseBusy}
            >
              {releaseButtonLabel}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            수락을 해제합니다. 어벗 가공이 시작된 뒤에는 취소할 수 없습니다.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ) : null;
  const resolvedAcceptedWorkActions =
    typeof acceptedWorkActions === "function"
      ? acceptedWorkActions({ releaseAction })
      : acceptedWorkActions;
  const rejectButtonLabel = rejectBusy ? "거부 중..." : "거부";
  const workPeriodDays = getPracticeWorkPeriodDays(orderDate, arrivalDate, orderedAt);
  const showShortWorkPeriod = isPracticeWorkPeriodShort(workPeriodDays);
  const acceptDisabled = acceptBusy || rejectBusy || oralScanBlocksAccept;
  const acceptBarSurchargeLabel = (() => {
    const multiplier = normalizeLabFeeMultiplier(feeQuote?.labFeeMultiplier);
    if (multiplier <= 1) return null;
    return formatLabFeeMultiplierLabel(multiplier);
  })();
  const designFileList = Array.isArray(designFiles) ? designFiles : [];
  const resultFileList = Array.isArray(resultFiles) ? resultFiles : [];
  const showWorkFilesSection =
    designFileList.length > 0 || resultFileList.length > 0;

  const renderFileTile = (
    file: PracticeTransferDialogFileItem,
    idx: number,
    keyPrefix: string,
    locked = false,
  ) => {
    const busyKey = String(file.s3Key || file.id || "").trim();
    const isBusy =
      downloadAllBusy ||
      (busyKey ? downloadingFileKeys.includes(busyKey) : false);
    const progress = busyKey ? Number(downloadProgressByKey[busyKey] ?? 0) : 0;
    const isMesh = isModelPreviewExt(getModelExtLower(file.fileName));
    const isImage = isImagePreviewExt(
      getPracticeTransferFileExtension(file.fileName),
    );
    const thumbUrl = busyKey ? fileThumbUrls[busyKey] : undefined;
    const modelThumbFile = busyKey ? modelThumbFiles[busyKey] : undefined;
    const typeLabel = fileTypeLabel(file.fileName);
    const title = locked
      ? requestFilesDownloadLockedReason
      : isMesh
        ? "클릭하여 3D 미리보기"
        : isImage
          ? "클릭하여 이미지 미리보기"
          : "클릭하여 다운로드";

    return (
      <div
        key={`${keyPrefix}:${file.id}:${idx}`}
        className="relative min-w-0 overflow-hidden rounded-md border bg-slate-50"
      >
        <button
          type="button"
          onClick={() => handleFileRowClick(file, locked)}
          disabled={isBusy || locked}
          title={title}
          className="flex w-full flex-col items-stretch text-left disabled:opacity-60 disabled:pointer-events-none"
        >
          <div className="relative aspect-square w-full overflow-hidden bg-slate-100">
            {isMesh && modelThumbFile ? (
              <StlPreviewThumbnail
                file={modelThumbFile}
                className="pointer-events-none"
              />
            ) : isImage && thumbUrl ? (
              <img
                src={thumbUrl}
                alt=""
                className="h-full w-full object-cover"
                draggable={false}
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-1 text-slate-500">
                {isMesh ? (
                  <Box className="h-7 w-7 shrink-0" aria-hidden />
                ) : (
                  <FileIcon className="h-7 w-7 shrink-0" aria-hidden />
                )}
                <span className="max-w-full truncate text-[10px] font-semibold tracking-wide text-slate-600">
                  {typeLabel}
                </span>
              </div>
            )}
            {locked ? (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900/45 px-1">
                <span className="text-center text-[10px] font-medium text-white">
                  다운로드 대기
                </span>
              </div>
            ) : null}
            {isBusy ? (
              <div className="absolute inset-x-0 bottom-0 bg-slate-900/55 px-1 py-0.5">
                <p className="text-center text-[10px] text-white">
                  {Math.round(progress)}%
                </p>
                <Progress value={progress} className="mt-0.5 h-1" />
              </div>
            ) : null}
          </div>
          <p
            className="truncate px-1.5 py-1.5 text-center text-[11px] font-medium text-slate-800"
            title={file.fileName}
          >
            {file.fileName}
          </p>
        </button>
      </div>
    );
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex h-[86vh] flex-col gap-0 overflow-hidden p-0",
          RESPONSIVE.dialogContentFull,
          "sm:max-w-[min(96vw,90rem)]",
        )}
      >
        <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 pr-8 text-base">
            <MessageSquare className="h-4 w-4 text-primary-strong" />
            <span className="min-w-0 truncate">{title}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 py-4 flex-1 min-h-0 overflow-hidden">
          <div className="grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(0,0.3fr)_minmax(0,0.7fr)] gap-4 lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)]">
            <div className="min-h-0 space-y-4 overflow-y-auto rounded-lg border bg-card p-3 text-[15px]">
              {onEditRequest || onCancelRequest ? (
                <div className="flex flex-wrap justify-end gap-2">
                  {onCancelRequest ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-1.5 border-destructive-muted text-destructive hover:bg-destructive-soft hover:text-destructive"
                      disabled={cancelRequestDisabled}
                      onClick={() => onCancelRequest()}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      의뢰 취소
                    </Button>
                  ) : null}
                  {onEditRequest ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-1.5"
                      disabled={editRequestDisabled}
                      onClick={() => onEditRequest()}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      의뢰 수정
                    </Button>
                  ) : null}
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                {summaryItems.map((row, idx) => {
                  const isArrivalRow = row.label === "치과도착일";
                  const valueNode = (
                    <p
                      className={
                        row.valueClassName
                          ? `font-medium break-words ${row.valueClassName}`
                          : "font-medium break-words"
                      }
                    >
                      {row.value || "-"}
                    </p>
                  );
                  const valueWithAction =
                    isArrivalRow && onAppendArrival ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {row.tooltip ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex cursor-help">
                                {valueNode}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="max-w-xs text-left text-xs leading-relaxed"
                            >
                              {row.tooltip}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          valueNode
                        )}
                        <Popover
                          open={rearrivalOpen}
                          onOpenChange={setRearrivalOpen}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 shrink-0 gap-1 px-2 text-xs"
                              disabled={
                                appendArrivalDisabled || appendArrivalBusy
                              }
                              title="재도착일 선택 시 오늘이 재주문일로 함께 반영됩니다. 오늘 이후 재도착일 1개만 두며, 다시 고르면 수정되고 크레딧은 추가 차감되지 않습니다."
                            >
                              <CalendarClock className="h-3.5 w-3.5" />
                              {appendArrivalBusy ? "반영 중…" : "재도착일"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            align="start"
                            className="w-auto p-0"
                            onOpenAutoFocus={(e) => e.preventDefault()}
                          >
                            <div className="border-b px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                              선택일=재도착일, 오늘=재주문일로 반영됩니다.
                              오늘 이후 재도착일은 1개만 유지되며, 다시
                              고르면 수정되고 크레딧은 추가 차감되지
                              않습니다.
                            </div>
                            <Calendar
                              mode="single"
                              required
                              numberOfMonths={1}
                              selected={rearrivalDraft}
                              onSelect={(date) => {
                                if (date) setRearrivalDraft(date);
                              }}
                              defaultMonth={rearrivalDraft}
                              disabled={(date) => {
                                const ymd = toKstYmd(date) || "";
                                if (!ymd) return true;
                                if (rearrivalMinYmd && ymd < rearrivalMinYmd) {
                                  return true;
                                }
                                return false;
                              }}
                              classNames={{
                                cell: "h-9 w-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20",
                                day_range_start: "",
                                day_range_end: "",
                                day_range_middle: "",
                              }}
                              initialFocus
                            />
                            <div className="flex items-center justify-end gap-2 border-t px-3 py-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setRearrivalOpen(false)}
                              >
                                취소
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                disabled={
                                  !rearrivalDraft || appendArrivalBusy
                                }
                                onClick={() => confirmRearrival()}
                              >
                                적용
                              </Button>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    ) : row.tooltip ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex cursor-help">
                            {valueNode}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          className="max-w-xs text-left text-xs leading-relaxed"
                        >
                          {row.tooltip}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      valueNode
                    );
                  return (
                    <div key={`${row.label}:${idx}`}>
                      <p className="text-muted-foreground">{row.label}</p>
                      {valueWithAction}
                    </div>
                  );
                })}
              </div>

              {summaryBanner ? (
                <div className="pt-1">{summaryBanner}</div>
              ) : null}

              {hasToothWorks ? (
                <PracticeToothWorkChartReadOnly
                  key={toothWorksKey || "tooth-works"}
                  toothWorks={toothWorks}
                  feeQuote={feeQuote}
                  feeViewer={feeViewer}
                  labAnchorId={labAnchorId}
                  skipJig={skipJig}
                  labEffectiveStars={labEffectiveStars}
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
                  <p className="text-muted-foreground">
                    {filesLabel} ({files.length}개)
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void onDownloadAllFiles()}
                    disabled={
                      files.length === 0 ||
                      downloadAllBusy ||
                      requestFilesDownloadLocked
                    }
                  >
                    {downloadAllBusy ? "다운로드 중..." : "전체 다운로드"}
                  </Button>
                </div>
                {requestFilesDownloadLocked && files.length > 0 ? (
                  <p className="mt-2 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
                    {requestFilesDownloadLockedReason}
                  </p>
                ) : null}
                {files.length ? (
                  <div className="mt-2 max-h-64 overflow-y-auto pr-1">
                    <div className="grid grid-cols-4 gap-2">
                      {files.map((file, idx) =>
                        renderFileTile(
                          file,
                          idx,
                          "request",
                          requestFilesDownloadLocked,
                        ),
                      )}
                    </div>
                  </div>
                ) : oralScanAttachMode === "practice_required" ? (
                  <p className="mt-2 text-sm text-destructive leading-relaxed">
                    {ORAL_SCAN_REQUIRED_FROM_PRACTICE}
                  </p>
                ) : (
                  <p className="font-medium">-</p>
                )}
              </div>

              {showWorkFilesSection ? (
                <div className="space-y-3">
                  <p className="text-muted-foreground">{workFilesLabel}</p>
                  {designFileList.length > 0 ? (
                    <div className="pl-1">
                      <p className="text-xs font-medium text-slate-600">
                        {designFilesLabel} ({designFileList.length}개)
                      </p>
                      <div className="mt-1.5 max-h-64 overflow-y-auto pr-1">
                        <div className="grid grid-cols-4 gap-2">
                          {designFileList.map((file, idx) =>
                            renderFileTile(file, idx, "design"),
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {resultFileList.length > 0 ? (
                    <div className="pl-1">
                      <p className="text-xs font-medium text-slate-600">
                        {resultFilesLabel} ({resultFileList.length}개)
                      </p>
                      <div className="mt-1.5 max-h-64 overflow-y-auto pr-1">
                        <div className="grid grid-cols-4 gap-2">
                          {resultFileList.map((file, idx) =>
                            renderFileTile(file, idx, "result"),
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {showProductionConfirm && onConfirmProduction ? (
                <div className="rounded-md border border-primary/30 bg-primary-soft/40 p-3">
                  <p className="text-sm text-primary-strong">
                    {productionConfirmTitle}
                  </p>
                  <Button
                    type="button"
                    className="mt-2"
                    disabled={productionConfirmBusy}
                    onClick={handleConfirmPanelClick}
                  >
                    {productionConfirmBusy
                      ? "처리 중..."
                      : confirmPreviewTarget
                        ? `미리보기 · ${productionConfirmButtonLabel}`
                        : productionConfirmButtonLabel}
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card">
              <div className="flex shrink-0 items-center justify-between gap-2 border-b bg-muted/50 px-3 py-3 sm:px-4">
                <div className="min-w-0 truncate text-sm font-medium">
                  {conversationTitle}
                </div>
                {chatHeaderAction ? (
                  <div className="shrink-0">{chatHeaderAction}</div>
                ) : null}
              </div>

              {counterpartyMemoStrip}

              {showAcceptBar ? (
                <div className="shrink-0 border-b bg-muted/40 px-3 py-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  {hasPendingLabCustomAbutment ||
                  oralScanAttachMode === "practice_required" ? (
                    <div className="space-y-1">
                      {hasPendingLabCustomAbutment ? (
                        <LabPendingAbutmentGuide
                          toothWorks={toothWorks}
                          mixedWithAbuts={hasAbutsCustomAbutment}
                        />
                      ) : null}
                      {oralScanAttachMode === "practice_required" ? (
                        <p className="text-xs text-destructive leading-relaxed">
                          {ORAL_SCAN_REQUIRED_FROM_PRACTICE}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="flex shrink-0 items-center gap-2 self-end sm:ml-auto sm:self-auto">
                    {showShortWorkPeriod ? (
                      <PracticeWorkPeriodText
                        orderDate={orderDate}
                        arrivalDate={arrivalDate}
                        at={orderedAt}
                        variant="labeled"
                        viewer="lab"
                        className="text-xs"
                      />
                    ) : null}
                    {onOpenSubcontract ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => void onOpenSubcontract()}
                        disabled={
                          acceptBusy || rejectBusy || openSubcontractBusy
                        }
                      >
                        {openSubcontractBusy ? "전환 중..." : "하청 전환"}
                      </Button>
                    ) : null}
                    {onReject ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-destructive-muted text-destructive hover:bg-destructive-soft hover:text-destructive"
                        onClick={() => void onReject()}
                        disabled={acceptBusy || rejectBusy}
                      >
                        {rejectButtonLabel}
                      </Button>
                    ) : null}
                    {acceptBarSurchargeLabel ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex shrink-0 items-center rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900">
                              {acceptBarSurchargeLabel}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs leading-relaxed">
                            이 치과는 어벗츠기공소 기준 할증 대상입니다. 견적·정산은
                            기본 기공수가(생성 시 스냅샷)를 따릅니다.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void onAccept?.()}
                      disabled={acceptDisabled}
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
                      disabled={acceptBusy || oralScanBlocksAccept}
                    >
                      {reacceptButtonLabel}
                    </Button>
                  </div>
                </div>
              ) : null}

              {showReleaseBar ? (
                <div className="shrink-0 border-b bg-muted/40 px-3 py-2 flex flex-col gap-1.5">
                  {typeof acceptedWorkActions === "function" ? (
                    resolvedAcceptedWorkActions
                  ) : resolvedAcceptedWorkActions ? (
                    <div className="flex min-w-0 w-full flex-col gap-1.5">
                      {resolvedAcceptedWorkActions}
                      {releaseAction ? (
                        <div className="flex flex-wrap items-center gap-2">
                          {releaseAction}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground">
                        수락된 의뢰입니다. 작업취소하면 수락이 해제됩니다.
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        {releaseAction}
                      </div>
                    </>
                  )}
                </div>
              ) : null}

              {!showReleaseBar &&
              accepted &&
              !workCanceled &&
              resolvedAcceptedWorkActions ? (
                <div className="shrink-0 border-b bg-muted/40 px-3 py-2 flex flex-wrap items-center justify-end gap-2">
                  {resolvedAcceptedWorkActions}
                </div>
              ) : null}

              <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] overflow-hidden">
                <div className="min-h-0 overflow-y-auto overscroll-contain">
                  <div className="w-full min-w-0 max-w-full space-y-2 p-3 sm:p-4">
                    {chatLoading ? (
                      <div className="py-4 text-center text-xs text-muted-foreground">
                        채팅을 불러오는 중입니다...
                      </div>
                    ) : null}

                    {!chatLoading && visibleChatError ? (
                      <div className="flex min-h-[12rem] items-center justify-center py-4">
                        <p className="text-center text-xs text-muted-foreground">
                          {visibleChatError}
                        </p>
                      </div>
                    ) : null}

                    {!chatLoading &&
                    !visibleChatError &&
                    chatMessages.length === 0 ? (
                      <div className="py-6 text-center text-xs text-muted-foreground">
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
                          authToken={authToken}
                          formatTime={formatChatTime}
                          formatFileSize={formatFileSize}
                          showSenderName
                          compact
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
                </div>

                <div className="shrink-0">
                  <ChatComposer
                    draft={chatDraft}
                    onDraftChange={onChangeChatDraft}
                    onSend={() => void onSendChatMessage()}
                    placeholder={composerPlaceholder}
                    disabled={inputDisabled}
                    isSending={sendDisabled}
                    pendingUploads={chatAttachedFiles}
                    onPickFiles={onAttachChatFiles}
                    onRemovePendingFile={onRemoveAttachedChatFile}
                    onRetryPendingFile={onRetryAttachedChatFile}
                    replyTo={replyTo}
                    onCancelReply={onCancelReply}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    <ModelPreviewDialog
      open={previewOpen}
      onOpenChange={(next) => {
        if (!next) {
          confirmPreviewSessionRef.current = false;
          resetPreview();
          return;
        }
        setPreviewOpen(true);
      }}
      kind={previewKind}
      fileName={previewMeta?.fileName || ""}
      file={previewFile}
      loading={previewLoading}
      progress={previewProgress}
      downloadBusy={previewDownloadBusy}
      onDownload={
        previewMeta
          ? () => void onDownloadTransferFile(previewMeta)
          : undefined
      }
      previewIndex={previewIndex}
      previewCount={previewCount}
      onPrev={
        canPreviewPrev ? () => goPreviewRelative(-1) : undefined
      }
      onNext={
        canPreviewNext ? () => goPreviewRelative(1) : undefined
      }
      confirmMessage={
        previewShowsConfirm ? productionConfirmTitle : undefined
      }
      confirmLabel={
        previewShowsConfirm ? productionConfirmButtonLabel : undefined
      }
      confirmBusy={previewShowsConfirm ? productionConfirmBusy : false}
      onConfirm={
        previewShowsConfirm
          ? () => void handleConfirmFromPreview()
          : undefined
      }
    />
    </>
  );
}

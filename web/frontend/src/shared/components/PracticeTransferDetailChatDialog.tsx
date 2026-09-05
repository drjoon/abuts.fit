// related files:
// - web/frontend/src/shared/components/practice/usePracticeTransferPanelLayout.ts
// - web/frontend/src/components/ui/dialog.tsx
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
// - 2026-09-05: lab_accept — 거절·수락 버튼 practice-tooth-guide-pulse(모달 홀 유지).
// - 2026-09-05: lab_detail — 상세 모달 전체(DialogContent) Spotlight 홀.
// - 2026-09-03: 요약 행 action — 어벗 진행상황 옆 의뢰 상세 버튼 등.
// - 2026-09-02: summaryBanner(어벗 업로드 지연 등) — 의뢰상세 + 진행 상황 탭 상단.
// - 2026-09-03: 어벗 작업 드롭 — 비STL도 부모로 전달(가드·다시 올리기). 조용한 필터 제거.
// - 2026-09-02: 어벗 작업 드롭 — STL만 허용(비STL 거부 토스트). 진행상황 accept=STL.
// - 2026-09-02: 어벗 STL 안내 배너 — 클릭 시 STL 전용 OS 파일창(진행 상황 탭 input disabled 우회).
// - 2026-09-02: 어벗 STL 안내 배너 — label/htmlFor로 클릭 파일창(업로드 CTA 대체).
// - 2026-08-28: 썸네일 — 파일 목록 증분 로드·키 정렬. cleanup에서 전체 revoke 금지(플리커 방지).
// - 2026-08-28: 기공소 의뢰상세 — A5 프린트(기본정보·치식·메모).
// - 2026-08-28: 기공소 수락 후 상세 모달 — 채팅 영역 점선 드롭존·빈 상태 안내.
// - 2026-08-28: 플로팅 z-300 — 견적 등 툴팁은 ui/tooltip z-400(가림 방지).
// - 2026-08-31: 치과·기공소 공통 — 신호등 제거, 우측 상단 큰 닫기(X)만(목록 모달과 동일).
// - 2026-08-28: 모바일 채팅 — 신호등 제거·오른쪽 큰 닫기(X).
// - 2026-08-28: 맥/카톡 스타일 신호등(닫기·최소화·최대화) 헤더(PC).
// - 2026-08-28: 플로팅 — 항상 논모달(페이드 없음)·헤더 threshold 드래그·큰 닫기.
// - 2026-08-28: 플로팅 패널 — 드래그·리사이즈·좌우도킹·핀(목록 클릭 전환).
// - 2026-08-28: 의뢰상세 탭 — 요약 행·섹션 계층으로 가독성 개선.
// - 2026-08-28: 탭 UI 폴리시 — 제목/소통헤더 제거, 평가→탭줄, 박스 없이 채움.
// - 2026-08-28: 기공소 — 미읽음은 의뢰상세, 이미 읽음은 진행 상황 탭으로 오픈.
// - 2026-08-28: 기공소 오픈 시 의뢰상세 탭 우선. 활성 탭 primary(파란).
// - 2026-08-28: 의뢰상세·채팅 좌우 분할 → 탭 전환(치과 기본 채팅).
// - 2026-08-28: 채팅 탭 라벨 → 진행 상황(치과·기공소 공통).
// - 2026-08-28: 치과 의뢰취소·수정 CTA — 의뢰상세 → 진행 상황 탭 상단.
// - 2026-08-27: 채팅 버블에 보낸사람 이름 표시.
// - 2026-08-27: 재도착일 — 오늘=재주문일·선택일=재도착일 동시 누적(주문일/도착일 캘린더).
// - 2026-08-27: 재도착일 — 오늘 이후 1개만(다시 고르면 교체). 과거·오늘만 캘린더 이력.
// - 2026-08-27: 치과도착일 옆 「재도착일」날짜 선택(누적·과금 없음).
// - 2026-08-28: 드롭 안내 — primary 짙은 파랑·채팅 영역 상단 고정.
// - 2026-08-28: 드롭존 활성 시 채팅 메시지 opacity로 살짝 흐리게.
// - 2026-08-28: 채팅 드롭존 — 메시지는 위, 안내/업로드바는 하단 고정.
// - 2026-08-28: 채팅 드롭존 — 드롭/파일오픈 업로드 프로그레스바.
// - 2026-08-28: 채팅 드롭존 — 드래그 안내 아래 업로드 결과(생산 시작·작업 완료) 한 줄.
// - 2026-08-28: 작업완료 단계 수락 바 — flex-wrap justify-end 제거(CTA 바가 자체 2단 배치).
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
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Box,
  CalendarClock,
  FileIcon,
  MessageSquare,
  Pencil,
  Printer,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/shared/ui/cn";
import { toKstYmd, ymdToKstDate } from "@/shared/date/kst";
import { type ChatMessage } from "@/shared/hooks/useChatRooms";
import { ChatComposer } from "@/features/chat/components/ChatComposer";
import { ChatMessageBubble } from "@/features/chat/components/ChatMessageBubble";
import { buildChatReactionUserNameById } from "@/features/chat/components/chatReactions";
import { type ReplyToMessage } from "@/features/chat/components/MessageReply";
import { PracticeToothWorkChartReadOnly } from "@/shared/components/practice/PracticeToothWorkChartReadOnly";
import { usePracticeTransferPanelLayout } from "@/shared/components/practice/usePracticeTransferPanelLayout";
import { useIsMobile } from "@/shared/hooks/use-mobile";
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
import { useGuideTour } from "@/shared/guideTour/GuideTourProvider";
import { StlPreviewThumbnail } from "@/features/requests/components/StlPreviewThumbnail";
import {
  fileFromImageBlob,
  fileFromModelBlob,
  getModelExtLower,
  isModelPreviewExt,
  peekPlyHeaderInfo,
  resolveCompanionTextureFileName,
  siblingTextureS3Key,
} from "@/shared/files/modelPreviewFile";
import {
  buildS3ProxyDownloadUrl,
  s3DownloadBusyKey,
} from "@/shared/files/useS3FileDownload";
import { fetchS3BlobCached } from "@/shared/files/s3BlobCache";
import { loadS3ImageThumbUrlsParallel } from "@/shared/files/s3ImageThumb";
import { useToast } from "@/shared/hooks/use-toast";
import {
  formatLabFeeMultiplierLabel,
  isPendingRoundBarAbutment,
  isSimpleAbutmentModeForFee,
  normalizeLabFeeMultiplier,
} from "@/shared/practice/labFeeSchedule";
import { LabPendingAbutmentGuide } from "@/shared/components/practice/LabPendingAbutmentGuide";
import {
  getPracticeTransferFileExtension,
  PRACTICE_ACCEPTED_HINT,
  PRACTICE_TRANSFER_IMAGE_EXTENSIONS,
  PRACTICE_TRANSFER_STL_ACCEPT,
} from "@/shared/practice/practiceTransferAccept";
import {
  pickPracticeTransferFilesViaInput,
  PracticeTransferFileDropTarget,
} from "@/shared/components/practice/PracticeTransferFileDropTarget";
import { printPracticeTransferDetail } from "@/shared/practice/practiceTransferDetailPrint";

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
  /** 값 옆 액션(예: 어벗 진행상황 → 의뢰 상세) */
  action?: ReactNode;
};

export type PracticeTransferDialogFileItem = {
  id: string;
  fileName: string;
  size: number;
  s3Key: string;
};

/** 기공의뢰수신 — 수락 후 창 전체 파일 드롭(카드와 동일 라우팅) */
export type PracticeTransferWorkFileDropConfig = {
  fileInputId: string;
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  /** 채팅 드롭존 상단 안내 — 클릭(파일창)·드래그 공통 */
  guideText: string;
  /** guideText 아래 한 줄(업로드 결과 안내 등) */
  guideDetail?: string;
  /** 드래그 오버레이 부제. 미지정 시 PRACTICE_ACCEPTED_HINT */
  dropHint?: string;
  /** 드롭/파일오픈 직후 S3 사전업로드·제출 진행률(0~100) */
  uploadProgressPercent?: number | null;
  /** 예: 업로드 중… 45% / 처리 중… */
  uploadProgressLabel?: string | null;
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
  /** 의뢰상세 요약 아래 + 진행 상황 탭 상단 — 예: 어벗 업로드 지연, 미가입 초대 */
  summaryBanner?: ReactNode;
  summaryItems: PracticeTransferDialogSummaryItem[];
  memo: string;
  /** 보철물 치식 차트(읽기 전용). 있으면 의뢰 메모 위에 표시 */
  toothWorks?: ToothWorkSelection[];
  toothWorksKey?: string;
  feeQuote?: PracticeTransferFeeQuote | null;
  skipJig?: boolean;
  feeViewer?: PracticeTransferFeeQuoteViewer;
  /**
   * 열릴 때 기본 탭. 미지정 시 feeViewer 기준(lab→의뢰 상세, practice→진행 상황).
   * 기공소 캘린더: 미읽음→detail, 이미 읽음→chat.
   */
  initialPanelTab?: "detail" | "chat";
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
   * 기공의뢰수신: 수락 후 작업 취소·디자인 확인 등.
   * 어벗 STL 업로드는 workFileDrop 안내 배너(클릭/드래그).
   * 함수면 `releaseAction`(작업취소)을 버튼 행 trailing에 넣을 수 있다.
   */
  acceptedWorkActions?:
    | ReactNode
    | ((slots: { releaseAction: ReactNode | null }) => ReactNode);
  /** 수락 후 창 전체 드롭존(기공의뢰수신). 안내 배너 클릭·드래그로 파일창 */
  workFileDrop?: PracticeTransferWorkFileDropConfig | null;
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
  /** 치과: 임시치아 배송 후 최종 보철 후속 제작 */
  onAppendProsthesis?: () => void;
  appendProsthesisDisabled?: boolean;
  appendProsthesisBusy?: boolean;
  appendProsthesisHint?: string | null;
  /** 기공소 수락 전 pending 후속 제작 */
  onCancelProsthesisFollowUp?: () => void;
  onModifyProsthesisFollowUp?: () => void;
  prosthesisFollowUpPending?: boolean;
  cancelProsthesisFollowUpBusy?: boolean;
  modifyProsthesisFollowUpBusy?: boolean;
  prosthesisFollowUps?: import("@/shared/practice/prosthesisFollowUp").ProsthesisFollowUpRecord[] | null;
  /** 치과: 수락 전·작업취소 건을 휴지통으로 */
  onCancelRequest?: () => void;
  cancelRequestDisabled?: boolean;
  /** 가이드투어 — Dialog z-[410](블러 아래) */
  guideTourElevate?: boolean;
};

export function PracticeTransferDetailChatDialog({
  open,
  onOpenChange,
  title,
  conversationTitle: _conversationTitle,
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
  initialPanelTab,
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
  workFileDrop = null,
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
  onAppendProsthesis,
  appendProsthesisDisabled = false,
  appendProsthesisBusy = false,
  appendProsthesisHint = null,
  onCancelProsthesisFollowUp,
  onModifyProsthesisFollowUp,
  prosthesisFollowUpPending = false,
  cancelProsthesisFollowUpBusy = false,
  modifyProsthesisFollowUpBusy = false,
  prosthesisFollowUps = null,
  onCancelRequest,
  cancelRequestDisabled = false,
  guideTourElevate = false,
}: PracticeTransferDetailChatDialogProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const platformGuideTour = useGuideTour();
  /** 수신 투어 lab_accept — 거절·수락 CTA 깜빡임(모달 전체 홀은 Spotlight lab_detail) */
  const guideTourPulseAcceptActions =
    platformGuideTour.kind === "lab" &&
    platformGuideTour.active &&
    platformGuideTour.stepId === "lab_accept";
  const {
    layout,
    minimized,
    maximized,
    beginHeaderDrag,
    beginResize,
    minimize,
    toggleMaximize,
  } = usePracticeTransferPanelLayout();
  const resolvedInitialPanelTab: "detail" | "chat" =
    initialPanelTab === "detail" || initialPanelTab === "chat"
      ? initialPanelTab
      : feeViewer === "lab"
        ? "detail"
        : "chat";
  const [panelTab, setPanelTab] = useState<"detail" | "chat">(resolvedInitialPanelTab);
  const [rearrivalOpen, setRearrivalOpen] = useState(false);
  const [rearrivalDraft, setRearrivalDraft] = useState<Date | undefined>(undefined);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (open) setPanelTab(resolvedInitialPanelTab);
  }, [open, resolvedInitialPanelTab]);

  const handlePanelTabChange = useCallback((value: string) => {
    setPanelTab(value === "detail" ? "detail" : "chat");
  }, []);

  const handleChromePointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("button, a, input, textarea, select, [data-no-drag]")) {
        return;
      }
      // 탭 클릭은 유지 — threshold 드래그로 이동
      beginHeaderDrag(e.clientX, e.clientY);
    },
    [beginHeaderDrag],
  );

  useEffect(() => {
    if (!open || panelTab !== "chat") return;
    const id = requestAnimationFrame(() => {
      chatBottomRef.current?.scrollIntoView({ behavior: "auto" });
    });
    return () => cancelAnimationFrame(id);
  }, [open, panelTab, chatBottomRef, chatMessages.length]);

  const reactionUserNameById = useMemo(
    () => buildChatReactionUserNameById({ messages: chatMessages }),
    [chatMessages],
  );

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
  const [previewTextureFile, setPreviewTextureFile] = useState<File | null>(
    null,
  );
  const [previewCompanionFiles, setPreviewCompanionFiles] = useState<File[]>(
    [],
  );
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
  /** 칼라 텍스처용 이미지 File (s3Key → file) */
  const [imageThumbFiles, setImageThumbFiles] = useState<Record<string, File>>(
    {},
  );
  const imageThumbFilesRef = useRef<Record<string, File>>({});
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
      .filter(Boolean)
      .sort()
      .join("|");
  }, [collectImageThumbFiles, open]);

  const fileModelThumbKey = useMemo(() => {
    if (!open) return "";
    return collectModelThumbFiles()
      .map((file) => String(file.s3Key || "").trim())
      .filter(Boolean)
      .sort()
      .join("|");
  }, [collectModelThumbFiles, open]);

  const imageCompanionFiles = useMemo(
    () => Object.values(imageThumbFiles),
    [imageThumbFiles],
  );

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
    imageThumbFilesRef.current = {};
    setImageThumbFiles({});
  }, []);

  const clearModelThumbs = useCallback(() => {
    modelThumbFilesRef.current = {};
    setModelThumbFiles({});
  }, []);

  // 모달 닫힐 때만 전체 정리. 목록 갱신 cleanup에서 revoke하면 이미 로드된 썸네일이 깜빡인다.
  useEffect(() => {
    if (!open) {
      revokeFileThumbs();
      clearModelThumbs();
    }
  }, [clearModelThumbs, open, revokeFileThumbs]);

  useEffect(() => {
    if (!open || !fileImageThumbKey || !authToken) return;
    const imageFiles = collectImageThumbFiles();
    if (!imageFiles.length) {
      if (Object.keys(fileThumbUrlsRef.current).length > 0) revokeFileThumbs();
      return;
    }

    const wanted = new Set(
      imageFiles.map((file) => String(file.s3Key || "").trim()).filter(Boolean),
    );

    // 목록에서 빠진 키만 revoke
    let pruned = false;
    const nextUrls = { ...fileThumbUrlsRef.current };
    const nextFiles = { ...imageThumbFilesRef.current };
    for (const key of Object.keys(nextUrls)) {
      if (wanted.has(key)) continue;
      try {
        URL.revokeObjectURL(nextUrls[key]);
      } catch {
        // ignore
      }
      delete nextUrls[key];
      delete nextFiles[key];
      pruned = true;
    }
    if (pruned) {
      fileThumbUrlsRef.current = nextUrls;
      imageThumbFilesRef.current = nextFiles;
      setFileThumbUrls(nextUrls);
      setImageThumbFiles(nextFiles);
    }

    const missing = imageFiles.filter((file) => {
      const s3Key = String(file.s3Key || "").trim();
      return s3Key && !fileThumbUrlsRef.current[s3Key];
    });
    if (!missing.length) return;

    const ac = new AbortController();
    let cancelled = false;

    void loadS3ImageThumbUrlsParallel({
      items: missing.map((file) => ({
        s3Key: String(file.s3Key || "").trim(),
        fileName: String(file.fileName || "image").trim() || "image",
      })),
      token: authToken,
      signal: ac.signal,
      existing: fileThumbUrlsRef.current,
      onReady: (s3Key, url) => {
        if (cancelled || ac.signal.aborted) {
          try {
            URL.revokeObjectURL(url);
          } catch {
            // ignore
          }
          return;
        }
        fileThumbUrlsRef.current = { ...fileThumbUrlsRef.current, [s3Key]: url };
        setFileThumbUrls({ ...fileThumbUrlsRef.current });
      },
    });

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [
    authToken,
    collectImageThumbFiles,
    fileImageThumbKey,
    open,
    revokeFileThumbs,
  ]);

  useEffect(() => {
    if (!open || !fileModelThumbKey || !authToken) return;
    const modelFiles = collectModelThumbFiles();
    if (!modelFiles.length) {
      if (Object.keys(modelThumbFilesRef.current).length > 0) clearModelThumbs();
      return;
    }

    const wanted = new Set(
      modelFiles.map((file) => String(file.s3Key || "").trim()).filter(Boolean),
    );

    let pruned = false;
    const kept: Record<string, File> = { ...modelThumbFilesRef.current };
    for (const key of Object.keys(kept)) {
      if (wanted.has(key)) continue;
      delete kept[key];
      pruned = true;
    }
    if (pruned) {
      modelThumbFilesRef.current = kept;
      setModelThumbFiles(kept);
    }

    const missing = modelFiles.filter((file) => {
      const s3Key = String(file.s3Key || "").trim();
      return s3Key && !modelThumbFilesRef.current[s3Key];
    });
    if (!missing.length) return;

    const ac = new AbortController();
    let cancelled = false;

    void Promise.all(
      missing.map(async (file) => {
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
    };
  }, [
    authToken,
    clearModelThumbs,
    collectModelThumbFiles,
    fileModelThumbKey,
    open,
  ]);

  // 3D 타일 텍스처용 — 모델 파일이 있을 때만 원본 이미지를 백그라운드 로드
  useEffect(() => {
    if (!open || !fileModelThumbKey || !fileImageThumbKey || !authToken) return;
    const imageFiles = collectImageThumbFiles();
    const missing = imageFiles.filter((file) => {
      const s3Key = String(file.s3Key || "").trim();
      return s3Key && !imageThumbFilesRef.current[s3Key];
    });
    if (!missing.length) return;

    const ac = new AbortController();
    let cancelled = false;

    void Promise.all(
      missing.map(async (file) => {
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
          imageThumbFilesRef.current = {
            ...imageThumbFilesRef.current,
            [s3Key]: fileFromImageBlob(blob, fileName),
          };
          setImageThumbFiles({ ...imageThumbFilesRef.current });
        } catch {
          // 3D 텍스처 실패 시 무시
        }
      }),
    );

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [
    authToken,
    collectImageThumbFiles,
    fileImageThumbKey,
    fileModelThumbKey,
    open,
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
    setPreviewTextureFile(null);
    setPreviewCompanionFiles([]);
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
      setPreviewTextureFile(null);
      setPreviewCompanionFiles([]);
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
        const modelOrImage = fileFromPreviewBlob(blob, fileName, kind);
        setPreviewFile(modelOrImage);

        if (kind === "model") {
          const imageItems = collectImageThumbFiles();
          const companionFiles = imageItems
            .map((item) => {
              const key = String(item.s3Key || "").trim();
              return key ? imageThumbFilesRef.current[key] : null;
            })
            .filter((f): f is File => Boolean(f));

          let preferredTexture: string | null = null;
          const ext = getModelExtLower(fileName);
          if (ext === ".ply") {
            preferredTexture = peekPlyHeaderInfo(
              await modelOrImage.arrayBuffer(),
            ).textureFileName;
          }

          const matchedName = resolveCompanionTextureFileName(
            fileName,
            preferredTexture,
            imageItems.map((item) => String(item.fileName || "")),
          );

          let textureFile: File | null = null;
          if (matchedName) {
            const matchedBase = matchedName.toLowerCase();
            const matchedItem = imageItems.find((item) => {
              const name = String(item.fileName || "").trim();
              const base = name.split("/").pop() || name;
              return (
                name.toLowerCase() === matchedBase ||
                base.toLowerCase() === matchedBase
              );
            });
            if (matchedItem) {
              const texKey = String(matchedItem.s3Key || "").trim();
              const texName =
                String(matchedItem.fileName || matchedName).trim() ||
                matchedName;
              textureFile =
                (texKey && imageThumbFilesRef.current[texKey]) || null;
              if (!textureFile && texKey) {
                try {
                  const texBlob = await fetchS3BlobCached({
                    s3Key: texKey,
                    fileName: texName,
                    token: authToken,
                    buildUrl: buildS3ProxyDownloadUrl,
                    signal: ac.signal,
                  });
                  if (!ac.signal.aborted) {
                    textureFile = fileFromImageBlob(texBlob, texName);
                  }
                } catch {
                  textureFile = null;
                }
              }
            }
          }

          // 목록에 이미지가 없어도 PLY TextureFile이 같은 S3 폴더에 있으면 시도
          if (!textureFile && preferredTexture) {
            const siblingKey = siblingTextureS3Key(s3Key, preferredTexture);
            if (siblingKey && siblingKey !== s3Key) {
              try {
                const texBlob = await fetchS3BlobCached({
                  s3Key: siblingKey,
                  fileName: preferredTexture,
                  token: authToken,
                  buildUrl: buildS3ProxyDownloadUrl,
                  signal: ac.signal,
                });
                if (!ac.signal.aborted) {
                  textureFile = fileFromImageBlob(texBlob, preferredTexture);
                }
              } catch {
                // 텍스처 객체가 없으면 무시
              }
            }
          }

          if (!ac.signal.aborted) {
            setPreviewTextureFile(textureFile);
            setPreviewCompanionFiles(companionFiles);
          }
        }
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
        setPreviewTextureFile(null);
        setPreviewCompanionFiles([]);
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
    [authToken, collectImageThumbFiles, toast],
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
  const handlePrintDetail = useCallback(() => {
    printPracticeTransferDetail({
      title,
      summaryItems,
      toothWorks: toothWorks || [],
      memo,
    });
  }, [title, summaryItems, toothWorks, memo]);
  const hasPendingLabCustomAbutment = Boolean(
    toothWorks?.some(
      (work) =>
        Boolean(work.customAbutment) &&
        !isSimpleAbutmentModeForFee(work) &&
        isPendingRoundBarAbutment(work),
    ),
  );
  const hasAbutsCustomAbutment = Boolean(
    toothWorks?.some(
      (work) =>
        Boolean(work.customAbutment) &&
        !isSimpleAbutmentModeForFee(work) &&
        !isPendingRoundBarAbutment(work),
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
  const workFileDropActive = Boolean(
    workFileDrop && !workFileDrop.disabled && !minimized,
  );
  const chatFileDropActive = panelTab === "chat" && !inputDisabled && !minimized;
  const handleChatTabDropFiles = useCallback(
    (files: File[]) => {
      if (!files.length) return;
      if (workFileDropActive) {
        // 비STL·큰 STL 가드/다시 올리기는 부모 beginDesignUploadWithFiles SSOT
        workFileDrop!.onFiles(files);
        return;
      }
      onAttachChatFiles(files);
    },
    [onAttachChatFiles, workFileDrop, workFileDropActive],
  );
  const workFileDropGuideText = String(workFileDrop?.guideText || "").trim();
  const workFileDropGuideDetail = String(
    workFileDrop?.guideDetail || "",
  ).trim();
  const workFileDropUploadPercent =
    typeof workFileDrop?.uploadProgressPercent === "number" &&
    Number.isFinite(workFileDrop.uploadProgressPercent)
      ? Math.max(0, Math.min(100, Math.round(workFileDrop.uploadProgressPercent)))
      : null;
  const workFileDropUploadLabel = String(
    workFileDrop?.uploadProgressLabel || "",
  ).trim();
  const workFileDropUploading = workFileDropUploadPercent != null;
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
  const releaseButtonLabel = releaseBusy ? "취소 중..." : "작업 취소";
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
  const rejectButtonLabel = rejectBusy ? "거절 중..." : "거절";
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
        key={`${keyPrefix}:${busyKey || file.id || idx}`}
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
                companionFiles={imageCompanionFiles}
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
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent
        hideOverlay
        hideClose
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
        style={{
          position: "fixed",
          left: layout.x,
          top: layout.y,
          width: layout.w,
          height:
            panelTab === "detail" && !minimized && !maximized
              ? "auto"
              : layout.h,
          maxWidth: "none",
          maxHeight: layout.h,
          transform: "none",
          pointerEvents: "auto",
        }}
        className={cn(
          "pointer-events-auto relative flex flex-col gap-0 overflow-hidden rounded-lg border bg-background p-0 duration-0",
          guideTourElevate ? "z-[410]" : "z-[300]",
          "shadow-[0_4px_16px_rgba(15,23,42,0.18),0_18px_48px_rgba(15,23,42,0.32),0_40px_80px_-12px_rgba(15,23,42,0.28)]",
          "translate-x-0 translate-y-0",
          "w-auto max-w-none sm:w-auto sm:max-w-none sm:p-0",
          "data-[state=open]:animate-none data-[state=closed]:animate-none",
        )}
        data-guide-tour="lab_detail"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>

        <PracticeTransferFileDropTarget
          fileInputId={
            workFileDrop?.fileInputId || "practice-transfer-detail-noop-drop"
          }
          onFiles={workFileDrop?.onFiles ?? (() => {})}
          disabled={
            !workFileDrop ||
            workFileDrop.disabled ||
            minimized ||
            panelTab === "chat"
          }
          showDefaultUi={false}
          fillHeight
          accept={PRACTICE_TRANSFER_STL_ACCEPT}
          acceptedHint={workFileDrop?.dropHint || "어벗 STL"}
          filterFiles={(files) => files}
          className="flex min-h-0 flex-1 flex-col"
          activeClassName="ring-2 ring-inset ring-primary bg-primary-soft/25"
        >
          {({ isDragActive }) => (
            <>
              {isDragActive && workFileDropActive ? (
                <div
                  className="pointer-events-none absolute inset-0 z-[305] flex flex-col items-center justify-center gap-2 rounded-lg bg-primary/10 px-6 backdrop-blur-[2px]"
                  aria-hidden
                >
                  <div className="rounded-full bg-primary-soft p-3 text-primary-strong shadow-sm">
                    <UploadCloud className="h-8 w-8" />
                  </div>
                  <p className="text-sm font-semibold text-primary-strong">
                    파일을 놓아 업로드
                  </p>
                  <p className="text-center text-xs text-muted-foreground">
                    {workFileDrop?.dropHint || PRACTICE_ACCEPTED_HINT}
                  </p>
                </div>
              ) : null}

        <Tabs
          value={panelTab}
          onValueChange={handlePanelTabChange}
          className={cn(
            "flex min-h-0 flex-col overflow-hidden",
            panelTab === "chat" || minimized || maximized ? "flex-1" : "",
          )}
        >
          <div
            className={cn(
              "grid shrink-0 cursor-grab grid-cols-[1fr_auto] items-center gap-2 border-b px-3 active:cursor-grabbing",
              minimized ? "h-12 py-0" : "py-3.5",
            )}
            onPointerDown={handleChromePointerDown}
            onDoubleClick={(e) => {
              if (isMobile) return;
              const target = e.target as HTMLElement | null;
              if (target?.closest("button, [data-no-drag]")) return;
              toggleMaximize();
            }}
          >
            {minimized ? (
              <button
                type="button"
                className="min-w-0 truncate text-left text-sm font-medium text-foreground"
                onClick={() => minimize()}
                data-no-drag
              >
                {title}
              </button>
            ) : (
              <TabsList className="h-11 w-auto shrink-0 justify-self-start p-1">
                <TabsTrigger
                  value="detail"
                  className="gap-1.5 px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
                >
                  <FileIcon className="h-3.5 w-3.5" />
                  의뢰 상세
                </TabsTrigger>
                <TabsTrigger
                  value="chat"
                  className="gap-1.5 px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  진행 상황
                </TabsTrigger>
              </TabsList>
            )}
            <div
              className="flex shrink-0 items-center justify-end gap-1"
              data-no-drag
            >
              {!minimized ? chatHeaderAction : null}
              <button
                type="button"
                className={cn(
                  "inline-flex items-center justify-center rounded-md opacity-70 ring-offset-background transition-opacity hover:bg-slate-100 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                  isMobile ? "h-11 w-11" : "h-12 w-12",
                )}
                aria-label="닫기"
                title="닫기"
                onClick={() => onOpenChange(false)}
              >
                <X
                  className={isMobile ? "h-6 w-6" : "h-7 w-7"}
                  strokeWidth={2.25}
                />
                <span className="sr-only">Close</span>
              </button>
            </div>
          </div>

          {!minimized ? (
          <>
          <TabsContent
            value="detail"
            className="custom-scrollbar mt-0 max-h-[inherit] overflow-y-auto px-5 py-3 text-sm focus-visible:ring-0"
          >
            <div className="space-y-6">
              <section className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[13px] font-semibold text-foreground">
                    기본 정보
                  </h3>
                  {feeViewer === "lab" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 gap-1.5 px-2.5 text-xs"
                      title="의뢰 상세 인쇄 (A5)"
                      onClick={handlePrintDetail}
                    >
                      <Printer className="h-3.5 w-3.5" />
                      프린트
                    </Button>
                  ) : null}
                </div>
                <dl className="divide-y divide-border/70">
                  {summaryItems.map((row, idx) => {
                    const isArrivalRow =
                      row.label === "치과도착일" || row.label === "재도착일";
                    const valueNode = (
                      <p
                        className={cn(
                          "text-sm font-medium leading-snug break-words text-foreground",
                          row.valueClassName,
                        )}
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
                      <div
                        key={`${row.label}:${idx}`}
                        className="grid grid-cols-[6.75rem_minmax(0,1fr)] items-start gap-x-3 py-2 sm:grid-cols-[7.5rem_minmax(0,1fr)]"
                      >
                        <dt className="pt-0.5 text-[13px] leading-snug text-muted-foreground">
                          {row.label}
                        </dt>
                        <dd className="min-w-0">
                          {row.action ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {valueWithAction}
                              {row.action}
                            </div>
                          ) : (
                            valueWithAction
                          )}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </section>

              {summaryBanner ? (
                <div>{summaryBanner}</div>
              ) : null}

              {hasToothWorks ? (
                <section className="space-y-2.5 border-t border-border/70 pt-5">
                  <h3 className="text-[13px] font-semibold text-foreground">
                    치식 · 보철물
                  </h3>
                  <PracticeToothWorkChartReadOnly
                    key={toothWorksKey || "tooth-works"}
                    toothWorks={toothWorks}
                    feeQuote={feeQuote}
                    feeViewer={feeViewer}
                    labAnchorId={labAnchorId}
                    skipJig={skipJig}
                    labEffectiveStars={labEffectiveStars}
                  />
                </section>
              ) : null}

              <section className="space-y-2.5 border-t border-border/70 pt-5">
                <h3 className="text-[13px] font-semibold text-foreground">
                  의뢰 메모
                </h3>
                <p className="custom-scrollbar max-h-48 overflow-y-auto rounded-md bg-muted/40 px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground">
                  {memo || "-"}
                </p>
              </section>

              <section className="space-y-2.5 border-t border-border/70 pt-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[13px] font-semibold text-foreground">
                    {filesLabel}{" "}
                    <span className="font-normal text-muted-foreground">
                      ({files.length}개)
                    </span>
                  </h3>
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
                  <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-200">
                    {requestFilesDownloadLockedReason}
                  </p>
                ) : null}
                {files.length ? (
                  <div className="custom-scrollbar max-h-64 overflow-y-auto pr-1">
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
                  <p className="text-sm leading-relaxed text-destructive">
                    {ORAL_SCAN_REQUIRED_FROM_PRACTICE}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">파일 없음</p>
                )}
              </section>

              {showWorkFilesSection ? (
                <section className="space-y-3 border-t border-border/70 pt-5">
                  <h3 className="text-[13px] font-semibold text-foreground">
                    {workFilesLabel}
                  </h3>
                  {designFileList.length > 0 ? (
                    <div className="space-y-1.5">
                      <p className="text-[13px] text-muted-foreground">
                        {designFilesLabel}{" "}
                        <span>({designFileList.length}개)</span>
                      </p>
                      <div className="custom-scrollbar max-h-64 overflow-y-auto pr-1">
                        <div className="grid grid-cols-4 gap-2">
                          {designFileList.map((file, idx) =>
                            renderFileTile(file, idx, "design"),
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {resultFileList.length > 0 ? (
                    <div className="space-y-1.5">
                      <p className="text-[13px] text-muted-foreground">
                        {resultFilesLabel}{" "}
                        <span>({resultFileList.length}개)</span>
                      </p>
                      <div className="custom-scrollbar max-h-64 overflow-y-auto pr-1">
                        <div className="grid grid-cols-4 gap-2">
                          {resultFileList.map((file, idx) =>
                            renderFileTile(file, idx, "result"),
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </section>
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
          </TabsContent>

          <TabsContent
            value="chat"
            className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden focus-visible:ring-0"
          >
            <PracticeTransferFileDropTarget
              fileInputId="practice-transfer-chat-attach-drop"
              onFiles={handleChatTabDropFiles}
              disabled={!chatFileDropActive}
              showDefaultUi={false}
              filterFiles={(files) => files}
              fillHeight
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
              activeClassName="ring-2 ring-inset ring-primary bg-primary-soft/25"
            >
              {({ isDragActive: chatDragActive }) => (
                <>
              {chatDragActive && chatFileDropActive ? (
                <div
                  className="pointer-events-none absolute inset-0 z-[305] flex flex-col items-center justify-center gap-2 rounded-lg bg-primary/10 px-6 backdrop-blur-[2px]"
                  aria-hidden
                >
                  <div className="rounded-full bg-primary-soft p-3 text-primary-strong shadow-sm">
                    <UploadCloud className="h-8 w-8" />
                  </div>
                  <p className="text-sm font-semibold text-primary-strong">
                    {workFileDropActive
                      ? "파일을 놓아 업로드"
                      : "사진·파일을 놓아 첨부"}
                  </p>
                  <p className="text-center text-xs text-muted-foreground">
                    {workFileDropActive
                      ? "STL 파일만 작업 업로드"
                      : "채팅에 보낼 파일을 여기에 놓으세요"}
                  </p>
                </div>
              ) : null}

              {counterpartyMemoStrip}

              {summaryBanner ? (
                <div className="shrink-0 border-b px-5 py-2">{summaryBanner}</div>
              ) : null}

              {onEditRequest || onCancelRequest ? (
                <div className="flex shrink-0 flex-wrap justify-end gap-2 border-b bg-muted/40 px-5 py-2">
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

              {showAcceptBar ? (
                <div
                  className="shrink-0 border-b bg-muted/40 px-5 py-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                  data-guide-tour="lab_accept"
                >
                  {hasPendingLabCustomAbutment ||
                  hasAbutsCustomAbutment ||
                  oralScanAttachMode === "practice_required" ? (
                    <div className="space-y-1">
                      {hasPendingLabCustomAbutment ||
                      hasAbutsCustomAbutment ? (
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
                        className={cn(
                          "border-destructive-muted text-destructive hover:bg-destructive-soft hover:text-destructive",
                          guideTourPulseAcceptActions &&
                            "practice-tooth-guide-pulse",
                        )}
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
                      className={cn(
                        guideTourPulseAcceptActions &&
                          "practice-tooth-guide-pulse",
                      )}
                      onClick={() => void onAccept?.()}
                      disabled={acceptDisabled}
                    >
                      {acceptButtonLabel}
                    </Button>
                  </div>
                </div>
              ) : null}

              {showReacceptBar ? (
                <div className="shrink-0 border-b bg-muted/40 px-5 py-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
                <div className="shrink-0 border-b bg-muted/40 px-5 py-2 flex flex-col gap-1.5">
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
                <div className="shrink-0 border-b bg-muted/40 px-5 py-2">
                  {resolvedAcceptedWorkActions}
                </div>
              ) : null}

              <div
                className="grid min-h-0 min-w-0 flex-1 grid-rows-[minmax(0,1fr)_auto] overflow-hidden"
                data-guide-tour="lab_chat"
              >
                <div
                  className={cn(
                    "relative flex min-h-0 min-w-0 flex-col",
                    workFileDropActive &&
                      "m-2 rounded-md border-2 border-dashed border-primary/45 bg-primary/[0.03]",
                  )}
                  {...(workFileDropActive
                    ? { "data-guide-tour": "lab_design" }
                    : {})}
                >
                  {workFileDropUploading ? (
                    <div
                      className="pointer-events-none z-[2] shrink-0 border-b border-primary/25 bg-primary px-5 py-2.5 text-primary-foreground"
                      role="status"
                      aria-live="polite"
                    >
                      <div className="mx-auto flex w-full max-w-sm flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate font-medium">
                            {workFileDropUploadLabel || "업로드 중…"}
                          </span>
                          <span className="shrink-0 tabular-nums opacity-90">
                            {workFileDropUploadPercent}%
                          </span>
                        </div>
                        <Progress
                          value={workFileDropUploadPercent}
                          className="h-1.5 bg-primary-foreground/25 [&>div]:bg-primary-foreground"
                        />
                      </div>
                    </div>
                  ) : workFileDropGuideText &&
                    !chatLoading &&
                    !visibleChatError ? (
                    <button
                      type="button"
                      disabled={
                        !workFileDropActive || Boolean(workFileDrop?.disabled)
                      }
                      onClick={() => {
                        if (
                          !workFileDropActive ||
                          workFileDrop?.disabled ||
                          !workFileDrop
                        ) {
                          return;
                        }
                        void (async () => {
                          const files = await pickPracticeTransferFilesViaInput({
                            accept: PRACTICE_TRANSFER_STL_ACCEPT,
                            multiple: true,
                          });
                          if (files.length) workFileDrop.onFiles(files);
                        })();
                      }}
                      className={cn(
                        "z-[2] w-full shrink-0 bg-primary px-5 py-2.5 text-center text-primary-foreground transition-opacity",
                        workFileDropActive && !workFileDrop?.disabled
                          ? "cursor-pointer hover:opacity-95"
                          : "pointer-events-none opacity-80",
                      )}
                    >
                      <p className="text-sm font-semibold leading-snug">
                        {workFileDropGuideText}
                      </p>
                      {workFileDropGuideDetail ? (
                        <p className="mt-0.5 text-xs leading-snug text-primary-foreground/85">
                          {workFileDropGuideDetail}
                        </p>
                      ) : null}
                    </button>
                  ) : null}

                  <div
                    className={cn(
                      "custom-scrollbar relative z-[1] min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain transition-opacity",
                      workFileDropActive &&
                        !workFileDropUploading &&
                        "opacity-45",
                    )}
                  >
                    <div className="w-full min-w-0 max-w-full space-y-2 px-5 py-2">
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
                        <div className="py-4 text-center text-sm text-muted-foreground">
                          아직 메시지가 없습니다.
                        </div>
                      ) : null}

                      {chatMessages.map((message) => {
                        const senderId = String(
                          message.sender?._id || "",
                        ).trim();
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
                            reactionUserNameById={reactionUserNameById}
                            practiceTransferLabAnchorId={labAnchorId}
                            practiceTransferProsthesisFollowUps={prosthesisFollowUps}
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

                      {prosthesisFollowUpPending &&
                      (onCancelProsthesisFollowUp || onModifyProsthesisFollowUp) &&
                      !chatLoading &&
                      !visibleChatError ? (
                        <div className="relative z-[2] mt-2 flex shrink-0 flex-wrap items-center justify-center gap-2 px-1">
                          {onModifyProsthesisFollowUp ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-9 bg-background px-4"
                              disabled={
                                modifyProsthesisFollowUpBusy ||
                                cancelProsthesisFollowUpBusy
                              }
                              onClick={() => onModifyProsthesisFollowUp()}
                            >
                              {modifyProsthesisFollowUpBusy ? "변경 중…" : "제작 변경"}
                            </Button>
                          ) : null}
                          {onCancelProsthesisFollowUp ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-9 border-destructive/40 px-4 text-destructive hover:bg-destructive/5"
                              disabled={
                                cancelProsthesisFollowUpBusy ||
                                modifyProsthesisFollowUpBusy
                              }
                              onClick={() => onCancelProsthesisFollowUp()}
                            >
                              {cancelProsthesisFollowUpBusy ? "취소 중…" : "제작 취소"}
                            </Button>
                          ) : null}
                        </div>
                      ) : null}

                      {onAppendProsthesis &&
                      !prosthesisFollowUpPending &&
                      !chatLoading &&
                      !visibleChatError ? (
                        <div className="relative z-[2] mt-2 flex shrink-0 flex-col items-center gap-1.5 px-1">
                          <Button
                            type="button"
                            size="sm"
                            className={cn(
                              "h-9 px-5",
                              appendProsthesisDisabled || appendProsthesisBusy
                                ? "cursor-not-allowed opacity-70"
                                : "",
                            )}
                            disabled={appendProsthesisBusy || appendProsthesisDisabled}
                            title={appendProsthesisHint || undefined}
                            onClick={() => onAppendProsthesis()}
                          >
                            {appendProsthesisBusy ? "처리 중…" : "최종 보철 제작"}
                          </Button>
                          {appendProsthesisHint && appendProsthesisDisabled ? (
                            <p className="max-w-full text-center text-xs leading-snug text-muted-foreground">
                              {appendProsthesisHint}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      <div ref={chatBottomRef} />
                    </div>
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
                    compact
                  />
                </div>
              </div>
                </>
              )}
            </PracticeTransferFileDropTarget>
          </TabsContent>
          </>
          ) : null}
        </Tabs>

        {!minimized && !maximized && !isMobile ? (
          <>
            <div
              data-no-drag
              className="absolute left-3 right-3 top-0 z-30 h-3 cursor-ns-resize touch-none"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                beginResize("n", e.clientX, e.clientY);
              }}
            />
            <div
              data-no-drag
              className="absolute bottom-0 left-3 right-3 z-30 h-3 cursor-ns-resize touch-none"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                beginResize("s", e.clientX, e.clientY);
              }}
            />
            <div
              data-no-drag
              className="absolute bottom-3 left-0 top-3 z-30 w-3 cursor-ew-resize touch-none"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                beginResize("w", e.clientX, e.clientY);
              }}
            />
            <div
              data-no-drag
              className="absolute bottom-3 right-0 top-3 z-30 w-3 cursor-ew-resize touch-none"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                beginResize("e", e.clientX, e.clientY);
              }}
            />
            <div
              data-no-drag
              className="absolute left-0 top-0 z-40 h-4 w-4 cursor-nwse-resize touch-none"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                beginResize("nw", e.clientX, e.clientY);
              }}
            />
            <div
              data-no-drag
              className="absolute right-0 top-0 z-40 h-4 w-4 cursor-nesw-resize touch-none"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                beginResize("ne", e.clientX, e.clientY);
              }}
            />
            <div
              data-no-drag
              className="absolute bottom-0 left-0 z-40 h-4 w-4 cursor-nesw-resize touch-none"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                beginResize("sw", e.clientX, e.clientY);
              }}
            />
            <div
              data-no-drag
              className="absolute bottom-0 right-0 z-40 h-4 w-4 cursor-nwse-resize touch-none"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                beginResize("se", e.clientX, e.clientY);
              }}
            />
          </>
        ) : null}
            </>
          )}
        </PracticeTransferFileDropTarget>
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
      textureFile={previewTextureFile}
      companionFiles={previewCompanionFiles}
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

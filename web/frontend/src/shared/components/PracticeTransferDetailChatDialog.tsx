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
// - web/frontend/src/shared/files/fileBlobCache.ts
// - web/frontend/src/shared/files/s3ImageThumb.ts
// - web/frontend/src/features/requests/components/StlPreviewThumbnail.tsx
// - 2026-09-13: 3D 타일 선다운로드 유지 — IndexedDB 디스크 캐시(~2GB LRU)로 재방문 히트.
// - 2026-09-13: 이미지 첨부 — 의뢰 파일 vs 채팅 선택. 3D만 의뢰 파일 자동. 채팅 버블은 3D만 숨김.
// - 2026-09-12: 의뢰·작업 파일 타일 썸네일 — aspect-square → 2:1(세로 약 절반).
// - 2026-09-12: 의뢰 파일 삭제→휴지통. 썸네일 끝 휴지통+카운터·복원.
// - 2026-09-12: 휴지통 팝오버 — 전체 복원(s3Keys 일괄).
// - 2026-09-12: 의뢰 파일 — 업로드 웨이브(첫/두 번째/…) 클러스터.
// - 2026-09-12: 드롭·클립 — 3D→의뢰 파일, 이미지→선택, 그 외→채팅. 의뢰 파일 타일 X 삭제.
// - 2026-09-12: 별·알림음 — 환자·치아번호 줄 오른쪽.
// - 2026-09-12: 별·알림음 — 채팅 툴바 → 주문/도착 줄 오른쪽.
// - 2026-09-12: 채팅 없으면 초기 스크롤=보철물(상단). 전환·빈 목록 시 하단 고정 금지.
// - 2026-09-11: 어벗 STL — 인라인 파란 배너 제거. 페이지 전체 드롭 + 작업취소 옆 업로드 버튼.
// - 2026-09-11: inline 패널 — 닫기(X) 숨김. 주문/도착은 타이틀 아래 고정(작업시작 바에서 제거).
// - 2026-09-11: 작업시작 바 — 작업+배송기간 제거, 주문/도착을 버튼 왼쪽에.
// - 2026-09-11: inline 미선택 — 빈 안내 카드(패널은 항상 표시).
// - 2026-09-11: variant=inline — 작업영역 오른쪽 고정 카드(검색 아래·달력/목록 옆).
// - 2026-09-11: 진행(메시지) min-h-full 복원 — 주문/도착 아래 뷰포트를 채움.
// - 2026-09-11: 오른쪽 사이드 패널(풀하이트). 상단 크롬 제거·알림음→채팅 툴바·닫기는 식별 줄.
// - 2026-09-11: 헤더「의뢰 · 진행」라벨 제거, 치식·보철물 카드 복원.
// - 2026-09-11: 메모·평가 → 채팅 # 옆 아이콘(composerToolbarExtra).
// - 2026-09-11: 채팅 min-height에 식별·기공소 메모/평가 크롬 높이 합산.
// - 2026-09-11: 의뢰 라벨·치식 제거, 파일 내부 스크롤 폐지, 진행 영역 viewport 높이.
// - 2026-09-11: 의뢰 핵심/상세 정보 제거 — 주문일은 상단 도착일 옆에 표시.
// - 2026-09-11: 의뢰/진행 탭 제거 — 단일 스크롤(의뢰↑·진행↓), 점프 버튼, 채팅 유무로 초기 위치.
// - 2026-09-11: 어벗 가공 시작 시 「작업 취소」CTA 숨김(카드와 동일). 클릭 판정만 의존하지 않음.
// - 2026-09-10: chatHeaderAction — 탭 행 → 환자/도착일 식별 스트립 오른쪽.
// - 2026-09-10: 드롭존 활성 시 채팅 opacity 45→80(가독성).
// - 2026-09-10: 리메이크 청구 채팅 카드 「청구 취소」.
// - 2026-09-08: DialogDescription sr-only — Radix DescriptionWarning 제거.
// - 2026-09-08: 탭 라벨 의뢰/진행. 식별=이름, 진행 헤더=도착일+다음 도착일. 알림=전체 토글.
// - 2026-09-08: preferredDockSide — 캘린더 칩 열 위치에 맞춰 좌/우 도킹.
// - 2026-09-08: 헤더 < > — 패널을 화면 왼쪽/오른쪽 끝에 도킹.
// - 2026-09-08: 담당자·작업+배송기간 → 상세 정보(접기)로 이동.
// - 2026-09-07: UX — 의뢰상세 핵심만·상세 접기, 진행상황 다음공정 칩·크롬 압축.
// - 2026-09-07: 다단계 도착일 당일·지연 시 「다음 도착일」깜빡임 + 호버 안내.
// - 2026-09-07: 진행 상황 탭에도 재도착일 CTA(모든 케이스). 틀니 등은 다음 공정 표시.
// - 2026-09-07: 채팅 알림음 메뉴 + 진행 상황 탭 열람 시 알림음 스킵.
// - 2026-09-07: 패널 공통 헤더 — 치과/환자 식별 스트립(탭 아래 고정, caseIdentity·summaryItems).
// - 2026-09-07: 식별 스트립 한 줄 — 전송ID 제거, `치과/환자 치식 · 도착 YYYY-MM-DD`.
// - 2026-09-07: lab_accept — 거절 버튼 제거. CTA 「수락」→「작업시작」. 가입 이전 리메이크 안내.
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
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Box,
  CalendarClock,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  FileIcon,
  MoreHorizontal,
  Pencil,
  Printer,
  RotateCcw,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/shared/ui/cn";
import { toKstYmd, ymdToKstDate } from "@/shared/date/kst";
import { type ChatMessage } from "@/shared/hooks/useChatRooms";
import {
  ChatSoundGlobalToggle,
  useRegisterChatSoundViewing,
} from "@/shared/chat/ChatSoundControls";
import { ChatComposer, type RequestPickItem } from "@/features/chat/components/ChatComposer";
import { ChatMessageBubble } from "@/features/chat/components/ChatMessageBubble";
import { buildChatReactionUserNameById } from "@/features/chat/components/chatReactions";
import { type ReplyToMessage } from "@/features/chat/components/MessageReply";
import { PracticeToothWorkChartReadOnly } from "@/shared/components/practice/PracticeToothWorkChartReadOnly";
import { PracticeRemakeChargesStrip } from "@/shared/components/practice/PracticeRemakeChargesStrip";
import {
  CalendarLabColorDot,
  calendarGroupDotColor,
  type CalendarLabDotStyle,
} from "@/pages/practice/components/PracticeRecentTransfersCalendar";
import { usePracticeTransferPanelLayout } from "@/shared/components/practice/usePracticeTransferPanelLayout";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import {
  formatToothNumbersForCard,
  type ToothWorkSelection,
} from "@/shared/practice/transferMemo";
import { toothArchFromNumber } from "@/shared/practice/labFeeSchedule";
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
  isDcmFileName,
  type DcmDownloadFormat,
} from "@/shared/files/dcmDownloadFormat";
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
import { LAB_RECEIVE_ABUTMENT_UPLOAD_HINT } from "@/shared/components/practice/PracticeLabReceiveWorkActionsBar";
import {
  getPracticeTransferFileExtension,
  isPracticeTransferModelFileName,
  partitionDetailAttachFiles,
  partitionLabChatDropFiles,
  PRACTICE_TRANSFER_IMAGE_EXTENSIONS,
  PRACTICE_TRANSFER_STL_ACCEPT,
} from "@/shared/practice/practiceTransferAccept";
import {
  clusterPracticeTransferFileWaves,
  formatPracticeUploadWaveTime,
} from "@/shared/practice/practiceTransferFileWaves";
import {
  PracticeTransferFileDropTarget,
} from "@/shared/components/practice/PracticeTransferFileDropTarget";
import {
  dataTransferHasFiles,
  extractDroppedFiles,
} from "@/shared/files/extractDroppedFiles";
import { printPracticeTransferDetail } from "@/shared/practice/practiceTransferDetailPrint";
import {
  nextStageOfPlan,
  normalizeLabRequestStagePlans,
  type PracticeLabRequestStagePlan,
} from "@/shared/practice/requestStagePresets";
import {
  getPracticeNextArrivalReminderTooltip,
  isPracticeNextArrivalAttention,
  practiceNextArrivalAttentionClassName,
  resolvePracticeNextArrivalReminder,
} from "@/shared/practice/practiceNextArrivalReminder";

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

function summaryItemValue(
  items: PracticeTransferDialogSummaryItem[],
  label: string,
): string {
  const raw = String(
    items.find((row) => row.label === label)?.value || "",
  ).trim();
  return raw && raw !== "-" ? raw : "";
}

function formatPracticeTransferIdentityDateLabel(opts: {
  orderYmd?: string | null;
  arrivalYmd?: string | null;
  shipYmd?: string | null;
}): string {
  const order = String(opts.orderYmd || "").trim();
  const arrival = String(opts.arrivalYmd || "").trim();
  const ship = String(opts.shipYmd || "").trim();
  const parts: string[] = [];
  if (order) parts.push(`주문 ${order}`);
  if (arrival) parts.push(`도착 ${arrival}`);
  else if (ship) parts.push(`출고 ${ship}`);
  return parts.join(" · ");
}

export type PracticeTransferDialogFileItem = {
  id: string;
  fileName: string;
  size: number;
  s3Key: string;
  uploadBatchId?: string | null;
  uploadedAt?: string | null;
  trashedAt?: string | null;
};

/** 기공의뢰수신 — 수락 후 페이지 전체 파일 드롭(카드와 동일 라우팅) */
export type PracticeTransferWorkFileDropConfig = {
  fileInputId: string;
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  /** @deprecated 인라인 파란 배너 제거 — 호환용 유지 */
  guideText: string;
  /** @deprecated 인라인 파란 배너 제거 — 호환용 유지 */
  guideDetail?: string;
  /** 드래그 오버레이 부제. 미지정 시 PRACTICE_ACCEPTED_HINT */
  dropHint?: string;
  /** 드롭/파일오픈 직후 S3 사전업로드·제출 진행률(0~100) */
  uploadProgressPercent?: number | null;
  /** 예: 업로드 중… 45% / 처리 중… */
  uploadProgressLabel?: string | null;
};

export type PracticeTransferDialogCaseIdentity = {
  /** 예: 테스트기공소 / 테스트환자 15 */
  primary: string;
  /** 예: 주문 2026-09-10 · 도착 2026-09-13 — 다음 도착일과 한 줄 */
  secondary?: string;
  /** 캘린더 목록 점과 동일 — 기공소(또는 치과) 구분 키 */
  colorKey?: string | null;
  /** 무지개 순번 배정 색. 있으면 colorKey 해시보다 우선 */
  dotColor?: string | null;
  /** 채움 / 빈 원 / 이중 외곽선 */
  dotStyle?: CalendarLabDotStyle | null;
};

/** 의뢰·작업 파일 타일 썸네일 — 정사각 대비 세로 약 절반 */
const FILE_TILE_THUMB_ASPECT_CLASS = "aspect-[2/1]";

type PracticeTransferDetailChatDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  conversationTitle: string;
  /** S3 프록시 미리보기용 JWT */
  authToken?: string | null;
  /** 환자/도착일 식별 스트립 오른쪽(예: 기공소 리메이크 청구) */
  chatHeaderAction?: ReactNode;
  /** 채팅 헤더 바로 아래 — 상대방 내부 메모 (레거시·미사용 권장) */
  counterpartyMemoStrip?: ReactNode;
  /** 환자·치아번호 줄 오른쪽 — 메모·평가 아이콘 */
  composerToolbarExtra?: ReactNode;
  /**
   * 식별 줄(치과·환자 등). 있으면 summaryItems 파싱보다 우선.
   */
  caseIdentity?: PracticeTransferDialogCaseIdentity | null;
  /** 의뢰 요약 아래·진행 상단 공통 — 예: 어벗 업로드 지연, 미가입 초대 */
  summaryBanner?: ReactNode;
  /**
   * 기공소 작업시작 바 왼쪽 안내(예: 플랫폼 가입 이전 리메이크 확인).
   * 어벗/구강스캔 안내와 함께 표시된다.
   */
  acceptBarHint?: ReactNode;
  summaryItems: PracticeTransferDialogSummaryItem[];
  memo: string;
  /** 보철물 치식 차트(읽기 전용). 있으면 의뢰 메모 위에 표시 */
  toothWorks?: ToothWorkSelection[];
  toothWorksKey?: string;
  feeQuote?: PracticeTransferFeeQuote | null;
  /** 동일 PTX 리메이크 청구 이력(치과·기공소 인지) */
  remakeCharges?: import("@/shared/practice/practiceTransferLabReceive").PracticeTransferRemakeCharge[] | null;
  skipJig?: boolean;
  feeViewer?: PracticeTransferFeeQuoteViewer;
  /**
   * 열릴 때 스크롤 위치 힌트. detail=맨 위(의뢰), chat=맨 아래(진행).
   * 미지정 시 채팅 내역이 있으면 아래, 없으면 위.
   */
  initialPanelTab?: "detail" | "chat";
  labAnchorId?: string | null;
  /** 기공소 뷰 — 자동매칭 기공비 별점 확정가 */
  labEffectiveStars?: number | null;
  /** 예: 의뢰 파일 */
  filesLabel: string;
  files: PracticeTransferDialogFileItem[];
  /** 의뢰 파일 휴지통 */
  trashedFiles?: PracticeTransferDialogFileItem[];
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
  onDownloadAllFiles: (opts?: {
    dcmFormat?: DcmDownloadFormat;
  }) => void | Promise<void>;
  onDownloadTransferFile: (
    file: PracticeTransferDialogFileItem,
    opts?: { dcmFormat?: DcmDownloadFormat },
  ) => void | Promise<void>;
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
  /** 비어벗 도착일 도래 등 — 작업취소 CTA 숨김 */
  workCancelBlocked?: boolean;
  /** 레거시: 자동매칭 남은시간 라벨(강제 클레임 만료 폐기 후 미사용) */
  remainingLabel?: string | null;
  onAccept?: () => void | Promise<void>;
  /** @deprecated 거절 CTA 제거(2026-09-07). 호환용으로 남겨 둠 */
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
  /** 채팅 알림음 음소거/열람 등록용 roomId */
  chatRoomId?: string | null;
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
  /**
   * 3D → 의뢰 파일(자동). 이미지 → 의뢰 파일 vs 채팅 선택.
   * 있으면 드롭/클립/카메라가 포맷별로 분기. 없으면 기존처럼 전부 채팅 첨부.
   */
  onAttachRequestFiles?: (files: File[]) => void;
  /** 의뢰 파일 타일 X — s3Key로 휴지통 이동 */
  onRemoveRequestFile?: (file: PracticeTransferDialogFileItem) => void | Promise<void>;
  /** 휴지통 → 의뢰 파일 복원 */
  onRestoreRequestFile?: (file: PracticeTransferDialogFileItem) => void | Promise<void>;
  /** 휴지통 전체 복원(한 요청) */
  onRestoreAllRequestFiles?: () => void | Promise<void>;
  /** 의뢰 파일 업로드 중(타일 그리드에 표시) */
  requestFilePendingUploads?: BackgroundUploadItem[];
  onRemovePendingRequestFile?: (id: string) => void;
  onRetryPendingRequestFile?: (id: string) => void;
  /** 삭제/복원 중 s3Key — X·복원 비활성 */
  removingRequestFileKeys?: string[];
  restoringRequestFileKeys?: string[];
  chatDraft: string;
  onChangeChatDraft: (value: string) => void;
  onSendChatMessage: () => void | Promise<void>;
  replyTo?: ReplyToMessage | null;
  onReplyToMessage?: (message: ChatMessage) => void;
  onCancelReply?: () => void;
  onToggleReaction?: (messageId: string, emoji: string) => void | Promise<void>;
  onDeleteMessage?: (messageId: string) => void | Promise<void>;
  composerPlaceholder: string;
  inputDisabled: boolean;
  /** $ 로 삽입할 의뢰건 목록 */
  requestPicks?: RequestPickItem[];
  requestPicksLoading?: boolean;
  onRequestPicksNeeded?: () => void;
  /** 채팅 본문 의뢰ID 클릭 → 해당 의뢰 작업현황 */
  onOpenRequestId?: (requestId: string) => void;
  /** 전송 중(ChatComposer isSending). 빈 draft 차단은 Composer가 처리 */
  sendDisabled?: boolean;
  /** 치과: 수락 전 의뢰 내용을 작성 폼으로 불러와 수정 */
  onEditRequest?: () => void;
  editRequestDisabled?: boolean;
  /** 치과: 쉐이드 변경 등 — 동일 건 재도착일(오늘 이후 1개·교체, 과금 없음). 선택 YMD 전달 */
  onAppendArrival?: (arrivalYmd: string) => void;
  appendArrivalDisabled?: boolean;
  appendArrivalBusy?: boolean;
  /**
   * 틀니 등 다단계 플랜. 있으면 진행 상황 탭 재도착일 옆에 다음 공정 표시.
   * 재도착 반영 시 서버가 currentIndex를 올림.
   */
  labRequestStagePlans?: PracticeLabRequestStagePlan[] | null;
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
  /** 기공소 — 리메이크 청구 채팅 카드 「청구 취소」 */
  onCancelRemakeCharge?: (chargeIndex: number | null) => void;
  remakeChargeCancelBusy?: boolean;
  /** 치과: 수락 전·작업취소 건을 휴지통으로 */
  onCancelRequest?: () => void;
  cancelRequestDisabled?: boolean;
  /** 가이드투어 — Dialog z-[410](블러 아래) */
  guideTourElevate?: boolean;
  /**
   * floating — 플로팅 Dialog(모바일 기본).
   * inline — 작업영역 오른쪽 컬럼 카드(데스크톱·달력/목록 옆).
   */
  variant?: "floating" | "inline";
  /**
   * 캘린더 칩 등에서 열 때 아이템을 가리지 않도록 좌/우 도킹.
   * 미지정 시 직전 저장 레이아웃 유지. preferredDockNonce가 바뀌면 재도킹.
   * variant=inline 에서는 무시.
   */
  preferredDockSide?: "left" | "right" | null;
  preferredDockNonce?: number;
};

export function PracticeTransferDetailChatDialog({
  open,
  onOpenChange,
  title,
  conversationTitle: _conversationTitle,
  authToken = null,
  chatHeaderAction = null,
  counterpartyMemoStrip: _counterpartyMemoStrip = null,
  composerToolbarExtra = null,
  caseIdentity = null,
  summaryBanner = null,
  acceptBarHint = null,
  summaryItems,
  memo,
  toothWorks,
  toothWorksKey,
  feeQuote = null,
  remakeCharges = null,
  skipJig = false,
  feeViewer = "practice",
  initialPanelTab,
  labAnchorId = null,
  labEffectiveStars = null,
  filesLabel,
  files,
  trashedFiles = [],
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
  abutmentMachiningStarted = false,
  workCancelBlocked = false,
  onAccept,
  rejectBusy: _rejectBusy = false,
  onReject: _onReject,
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
  chatRoomId = null,
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
  onAttachRequestFiles,
  onRemoveRequestFile,
  onRestoreRequestFile,
  onRestoreAllRequestFiles,
  requestFilePendingUploads = [],
  onRemovePendingRequestFile,
  onRetryPendingRequestFile,
  removingRequestFileKeys = [],
  restoringRequestFileKeys = [],
  chatDraft,
  onChangeChatDraft,
  onSendChatMessage,
  replyTo,
  onReplyToMessage,
  onCancelReply,
  onToggleReaction,
  onDeleteMessage,
  composerPlaceholder,
  inputDisabled,
  requestPicks,
  requestPicksLoading = false,
  onRequestPicksNeeded,
  onOpenRequestId,
  sendDisabled = false,
  onEditRequest,
  editRequestDisabled = false,
  onAppendArrival,
  appendArrivalDisabled = false,
  appendArrivalBusy = false,
  labRequestStagePlans = null,
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
  onCancelRemakeCharge,
  remakeChargeCancelBusy = false,
  onCancelRequest,
  cancelRequestDisabled = false,
  guideTourElevate = false,
  variant = "floating",
  preferredDockSide = null,
  preferredDockNonce = 0,
}: PracticeTransferDetailChatDialogProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const isInline = variant === "inline";
  const platformGuideTour = useGuideTour();
  /** 수신 투어 lab_accept — 작업시작 CTA 깜빡임(모달 전체 홀은 Spotlight lab_detail) */
  const guideTourPulseAcceptActions =
    platformGuideTour.kind === "lab" &&
    platformGuideTour.active &&
    platformGuideTour.stepId === "lab_accept";
  const {
    layout,
    minimized,
    maximized,
    beginResize,
    dockRight,
  } = usePracticeTransferPanelLayout();
  const resolvedInitialPanelTab: "detail" | "chat" | null =
    initialPanelTab === "detail" || initialPanelTab === "chat"
      ? initialPanelTab
      : null;
  const [rearrivalOpen, setRearrivalOpen] = useState(false);
  const [rearrivalDraft, setRearrivalDraft] = useState<Date | undefined>(undefined);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [scrollEdge, setScrollEdge] = useState<"top" | "bottom" | "middle">("top");
  const scrollBodyRef = useRef<HTMLDivElement | null>(null);
  const didInitialScrollRef = useRef(false);
  const openedWithoutMessagesRef = useRef(false);
  const scrollIdentityRef = useRef<string>("");
  const scrollIdentity = String(toothWorksKey || caseIdentity?.primary || "").trim();

  useEffect(() => {
    if (!open || isMobile || isInline) return;
    // floating — 오른쪽 사이드 패널
    dockRight();
  }, [open, isMobile, isInline, preferredDockSide, preferredDockNonce, dockRight]);

  const updateScrollEdge = useCallback(() => {
    const el = scrollBodyRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const maxScroll = Math.max(0, scrollHeight - clientHeight);
    if (maxScroll < 48) {
      setScrollEdge("middle");
      return;
    }
    const nearTop = scrollTop <= 56;
    const nearBottom = scrollTop >= maxScroll - 56;
    if (nearTop && !nearBottom) setScrollEdge("top");
    else if (nearBottom) setScrollEdge("bottom");
    else setScrollEdge("middle");
  }, []);

  useLayoutEffect(() => {
    if (!open || minimized) return;
    const scrollEl = scrollBodyRef.current;
    if (!scrollEl) return;
    const onResize = () => updateScrollEdge();
    onResize();
    const ro = new ResizeObserver(onResize);
    ro.observe(scrollEl);
    return () => ro.disconnect();
  }, [open, minimized, updateScrollEdge]);

  const scrollToDetailTop = useCallback(() => {
    scrollBodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const scrollToProgressBottom = useCallback(() => {
    const el = scrollBodyRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  const applyScrollPosition = useCallback((preferBottom: boolean) => {
    const el = scrollBodyRef.current;
    if (!el) return;
    if (preferBottom) {
      el.scrollTop = el.scrollHeight;
    } else {
      el.scrollTop = 0;
    }
    const { scrollTop, scrollHeight, clientHeight } = el;
    const maxScroll = Math.max(0, scrollHeight - clientHeight);
    if (maxScroll < 48) {
      setScrollEdge("middle");
      return;
    }
    const nearTop = scrollTop <= 56;
    const nearBottom = scrollTop >= maxScroll - 56;
    if (nearTop && !nearBottom) setScrollEdge("top");
    else if (nearBottom) setScrollEdge("bottom");
    else setScrollEdge("middle");
  }, []);

  useEffect(() => {
    if (!open) {
      didInitialScrollRef.current = false;
      openedWithoutMessagesRef.current = false;
      scrollIdentityRef.current = "";
      setScrollEdge("top");
      return;
    }
    // inline 등 open 유지한 채 의뢰 전환 시 초기 스크롤 다시 적용
    if (scrollIdentity && scrollIdentity !== scrollIdentityRef.current) {
      scrollIdentityRef.current = scrollIdentity;
      didInitialScrollRef.current = false;
      openedWithoutMessagesRef.current = false;
    }
    if (minimized || chatLoading) return;

    const preferBottom =
      resolvedInitialPanelTab === "chat"
        ? true
        : resolvedInitialPanelTab === "detail"
          ? false
          : chatMessages.length > 0;

    if (!didInitialScrollRef.current) {
      didInitialScrollRef.current = true;
      openedWithoutMessagesRef.current =
        resolvedInitialPanelTab == null && chatMessages.length === 0;
      const id = requestAnimationFrame(() => applyScrollPosition(preferBottom));
      return () => cancelAnimationFrame(id);
    }

    // 열 때 비어 있다가 채팅이 도착하면 맨 아래로 한 번 보정
    if (
      openedWithoutMessagesRef.current &&
      resolvedInitialPanelTab == null &&
      chatMessages.length > 0
    ) {
      openedWithoutMessagesRef.current = false;
      const id = requestAnimationFrame(() => applyScrollPosition(true));
      return () => cancelAnimationFrame(id);
    }
  }, [
    open,
    minimized,
    chatLoading,
    chatMessages.length,
    resolvedInitialPanelTab,
    scrollIdentity,
    applyScrollPosition,
  ]);

  useEffect(() => {
    if (!open || minimized || !didInitialScrollRef.current) return;
    if (scrollEdge !== "bottom") return;
    // 메시지 없으면 하단 고정하지 않음(보철물·의뢰 상단 유지)
    if (chatMessages.length === 0) return;
    const id = requestAnimationFrame(() => {
      const el = scrollBodyRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [open, minimized, scrollEdge, chatMessages.length]);

  const resolvedChatRoomId = useMemo(() => {
    const fromProp = String(chatRoomId || "").trim();
    if (fromProp) return fromProp;
    for (const m of chatMessages) {
      const id = String((m as { roomId?: string })?.roomId || "").trim();
      if (id) return id;
    }
    return "";
  }, [chatRoomId, chatMessages]);

  useRegisterChatSoundViewing(
    resolvedChatRoomId,
    Boolean(open && !minimized && resolvedChatRoomId),
  );

  const activeRemakeChargeIndexes = useMemo(() => {
    const set = new Set<number>();
    const rows = Array.isArray(remakeCharges) ? remakeCharges : [];
    rows.forEach((row, i) => {
      const raw = Math.trunc(Number(row?.chargeIndex));
      set.add(Number.isFinite(raw) ? raw : i);
    });
    return set;
  }, [remakeCharges]);

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
        title: "다음 도착일 확인",
        description: "다음 도착일은 오늘 이후로 선택해 주세요.",
        variant: "destructive",
      });
      return;
    }
    setRearrivalOpen(false);
    onAppendArrival(ymd);
  }, [onAppendArrival, rearrivalDraft, todayYmd, toast]);

  const nextStageSegments = useMemo(() => {
    const plans = normalizeLabRequestStagePlans(labRequestStagePlans);
    if (plans.length === 0) return [] as Array<{ archLabel: string; text: string }>;

    const archByType = new Map<string, Set<"upper" | "lower">>();
    for (const row of toothWorks || []) {
      const typeName = String(row?.prosthesisType || "").trim();
      if (!typeName) continue;
      const arch = toothArchFromNumber(String(row?.toothNumber || ""));
      if (arch !== "upper" && arch !== "lower") continue;
      const key = typeName.toLowerCase();
      const set = archByType.get(key) || new Set();
      set.add(arch);
      archByType.set(key, set);
    }

    type Seg = { arch: "upper" | "lower" | "none"; archLabel: string; text: string };
    const segs: Seg[] = [];
    for (const plan of plans) {
      const next = nextStageOfPlan(plan);
      if (!next?.name) continue;
      const typeName = String(plan.prosthesisType || "").trim();
      const body = typeName ? `${typeName}: ${next.name}` : next.name;
      const arches = archByType.get(typeName.toLowerCase());
      if (arches?.has("upper") && arches?.has("lower")) {
        segs.push({ arch: "upper", archLabel: "상악", text: body });
        segs.push({ arch: "lower", archLabel: "하악", text: body });
        continue;
      }
      if (arches?.has("upper")) {
        segs.push({ arch: "upper", archLabel: "상악", text: body });
        continue;
      }
      if (arches?.has("lower")) {
        segs.push({ arch: "lower", archLabel: "하악", text: body });
        continue;
      }
      segs.push({ arch: "none", archLabel: "", text: body });
    }

    const rank = (a: Seg["arch"]) =>
      a === "upper" ? 0 : a === "lower" ? 1 : 2;
    segs.sort((a, b) => rank(a.arch) - rank(b.arch));

    return segs.map((s) => ({
      archLabel: s.archLabel,
      text: s.text,
    }));
  }, [labRequestStagePlans, toothWorks]);

  const nextArrivalReminder = useMemo(
    () =>
      onAppendArrival
        ? resolvePracticeNextArrivalReminder({
            arrivalDate: currentArrivalYmd || null,
            labRequestStagePlans,
          })
        : null,
    [currentArrivalYmd, labRequestStagePlans, onAppendArrival],
  );
  const nextArrivalAttention = isPracticeNextArrivalAttention(nextArrivalReminder);
  const nextArrivalTooltip =
    getPracticeNextArrivalReminderTooltip(nextArrivalReminder);

  const renderRearrivalPopover = () =>
    onAppendArrival ? (
      <Popover open={rearrivalOpen} onOpenChange={setRearrivalOpen}>
        <Tooltip open={rearrivalOpen ? false : undefined}>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 shrink-0 gap-1 px-1.5 text-xs font-medium text-primary hover:bg-primary-soft/50 hover:text-primary",
                  practiceNextArrivalAttentionClassName(nextArrivalAttention),
                )}
                disabled={appendArrivalDisabled || appendArrivalBusy}
                aria-label={
                  nextArrivalAttention
                    ? "다음 도착일 — 지정 필요"
                    : "다음 도착일"
                }
              >
                <CalendarClock className="h-3.5 w-3.5" />
                {appendArrivalBusy ? "반영 중…" : "다음 도착일"}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="max-w-xs text-left text-xs leading-relaxed"
          >
            {nextArrivalTooltip}
          </TooltipContent>
        </Tooltip>
        <PopoverContent
          align="start"
          className="w-auto p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="border-b px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            선택일=다음 도착일, 오늘=재주문일로 반영됩니다.
            {onAppendProsthesis && !prosthesisFollowUpPending ? (
              <>
                <br />
                적용 시 지르 브리지·크라운으로 바꿀지 묻고, 아니면 임시치아로
                계속합니다(추가 과금 없음).
              </>
            ) : null}
            {nextStageSegments.length > 0 ? (
              <>
                <br />
                적용 시 다음 공정으로 진행됩니다.
              </>
            ) : null}
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
              disabled={!rearrivalDraft || appendArrivalBusy}
              onClick={() => confirmRearrival()}
            >
              적용
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    ) : null;
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
          const companionFiles: File[] = [];
          for (const item of imageItems) {
            const key = String(item.s3Key || "").trim();
            if (!key) continue;
            const name =
              String(item.fileName || "image").trim() || "image";
            try {
              const imgBlob = await fetchS3BlobCached({
                s3Key: key,
                fileName: name,
                token: authToken,
                buildUrl: buildS3ProxyDownloadUrl,
                signal: ac.signal,
              });
              if (ac.signal.aborted) return;
              companionFiles.push(fileFromImageBlob(imgBlob, name));
            } catch {
              // companion optional
            }
          }

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
              const fromCompanions = companionFiles.find(
                (f) => f.name.toLowerCase() === texName.toLowerCase(),
              );
              textureFile = fromCompanions || null;
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

  const caseIdentityStrip = useMemo(() => {
    const fromPropPrimary = String(caseIdentity?.primary || "").trim();
    const fromPropSecondary = String(caseIdentity?.secondary || "").trim();
    const fromPropColorKey = String(caseIdentity?.colorKey || "").trim();
    const fromPropDotColor = String(caseIdentity?.dotColor || "").trim();
    const fromPropDotStyle = caseIdentity?.dotStyle || null;
    const orderYmd =
      String(orderDate || "").trim() ||
      summaryItemValue(summaryItems, "재주문일") ||
      summaryItemValue(summaryItems, "주문일");
    if (fromPropPrimary) {
      const secondary =
        fromPropSecondary ||
        formatPracticeTransferIdentityDateLabel({ orderYmd });
      // 호출부가 도착만 넘긴 경우 주문일을 앞에 붙인다.
      const enrichedSecondary =
        orderYmd &&
        secondary &&
        !secondary.includes("주문") &&
        (secondary.startsWith("도착") || secondary.startsWith("출고"))
          ? `주문 ${orderYmd} · ${secondary}`
          : secondary;
      return {
        primary: fromPropPrimary,
        secondary: enrichedSecondary,
        colorKey: fromPropColorKey || undefined,
        dotColor: fromPropDotColor || undefined,
        dotStyle: fromPropDotStyle || undefined,
      };
    }
    const practiceName = summaryItemValue(summaryItems, "치과");
    const labName = summaryItemValue(summaryItems, "기공소");
    const patientName = summaryItemValue(summaryItems, "환자명");
    const transferId =
      summaryItemValue(summaryItems, "전송ID") ||
      summaryItemValue(summaryItems, "의뢰ID");
    const arrivalDate =
      summaryItemValue(summaryItems, "다음 도착일") ||
      summaryItemValue(summaryItems, "재도착일") ||
      summaryItemValue(summaryItems, "치과도착일");
    const shipDate = summaryItemValue(summaryItems, "출고예정");
    const party = practiceName || labName;
    const teeth = formatToothNumbersForCard(toothWorks);
    const primaryParts = [party, patientName].filter(Boolean);
    if (primaryParts.length === 0 && !transferId) return null;
    const identity =
      primaryParts.length === 0
        ? transferId
        : primaryParts.length === 2
          ? `${primaryParts[0]} / ${primaryParts[1]}${teeth ? ` ${teeth}` : ""}`
          : `${primaryParts[0]}${teeth ? ` ${teeth}` : ""}`;
    return {
      primary: identity,
      secondary: formatPracticeTransferIdentityDateLabel({
        orderYmd,
        arrivalYmd: arrivalDate,
        shipYmd: shipDate,
      }),
      colorKey: undefined as string | undefined,
      dotColor: undefined as string | undefined,
      dotStyle: undefined as CalendarLabDotStyle | undefined,
    };
  }, [caseIdentity, orderDate, summaryItems, toothWorks]);
  const showArrivalInChatChrome = Boolean(
    onAppendArrival || nextStageSegments.length > 0,
  );
  const identityDateLabel = String(caseIdentityStrip?.secondary || "").trim();
  const identityChromeActions = (
    <div className="flex shrink-0 items-center gap-0.5" data-no-drag>
      {composerToolbarExtra}
      <ChatSoundGlobalToggle />
    </div>
  );
  const handlePrintDetail = useCallback(() => {
    printPracticeTransferDetail({
      title,
      summaryItems,
      toothWorks: toothWorks || [],
      memo,
    });
  }, [title, summaryItems, toothWorks, memo]);

  const hasMeaningfulMemo = Boolean(String(memo || "").trim() && memo !== "-");

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
    /** 수락 직후: 수락 버튼 자리에 작업취소(어벗 가공·도착일 차단 시 숨김) */
  const showReleaseBar =
    Boolean(onRelease) &&
    accepted &&
    !workCanceled &&
    !workCompleted &&
    !abutmentMachiningStarted &&
    !workCancelBlocked;
  const workFileDropActive = Boolean(
    workFileDrop && !workFileDrop.disabled && !minimized,
  );
  const requestFileAttachActive = Boolean(onAttachRequestFiles) && !minimized;
  const chatFileDropActive = !inputDisabled && !minimized;
  const unifiedFileDropActive =
    workFileDropActive || requestFileAttachActive || chatFileDropActive;

  const [pendingImageFiles, setPendingImageFiles] = useState<File[] | null>(
    null,
  );

  const clearPendingImageFiles = useCallback(() => {
    setPendingImageFiles(null);
  }, []);

  useEffect(() => {
    clearPendingImageFiles();
  }, [chatRoomId, clearPendingImageFiles, open]);

  const routePickedOrDroppedFiles = useCallback(
    (files: File[]) => {
      if (!files.length) return;
      let remaining = files;
      if (workFileDropActive && workFileDrop) {
        const { stlFiles, chatFiles } = partitionLabChatDropFiles(files);
        if (stlFiles.length) workFileDrop.onFiles(stlFiles);
        remaining = chatFiles;
        if (!remaining.length) return;
      }
      if (onAttachRequestFiles) {
        const { modelFiles, imageFiles, otherFiles } =
          partitionDetailAttachFiles(remaining);
        if (modelFiles.length) onAttachRequestFiles(modelFiles);
        if (otherFiles.length && chatFileDropActive) {
          onAttachChatFiles(otherFiles);
        }
        if (!imageFiles.length) return;
        // 어벗 STL 모드에서도 이미지면 의뢰파일/채팅 선택(채팅 입력 잠금이어도 첨부 큐는 가능)
        if (onAttachChatFiles) {
          setPendingImageFiles(imageFiles);
          return;
        }
        onAttachRequestFiles(imageFiles);
        return;
      }
      if (chatFileDropActive) onAttachChatFiles(remaining);
    },
    [
      chatFileDropActive,
      onAttachChatFiles,
      onAttachRequestFiles,
      workFileDrop,
      workFileDropActive,
    ],
  );

  const [pageWorkDropActive, setPageWorkDropActive] = useState(false);
  const pageWorkDropDepthRef = useRef(0);
  const routePickedOrDroppedFilesRef = useRef(routePickedOrDroppedFiles);
  useEffect(() => {
    routePickedOrDroppedFilesRef.current = routePickedOrDroppedFiles;
  }, [routePickedOrDroppedFiles]);

  /** 어벗 STL — 페이지(window) 전체 드래그·드롭 (비STL은 의뢰 파일/채팅 분기) */
  useEffect(() => {
    if (!open || !workFileDropActive || workFileDrop?.disabled) {
      pageWorkDropDepthRef.current = 0;
      setPageWorkDropActive(false);
      return;
    }

    const handleDragEnter = (event: DragEvent) => {
      if (!dataTransferHasFiles(event)) return;
      event.preventDefault();
      pageWorkDropDepthRef.current += 1;
      setPageWorkDropActive(true);
    };
    const handleDragOver = (event: DragEvent) => {
      if (!dataTransferHasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const handleDragLeave = (event: DragEvent) => {
      if (!dataTransferHasFiles(event)) return;
      event.preventDefault();
      pageWorkDropDepthRef.current = Math.max(
        0,
        pageWorkDropDepthRef.current - 1,
      );
      if (pageWorkDropDepthRef.current <= 0) {
        pageWorkDropDepthRef.current = 0;
        setPageWorkDropActive(false);
      }
    };
    const handleDrop = (event: DragEvent) => {
      if (!dataTransferHasFiles(event)) return;
      if (event.defaultPrevented) return;
      event.preventDefault();
      pageWorkDropDepthRef.current = 0;
      setPageWorkDropActive(false);
      const items = Array.from(event.dataTransfer?.items || []);
      const direct = Array.from(event.dataTransfer?.files || []);
      void (async () => {
        const files = await extractDroppedFiles(items, direct);
        if (files.length) routePickedOrDroppedFilesRef.current(files);
      })();
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
      pageWorkDropDepthRef.current = 0;
      setPageWorkDropActive(false);
    };
  }, [open, workFileDropActive, workFileDrop?.disabled]);

  const handleChatTabDropFiles = useCallback(
    (files: File[]) => {
      routePickedOrDroppedFiles(files);
    },
    [routePickedOrDroppedFiles],
  );
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
    rawChatError === "작업시작 후 치과와 채팅할 수 있습니다." ||
    rawChatError === "기공소에서 작업시작 후 채팅방을 열 수 있습니다." ||
    // 레거시 API 문구
    rawChatError === "의뢰수락 후 치과와 채팅할 수 있습니다." ||
    rawChatError === "기공소에서 의뢰 수락 후 채팅방을 열 수 있습니다.";
  /** 자동매칭 공개 풀 등 방이 없을 때: 수락 바와 같은 안내를 메시지 영역에 중복하지 않음 */
  const visibleChatError =
    showAcceptBar && isPreAcceptChatHint ? "" : rawChatError;
  const acceptButtonLabel = acceptBusy
    ? "작업시작 중..."
    : remainingLabel
      ? `작업시작 [${remainingLabel}]`
      : "작업시작";
  const reacceptButtonLabel = acceptBusy
    ? "작업시작 중..."
    : remainingLabel
      ? `다시 작업시작 [${remainingLabel}]`
      : "다시 작업시작";
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
            작업시작을 해제합니다. 어벗 가공이 시작된 뒤에는 취소할 수 없습니다.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ) : null;
  const resolvedAcceptedWorkActions =
    typeof acceptedWorkActions === "function"
      ? acceptedWorkActions({ releaseAction })
      : acceptedWorkActions;
  const acceptDisabled = acceptBusy || oralScanBlocksAccept;
  const acceptBarSurchargeLabel = (() => {
    const multiplier = normalizeLabFeeMultiplier(feeQuote?.labFeeMultiplier);
    if (multiplier <= 1) return null;
    return formatLabFeeMultiplierLabel(multiplier);
  })();
  const designFileList = Array.isArray(designFiles) ? designFiles : [];
  const resultFileList = Array.isArray(resultFiles) ? resultFiles : [];
  const showWorkFilesSection =
    designFileList.length > 0 || resultFileList.length > 0;
  const requestFileWaves = clusterPracticeTransferFileWaves(files);
  const trashedFileList = Array.isArray(trashedFiles) ? trashedFiles : [];
  /** 휴지통에 파일이 있을 때만 썸네일 끝 타일 표시 */
  const showRequestFileTrash =
    Boolean(onRestoreRequestFile) && trashedFileList.length > 0;

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
    const isRemoving =
      Boolean(busyKey) && removingRequestFileKeys.includes(busyKey);
    const canRemoveRequestFile =
      (keyPrefix === "request" || keyPrefix.startsWith("request:")) &&
      Boolean(onRemoveRequestFile) &&
      Boolean(busyKey) &&
      !locked;
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
        {canRemoveRequestFile ? (
          <button
            type="button"
            className="absolute right-1 top-1 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/65 text-white shadow-sm hover:bg-destructive disabled:opacity-50"
            title="파일 삭제"
            aria-label="파일 삭제"
            disabled={isRemoving || isBusy}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void onRemoveRequestFile?.(file);
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => handleFileRowClick(file, locked)}
          disabled={isBusy || locked || isRemoving}
          title={title}
          className="flex w-full flex-col items-stretch text-left disabled:opacity-60 disabled:pointer-events-none"
        >
          <div
            className={cn(
              "relative w-full overflow-hidden bg-slate-100",
              FILE_TILE_THUMB_ASPECT_CLASS,
            )}
          >
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
              <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 px-1 text-slate-500">
                {isMesh ? (
                  <Box className="h-5 w-5 shrink-0" aria-hidden />
                ) : (
                  <FileIcon className="h-5 w-5 shrink-0" aria-hidden />
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
            {isBusy || isRemoving ? (
              <div className="absolute inset-x-0 bottom-0 bg-slate-900/55 px-1 py-0.5">
                <p className="text-center text-[10px] text-white">
                  {isRemoving ? "삭제 중…" : `${Math.round(progress)}%`}
                </p>
                {!isRemoving ? (
                  <Progress value={progress} className="mt-0.5 h-1" />
                ) : null}
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

  const renderPendingRequestFileTile = (item: BackgroundUploadItem) => {
    const isMesh = isModelPreviewExt(getModelExtLower(item.file.name));
    const typeLabel = fileTypeLabel(item.file.name);
    return (
      <div
        key={`pending-request:${item.id}`}
        className="relative min-w-0 overflow-hidden rounded-md border border-dashed border-primary/40 bg-primary-soft/20"
      >
        {onRemovePendingRequestFile ? (
          <button
            type="button"
            className="absolute right-1 top-1 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/65 text-white shadow-sm hover:bg-destructive"
            title="업로드 취소"
            aria-label="업로드 취소"
            onClick={() => onRemovePendingRequestFile(item.id)}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <div className="flex w-full flex-col items-stretch">
          <div
            className={cn(
              "relative w-full overflow-hidden bg-slate-100",
              FILE_TILE_THUMB_ASPECT_CLASS,
            )}
          >
            <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 px-1 text-slate-500">
              {isMesh ? (
                <Box className="h-5 w-5 shrink-0" aria-hidden />
              ) : (
                <FileIcon className="h-5 w-5 shrink-0" aria-hidden />
              )}
              <span className="max-w-full truncate text-[10px] font-semibold tracking-wide text-slate-600">
                {typeLabel}
              </span>
            </div>
            <div className="absolute inset-x-0 bottom-0 bg-slate-900/55 px-1 py-0.5">
              <p className="text-center text-[10px] text-white">
                {item.status === "error"
                  ? "실패"
                  : item.status === "done"
                    ? "저장 중…"
                    : `${Math.round(item.progress || 0)}%`}
              </p>
              {item.status !== "error" ? (
                <Progress
                  value={item.status === "done" ? 100 : item.progress || 0}
                  className="mt-0.5 h-1"
                />
              ) : onRetryPendingRequestFile ? (
                <button
                  type="button"
                  className="mt-0.5 w-full text-center text-[10px] text-white underline"
                  onClick={() => onRetryPendingRequestFile(item.id)}
                >
                  다시 시도
                </button>
              ) : null}
            </div>
          </div>
          <p
            className="truncate px-1.5 py-1.5 text-center text-[11px] font-medium text-slate-800"
            title={item.file.name}
          >
            {item.file.name}
          </p>
        </div>
      </div>
    );
  };

  const renderRequestFileTrashTile = () => (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative min-w-0 overflow-hidden rounded-md border border-dashed border-slate-300 bg-slate-100/80 text-left hover:bg-slate-100"
          title={`휴지통 ${trashedFileList.length}개`}
          aria-label={`휴지통 ${trashedFileList.length}개`}
        >
          <div
            className={cn(
              "relative flex w-full flex-col items-center justify-center gap-0.5 bg-slate-200/60 text-slate-600",
              FILE_TILE_THUMB_ASPECT_CLASS,
            )}
          >
            <Trash2 className="h-5 w-5 shrink-0" aria-hidden />
            <span className="absolute right-1 top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {trashedFileList.length}
            </span>
          </div>
          <p className="truncate px-1.5 py-1.5 text-center text-[11px] font-medium text-slate-700">
            휴지통
          </p>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        className="z-[400] w-80 p-3"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-foreground">
            휴지통{" "}
            <span className="font-normal text-muted-foreground">
              ({trashedFileList.length}개)
            </span>
          </p>
          {trashedFileList.length > 0 && onRestoreAllRequestFiles ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 shrink-0 gap-1 px-2 text-[11px]"
              disabled={
                restoringRequestFileKeys.length > 0 || !onRestoreRequestFile
              }
              onClick={() => void onRestoreAllRequestFiles()}
            >
              <RotateCcw className="h-3 w-3" />
              {restoringRequestFileKeys.length > 0
                ? "복원 중…"
                : "전체 복원"}
            </Button>
          ) : null}
        </div>
        {trashedFileList.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted-foreground">
            삭제한 의뢰 파일이 없습니다.
          </p>
        ) : (
          <div className="custom-scrollbar max-h-64 space-y-2 overflow-y-auto">
            {trashedFileList.map((file) => {
              const key = String(file.s3Key || file.id || "").trim();
              const busy = key
                ? restoringRequestFileKeys.includes(key)
                : false;
              return (
                <div
                  key={`trash:${key || file.fileName}`}
                  className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-xs font-medium text-foreground"
                      title={file.fileName}
                    >
                      {file.fileName}
                    </p>
                    {file.trashedAt ? (
                      <p className="text-[10px] text-muted-foreground">
                        {formatPracticeUploadWaveTime(file.trashedAt)}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 gap-1 px-2 text-[11px]"
                    disabled={busy || !onRestoreRequestFile}
                    onClick={() => void onRestoreRequestFile?.(file)}
                  >
                    <RotateCcw className="h-3 w-3" />
                    {busy ? "복원 중…" : "복원"}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );

  const panelBody = (
        <PracticeTransferFileDropTarget
          fileInputId={
            workFileDrop?.fileInputId || "practice-transfer-unified-drop"
          }
          onFiles={handleChatTabDropFiles}
          disabled={
            workFileDropActive
              ? true
              : !unifiedFileDropActive
          }
          showDefaultUi={false}
          fillHeight
          accept={
            workFileDropActive
              ? PRACTICE_TRANSFER_STL_ACCEPT
              : undefined
          }
          acceptedHint={
            workFileDropActive
              ? workFileDrop?.dropHint || "어벗 STL"
              : requestFileAttachActive
                ? "3D → 의뢰 파일 · 이미지 → 선택"
                : "사진·파일"
          }
          filterFiles={(files) => files}
          className="flex min-h-0 flex-1 flex-col"
          activeClassName="ring-2 ring-inset ring-primary bg-primary-soft/25"
        >
          {({ isDragActive }) => (
            <>
              {pageWorkDropActive && workFileDropActive
                ? createPortal(
                    <div
                      className="pointer-events-none fixed inset-0 z-[500] flex flex-col items-center justify-center gap-2 bg-primary/15 px-6 backdrop-blur-[2px]"
                      aria-hidden
                    >
                      <div className="rounded-full bg-primary-soft p-4 text-primary-strong shadow-md">
                        <UploadCloud className="h-10 w-10" />
                      </div>
                      <p className="text-base font-semibold text-primary-strong">
                        어벗 STL을 놓아 업로드
                      </p>
                      <p className="max-w-sm text-center text-sm text-slate-700">
                        {workFileDrop?.dropHint ||
                          workFileDropGuideDetail ||
                          LAB_RECEIVE_ABUTMENT_UPLOAD_HINT}
                      </p>
                    </div>,
                    document.body,
                  )
                : null}
              {!workFileDropActive &&
              isDragActive &&
              unifiedFileDropActive ? (
                <div
                  className="pointer-events-none absolute inset-0 z-[305] flex flex-col items-center justify-center gap-2 rounded-md bg-primary/10 px-6 backdrop-blur-[2px]"
                  aria-hidden
                >
                  <div className="rounded-full bg-primary-soft p-3 text-primary-strong shadow-sm">
                    <UploadCloud className="h-8 w-8" />
                  </div>
                  <p className="text-sm font-semibold text-primary-strong">
                    {requestFileAttachActive
                      ? "파일을 놓아 첨부"
                      : "사진·파일을 놓아 첨부"}
                  </p>
                  <p className="text-center text-xs text-muted-foreground">
                    {requestFileAttachActive
                      ? "3D → 의뢰 파일 · 이미지 → 의뢰 파일/채팅 선택 · 그 외 → 채팅"
                      : "채팅에 보낼 파일을 여기에 놓으세요"}
                  </p>
                </div>
              ) : null}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {!minimized ? (
          <>
          <div className="shrink-0">
          <div className="flex items-center justify-between gap-3 border-b bg-slate-50 px-5 py-2.5">
              <div className="min-w-0 flex-1">
                {caseIdentityStrip ? (
                  <>
                    <div className="flex min-w-0 items-center gap-1">
                      <p className="flex min-w-0 flex-1 items-center gap-2 truncate text-sm font-semibold text-foreground">
                        {caseIdentityStrip.dotColor ||
                        caseIdentityStrip.colorKey ? (
                          <CalendarLabColorDot
                            color={
                              caseIdentityStrip.dotColor ||
                              calendarGroupDotColor(
                                caseIdentityStrip.colorKey || "-",
                              )
                            }
                            style={caseIdentityStrip.dotStyle || "filled"}
                          />
                        ) : null}
                        <span className="min-w-0 truncate">
                          {caseIdentityStrip.primary}
                        </span>
                      </p>
                      {identityChromeActions}
                    </div>
                    {identityDateLabel && !showArrivalInChatChrome ? (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {identityDateLabel}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <div className="flex min-w-0 items-center gap-1">
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                      {title}
                    </p>
                    {identityChromeActions}
                  </div>
                )}
              </div>
              {chatHeaderAction || !isInline ? (
                <div className="flex shrink-0 items-center gap-1" data-no-drag>
                  {chatHeaderAction}
                  {!isInline ? (
                    <button
                      type="button"
                      className={cn(
                        "inline-flex items-center justify-center rounded-md opacity-70 ring-offset-background transition-opacity hover:bg-slate-100 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                        isMobile ? "h-10 w-10" : "h-9 w-9",
                      )}
                      aria-label="닫기"
                      title="닫기"
                      onClick={() => onOpenChange(false)}
                    >
                      <X
                        className="h-5 w-5"
                        strokeWidth={2.25}
                      />
                      <span className="sr-only">Close</span>
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

              {(onEditRequest ||
                onCancelRequest ||
                nextStageSegments.length > 0 ||
                onAppendArrival) ? (
                <div className="border-b bg-muted/25">
                  {nextStageSegments.length > 0 || onAppendArrival ? (
                    <div className="flex flex-wrap items-center gap-2 px-4 py-2 sm:px-5">
                      {nextStageSegments.length > 0 ? (
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                          {identityDateLabel ? (
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                              {identityDateLabel}
                            </span>
                          ) : null}
                          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            다음 공정
                          </span>
                          {nextStageSegments.map((seg, idx) => (
                            <span
                              key={`${seg.archLabel}:${seg.text}:${idx}`}
                              className="inline-flex max-w-full items-center gap-1 rounded-md border border-border/80 bg-background px-2 py-0.5 text-xs leading-snug text-foreground"
                            >
                              {seg.archLabel ? (
                                <span className="shrink-0 font-semibold text-primary">
                                  {seg.archLabel}
                                </span>
                              ) : null}
                              <span className="min-w-0 truncate">{seg.text}</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="min-w-0 flex-1 truncate text-xs tabular-nums text-muted-foreground">
                          {identityDateLabel || ""}
                        </span>
                      )}
                      {onAppendArrival ? renderRearrivalPopover() : null}
                      {onEditRequest || onCancelRequest ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 shrink-0 px-0 text-muted-foreground"
                              aria-label="의뢰 관리"
                              title="의뢰 관리"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="z-[400]">
                            {onEditRequest ? (
                              <DropdownMenuItem
                                disabled={editRequestDisabled}
                                onSelect={() => onEditRequest()}
                              >
                                <Pencil className="mr-2 h-3.5 w-3.5" />
                                의뢰 수정
                              </DropdownMenuItem>
                            ) : null}
                            {onCancelRequest ? (
                              <DropdownMenuItem
                                disabled={cancelRequestDisabled}
                                className="text-destructive focus:text-destructive"
                                onSelect={() => onCancelRequest()}
                              >
                                <Trash2 className="mr-2 h-3.5 w-3.5" />
                                의뢰 취소
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>
                  ) : onEditRequest || onCancelRequest ? (
                    <div className="flex justify-end gap-1 px-4 py-1.5 sm:px-5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
                            aria-label="의뢰 관리"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                            관리
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="z-[400]">
                          {onEditRequest ? (
                            <DropdownMenuItem
                              disabled={editRequestDisabled}
                              onSelect={() => onEditRequest()}
                            >
                              <Pencil className="mr-2 h-3.5 w-3.5" />
                              의뢰 수정
                            </DropdownMenuItem>
                          ) : null}
                          {onCancelRequest ? (
                            <DropdownMenuItem
                              disabled={cancelRequestDisabled}
                              className="text-destructive focus:text-destructive"
                              onSelect={() => onCancelRequest()}
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" />
                              의뢰 취소
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ) : null}
                </div>
              ) : null}
          </div>

              {summaryBanner ? (
                <div className="shrink-0 border-b px-5 py-2">{summaryBanner}</div>
              ) : null}

              {showAcceptBar ? (
                <div
                  className="shrink-0 border-b bg-muted/40 px-5 py-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                  data-guide-tour="lab_accept"
                >
                  {hasPendingLabCustomAbutment ||
                  hasAbutsCustomAbutment ||
                  oralScanAttachMode === "practice_required" ||
                  acceptBarHint ? (
                    <div className="min-w-0 space-y-1">
                      {acceptBarHint ? (
                        <div className="text-xs leading-relaxed text-muted-foreground">
                          {acceptBarHint}
                        </div>
                      ) : null}
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
                    {onOpenSubcontract ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => void onOpenSubcontract()}
                        disabled={acceptBusy || openSubcontractBusy}
                      >
                        {openSubcontractBusy ? "전환 중..." : "하청 전환"}
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
                    작업이 취소된 상태입니다. 채팅은 이어갈 수 있고, 다시 작업시작하면
                    작업을 진행할 수 있습니다.
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
                        작업시작한 의뢰입니다. 작업취소하면 작업시작이 해제됩니다.
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

          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" data-guide-tour="lab_chat">
            <div
              ref={scrollBodyRef}
              onScroll={updateScrollEdge}
              className={cn(
                "custom-scrollbar relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain transition-opacity",
                workFileDropActive &&
                  !workFileDropUploading &&
                  "opacity-80",
              )}
            >
              <div className="shrink-0 space-y-5 px-5 py-3 text-sm">
              {Array.isArray(toothWorks) && toothWorks.length > 0 ? (
                <section className="space-y-2.5">
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
                  <PracticeRemakeChargesStrip remakeCharges={remakeCharges} />
                </section>
              ) : remakeCharges && remakeCharges.length > 0 ? (
                <section>
                  <PracticeRemakeChargesStrip remakeCharges={remakeCharges} />
                </section>
              ) : null}

              {hasMeaningfulMemo ? (
                <section className="space-y-2.5">
                  <h3 className="text-[13px] font-semibold text-foreground">
                    의뢰 메모
                  </h3>
                  <p className="custom-scrollbar max-h-48 overflow-y-auto rounded-md bg-muted/40 px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground">
                    {memo}
                  </p>
                </section>
              ) : null}

              <section className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[13px] font-semibold text-foreground">
                    {filesLabel}{" "}
                    <span className="font-normal text-muted-foreground">
                      ({files.length + requestFilePendingUploads.length}개)
                    </span>
                  </h3>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {feeViewer === "lab" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1.5 px-2.5 text-xs"
                        title="의뢰 상세 인쇄 (A5)"
                        onClick={handlePrintDetail}
                      >
                        <Printer className="h-3.5 w-3.5" />
                        프린트
                      </Button>
                    ) : null}
                    {files.length > 0 ? (
                      files.some((f) => isDcmFileName(f.fileName)) ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={
                                downloadAllBusy || requestFilesDownloadLocked
                              }
                            >
                              {downloadAllBusy ? "다운로드 중..." : "전체 다운로드"}
                              <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-70" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="z-[400]">
                            <DropdownMenuItem
                              onClick={() =>
                                void onDownloadAllFiles({ dcmFormat: "dcm" })
                              }
                            >
                              DCM 원본
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                void onDownloadAllFiles({ dcmFormat: "ply" })
                              }
                            >
                              PLY (칼라)
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void onDownloadAllFiles()}
                          disabled={
                            downloadAllBusy || requestFilesDownloadLocked
                          }
                        >
                          {downloadAllBusy ? "다운로드 중..." : "전체 다운로드"}
                        </Button>
                      )
                    ) : null}
                  </div>
                </div>
                {requestFilesDownloadLocked && files.length > 0 ? (
                  <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-200">
                    {requestFilesDownloadLockedReason}
                  </p>
                ) : null}
                {files.length ||
                requestFilePendingUploads.length ||
                showRequestFileTrash ? (
                  <div className="space-y-3">
                    {requestFileWaves.map((wave, waveIndex) => {
                      const timeLabel = formatPracticeUploadWaveTime(
                        wave.uploadedAt,
                      );
                      const isLastWave =
                        waveIndex === requestFileWaves.length - 1 &&
                        requestFilePendingUploads.length === 0;
                      return (
                        <div key={wave.batchId} className="space-y-1.5">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="text-[12px] font-medium text-slate-700">
                              {wave.label}
                              <span className="ml-1.5 font-normal text-muted-foreground">
                                ({wave.files.length}개)
                              </span>
                            </p>
                            {timeLabel ? (
                              <p className="shrink-0 text-[11px] text-muted-foreground">
                                {timeLabel}
                              </p>
                            ) : null}
                          </div>
                          <div className="grid grid-cols-4 gap-2">
                            {wave.files.map((file, idx) =>
                              renderFileTile(
                                file,
                                idx,
                                `request:${wave.batchId}`,
                                requestFilesDownloadLocked,
                              ),
                            )}
                            {isLastWave && showRequestFileTrash
                              ? renderRequestFileTrashTile()
                              : null}
                          </div>
                        </div>
                      );
                    })}
                    {requestFilePendingUploads.length > 0 ? (
                      <div className="space-y-1.5">
                        <p className="text-[12px] font-medium text-slate-700">
                          업로드 중
                          <span className="ml-1.5 font-normal text-muted-foreground">
                            ({requestFilePendingUploads.length}개)
                          </span>
                        </p>
                        <div className="grid grid-cols-4 gap-2">
                          {requestFilePendingUploads.map((item) =>
                            renderPendingRequestFileTile(item),
                          )}
                          {showRequestFileTrash
                            ? renderRequestFileTrashTile()
                            : null}
                        </div>
                      </div>
                    ) : null}
                    {!requestFileWaves.length &&
                    !requestFilePendingUploads.length &&
                    showRequestFileTrash ? (
                      <div className="grid grid-cols-4 gap-2">
                        {renderRequestFileTrashTile()}
                      </div>
                    ) : null}
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
                <section className="space-y-3 border-t border-border/70 pt-4">
                  <h3 className="text-[13px] font-semibold text-foreground">
                    {workFilesLabel}
                  </h3>
                  {designFileList.length > 0 ? (
                    <div className="space-y-1.5">
                      <p className="text-[13px] text-muted-foreground">
                        {designFilesLabel}{" "}
                        <span>({designFileList.length}개)</span>
                      </p>
                      <div className="grid grid-cols-4 gap-2">
                        {designFileList.map((file, idx) =>
                          renderFileTile(file, idx, "design"),
                        )}
                      </div>
                    </div>
                  ) : null}
                  {resultFileList.length > 0 ? (
                    <div className="space-y-1.5">
                      <p className="text-[13px] text-muted-foreground">
                        {resultFilesLabel}{" "}
                        <span>({resultFileList.length}개)</span>
                      </p>
                      <div className="grid grid-cols-4 gap-2">
                        {resultFileList.map((file, idx) =>
                          renderFileTile(file, idx, "result"),
                        )}
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

              <div
                className="flex min-h-full flex-1 flex-col border-t border-border/70"
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
                  ) : null}

                    <div className="flex w-full min-w-0 max-w-full flex-1 flex-col space-y-2 px-5 py-2">
                      {chatLoading ? (
                        <div className="flex flex-1 items-center justify-center py-4 text-center text-xs text-muted-foreground">
                          채팅을 불러오는 중입니다...
                        </div>
                      ) : null}

                      {!chatLoading && visibleChatError ? (
                        <div className="flex min-h-[12rem] flex-1 items-center justify-center py-4">
                          <p className="text-center text-xs text-muted-foreground">
                            {visibleChatError}
                          </p>
                        </div>
                      ) : null}

                      {!chatLoading &&
                      !visibleChatError &&
                      chatMessages.length === 0 ? (
                        <div className="flex flex-1 items-center justify-center py-4 text-center text-sm text-muted-foreground">
                          아직 메시지가 없습니다.
                        </div>
                      ) : null}

                      {chatMessages.map((message) => {
                        const senderId = String(
                          message.sender?._id || "",
                        ).trim();
                        // 의뢰 파일로 올린 3D만 채팅 버블에서 숨김 — 이미지는 채팅 첨부로 남을 수 있음
                        const chatOnlyAttachments = Array.isArray(
                          message.attachments,
                        )
                          ? message.attachments.filter(
                              (file) =>
                                !isPracticeTransferModelFileName(
                                  String(file?.fileName || ""),
                                ),
                            )
                          : [];
                        const messageForBubble =
                          chatOnlyAttachments.length ===
                          (message.attachments?.length || 0)
                            ? message
                            : { ...message, attachments: chatOnlyAttachments };
                        return (
                          <ChatMessageBubble
                            key={message._id}
                            message={messageForBubble}
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
                            practiceTransferToothWorks={toothWorks}
                            practiceTransferFeeQuote={feeQuote}
                            onCancelRemakeCharge={onCancelRemakeCharge}
                            remakeChargeCancelBusy={remakeChargeCancelBusy}
                            activeRemakeChargeIndexes={activeRemakeChargeIndexes}
                            downloadingFileKeys={downloadingFileKeys}
                            downloadProgressByKey={downloadProgressByKey}
                            onReply={onReplyToMessage}
                            onToggleReaction={onToggleReaction}
                            onDeleteMessage={onDeleteMessage}
                            onOpenRequestId={onOpenRequestId}
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
                            {appendProsthesisBusy ? "처리 중…" : "지르 브리지·크라운"}
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
                <div className="h-2" />
              </div>
            </div>

            <div
              className={cn(
                "pointer-events-none absolute inset-x-0 z-[20] flex justify-center px-3 transition-all duration-300 ease-out",
                scrollEdge === "top"
                  ? "bottom-[4.75rem] translate-y-0 opacity-100"
                  : "bottom-[4rem] translate-y-2 opacity-0",
              )}
            >
              <button
                type="button"
                data-no-drag
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/80 bg-background/95 text-foreground shadow-md backdrop-blur-sm transition-transform duration-300",
                  scrollEdge === "top"
                    ? "pointer-events-auto scale-100"
                    : "pointer-events-none scale-95",
                )}
                onClick={scrollToProgressBottom}
                aria-label="아래로 이동"
                title="아래로 이동"
                tabIndex={scrollEdge === "top" ? 0 : -1}
              >
                <ArrowDown className="h-3.5 w-3.5 animate-bounce" />
              </button>
            </div>
            <div
              className={cn(
                "pointer-events-none absolute inset-x-0 z-[20] flex justify-center px-3 transition-all duration-300 ease-out",
                scrollEdge === "bottom"
                  ? "top-3 translate-y-0 opacity-100"
                  : "top-0 -translate-y-2 opacity-0",
              )}
            >
              <button
                type="button"
                data-no-drag
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/80 bg-background/95 text-foreground shadow-md backdrop-blur-sm transition-transform duration-300",
                  scrollEdge === "bottom"
                    ? "pointer-events-auto scale-100"
                    : "pointer-events-none scale-95",
                )}
                onClick={scrollToDetailTop}
                aria-label="위로 이동"
                title="위로 이동"
                tabIndex={scrollEdge === "bottom" ? 0 : -1}
              >
                <ArrowUp className="h-3.5 w-3.5 animate-bounce" />
              </button>
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
                    onPickFiles={routePickedOrDroppedFiles}
                    onRemovePendingFile={onRemoveAttachedChatFile}
                    onRetryPendingFile={onRetryAttachedChatFile}
                    requestPicks={requestPicks}
                    requestPicksLoading={requestPicksLoading}
                    onRequestPicksNeeded={onRequestPicksNeeded}
                    onInsertRequestId={
                      Array.isArray(requestPicks) ? () => undefined : undefined
                    }
                    replyTo={replyTo}
                    onCancelReply={onCancelReply}
                    compact
                  />
                </div>
          </div>
          </>
          ) : null}

        </div>


        {!minimized && !maximized && !isMobile && !isInline ? (
          <div
            data-no-drag
            className="absolute bottom-0 left-0 top-0 z-30 w-1.5 cursor-ew-resize touch-none hover:bg-primary/15"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
              beginResize("w", e.clientX, e.clientY);
            }}
          />
        ) : null}
            </>
          )}
        </PracticeTransferFileDropTarget>
  );

  const modelPreview = (
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
          ? (opts) =>
              void onDownloadTransferFile(previewMeta, {
                dcmFormat: opts?.dcmFormat,
              })
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
  );

  const pendingImageCount = pendingImageFiles?.length || 0;
  const imageAttachChoiceDialog = (
    <AlertDialog
      open={pendingImageCount > 0}
      onOpenChange={(next) => {
        if (!next) clearPendingImageFiles();
      }}
    >
      <AlertDialogContent
        className="z-[330] sm:max-w-md"
        overlayClassName="z-[325]"
      >
        <AlertDialogHeader>
          <AlertDialogTitle>이미지를 어디에 첨부할까요?</AlertDialogTitle>
          <AlertDialogDescription>
            {pendingImageCount > 1
              ? `${pendingImageCount}개 이미지`
              : "1개 이미지"}
            를 의뢰 파일(케이스 자료)로 둘지, 채팅 대화에 첨부할지 선택해 주세요.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row gap-2 sm:justify-stretch sm:space-x-0">
          <Button
            type="button"
            className="flex-1"
            onClick={() => {
              const files = pendingImageFiles || [];
              clearPendingImageFiles();
              if (files.length && onAttachRequestFiles) {
                onAttachRequestFiles(files);
              }
            }}
          >
            의뢰 파일
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={() => {
              const files = pendingImageFiles || [];
              clearPendingImageFiles();
              if (files.length) onAttachChatFiles(files);
            }}
          >
            채팅
          </Button>
          <AlertDialogCancel className="mt-0 flex-1">취소</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (isInline) {
    if (!open) {
      return (
        <>
          <div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-2 rounded-md border bg-background px-6 text-center shadow-sm">
            <p className="text-sm font-medium text-slate-700">의뢰를 선택하세요</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              왼쪽 목록·캘린더에서 건을 누르면
              <br />
              여기에 상세와 채팅이 표시됩니다.
            </p>
          </div>
          {modelPreview}
          {imageAttachChoiceDialog}
        </>
      );
    }
    return (
      <>
        <div
          className={cn(
            "relative flex h-full min-h-0 w-full flex-col gap-0 overflow-hidden rounded-md border bg-background shadow-sm",
            guideTourElevate ? "z-[410]" : null,
          )}
          data-guide-tour="lab_detail"
        >
          <p className="sr-only">{title}</p>
          {panelBody}
        </div>
        {modelPreview}
        {imageAttachChoiceDialog}
      </>
    );
  }

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
          height: layout.h,
          maxWidth: "none",
          maxHeight: layout.h,
          transform: "none",
          pointerEvents: "auto",
        }}
        className={cn(
          "pointer-events-auto relative flex flex-col gap-0 overflow-hidden border border-r-0 bg-background p-0 duration-0",
          isMobile ? "rounded-lg" : "rounded-l-lg rounded-r-none",
          guideTourElevate ? "z-[410]" : "z-[300]",
          "shadow-[-12px_0_40px_-12px_rgba(15,23,42,0.28),-4px_0_16px_rgba(15,23,42,0.12)]",
          "translate-x-0 translate-y-0",
          "w-auto max-w-none sm:w-auto sm:max-w-none sm:p-0",
          "data-[state=open]:animate-none data-[state=closed]:animate-none",
        )}
        data-guide-tour="lab_detail"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">
          기공의뢰 상세 및 채팅
        </DialogDescription>
        {panelBody}
      </DialogContent>
    </Dialog>
    {modelPreview}
    {imageAttachChoiceDialog}
    </>
  );
}

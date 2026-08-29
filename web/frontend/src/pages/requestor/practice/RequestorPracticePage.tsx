// related files:
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/realtime/useAppEventListener.ts
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/practice/components/PracticeRecentTransfersCalendar.tsx
// - web/frontend/src/pages/practice/components/PracticeStatusFilterBadges.tsx
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
// - web/frontend/src/shared/components/practice/PracticeLabReceiveWorkActionsBar.tsx
// - web/frontend/src/shared/practice/labReceiveCalendarDateKey.ts
// - web/backend/utils/labReceiveCalendarDateKey.util.js
// - web/frontend/src/shared/practice/labReceiveCalendarHiddenWeekdays.ts
// - web/backend/utils/labReceiveCalendarHiddenWeekdays.util.js
// - web/backend/controllers/users/user.controller.js
// - 2026-08-28: 어벗 확인 모달 열면 드롭존 바 숨김·확인 버튼「처리 중」(S3 1회만).
// - 2026-08-28: 분할 확인 전 S3 프리업로드·API 처리 중 드롭존 바 재표시 제거(한 번만 업로드).
// - 2026-08-28: 드롭/파일오픈 — 채팅 드롭존·확인 모달에 업로드 프로그레스바.
// - 2026-08-28: 채팅 드롭존 guideDetail — 어벗 생산 시작·보철 업로드 시 작업 완료 안내.
// - 2026-08-28: 작업 완료 취소를 업로드 CTA 바 trailing으로 넣어 2줄 레이아웃 유지.
// - 2026-08-28: 검색 입력 — 캘린더 주문일·도착일 뱃지 왼쪽(치과 기공의뢰와 동일).
// - 2026-08-28: 치과 메모 [작성] 왼쪽·[평가] 오른쪽. 헤더 할증라벨 제거·설정 시 배수만.
// - 2026-08-27: 미확인은 3주 창 밖이어도 목록·안내 바에 포함(사이드바 배지와 맞춤). 클릭 시 해당일로 점프.
// - 2026-08-27: 미확인 상단 안내 바 복구(버튼·뱃지 없음). 미확인 건은 캘린더에 항상 표시.
// - 2026-08-22: 기공의뢰수신 캘린더 숨길 요일 계정 preferences에 저장.
// - 2026-08-21: 작업취소 후 어벗츠로의뢰 진행중/출고예정 건수 쿼리 무효화.
// - 2026-08-21: 어벗 분할 업로드 모달 — 문구 단문화·취소/확인. 헥스 샘플 related 제외.
// - 2026-08-25: status deleted=치과 의뢰 삭제. 수신 목록·취소 뱃지에서 제외. canceled=레거시 휴지통. 작업취소=workCanceledAt.
// - 2026-08-21: 수신 상단 상태 뱃지에 채팅·미확인 unread.
// - 2026-08-21: 상단 상태 뱃지 다중 표시 on/off(표시 라벨·기본 리셋·ON/OFF 대비).
// - 2026-08-21: 어벗 디자인 업로드 후 skipDesignConfirm 강제 true 제거(구강스캔으로 치과 설정 존중).
// - 2026-08-21: 하청 전환 버튼 — 어벗츠기공소(internalLab)만 노출.
// - 2026-08-21: 어벗 STL 업로드 — relatedRequestIds 없으면 보정 재시도. 구강스캔 필수로 오인하는 토스트 제거.
// - 2026-08-28: 상세 모달 workFileDrop — 수락 후 창 전체 드래그 업로드(카드와 동일 라우팅).
// - 2026-08-21: 캘린더 전환 후 상세 모달에 어벗·보철 업로드 CTA 복원.
// - 2026-08-21: 커스텀어벗 배송현황을 상세·캘린더에 표시(치과 발신과 동일).
// - 2026-08-29: 상세 필드「어벗 진행상황」— 제조 공정(세척·패킹 등) 표시.
// - 2026-08-20: 기공의뢰수신 캘린더 날짜 뱃지 기본=치과도착일. 계정 preferences에 저장.
// - 2026-08-19: 리메이크는 공정 상태색 + 이중 외곽선.
// - 2026-08-19: 기공의뢰수신 캘린더 칩·상단 뱃지를 상태색으로 구분.
// - 2026-08-20: 할증 의뢰건 캘린더 칩에 할증률(예: 1.2x 할증) 표시.
// - 2026-08-20: 캘린더 칩에 사이드바와 같은 안읽음 배지.
// - 2026-08-19: 기공의뢰수신 — 안쪽 최외곽 Card 테두리 제거·패딩 축소.
// - 2026-08-19: 기공의뢰수신 목록을 치과 최근의뢰와 같은 3주 캘린더로 표시.
// - 2026-08-19: 수신 기간필터를 치과와 같이 30일/90일/이번달/지난달.
// - 2026-08-19: 기공비 미설정 수락 — 빠진 수가명과 함께 설정 탭 포워드. API는 lab_fee_unconfigured.
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
// - 2026-08-21: 의뢰 수락 취소 — 로컬 가공 고정 차단 제거. API 409 시에만 토스트.
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
// - 2026-08-21: 작업취소 — 수락과 같이 낙관적 UI(최소 busy 후 반영, API는 백그라운드).
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
// - 2026-08-26: 수신 상세 모달 거부 — ConfirmDialog 확인 후 처리.
// - 2026-08-26: 거부 ConfirmDialog — 포털 클릭 시 상세 모달이 닫히지 않게 하고 대상 ref 보관.
// - 2026-08-26: 지정 거부 후 기공소 목록·캘린더에서 즉시 제거.
// - 2026-08-26: 기공소 수신 상단 — 취소·거부 필터 뱃지 제거(종료 건은 목록에 두지 않음).
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import { usePeriodStore } from "@/store/usePeriodStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { apiFetch, request } from "@/shared/api/apiClient";
import { useChatMessages } from "@/shared/hooks/useChatMessages";
import { useChatRooms, type ChatRoom } from "@/shared/hooks/useChatRooms";
import { anonymizeAutoMatchChatSenderName } from "@/shared/practice/autoMatchIdentity";
import { useAppEventListener } from "@/shared/realtime/useAppEventListener";
import { useFilePreUpload, toTempUploadFileKey } from "@/shared/hooks/useFilePreUpload";
import type { PreUploadFileProgress } from "@/shared/hooks/useFilePreUpload";
import {
  toChatMessageAttachments,
  useBackgroundTempUpload,
} from "@/shared/hooks/useBackgroundTempUpload";
import { useS3FileDownload } from "@/shared/files/useS3FileDownload";
import { cn } from "@/shared/ui/cn";
import {
  PracticeTransferDetailChatDialog,
  type PracticeTransferDialogFileItem,
  type PracticeTransferDialogSummaryItem,
} from "@/shared/components/PracticeTransferDetailChatDialog";
import { LabPracticeFeeSurchargeControl } from "@/shared/components/practice/LabPracticeFeeSurchargeControl";
import { CounterpartyMemoStrip } from "@/shared/components/practice/CounterpartyMemoStrip";
import { parsePracticeTransferFeeQuote } from "@/shared/practice/practiceTransferFeeQuote";
import { normalizeLabFeeMultiplier, formatLabFeeMultiplierLabel, missingLabFeeItemNames, labFeeItemNamesNeededForToothWorks } from "@/shared/practice/labFeeSchedule";
import { parseStarDowngrade, parseLabRatingSummary } from "@/shared/practice/practiceLabRating";
import {
  LAB_PRACTICE_PARTNER_MEMO_MAX,
  parseLabPracticePartnerMemoPublic,
  type LabPracticePartnerMemoPublic,
} from "@/shared/practice/labPracticePartnerMemo";
import { buildPracticeWorkPeriodSummaryItem } from "@/shared/practice/practiceWorkPeriod";
import { buildPracticeTransferDateSummaryItems } from "@/shared/practice/practiceSenderTransferDetailModel";
import { useRequestorBusinessAccess } from "@/shared/business/useRequestorBusinessAccess";
import { REQUESTOR_KIND_LABEL } from "@/shared/business/requestorCapabilities";
import { PracticeFileTransferPage } from "@/pages/practice/PracticeFileTransferPage";
import { DesignQueueSection } from "@/pages/requestor/design/DesignQueueSection";
import { RequestorPracticePageSkeleton } from "@/shared/ui/skeletons/RequestorPracticePageSkeleton";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
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
  isLabReceiveHiddenTerminalStatus,
  listPracticeTransferAbutsCustomAbutmentToothWorks,
  listPracticeTransferPendingProstheticSlots,
  practiceTransferAbutmentMachiningStarted,
  practiceTransferHasCustomAbutment,
  practiceTransferLabReceiveUnreadBadgeCount,
  practiceTransferNeedsMoreAbutmentDesigns,
  resolvePracticeLabReceiveWorkActionState,
  type PracticeTransferLabReceiveFile as ReceivedPracticeFile,
  type PracticeTransferLabReceiveItem as ReceivedPracticeTransfer,
} from "@/shared/practice/practiceTransferLabReceive";
import {
  filterPracticeTransferFiles,
  getPracticeTransferFileExtension,
  PRACTICE_TRANSFER_ACCEPT,
  PRACTICE_TRANSFER_STL_ACCEPT,
} from "@/shared/practice/practiceTransferAccept";
import {
  LAB_RECEIVE_ABUTMENT_UPLOAD_HINT,
  LAB_RECEIVE_PROSTHETIC_UPLOAD_HINT,
  PracticeLabReceiveWorkActionsBar,
} from "@/shared/components/practice/PracticeLabReceiveWorkActionsBar";
import {
  pickPracticeTransferFilesViaInput,
} from "@/shared/components/practice/PracticeTransferFileDropTarget";
import {
  resolvePracticeTransferListPatientName,
  resolvePracticeTransferListToothNumbers,
} from "@/shared/components/practice/PracticeRecentTransferListCardDetail";
import { toKstYmd, toKstYmdLoose } from "@/shared/date/kst";
import { normalizeLabReceiveCalendarDateKey } from "@/shared/practice/labReceiveCalendarDateKey";
import { normalizeLabReceiveCalendarHiddenWeekdays } from "@/shared/practice/labReceiveCalendarHiddenWeekdays";
import {
  buildLabReceiveCalendarYmdRange,
  buildPracticeTransferCalendarApiQuery,
} from "@/shared/practice/labReceiveCalendarYmdRange";
import {
  PRACTICE_ABUTMENT_PROGRESS_FIELD_LABEL,
  getPracticeAbutmentDeliveryChipLabel,
  getPracticeAbutmentDeliveryLabel,
  practiceAbutmentProgressValueClassName,
  type PracticeAbutmentDeliveryInfo,
} from "@/shared/shipping/hanjinTrackingLabel";
import {
  PracticeRecentTransfersCalendar,
  expandPracticeCalendarChipsByArrivalDates,
  resolvePracticeCalendarStatusTone,
  type PracticeCalendarChipItem,
  type PracticeCalendarDateKey,
} from "@/pages/practice/components/PracticeRecentTransfersCalendar";
import {
  PracticeStatusFilterBadges,
  PracticeStatusFilterEmptyHint,
  type PracticeStatusFilterBadgeItem,
} from "@/pages/practice/components/PracticeStatusFilterBadges";
import { LabReceiveUnreadNotice } from "@/pages/practice/components/LabReceiveUnreadNotice";
import {
  labFeeSettingsFromAcceptPath,
  LAB_FEE_UNCONFIGURED_REASON,
  readLabFeeScheduleConfigured,
} from "@/features/settings/LabFeeSetupPrompt";
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

type LabReceiveStatusFilterKey =
  | "발송완료"
  | "의뢰수락"
  | "작업완료"
  | "포장.발송"
  | "리메이크";

/** 기본 ON — 상태 전부. 「기본」 리셋도 이 집합. */
const LAB_RECEIVE_DEFAULT_ON_STATUS_FILTERS: readonly LabReceiveStatusFilterKey[] = [
  "발송완료",
  "의뢰수락",
  "작업완료",
  "포장.발송",
  "리메이크",
];

const createLabReceiveStatusFilterSet = (
  keys: readonly LabReceiveStatusFilterKey[] = LAB_RECEIVE_DEFAULT_ON_STATUS_FILTERS,
) => new Set<LabReceiveStatusFilterKey>(keys);

/** 독립 다중 on/off: 키를 Set에 추가/제거. 전부 off(빈 Set) 허용. */
const toggleLabReceiveStatusFilter = (
  prev: ReadonlySet<LabReceiveStatusFilterKey>,
  key: LabReceiveStatusFilterKey,
) => {
  const next = new Set<LabReceiveStatusFilterKey>(prev);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
};

const isLabReceiveStatusFilterDefault = (
  selected: ReadonlySet<LabReceiveStatusFilterKey>,
) => {
  if (selected.size !== LAB_RECEIVE_DEFAULT_ON_STATUS_FILTERS.length) return false;
  return LAB_RECEIVE_DEFAULT_ON_STATUS_FILTERS.every((k) => selected.has(k));
};

const labTransferMatchesStatusFilters = (
  transfer: ReceivedPracticeTransfer,
  selected: ReadonlySet<LabReceiveStatusFilterKey>,
  unreadCount = 0,
) => {
  // 미확인은 상태 필터 on/off·전부 off와 무관하게 항상 캘린더 표시.
  if (Math.max(0, Number(unreadCount || 0)) > 0) return true;

  if (selected.size === 0) return false;
  const status = getTransferDisplayStatus(transfer);
  if (selected.has("리메이크") && transfer.isRemake) return true;
  if (selected.has("의뢰수락") && status === "의뢰수락") return true;
  if (selected.has("작업완료") && status === "작업완료") return true;
  if (selected.has("포장.발송") && status === "생산진행") return true;
  if (
    selected.has("발송완료") &&
    (status === "발송완료" ||
      status === "수신완료" ||
      status === "자동매칭" ||
      status === "하청대기")
  ) {
    return true;
  }
  return false;
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
  const queryClient = useQueryClient();
  const storedCalendarDateKey = useAuthStore(
    (s) => s.user?.labReceiveCalendarDateKey,
  );
  const setStoredCalendarDateKey = useAuthStore(
    (s) => s.setLabReceiveCalendarDateKey,
  );
  const storedHiddenWeekdays = useAuthStore(
    (s) => s.user?.labReceiveCalendarHiddenWeekdays,
  );
  const setStoredHiddenWeekdays = useAuthStore(
    (s) => s.setLabReceiveCalendarHiddenWeekdays,
  );
  const navigate = useNavigate();
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
    exoCadVersion,
    setExoCadVersion,
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
  const [receivedTransferUnreadCount, setReceivedTransferUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilters, setStatusFilters] = useState<Set<LabReceiveStatusFilterKey>>(() =>
    createLabReceiveStatusFilterSet(),
  );
  const [dateKey, setDateKey] = useState<PracticeCalendarDateKey>(() =>
    normalizeLabReceiveCalendarDateKey(storedCalendarDateKey),
  );
  const [cursorYmd, setCursorYmd] = useState(() => toKstYmd(new Date()) || "");
  const [hiddenWeekdays, setHiddenWeekdays] = useState<number[]>(() =>
    normalizeLabReceiveCalendarHiddenWeekdays(storedHiddenWeekdays),
  );
  const calendarYmdRange = useMemo(
    () => buildLabReceiveCalendarYmdRange(cursorYmd || toKstYmd(new Date()) || ""),
    [cursorYmd],
  );

  useEffect(() => {
    if (
      storedCalendarDateKey !== "orderDate" &&
      storedCalendarDateKey !== "arrivalDate"
    ) {
      return;
    }
    setDateKey(storedCalendarDateKey);
  }, [storedCalendarDateKey]);

  useEffect(() => {
    if (storedHiddenWeekdays == null) return;
    setHiddenWeekdays(
      normalizeLabReceiveCalendarHiddenWeekdays(storedHiddenWeekdays),
    );
  }, [storedHiddenWeekdays]);

  const handleCalendarDateKeyChange = useCallback(
    (key: PracticeCalendarDateKey) => {
      const next = normalizeLabReceiveCalendarDateKey(key);
      setDateKey(next);
      setStoredCalendarDateKey(next);
      if (!token) return;
      void apiFetch({
        path: "/api/users/lab-receive-calendar-date-key",
        method: "PUT",
        token,
        jsonBody: { dateKey: next },
      }).catch(() => {
        // 저장 실패는 UX를 막지 않음 — 다음 로그인 시 서버 값으로 복원
      });
    },
    [setStoredCalendarDateKey, token],
  );

  const handleHiddenWeekdaysChange = useCallback(
    (nextRaw: number[]) => {
      const next = normalizeLabReceiveCalendarHiddenWeekdays(nextRaw);
      setHiddenWeekdays(next);
      setStoredHiddenWeekdays(next);
      if (!token) return;
      void apiFetch({
        path: "/api/users/lab-receive-calendar-hidden-weekdays",
        method: "PUT",
        token,
        jsonBody: { hiddenWeekdays: next },
      }).catch(() => {
        // 저장 실패는 UX를 막지 않음 — 다음 로그인 시 서버 값으로 복원
      });
    },
    [setStoredHiddenWeekdays, token],
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<ReceivedPracticeTransfer | null>(null);
  /** 열 때 탭 고정 — mark-read 후 isRead 갱신으로 탭이 바뀌지 않게 */
  const [dialogInitialPanelTab, setDialogInitialPanelTab] = useState<"detail" | "chat">(
    "detail",
  );
  const [acceptBusy, setAcceptBusy] = useState(false);
  const [rejectBusy, setRejectBusy] = useState(false);
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);
  const rejectTargetRef = useRef<ReceivedPracticeTransfer | null>(null);
  const [openSubcontractBusy, setOpenSubcontractBusy] = useState(false);
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
  const designConfirmFileUpload = useMemo(() => {
    if (!designConfirmFile || !designConfirmOpen) return null;
    const progress = uploadProgress[toTempUploadFileKey(designConfirmFile)];
    if (!progress) {
      return { percent: 0, label: "파일 업로드 중…" };
    }
    if (progress.status === "done") return null;
    if (progress.status === "error") {
      return { percent: progress.percent, label: "업로드 실패" };
    }
    const percent = Math.max(0, Math.min(100, Math.round(progress.percent)));
    return { percent, label: `파일 업로드 중… ${percent}%` };
  }, [designConfirmFile, designConfirmOpen, uploadProgress]);
  const designConfirmTeethOptions = useMemo(() => {
    const fromPending = designConfirmPendingMetas
      .map((meta) => String(meta.tooth || "").trim())
      .filter(Boolean);
    const teeth =
      fromPending.length > 0
        ? fromPending
        : listPracticeTransferAbutsCustomAbutmentToothWorks(
            designConfirmTransfer,
          )
            .map((row) => String(row.toothNumber || "").trim())
            .filter(Boolean);
    return [...new Set(teeth)].map((tooth) => ({ id: tooth, label: tooth }));
  }, [designConfirmPendingMetas, designConfirmTransfer?.toothWorksSummary]);
  const [splitAskState, setSplitAskState] =
    useState<LabReceiveSplitAskState | null>(null);
  const [workUploadState, setWorkUploadState] =
    useState<LabReceiveWorkUploadState | null>(null);
  const [workUploadBusy, setWorkUploadBusy] = useState(false);
  /** 드롭/파일오픈으로 시작한 S3 사전업로드 추적(채팅 드롭존 프로그레스) */
  const [workUploadTrackedFiles, setWorkUploadTrackedFiles] = useState<File[]>(
    [],
  );
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
    const viewerIsInternalLab = String(user?.role || "").trim() === "internalLab";
    return messages.map((message) => {
      const senderId = String(message.sender?._id || "");
      const name = anonymizeAutoMatchChatSenderName({
        matchingMode: selectedTransfer?.matchingMode,
        openPool: selectedTransfer?.autoMatch?.openPool,
        subcontracted: selectedTransfer?.autoMatch?.subcontracted,
        practiceBusinessName: selectedTransfer?.practice?.businessName,
        viewerIsInternalLab,
        isOwn: senderId === currentUserId,
        counterpartLabel: "치과",
        name: String(message.sender?.name || ""),
      });
      return {
        ...message,
        sender: { ...message.sender, name },
      };
    });
  }, [
    messages,
    selectedTransfer?.matchingMode,
    selectedTransfer?.autoMatch?.openPool,
    selectedTransfer?.autoMatch?.subcontracted,
    selectedTransfer?.practice?.businessName,
    user?.id,
    user?.role,
  ]);

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
              priorityUntil: autoMatchRaw.priorityUntil
                ? String(autoMatchRaw.priorityUntil)
                : null,
              priorityActive: Boolean(autoMatchRaw.priorityActive),
              priorityLabForMe: Boolean(autoMatchRaw.priorityLabForMe),
              canOpenSubcontract: Boolean(autoMatchRaw.canOpenSubcontract),
              subcontracted: Boolean(autoMatchRaw.subcontracted),
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
          orderDates: (() => {
            const fromApi = Array.isArray(r.orderDates)
              ? (r.orderDates as unknown[])
                  .map((d) => String(d || "").trim())
                  .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
              : [];
            const current = String(
              r.orderDate || parsedMemo.orderDate || "",
            ).trim();
            if (fromApi.length > 0) {
              return fromApi.includes(current) || !current
                ? fromApi
                : [...fromApi, current];
            }
            return current ? [current] : [];
          })(),
          arrivalDates: (() => {
            const fromApi = Array.isArray(r.arrivalDates)
              ? (r.arrivalDates as unknown[])
                  .map((d) => String(d || "").trim())
                  .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
              : [];
            const current = String(
              r.arrivalDate || parsedMemo.arrivalDate || "",
            ).trim();
            if (fromApi.length > 0) {
              return fromApi.includes(current) || !current
                ? fromApi
                : [...fromApi, current];
            }
            return current ? [current] : [];
          })(),
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
          abutmentDeliveryInfo:
            r.abutmentDeliveryInfo && typeof r.abutmentDeliveryInfo === "object"
              ? (r.abutmentDeliveryInfo as PracticeAbutmentDeliveryInfo)
              : null,
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
          practicePartnerMemo: parseLabPracticePartnerMemoPublic(
            r.practicePartnerMemo,
          ),
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

  const fetchCalendarTransfers = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!token) return;
      const silent = options?.silent === true;

      if (!silent) setLoading(true);
      if (!silent) setError("");

      try {
        const qs = buildPracticeTransferCalendarApiQuery(calendarYmdRange, dateKey);
        const res = await apiFetch<unknown>({
          path: `/api/practice/transfers/received?${qs}`,
          method: "GET",
          token,
        });

        if (!res.ok) {
          const body =
            res.data && typeof res.data === "object"
              ? (res.data as Record<string, unknown>)
              : {};
          if (!silent) {
            setTransfers([]);
            setError(String(body.message || "치과 전송 내역 조회에 실패했습니다."));
          }
          return;
        }

        const parsed = parseTransfersBody(res.data);
        const mapped = mapTransferRows(parsed.transfers);

        setTransfers(mapped);
        setSelectedTransfer((prev) => {
          if (!prev) return prev;
          const key = String(prev.transferId || prev._id || "").trim();
          if (!key) return prev;
          const next = mapped.find(
            (row) =>
              String(row.transferId || "").trim() === key ||
              String(row._id || "").trim() === key,
          );
          return next || prev;
        });

        emitUnreadBadgeRefresh(parsed.unreadCount);
        setReceivedTransferUnreadCount(Math.max(0, Number(parsed.unreadCount || 0)));
        void reopenStuckTransfers(mapped);
      } catch {
        if (!silent) {
          setTransfers([]);
          setError("치과 전송 내역 조회 중 오류가 발생했습니다.");
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [
      calendarYmdRange,
      dateKey,
      emitUnreadBadgeRefresh,
      mapTransferRows,
      parseTransfersBody,
      reopenStuckTransfers,
      token,
    ],
  );

  const loadCalendarTransfers = useCallback(
    async (options?: { silent?: boolean }) => {
      await fetchCalendarTransfers(options);
    },
    [fetchCalendarTransfers],
  );

  const hasLoadedCalendarRef = useRef(false);

  useEffect(() => {
    if (!token) {
      setTransfers([]);
      setError("로그인이 필요합니다.");
      hasLoadedCalendarRef.current = false;
      return;
    }
    // 스크롤로 주가 바뀔 때는 스피너 없이 debounce 후 3주 구간만 재조회
    const silent = hasLoadedCalendarRef.current;
    const delayMs = silent ? 220 : 0;
    const timer = window.setTimeout(() => {
      void loadCalendarTransfers({ silent }).then(() => {
        hasLoadedCalendarRef.current = true;
      });
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [loadCalendarTransfers, token]);

  const removeLabReceiveTransferFromList = useCallback(
    (transfer: Pick<ReceivedPracticeTransfer, "_id" | "transferId">) => {
      const transferId = String(transfer.transferId || "").trim();
      const mongoId = String(transfer._id || "").trim();
      setTransfers((prev) =>
        prev.filter(
          (row) =>
            (transferId
              ? String(row.transferId || "").trim() !== transferId
              : true) &&
            (mongoId ? String(row._id || "").trim() !== mongoId : true),
        ),
      );
      setSelectedTransfer((prev) => {
        if (!prev) return prev;
        if (transferId && String(prev.transferId || "").trim() === transferId) {
          return null;
        }
        if (mongoId && String(prev._id || "").trim() === mongoId) {
          return null;
        }
        return prev;
      });
    },
    [],
  );

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
      const affectedTransferIds = Array.isArray(payload.affectedTransfers)
        ? payload.affectedTransfers
            .map((row) =>
              String(
                row && typeof row === "object"
                  ? (row as { transferId?: unknown }).transferId || ""
                  : "",
              ).trim(),
            )
            .filter(Boolean)
        : [];
      const removedTransferIdSet = new Set(
        [transferId, ...affectedTransferIds].filter(Boolean),
      );
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
          (action === "content-updated" && payload.retargetedAway === true) ||
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

      // 치과 의뢰 삭제(deleted) fan-out는 transferId 없이 affectedTransfers만 올 수 있다.
      if (type === "practice:transfer-updated" && isRemovedEvent && removedTransferIdSet.size > 0) {
        setTransfers((prev) =>
          prev.filter((row) => !removedTransferIdSet.has(row.transferId)),
        );
        setSelectedTransfer((prev) => {
          if (!prev || !removedTransferIdSet.has(prev.transferId)) return prev;
          return null;
        });
        setDialogOpen(false);
        if (hasUnreadCount) {
          emitUnreadBadgeRefresh(unreadCount);
        }
        // 목록 API가 삭제 건을 제외하므로 reload로도 재유입되지 않는다.
        if (realtimeReloadTimerRef.current) {
          window.clearTimeout(realtimeReloadTimerRef.current);
        }
        realtimeReloadTimerRef.current = window.setTimeout(() => {
          void loadCalendarTransfers({ silent: true });
        }, 140);
        return;
      }

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
          void loadCalendarTransfers({ silent: true });
          if (hasUnreadCount) {
            emitUnreadBadgeRefresh(unreadCount);
          }
          return;
        }
        if (action === "lab-rejected") {
          const transferMongoId = String(payload.transferMongoId || "").trim();
          removeLabReceiveTransferFromList({
            transferId,
            _id: transferMongoId || transferId,
          });
          if (dialogOpen && String(selectedTransfer?.transferId || "").trim() === transferId) {
            setDialogOpen(false);
            chatRoomResolveSeqRef.current += 1;
            setActiveChatRoom(null);
            setChatMessages([]);
            setChatDraft("");
            setChatReplyTo(null);
            chatUploads.clear();
            setChatError("");
            resetDownloads();
          }
          if (hasUnreadCount) {
            emitUnreadBadgeRefresh(unreadCount);
          }
          return;
        }
        if (action === "rejected") {
          removeLabReceiveTransferFromList({
            transferId,
            _id: String(payload.transferMongoId || "").trim() || transferId,
          });
          if (dialogOpen && String(selectedTransfer?.transferId || "").trim() === transferId) {
            setDialogOpen(false);
            chatRoomResolveSeqRef.current += 1;
            setActiveChatRoom(null);
            setChatMessages([]);
            setChatDraft("");
            setChatReplyTo(null);
            chatUploads.clear();
            setChatError("");
            resetDownloads();
          }
          if (hasUnreadCount) {
            emitUnreadBadgeRefresh(unreadCount);
          }
          return;
        }
        if (!isRemovedEvent) {
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
        action === "content-updated" ||
        isRemovedEvent ||
        !transferId;

      if (shouldReload) {
        if (realtimeReloadTimerRef.current) {
          window.clearTimeout(realtimeReloadTimerRef.current);
        }
        realtimeReloadTimerRef.current = window.setTimeout(() => {
          void loadCalendarTransfers({ silent: true });
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

  const baseFilteredTransfers = useMemo(() => {
    // 치과 삭제 + 기공소 거부·작업취소(취소)는 수신·캘린더에서 제외.
    const visible = transfers.filter((t) => {
      const raw = String(t.status || "").trim().toLowerCase();
      if (raw === "deleted" || raw === "canceled" || raw === "cancelled") {
        return false;
      }
      return !isLabReceiveHiddenTerminalStatus(getTransferDisplayStatus(t));
    });
    const query = search.trim().toLowerCase();
    if (!query) return visible;

    return visible.filter((t) => {
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
  }, [search, transfers]);

  const chatUnreadByTransferId = useMemo(() => {
    const map = new Map<string, number>();
    for (const room of rooms) {
      const transferId = String(
        room.relatedPracticeTransferId?.transferId || "",
      ).trim();
      if (!transferId) continue;
      map.set(transferId, Math.max(0, Number(room.unreadCount || 0)));
    }
    return map;
  }, [rooms]);

  const transferUnreadBadgeCount = useCallback(
    (transfer: ReceivedPracticeTransfer) => {
      const transferId = String(transfer.transferId || transfer._id || "").trim();
      return practiceTransferLabReceiveUnreadBadgeCount(
        transfer,
        chatUnreadByTransferId.get(transferId) || 0,
      );
    },
    [chatUnreadByTransferId],
  );

  const statusCounts = useMemo(() => {
    const counts = baseFilteredTransfers.reduce(
      (acc, transfer) => {
        const status = getTransferDisplayStatus(transfer);
        if (status === "작업완료") acc.completed += 1;
        else if (status === "생산진행") acc.shipping += 1;
        else if (status === "의뢰수락") acc.accepted += 1;
        else if (
          status === "발송완료" ||
          status === "수신완료" ||
          status === "자동매칭" ||
          status === "하청대기"
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
        shipping: 0,
        remake: 0,
      },
    );
    return counts;
  }, [baseFilteredTransfers]);

  const statusUnreadCounts = useMemo(() => {
    const counts = {
      sent: 0,
      accepted: 0,
      completed: 0,
      shipping: 0,
      remake: 0,
    };
    for (const transfer of baseFilteredTransfers) {
      const unread = transferUnreadBadgeCount(transfer);
      if (unread <= 0) continue;
      const status = getTransferDisplayStatus(transfer);
      if (status === "작업완료") counts.completed += unread;
      else if (status === "생산진행") counts.shipping += unread;
      else if (status === "의뢰수락") counts.accepted += unread;
      else if (
        status === "발송완료" ||
        status === "수신완료" ||
        status === "자동매칭" ||
        status === "하청대기"
      ) {
        counts.sent += unread;
      }
      if (transfer.isRemake) counts.remake += unread;
    }
    return counts;
  }, [baseFilteredTransfers, transferUnreadBadgeCount]);

  const filteredTransfers = useMemo(
    () =>
      baseFilteredTransfers.filter((transfer) =>
        labTransferMatchesStatusFilters(
          transfer,
          statusFilters,
          transferUnreadBadgeCount(transfer),
        ),
      ),
    [baseFilteredTransfers, statusFilters, transferUnreadBadgeCount],
  );

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

  const calendarItems = useMemo((): PracticeCalendarChipItem[] => {
    const base = sortedFilteredTransfers.map((transfer) => {
      const clinic =
        transfer.matchingMode === "auto"
          ? "자동 매칭"
          : String(transfer.practice?.businessName || "").trim() || "-";
      const patient = resolvePracticeTransferListPatientName(transfer);
      const teeth = resolvePracticeTransferListToothNumbers(transfer);
      const surchargeMultiplier = normalizeLabFeeMultiplier(
        transfer.feeQuote?.labFeeMultiplier ?? transfer.labFeeMultiplier,
      );
      const surchargeLabel =
        surchargeMultiplier > 1
          ? formatLabFeeMultiplierLabel(surchargeMultiplier)
          : "";
      const deliveryLabel = getPracticeAbutmentDeliveryChipLabel({
        hasCustomAbutment: Boolean(transfer.hasCustomAbutment),
        abutmentDeliveryInfo: transfer.abutmentDeliveryInfo || null,
      });
      const transferId = String(transfer.transferId || transfer._id || "").trim();
      const linkedArrivalDates =
        Array.isArray(transfer.arrivalDates) && transfer.arrivalDates.length > 0
          ? transfer.arrivalDates
          : transfer.arrivalDate
            ? [transfer.arrivalDate]
            : [];
      const linkedOrderDates =
        Array.isArray(transfer.orderDates) && transfer.orderDates.length > 0
          ? transfer.orderDates
          : transfer.orderDate
            ? [transfer.orderDate]
            : [];
      return {
        id: transferId,
        orderDate: transfer.orderDate || transfer.createdAt,
        arrivalDate:
          transfer.arrivalDate || transfer.orderDate || transfer.createdAt,
        linkedArrivalDates,
        linkedOrderDates,
        colorKey:
          String(transfer.practiceBusinessAnchorId || "").trim() || clinic,
        statusTone: resolvePracticeCalendarStatusTone(
          getTransferDisplayStatus(transfer),
        ),
        isRemake: Boolean(transfer.isRemake),
        sortLabel: clinic,
        line: [clinic, patient || "—", teeth || "—", surchargeLabel, deliveryLabel]
          .filter(Boolean)
          .join(" / "),
        unreadCount: transferUnreadBadgeCount(transfer),
      };
    });
    return expandPracticeCalendarChipsByArrivalDates(base, dateKey);
  }, [dateKey, sortedFilteredTransfers, transferUnreadBadgeCount]);

  const calendarTransferById = useMemo(() => {
    const map = new Map<string, ReceivedPracticeTransfer>();
    for (const transfer of sortedFilteredTransfers) {
      const id = String(transfer.transferId || transfer._id || "").trim();
      if (!id) continue;
      map.set(id, transfer);
      const arrivalDates =
        Array.isArray(transfer.arrivalDates) && transfer.arrivalDates.length > 0
          ? transfer.arrivalDates
          : transfer.arrivalDate
            ? [transfer.arrivalDate]
            : [];
      for (const ymd of arrivalDates) {
        map.set(`${id}:arr:${ymd}`, transfer);
      }
      const orderDates =
        Array.isArray(transfer.orderDates) && transfer.orderDates.length > 0
          ? transfer.orderDates
          : transfer.orderDate
            ? [transfer.orderDate]
            : [];
      for (const ymd of orderDates) {
        map.set(`${id}:ord:${ymd}`, transfer);
      }
    }
    return map;
  }, [sortedFilteredTransfers]);

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
        selectedTransfer?.createdAt,
      ),
    [selectedTransfer?.arrivalDate, selectedTransfer?.createdAt, selectedTransfer?.orderDate],
  );

  const selectedTransferAbutmentDeliveryLabel = useMemo(
    () =>
      getPracticeAbutmentDeliveryLabel({
        hasCustomAbutment: Boolean(selectedTransfer?.hasCustomAbutment),
        abutmentDeliveryInfo: selectedTransfer?.abutmentDeliveryInfo || null,
      }),
    [
      selectedTransfer?.abutmentDeliveryInfo,
      selectedTransfer?.hasCustomAbutment,
    ],
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
          setReceivedTransferUnreadCount(unreadCount);
          emitUnreadBadgeRefresh(unreadCount);
        } else if (!transfer.isRead) {
          setReceivedTransferUnreadCount((prev) => Math.max(0, prev - 1));
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

      const feeScheduleRes = await apiFetch<{
        data?: { configured?: boolean; active?: boolean; items?: unknown[] };
        configured?: boolean;
        active?: boolean;
        items?: unknown[];
      }>({
        path: "/api/lab-trading-partners/fee-schedule",
        method: "GET",
        token,
      });
      const toothRows = parseToothWorks(transfer.toothWorksSummary || "");
      const feeBody =
        feeScheduleRes.data && typeof feeScheduleRes.data === "object"
          ? (feeScheduleRes.data as Record<string, unknown>)
          : {};
      const feeNested =
        feeBody.data && typeof feeBody.data === "object"
          ? (feeBody.data as Record<string, unknown>)
          : feeBody;
      const missingNames = missingLabFeeItemNames(
        { items: Array.isArray(feeNested.items) ? feeNested.items : [] },
        toothRows,
      );
      if (feeScheduleRes.ok) {
        const configured = readLabFeeScheduleConfigured(feeScheduleRes.data);
        if (configured === false || missingNames.length > 0) {
          navigate(
            labFeeSettingsFromAcceptPath(
              missingNames.length
                ? missingNames
                : labFeeItemNamesNeededForToothWorks(toothRows),
            ),
          );
          return false;
        }
      }

      const isOpenPool =
        transfer.matchingMode === "auto" && Boolean(transfer.autoMatch?.openPool);

      if (
        !isOpenPool &&
        (transfer.isAccepted ||
          transfer.isDownloaded ||
          transfer.requestorDownloadedAt)
      ) {
        return true;
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
              if (String(body.reason || "") === LAB_FEE_UNCONFIGURED_REASON) {
                const fromApi = Array.isArray(body.missingFeeNames)
                  ? body.missingFeeNames
                      .map((name) => String(name || "").trim())
                      .filter(Boolean)
                  : [];
                navigate(
                  labFeeSettingsFromAcceptPath(
                    fromApi.length
                      ? fromApi
                      : labFeeItemNamesNeededForToothWorks(
                          parseToothWorks(transfer.toothWorksSummary || ""),
                        ),
                  ),
                );
              } else if (String(body.message || "").includes("다른 기공소")) {
                void loadCalendarTransfers({ silent: true });
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
              setReceivedTransferUnreadCount(Math.max(0, unreadCount));
              emitUnreadBadgeRefresh(unreadCount);
            } else if (!transfer.isRead) {
              setReceivedTransferUnreadCount((prev) => Math.max(0, prev - 1));
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
      loadCalendarTransfers,
      mergeProductionRelatedRequestIds,
      navigate,
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
        const skipDesignConfirm =
          productionRawFromRes?.skipDesignConfirm !== false &&
          transfer.production?.skipDesignConfirm !== false;
        // 보철 파일 업로드=작업완료(디자인). skip 자동 confirmedAt이어도 출고로 올리지 않음.
        const apiStage = String(data.manufacturerStage || "").trim();
        const manufacturerStage =
          apiStage === "생산진행" && !skipDesignConfirm
            ? "생산진행"
            : "작업완료";
        const productionPatch = {
          shippingMode:
            productionRawFromRes?.shippingMode === "express"
              ? ("express" as const)
              : productionRawFromRes?.shippingMode === "normal"
                ? ("normal" as const)
                : transfer.production?.shippingMode || null,
          skipDesignConfirm,
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

  const beginWorkFilePreUpload = useCallback(
    (files: File[]) => {
      const next = Array.from(files || []).filter(Boolean);
      if (!next.length) return;
      setWorkUploadTrackedFiles(next);
      preUploadFiles(next);
    },
    [preUploadFiles],
  );

  const workUploadProgressSummary = useMemo(() => {
    // 어벗 3D 확인 모달이 열려 있으면 모달 바가 SSOT — 드롭존과 이중 표시 금지.
    if (designConfirmOpen) return null;
    const files =
      workUploadTrackedFiles.length > 0
        ? workUploadTrackedFiles
        : workUploadState?.files || [];
    // S3 진행만 드롭존 바에 표시. API 저장/완료(workUploadBusy)는 모달 버튼「처리 중」만.
    if (!files.length) return null;
    let sum = 0;
    let uploading = 0;
    let done = 0;
    let error = 0;
    for (const file of files) {
      const progress = uploadProgress[toTempUploadFileKey(file)] as
        | PreUploadFileProgress
        | undefined;
      if (!progress) {
        uploading += 1;
        continue;
      }
      sum += Math.max(0, Math.min(100, progress.percent));
      if (progress.status === "done") done += 1;
      else if (progress.status === "error") error += 1;
      else uploading += 1;
    }
    const s3Active = uploading > 0 || done + error < files.length;
    if (!s3Active) return null;
    const percent = Math.round(sum / files.length);
    return {
      active: true,
      percent,
      label: `업로드 중… ${percent}%`,
    };
  }, [
    designConfirmOpen,
    uploadProgress,
    workUploadState?.files,
    workUploadTrackedFiles,
  ]);

  useEffect(() => {
    if (workUploadBusy) return;
    if (workUploadState) return;
    if (designConfirmOpen) return;
    if (!workUploadTrackedFiles.length) return;
    const allSettled = workUploadTrackedFiles.every((file) => {
      const progress = uploadProgress[toTempUploadFileKey(file)];
      return progress?.status === "done" || progress?.status === "error";
    });
    if (!allSettled) return;
    const timer = window.setTimeout(() => {
      setWorkUploadTrackedFiles([]);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [
    designConfirmOpen,
    uploadProgress,
    workUploadBusy,
    workUploadState,
    workUploadTrackedFiles,
  ]);

  const openWorkUploadDialog = useCallback(
    (state: LabReceiveWorkUploadState) => {
      beginWorkFilePreUpload(state.files);
      setWorkUploadState(state);
    },
    [beginWorkFilePreUpload],
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
      beginWorkFilePreUpload(assignments.map((row) => row.file));
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
      beginWorkFilePreUpload,
      markTransferComplete,
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
        // 분할 확인 전에는 S3에 올리지 않음 — 확인 후 지정 모달/제출에서 한 번만.
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

      const isAuto = String(transfer.matchingMode || "") === "auto";
      const canceledAt = new Date().toISOString();

      const rollbackPatch: Partial<ReceivedPracticeTransfer> = {
        isAccepted: transfer.isAccepted,
        isDownloaded: transfer.isDownloaded,
        requestorDownloadedAt: transfer.requestorDownloadedAt,
        requestorAcceptedAt: transfer.requestorAcceptedAt,
        workCanceledAt: transfer.workCanceledAt,
        manufacturerStage: transfer.manufacturerStage,
        targetLabName: transfer.targetLabName,
        autoMatch: transfer.autoMatch,
        production: transfer.production,
      };

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
        const apiPromise = apiFetch<unknown>({
          path: `/api/practice/transfers/${encodeURIComponent(transfer.transferId)}/mark-release`,
          method: "POST",
          token,
        });

        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, ACTION_UI_MIN_MS);
        });

        applyAcceptedLocalPatch(transfer, releasePatch);
        toast({
          title: "작업 취소",
          description: isAuto
            ? "수락을 취소해 공개 풀로 되돌렸습니다."
            : "의뢰수락을 취소했습니다.",
        });

        void apiPromise
          .then((res) => {
            if (!res.ok) {
              const body =
                res.data && typeof res.data === "object"
                  ? (res.data as Record<string, unknown>)
                  : {};
              const code = String(body.code || "").trim();
              applyAcceptedLocalPatch(transfer, rollbackPatch);
              if (code === "abutment_machining_started") {
                markLocalMachiningStarted();
              }
              toast({
                title:
                  code === "abutment_machining_started"
                    ? "의뢰 수락 취소 불가"
                    : "작업 취소 실패",
                description: String(
                  body.message ||
                    (code === "abutment_machining_started"
                      ? "어벗 가공이 시작된 의뢰는 수락 취소할 수 없습니다. 제조사가 준비 단계일 때만 가능합니다."
                      : "작업 취소 요청 중 오류가 발생했습니다."),
                ),
                variant: "destructive",
              });
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
            void queryClient.invalidateQueries({
              queryKey: ["requestor-dashboard-cards-summary"],
            });
            void queryClient.invalidateQueries({
              queryKey: ["requestor-bulk-shipping"],
            });
            void loadCalendarTransfers({ silent: true });
          })
          .catch(() => {
            applyAcceptedLocalPatch(transfer, rollbackPatch);
            toast({
              title: "작업 취소 실패",
              description: "작업 취소 요청 중 오류가 발생했습니다.",
              variant: "destructive",
            });
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
    [ACTION_UI_MIN_MS, applyAcceptedLocalPatch, loadCalendarTransfers, queryClient, toast, token],
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

        removeLabReceiveTransferFromList(transfer);

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
    [ACTION_UI_MIN_MS, chatUploads, removeLabReceiveTransferFromList, resetDownloads, toast, token],
  );

  const markTransferOpenSubcontract = useCallback(
    async (transfer: ReceivedPracticeTransfer) => {
      if (!token) return false;
      if (
        String(user?.role || "").trim() !== "internalLab" ||
        !transfer.autoMatch?.canOpenSubcontract
      ) {
        toast({
          title: "하청 전환 불가",
          description: "어벗츠기공소만 하청으로 전환할 수 있습니다.",
          variant: "destructive",
        });
        return false;
      }
      try {
        const [res] = await Promise.all([
          apiFetch<unknown>({
            path: `/api/practice/transfers/${encodeURIComponent(transfer.transferId)}/open-subcontract`,
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
            title: "하청 전환 실패",
            description: String(
              body.message || "하청 전환 중 오류가 발생했습니다.",
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
        applyAcceptedLocalPatch(transfer, {
          manufacturerStage: "자동매칭",
          autoMatch: {
            ...(transfer.autoMatch || {}),
            openPool: true,
            claimActive: false,
            priorityActive: false,
            canOpenSubcontract: false,
            priorityUntil:
              autoMatchRaw?.priorityUntil != null
                ? String(autoMatchRaw.priorityUntil)
                : new Date().toISOString(),
          },
        });
        void loadCalendarTransfers({ silent: true });
        toast({
          title: "하청 전환",
          description: "인증 기공소에 즉시 공개했습니다.",
        });
        return true;
      } catch {
        toast({
          title: "하청 전환 실패",
          description: "하청 전환 요청 중 오류가 발생했습니다.",
          variant: "destructive",
        });
        return false;
      }
    },
    [ACTION_UI_MIN_MS, applyAcceptedLocalPatch, loadCalendarTransfers, toast, token, user?.role],
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

  const handleRejectTransfer = useCallback(() => {
    if (!selectedTransfer || rejectBusy || acceptBusy || releaseBusy || openSubcontractBusy)
      return;
    rejectTargetRef.current = selectedTransfer;
    setRejectConfirmOpen(true);
  }, [
    acceptBusy,
    openSubcontractBusy,
    rejectBusy,
    releaseBusy,
    selectedTransfer,
  ]);

  const handleConfirmRejectTransfer = useCallback(async () => {
    const transfer = rejectTargetRef.current ?? selectedTransfer;
    if (!transfer || rejectBusy || acceptBusy || releaseBusy || openSubcontractBusy)
      return;
    setRejectBusy(true);
    try {
      const ok = await markTransferReject(transfer);
      if (ok) {
        setRejectConfirmOpen(false);
        rejectTargetRef.current = null;
      }
    } finally {
      setRejectBusy(false);
    }
  }, [
    acceptBusy,
    markTransferReject,
    openSubcontractBusy,
    rejectBusy,
    releaseBusy,
    selectedTransfer,
  ]);

  const handleOpenSubcontract = useCallback(async () => {
    if (
      !selectedTransfer ||
      openSubcontractBusy ||
      acceptBusy ||
      rejectBusy ||
      releaseBusy
    ) {
      return;
    }
    setOpenSubcontractBusy(true);
    try {
      await markTransferOpenSubcontract(selectedTransfer);
    } finally {
      setOpenSubcontractBusy(false);
    }
  }, [
    acceptBusy,
    markTransferOpenSubcontract,
    openSubcontractBusy,
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
    return pickPracticeTransferFilesViaInput({
      accept: PRACTICE_TRANSFER_STL_ACCEPT,
      multiple: true,
    });
  }, []);

  const pickProstheticResultFiles = useCallback((): Promise<File[]> => {
    return pickPracticeTransferFilesViaInput({
      accept: PRACTICE_TRANSFER_ACCEPT,
      multiple: true,
    }).then((files) => filterPracticeTransferFiles(files));
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
      beginWorkFilePreUpload(files);
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
      beginWorkFilePreUpload,
      buildDesignConfirmDefaults,
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
          title: "생산 의뢰 준비 실패",
          description:
            "어벗츠 생산 의뢰를 준비하지 못했습니다. 잠시 후 다시 시도해주세요.",
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
      const caTeethOrdered = listPracticeTransferAbutsCustomAbutmentToothWorks(
        workingTransfer,
      )
        .map((row) => String(row.toothNumber || "").trim())
        .filter(Boolean);
      const caToothSet = new Set(caTeethOrdered);

      const requestMetas = (
        await Promise.all(
          relatedIds.map(async (requestId, idx) => {
            const meta = await fetchRequestCaseInfos(requestId);
            if (meta.caseInfos?.hexVerificationSample === true) return null;
            const fromRequest = String(meta.caseInfos?.tooth || "").trim();
            const tooth = fromRequest || caTeethOrdered[idx] || "";
            return {
              requestId,
              tooth,
              caseInfos: meta.caseInfos,
              designCompletedAt: meta.designCompletedAt,
            };
          }),
        )
      ).filter((row): row is AbutmentPendingMeta => Boolean(row));

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

      // 심플어벗·치식 외 relatedRequestIds(레거시 혼입)는 업로드 대상에서 제외
      let pendingMetas = enrichedMetas.filter((meta) => {
        if (meta.designCompletedAt) return false;
        const tooth = String(meta.tooth || "").trim();
        if (tooth && existingTeeth.has(tooth)) return false;
        if (caToothSet.size > 0) {
          if (!tooth || !caToothSet.has(tooth)) return false;
        }
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
        // 분할 확인 전에는 S3에 올리지 않음 — 확인 후 디자인 모달에서 한 번만.
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
          // 구강스캔으로: 치과 skipDesignConfirm 유지(업로드로 강제 생략하지 않음)
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
    setSplitAskState(null);
  }, []);

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
    async (transfer: ReceivedPracticeTransfer, event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const id = String(transfer.transferId || transfer._id || "").trim();
      if (!id || cardActionBusyId) return;
      const files = await pickProstheticResultFiles();
      if (!files.length) return;
      beginCompleteWithFiles(transfer, files);
    },
    [beginCompleteWithFiles, cardActionBusyId, pickProstheticResultFiles],
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

  const dialogWorkFileDrop = useMemo(() => {
    if (!selectedTransfer) return null;
    const workState = resolvePracticeLabReceiveWorkActionState(selectedTransfer);
    if (!workState.showWorkActions) return null;
    const transferKey = String(
      selectedTransfer.transferId || selectedTransfer._id || "",
    ).trim();
    if (!transferKey) return null;
    const rowBusy = cardActionBusyId === transferKey || workUploadBusy;
    const needsAbutment = workState.needsMoreAbutmentDesigns;
    return {
      fileInputId: `practice-modal-work-drop-${transferKey}`,
      disabled: rowBusy,
      onFiles: (files: File[]) => handleCardDropFiles(selectedTransfer, files),
      guideText: needsAbutment
        ? "어벗 STL을 여기에 드래그하세요"
        : "보철 파일을 여기에 드래그하세요",
      guideDetail: needsAbutment
        ? LAB_RECEIVE_ABUTMENT_UPLOAD_HINT
        : LAB_RECEIVE_PROSTHETIC_UPLOAD_HINT,
      dropHint: needsAbutment ? "어벗 STL" : undefined,
      uploadProgressPercent: workUploadProgressSummary?.active
        ? workUploadProgressSummary.percent
        : null,
      uploadProgressLabel: workUploadProgressSummary?.active
        ? workUploadProgressSummary.label
        : null,
    };
  }, [
    selectedTransfer,
    cardActionBusyId,
    workUploadBusy,
    workUploadProgressSummary,
    handleCardDropFiles,
  ]);

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

  const handleCardOpenSubcontract = useCallback(
    async (transfer: ReceivedPracticeTransfer, event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const id = String(transfer.transferId || transfer._id || "").trim();
      if (!id || cardActionBusyIdRef.current) return;
      cardActionBusyIdRef.current = id;
      setCardActionBusyId(id);
      try {
        await markTransferOpenSubcontract(transfer);
      } finally {
        cardActionBusyIdRef.current = "";
        setCardActionBusyId("");
      }
    },
    [markTransferOpenSubcontract],
  );

  const openTransferDialog = useCallback(
    async (transfer: ReceivedPracticeTransfer) => {
      if (!token) return;
      const resolveSeq = ++chatRoomResolveSeqRef.current;

      // 미읽음(첫 확인) → 의뢰 상세, 이미 읽음(진행중) → 진행 상황
      setDialogInitialPanelTab(transfer.isRead ? "chat" : "detail");
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

  const labStatusFilterBadgeItems = useMemo((): PracticeStatusFilterBadgeItem[] => {
    return [
      {
        key: "발송완료",
        label: "의뢰",
        tone: "sent",
        count: statusCounts.sent,
        unreadCount: statusUnreadCounts.sent,
        tooltip: "치과에서 기공의뢰서를 보낸 후",
      },
      {
        key: "의뢰수락",
        label: "수락",
        tone: "accepted",
        count: statusCounts.accepted,
        unreadCount: statusUnreadCounts.accepted,
        tooltip: "기공소에서 작업을 수락한 후",
      },
      {
        key: "작업완료",
        label: "디자인",
        tone: "completed",
        count: statusCounts.completed,
        unreadCount: statusUnreadCounts.completed,
        tooltip: "어벗·보철 디자인 파일 업로드 후(치과·기공소 공통)",
      },
      {
        key: "포장.발송",
        label: "출고",
        tone: "shipping",
        count: statusCounts.shipping,
        unreadCount: statusUnreadCounts.shipping,
        tooltip: "연동 커스텀어벗 제조사 포장.발송·택배 진행 후",
      },
      {
        key: "리메이크",
        label: "리메이크",
        tone: "remake",
        count: statusCounts.remake,
        unreadCount: statusUnreadCounts.remake,
        tooltip: "출고·디자인 완료 건 리메이크 의뢰",
      },
    ];
  }, [statusCounts, statusUnreadCounts]);

  const loadedUnreadNoticeTotal = useMemo(() => {
    return baseFilteredTransfers.reduce(
      (sum, transfer) => sum + transferUnreadBadgeCount(transfer),
      0,
    );
  }, [baseFilteredTransfers, transferUnreadBadgeCount]);

  // 사이드바와 동일: 서버 미확인(전 기간) + 채팅 unread. 로드 합이 더 크면(창 안 채팅) 그쪽 사용.
  const unreadNoticeTotal = useMemo(() => {
    const chatUnreadTotal = Array.from(chatUnreadByTransferId.values()).reduce(
      (sum, n) => sum + Math.max(0, Number(n) || 0),
      0,
    );
    const sidebarAligned =
      Math.max(0, Number(receivedTransferUnreadCount || 0)) + chatUnreadTotal;
    return Math.max(loadedUnreadNoticeTotal, sidebarAligned);
  }, [
    chatUnreadByTransferId,
    loadedUnreadNoticeTotal,
    receivedTransferUnreadCount,
  ]);

  const unreadNoticeItems = useMemo(() => {
    return baseFilteredTransfers
      .map((transfer) => {
        const id = String(transfer.transferId || transfer._id || "").trim();
        const unreadCount = transferUnreadBadgeCount(transfer);
        if (!id || unreadCount <= 0) return null;
        const clinic =
          transfer.matchingMode === "auto"
            ? "자동 매칭"
            : String(transfer.practice?.businessName || "").trim() || "-";
        const patient = resolvePracticeTransferListPatientName(transfer);
        const teeth = resolvePracticeTransferListToothNumbers(transfer);
        return {
          id,
          unreadCount,
          label: [clinic, patient || "—", teeth || "—"].join(" / "),
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
  }, [baseFilteredTransfers, transferUnreadBadgeCount]);

  const jumpCalendarToTransferDate = useCallback(
    (transfer: ReceivedPracticeTransfer) => {
      const raw =
        dateKey === "arrivalDate"
          ? transfer.arrivalDate || transfer.orderDate || transfer.createdAt
          : transfer.orderDate || transfer.createdAt;
      const ymd = toKstYmdLoose(raw) || toKstYmd(raw);
      if (ymd) setCursorYmd(ymd);
    },
    [dateKey],
  );

  const resetLabStatusFiltersToDefault = useCallback(() => {
    setStatusFilters(createLabReceiveStatusFilterSet());
  }, []);

  const transferSearchAndBadges = (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <RequestSettingsToolbar
          designSoftwareLabel={String(designSoftwareValue || "").trim()}
          onOpenDesignSoftwareModal={openDesignSoftwareModal}
          anodizingEnabled={anodizingEnabled}
          anodizingSaving={anodizingSaving}
          onToggleAnodizing={handleToggleAnodizing}
        />
      </div>
      <PracticeStatusFilterBadges
        className="min-w-0 flex-1 sm:justify-center"
        items={labStatusFilterBadgeItems}
        activeKeys={statusFilters}
        onToggle={(key) =>
          setStatusFilters((prev) =>
            toggleLabReceiveStatusFilter(prev, key as LabReceiveStatusFilterKey),
          )
        }
        onResetToDefault={resetLabStatusFiltersToDefault}
        isDefault={isLabReceiveStatusFilterDefault(statusFilters)}
        countSuffix="건"
        gapBeforeKeys={["리메이크"]}
      />
    </div>
  );

  const transferListBody = (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {error ? <div className="shrink-0 text-sm text-destructive">{error}</div> : null}
      {!error && loading && calendarItems.length === 0 ? (
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-5">
          {Array.from({ length: 15 }).map((_, idx) => (
            <Skeleton key={`lab-cal-skel-${idx}`} className="h-24 w-full" />
          ))}
        </div>
      ) : null}
      {!error && !loading ? (
        <>
          <LabReceiveUnreadNotice
            unreadTotal={unreadNoticeTotal}
            items={unreadNoticeItems}
            onSelectItem={(id) => {
              const transfer =
                calendarTransferById.get(id) ||
                baseFilteredTransfers.find(
                  (row) =>
                    String(row.transferId || row._id || "").trim() === id,
                );
              if (!transfer) return;
              jumpCalendarToTransferDate(transfer);
              void openTransferDialog(transfer);
            }}
            className="shrink-0"
          />
          {statusFilters.size === 0 ? (
            <PracticeStatusFilterEmptyHint
              onResetToDefault={resetLabStatusFiltersToDefault}
              className="shrink-0"
            />
          ) : null}
          <PracticeRecentTransfersCalendar
            items={calendarItems}
            dateKey={dateKey}
            cursorYmd={cursorYmd}
            onCursorChange={setCursorYmd}
            onDateKeyChange={handleCalendarDateKeyChange}
            onSelectItem={(item) => {
              const transfer = calendarTransferById.get(item.id);
              if (transfer) void openTransferDialog(transfer);
            }}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="전송ID, 치과명, 환자명 검색"
            hiddenWeekdays={hiddenWeekdays}
            onHiddenWeekdaysChange={handleHiddenWeekdaysChange}
          />
        </>
      ) : null}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden px-3 sm:px-4">
      <DesignSoftwareSettingsDialog
        open={requestSettingsModalOpen}
        onOpenChange={handleRequestSettingsModalOpenChange}
        mode={designSoftwareMode}
        onModeChange={setDesignSoftwareMode}
        customValue={customDesignSoftware}
        onCustomValueChange={setCustomDesignSoftware}
        exoCadVersion={exoCadVersion}
        onExoCadVersionChange={setExoCadVersion}
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
        fileUploadPercent={designConfirmFileUpload?.percent ?? null}
        fileUploadLabel={designConfirmFileUpload?.label ?? null}
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
              선택한 파일만 먼저 올립니다. 나머지는 나중에 올릴 수 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleSplitAskDecline}>
              취소
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleSplitAskConfirm}>
              확인
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {showDesignQueue && !showTransfers ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            <div className="flex flex-wrap items-center justify-end gap-3">
              <PeriodFilter
                value={period}
                onChange={setPeriod}
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
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-1">
            <div className="shrink-0 space-y-3 pb-3 pr-1">
              {roleSwitcher ? (
                <div className="flex flex-wrap items-center gap-3">{roleSwitcher}</div>
              ) : null}
              {transferSearchAndBadges}
            </div>
            <div
              className={cn(
                "flex min-h-0 flex-1 flex-col overflow-hidden",
                showDesignQueue && "gap-4",
              )}
            >
              {showDesignQueue ? (
                <div className="shrink-0">
                  <DesignQueueSection listMode={designQueueListMode} />
                </div>
              ) : null}
              {transferListBody}
            </div>
          </div>
        ) : null}
      </div>

      {showTransfers ? (
      <>
      <PracticeTransferDetailChatDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open && rejectConfirmOpen) return;
          setDialogOpen(open);
          if (!open) {
            setRejectConfirmOpen(false);
            rejectTargetRef.current = null;
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
        initialPanelTab={dialogInitialPanelTab}
        chatHeaderAction={null}
        counterpartyMemoStrip={
          selectedTransfer?.practiceBusinessAnchorId ? (
            <CounterpartyMemoStrip
              viewer="lab"
              label="치과 메모"
              memo={selectedTransfer.practicePartnerMemo?.memo || ""}
              maxLength={LAB_PRACTICE_PARTNER_MEMO_MAX}
              trailingAction={
                <LabPracticeFeeSurchargeControl
                  practiceAnchorId={selectedTransfer.practiceBusinessAnchorId}
                  multiplier={selectedTransfer.labFeeMultiplier}
                  size="sm"
                  buttonLabel="평가"
                  dialogTitle="치과 평가"
                  variant="evaluate"
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
                    void loadCalendarTransfers({ silent: true });
                  }}
                />
              }
              onSave={async (memo) => {
                const practiceAnchorId = String(
                  selectedTransfer?.practiceBusinessAnchorId || "",
                ).trim();
                if (!practiceAnchorId || !token) return false;
                const res = await request<{
                  data?: {
                    practicePartnerMemo?: LabPracticePartnerMemoPublic | null;
                  };
                  message?: string;
                }>({
                  path: "/api/lab-trading-partners/practice-partner-memo",
                  method: "PUT",
                  token,
                  jsonBody: { practiceAnchorId, memo },
                });
                if (!res.ok) {
                  toast({
                    title: "치과 메모 저장 실패",
                    description: res.data?.message || "다시 시도해주세요.",
                    variant: "destructive",
                  });
                  return false;
                }
                const saved = res.data?.data?.practicePartnerMemo || null;
                setSelectedTransfer((prev) =>
                  prev && prev.practiceBusinessAnchorId === practiceAnchorId
                    ? { ...prev, practicePartnerMemo: saved }
                    : prev,
                );
                setTransfers((prev) =>
                  prev.map((row) =>
                    row.practiceBusinessAnchorId === practiceAnchorId
                      ? { ...row, practicePartnerMemo: saved }
                      : row,
                  ),
                );
                return true;
              }}
            />
          ) : null
        }
        summaryItems={[
          { label: "전송ID", value: selectedTransfer?.transferId || "-" },
          { label: "전송시각", value: selectedTransfer ? formatDateTime(selectedTransfer.createdAt) : "-" },
          { label: "치과", value:
            String(user?.role || "").trim() !== "internalLab" &&
            (selectedTransfer?.autoMatch?.openPool ||
              selectedTransfer?.autoMatch?.subcontracted)
              ? "비공개"
              : selectedTransfer?.practice.businessName || "-" },
          { label: "담당자", value:
            String(user?.role || "").trim() !== "internalLab" &&
            (selectedTransfer?.autoMatch?.openPool ||
              selectedTransfer?.autoMatch?.subcontracted)
              ? "비공개"
              : selectedTransfer?.practice.userName || "-" },
          { label: "환자명", value: selectedTransferPatientName || "-" },
          ...buildPracticeTransferDateSummaryItems({
            orderDate: selectedTransfer?.orderDate || "",
            arrivalDate: selectedTransfer?.arrivalDate || "",
            orderDates: selectedTransfer?.orderDates,
            arrivalDates: selectedTransfer?.arrivalDates,
          }),
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
          ...(selectedTransferAbutmentDeliveryLabel
            ? [
                {
                  label: PRACTICE_ABUTMENT_PROGRESS_FIELD_LABEL,
                  value: selectedTransferAbutmentDeliveryLabel,
                  valueClassName: practiceAbutmentProgressValueClassName(
                    selectedTransferAbutmentDeliveryLabel,
                  ),
                },
              ]
            : []),
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
        filesLabel="의뢰 파일 (구강 스캔, 쉐이드 포토 등)"
        files={
          (selectedTransfer?.files || []).map((file) => ({
            id: file.id,
            fileName: file.originalName,
            size: Number(file.size || 0),
            s3Key: String(file.s3Key || "").trim(),
          })) satisfies PracticeTransferDialogFileItem[]
        }
        oralScanAttachMode={null}
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
            selectedTransfer?.manufacturerStage === "작업취소",
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
        openSubcontractBusy={openSubcontractBusy}
        onOpenSubcontract={
          String(user?.role || "").trim() === "internalLab" &&
          selectedTransfer?.autoMatch?.canOpenSubcontract
            ? () => void handleOpenSubcontract()
            : undefined
        }
        orderDate={selectedTransfer?.orderDate || null}
        arrivalDate={selectedTransfer?.arrivalDate || null}
        orderedAt={selectedTransfer?.createdAt || null}
        releaseBusy={releaseBusy}
        onRelease={() => void handleReleaseTransfer()}
        workFileDrop={dialogWorkFileDrop}
        acceptedWorkActions={({ releaseAction }) => {
          if (!selectedTransfer) return releaseAction;
          const workState =
            resolvePracticeLabReceiveWorkActionState(selectedTransfer);
          if (
            !workState.showWorkActions &&
            !workState.showCompletedStageHeaderCancel
          ) {
            return releaseAction;
          }
          const transferKey = String(
            selectedTransfer.transferId || selectedTransfer._id || "",
          );
          const rowBusy = cardActionBusyId === transferKey || workUploadBusy;
          const completedCancelAction = workState.showCompletedStageHeaderCancel ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={cardActionBusyId === transferKey}
              className="h-8"
              onClick={(event) =>
                void handleCardAbutmentProductionCancel(
                  selectedTransfer,
                  event,
                )
              }
            >
              {cardActionBusyId === transferKey
                ? "처리 중..."
                : "작업 완료 취소"}
            </Button>
          ) : null;
          return (
            <PracticeLabReceiveWorkActionsBar
              transfer={selectedTransfer}
              busy={rowBusy}
              designConfirmBusy={designConfirmBusyId === transferKey}
              showProductionCancelInBar
              trailingActions={completedCancelAction || releaseAction}
              onDesignUpload={(event) =>
                void handleCardDesignUpload(selectedTransfer, event)
              }
              onAbutmentProductionCancel={(event) =>
                void handleCardAbutmentProductionCancel(
                  selectedTransfer,
                  event,
                )
              }
              onComplete={(event) =>
                void handleCardComplete(selectedTransfer, event)
              }
              onDesignConfirm={() => {
                void confirmAbutmentDesign(selectedTransfer);
              }}
            />
          );
        }}
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
      <ConfirmDialog
        open={rejectConfirmOpen}
        title="이 의뢰를 거부할까요?"
        description={
          <div className="space-y-1">
            {selectedTransfer?.transferId ? (
              <div className="text-sm text-muted-foreground">
                대상: {selectedTransfer.transferId}
              </div>
            ) : null}
            <div className="text-sm text-muted-foreground">
              {selectedTransfer?.matchingMode === "auto" &&
              selectedTransfer.autoMatch?.openPool
                ? "거부하면 다른 기공소에 계속 공개됩니다."
                : "거부하면 치과에 취소 상태로 전달됩니다."}
            </div>
          </div>
        }
        confirmLabel="거부"
        cancelLabel="취소"
        busy={rejectBusy}
        onConfirm={() => void handleConfirmRejectTransfer()}
        onCancel={() => {
          if (rejectBusy) return;
          setRejectConfirmOpen(false);
          rejectTargetRef.current = null;
        }}
      />
      </>
      ) : null}
    </div>
  );
}

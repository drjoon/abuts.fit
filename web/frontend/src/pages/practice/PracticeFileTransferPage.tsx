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
 * - 2026-08-28: 구강스캔 캘린더 진입 시 /my?page=1 병렬 조회 제거(캘린더 구간 API만). 상세·휴지통·전송 후 지연 로드.
 * - 2026-08-28: 의뢰 파일 — /my files[] 전부 표시(스캔·이미지). 단건 caseInfos.file 폴백만.
 * - 2026-08-28: 전송 시 draftFilesRef+로컬 잔여를 합치고, promote 동기화 완료를 기다림(파일 일부 누락 방지).
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
 * - 2026-08-24: 기공의뢰 작업영역 하단 여백 — h-full 제거해 스크롤 끝 pb가 전송 버튼 아래에 붙게 함.
 * - 2026-08-21: [기공소로 전송] API 성공 직후 버튼 해제·네비. 폼 리셋은 백그라운드.
 * - 2026-08-21: 의뢰상세 열 때 목록 silent 재조회로 어벗 디자인·컨펌 CTA 동기화.
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
 * - 2026-08-20: 임시저장/동기화는 완성형 한글 환자명만 필수(기공소는 전송 시).
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
 * - 2026-08-15: Express/Expert 공통 툴바 최근의뢰/임시저장/휴지통(다이얼로그).
 * - 2026-08-18: Expert 상단에도 새로 작성·최근 의뢰·임시저장·휴지통 버튼.
 * - 2026-08-26: 휴지통 이동 시 공유 chat-rooms refresh + 휴지통 unread 합산 제외(새로고침 없이 배지 감소).
 * - 2026-08-26: 휴지통 이동 시 채팅 rooms 재조회 — 최근의뢰·사이드 unread 즉시 감소.
 * - 2026-08-21: 「최근 의뢰」배지=사이드바와 동일 채팅 unread(작업취소 카운트 아님).
 * - 2026-08-21: 휴지통 취소 건도 기존 채팅방 열어 미확인 읽기 가능.
 * - 2026-08-18: Expert는 우측 목록을 빼고 작성 폼 전폭. 치식은 full 차트.
 * - 2026-08-15: 「새로 작성」을 기공의뢰 카드 위 툴바로 이동.
 * - 2026-08-15: 「새로 작성」을 모드 전환 바로 오른쪽으로. 익스프레스 진행률·스텝 한 줄.
 * - 2026-08-15: 익스프레스 스텝·진행률을 기공의뢰 제목과 같은 헤더 행(좌·우)에 둔다.
 * - 2026-08-15: 주문 후 1영업일 미수락 「수락대기」뱃지(최근의뢰·전체보기).
 * - 2026-08-16: 전체보기에서 휴지통 확인 후 최근의뢰 모달로 복귀(중첩 Confirm에 닫히지 않음).
 * - 2026-08-16: 기공소 거부·이미 취소 건이 「의뢰」로 남는 휴지통 이동 실패 수정.
 * - 2026-08-16: 기공소 취소 — 자동매칭은 재공개, 지정은 치과 「취소」로 다음 조치 유도.
 * - 2026-08-16: 최근전송 조치대기(작업취소) 알림 뱃지·카드 깜빡임 하이라이트.
 * - 2026-08-16: 취소 건 클릭 시 전용 모달로 거부 안내·기공소 재선택.
 * - 2026-08-16: 의뢰상세 작업 파일 — 어벗디자인(designFiles)·보철물(resultFiles) 기공소와 동일 표시.
 * - 2026-08-16: 최근의뢰·전체보기 의뢰상세 SSOT — practiceRecentTransferList + sender detail model.
 * - 2026-08-16: 리메이크 버튼을 목록 검색 옆으로 이동. 컨펌은 리메이크비 무료·배송비 차감 안내.
 * - 2026-08-17: 리메이크=카드 Repeat 아이콘(툴팁)·단건 확인. 검색창 옆 선택 일괄 버튼 제거.
 * - 2026-08-16: 최근의뢰 카드=시각+상태 / 주문일 / 치과도착일 / 기공소 / 환자명(전송ID·파일·기간·메모 덤프 제거).
 * - 2026-08-18: 수락 전(의뢰) 전송건을 폼에 불러와 수정. 삭제 후 재작성 대체.
 * - 2026-08-18: 의뢰 수정 저장 후 임시저장 목록 재조회를 기다리지 않음.
 * - 2026-08-18: 상세 「의뢰 수정」은 좌측 의뢰정보 상단. 목록 카드 메타는 1행 1항목.
 * - 2026-08-18: 기공의뢰 카드 외곽선 제거. 상단 5버튼을 동기화 상태 행으로 이동(Express/Expert).
 * - 2026-08-18: Express 보철물도 Expert와 같이 full 치식(16칸).
 * - 2026-08-19: 어벗츠기공소도 지정과 같이 첨부 없이 전송 가능.
 * - 2026-08-19: 전송 내역 캘린더·기공소 거부 모달에서 의뢰 취소(휴지통).
 * - 2026-08-20: 임시저장 미충족 시 상단 「동기화됨」자리에 완성형 한글 안내.
 * - web/frontend/src/shared/components/practice/PracticeTransferMobileOralPhotoIntake.tsx
 * - 2026-08-20: 모바일 구강스캔 — 환자명 후 구강포토 촬영·업로드·임시저장(기공소는 전송 시).
 * - 2026-08-20: 모바일 임시저장=최근과 같은 카드 시트. PC 드롭존에 모바일 쉐이드 안내.
 * - 2026-08-20: 구강포토 썸네일 — private S3 location 대신 blob/proxy 미리보기.
 * - 2026-08-25: 익스프레스에도 엑스퍼트와 같은 가이드투어 카드 배치. 투어 중 모드 전환·단계 동기화.
 * - 2026-08-25: 엑스퍼트 가이드투어 카드 — 헤더 버튼~기공소·환자·날짜 행 세로 맞춤(폭=주문-치과도착).
 * - 2026-08-25: 익스프레스 단계 표시 ↔ 가이드투어(기공소·환자·날짜) 위치 교체 — 투어는 상단 오른쪽, 단계는 헤더 필드 옆.
 * - 2026-08-25: 상단 가이드투어 — 기공소·환자·날짜·보철물 전체 투어(툴바 오른쪽 위).
 * - 2026-08-25: 상단 가이드투어 — 기공소·환자·날짜·보철물 전체 투어(휴지통 오른쪽).
 * - 2026-08-20: PC 첨부 목록에도 이미지 썸네일(모바일 동기화 포함).
 * - 2026-08-20: 구강포토 토스트 3초·닫기, CSP blob 썸네일, 클릭 미리보기, 동기화 반영.
 * - 2026-08-20: PC 썸네일 — S3 octet-stream MIME 보정·미리보기 fetch 중단 방지. 파일 전체삭제는 draft를 지우지 않고 빈 파일 스냅샷을 동기화.
 * - 2026-08-20: 폼 자동저장은 파일 목록을 보내지 않는다. PC/모바일 첨부는 같은 기공소·환자 draft에 append.
 * - 2026-08-20: 모바일↔PC 파일 추가는 draftId/fingerprint가 달라도 같은 기공소·환자면 파일 스냅샷을 반영한다.
 * - 2026-08-20: 원격 draft 파일은 union merge. autosave echo(파일 없음)가 업로드 직후 목록을 비우지 않게 한다.
 * - 2026-08-20: filesTouched/replace만 첨부 축소 허용. autosave HTTP가 소켓 반영을 덮지 않게 ref 동기화.
 * - 2026-08-20: 로컬 첨부는 peek 재실행 대신 ensureFilesUploaded로 이어서 draft append. iOS 카메라 복귀 후 focus에서도 재시도.
 * - 2026-08-28: 모바일 휴지통 — 의뢰현황과 동일 인셋 시트·헤더·카드 스타일.
 * - 2026-08-28: 모바일 — 메인 의뢰/휴지, 의뢰현황(+신규), 작성 모달 안내·휴지만. 모달 오픈 토스트 생략.
 * - 2026-08-28: 모바일 신규의뢰 — 인셋 시트·라운드·세이프에리어. 본문 패딩 확대.
 * - 2026-08-28: 모바일 신규의뢰 모달 — 퀵메뉴 1줄·헤더 배치, 촬영 CTA 축소.
 * - 2026-08-28: 모바일 헤더 액션 — 신규·임시·휴지 아이콘 버튼(한 줄).
 * - 2026-08-28: 모바일 목록 헤더에 신규의뢰 CTA(PC는 캘린더 날짜 클릭).
 * - 2026-08-28: 신규 의뢰 모달 — 새로작성·임시저장·휴지통·가이드투어를 DialogHeader로.
 * - 2026-08-28: 모드 전환(익스프레스) 제거·엑스퍼트 고정. 최근의뢰 좌·작성액션 우 묶음.
 * - 2026-08-28: 메인=전송 캘린더, 미래일 클릭·신규 의뢰=전체화면 작성 모달(도착일 지정).
 * - 2026-08-28: 캘린더 「신규 의뢰」버튼 → 도착일 클릭 안내(닫으면 계정 설정에 저장).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import {
  Trash2,
  RotateCcw,
  BookmarkPlus,
  ChevronsUpDown,
  Check,
  Download,
  Plus,
  Settings,
  Repeat,
  Pencil,
  X,
} from "lucide-react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PageFileDropZone } from "@/features/requests/components/PageFileDropZone";
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
import { RESPONSIVE } from "@/shared/ui/responsive";
import { usePeriodStore } from "@/store/usePeriodStore";
import { useToast } from "@/shared/hooks/use-toast";
import { apiFetch, invalidateApiGetCache, request } from "@/shared/api/apiClient";
import { parseFilenameWithRules } from "@/shared/filename/parseFilenameWithRules";
import { toTempUploadFileKey, useFilePreUpload } from "@/shared/hooks/useFilePreUpload";
import {
  toChatMessageAttachments,
  useBackgroundTempUpload,
} from "@/shared/hooks/useBackgroundTempUpload";
import { useS3FileDownload, buildS3ProxyDownloadUrl } from "@/shared/files/useS3FileDownload";
import { fetchS3BlobCached } from "@/shared/files/s3BlobCache";
import { type TempUploadedFile } from "@/shared/hooks/useS3TempUpload";
import { PRACTICE_TRANSFER_IMAGE_EXTENSIONS } from "@/shared/practice/practiceTransferAccept";
import { useAuthStore } from "@/store/useAuthStore";
import {
  PRACTICE_ACCEPTED_HINT,
  coerceAutoMatchLab,
  getBusinessLabel,
  usePracticeTransferStep1,
  isAutoMatchLab,
  isPinnedAbutsRecentLab,
  preferCachedAbutsLab,
  ABUTS_PINNED_LAB_SEED,
  type SearchBusinessResult,
} from "@/pages/practice/hooks/usePracticeTransferStep1";
import {
  useChatRooms,
  requestChatRoomsRefresh,
  type ChatRoom,
} from "@/shared/hooks/useChatRooms";
import { useChatMessages } from "@/shared/hooks/useChatMessages";
import { anonymizeAutoMatchChatSenderName } from "@/shared/practice/autoMatchIdentity";
import {
  resolveAutoMatchBudgetOrDefaults,
  type AbutsLabFeeCatalogItem,
  type PracticeTransferAutoMatchBudget,
} from "@/shared/practice/autoMatchBudget";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { DemoModeBadge } from "@/shared/demo/DemoModeBadge";
import { useAppEventDebouncedReload } from "@/shared/realtime/useAppEventDebouncedReload";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  PracticeTransferDetailChatDialog,
} from "@/shared/components/PracticeTransferDetailChatDialog";
import { PracticeLabRatingControl } from "@/shared/components/practice/PracticeLabRatingControl";
import { CounterpartyMemoStrip } from "@/shared/components/practice/CounterpartyMemoStrip";
import { PracticeTransferIntakeSection } from "@/shared/components/practice/PracticeTransferIntakeSection";
import {
  PracticeTransferMobileComposeToolbar,
  PracticeTransferMobileOralPhotoIntake,
} from "@/shared/components/practice/PracticeTransferMobileOralPhotoIntake";
import { useIsMobile } from "@/shared/hooks/use-mobile";
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
import {
  getExpressStepIdForGuideTourStep,
  getGuideTourStepForExpressStepId,
  type PracticeToothWorkGuideTourStep,
} from "@/shared/components/practice/PracticeToothWorkGuideTourBanner";
import { PracticeRecentTransfersAllModal } from "@/pages/practice/components/PracticeRecentTransfersAllModal";
import {
  PRACTICE_MY_TRANSFERS_PAGE_SIZE,
  canDeletePracticeTransferByStatus,
  canRemakePracticeTransferByStatus,
  canEditPracticeTransferByStatus,
  filterRequestsByPeriodAndSearch,
  groupPracticeRecentRequests,
  isPracticeTransferActionNeededStatus,
  isPracticeTransferTrashStatus,
  mapMyPracticeTransferApiRows,
  mergeOpenPracticeTransferFromRequestRows,
  collectPracticeRequestFiles,
  type PracticeRecentRequestItem,
  type PracticeRecentTransferFileItem,
  type PracticeRecentTransferItem,
} from "@/shared/practice/practiceRecentTransferList";
import { buildPracticeSenderTransferDetailModel } from "@/shared/practice/practiceSenderTransferDetailModel";
import {
  DEFAULT_AUTO_MATCH_MAX_LAB_RATING,
  DEFAULT_AUTO_MATCH_MIN_LAB_RATING,
  DEFAULT_PRACTICE_LAB_RATING_STARS,
  normalizeAutoMatchMaxLabRating,
  normalizeAutoMatchMinLabRating,
  normalizePracticeLabRatingMemo,
  normalizePracticeLabStars,
  PRACTICE_LAB_RATING_MEMO_MAX,
  resolveAutoMatchEligibleStarBand,
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
  DialogClose,
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
import { kstAddBusinessDays, kstYmdDiffDays } from "@/shared/date/kst";
import { PracticeRushConfirmDialog } from "@/shared/components/practice/PracticeRushConfirmDialog";
import {
  PRACTICE_WORK_PERIOD_BLOCK_MESSAGE,
  PRACTICE_WORK_PERIOD_LATE_WARNING_MESSAGE,
  PRACTICE_RUSH_ARRIVAL_BUSINESS_DAYS,
  getPracticeWorkPeriodDays,
  isPracticeWorkPeriodBlocked,
  isPracticeWorkPeriodLateWarning,
  shouldEnablePracticeRushProcessing,
} from "@/shared/practice/practiceWorkPeriod";
import {
  normalizeLabArrivalDefaults,
  resolveLabArrivalDefaultDays,
  upsertLabArrivalDefault,
  type PracticeLabArrivalDefault,
} from "@/shared/practice/labArrivalDefaults";
// - 2026-08-25: labArrivalDefaults — 기공소별 주문→치과도착 기본 일수.
import {
  PracticeTransferRequestCardMeta,
  practiceTransferStatusBadgeClass,
  resolvePracticeTransferListPatientName,
  resolvePracticeTransferListToothNumbers,
} from "@/shared/components/practice/PracticeRecentTransferListCardDetail";

type RecentRequestItem = PracticeRecentRequestItem;
type TransferFileItem = PracticeRecentTransferFileItem;
type RecentTransferItem = PracticeRecentTransferItem;

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
  filesTouched?: boolean;
  draftFilesMode?: string;
  forceResync?: boolean;
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

type EditingSentTransfer = {
  transferId: string;
  transferMongoId: string;
  orderDate: string;
};

const inferPracticeTransferFileMimetype = (fileName: string) => {
  const lower = String(fileName || "").trim().toLowerCase();
  const idx = lower.lastIndexOf(".");
  const ext = idx >= 0 ? lower.slice(idx) : "";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".bmp") return "image/bmp";
  if (ext === ".stl") return "model/stl";
  return "application/octet-stream";
};

const isPracticeOralPhotoPreviewable = (fileName: string, mimetype?: string) => {
  const mime = String(mimetype || "").trim().toLowerCase();
  if (mime.startsWith("image/") && !mime.includes("heic") && !mime.includes("heif")) {
    return true;
  }
  const lower = String(fileName || "").trim().toLowerCase();
  const idx = lower.lastIndexOf(".");
  const ext = idx >= 0 ? lower.slice(idx) : "";
  return PRACTICE_TRANSFER_IMAGE_EXTENSIONS.has(ext);
};

/** img 태그는 octet-stream blob을 그리지 못하므로 확장자로 image MIME을 보정한다. */
const blobForOralPhotoPreview = (source: Blob, fileName?: string) => {
  if (!(source instanceof Blob)) return source;
  const mime = String(source.type || "").trim().toLowerCase();
  if (mime.startsWith("image/") && !mime.includes("heic") && !mime.includes("heif")) {
    return source;
  }
  const inferred = inferPracticeTransferFileMimetype(String(fileName || ""));
  if (!inferred.startsWith("image/")) return source;
  return new Blob([source], { type: inferred });
};

const normalizeDraftTransferFileItems = (
  rows: unknown,
): DraftTransferFileItem[] =>
  Array.isArray(rows)
    ? rows
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

/** 원격 draft 파일은 union. 폼 autosave echo(파일 없음)가 업로드 직후 목록을 비우지 않게 한다. */
const mergeDraftTransferFileItems = (
  existing: DraftTransferFileItem[],
  incoming: DraftTransferFileItem[],
): DraftTransferFileItem[] => {
  const byId = new Map<string, DraftTransferFileItem>();
  for (const row of [...existing, ...incoming]) {
    const fileId = String(row.fileId || "").trim();
    if (fileId) byId.set(fileId, row);
  }
  return Array.from(byId.values());
};

const logPracticeFileSync = (
  step: string,
  detail?: Record<string, unknown>,
) => {
  try {
    console.info(`[practice-file-sync] ${step}`, detail || {});
  } catch {
    // ignore
  }
};

/** replace+filesTouched일 때만 축소/전체삭제. 그 외는 union(로컬 업로드 중 파일 보존). */
const resolveDraftFilesFromRemote = ({
  prevFiles,
  restoredFiles,
  filesTouched,
  draftFilesMode,
  forceResync,
  sameDraftId,
}: {
  prevFiles: DraftTransferFileItem[];
  restoredFiles: DraftTransferFileItem[];
  filesTouched: boolean;
  draftFilesMode: string;
  forceResync: boolean;
  sameDraftId: boolean;
}): DraftTransferFileItem[] => {
  const mode = String(draftFilesMode || "keep").trim().toLowerCase();
  const intentionalReplace =
    filesTouched && (mode === "replace" || (forceResync && mode !== "append"));
  if (intentionalReplace) {
    return restoredFiles;
  }
  // 레거시 이벤트(filesTouched 없음): 같은 draft의 빈 스냅샷은 전체삭제로만 본다.
  if (
    !filesTouched &&
    restoredFiles.length === 0 &&
    sameDraftId &&
    forceResync &&
    mode === "replace"
  ) {
    return [];
  }
  return mergeDraftTransferFileItems(prevFiles, restoredFiles);
};

const toDraftListSummary = (
  payload: PracticeTransferDraftPayload,
  myUserId: string,
): DraftListSummary | null => {
  const files = normalizeDraftTransferFileItems(payload.files);

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

const formatTransferMemoForDisplay = (rawMemo: string) =>
  formatPracticeTransferMemoDetailShared(rawMemo, { includeDateSummary: false }) ||
  formatTransferMemoForDisplayShared(rawMemo);

const makeTransferId = () => {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PTX-${t}-${r}`;
};

const DEFAULT_ARRIVAL_OFFSET_DAYS = 7;
const PRESET_PROSTHESIS_TYPES = ["인레이", "크라운", "커스텀어벗", "브리지", "유지장치", "임시치아", "결손치"] as const;
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
  labArrivalDefaults?: PracticeLabArrivalDefault[];
  /** 단일 기공소 upsert (POST body). GET 응답에는 없음. */
  labArrivalDefault?: PracticeLabArrivalDefault;
  prosthesisTypes?: string[];
  memoSnippets?: string[];
  implantFavorites?: PracticeImplantFavorite[];
  abutmentFavorites?: PracticeAbutmentFavorite[];
  skipDesignConfirm?: boolean;
  skipJig?: boolean;
  /** 캘린더 「도착일 클릭으로 신규의뢰」안내 닫은 시각(ISO). null/없음=표시 */
  calendarNewRequestHintDismissedAt?: string | null;
  defaultAbutmentProductMode?: AbutmentProductMode;
  autoMatchBudget?: PracticeTransferAutoMatchBudget | null;
  autoMatchMinLabRating?: number;
  autoMatchMaxLabRating?: number;
  starBandEligibleLabAnchorIds?: string[];
  ownOneStarBlockedLabAnchorIds?: string[];
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
    raw === "결손치" ||
    raw === "작업X" ||
    raw === "상실치" ||
    compact.toLowerCase() === "작업x" ||
    /^missing(?:tooth)?$/i.test(compact)
  );
};

const isBridgeLikeProsthesisType = (prosthesisType: string) =>
  prosthesisType === "브리지" ||
  prosthesisType === "유지장치" ||
  isMissingToothProsthesisType(prosthesisType);

const isCustomAbutmentSupportedProsthesisType = (prosthesisType: string) => {
  const compact = String(prosthesisType || "").trim().replace(/\s+/g, "");
  return (
    compact === "커스텀어벗" ||
    prosthesisType === "크라운" ||
    prosthesisType === "브리지" ||
    compact === "임시치아" ||
    compact === "가철성임시치아" ||
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
      if (/^pontic$/i.test(item)) return "브리지";
      if (
        item === "결손치" ||
        item === "작업X" ||
        item === "상실치" ||
        /^작업x$/i.test(item) ||
        /^missing(?:\s*tooth)?$/i.test(item)
      ) {
        return "결손치";
      }
      return item;
    });

  const deduped = Array.from(
    new Map(canonical.map((item) => [item.toLowerCase(), item])).values(),
  );

  if (!deduped.some((item) => item === "결손치" || item === "작업X" || item === "상실치")) {
    deduped.push("결손치");
  }
  return deduped.length ? deduped : [...PRESET_PROSTHESIS_TYPES];
};

/** 케이스 동기화가 목록을 작업X만으로 줄이지 않도록 프리셋을 항상 병합한다. */
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
        ? "결손치"
        : prosthesisTypeRaw;
      const customAbutment = /커스텀어벗|(?:커스텀)?어벗디자인/i.test(
        String(prosthesisType || "").replace(/\s+/g, ""),
      )
        ? true
        : Boolean(row?.customAbutment);
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

/** 임시저장 게이트 미충족 시 상단 동기화 문구. 빈 폼은 표시하지 않는다. */
const getFormAutosaveBlockedHint = (patientName: string) => {
  const trimmed = String(patientName || "").trim();
  if (hasAutosaveReadyPatientName(trimmed)) return "";
  if (trimmed) return "완성형 한글 환자명이어야 임시저장";
  return "";
};

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
  if (raw === "하청대기") return "하청대기";
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

/** 목록/카드 뱃지 라벨 — 상단 필터(의뢰·수락·디자인·취소·출고)와 동일 문구 */
const toStatusBadgeLabel = (status: unknown) => {
  const s = String(status || "").trim();
  if (!s) return "-";
  if (s === "발송완료" || s === "수신완료" || s === "자동매칭" || s === "하청대기") return "의뢰";
  if (s === "의뢰수락" || s === "다운로드완료") return "수락";
  if (s === "작업완료") return "디자인";
  if (s === "작업취소" || s === "취소") return "취소";
  if (s === "거부") return "거부";
  if (s === "생산진행" || s === "포장.발송") return "출고";
  return s;
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
  const isMobile = useIsMobile();
  const { period } = usePeriodStore();
  const { toast } = useToast();
  const authToken = useAuthStore((s) => s.token);
  const authUser = useAuthStore((s) => s.user);
  /** 익스프레스 모드·전환 UI 제거 — 엑스퍼트(전폭 작성)만 */
  const isExpressMode = false;
  const workspaceMode = "expert" as const;
  const [remakeSelectedIds, setRemakeSelectedIds] = useState<string[]>([]);
  const [remakeConfirmOpen, setRemakeConfirmOpen] = useState(false);
  const [remakeBusy, setRemakeBusy] = useState(false);
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const requestSubmittingRef = useRef(false);
  const [skipDesignConfirm, setSkipDesignConfirm] = useState(true);
  const [skipDesignConfirmUncheckOpen, setSkipDesignConfirmUncheckOpen] = useState(false);
  const [skipJig, setSkipJig] = useState(true);
  /** false면 캘린더 「도착일 클릭으로 신규의뢰」안내 표시 */
  const [calendarNewRequestHintDismissed, setCalendarNewRequestHintDismissed] =
    useState(false);
  const [rushProcessing, setRushProcessing] = useState(false);
  const [rushConfirmOpen, setRushConfirmOpen] = useState(false);
  const [pendingRushArrivalYmd, setPendingRushArrivalYmd] = useState("");
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
  const [autoMatchMaxLabRating, setAutoMatchMaxLabRating] = useState(
    DEFAULT_AUTO_MATCH_MAX_LAB_RATING,
  );
  const [starBandEligibleLabIds, setStarBandEligibleLabIds] = useState<
    string[] | null
  >(null);
  const [ownOneStarBlockedLabIds, setOwnOneStarBlockedLabIds] = useState<
    string[]
  >([]);
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
  const [editingSentTransfer, setEditingSentTransfer] = useState<EditingSentTransfer | null>(null);
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
  const [appendArrivalBusy, setAppendArrivalBusy] = useState(false);
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
  const editingSentTransferRef = useRef<EditingSentTransfer | null>(null);
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
  const mobileFilePromoteSeqRef = useRef(0);
  /** iOS 카메라 복귀·임시저장 탭 등 focus 후 로컬→draft promote 재시도. */
  const [filePromoteRetryNonce, setFilePromoteRetryNonce] = useState(0);
  const autoJoinedDraftIdRef = useRef("");
  /** 모바일 구강포토: private S3 location 대신 blob object URL (s3Key → url) */
  const oralPhotoObjectUrlByS3KeyRef = useRef<Map<string, string>>(new Map());
  const [oralPhotoObjectUrlByS3Key, setOralPhotoObjectUrlByS3Key] = useState<
    Record<string, string>
  >({});
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
    removeFilesByKeys,
    clearAllFiles,
    rememberLab,
    removeRecentLab,
    togglePinLab,
    syncRecentLabsFromTransfers,
  } = usePracticeTransferStep1({
    starBandEligibleLabIds,
    ownOneStarBlockedLabIds,
  });

  const applyArrivalDefaultForLabIdRef = useRef<
    (labId: string | null | undefined, labName?: string | null) => void
  >(() => {});

  // 레거시 「자동 매칭」draft는 어벗츠기공소(고정)로 승격한다.
  useEffect(() => {
    if (!selectedLab) return;
    if (!isAutoMatchLab(selectedLab)) return;
    const abuts =
      pinnedLabs.find((lab) => isPinnedAbutsRecentLab(lab)) || ABUTS_PINNED_LAB_SEED;
    setSelectedLab(abuts);
    if (!editingSentTransferRef.current) {
      applyArrivalDefaultForLabIdRef.current(abuts?._id, abuts?.name);
    }
  }, [selectedLab, setSelectedLab, pinnedLabs]);
  pendingLocalFilesRef.current = files;
  draftFilesRef.current = draftFiles;
  activeDraftIdRef.current = activeDraftId;
  editingSentTransferRef.current = editingSentTransfer;
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
  /** 계정 전역 fallback. 기공소별 값이 없을 때 사용. */
  const [accountArrivalDefaultDays, setAccountArrivalDefaultDays] = useState(
    DEFAULT_ARRIVAL_OFFSET_DAYS,
  );
  const [labArrivalDefaults, setLabArrivalDefaults] = useState<PracticeLabArrivalDefault[]>(
    [],
  );
  /** 현재 선택 기공소(또는 계정)에 적용 중인 주문→도착 기본 일수. */
  const [arrivalDefaultDays, setArrivalDefaultDays] = useState(DEFAULT_ARRIVAL_OFFSET_DAYS);
  const [arrivalDate, setArrivalDate] = useState(
    addDaysToDateInput(todayDate, DEFAULT_ARRIVAL_OFFSET_DAYS),
  );
  const accountArrivalDefaultDaysRef = useRef(accountArrivalDefaultDays);
  accountArrivalDefaultDaysRef.current = accountArrivalDefaultDays;
  const labArrivalDefaultsRef = useRef(labArrivalDefaults);
  labArrivalDefaultsRef.current = labArrivalDefaults;
  const arrivalDefaultDaysRef = useRef(arrivalDefaultDays);
  arrivalDefaultDaysRef.current = arrivalDefaultDays;
  const selectedLabIdRef = useRef(String(selectedLab?._id || "").trim());
  selectedLabIdRef.current = String(selectedLab?._id || "").trim();
  const selectedLabNameRef = useRef(String(selectedLab?.name || "").trim());
  selectedLabNameRef.current = String(selectedLab?.name || "").trim();
  const todayDateRef = useRef(todayDate);
  todayDateRef.current = todayDate;
  const orderDateRef = useRef(orderDate);
  orderDateRef.current = orderDate;

  const applyArrivalDefaultForLabId = useCallback(
    (labId: string | null | undefined, labName?: string | null) => {
      const nextDays = resolveLabArrivalDefaultDays(
        labId,
        labArrivalDefaultsRef.current,
        accountArrivalDefaultDaysRef.current,
        labName,
      );
      const orderYmd = String(orderDateRef.current || todayDateRef.current || "").trim();
      const nextArrival = orderYmd
        ? addDaysToDateInput(orderYmd, nextDays)
        : addDaysToDateInput(todayDateRef.current, nextDays);
      // effect auto-sync와 경합하지 않도록 스킵 후 도착일을 직접 맞춘다.
      skipNextArrivalAutoSyncRef.current = true;
      arrivalDefaultDaysRef.current = nextDays;
      setArrivalDefaultDays(nextDays);
      if (nextArrival) {
        setArrivalDate(nextArrival);
        setRushProcessing(
          shouldEnablePracticeRushProcessing({
            orderYmd: orderYmd || todayDateRef.current,
            arrivalYmd: nextArrival,
          }),
        );
      }
    },
    [],
  );

  /** intake 기공소 선택 — 해당 기공소 설정 일수로 주문-치과도착 갱신. */
  const selectLabForIntake = useCallback(
    (lab: SearchBusinessResult | null) => {
      setSelectedLab(lab);
      if (editingSentTransferRef.current) return;
      applyArrivalDefaultForLabId(lab?._id, lab?.name);
    },
    [applyArrivalDefaultForLabId, setSelectedLab],
  );
  applyArrivalDefaultForLabIdRef.current = applyArrivalDefaultForLabId;

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
  const [composeOpen, setComposeOpen] = useState(false);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [guideTourActive, setGuideTourActive] = useState(false);
  const [guideTourStartSignal, setGuideTourStartSignal] = useState(0);
  const [guideTourExitSignal, setGuideTourExitSignal] = useState(0);
  /** 패널 unmount(모드 전환) 후에도 투어 스텝 유지 */
  const [guideTourStep, setGuideTourStep] =
    useState<PracticeToothWorkGuideTourStep | null>(null);
  const [oralPhotoPreview, setOralPhotoPreview] = useState<{
    name: string;
    url: string;
  } | null>(null);
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
  const { rooms: chatRooms, fetchRooms } = useChatRooms();

  // 삭제된 의뢰 채팅 잔상(유령 unread) 정리 — 캘린더 메인 진입 시 rooms 재조회.
  useEffect(() => {
    if (!authToken) return;
    void fetchRooms();
  }, [authToken, fetchRooms]);

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
        openPool: selectedTransfer?.autoMatch?.openPool,
        subcontracted: selectedTransfer?.autoMatch?.subcontracted,
        isOwn: senderId === currentUserId,
        counterpartLabel: "기공소",
        name: String(message.sender?.name || ""),
      });
      return {
        ...message,
        sender: { ...message.sender, name },
      };
    });
  }, [
    authUser,
    chatMessages,
    selectedTransfer?.matchingMode,
    selectedTransfer?.autoMatch?.openPool,
    selectedTransfer?.autoMatch?.subcontracted,
  ]);

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

  const [localPhotoPreviewUrls, setLocalPhotoPreviewUrls] = useState<string[]>([]);

  useEffect(() => {
    const urls = files.map((file) =>
      URL.createObjectURL(blobForOralPhotoPreview(file, file.name)),
    );
    setLocalPhotoPreviewUrls(urls);
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  const rememberOralPhotoObjectUrl = useCallback((
    s3Key: string,
    source: Blob,
    fileName?: string,
  ) => {
    const key = String(s3Key || "").trim();
    if (!key || !(source instanceof Blob)) return;
    if (oralPhotoObjectUrlByS3KeyRef.current.has(key)) return;
    const url = URL.createObjectURL(blobForOralPhotoPreview(source, fileName));
    oralPhotoObjectUrlByS3KeyRef.current.set(key, url);
    setOralPhotoObjectUrlByS3Key((prev) =>
      prev[key] === url ? prev : { ...prev, [key]: url },
    );
  }, []);

  const forgetOralPhotoObjectUrls = useCallback((s3Keys?: string[]) => {
    const map = oralPhotoObjectUrlByS3KeyRef.current;
    const keys = s3Keys?.length
      ? s3Keys.map((key) => String(key || "").trim()).filter(Boolean)
      : Array.from(map.keys());
    if (!keys.length) return;
    keys.forEach((key) => {
      const url = map.get(key);
      if (url) URL.revokeObjectURL(url);
      map.delete(key);
    });
    setOralPhotoObjectUrlByS3Key((prev) => {
      let changed = false;
      const next = { ...prev };
      keys.forEach((key) => {
        if (key in next) {
          delete next[key];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, []);

  useEffect(() => {
    return () => {
      oralPhotoObjectUrlByS3KeyRef.current.forEach((url) => URL.revokeObjectURL(url));
      oralPhotoObjectUrlByS3KeyRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const keep = new Set(
      draftFiles
        .map((row) => String(row.s3Key || "").trim())
        .filter(Boolean),
    );
    const stale = Array.from(oralPhotoObjectUrlByS3KeyRef.current.keys()).filter(
      (key) => !keep.has(key),
    );
    if (stale.length) forgetOralPhotoObjectUrls(stale);
  }, [draftFiles, forgetOralPhotoObjectUrls]);

  const draftImagePreviewKey = useMemo(
    () =>
      draftFiles
        .filter((row) =>
          isPracticeOralPhotoPreviewable(row.originalName, row.mimetype),
        )
        .map((row) => String(row.s3Key || "").trim())
        .filter(Boolean)
        .join("\n"),
    [draftFiles],
  );

  useEffect(() => {
    if (!authToken) return;
    const wantedKeys = draftImagePreviewKey
      .split("\n")
      .map((key) => key.trim())
      .filter(Boolean);
    if (!wantedKeys.length) return;

    let cancelled = false;
    const controller = new AbortController();
    const nameByKey = new Map(
      draftFilesRef.current.map((row) => [
        String(row.s3Key || "").trim(),
        String(row.originalName || "photo.jpg").trim() || "photo.jpg",
      ]),
    );

    const loadMissingPreviews = async () => {
      for (const s3Key of wantedKeys) {
        if (cancelled) return;
        if (oralPhotoObjectUrlByS3KeyRef.current.has(s3Key)) continue;
        try {
          const blob = await fetchS3BlobCached({
            s3Key,
            fileName: nameByKey.get(s3Key) || "photo.jpg",
            token: authToken,
            buildUrl: buildS3ProxyDownloadUrl,
            signal: controller.signal,
          });
          if (cancelled) return;
          rememberOralPhotoObjectUrl(s3Key, blob, nameByKey.get(s3Key));
        } catch {
          // 미리보기 실패는 썸네일 placeholder로 둔다.
        }
      }
    };

    void loadMissingPreviews();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [authToken, draftImagePreviewKey, rememberOralPhotoObjectUrl]);

  const mobileOralPhotos = useMemo(
    () =>
      combinedDisplayFiles.map((file) => {
        const localFile =
          file.kind === "local" ? files[file.localIndex] : null;
        const progress = localFile
          ? uploadProgress[toTempUploadFileKey(localFile)]
          : undefined;
        const draftRow =
          file.kind === "draft" ? draftFiles[file.draftIndex] : null;
        const draftS3Key = String(draftRow?.s3Key || "").trim();
        return {
          key: file.key,
          name: file.name,
          previewUrl:
            file.kind === "local"
              ? localPhotoPreviewUrls[file.localIndex] || null
              : (draftS3Key && oralPhotoObjectUrlByS3Key[draftS3Key]) || null,
          uploadPercent: progress?.percent,
          uploadStatus:
            file.kind === "draft"
              ? ("done" as const)
              : progress?.status || ("pending" as const),
          synced: file.kind === "draft",
        };
      }),
    [
      combinedDisplayFiles,
      draftFiles,
      files,
      localPhotoPreviewUrls,
      oralPhotoObjectUrlByS3Key,
      uploadProgress,
    ],
  );

  const applyPracticeTransferSettings = useCallback((payload: PracticeTransferSettingsPayload | null) => {
    if (!payload || typeof payload !== "object") return;
    const nextAccountArrivalDefaultDays = normalizeArrivalDefaultDays(
      Number(payload.arrivalDefaultDays ?? DEFAULT_ARRIVAL_OFFSET_DAYS),
    );
    const nextLabArrivalDefaults = Object.prototype.hasOwnProperty.call(
      payload,
      "labArrivalDefaults",
    )
      ? normalizeLabArrivalDefaults(payload.labArrivalDefaults)
      : null;
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
    const hasAutoMatchMaxLabRating = Object.prototype.hasOwnProperty.call(
      payload,
      "autoMatchMaxLabRating",
    );
    const nextStarBand =
      hasAutoMatchMinLabRating || hasAutoMatchMaxLabRating
        ? resolveAutoMatchEligibleStarBand({
            minStars: hasAutoMatchMinLabRating
              ? payload.autoMatchMinLabRating
              : undefined,
            maxStars: hasAutoMatchMaxLabRating
              ? payload.autoMatchMaxLabRating
              : undefined,
          })
        : null;
    const nextMinStars = nextStarBand?.minStars ?? null;
    const hasAutoMatchBudget = Object.prototype.hasOwnProperty.call(
      payload,
      "autoMatchBudget",
    );
    const nextAutoMatchBudget =
      hasAutoMatchBudget || nextMinStars != null
        ? resolveAutoMatchBudgetOrDefaults(
            payload.autoMatchBudget,
            payload.abutsLabFeeCatalog,
            nextMinStars != null
              ? {
                  minStars: nextMinStars,
                  maxStars: nextStarBand?.maxStars,
                }
              : undefined,
          )
        : null;
    if (Array.isArray(payload.abutsLabFeeCatalog)) {
      setAbutsLabFeeCatalog(payload.abutsLabFeeCatalog);
    }

    setAccountArrivalDefaultDays(nextAccountArrivalDefaultDays);
    if (nextLabArrivalDefaults) {
      setLabArrivalDefaults(nextLabArrivalDefaults);
      labArrivalDefaultsRef.current = nextLabArrivalDefaults;
    }
    accountArrivalDefaultDaysRef.current = nextAccountArrivalDefaultDays;
    const nextActiveArrivalDefaultDays = resolveLabArrivalDefaultDays(
      selectedLabIdRef.current,
      nextLabArrivalDefaults ?? labArrivalDefaultsRef.current,
      nextAccountArrivalDefaultDays,
      selectedLabNameRef.current,
    );
    setArrivalDefaultDays(nextActiveArrivalDefaultDays);
    setProsthesisTypeCatalog(nextProsthesisTypes);
    setProsthesisTypeCatalogDraft(nextProsthesisTypes);
    setMemoSnippets(nextMemoSnippets);
    setImplantFavorites(nextImplantFavorites);
    setAbutmentFavorites(nextAbutmentFavorites);
    setSkipDesignConfirm(nextSkipDesignConfirm);
    setSkipJig(nextSkipJig);
    if (
      Object.prototype.hasOwnProperty.call(
        payload,
        "calendarNewRequestHintDismissedAt",
      )
    ) {
      setCalendarNewRequestHintDismissed(
        Boolean(payload.calendarNewRequestHintDismissedAt),
      );
    }
    setDefaultAbutmentProductMode(nextDefaultAbutmentProductMode);
    // 로컬 캐시에 키가 없으면 기본값으로 덮지 않음(서버 응답·명시 저장만 반영)
    if (nextAutoMatchBudget) {
      setAutoMatchBudget(nextAutoMatchBudget);
    }
    if (nextStarBand) {
      setAutoMatchMinLabRating(nextStarBand.minStars);
      setAutoMatchMaxLabRating(nextStarBand.maxStars);
    }
    if (Array.isArray(payload.starBandEligibleLabAnchorIds)) {
      setStarBandEligibleLabIds(
        payload.starBandEligibleLabAnchorIds
          .map((id) => String(id || "").trim())
          .filter(Boolean),
      );
    }
    if (Array.isArray(payload.ownOneStarBlockedLabAnchorIds)) {
      setOwnOneStarBlockedLabIds(
        payload.ownOneStarBlockedLabAnchorIds
          .map((id) => String(id || "").trim())
          .filter(Boolean),
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
      const hasLabArrivalDefaults = Array.isArray(params.labArrivalDefaults);
      const hasLabArrivalDefault =
        params.labArrivalDefault != null &&
        typeof params.labArrivalDefault === "object";
      const hasProsthesisTypes = Array.isArray(params.prosthesisTypes);
      const hasMemoSnippets = Array.isArray(params.memoSnippets);
      const hasImplantFavorites = Array.isArray(params.implantFavorites);
      const hasAbutmentFavorites = Array.isArray(params.abutmentFavorites);
      const hasSkipDesignConfirm = Object.prototype.hasOwnProperty.call(
        params,
        "skipDesignConfirm",
      );
      const hasSkipJig = Object.prototype.hasOwnProperty.call(params, "skipJig");
      const hasCalendarNewRequestHintDismissedAt = Object.prototype.hasOwnProperty.call(
        params,
        "calendarNewRequestHintDismissedAt",
      );
      const hasDefaultAbutmentProductMode = Object.prototype.hasOwnProperty.call(
        params,
        "defaultAbutmentProductMode",
      );
      const hasAutoMatchMinLabRating = Object.prototype.hasOwnProperty.call(
        params,
        "autoMatchMinLabRating",
      );
      const hasAutoMatchMaxLabRating = Object.prototype.hasOwnProperty.call(
        params,
        "autoMatchMaxLabRating",
      );

      const jsonBody: Record<string, unknown> = {};
      if (hasArrivalDefaultDays) {
        jsonBody.arrivalDefaultDays = normalizeArrivalDefaultDays(Number(params.arrivalDefaultDays));
      }
      if (hasLabArrivalDefaults) {
        jsonBody.labArrivalDefaults = normalizeLabArrivalDefaults(params.labArrivalDefaults);
      }
      if (hasLabArrivalDefault && params.labArrivalDefault) {
        jsonBody.labArrivalDefault = {
          labAnchorId: String(params.labArrivalDefault.labAnchorId || "").trim(),
          labName: String(params.labArrivalDefault.labName || "").trim(),
          arrivalDefaultDays: normalizeArrivalDefaultDays(
            Number(params.labArrivalDefault.arrivalDefaultDays),
          ),
        };
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
      if (hasCalendarNewRequestHintDismissedAt) {
        jsonBody.calendarNewRequestHintDismissedAt =
          params.calendarNewRequestHintDismissedAt || null;
      }
      if (hasDefaultAbutmentProductMode) {
        jsonBody.defaultAbutmentProductMode = normalizeAccountAbutmentProductMode(
          params.defaultAbutmentProductMode,
        );
      }
      // autoMatchBudget는 서버에서 무시(v4: 별점으로 조립).
      if (hasAutoMatchMinLabRating || hasAutoMatchMaxLabRating) {
        const band = resolveAutoMatchEligibleStarBand({
          minStars: hasAutoMatchMinLabRating
            ? params.autoMatchMinLabRating
            : autoMatchMinLabRating,
          maxStars: hasAutoMatchMaxLabRating
            ? params.autoMatchMaxLabRating
            : autoMatchMaxLabRating,
        });
        jsonBody.autoMatchMinLabRating = band.minStars;
        jsonBody.autoMatchMaxLabRating = band.maxStars;
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
            labArrivalDefaults: normalizeLabArrivalDefaults(
              Array.isArray(payload?.labArrivalDefaults)
                ? payload.labArrivalDefaults
                : labArrivalDefaults,
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
            calendarNewRequestHintDismissedAt:
              payload?.calendarNewRequestHintDismissedAt || null,
            defaultAbutmentProductMode: normalizeAccountAbutmentProductMode(
              payload?.defaultAbutmentProductMode,
            ),
            autoMatchMinLabRating: normalizeAutoMatchMinLabRating(
              payload?.autoMatchMinLabRating ??
                (hasAutoMatchMinLabRating
                  ? params.autoMatchMinLabRating
                  : undefined),
            ),
            autoMatchMaxLabRating: normalizeAutoMatchMaxLabRating(
              payload?.autoMatchMaxLabRating ??
                (hasAutoMatchMaxLabRating
                  ? params.autoMatchMaxLabRating
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
    [
      applyPracticeTransferSettings,
      authToken,
      memoSnippets,
      implantFavorites,
      abutmentFavorites,
      labArrivalDefaults,
      abutsLabFeeCatalog,
      autoMatchMinLabRating,
      autoMatchMaxLabRating,
    ],
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
      payload: PracticeTransferDraftPayload & {
        forceResync?: boolean;
        filesTouched?: boolean;
        draftFilesMode?: string;
      },
      options?: { keepActiveDraftIdOnEmpty?: boolean; forceResync?: boolean },
    ) => {
      if (imeComposingRef.current) {
        logPracticeFileSync("apply:defer-ime", {
          draftId: String(payload?._id || "").trim() || null,
          incomingFiles: Array.isArray(payload?.files) ? payload.files.length : 0,
        });
        pendingDraftApplyRef.current = payload;
        return;
      }

      const forceResync = Boolean(options?.forceResync || payload.forceResync);

      // 파일 업로드 중에는 HTTP 응답이 SSOT. 원격 스냅샷은 업로드 종료 후 적용.
      if (fileSyncInFlightRef.current) {
        logPracticeFileSync("apply:defer-upload-inflight", {
          draftId: String(payload?._id || "").trim() || null,
          incomingFiles: Array.isArray(payload?.files) ? payload.files.length : 0,
          forceResync,
        });
        const prev = pendingDraftApplyRef.current;
        pendingDraftApplyRef.current = {
          ...payload,
          forceResync: Boolean(forceResync || prev?.forceResync || payload.forceResync),
        };
        return;
      }

      const keepActiveDraftIdOnEmpty = Boolean(options?.keepActiveDraftIdOnEmpty);
      const ownedPayload: PracticeTransferDraftPayload = {
        ...payload,
        practiceUserId: String(payload.practiceUserId || myUserId).trim() || myUserId,
      };
      const restoredFiles = normalizeDraftTransferFileItems(ownedPayload.files);
      const prevFiles = draftFilesRef.current;
      const payloadDraftId = String(ownedPayload._id || "").trim();
      const sameDraftId =
        Boolean(payloadDraftId) &&
        payloadDraftId === String(activeDraftIdRef.current || "").trim();
      const filesTouched = Boolean(
        (payload as { filesTouched?: boolean }).filesTouched,
      );
      const draftFilesMode = String(
        (payload as { draftFilesMode?: string }).draftFilesMode ||
          (filesTouched ? (forceResync ? "replace" : "append") : "keep"),
      )
        .trim()
        .toLowerCase();
      const mergedFiles = resolveDraftFilesFromRemote({
        prevFiles,
        restoredFiles,
        filesTouched,
        draftFilesMode,
        forceResync,
        sameDraftId,
      });
      const filesChanged =
        mergedFiles.length !== prevFiles.length ||
        mergedFiles.some(
          (row) => !prevFiles.some((prev) => prev.fileId === row.fileId),
        );
      // setState 전에 ref를 맞춰 autosave HTTP 응답이 소켓 반영을 덮지 않게 한다.
      draftFilesRef.current = mergedFiles;
      setDraftFiles(mergedFiles);
      logPracticeFileSync("apply:files", {
        draftId: payloadDraftId || null,
        sameDraftId,
        forceResync,
        filesTouched,
        draftFilesMode,
        prevCount: prevFiles.length,
        restoredCount: restoredFiles.length,
        mergedCount: mergedFiles.length,
        filesChanged,
      });

      const summary = toDraftListSummary(
        { ...ownedPayload, files: mergedFiles },
        myUserId,
      );
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
      activeDraftIdRef.current = summary.id;

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
        !filesChanged &&
        mergedFiles.length > 0 &&
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
        mergedFiles.length > 0 &&
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
            const coerced = preferCachedAbutsLab(
              coerceAutoMatchLab({
                labId,
                labName,
                matchingMode:
                  (payload as { matchingMode?: string | null })?.matchingMode ??
                  null,
              }),
              findCachedLab,
            );
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
          const nextArrival =
            restoredArrival && restoredArrival >= todayDate
              ? restoredArrival
              : addDaysToDateInput(
                  todayDate,
                  normalizeArrivalDefaultDays(
                    Number(parsed.arrivalDefaultDays ?? arrivalDefaultDays),
                  ),
                );
          setArrivalDate(nextArrival);
          setRushProcessing(
            shouldEnablePracticeRushProcessing({
              orderYmd: todayDate,
              arrivalYmd: nextArrival,
            }),
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
      } else if (mergedFiles.length > 0) {
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
          restoredFilesCount: mergedFiles.length,
          filesChanged,
          shouldRestoreForm,
          localFormUpdatedAt: localFormUpdatedAtRef.current,
          serverUpdatedAt,
        });
      }
    },
    [myUserId, setRequestMemo, setSelectedLab],
  );

  const loadPracticeTransferDraft = useCallback(async (options?: {
    draftId?: string | null;
    forceResync?: boolean;
  }) => {
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
    const forceResync = Boolean(options?.forceResync);

    try {
      logPracticeFileSync("get-draft:start", {
        draftId: requestedDraftId,
        forceResync,
        localFileCount: draftFilesRef.current.length,
      });
      const res = await apiFetch<unknown>({
        path: `/api/practice/transfers/draft?draftId=${encodeURIComponent(requestedDraftId)}`,
        method: "GET",
        token: authToken,
      });
      if (!res.ok) {
        logPracticeFileSync("get-draft:http-fail", {
          draftId: requestedDraftId,
          ok: res.ok,
        });
        return;
      }

      const body =
        res.data && typeof res.data === "object"
          ? (res.data as { data?: unknown })
          : {};
      const payload =
        body.data && typeof body.data === "object"
          ? (body.data as PracticeTransferDraftPayload)
          : null;

      if (!payload) {
        logPracticeFileSync("get-draft:empty", { draftId: requestedDraftId });
        setDraftFiles([]);
        draftFilesRef.current = [];
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

      logPracticeFileSync("get-draft:ok", {
        draftId: String(payload._id || requestedDraftId).trim(),
        serverFileCount: Array.isArray(payload.files) ? payload.files.length : 0,
        forceResync,
      });
      applyPracticeDraftPayload(payload, {
        keepActiveDraftIdOnEmpty: true,
        forceResync,
      });
    } catch (error) {
      logPracticeFileSync("get-draft:error", {
        draftId: requestedDraftId,
        message: error instanceof Error ? error.message : String(error || ""),
      });
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
        if (
          Object.prototype.hasOwnProperty.call(
            payload,
            "calendarNewRequestHintDismissedAt",
          )
        ) {
          setCalendarNewRequestHintDismissed(
            Boolean(payload.calendarNewRequestHintDismissedAt),
          );
        }
        setDefaultAbutmentProductMode(
          normalizeAccountAbutmentProductMode(payload.defaultAbutmentProductMode),
        );
        setImplantFavorites(normalizeImplantFavorites(payload.implantFavorites));
        setAbutmentFavorites(normalizeAbutmentFavorites(payload.abutmentFavorites));
        setAutoMatchMinLabRating(
          normalizeAutoMatchMinLabRating(payload.autoMatchMinLabRating),
        );
        setAutoMatchMaxLabRating(
          normalizeAutoMatchMaxLabRating(payload.autoMatchMaxLabRating),
        );
        if (Array.isArray(payload.starBandEligibleLabAnchorIds)) {
          setStarBandEligibleLabIds(
            payload.starBandEligibleLabAnchorIds
              .map((id) => String(id || "").trim())
              .filter(Boolean),
          );
        }
        if (Array.isArray(payload.ownOneStarBlockedLabAnchorIds)) {
          setOwnOneStarBlockedLabIds(
            payload.ownOneStarBlockedLabAnchorIds
              .map((id) => String(id || "").trim())
              .filter(Boolean),
          );
        }
        setAutoMatchBudget(
          resolveAutoMatchBudgetOrDefaults(
            payload.autoMatchBudget,
            payload.abutsLabFeeCatalog ?? abutsLabFeeCatalog,
            {
              minStars: normalizeAutoMatchMinLabRating(
                payload.autoMatchMinLabRating,
              ),
              maxStars: normalizeAutoMatchMaxLabRating(
                payload.autoMatchMaxLabRating,
              ),
            },
          ),
        );
        if (Array.isArray(payload.abutsLabFeeCatalog)) {
          setAbutsLabFeeCatalog(payload.abutsLabFeeCatalog);
        }
        if (typeof payload.arrivalDefaultDays === "number") {
          const nextAccount = normalizeArrivalDefaultDays(payload.arrivalDefaultDays);
          setAccountArrivalDefaultDays(nextAccount);
          accountArrivalDefaultDaysRef.current = nextAccount;
        }
        if (Array.isArray(payload.labArrivalDefaults)) {
          const nextLabs = normalizeLabArrivalDefaults(payload.labArrivalDefaults);
          setLabArrivalDefaults(nextLabs);
          labArrivalDefaultsRef.current = nextLabs;
        }
        if (
          typeof payload.arrivalDefaultDays === "number" ||
          Array.isArray(payload.labArrivalDefaults)
        ) {
          setArrivalDefaultDays(
            resolveLabArrivalDefaultDays(
              selectedLabIdRef.current,
              labArrivalDefaultsRef.current,
              accountArrivalDefaultDaysRef.current,
              selectedLabNameRef.current,
            ),
          );
        }
      }
      try {
        localStorage.setItem(
          PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY,
          JSON.stringify({
            arrivalDefaultDays: normalizeArrivalDefaultDays(Number(payload?.arrivalDefaultDays ?? DEFAULT_ARRIVAL_OFFSET_DAYS)),
            labArrivalDefaults: normalizeLabArrivalDefaults(payload?.labArrivalDefaults),
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
            calendarNewRequestHintDismissedAt:
              payload?.calendarNewRequestHintDismissedAt || null,
            defaultAbutmentProductMode: normalizeAccountAbutmentProductMode(
              payload?.defaultAbutmentProductMode,
            ),
            autoMatchMinLabRating: normalizeAutoMatchMinLabRating(
              payload?.autoMatchMinLabRating,
            ),
            autoMatchMaxLabRating: normalizeAutoMatchMaxLabRating(
              payload?.autoMatchMaxLabRating,
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

      const mapped = mapMyPracticeTransferApiRows(list);

      setRecentRequests(mapped);
      setRecentRequestsHasMore(
        typeof paginationHasMore === "boolean"
          ? paginationHasMore
          : mapped.length >= PRACTICE_MY_TRANSFERS_PAGE_SIZE,
      );

      // 열린 상세가 있으면 목록 재조회의 확정 feeQuote·상태·작업 파일을 동기화
      const openTransferId = String(selectedTransferIdRef.current || "").trim();
      if (transferDialogOpenRef.current && openTransferId) {
        const openRows = mapped.filter(
          (row) => String(row.transferId || "").trim() === openTransferId,
        );
        if (openRows.length > 0) {
          setSelectedTransfer((prev) => {
            if (!prev || String(prev.transferId || "").trim() !== openTransferId) {
              return prev;
            }
            return mergeOpenPracticeTransferFromRequestRows(prev, openRows);
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

  // 캘린더가 메인 — page=1 fat 목록은 상세/휴지통/전송 이후에만(초기 병렬 조회 제거)
  useEffect(() => {
    if (!authToken) return;
    const timer = window.setTimeout(() => {
      void loadRecentRequests({ silent: true });
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [authToken, loadRecentRequests]);

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
      const nextArrivalDate =
        restoredArrivalDate && restoredArrivalDate >= todayDate
          ? restoredArrivalDate
          : addDaysToDateInput(todayDate, restoredArrivalDefaultDays);
      setArrivalDate(nextArrivalDate);
      setArrivalDefaultDays(restoredArrivalDefaultDays);
      setRushProcessing(
        shouldEnablePracticeRushProcessing({
          rushProcessing: parsed.rushProcessing,
          orderYmd: todayDate,
          arrivalYmd: nextArrivalDate,
        }),
      );
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
          const coerced = preferCachedAbutsLab(
            coerceAutoMatchLab({ labId: id, labName: name }),
            findCachedLab,
          );
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
  }, [findCachedLab, setRequestMemo, setSelectedLab, todayDate]);

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
        ? {
            _id: isAutoMatchLab(selectedLab)
              ? String(ABUTS_PINNED_LAB_SEED._id)
              : String(selectedLab._id || "").trim(),
            name: isAutoMatchLab(selectedLab)
              ? String(ABUTS_PINNED_LAB_SEED.name)
              : String(selectedLab.name || "").trim(),
            businessNumber: String(selectedLab.businessNumber || "").trim(),
            representativeName: String(selectedLab.representativeName || "").trim(),
            address: String(selectedLab.address || "").trim(),
            businessType: String(selectedLab.businessType || "requestor").trim(),
          }
        : null,
      toothWorks,
      expressStepId,
      rushProcessing,
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
    rushProcessing,
    selectedLab,
    toothWorks,
  ]);

  const persistFormDraftAutosave = useCallback(
    async (seq: number) => {
      if (seq !== formAutosaveSeqRef.current) return;
      if (!authToken) return;
      if (editingSentTransferRef.current) return;
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
      // 완성형 한글 환자명만 있으면 임시저장/동기화한다(기공소는 전송 시 필수).
      // IME 중간 Latin(r/rh)이나 자모만으로는 저장하지 않는다.
      if (!hasAutosaveReadyPatientName(normalizedPatientName)) return;

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

        const mappedPayloadFiles = normalizeDraftTransferFileItems(payload?.files);
        // 폼 autosave 응답은 첨부를 줄이지 않는다. 소켓으로 먼저 들어온 원격 파일을 지울 수 있다.
        const mergedFromAutosave = mergeDraftTransferFileItems(
          draftFilesRef.current,
          mappedPayloadFiles,
        );
        const nextDraftFiles =
          mappedPayloadFiles.length >= draftFilesRef.current.length &&
          mappedPayloadFiles.length >= latestFilesForSave.length
            ? mergeDraftTransferFileItems(latestFilesForSave, mappedPayloadFiles)
            : mergedFromAutosave;

        logPracticeFileSync("autosave:response", {
          draftId: returnedDraftId || null,
          mappedCount: mappedPayloadFiles.length,
          latestAtStart: latestFilesForSave.length,
          refBefore: draftFilesRef.current.length,
          nextCount: nextDraftFiles.length,
        });

        draftFilesRef.current = nextDraftFiles;
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

  /** 완성형 한글 환자명이 있으면 신규 임시저장·자동 동기화(기공소는 전송 시 필수). */
  const hasSubstantialContentForNewDraft = useMemo(
    () => hasAutosaveReadyPatientName(normalizedPatientName),
    [normalizedPatientName],
  );

  useEffect(() => {
    if (!localFormHydrated) return;
    if (skipFormAutosaveRef.current) return;
    if (editingSentTransferRef.current) return;
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

    // 완성형 한글 환자명이 있을 때만 서버 동기화(치아/메모/파일만으로는 목록에 올리지 않음).
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
      void loadPracticeTransferDraft({ draftId: resumeDraftId, forceResync: true });
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
    const nextArrivalDate = addDaysToDateInput(todayDate, arrivalDefaultDays);
    setArrivalDate(nextArrivalDate);
    const nextRush = shouldEnablePracticeRushProcessing({
      orderYmd: todayDate,
      arrivalYmd: nextArrivalDate,
    });
    setRushProcessing(nextRush);
    setToothWorks([]);
    setDraftFiles([]);
    setDraftSummary(null);
    setActiveDraftId(null);
    activeDraftSeenInListRef.current = null;
    draftSummaryIdRef.current = null;
    autoJoinedDraftIdRef.current = "";
    setEditingSentTransfer(null);
    editingSentTransferRef.current = null;
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
          arrivalDate: nextArrivalDate,
          arrivalDefaultDays,
          prosthesisTypes: [],
          requestMemo: "",
          patientName: "",
          selectedLab: null,
          toothWorks: [],
          rushProcessing: nextRush,
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
          arrivalDate: nextArrivalDate,
          arrivalDefaultDays,
          prosthesisTypes: [],
          requestMemo: "",
          patientName: "",
          selectedLab: null,
          toothWorks: [],
          rushProcessing: nextRush,
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
    // 목록 fetch 전·다른 기기에서 방금 생긴 draft는 아직 목록에 없을 수 있다.
    // unseen id를 바로 비우면 모바일 구강포토 동기화가 풀어진다.
  }, [activeDraftId, localFormHydrated, practiceDraftList]);

  useEffect(() => {
    if (!localFormHydrated || !draftListLoadedRef.current) return;
    if (!hasSubstantialContentForNewDraft) return;
    if (editingSentTransfer) return;

    const patient = normalizedPatientName;
    const labName = String(selectedLab?.name || "").trim();
    const labId = toApiLabAnchorId(selectedLab?._id);
    const matches = practiceDraftList.filter((row) => {
      if (String(row.patientName || "").normalize("NFC") !== patient) return false;
      const rowLabId = String(row.targetLabAnchorId || "").trim();
      const rowLabName = String(row.targetLabName || "").trim();
      if (labId && rowLabId && rowLabId === labId) return true;
      if (labName && rowLabName === labName) return true;
      // 기공소 미선택 draft끼리도 같은 환자명이면 재연결.
      return !labId && !labName && !rowLabId && !rowLabName;
    });
    const best = [...matches].sort((a, b) => {
      const fileDelta = Number(b.fileCount || 0) - Number(a.fileCount || 0);
      if (fileDelta) return fileDelta;
      return (
        new Date(String(b.updatedAt || 0)).getTime() -
        new Date(String(a.updatedAt || 0)).getTime()
      );
    })[0];
    const bestFileCount = Number(best?.fileCount || 0);
    if (!best || bestFileCount <= 0) return;
    const activeId = String(activeDraftId || "").trim();
    if (best.id === activeId && draftFiles.length >= bestFileCount) return;
    const joinKey = `${best.id}:${bestFileCount}`;
    if (autoJoinedDraftIdRef.current === joinKey) return;
    autoJoinedDraftIdRef.current = joinKey;
    logPracticeFileSync("auto-join", {
      bestDraftId: best.id,
      bestFileCount,
      activeId: activeId || null,
      localFileCount: draftFiles.length,
    });
    void loadPracticeTransferDraft({ draftId: best.id, forceResync: true });
  }, [
    activeDraftId,
    draftFiles.length,
    editingSentTransfer,
    hasSubstantialContentForNewDraft,
    loadPracticeTransferDraft,
    localFormHydrated,
    normalizedPatientName,
    practiceDraftList,
    selectedLab?._id,
    selectedLab?.name,
  ]);

  const periodAndSearchFilteredRequests = useMemo(
    () => filterRequestsByPeriodAndSearch(recentRequests, period, ""),
    [recentRequests, period],
  );

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

  const groupedTransfers = useMemo(
    () => groupPracticeRecentRequests(filteredRecentRequests, chatRooms),
    [filteredRecentRequests, chatRooms],
  );

  // 휴지통으로 옮긴 전송의 unread는 합산에서 제외(optimistic status=취소 즉시 반영)
  const trashTransferIdSet = useMemo(() => {
    const ids = new Set<string>();
    for (const req of recentRequests) {
      if (!isPracticeTransferTrashStatus(req.status)) continue;
      const tid = String(req.transferId || "").trim();
      if (tid && tid !== "-") ids.add(tid);
    }
    return ids;
  }, [recentRequests]);

  // 사이드바「기공의뢰」와 동일: practice transfer 채팅 unread 합산
  const recentChatUnreadCount = useMemo(
    () =>
      chatRooms.reduce((sum, room) => {
        const transferId = String(
          room.relatedPracticeTransferId?.transferId || "",
        ).trim();
        if (!transferId || trashTransferIdSet.has(transferId)) return sum;
        return sum + Math.max(0, Number(room.unreadCount || 0));
      }, 0),
    [chatRooms, trashTransferIdSet],
  );

  const draftGroupedTransfers = useMemo(() => {
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
      });
  }, [practiceDraftList]);

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
        const requestFiles = collectPracticeRequestFiles(req);
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
          fileCount: requestFiles.length,
          patientCount: 1,
          requestIds: [req.id],
          transferMongoIds: req.requestMongoId ? [req.requestMongoId] : [],
          fileNames: requestFiles.map((file) => file.fileName).filter(Boolean),
          files: requestFiles,
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
      for (const file of collectPracticeRequestFiles(req)) {
        const already = existing.files.some((row) => row.s3Key === file.s3Key);
        if (!already) {
          existing.files = [...existing.files, file];
          existing.fileNames = existing.files.map((row) => row.fileName);
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

  const remakeSelectedTransfers = useMemo(() => {
    const selected = new Set(remakeSelectedIds);
    return groupedTransfers.filter((transfer) => {
      const key = String(transfer.transferMongoIds?.[0] || transfer.id || "").trim();
      return key && selected.has(key) && canRemakePracticeTransferByStatus(transfer.status);
    });
  }, [groupedTransfers, remakeSelectedIds]);

  const askRemakeForTransfer = useCallback((transfer: RecentTransferItem) => {
    const key = String(transfer.transferMongoIds?.[0] || transfer.id || "").trim();
    if (!key || !canRemakePracticeTransferByStatus(transfer.status)) return;
    setRemakeSelectedIds([key]);
    setRemakeConfirmOpen(true);
  }, []);

  const handleAppendArrival = useCallback(async (arrivalYmdRaw?: string) => {
    if (!authToken || !selectedTransfer) return;
    const transferId = String(selectedTransfer.transferId || "").trim();
    if (!transferId || transferId === "-") {
      toast({
        title: "도착일 변경 실패",
        description: "전송ID를 확인할 수 없습니다.",
        variant: "destructive",
      });
      return;
    }
    const arrivalYmd = String(arrivalYmdRaw || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(arrivalYmd)) {
      toast({
        title: "도착일 변경 실패",
        description: "재도착일을 선택해 주세요.",
        variant: "destructive",
      });
      return;
    }
    setAppendArrivalBusy(true);
    try {
      const res = await apiFetch<{
        message?: string;
        data?: {
          arrivalDates?: string[];
          arrivalDate?: string;
          previousArrivalDate?: string | null;
          orderDates?: string[];
          orderDate?: string | null;
          previousOrderDate?: string | null;
          transferMemo?: string;
          billingUnchanged?: boolean;
        };
      }>({
        path: `/api/practice/transfers/${encodeURIComponent(transferId)}/append-arrival`,
        method: "POST",
        token: authToken,
        jsonBody: { arrivalYmd },
      });
      if (!res.ok) {
        const body = res.data && typeof res.data === "object" ? res.data : {};
        toast({
          title: "도착일 변경 실패",
          description:
            String((body as { message?: string }).message || "").trim() ||
            "치과도착일을 갱신하지 못했습니다.",
          variant: "destructive",
        });
        return;
      }
      const data = res.data?.data || {};
      const nextArrival = String(data.arrivalDate || "").trim();
      const nextDates = Array.isArray(data.arrivalDates)
        ? data.arrivalDates.map((d) => String(d || "").trim()).filter(Boolean)
        : [];
      const nextOrder = String(data.orderDate || "").trim();
      const nextOrderDates = Array.isArray(data.orderDates)
        ? data.orderDates.map((d) => String(d || "").trim()).filter(Boolean)
        : [];
      const nextMemo = String(data.transferMemo || "").trim();
      const patch = (prev: RecentTransferItem): RecentTransferItem => ({
        ...prev,
        arrivalDate: nextArrival || prev.arrivalDate,
        arrivalDates: nextDates.length ? nextDates : prev.arrivalDates,
        orderDate: nextOrder || prev.orderDate,
        orderDates: nextOrderDates.length ? nextOrderDates : prev.orderDates,
        transferMemo: nextMemo || prev.transferMemo,
        rawTransferMemo: nextMemo || prev.rawTransferMemo,
      });
      setSelectedTransfer((prev) => (prev ? patch(prev) : prev));
      setRecentRequests((prev) =>
        prev.map((row) =>
          String(row.transferId || "").trim() === transferId
            ? {
                ...row,
                arrivalDate: nextArrival || row.arrivalDate,
                arrivalDates: nextDates.length ? nextDates : row.arrivalDates,
                orderDate: nextOrder || row.orderDate,
                orderDates: nextOrderDates.length
                  ? nextOrderDates
                  : row.orderDates,
                transferMemo: nextMemo || row.transferMemo,
                rawTransferMemo: nextMemo || row.rawTransferMemo,
              }
            : row,
        ),
      );
      toast({
        title: "재도착일 반영",
        description: nextArrival
          ? `재주문일 ${nextOrder || "오늘"} · 재도착일 ${nextArrival}. 이전 일자는 캘린더에 유지되며 크레딧은 추가 차감되지 않습니다.`
          : "동일 건에 도착일이 누적되었습니다.",
      });
      void loadRecentRequests({ silent: true });
    } catch (error) {
      toast({
        title: "도착일 변경 실패",
        description: error instanceof Error ? error.message : "네트워크 오류",
        variant: "destructive",
      });
    } finally {
      setAppendArrivalBusy(false);
    }
  }, [authToken, loadRecentRequests, selectedTransfer, toast]);

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

  const selectedTransferDetailModel = useMemo(
    () => buildPracticeSenderTransferDetailModel(selectedTransfer),
    [selectedTransfer],
  );

  const applyDraftSummaryToForm = useCallback(
    (
      draft: DraftListSummary,
      options?: {
        keepOrderDate?: boolean;
        keepPastArrival?: boolean;
        skipDraftBind?: boolean;
        skipDesignConfirm?: boolean;
        skipJig?: boolean;
      },
    ) => {
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
        const coerced = preferCachedAbutsLab(
          coerceAutoMatchLab({
            labId,
            labName,
            matchingMode: (draft as { matchingMode?: string | null })?.matchingMode,
          }),
          findCachedLab,
        );
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
      const restoredOrderDate = String(parsed.orderDate || "").trim();
      const nextOrderDate =
        options?.keepOrderDate && /^\d{4}-\d{2}-\d{2}$/.test(restoredOrderDate)
          ? restoredOrderDate
          : todayDate;
      setOrderDate(nextOrderDate);
      {
        const restoredArrival = String(parsed.arrivalDate || "").trim();
        const nextArrival =
          restoredArrival &&
          (options?.keepPastArrival || restoredArrival >= todayDate)
            ? restoredArrival
            : addDaysToDateInput(
                todayDate,
                normalizeArrivalDefaultDays(
                  Number(parsed.arrivalDefaultDays ?? arrivalDefaultDays),
                ),
              );
        setArrivalDate(nextArrival);
        setRushProcessing(
          shouldEnablePracticeRushProcessing({
            orderYmd: nextOrderDate,
            arrivalYmd: nextArrival,
          }),
        );
      }
      if (typeof options?.skipDesignConfirm === "boolean") {
        setSkipDesignConfirm(options.skipDesignConfirm);
      }
      if (typeof options?.skipJig === "boolean") {
        setSkipJig(options.skipJig);
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
      if (options?.skipDraftBind) {
        setDraftSummary(null);
        setActiveDraftId(null);
        activeDraftSeenInListRef.current = null;
      } else {
        setDraftSummary(draft);
        setActiveDraftId(draft.id);
      }
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
              ? preferCachedAbutsLab(
                  coerceAutoMatchLab({ labId, labName }),
                  findCachedLab,
                ) || {
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
            rushProcessing: shouldEnablePracticeRushProcessing({
              orderYmd: parsed.orderDate || todayDate,
              arrivalYmd: parsed.arrivalDate,
            }),
            activeDraftId: options?.skipDraftBind ? null : draft.id,
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
    [findCachedLab, setLabOpen, setLabSearch, setRequestMemo, setSelectedLab, todayDate, arrivalDefaultDays],
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
      setEditingSentTransfer(null);
      editingSentTransferRef.current = null;
      applyDraftSummaryToForm(draft);
      // 목록 카드보다 서버 최신 스냅샷을 우선해, 빈 기공소/환자명·파일도 정확히 맞춘다.
      void loadPracticeTransferDraft({ draftId: draft.id, forceResync: true });
      setDraftsOpen(false);
      setComposeOpen(true);
    },
    [
      applyDraftSummaryToForm,
      clearLocalFilesWithCache,
      loadPracticeTransferDraft,
      practiceDraftList,
      toast,
    ],
  );

  const handleBeginEditSentTransfer = useCallback(
    (transfer: RecentTransferItem) => {
      if (!canEditPracticeTransferByStatus(transfer.status)) {
        toast({
          title: "수정할 수 없습니다",
          description: "기공소가 수락하기 전(의뢰 단계)에만 내용을 바꿀 수 있습니다.",
          variant: "destructive",
        });
        return;
      }

      const transferId = String(transfer.transferId || "").trim();
      const transferMongoId = String(transfer.transferMongoIds?.[0] || "").trim();
      if (!transferId) {
        toast({
          title: "의뢰를 찾지 못했습니다",
          description: "목록을 새로고침한 뒤 다시 시도해주세요.",
          variant: "destructive",
        });
        return;
      }

      const restoredFiles: DraftTransferFileItem[] = (transfer.files || [])
        .map((file, index) => {
          const originalName = String(file.fileName || "").trim();
          const s3Key = String(file.s3Key || "").trim();
          if (!originalName || !s3Key) return null;
          return {
            fileId: `ptx:${transferId}:${index}:${s3Key}`,
            originalName,
            mimetype: inferPracticeTransferFileMimetype(originalName),
            size: Number(file.size || 0),
            s3Key,
          };
        })
        .filter((row): row is DraftTransferFileItem => Boolean(row));

      const memoSource = String(
        transfer.rawTransferMemo || transfer.transferMemo || "",
      ).trim();
      const draft: DraftListSummary & { matchingMode?: string | null } = {
        id: "",
        practiceUserId: String(authUser?._id || "").trim(),
        practiceUserLabel: "",
        isMine: true,
        targetLabAnchorId: String(transfer.targetLabAnchorId || "").trim() || null,
        targetLabName: String(transfer.targetLab || "").trim(),
        transferMemo: memoSource,
        patientName: "",
        fileCount: restoredFiles.length,
        files: restoredFiles,
        updatedAt: null,
        createdAt: transfer.createdAt || null,
        matchingMode: transfer.matchingMode || null,
      };

      void clearLocalFilesWithCache();
      const nextEditing: EditingSentTransfer = {
        transferId,
        transferMongoId,
        orderDate: String(transfer.orderDate || "").trim(),
      };
      setEditingSentTransfer(nextEditing);
      editingSentTransferRef.current = nextEditing;
      applyDraftSummaryToForm(draft, {
        keepOrderDate: true,
        keepPastArrival: true,
        skipDraftBind: true,
        skipDesignConfirm: transfer.skipDesignConfirm !== false,
        skipJig: Boolean(transfer.skipJig),
      });

      returnToAllModalRef.current = false;
      setTransferDialogOpen(false);
      transferDialogOpenRef.current = false;
      selectedTransferIdRef.current = "";
      setSelectedTransfer(null);
      setActiveChatRoom(null);
      setDraftsOpen(false);
      setComposeOpen(true);
      toast({
        title: "의뢰 수정",
        description:
          "작성 폼에 불러왔습니다. 저장하면 같은 의뢰가 기공소에 다시 전달됩니다.",
      });
    },
    [
      applyDraftSummaryToForm,
      authUser?._id,
      clearLocalFilesWithCache,
      toast,
    ],
  );

  const handleOpenTransferDialog = async (
    transfer: RecentTransferItem,
    options?: { fromTrash?: boolean; returnToAllModal?: boolean },
  ) => {
    const fromTrash = Boolean(options?.fromTrash);
    const returnToAllModal = Boolean(options?.returnToAllModal);
    // 최근의뢰(전체보기)에서 연 경우 — 전체보기는 유지하고 플로팅 상세만 독립 운영
    returnToAllModalRef.current = returnToAllModal;
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

    // 어벗 디자인·컨펌 CTA는 목록 production 메타 기준. 열 때 최신으로 맞춤.
    void loadRecentRequests({ silent: true });

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
    const files = selectedTransferDetailModel?.downloadAllFiles || [];
    await downloadAll(
      files.map((file) => ({
        s3Key: String(file.s3Key || "").trim(),
        fileName: String(file.fileName || "첨부파일").trim() || "첨부파일",
        busyKey: String(file.s3Key || "").trim(),
      })),
    );
  }, [downloadAll, selectedTransferDetailModel]);

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
      const body =
        res.data && typeof res.data === "object"
          ? (res.data as Record<string, unknown>)
          : {};
      const data =
        body.data && typeof body.data === "object"
          ? (body.data as Record<string, unknown>)
          : body;
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
          ? data.abutmentProductionStarted || data.abutmentProductionStarting
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

  const handleAttachChatFiles = (nextFiles: File[]) => {
    if (!nextFiles.length) return;
    chatUploads.addFiles(nextFiles);
  };

  const syncDraftFilesToServer = async (
    nextDraftFiles: DraftTransferFileItem[],
    options?: { mode?: "append" | "replace" },
  ) => {
    if (!authToken) return;
    if (editingSentTransferRef.current) return;

    const keepDraftWithoutFiles =
      nextDraftFiles.length === 0 &&
      hasAutosaveReadyPatientName(normalizedPatientName);
    const filesMode = options?.mode === "append" ? "append" : "replace";

    if (nextDraftFiles.length === 0 && !keepDraftWithoutFiles) {
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

    // 파일 반영도 완성형 한글 환자명이 있을 때만 서버 draft를 만든다/갱신한다.
    if (!hasAutosaveReadyPatientName(normalizedPatientName)) return;

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

    logPracticeFileSync("syncDraftFiles:start", {
      mode: filesMode,
      draftId: String(activeDraftIdRef.current || "").trim() || null,
      fileCount: nextDraftFiles.length,
      fileIds: nextDraftFiles.map((row) => row.fileId).slice(0, 8),
    });
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
        files: nextDraftFiles.map((row) => ({ fileId: row.fileId })),
        draftFilesMode: filesMode,
        forceResync: true,
      },
    });
    if (!res.ok) {
      throw new Error("임시저장 파일 반영에 실패했습니다.");
    }
    const body =
      res.data && typeof res.data === "object"
        ? (res.data as { data?: PracticeTransferDraftPayload })
        : {};
    const payload = body.data && typeof body.data === "object" ? body.data : null;
    const returnedDraftId = String(payload?._id || "").trim();
    if (returnedDraftId) {
      setActiveDraftId(returnedDraftId);
      activeDraftIdRef.current = returnedDraftId;
      activeDraftSeenInListRef.current = returnedDraftId;
    }
    const returnedFiles = normalizeDraftTransferFileItems(payload?.files);
    const nextCount = nextDraftFiles.length;
    const mergedReturned =
      returnedFiles.length >= nextCount
        ? returnedFiles
        : mergeDraftTransferFileItems(nextDraftFiles, returnedFiles);
    logPracticeFileSync("syncDraftFiles:response", {
      draftId: returnedDraftId || null,
      mode: filesMode,
      sentCount: nextCount,
      returnedCount: returnedFiles.length,
      appliedCount: mergedReturned.length,
    });
    draftFilesRef.current = mergedReturned;
    setDraftFiles(mergedReturned);
  };

  useEffect(() => {
    if (!authToken) return;
    if (editingSentTransferRef.current) return;
    if (!hasSubstantialContentForNewDraft) return;
    if (files.length === 0) return;

    const snapshotFiles = [...files];
    const snapshotKeys = snapshotFiles.map((file) => toTempUploadFileKey(file));
    const seq = ++mobileFilePromoteSeqRef.current;
    fileSyncInFlightRef.current = true;
    setFormSyncStatus("saving");
    logPracticeFileSync("promote:start", {
      localFiles: snapshotFiles.length,
      draftFiles: draftFilesRef.current.length,
      activeDraftId: String(activeDraftIdRef.current || "").trim() || null,
      seq,
      retryNonce: filePromoteRetryNonce,
    });

    const flushPendingDraftApply = () => {
      const pending = pendingDraftApplyRef.current;
      if (!pending) return;
      pendingDraftApplyRef.current = null;
      logPracticeFileSync("promote:flush-pending", {
        draftId: String(pending._id || "").trim() || null,
        incomingFiles: Array.isArray(pending.files) ? pending.files.length : 0,
      });
      applyPracticeDraftPayload(pending, {
        forceResync: Boolean(pending.forceResync),
      });
    };

    void (async () => {
      try {
        // peek만 하다 uploadProgress 재실행을 놓치면(iOS 카메라 복귀 스로틀) PC에 안 간다.
        // ensure로 업로드를 끝까지 기다린 뒤 같은 turn에서 draft append 한다.
        const uploaded = await ensureFilesUploaded(snapshotFiles);
        if (seq !== mobileFilePromoteSeqRef.current) return;

        const localTempFiles = uploaded
          .map((row) => ({
            fileId: String(row._id || "").trim(),
            originalName: String(row.originalName || "").trim(),
            mimetype: String(
              row.mimetype || row.fileType || "application/octet-stream",
            ).trim(),
            size: Number(row.size || 0),
            s3Key: String(row.key || "").trim(),
            location: String(row.location || "").trim(),
          }))
          .filter((row) => row.fileId && row.originalName && row.s3Key);

        logPracticeFileSync("promote:uploaded", {
          seq,
          uploadedCount: localTempFiles.length,
        });

        const seen = new Set(
          draftFilesRef.current.map((row) => String(row.s3Key || "").trim()),
        );
        const additions = localTempFiles.filter(
          (row) => row.s3Key && !seen.has(row.s3Key),
        );
        snapshotFiles.forEach((file, index) => {
          const uploadedRow = uploaded[index];
          const s3Key = String(uploadedRow?.key || "").trim();
          if (
            !s3Key ||
            !isPracticeOralPhotoPreviewable(
              file.name,
              file.type || uploadedRow?.mimetype || uploadedRow?.fileType,
            )
          ) {
            return;
          }
          rememberOralPhotoObjectUrl(s3Key, file, file.name);
        });
        const nextDraftFiles = additions.length
          ? [...draftFilesRef.current, ...additions]
          : draftFilesRef.current;
        if (additions.length) {
          draftFilesRef.current = nextDraftFiles;
          setDraftFiles(nextDraftFiles);
          await syncDraftFilesToServer(nextDraftFiles, { mode: "append" });
        } else {
          logPracticeFileSync("promote:no-additions", {
            seq,
            draftFiles: draftFilesRef.current.length,
            uploadedCount: localTempFiles.length,
          });
        }
        if (seq !== mobileFilePromoteSeqRef.current) return;
        snapshotKeys.forEach((key) => {
          const localFile = pendingLocalFilesRef.current.find(
            (file) => toTempUploadFileKey(file) === key,
          );
          if (localFile) forgetFile(localFile);
        });
        removeFilesByKeys(snapshotKeys);
        if (seq !== mobileFilePromoteSeqRef.current) return;
        setFormSyncStatus("saved");
      } catch (error) {
        logPracticeFileSync("promote:error", {
          seq,
          message: error instanceof Error ? error.message : String(error || ""),
        });
        if (seq === mobileFilePromoteSeqRef.current) setFormSyncStatus("error");
      } finally {
        if (seq === mobileFilePromoteSeqRef.current) {
          fileSyncInFlightRef.current = false;
          flushPendingDraftApply();
        }
      }
    })();
  }, [
    applyPracticeDraftPayload,
    authToken,
    ensureFilesUploaded,
    filePromoteRetryNonce,
    files,
    forgetFile,
    hasSubstantialContentForNewDraft,
    rememberOralPhotoObjectUrl,
    removeFilesByKeys,
  ]);

  // iOS Safari: 카메라/앨범 복귀 후 JS가 멈춘 뒤, 탭·임시저장 탭으로 풀릴 때 promote 재시도.
  useEffect(() => {
    if (!authToken) return;
    const bump = (reason: string) => {
      if (pendingLocalFilesRef.current.length === 0) return;
      logPracticeFileSync("promote:retry-bump", {
        reason,
        localFiles: pendingLocalFilesRef.current.length,
      });
      setFilePromoteRetryNonce((n) => n + 1);
    };
    const onVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        bump("visibilitychange");
      }
    };
    const onFocus = () => bump("focus");
    const onPageShow = () => bump("pageshow");
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [authToken]);

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
      const removed = prevDraftFiles[removeIndex];
      const nextDraftFiles = prevDraftFiles.filter((_, idx) => idx !== removeIndex);
      setDraftFiles(nextDraftFiles);
      const removedS3Key = String(removed?.s3Key || "").trim();
      if (removedS3Key) forgetOralPhotoObjectUrls([removedS3Key]);

      try {
        await syncDraftFilesToServer(nextDraftFiles, { mode: "replace" });
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
    forgetOralPhotoObjectUrls();
    if (draftFiles.length > 0) {
      const prevDraftFiles = [...draftFiles];
      setDraftFiles([]);
      try {
        await syncDraftFilesToServer([], { mode: "replace" });
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
      // 캘린더가 메인 — Confirm 포털 unmount 직후 suppress 플래그만 정리
      window.setTimeout(() => {
        suppressRecentAllModalCloseRef.current = false;
        deleteReturnToAllModalRef.current = false;
      }, 0);
      return;
    }
    suppressRecentAllModalCloseRef.current = false;
  };

  const handleAskDeleteTransfer = (
    transfer: RecentTransferItem,
    options?: { returnToAllModal?: boolean },
  ) => {
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
    if (
      options?.returnToAllModal ||
      returnToAllModalRef.current
    ) {
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

  const handleDeleteDraftTransfer = async (
    target: RecentTransferItem,
    options?: { silent?: boolean },
  ) => {
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
      if (!options?.silent) {
        toast({
          title: "휴지통으로 이동",
          description: "임시저장을 휴지통으로 옮겼습니다. 아래에서 복구할 수 있습니다.",
        });
      }
    } catch (error) {
      if (!options?.silent) {
        toast({
          title: "휴지통 이동 실패",
          description:
            error instanceof Error ? error.message : "임시저장 삭제 중 오류가 발생했습니다.",
          variant: "destructive",
        });
      }
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

    const targetTransferId = String(target.transferId || "").trim();
    const targetId = String(target.id || "").trim();
    if (
      selectedTransfer &&
      (String(selectedTransfer.transferId || "").trim() === targetTransferId ||
        String(selectedTransfer.id || "").trim() === targetId)
    ) {
      setTransferDialogOpen(false);
      transferDialogOpenRef.current = false;
      selectedTransferIdRef.current = "";
      setSelectedTransfer(null);
      setActiveChatRoom(null);
      setChatMessages([]);
      setChatError("");
    }
    if (
      labRejectedReselectTarget &&
      String(labRejectedReselectTarget.transferId || "").trim() === targetTransferId
    ) {
      setLabRejectedReselectTarget(null);
    }

    setDeletingTransfer(true);

    const deletedSet = new Set(requestIds);
    const deletedMongoSet = new Set(transferMongoIds);
    const previousRecentRequests = recentRequests;

    // optimistic UI: 최근 내역·전체보기 달력에서 휴지통(취소)으로 이동(즉시 칩 제거)
    setRecentRequests((prev) =>
      prev.map((row) => {
        const rowTransferId = String(row.transferId || "").trim();
        const rowMongoId = String(row.requestMongoId || "").trim();
        const matched =
          deletedSet.has(row.id) ||
          (targetTransferId &&
            targetTransferId !== "-" &&
            rowTransferId === targetTransferId) ||
          (rowMongoId && deletedMongoSet.has(rowMongoId));
        return matched ? { ...row, status: "취소" } : row;
      }),
    );
    // 사이드바·페이지 useChatRooms 인스턴스 모두 unread 즉시 동기화
    // refetch는 API 성공 후 — 완료 전 재조회하면 stale unread가 배지를 되돌림
    invalidateApiGetCache("/api/chats/rooms");
    requestChatRoomsRefresh({
      action: "deleted",
      transferIds,
      transferMongoIds,
      refetch: false,
    });
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
        invalidateApiGetCache("/api/chats/rooms");
        requestChatRoomsRefresh({ skipCache: true });
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

        invalidateApiGetCache("/api/chats/rooms");
        requestChatRoomsRefresh({
          action: "deleted",
          transferIds,
          transferMongoIds,
          skipCache: true,
        });

        // 부분 실패면 서버 기준으로 재동기화(실패 건을 다시 표시)
        if (failedIds.length > 0) {
          void loadRecentRequests();
        }
      }

    } catch (error) {
      // 통신/서버 오류 시 optimistic 변경 롤백
      setRecentRequests(previousRecentRequests);
      invalidateApiGetCache("/api/chats/rooms");
      requestChatRoomsRefresh({ skipCache: true });
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
        invalidateApiGetCache("/api/chats/rooms");
        requestChatRoomsRefresh({
          action: "restored",
          skipCache: true,
        });
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
      invalidateApiGetCache("/api/chats/rooms");
      requestChatRoomsRefresh({
        action: "trash-emptied",
        skipCache: true,
      });
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
    // 모바일 Safari 등 background hidden 동안에도 첨부 이벤트를 놓치지 않는다.
    requireVisible: false,
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
      const isSameOpenCase =
        Boolean(eventDraftId) &&
        (eventDraftId === activeId || eventDraftId === summaryId);
      const isLinkedCaseEvent = isSameOpenCase;
      const isActiveCaseEvent = isSameOpenCase;

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
        if (
          (activeId && ids.includes(activeId)) ||
          (summaryId && ids.includes(summaryId))
        ) {
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
        // 같은 케이스(불러온 draftId) 또는 같은 기공소·환자 작성 폼이면 파일을 반영한다.
        if (action === "draft-upserted") {
          const parsedEventMemo = parsePracticeTransferMemoMeta(
            String(payload.transferMemo || ""),
          );
          const eventPatientName = String(parsedEventMemo.patientName || "")
            .trim()
            .normalize("NFC");
          const eventLabId = String(payload.targetLabAnchorId || "").trim();
          const eventLabName = String(payload.targetLabName || "").trim();
          const currentLabId = toApiLabAnchorId(selectedLab?._id) || "";
          const currentLabName = String(selectedLab?.name || "").trim();
          const sameOpenLab =
            Boolean(eventLabId && currentLabId && eventLabId === currentLabId) ||
            Boolean(eventLabName && currentLabName && eventLabName === currentLabName);
          const sameOpenPatient =
            hasAutosaveReadyPatientName(eventPatientName) &&
            eventPatientName === normalizedPatientName;
          const eventFingerprint = buildPracticeTransferFormFingerprint({
            targetLabAnchorId:
              payload.targetLabAnchorId != null
                ? String(payload.targetLabAnchorId).trim() || null
                : null,
            targetLabName: eventLabName,
            patientName: parsedEventMemo.patientName,
            orderDate: parsedEventMemo.orderDate,
            arrivalDate: parsedEventMemo.arrivalDate,
            arrivalDefaultDays: parsedEventMemo.arrivalDefaultDays,
            requestMemo: parsedEventMemo.memo,
            prosthesisTypes: parsedEventMemo.prosthesisTypes,
            toothWorks: parsedEventMemo.toothWorks,
          });
          const sameOpenForm =
            sameOpenPatient &&
            Boolean(currentFormFingerprintRef.current) &&
            eventFingerprint === currentFormFingerprintRef.current;
          // 모바일/PC는 draftId·치식 fingerprint가 갈라져도 같은 기공소·환자면 파일을 맞춘다.
          const sameOpenCaseByForm = sameOpenPatient && sameOpenLab;
          const eventFileCount = Number(payload.fileCount ?? NaN);
          const incomingFiles = normalizeDraftTransferFileItems(payload.files);
          const localFileCount = draftFilesRef.current.length;
          const incomingFileCount = Number.isFinite(eventFileCount)
            ? Math.max(eventFileCount, incomingFiles.length)
            : incomingFiles.length;
          const filesTouched = Boolean(payload.filesTouched);
          const draftFilesMode = String(payload.draftFilesMode || "keep")
            .trim()
            .toLowerCase();

          logPracticeFileSync("event:draft-upserted", {
            eventDraftId: eventDraftId || null,
            activeId: activeId || null,
            isActiveCaseEvent,
            sameOpenForm,
            sameOpenCaseByForm,
            sameOpenPatient,
            sameOpenLab,
            eventPatientName,
            localPatientName: normalizedPatientName,
            eventLabId: eventLabId || null,
            currentLabId: currentLabId || null,
            eventLabName,
            currentLabName,
            filesTouched,
            draftFilesMode,
            localFileCount,
            incomingFileCount,
            editorUserId: String(payload.editorUserId || "").trim() || null,
            visible:
              typeof document === "undefined"
                ? true
                : document.visibilityState === "visible",
          });

          if (!isActiveCaseEvent && !sameOpenForm && !sameOpenCaseByForm) {
            logPracticeFileSync("event:skip-unrelated", {
              eventDraftId: eventDraftId || null,
            });
            return;
          }

          if (incomingFileCount > localFileCount) {
            autoJoinedDraftIdRef.current = "";
          }

          // 같은 계정 다른 탭/창도 반영해야 하므로 editorUserId echo skip 하지 않는다.
          // 파일 추가는 폼을 덮지 않는다(forceResync는 치식/날짜 스냅샷 덮어쓰기용).
          // forceResync로 첨부를 교체하지 않는다 — filesTouched+replace만 축소 허용.
          const hasEventSnapshot =
            typeof payload.transferMemo === "string" || incomingFiles.length > 0;
          if (hasEventSnapshot) {
            applyPracticeDraftPayload({
              _id: eventDraftId || activeId,
              practiceUserId: String(payload.practiceUserId || "").trim() || myUserId,
              practiceUserLabel: String(payload.practiceUserLabel || "").trim() || null,
              targetLabAnchorId:
                payload.targetLabAnchorId != null
                  ? String(payload.targetLabAnchorId).trim() || null
                  : null,
              targetLabName: eventLabName,
              transferMemo: String(payload.transferMemo || ""),
              files: incomingFiles,
              updatedAt: payload.updatedAt ? String(payload.updatedAt) : null,
              createdAt: payload.createdAt ? String(payload.createdAt) : null,
              forceResync: sameOpenForm,
              filesTouched,
              draftFilesMode,
            });
            if (incomingFileCount > localFileCount || filesTouched) {
              const reloadDraftId = String(eventDraftId || activeId || "").trim();
              if (reloadDraftId) {
                logPracticeFileSync("event:get-fallback", {
                  reloadDraftId,
                  incomingFileCount,
                  localFileCount,
                  filesTouched,
                });
                void loadPracticeTransferDraft({
                  draftId: reloadDraftId,
                  forceResync: false,
                });
              }
            }
            return;
          }

          void loadPracticeTransferDraft({
            draftId: eventDraftId || activeId,
            forceResync: true,
          });
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
        const resendHint =
          "다른 기공소를 선택해 다시 전송하거나, 진행을 중단하려면 의뢰를 취소하세요.";
        toast({
          title: isAutoRelease
            ? "작업 취소"
            : isLabReject
              ? releaseLabName
                ? `「${releaseLabName}」에서 의뢰를 수락하지 않았어요`
                : "기공소에서 의뢰를 수락하지 않았어요"
              : releaseLabName
                ? `「${releaseLabName}」에서 작업을 취소했어요`
                : "작업이 취소되었어요",
          description: isAutoRelease
            ? "다른 기공소에 다시 공개됩니다."
            : resendHint,
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
      toast({
        title: "필수 입력 항목을 확인해주세요",
        description: `미입력 항목: ${missingRequiredFields.join(", ")}`,
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

    const periodDays = getPracticeWorkPeriodDays(orderDate, arrivalDate);
    if (isPracticeWorkPeriodBlocked(periodDays)) {
      toast({
        title: PRACTICE_WORK_PERIOD_BLOCK_MESSAGE,
        variant: "destructive",
      });
    } else if (isPracticeWorkPeriodLateWarning(periodDays)) {
      toast({ title: PRACTICE_WORK_PERIOD_LATE_WARNING_MESSAGE });
    }



    const hasBridgeLikeWithoutLinkedTooth = normalizedToothWorks.some(
      (row) => isBridgeLikeProsthesisType(row.prosthesisType) && row.bridgeLinkedTeeth.length === 0,
    );
    if (hasBridgeLikeWithoutLinkedTooth) {
      toast({
        title: "브리지/결손치/유지장치 연결 치아를 선택해주세요",
        description: "브리지, 결손치, 유지장치 형태는 인접 치아를 최소 1개 연결해야 합니다.",
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
      // promote(로컬→draft) 도중 stale draftFiles/빈 files로 전송되면 스캔이 빠진다.
      if (pendingLocalFilesRef.current.length > 0) {
        setFilePromoteRetryNonce((n) => n + 1);
      }
      await waitForComposeFileSyncIdle(60_000);

      const localFilesForSubmit = pendingLocalFilesRef.current;
      const uploadedTempFiles: TempUploadedFile[] =
        await resolveUploadedTempFiles(localFilesForSubmit);

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

      const draftSnapshot = draftFilesRef.current;
      const seenS3 = new Set(
        draftSnapshot
          .map((row) => String(row.s3Key || "").trim())
          .filter(Boolean),
      );
      const transferFiles = [
        ...draftSnapshot,
        ...localTempFiles.filter((row) => {
          const key = String(row.s3Key || "").trim();
          return Boolean(key) && !seenS3.has(key);
        }),
      ];
      const clinicName = autoClinicName;
      const editing = editingSentTransferRef.current;
      const transferId = editing?.transferId || makeTransferId();
      const submitOrderDate =
        (editing?.orderDate && /^\d{4}-\d{2}-\d{2}$/.test(editing.orderDate)
          ? editing.orderDate
          : orderDate) || orderDate;
      const submitArrivalDate = arrivalDate;
      const transferMemo = buildPracticeTransferMemo({
        memo: requestMemo,
        orderDate: submitOrderDate,
        arrivalDate: submitArrivalDate,
        arrivalDefaultDays,
        prosthesisTypes: normalizedProsthesisTypes,
        toothWorks: syncToothWorks,
        patientName: normalizedPatientName,
        skipDesignConfirm,
        skipJig: effectiveSkipJig,
      });
      const practiceRouting = {
        targetLabAnchorId: toApiLabAnchorId(selectedLab?._id),
        targetLabName: String(selectedLab?.name || "").trim(),
        matchingMode: "direct",
        skipDesignConfirm,
        skipJig: effectiveSkipJig,
        rushProcessing,
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
        path: editing
          ? `/api/practice/transfers/${encodeURIComponent(transferId)}/update-content`
          : "/api/practice/transfers",
        method: "POST",
        token: authToken,
        jsonBody: {
          transferId,
          draftId: editing ? undefined : draftIdToSubmit || undefined,
          matchingMode: "direct",
          targetLabAnchorId: toApiLabAnchorId(selectedLab?._id),
          targetLabName: String(selectedLab?.name || "").trim(),
          orderDate: submitOrderDate,
          arrivalDate: submitArrivalDate,
          arrivalDefaultDays,
          transferMemo,
          toothWorks: syncToothWorks,
          skipDesignConfirm,
          skipJig: effectiveSkipJig,
          rushProcessing,
          autoMatchMinLabRating,
          autoMatchMaxLabRating,
          caseInfos: caseInfosPayload,
        },
      });
      if (!submitRes.ok) {
        const body = asApiMessagePayload(submitRes.data);
        throw new Error(
          String(
            body?.message ||
              (editing ? "의뢰 수정에 실패했습니다." : "기공소 전송에 실패했습니다."),
          ),
        );
      }

      // 전송 API 성공 직후 UI 해제. 폼 리셋·draft 목록은 백그라운드.
      requestSubmittingRef.current = false;
      setRequestSubmitting(false);

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

      toast({
        title: editing ? "의뢰가 수정되었습니다" : "기공소 전송 완료",
        description: editing
          ? "같은 의뢰가 기공소에 다시 전달되었습니다. 수락 전이면 기공소 화면에도 바로 반영됩니다."
          : remainingDraftCount > 0
            ? `작성 중이던 의뢰만 전송했습니다. 임시저장 ${remainingDraftCount}건은 목록에 남아 있습니다.`
            : "기공소로 정상 전송되었습니다.",
      });

      if (isExpressMode) {
        setExpressDone(true);
        setExpressStepId("lab");
        void loadRecentRequests({ silent: true });
        setComposeOpen(false);
      } else {
        setComposeOpen(false);
        void loadRecentRequests({ silent: true });
      }

      void (async () => {
        try {
          draftListSeqRef.current += 1;
          await resetIntakeFormAfterTransfer();
          void loadPracticeTransferDraftList();
        } catch {
          // 전송은 이미 성공. 정리 실패는 무시.
        }
      })();
    } catch (error) {
      toast({
        title: editingSentTransferRef.current
          ? "의뢰 수정 실패"
          : "기공소 전송 실패",
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

  const formAutosaveBlockedHint = useMemo(
    () => getFormAutosaveBlockedHint(normalizedPatientName),
    [normalizedPatientName],
  );

  const formSyncStatusLabel = editingSentTransfer
    ? "수락 전 수정 중"
    : formSyncStatus === "pending"
      ? "동기화 대기…"
      : formSyncStatus === "saving"
        ? "동기화 중…"
        : formSyncStatus === "error"
          ? "동기화 실패 · 다시 시도"
          : formAutosaveBlockedHint
            ? formAutosaveBlockedHint
            : formSyncStatus === "saved" && (draftFiles.length > 0 || Boolean(activeDraftId))
              ? activeDraftId
                ? "동기화됨"
                : "임시저장됨"
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
    return missing;
  }, [
    selectedLab,
    normalizedPatientName,
    normalizedToothWorks,
    missingAbutmentPresetTeeth,
  ]);

  const hasRequiredSubmitFields = missingRequiredFields.length === 0;

  const showExpressWizard = isExpressMode && !expressDone;

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
        ok: true,
        reason: "",
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
    const tourMapped = getExpressStepIdForGuideTourStep(guideTourStep);
    const firstIncomplete =
      order.find((id) => !expressStepGate[id]?.ok) || "confirm";
    const prev = prevWorkspaceModeRef.current;
    if (prev === null) {
      if (!localFormHydrated) return;
      prevWorkspaceModeRef.current = workspaceMode;
      if (expressStepRestoredRef.current) return;
      expressStepRestoredRef.current = true;
      setExpressStepId(tourMapped ?? firstIncomplete);
      return;
    }
    prevWorkspaceModeRef.current = workspaceMode;
    if (prev === "express") return;
    setExpressDone(false);
    expressStepRestoredRef.current = true;
    // 투어 중 익스프레스 진입 시 투어 스텝에 맞는 위저드 단계로
    setExpressStepId(tourMapped ?? firstIncomplete);
  }, [
    expressStepGate,
    guideTourStep,
    isExpressMode,
    localFormHydrated,
    workspaceMode,
  ]);

  // 투어가 앞으로 진행될 때만 익스프레스 단계를 맞춤.
  // (1·2 클릭으로 투어를 뒤로 보낼 때는 onStepIdChange가 express를 직접 설정)
  const prevGuideTourStepRef = useRef<PracticeToothWorkGuideTourStep | null>(null);
  useEffect(() => {
    const prevTour = prevGuideTourStepRef.current;
    prevGuideTourStepRef.current = guideTourStep;
    if (!isExpressMode || !showExpressWizard) return;
    if (guideTourStep == null) return;
    if (prevTour != null && guideTourStep < prevTour) return;
    const mapped = getExpressStepIdForGuideTourStep(guideTourStep);
    if (!mapped) return;
    setExpressStepId((prev) => {
      // 파일·확인은 사용자가 고른 자리 유지(투어 보철 스텝이 끌어오지 않음)
      if (prev === "files" || prev === "confirm") return prev;
      return prev === mapped ? prev : mapped;
    });
  }, [guideTourStep, isExpressMode, showExpressWizard]);

  useEffect(() => {
    if (!orderDate) return;
    if (skipNextArrivalAutoSyncRef.current) {
      skipNextArrivalAutoSyncRef.current = false;
      return;
    }
    setArrivalDate(addDaysToDateInput(orderDate, arrivalDefaultDays));
  }, [orderDate, arrivalDefaultDays]);

  // 주문일은 항상 오늘(KST)로 고정. 수락 전 수정 중이면 원래 주문일을 유지한다.
  useEffect(() => {
    if (editingSentTransfer || editingSentTransferRef.current) return;
    if (orderDate === todayDate) return;
    skipNextArrivalAutoSyncRef.current = true;
    setOrderDate(todayDate);
    setArrivalDate((prev) => {
      const current = String(prev || "").trim();
      if (current && current >= todayDate) return current;
      return addDaysToDateInput(todayDate, arrivalDefaultDays);
    });
  }, [arrivalDefaultDays, editingSentTransfer, orderDate, todayDate]);

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

  const handleStartNewTransfer = async (options?: {
    arrivalYmd?: string;
    openCompose?: boolean;
    silentToast?: boolean;
  }) => {
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
    const nextArrivalDefaultDays = accountArrivalDefaultDays;
    setArrivalDefaultDays(nextArrivalDefaultDays);
    const nextOrderDate = todayDate;
    const requestedArrival = String(options?.arrivalYmd || "").trim();
    const nextArrivalDate =
      /^\d{4}-\d{2}-\d{2}$/.test(requestedArrival) &&
      requestedArrival > todayDate
        ? requestedArrival
        : addDaysToDateInput(todayDate, nextArrivalDefaultDays);
    skipNextArrivalAutoSyncRef.current = true;
    setOrderDate(nextOrderDate);
    setArrivalDate(nextArrivalDate);
    if (
      /^\d{4}-\d{2}-\d{2}$/.test(requestedArrival) &&
      requestedArrival > todayDate
    ) {
      const diff = kstYmdDiffDays(todayDate, nextArrivalDate);
      if (diff != null) {
        setArrivalDefaultDays(normalizeArrivalDefaultDays(diff));
      }
    }
    setRushProcessing(
      shouldEnablePracticeRushProcessing({
        orderYmd: nextOrderDate,
        arrivalYmd: nextArrivalDate,
      }),
    );
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
    forgetOralPhotoObjectUrls();
    setDraftFiles([]);
    setDraftSummary(null);
    setActiveDraftId(null);
    activeDraftSeenInListRef.current = null;
    autoJoinedDraftIdRef.current = "";
    setEditingSentTransfer(null);
    editingSentTransferRef.current = null;
    setToothChartResetNonce((n) => n + 1);
    setExpressDone(false);
    setExpressStepId("lab");
    setExpressWizardEpoch((n) => n + 1);
    expressStepRestoredRef.current = true;
    setGuideTourStep(null);
    setGuideTourActive(false);
    setGuideTourExitSignal((n) => n + 1);

    // 빈 폼 baseline — 이후 의뢰서 항목을 바꾸거나 파일을 업로드하면 그때 동기화된다.
    const baselineFingerprint = buildPracticeTransferFormFingerprint({
      targetLabAnchorId: undefined,
      targetLabName: undefined,
      patientName: "",
      orderDate: nextOrderDate,
      arrivalDate: nextArrivalDate,
      arrivalDefaultDays: nextArrivalDefaultDays,
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

    if (options?.openCompose !== false) {
      setComposeOpen(true);
    }

    // 작성 모달을 열 때는 안내 토스트를 띄우지 않는다.
    if (!options?.silentToast && options?.openCompose === false) {
      toast({
        title: options?.arrivalYmd ? "신규 의뢰" : "새로 작성",
        description: options?.arrivalYmd
          ? `치과도착일 ${options.arrivalYmd}. 기공소·환자·보철물을 입력해 전송하세요.`
          : isExpressMode
            ? "작성 화면을 비웠습니다. 전송 후에는 캘린더에서 다시 확인할 수 있습니다."
            : "작성 화면을 비웠습니다. 임시저장은 임시저장 목록에 남아 다시 불러올 수 있습니다.",
      });
    }
  };

  const openComposeForArrival = (ymd: string) => {
    void handleStartNewTransfer({
      arrivalYmd: ymd,
      openCompose: true,
      silentToast: true,
    });
  };

  const openNewComposeFromDrafts = () => {
    setDraftsOpen(false);
    void handleStartNewTransfer({ openCompose: true, silentToast: true });
  };

  const waitForComposeFileSyncIdle = async (maxMs = 8000) => {
    const start = Date.now();
    while (fileSyncInFlightRef.current && Date.now() - start < maxMs) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 100);
      });
    }
  };

  /** 모바일 작성 — 현재 내용 임시저장 후 빈 폼 */
  const handleSaveComposeDraftAndStartNew = async () => {
    if (editingSentTransferRef.current) return;
    if (!hasAutosaveReadyPatientName(normalizedPatientName)) {
      toast({
        title: "임시저장할 수 없어요",
        description: "완성형 한글 환자명을 입력한 뒤 다시 시도해 주세요.",
        variant: "destructive",
      });
      return;
    }

    if (formAutosaveTimerRef.current) {
      window.clearTimeout(formAutosaveTimerRef.current);
      formAutosaveTimerRef.current = null;
    }

    const seq = ++formAutosaveSeqRef.current;
    const needsFormSave =
      lastSavedFormFingerprintRef.current === null ||
      currentFormFingerprintRef.current !== lastSavedFormFingerprintRef.current ||
      pendingLocalFormEditRef.current;

    if (needsFormSave) {
      await persistFormDraftAutosave(seq);
    }

    if (pendingLocalFilesRef.current.length > 0) {
      setFilePromoteRetryNonce((n) => n + 1);
      await waitForComposeFileSyncIdle();
    }

    await handleStartNewTransfer({ openCompose: true, silentToast: true });
  };

  /** 모바일 작성 — 현재 작성 내용 삭제(임시저장은 휴지통) */
  const handleDiscardComposeWork = async () => {
    if (editingSentTransferRef.current) return;

    formAutosaveSeqRef.current += 1;
    if (formAutosaveTimerRef.current) {
      window.clearTimeout(formAutosaveTimerRef.current);
      formAutosaveTimerRef.current = null;
    }
    skipFormAutosaveRef.current = true;

    const activeId = String(activeDraftIdRef.current || "").trim();
    if (activeId) {
      const draftTarget =
        draftGroupedTransfers.find((row) => row.id === activeId) ||
        practiceDraftList.find((row) => row.id === activeId);
      if (draftTarget) {
        await handleDeleteDraftTransfer(draftTarget as RecentTransferItem, {
          silent: true,
        });
      } else if (authToken) {
        try {
          await apiFetch<unknown>({
            path: `/api/practice/transfers/draft?draftId=${encodeURIComponent(activeId)}`,
            method: "DELETE",
            token: authToken,
          });
          invalidateApiGetCache("/api/practice/transfers/drafts");
          await loadPracticeTransferDraftList();
        } catch {
          // 삭제 실패 시에도 폼은 비운다
        }
      }
    }

    await handleStartNewTransfer({ openCompose: true, silentToast: true });
    skipFormAutosaveRef.current = false;
  };

  const mobileComposeCanSaveDraft = hasSubstantialContentForNewDraft;
  const mobileComposeCanDiscard =
    Boolean(activeDraftId) ||
    files.length > 0 ||
    draftFiles.length > 0 ||
    Boolean(normalizedPatientName.trim()) ||
    Boolean(String(requestMemo || "").trim());

  const persistArrivalDefaultDaysFromRange = useCallback(
    (nextOrder: string, nextArrival: string) => {
      const diff = kstYmdDiffDays(nextOrder, nextArrival);
      if (diff == null) return;
      const nextDays = normalizeArrivalDefaultDays(diff);
      if (nextDays === arrivalDefaultDays) return;

      // orderDate effect가 도착일을 덮어쓰지 않도록 한 틱 스킵
      skipNextArrivalAutoSyncRef.current = true;
      setArrivalDefaultDays(nextDays);

      const labId = String(selectedLab?._id || "").trim();
      const labName = String(selectedLab?.name || "").trim();
      const isLabScoped = isMongoObjectIdString(labId);
      let nextLabArrivalDefaults = labArrivalDefaults;
      if (isLabScoped) {
        nextLabArrivalDefaults = upsertLabArrivalDefault(labArrivalDefaults, {
          labAnchorId: labId,
          labName,
          arrivalDefaultDays: nextDays,
        });
        setLabArrivalDefaults(nextLabArrivalDefaults);
        labArrivalDefaultsRef.current = nextLabArrivalDefaults;
      } else {
        setAccountArrivalDefaultDays(nextDays);
        accountArrivalDefaultDaysRef.current = nextDays;
      }

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
            arrivalDefaultDays: isLabScoped
              ? accountArrivalDefaultDays
              : nextDays,
            labArrivalDefaults: nextLabArrivalDefaults,
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

      void savePracticeTransferSettingsToServer(
        isLabScoped
          ? {
              labArrivalDefault: {
                labAnchorId: labId,
                labName,
                arrivalDefaultDays: nextDays,
              },
            }
          : { arrivalDefaultDays: nextDays },
      ).catch(() => {
        // 날짜 적용은 유지하고, 서버 저장 실패는 다음 저장 기회에 재시도
      });
    },
    [
      abutmentFavorites,
      accountArrivalDefaultDays,
      arrivalDefaultDays,
      implantFavorites,
      labArrivalDefaults,
      memoSnippets,
      normalizedProsthesisTypes,
      savePracticeTransferSettingsToServer,
      selectedLab?._id,
      selectedLab?.name,
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
                      "모바일에서 환자 사진 찍어 첨부할 수 있어요.",
                    requirementNoteExtra:
                      "TRIOS 스캔은 Communicate로 기공소에 보내 주세요.",
                    files: combinedDisplayFiles.map((file) => {
                      const localFile =
                        file.kind === "local" ? files[file.localIndex] : null;
                      const progress = localFile
                        ? uploadProgress[toTempUploadFileKey(localFile)]
                        : undefined;
                      const draftRow =
                        file.kind === "draft" ? draftFiles[file.draftIndex] : null;
                      const draftS3Key = String(draftRow?.s3Key || "").trim();
                      const isImage = isPracticeOralPhotoPreviewable(
                        file.name,
                        localFile?.type || draftRow?.mimetype,
                      );
                      const previewUrl = isImage
                        ? file.kind === "local"
                          ? localPhotoPreviewUrls[file.localIndex] || null
                          : (draftS3Key && oralPhotoObjectUrlByS3Key[draftS3Key]) ||
                            null
                        : undefined;
                      return {
                        key: file.key,
                        name: file.name,
                        size: file.size,
                        metaSuffix: file.kind === "draft" ? "동기화됨" : "대기",
                        uploadPercent: progress?.percent,
                        uploadStatus:
                          file.kind === "draft" ? "done" : progress?.status,
                        ...(isImage ? { previewUrl } : {}),
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
                    onPreviewFile: (file) => {
                      const url = String(file.previewUrl || "").trim();
                      if (!url) return;
                      setOralPhotoPreview({
                        name: String(file.name || "사진").trim() || "사진",
                        url,
                      });
                    },
  };

  /** 익스프레스 1~6 — 오른쪽 레일에 프로그레스(투어 카드 아래) */
  const expressStepProgressNode = showExpressWizard ? (
    <PracticeTransferExpressStepProgress
      key={expressWizardEpoch}
      className="w-full flex-col items-stretch gap-2 sm:flex-col"
      stepId={expressStepId}
      onStepIdChange={(next) => {
        setExpressStepId(next);
        if (guideTourStep == null) return;
        const jumped = getGuideTourStepForExpressStepId(next, guideTourStep);
        if (jumped != null && jumped !== guideTourStep) {
          setGuideTourStep(jumped);
        }
      }}
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
  ) : null;

  /** PC — 툴바는 작성 DialogHeader. intake는 투어 레일만 예약 */
  const showComposeHeaderToolbar = !isMobile;

  const practiceWorkspaceToolbar = (
    <>
      <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 px-3"
                onClick={() => void handleStartNewTransfer({ openCompose: true })}
              >
                새로 작성
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              작성 화면만 비웁니다. 임시저장은 목록에 남습니다.
            </TooltipContent>
          </Tooltip>
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
            onClick={() => {
              setTrashOpen(true);
              void loadRecentRequests({ silent: true });
            }}
          >
            <Trash2 className="h-4 w-4 shrink-0" />
            휴지통
            {trashGroupedTransfers.length > 0 ? (
              <Badge variant="secondary" className="ml-0.5">
                {trashGroupedTransfers.length}
              </Badge>
            ) : null}
          </Button>
        </div>
        {formSyncStatusLabel ? (
          <span
            title={formSyncStatusLabel}
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
        <Button
          type="button"
          size="sm"
          className="h-9 px-3"
          onClick={() => {
            if (guideTourActive) {
              setGuideTourExitSignal((n) => n + 1);
              return;
            }
            setGuideTourStartSignal((n) => n + 1);
          }}
        >
          {guideTourActive ? "투어 종료" : "가이드투어"}
        </Button>
        <DemoModeBadge />
      </div>
    </>
  );

  /** 메인 헤더 — 모바일: 의뢰(임시저장 목록)·휴지통. PC: 임시저장·휴지통 */
  const calendarHeaderActions = isMobile ? (
    <div className="flex w-full shrink-0 flex-nowrap items-center justify-center gap-2.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 shrink-0 gap-1 rounded-full border-slate-200 bg-white px-3 shadow-sm"
        aria-label={
          draftGroupedTransfers.length > 0
            ? `의뢰 ${draftGroupedTransfers.length}건`
            : "의뢰"
        }
        title="의뢰 현황"
        onClick={() => setDraftsOpen(true)}
      >
        <BookmarkPlus className="h-4 w-4 shrink-0" />
        의뢰
        {draftGroupedTransfers.length > 0 ? (
          <Badge
            variant="secondary"
            className="h-4 min-w-4 justify-center rounded-full px-1 text-[10px] leading-none"
          >
            {draftGroupedTransfers.length}
          </Badge>
        ) : null}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 shrink-0 gap-1 rounded-full border-slate-200 bg-white px-3 shadow-sm"
        aria-label={
          trashGroupedTransfers.length > 0
            ? `휴지통 ${trashGroupedTransfers.length}건`
            : "휴지통"
        }
        title="휴지통"
        onClick={() => {
          setTrashOpen(true);
          void loadRecentRequests({ silent: true });
        }}
      >
        <Trash2 className="h-4 w-4 shrink-0" />
        휴지통
        {trashGroupedTransfers.length > 0 ? (
          <Badge
            variant="secondary"
            className="h-4 min-w-4 justify-center rounded-full px-1 text-[10px] leading-none"
          >
            {trashGroupedTransfers.length}
          </Badge>
        ) : null}
      </Button>
    </div>
  ) : (
    <>
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
        onClick={() => {
          setTrashOpen(true);
          void loadRecentRequests({ silent: true });
        }}
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
  );

  const dismissCalendarNewRequestHint = useCallback(() => {
    const dismissedAt = new Date().toISOString();
    setCalendarNewRequestHintDismissed(true);
    try {
      const existingRaw = localStorage.getItem(
        PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY,
      );
      const existing =
        existingRaw && typeof existingRaw === "string"
          ? (JSON.parse(existingRaw) as Record<string, unknown>)
          : {};
      localStorage.setItem(
        PRACTICE_TRANSFER_SETTINGS_LOCAL_KEY,
        JSON.stringify({
          ...existing,
          calendarNewRequestHintDismissedAt: dismissedAt,
          savedAt: Date.now(),
        }),
      );
    } catch {
      // ignore
    }
    void savePracticeTransferSettingsToServer({
      calendarNewRequestHintDismissedAt: dismissedAt,
    }).catch(() => {
      // UI는 닫힌 상태 유지. 다음 저장 기회에 재시도
    });
  }, [savePracticeTransferSettingsToServer]);

  const practiceTransferRequestIntakeProps: PracticeTransferRequestIntakePanelProps = {
    variant: "plain",
    toothChartDisplayMode: "full",
                    selectedLab,
                  setSelectedLab: selectLabForIntake,
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
                    const arrival =
                      String(nextArrival || "").trim() >= todayDate
                        ? String(nextArrival || "").trim()
                        : addDaysToDateInput(todayDate, arrivalDefaultDays);
                    const nextDays =
                      kstYmdDiffDays(todayDate, arrival) == null
                        ? arrivalDefaultDays
                        : normalizeArrivalDefaultDays(
                            Number(kstYmdDiffDays(todayDate, arrival)),
                          );
                    const willChangeOrder = orderDate !== todayDate;
                    const willChangeDays = nextDays !== arrivalDefaultDays;
                    // 일수가 안 바뀌면 effect가 돌지 않아 skip이 남을 수 있음 → 필요할 때만 켠다.
                    if (willChangeOrder || willChangeDays) {
                      skipNextArrivalAutoSyncRef.current = true;
                    }
                    setOrderDate(todayDate);
                    const days = getPracticeWorkPeriodDays(todayDate, arrival);
                    if (isPracticeWorkPeriodBlocked(days)) {
                      toast({
                        title: PRACTICE_WORK_PERIOD_BLOCK_MESSAGE,
                        variant: "destructive",
                      });
                    } else if (isPracticeWorkPeriodLateWarning(days)) {
                      toast({ title: PRACTICE_WORK_PERIOD_LATE_WARNING_MESSAGE });
                    }
                    setRushProcessing(false);
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
                  autoMatchMaxLabRating,
                  onAutoMatchMinLabRatingChange: (next) => {
                    const band = resolveAutoMatchEligibleStarBand({
                      minStars: next,
                      maxStars: autoMatchMaxLabRating,
                    });
                    setAutoMatchMinLabRating(band.minStars);
                    setAutoMatchMaxLabRating(band.maxStars);
                    setAutoMatchBudget(
                      resolveAutoMatchBudgetOrDefaults(null, abutsLabFeeCatalog, {
                        minStars: band.minStars,
                        maxStars: band.maxStars,
                      }),
                    );
                    void savePracticeTransferSettingsToServer({
                      autoMatchMinLabRating: band.minStars,
                      autoMatchMaxLabRating: band.maxStars,
                    }).catch(() => {});
                  },
                  onAutoMatchMaxLabRatingChange: (next) => {
                    const band = resolveAutoMatchEligibleStarBand({
                      minStars: autoMatchMinLabRating,
                      maxStars: next,
                    });
                    setAutoMatchMinLabRating(band.minStars);
                    setAutoMatchMaxLabRating(band.maxStars);
                    setAutoMatchBudget(
                      resolveAutoMatchBudgetOrDefaults(null, abutsLabFeeCatalog, {
                        minStars: band.minStars,
                        maxStars: band.maxStars,
                      }),
                    );
                    void savePracticeTransferSettingsToServer({
                      autoMatchMinLabRating: band.minStars,
                      autoMatchMaxLabRating: band.maxStars,
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
                  prosthesisTypeSelectWidthClassName: "w-full min-w-0 sm:w-[7rem]",
                  showBridgeConnections: true,
                  showFeeEstimate: true,
                  skipJig,
                  onSkipJigChange: persistSkipJigSetting,
                  rushProcessing,
                  showInlineGuideTourButton: isMobile,
                  guideTourStartSignal,
                  guideTourExitSignal,
                  onGuideTourActiveChange: setGuideTourActive,
                  guideTourStep,
                  onGuideTourStepChange: setGuideTourStep,
                  guideTourHoldForHiddenHeaderFields: isExpressMode,
                  preferGuideTourAside: isExpressMode && showExpressWizard,
                  headerAsideContent: showExpressWizard
                    ? expressStepProgressNode
                    : null,
                  headerToolbar: null,
                  reserveGuideTourAside: showComposeHeaderToolbar,
                  guideTourHeaderSlotEl: null,
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
        {roleSwitcher ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 px-3 pt-2 sm:px-4">
            {roleSwitcher}
          </div>
        ) : null}
        <PracticeRecentTransfersAllModal
          variant="page"
          token={authToken}
          chatRooms={chatRooms}
          floatingDetailOpen={transferDialogOpen}
          initialPeriod={period}
          initialSearch=""
          initialStatusFilter="all"
          initialRequests={recentRequests}
          initialHasMore={recentRequestsHasMore}
          initialLoading={recentRequestsLoading}
          initialError={recentRequestsError}
          headerActions={calendarHeaderActions}
          showCalendarNewRequestHint={!calendarNewRequestHintDismissed}
          onDismissCalendarNewRequestHint={dismissCalendarNewRequestHint}
          onSelectFutureDay={openComposeForArrival}
          onSelectTransfer={(transfer) => {
            void handleOpenTransferDialog(transfer, {
              returnToAllModal: true,
            });
          }}
          onDeleteTransfer={(transfer) => {
            handleAskDeleteTransfer(transfer, { returnToAllModal: true });
          }}
          onAskRemake={(transfer) => askRemakeForTransfer(transfer)}
          onEditTransfer={(transfer) => {
            handleBeginEditSentTransfer(transfer);
          }}
        />
      </div>

      <Dialog
        open={composeOpen}
        onOpenChange={(open) => {
          setComposeOpen(open);
        }}
      >
        <DialogContent
          hideClose
          className={cn(
            "flex flex-col gap-0 overflow-hidden p-0 duration-200",
            isMobile
              ? cn(
                  "left-3 right-3 top-[max(0.75rem,env(safe-area-inset-top))] bottom-[max(0.75rem,env(safe-area-inset-bottom))]",
                  "h-auto max-h-none w-auto max-w-none translate-x-0 translate-y-0",
                  "rounded-2xl border border-slate-200/90 bg-white",
                  "shadow-[0_12px_40px_-8px_rgba(15,23,42,0.28),0_4px_16px_rgba(15,23,42,0.08)]",
                  "data-[state=open]:animate-in data-[state=closed]:animate-out",
                  "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
                  "data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
                )
              : cn(
                  "inset-0 left-0 top-0 h-[100dvh] w-screen max-h-[100dvh] max-w-none translate-x-0 translate-y-0",
                  "rounded-none border-0 sm:max-w-none",
                  "duration-0 data-[state=open]:animate-none data-[state=closed]:animate-none",
                ),
          )}
        >
          <DialogClose
            className={cn(
              "absolute z-10 inline-flex items-center justify-center opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
              isMobile
                ? "right-3 top-3 h-10 w-10 rounded-full bg-slate-100/90 text-slate-600 hover:bg-slate-200/90 hover:text-slate-900"
                : "right-3 top-2.5 h-12 w-12 rounded-md hover:bg-slate-100",
            )}
            aria-label="닫기"
          >
            <X className={isMobile ? "h-5 w-5" : "h-7 w-7"} strokeWidth={2.25} />
            <span className="sr-only">Close</span>
          </DialogClose>
          <DialogHeader
            className={cn(
              "shrink-0 border-b text-left",
              isMobile
                ? "space-y-3 border-slate-100 bg-white px-4 pb-4 pt-4 pr-14"
                : "flex flex-row items-center gap-3 space-y-0 border-border bg-white/95 px-6 py-2.5 pr-[4.25rem] backdrop-blur supports-[backdrop-filter]:bg-white/80",
            )}
          >
            <DialogTitle
              className={cn(
                "shrink-0 font-semibold tracking-tight",
                isMobile ? "text-[17px]" : "text-base sm:text-lg",
              )}
            >
              {editingSentTransfer ? "의뢰 수정" : "신규 의뢰"}
            </DialogTitle>
            {isMobile && !editingSentTransfer ? (
              <PracticeTransferMobileComposeToolbar
                onSaveDraft={() => void handleSaveComposeDraftAndStartNew()}
                onDiscard={() => void handleDiscardComposeWork()}
                canSaveDraft={mobileComposeCanSaveDraft}
                canDiscard={mobileComposeCanDiscard}
              />
            ) : null}
            {isMobile && formSyncStatusLabel ? (
              <p
                title={formSyncStatusLabel}
                className={cn(
                  "text-center text-xs font-normal leading-snug",
                  formSyncStatus === "error"
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {formSyncStatusLabel}
              </p>
            ) : null}
            {showComposeHeaderToolbar ? practiceWorkspaceToolbar : null}
          </DialogHeader>
          <PageFileDropZone
            onFiles={handleIncomingFiles}
            activeClassName="ring-2 ring-primary/30"
            className={cn(
              "min-h-0 flex-1 overflow-y-auto overscroll-contain",
              isMobile ? "bg-slate-50/80" : "bg-gradient-subtle",
            )}
          >
            <div
              className={cn(
                "mx-auto w-full max-w-7xl",
                isMobile
                  ? "box-border min-w-0 space-y-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4"
                  : "space-y-3 px-4 pt-4 pb-12",
              )}
            >
              <div className="flex min-w-0 w-full flex-col gap-3">
                <Card className="min-w-0 border-0 bg-transparent shadow-none hover:shadow-none">
            {editingSentTransfer ? (
              <div className="mb-1 rounded-md border border-primary/30 bg-primary-soft px-3 py-2 text-sm text-primary-strong">
                기공소가 수락하기 전인 의뢰를 수정 중입니다. 저장하면 같은 의뢰가
                업데이트됩니다. 새로 작성하면 수정이 취소됩니다.
              </div>
            ) : null}
            <CardContent className="min-w-0 px-0 pt-0">
              {isMobile ? (
                <PracticeTransferMobileOralPhotoIntake
                  requestIntakeProps={practiceTransferRequestIntakeProps}
                  canCapture={hasSubstantialContentForNewDraft}
                  photos={mobileOralPhotos}
                  onPickPhotos={handleIncomingFiles}
                  onRemovePhoto={(key) => {
                    const target = combinedDisplayFiles.find((file) => file.key === key);
                    if (!target) return;
                    void handleRemoveCombinedFile({
                      kind: target.kind,
                      localIndex: target.kind === "local" ? target.localIndex : undefined,
                      draftIndex: target.kind === "draft" ? target.draftIndex : undefined,
                    });
                  }}
                  onClearPhotos={() => {
                    void handleClearAllTransferFiles();
                  }}
                  onPreviewPhoto={(photo) => {
                    const url = String(photo.previewUrl || "").trim();
                    if (!url) return;
                    setOralPhotoPreview({
                      name: String(photo.name || "사진").trim() || "사진",
                      url,
                    });
                  }}
                  hideToolbar
                />
              ) : showExpressWizard ? (
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
                  oralScanRequired={false}
                  skipDesignConfirm={skipDesignConfirm}
                  onSkipDesignConfirmChange={persistSkipDesignConfirmSetting}
                  onOpenSkipDesignConfirmUncheck={() =>
                    setSkipDesignConfirmUncheckOpen(true)
                  }
                  onSubmit={() => void handleSubmitPracticeRequest()}
                  submitting={requestSubmitting}
                  canSubmit={hasRequiredSubmitFields}
                  missingRequiredFields={missingRequiredFields}
                  submitLabel={editingSentTransfer ? "수정 저장" : "기공소로 전송"}
                  submittingLabel={
                    editingSentTransfer ? "수정 저장 중…" : "전송 중…"
                  }
                />
              ) : isExpressMode && expressDone ? (
                <PracticeTransferExpressDonePanel
                  onStartNew={() => void handleStartNewTransfer({ openCompose: true, silentToast: true })}
                  onViewRecent={() => setComposeOpen(false)}
                />
              ) : (
                <PracticeTransferIntakeSection
                  filePaneProps={practiceTransferFilePaneProps}
                  requestIntakeProps={practiceTransferRequestIntakeProps}
                />
              )}
            </CardContent>
          </Card>

          {!isExpressMode && !isMobile ? (
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
                  기본은 생략(체크)입니다.
                  <br />
                  해제하면 치과 컨펌이 필요해 일정이 늦어질 수 있습니다.
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
                    {requestSubmitting
                      ? editingSentTransfer
                        ? "수정 저장 중..."
                        : "기공소로 전송 중..."
                      : editingSentTransfer
                        ? "수정 저장"
                        : "기공소로 전송"}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                align="end"
                className="max-w-xs border-slate-200 bg-white px-3 py-2 text-sm font-medium leading-snug text-slate-900 shadow-lg"
              >
                {requestSubmitting ? (
                  <p>{editingSentTransfer ? "수정 저장 중…" : "전송 중…"}</p>
                ) : hasRequiredSubmitFields ? (
                  <p className="text-primary-strong">
                    {editingSentTransfer ? "수정 저장 가능" : "전송 가능"}
                  </p>
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
            open={Boolean(oralPhotoPreview)}
            onOpenChange={(open) => {
              if (!open) setOralPhotoPreview(null);
            }}
          >
            <DialogContent
              className={cn(
                "max-h-[min(92vh,900px)] max-w-none gap-0 overflow-hidden p-0",
                RESPONSIVE.dialogContentWide,
              )}
            >
              <DialogHeader className="space-y-1 border-b border-slate-200/80 px-4 py-3 pr-12 text-left">
                <DialogTitle className="truncate text-base font-semibold">
                  {oralPhotoPreview?.name || "사진"}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  첨부한 구강포토를 크게 봅니다.
                </DialogDescription>
              </DialogHeader>
              <div className="flex max-h-[min(80vh,820px)] items-center justify-center bg-slate-950/95 p-3">
                {oralPhotoPreview?.url ? (
                  <img
                    src={oralPhotoPreview.url}
                    alt={oralPhotoPreview.name}
                    className="max-h-[min(76vh,780px)] max-w-full object-contain"
                  />
                ) : null}
              </div>
            </DialogContent>
          </Dialog>

          <Dialog
            open={skipDesignConfirmUncheckOpen}
            onOpenChange={setSkipDesignConfirmUncheckOpen}
          >
            <DialogContent className={RESPONSIVE.dialogContent}>
              <DialogHeader>
                <DialogTitle>디자인 컨펌 생략을 해제할까요?</DialogTitle>
                <DialogDescription className="leading-relaxed">
                  기본은 생략(체크)입니다.
                  <br />
                  해제하면 치과 컨펌이 필요해 일정이 늦어질 수 있습니다.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSkipDesignConfirmUncheckOpen(false)}
                >
                  컨펌 생략 유지
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    persistSkipDesignConfirmSetting(false);
                    setSkipDesignConfirmUncheckOpen(false);
                  }}
                >
                  컨펌하기
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <PracticeRushConfirmDialog
            open={rushConfirmOpen}
            onOpenChange={(open) => {
              setRushConfirmOpen(open);
              if (!open) setPendingRushArrivalYmd("");
            }}
            onCancel={() => setPendingRushArrivalYmd("")}
            onConfirm={() => {
              const nextArrival =
                pendingRushArrivalYmd ||
                kstAddBusinessDays(
                  todayDate,
                  PRACTICE_RUSH_ARRIVAL_BUSINESS_DAYS,
                ) ||
                "";
              skipNextArrivalAutoSyncRef.current = true;
              setOrderDate(todayDate);
              if (nextArrival) {
                setArrivalDate(nextArrival);
                persistArrivalDefaultDaysFromRange(todayDate, nextArrival);
              }
              setRushProcessing(true);
              setRushConfirmOpen(false);
              setPendingRushArrivalYmd("");
            }}
          />
              </div>
            </div>
          </PageFileDropZone>
        </DialogContent>
      </Dialog>

        <Dialog open={draftsOpen} onOpenChange={setDraftsOpen}>
          <DialogContent
            hideClose
            className={cn(
              "flex flex-col gap-0 overflow-hidden p-0",
              isMobile
                ? cn(
                    "left-3 right-3 top-[max(0.75rem,env(safe-area-inset-top))] bottom-[max(0.75rem,env(safe-area-inset-bottom))]",
                    "h-auto max-h-none w-auto max-w-none translate-x-0 translate-y-0",
                    "rounded-2xl border border-slate-200/90 bg-white",
                    "shadow-[0_12px_40px_-8px_rgba(15,23,42,0.28),0_4px_16px_rgba(15,23,42,0.08)]",
                  )
                : "max-h-[min(90vh,820px)] w-[min(96vw,720px)] max-w-none sm:max-w-[min(96vw,720px)]",
            )}
          >
            <div
              className={cn(
                "flex shrink-0 items-center justify-between gap-3 border-b border-slate-200/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80",
                isMobile ? "px-4 pb-3 pt-4" : "px-6 pb-4 pt-5",
              )}
            >
              <DialogHeader className="min-w-0 flex-1 space-y-0 text-left">
                <DialogTitle
                  className={cn(
                    "flex min-w-0 flex-wrap items-center gap-2 font-semibold tracking-tight",
                    isMobile ? "text-base" : "text-lg",
                  )}
                >
                  <BookmarkPlus className="h-5 w-5 shrink-0 text-primary-strong" />
                  {isMobile ? "의뢰 현황" : "임시저장"}
                  {draftGroupedTransfers.length > 0 ? (
                    <Badge
                      variant="secondary"
                      className="rounded-md px-1.5 py-0 text-[11px] font-medium tabular-nums"
                    >
                      {draftGroupedTransfers.length}
                    </Badge>
                  ) : null}
                  {draftGroupedTransfers.length > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(
                        "shrink-0 gap-1.5 border-destructive-muted text-xs text-destructive hover:bg-destructive-soft hover:text-destructive",
                        isMobile ? "h-8 px-2" : "h-8 px-2.5",
                      )}
                      disabled={clearingAllDrafts}
                      onClick={handleAskClearAllDrafts}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {clearingAllDrafts ? "삭제 중..." : "전체삭제"}
                    </Button>
                  ) : null}
                </DialogTitle>
              </DialogHeader>
              <button
                type="button"
                className={cn(
                  "inline-flex shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isMobile ? "h-11 w-11" : "h-9 w-9",
                )}
                aria-label="닫기"
                onClick={() => setDraftsOpen(false)}
              >
                <X className={isMobile ? "h-5 w-5" : "h-4 w-4"} />
              </button>
            </div>
            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto overscroll-contain",
                isMobile ? "bg-slate-50/80 px-3 py-3" : "px-5 py-4 sm:px-6",
              )}
            >
              {isMobile ? (
                <div className="space-y-2.5 pb-2">
                  <button
                    type="button"
                    className="w-full cursor-pointer rounded-2xl border-0 bg-primary p-3.5 text-left text-primary-foreground shadow-[0_1px_2px_rgba(15,23,42,0.08)] transition-[transform,box-shadow] active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    onClick={openNewComposeFromDrafts}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <span
                            className="inline-flex h-6 shrink-0 items-center rounded-md bg-white/20 px-2 text-[11px] font-semibold leading-none"
                          >
                            새로 작성
                          </span>
                        </div>
                        <p className="mt-2 truncate text-[15px] font-semibold leading-snug">
                          신규 의뢰
                        </p>
                        <div className="mt-1 text-sm text-primary-foreground/85">
                          새 의뢰를 시작합니다
                        </div>
                      </div>
                      <span
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20"
                        aria-hidden
                      >
                        <Plus className="h-5 w-5" />
                      </span>
                    </div>
                  </button>
                  {draftGroupedTransfers.map((transfer) => {
                    const targetLabText =
                      String(transfer.targetLab || "-")
                        .replace(/\s*→.*$/g, "")
                        .trim() || "-";
                    const patient =
                      resolvePracticeTransferListPatientName(transfer) || "—";
                    const ownerLabel = transfer.isMineDraft
                      ? "나"
                      : transfer.practiceUserLabel || "동료";
                    const isActive = transfer.id === activeDraftId;
                    const arrival = String(transfer.arrivalDate || "").trim();

                    return (
                      <div
                        key={`draft:${transfer.id}:${transfer.createdAt}`}
                        role="button"
                        tabIndex={0}
                        className={cn(
                          "w-full cursor-pointer rounded-2xl border bg-white p-3.5 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[transform,box-shadow,border-color] active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          isActive
                            ? "border-primary/50 bg-primary-soft/50 ring-1 ring-primary/20"
                            : "border-slate-200/80",
                        )}
                        onClick={() => handleAdoptDraftTransfer(transfer)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleAdoptDraftTransfer(transfer);
                          }
                        }}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                              <Badge
                                variant="outline"
                                className="h-6 shrink-0 px-2 text-[11px] font-semibold leading-none"
                              >
                                임시저장
                              </Badge>
                              <Badge
                                variant="outline"
                                className="h-6 px-1.5 text-[10px]"
                              >
                                {ownerLabel}
                              </Badge>
                              {isActive ? (
                                <Badge className="h-6 rounded-md border-0 bg-primary-strong px-1.5 text-[10px] font-medium text-white hover:bg-primary-strong">
                                  작성 중
                                </Badge>
                              ) : null}
                              <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
                                {transfer.createdAt}
                              </span>
                            </div>
                            <p className="mt-2 truncate text-[15px] font-semibold leading-snug text-slate-900">
                              {targetLabText}
                            </p>
                            <div className="mt-1 flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                              <span className="truncate">{patient}</span>
                              {arrival ? (
                                <>
                                  <span className="shrink-0 text-slate-300">·</span>
                                  <span className="shrink-0 tabular-nums">
                                    도착 {arrival}
                                  </span>
                                </>
                              ) : null}
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 shrink-0 text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleAskDeleteTransfer(transfer);
                            }}
                            aria-label="임시저장을 휴지통으로"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : draftGroupedTransfers.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 px-6 py-14 text-center">
                  <BookmarkPlus className="h-9 w-9 text-slate-300" />
                  <p className="text-sm font-medium text-slate-600">임시저장 없음</p>
                  <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                    기공소와 완성형 한글 환자명을 입력하면 자동으로 저장됩니다.
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
                    const isActive = transfer.id === activeDraftId;

                    return (
                      <div
                        key={`draft:${transfer.id}:${transfer.createdAt}`}
                        role="button"
                        tabIndex={0}
                        className={cn(
                          "w-full cursor-pointer rounded-xl border bg-white px-4 py-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
                        <PracticeTransferRequestCardMeta
                          layout="comfortable"
                          createdAt={transfer.createdAt}
                          statusLabel="임시저장"
                          extraBadges={
                            <>
                              <Badge variant="outline" className="whitespace-nowrap">
                                {ownerLabel}
                              </Badge>
                              {isActive ? (
                                <Badge className="h-5 whitespace-nowrap rounded-md border-0 bg-primary-strong px-1.5 text-[10px] font-medium text-white hover:bg-primary-strong">
                                  작성 중
                                </Badge>
                              ) : null}
                            </>
                          }
                          headerActions={
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
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
                          }
                          counterpartLabel="기공소"
                          counterpartValue={targetLabText}
                          orderDate={transfer.orderDate}
                          arrivalDate={transfer.arrivalDate}
                          patientName={resolvePracticeTransferListPatientName(transfer)}
                          toothNumbers={resolvePracticeTransferListToothNumbers(transfer)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={trashOpen} onOpenChange={setTrashOpen}>
          <DialogContent
            hideClose
            className={cn(
              "flex flex-col gap-0 overflow-hidden p-0",
              isMobile
                ? cn(
                    "left-3 right-3 top-[max(0.75rem,env(safe-area-inset-top))] bottom-[max(0.75rem,env(safe-area-inset-bottom))]",
                    "h-auto max-h-none w-auto max-w-none translate-x-0 translate-y-0",
                    "rounded-2xl border border-slate-200/90 bg-white",
                    "shadow-[0_12px_40px_-8px_rgba(15,23,42,0.28),0_4px_16px_rgba(15,23,42,0.08)]",
                  )
                : cn(
                    "max-h-[min(90vh,820px)] max-w-none",
                    RESPONSIVE.dialogContentWide,
                  ),
            )}
          >
            <div
              className={cn(
                "flex shrink-0 items-center justify-between gap-3 border-b border-slate-200/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80",
                isMobile ? "px-4 pb-3 pt-4" : "px-4 pb-4 pt-5 pr-14 sm:px-6",
              )}
            >
              <DialogHeader className="min-w-0 flex-1 space-y-0 text-left">
                <DialogTitle
                  className={cn(
                    "flex min-w-0 flex-wrap items-center gap-2 font-semibold tracking-tight",
                    isMobile ? "text-base" : "text-lg",
                  )}
                >
                  <Trash2
                    className={cn(
                      "h-5 w-5 shrink-0",
                      isMobile ? "text-destructive" : "text-slate-500",
                    )}
                  />
                  휴지통
                  {trashGroupedTransfers.length > 0 ? (
                    <Badge
                      variant="secondary"
                      className="rounded-full px-1.5 py-0 text-[11px] font-medium tabular-nums"
                    >
                      {trashGroupedTransfers.length}
                    </Badge>
                  ) : null}
                  {trashGroupedTransfers.length > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(
                        "shrink-0 gap-1.5 rounded-full border-destructive-muted text-xs text-destructive hover:bg-destructive-soft hover:text-destructive",
                        isMobile ? "h-8 px-2.5" : "h-8 px-2.5",
                      )}
                      disabled={emptyingTrash}
                      onClick={handleAskEmptyTrash}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {emptyingTrash ? "비우는 중..." : "비우기"}
                    </Button>
                  ) : null}
                </DialogTitle>
              </DialogHeader>
              <button
                type="button"
                className={cn(
                  "inline-flex shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isMobile ? "h-11 w-11" : "h-9 w-9",
                )}
                aria-label="닫기"
                onClick={() => setTrashOpen(false)}
              >
                <X className={isMobile ? "h-5 w-5" : "h-4 w-4"} />
              </button>
            </div>
            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto overscroll-contain",
                isMobile ? "bg-slate-50/80 px-3 py-3" : "px-4 py-4 sm:px-6",
              )}
            >
              {trashGroupedTransfers.length === 0 ? (
                <div
                  className={cn(
                    "flex flex-col items-center gap-2 border border-dashed border-slate-200 px-6 py-14 text-center",
                    isMobile ? "rounded-2xl bg-white" : "rounded-xl",
                  )}
                >
                  <Trash2 className="h-9 w-9 text-slate-300" />
                  <p className="text-sm font-medium text-slate-600">휴지통이 비어 있습니다</p>
                  <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                    삭제한 임시저장·의뢰가 여기에 모입니다.
                  </p>
                </div>
              ) : isMobile ? (
                <div className="space-y-2.5 pb-2">
                  {trashGroupedTransfers.map((transfer) => {
                    const targetLabText =
                      String(transfer.targetLab || "-")
                        .replace(/\s*→.*$/g, "")
                        .trim() || "-";
                    const patient =
                      resolvePracticeTransferListPatientName(transfer) || "—";
                    const isDraftTrash =
                      transfer.status === "임시저장" ||
                      transfer.transferId === PRACTICE_DRAFT_TRANSFER_ID;
                    const statusLabel = isDraftTrash
                      ? "임시저장"
                      : toStatusBadgeLabel(transfer.status);
                    const arrival = String(transfer.arrivalDate || "").trim();

                    return (
                      <div
                        key={`trash:${transfer.id}:${transfer.createdAt}`}
                        role="button"
                        tabIndex={0}
                        className="w-full cursor-pointer rounded-2xl border border-slate-200/80 bg-white p-3.5 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[transform,box-shadow,border-color] active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => void handleOpenTransferDialog(transfer, { fromTrash: true })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            void handleOpenTransferDialog(transfer, { fromTrash: true });
                          }
                        }}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "h-6 shrink-0 px-2 text-[11px] font-semibold leading-none",
                                  practiceTransferStatusBadgeClass(statusLabel),
                                )}
                              >
                                {statusLabel}
                              </Badge>
                              {isDraftTrash && transfer.practiceUserLabel ? (
                                <Badge
                                  variant="outline"
                                  className="h-6 px-1.5 text-[10px]"
                                >
                                  {transfer.practiceUserLabel}
                                </Badge>
                              ) : null}
                              <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
                                {transfer.createdAt}
                              </span>
                            </div>
                            <p className="mt-2 truncate text-[15px] font-semibold leading-snug text-slate-900">
                              {targetLabText}
                            </p>
                            <div className="mt-1 flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                              <span className="truncate">{patient}</span>
                              {arrival ? (
                                <>
                                  <span className="shrink-0 text-slate-300">·</span>
                                  <span className="shrink-0 tabular-nums">
                                    도착 {arrival}
                                  </span>
                                </>
                              ) : null}
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 shrink-0 text-slate-500 hover:bg-primary-soft hover:text-primary-strong"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAskRestoreTransfer(transfer);
                            }}
                            aria-label={isDraftTrash ? "임시저장 복구" : "의뢰서 복구"}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
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

                    return (
                      <div
                        key={`trash:${transfer.id}:${transfer.createdAt}`}
                        role="button"
                        tabIndex={0}
                        className="w-full cursor-pointer rounded-xl border border-slate-200/90 bg-white px-4 py-3.5 text-left transition-colors hover:border-slate-300 hover:bg-slate-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => void handleOpenTransferDialog(transfer, { fromTrash: true })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            void handleOpenTransferDialog(transfer, { fromTrash: true });
                          }
                        }}
                      >
                        <PracticeTransferRequestCardMeta
                          layout="comfortable"
                          createdAt={transfer.createdAt}
                          statusLabel={
                            isDraftTrash ? "임시저장" : toStatusBadgeLabel(transfer.status)
                          }
                          extraBadges={
                            isDraftTrash && transfer.practiceUserLabel ? (
                              <Badge variant="outline" className="whitespace-nowrap">
                                {transfer.practiceUserLabel}
                              </Badge>
                            ) : null
                          }
                          headerActions={
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 shrink-0 text-slate-500 hover:bg-primary-soft hover:text-primary-strong"
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
                          }
                          counterpartLabel="기공소"
                          counterpartValue={targetLabText}
                          orderDate={transfer.orderDate}
                          arrivalDate={transfer.arrivalDate}
                          patientName={resolvePracticeTransferListPatientName(transfer)}
                          toothNumbers={resolvePracticeTransferListToothNumbers(transfer)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>


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
          authToken={authToken}
          onEditRequest={
            selectedTransfer &&
            canEditPracticeTransferByStatus(selectedTransfer.status)
              ? () => handleBeginEditSentTransfer(selectedTransfer)
              : undefined
          }
          onAppendArrival={
            selectedTransfer &&
            selectedTransfer.transferId &&
            selectedTransfer.transferId !== "-" &&
            selectedTransfer.status !== "취소" &&
            selectedTransfer.status !== "작업취소"
              ? (arrivalYmd) => void handleAppendArrival(arrivalYmd)
              : undefined
          }
          appendArrivalBusy={appendArrivalBusy}
          orderDate={selectedTransfer?.orderDate || null}
          arrivalDate={selectedTransfer?.arrivalDate || null}
          orderedAt={
            selectedTransfer?.createdAtTs
              ? new Date(selectedTransfer.createdAtTs)
              : null
          }
          onCancelRequest={
            selectedTransfer &&
            canDeletePracticeTransferByStatus(selectedTransfer.status)
              ? () => handleAskDeleteTransfer(selectedTransfer)
              : undefined
          }
          cancelRequestDisabled={deletingTransfer}
          chatHeaderAction={null}
          counterpartyMemoStrip={
            selectedTransfer &&
            selectedTransfer.canRateLab &&
            selectedTransfer.transferMongoIds?.[0] ? (
              <CounterpartyMemoStrip
                viewer="practice"
                label="기공소 메모"
                memo={selectedTransfer.labRating?.memo || ""}
                maxLength={PRACTICE_LAB_RATING_MEMO_MAX}
                trailingAction={
                  <PracticeLabRatingControl
                    transferMongoId={String(selectedTransfer.transferMongoIds[0])}
                    rating={selectedTransfer.labRating || null}
                    size="sm"
                    onChanged={(next) => {
                      setSelectedTransfer((prev) =>
                        prev
                          ? { ...prev, labRating: next, canRateLab: true }
                          : prev,
                      );
                      setRecentRequests((prev) =>
                        prev.map((row) =>
                          row.requestMongoId ===
                            String(selectedTransfer.transferMongoIds?.[0] || "")
                            ? { ...row, labRating: next, canRateLab: true }
                            : row,
                        ),
                      );
                      const performingId = String(
                        selectedTransfer.performingLabAnchorId || "",
                      ).trim();
                      if (performingId) {
                        setOwnOneStarBlockedLabIds((prev) => {
                          const without = prev.filter((id) => id !== performingId);
                          if (next.stars === 1) return [...without, performingId];
                          return without;
                        });
                      }
                    }}
                  />
                }
                onSave={async (memo) => {
                  const transferId = String(
                    selectedTransfer.transferMongoIds?.[0] || "",
                  ).trim();
                  if (!transferId || !authToken) return false;
                  const stars =
                    normalizePracticeLabStars(selectedTransfer.labRating?.stars) ??
                    DEFAULT_PRACTICE_LAB_RATING_STARS;
                  const res = await request<{
                    data?: { labRating?: PracticeLabRatingPublic };
                    message?: string;
                  }>({
                    path: `/api/practice/transfers/${encodeURIComponent(transferId)}/lab-rating`,
                    method: "POST",
                    token: authToken,
                    jsonBody: {
                      stars,
                      memo: normalizePracticeLabRatingMemo(memo),
                    },
                  });
                  if (!res.ok) {
                    toast({
                      title: "기공소 메모 저장 실패",
                      description: res.data?.message || "다시 시도해주세요.",
                      variant: "destructive",
                    });
                    return false;
                  }
                  const saved = res.data?.data?.labRating;
                  if (saved && typeof saved === "object") {
                    const next: PracticeLabRatingPublic = {
                      stars:
                        normalizePracticeLabStars(saved.stars) ?? stars,
                      memo: normalizePracticeLabRatingMemo(saved.memo),
                      ratingCount: 1,
                      updatedAt: saved.updatedAt
                        ? String(saved.updatedAt)
                        : null,
                    };
                    setSelectedTransfer((prev) =>
                      prev ? { ...prev, labRating: next, canRateLab: true } : prev,
                    );
                    setRecentRequests((prev) =>
                      prev.map((row) =>
                        row.requestMongoId === transferId
                          ? { ...row, labRating: next, canRateLab: true }
                          : row,
                      ),
                    );
                  }
                  return true;
                }}
              />
            ) : null
          }
          summaryItems={selectedTransferDetailModel?.summaryItems || []}
          memo={selectedTransferDetailModel?.memo || "-"}
          toothWorks={selectedTransferDetailModel?.toothWorks || []}
          toothWorksKey={
            selectedTransferDetailModel?.toothWorksKey || "practice-transfer"
          }
          feeQuote={selectedTransfer?.feeQuote || null}
          skipJig={Boolean(selectedTransferDetailModel?.skipJig)}
          feeViewer="practice"
          labAnchorId={selectedTransferDetailModel?.labAnchorId || null}
          filesLabel="의뢰 파일 (구강 스캔, 쉐이드 포토 등)"
          files={selectedTransferDetailModel?.files || []}
          designFilesLabel="어벗 디자인"
          designFiles={selectedTransferDetailModel?.designFiles || []}
          resultFilesLabel="보철물"
          resultFiles={selectedTransferDetailModel?.resultFiles || []}
          showProductionConfirm={Boolean(
            selectedTransferDetailModel?.showProductionConfirm,
          )}
          productionConfirmTitle={
            selectedTransferDetailModel?.productionConfirmTitle ||
            "작업 결과를 확인한 뒤 생산을 진행하세요."
          }
          productionConfirmButtonLabel={
            selectedTransferDetailModel?.productionConfirmButtonLabel || "생산 진행"
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
          sendDisabled={chatSending}
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
          <DialogContent className={RESPONSIVE.dialogContent}>
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
          trashing={deletingTransfer}
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
              const band = resolveAutoMatchEligibleStarBand({
                minStars: next,
                maxStars: autoMatchMaxLabRating,
              });
              setAutoMatchMinLabRating(band.minStars);
              setAutoMatchMaxLabRating(band.maxStars);
              setAutoMatchBudget(
                resolveAutoMatchBudgetOrDefaults(null, abutsLabFeeCatalog, {
                  minStars: band.minStars,
                  maxStars: band.maxStars,
                }),
              );
              void savePracticeTransferSettingsToServer({
                autoMatchMinLabRating: band.minStars,
                autoMatchMaxLabRating: band.maxStars,
              }).catch(() => {});
            },
            autoMatchMaxLabRating,
            onAutoMatchMaxLabRatingChange: (next) => {
              const band = resolveAutoMatchEligibleStarBand({
                minStars: autoMatchMinLabRating,
                maxStars: next,
              });
              setAutoMatchMinLabRating(band.minStars);
              setAutoMatchMaxLabRating(band.maxStars);
              setAutoMatchBudget(
                resolveAutoMatchBudgetOrDefaults(null, abutsLabFeeCatalog, {
                  minStars: band.minStars,
                  maxStars: band.maxStars,
                }),
              );
              void savePracticeTransferSettingsToServer({
                autoMatchMinLabRating: band.minStars,
                autoMatchMaxLabRating: band.maxStars,
              }).catch(() => {});
            },
            autoMatchBudget,
            abutsLabFeeCatalog,
          }}
          onMoveToTrash={() => {
            const target = labRejectedReselectTarget;
            if (!target || labRejectedRetargetBusy || deletingTransfer) return;
            setLabRejectedReselectTarget(null);
            handleAskDeleteTransfer(target, {
              returnToAllModal: returnToAllModalRef.current,
            });
          }}
          onConfirm={async () => {
            const target = labRejectedReselectTarget;
            const transferId = String(target?.transferId || "").trim();
            if (!target || !transferId || !selectedLab) return;

            const targetLabAnchorId = toApiLabAnchorId(selectedLab._id);
            if (!targetLabAnchorId) {
              toast({
                title: "기공소를 선택해 주세요",
                variant: "destructive",
              });
              return;
            }

            setLabRejectedRetargetBusy(true);
            try {
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
                  matchingMode: "direct",
                  targetLabAnchorId,
                  targetLabName: String(selectedLab.name || "").trim(),
                  autoMatchMinLabRating,
                  autoMatchMaxLabRating,
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
                description: `「${labName}」으로 다시 전송했습니다.`,
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
          title="출고·디자인 건을 리메이크 의뢰할까요?"
          description={
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">
                리메이크비 무료 · 배송비는 차감됩니다
              </div>
              <div className="text-sm text-muted-foreground">
                의뢰부터 출고까지 다시 진행됩니다.
              </div>
            </div>
          }
          confirmLabel={remakeBusy ? "전송 중..." : "리메이크 의뢰"}
          cancelLabel="취소"
          onConfirm={() => void handleConfirmRemake()}
          onCancel={() => {
            if (remakeBusy) return;
            setRemakeConfirmOpen(false);
            setRemakeSelectedIds([]);
          }}
        />

        <ConfirmDialog
          open={emptyTrashConfirmOpen}
          title="휴지통을 비울까요?"
          description={
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">
                휴지통 내용을 모두 영구 삭제합니다.
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
  );
};

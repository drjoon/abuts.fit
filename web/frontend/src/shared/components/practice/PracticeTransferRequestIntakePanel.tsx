import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  GripVertical,
  Link2,
  Loader2,
  Minus,
  Pin,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ImeSafeInput } from "@/shared/components/practice/ImeSafeInput";
import { Label } from "@/components/ui/label";
import {
  scrollToothChartGuideTargetIntoView,
  TOOTH_CHART_GUIDE_STEP_IDS,
} from "@/shared/guideTour/scrollGuideTourTarget";
import type {
  AbutsLabFeeCatalogItem,
  PracticeTransferAutoMatchBudget,
} from "@/shared/practice/autoMatchBudget";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/shared/ui/cn";
import { PracticeOrderArrivalDateRangeField } from "@/shared/components/practice/PracticeOrderArrivalDateRangeField";
import {
  ABUTS_PINNED_LAB_NAME,
  getBusinessLabel,
  isLabPinned,
  isPinnedAbutsRecentLab,
  isAutoMatchLab,
  type SearchBusinessResult,
} from "@/pages/practice/hooks/usePracticeTransferStep1";
import { PracticeToothImplantFields } from "@/shared/components/practice/PracticeToothImplantFields";
import { PracticeToothAbutmentFields } from "@/shared/components/practice/PracticeToothAbutmentFields";
import { PracticeToothSimpleAbutmentFields } from "@/shared/components/practice/PracticeToothSimpleAbutmentFields";
import { PracticeCustomSpecsPresetEditDialog } from "@/shared/components/practice/PracticeCustomSpecsPresetEditDialog";
import {
  getPracticeToothWorkGuideTourStepId,
  PracticeToothWorkGuideTourBanner,
  PRACTICE_TOOTH_WORK_GUIDE_TOUR_DONE_STEP,
  type PracticeToothWorkGuideTourStep,
} from "@/shared/components/practice/PracticeToothWorkGuideTourBanner";
import { useGuideTour } from "@/shared/guideTour/GuideTourProvider";
import { isPracticeToothWorkOralStepId } from "@/shared/guideTour/guideTourSteps";
import { AutoMatchMinLabRatingStars } from "@/shared/components/practice/AutoMatchMinLabRatingStars";
import {
  DEFAULT_AUTO_MATCH_MAX_LAB_RATING,
  DEFAULT_AUTO_MATCH_MIN_LAB_RATING,
} from "@/shared/practice/practiceLabRating";
import type { ImplantConnection } from "@/shared/practice/useImplantConnectionCatalog";
import {
  ABUTMENT_PRODUCT_MODE,
  ABUTMENT_PRODUCT_MODE_LABEL,
  DEFAULT_ACCOUNT_ABUTMENT_PRODUCT_MODE,
  emptyToothWorkCustomSpecs,
  formatAbutmentCompact,
  formatAbutmentSummary,
  formatImplantCompact,
  formatImplantSummary,
  hasCompleteAbutmentPresets,
  hasToothWorkAbutmentSidePreset,
  hasToothWorkImplantPreset,
  isAbutmentProductMode,
  isSimpleAbutmentMode,
  clearSimpleAbutmentIfCustomProsthesis,
  emptyToothWorkAbutment,
  normalizeAccountAbutmentProductMode,
  pickToothWorkCustomSpecs,
  resolveToothAbutmentProductMode,
  // 레거시(2026-08-22): canOfferPracticeTransferSkipJig / resolvePracticeTransferSkipJig — skipJig UI 삭제.
  type AbutmentProductMode,
  type PracticeAbutmentFavorite,
  type PracticeImplantFavorite,
} from "@/shared/practice/transferMemo";
import {
  buildLabIntroMessage,
  buildReferralSignupLink,
} from "@/shared/platform/referralShareMessages";
import { useAuthStore } from "@/store/useAuthStore";
import {
  applyCycledLinkedSpanProsthesisType,
  applyProsthesisTypeToRow,
  collectAdjacentBridgeLinks,
  CUSTOM_ABUTMENT_PROSTHESIS_TYPE,
  getAdjacentTeeth,
  getProsthesisTypesForLinkState,
  isCustomAbutmentProsthesisType,
  isCustomAbutmentSupportedProsthesisType,
  isLinkableProsthesisType,
  isMissingToothProsthesisType,
  isRetainerProsthesisType,
  isTemporaryToothProsthesisType,
  LINKED_PROSTHESIS_TYPES,
  NO_WORK_PROSTHESIS_TYPE,
  NO_WORK_PROSTHESIS_TOOLTIP,
  pruneLinkedSpanProsthesisSnapshot,
  resolveProsthesisTypeForLinkState,
  STANDALONE_PROSTHESIS_TYPES,
  toggleAdjacentBridgeLink,
  type LinkedSpanProsthesisSnapshot,
  type ToothWorkSelection,
} from "@/shared/practice/usePracticeToothWorkEditor";
import { PracticeToothChartHorizontalScroll } from "@/shared/components/practice/PracticeToothChartHorizontalScroll";
import { PracticeTransferFeeEstimate } from "@/shared/components/practice/PracticeTransferFeeEstimate";
import { usePracticeTransferFeeQuote } from "@/shared/practice/usePracticeTransferFeeQuote";
import {
  formatWonRange,
} from "@/shared/practice/practiceTransferFeeQuote";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/shared/hooks/use-toast";
import {
  ARCH_BULK_PROSTHESIS_PRESETS,
  createProsthesisFeeItemRequest,
  isArchBulkProsthesisPreset,
} from "@/shared/practice/prosthesisFeeItemRequest";

// related files:
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/shared/practice/usePracticeToothWorkEditor.ts
// - web/frontend/src/shared/practice/prosthesisFeeItemRequest.ts
// - web/frontend/src/shared/components/practice/PracticeOrderArrivalDateRangeField.tsx
// - web/frontend/src/shared/components/practice/PracticeToothImplantFields.tsx
// - web/frontend/src/shared/components/practice/PracticeToothAbutmentFields.tsx
// - web/frontend/src/shared/components/practice/PracticeToothSimpleAbutmentFields.tsx
// - web/frontend/src/shared/components/practice/PracticeCustomSpecsPresetEditDialog.tsx
// - web/frontend/src/shared/pricing/abutsAbutmentService.ts
// - 2026-09-05: 메모|파일 2열 — 메모 카드 높이를 파일 패널에 ResizeObserver로 맞춤(stretch 과대 확장 방지).
// - 2026-09-05: 플랫폼 Spotlight — stepId로 data-guide-tour 직접 마킹(로컬 스텝 sync 전에도 홀).
// - 2026-09-05: 견적→뒤로 프리셋 — Spotlight 클릭 outside dismiss로 모달 즉시 닫힘 방지·다음 틱 재오픈.
// - 2026-09-05: 견적 투어 — 하이라이트에 금액이 보이게 blur 해제(툴팁 체험은 유지).
// - 2026-09-05: 가이드투어 견적 — pointerenter 650ms 대신 툴팁 실오픈 후 진행(레이스 방지).
// - 2026-09-05: 커스텀어벗 설정 — 임플란트→스캔바디/심플어벗 2단 위저드. 이전·다음·좁은 폭. 화면 중앙. 제목 단축. 2단 좌우. STL 버튼 가운데.
// - 2026-09-05: 커스텀어벗 모달 — 치식 투어 중 강제 닫기·DialogContent에 data-guide-tour(홀=모달 전체).
// - 2026-09-05: 커스텀어벗 모달 — 상단 고정·dvh 높이·투어 z 상승·치식 스텝에서 오픈 차단(하단 잘림).
// - 2026-09-05: 프리셋 투어 — 모달 전체 하이라이트·빈 프리셋 「+ 추가」안내·치식 스텝 시 모달 닫기.
// - 2026-09-05: 가이드투어 치식 스텝 — 작성 패널 자동 스크롤(data-guide-tour-scroll).
// - 2026-09-05: data-guide-tour=oral_memo — 가이드투어 메모 하이라이트.
// - 2026-09-05: 가이드투어 — lab 검색 드롭다운 satellite(홀 확장) + z-430.
// - 2026-09-05: 가이드투어 환자명 — 글자마다 즉시 진행 금지. 입력 멈춤(idle)·Enter만.
// - 2026-09-05: 기공소 드롭다운 폭=트리거와 동일(min-w 제거).
// - 2026-09-05: 플랫폼 투어 — 기공소 팝오버 강제오픈 안 함(위치 고정). 수동 오픈 시 z-430.
// - 2026-09-05: 가이드투어 — 환자명에서 뒤로 시 기공소 팝오버 강제오픈·즉시 3 재진입 방지.
// - 2026-09-05: 전체 선택 — 상·하악·전체틀니/부분틀니/랩어라운드/커스텀 추가.
// - 2026-09-05: 전체 선택 모달 — 악궁 좌·타입 우 한 줄씩, + 추가, 악궁 내 + 연결.
// - 2026-09-05: 전체 선택 모달 — 고정 폭·높이, 커스텀 입력 X 인라인, Enter 적용.
// - 2026-08-25: 기공소·환자·날짜 투어 카드 — 헤더 버튼~입력 행 세로 맞춤, 폭=주문-치과도착 열.
// - 2026-08-25: 가이드투어 스텝 상위로 제어 가능.
// - 2026-08-25: 기공소·환자·날짜 투어 배너 → 상단 오른쪽(CardHeader 슬롯).
// - 2026-08-25: 가이드투어 견적·완료 중 어벗 모달 재오픈 허용 — 스텝 진입 시에만 닫고, 열기 직후 effect로 닫지 않음.
// - 2026-08-28: 커스텀어벗 설정 모달 — 상하 여백과 같은 좌우 여백(max-w=calc).
// - 2026-08-28: reserveGuideTourAside — 작성 툴바가 DialogHeader로 올라가도 오른쪽 투어 레일 예약.
// - 2026-08-27: 커스텀어벗 설정 — 「어벗 · 스캔바디 또는 심플어벗」섹션 라벨 제거.
// - 2026-08-27: 커스텀어벗 설정 — 임플란트·스캔바디 프리셋 2열·호버 액션. 모달 max-w-[90rem].
// - 2026-08-25: 기공소 픽커 보조줄 — 대표·주소만(사업자번호 표시 제거, 검색은 유지).
// - 2026-08-25: 헤더(기공소·환자·기간) — PC 툴바 있으면 오른쪽 레일 항상 예약(투어 카드 on/off 폭 점프 방지).
// - 2026-08-25: 헤더(기공소·환자·기간) — 투어 시 날짜 열 폭만큼 오른쪽 카드.
// - 2026-08-25: 커스텀어벗 보철 형태 — 어벗 모달에서 심플어벗 비활성(스캔바디만).
// - 2026-08-25: 커스텀어벗 설정 — 임플란트(primary)·어벗(service-abut) 색 구분. + 확대·임플란트 열 축소.
// - 2026-08-25: 가이드투어 어벗 — 스캔바디 커스텀 vs 심플어벗(꽂고 바로 스캔) 두 방식.
// - 2026-08-25: 커스텀어벗 설정 — 임플란트 + (스캔바디|심플어벗) 구조. + 표시.
// - 2026-08-25: 커스텀어벗 설정 모달 가로폭 max-w-7xl — 스캔바디 프리셋 라벨이 잘리지 않게.
// - 2026-08-25: 커스텀어벗 설정 — 스캔바디 좁히고 심플어벗(XOR) 추가. 모달 세로 축소.
// - 2026-08-18: 기공소 픽커에서 「자동 매칭」제거. 고정=어벗츠기공소, 최근=지정 기공소.
// - 2026-08-16: 자동매칭 최소 별점 UI는「자동 매칭」선택 시에만(지정 기공소는 기공소 수가).
// - 2026-08-21: 커스텀어벗 설정 — 프리셋 추가=인라인 CNC/스캔바디 입력. 제목에 모드, 상단 토글 제거.
// - 2026-08-21: 커스텀어벗 설정 모달 — 제목에 모드, 상단 토글 제거, 대체 모드는 취소 왼쪽, 프리셋 인라인 관리·높이 확대.
// - 2026-08-29: 생산만 고정→디자인+생산 안내 라벨 — 구강스캔으로/치과로부터 수신(기공의뢰 폐기).
// - 2026-08-13: 기공의뢰 모달=디자인+생산 고정(생산만→어벗생산의뢰). 어벗생산의뢰=생산만 고정(디자인+생산→구강스캔/수신).
// - 2026-08-13: 생산·디자인+생산 단가를 creditSettings 멤버십/일반값으로 표시.
// - 2026-08-11: 기공소 선택에 "자동 매칭" 옵션(+빠른툴팁) 추가.
// - 2026-08-11: 안내문구 최소화 — 플레이스홀더·메모 도움말·커스텀규격 설명을 즉시툴팁으로.
// - 2026-08-11: 기공의뢰 카드 내 행(섹션) 수직 간격 gap-10.
// - 2026-08-13: 커스텀어벗 설정 모달에 생산만/디자인+생산 배타 선택 + 가격 툴팁.
// - 2026-08-13: 상·하악 사이 견적(크레딧 소비액) + 빠른툴팁 세부내역.
// - 2026-08-15: showLabField/showPatientField/showDateFields — 헤더 필드 개별 표시.
// - 2026-08-14: 기공소 미선택 시 견적 계산 없이 안내만.
// - 2026-08-14: 생산만/디자인+생산 툴팁을「커스텀어벗 - 어벗츠 자체 제공」(+생산만은 어벗생산의뢰 안내)로 통일.
// - 2026-08-14: 커스텀어벗 설정 모달 가로폭을 프리셋 편집과 같이 max-w-5xl로 맞춘다.
// - 2026-08-14: 환봉 도입 치아는 환봉 단가(0원이면 별도 고지)를 설정 모달에 표시.
// - 2026-08-14: 환봉 요청중 판별용 implantFavorites를 기공비 견적에 전달.
// - 2026-08-13: 커스텀어벗 칸 「설정」제거. 생산/디자인+생산 클릭 시 설정 모달.
// - 2026-08-13: 커스텀어벗 가격 툴팁은 해당 치과 멤버십/일반 한쪽만 안내.
// - 2026-08-13: 커스텀어벗 설정 모달 가격 툴팁은 호버일 때만.
// - 2026-08-13: 단독 보철=인레이/크라운/커스텀어벗. 형태 클릭은 모달 없음.
// - 2026-08-13: 커스텀어벗 모달 기본=디자인+생산. 선택값은 계정 defaultAbutmentProductMode로 저장.
// - 2026-08-13: 커스텀어벗 설정 모달 툴팁에서 월 구독료 삭제. 배송비·부가세는 한 줄.
// - 2026-08-13: 모달 하단 좌측 프리셋 편집(primary), 우측 취소/확인.
// - 2026-08-13: 임플란트·스캔바디 프리셋이 모두 없으면 설정 모달과 함께 프리셋 편집을 연다.
// - 2026-08-13: 임플란트·스캔바디 프리셋을 각각 한 번 고르면 확인과 같이 저장·닫힘.
// - 2026-08-13: 크라운·브리지·임시치아 아래 어벗 체크박스. 체크 시 설정 모달.
// - 2026-08-19: 임시치아(단독·연결)도 커스텀어벗 주문 가능.
// - 2026-08-19: 브리지 연결 시 한쪽이 임시치아이면 연결된 치아 전체를 임시치아로 맞춘다.
// - 2026-08-13: 커스텀어벗 프리셋 목록은 4개까지 표시, 초과 시 스크롤.
// - 2026-08-25: 단독 클릭 순환에 커스텀어벗 유지. 거쳐도 어벗 체크·규격 불변. 커스텀어벗에도 체크박스 표시.
// - 2026-08-13: 형태 글자 클릭(인레이→크라운→커스텀어벗→임시치아)은 설정 모달을 열지 않음.
// - 2026-08-13: 연결 형태 클릭 순환에 유지장치·임시치아 추가.
// - 2026-08-13: 유지장치=연결 전용. 임시치아=단독·연결.
// - 2026-08-14: 유지장치 등 연결 전체 강제 변경 후 복귀 시, 미클릭 치아는 형태·어벗·임플란트까지 복원.
// - 2026-08-13: 어벗 체크·커스텀어벗인데 프리셋 미선택이면 치식 카드 빨강.
// - 2026-08-13: 기공의뢰 치식 카드에서 디자인+생산 라벨 제거(모드는 디자인+생산 고정).
// - 2026-08-13: 형태 글자 클릭은 마키 억제와 별개로 순환(브리지·크라운 여백 클릭 포함).
// - 2026-08-17: 치아카드 하단 복사 뱃지 드래그로 다른 치아에 형태·어벗·규격 복사(브리지 연결은 유지).
// - 2026-08-17: 복사 뱃지 — 괄호 제거, 11px·primary soft pill.
// - 2026-08-18: full 치식 카드 min-w·브리지 + 를 이음새에 겹쳐 어벗 라벨이 잘리지 않게.
// - 2026-08-18: full 치식에서는 R/M/L 스크롤 버튼을 숨긴다.
// - 2026-08-19: 치아 옆 스크롤·R/M/L 제거. compact는 overflow-x + custom-scrollbar-x.
// - 2026-08-20: Expert — 헤더 다음 메모|드롭존 2열, 보철물은 그 아래.
// - 2026-08-20: 메모 라벨·?툴팁 제거. 메모|드롭존 높이 stretch 맞춤.
// - 2026-08-25: 보철물 가이드투어 — 선택·해제·브리지·형태·복사·어벗·프리셋·견적 체험.
// - 2026-08-25: 전체 가이드투어 — 기공소·환자·날짜 선행 후 보철물. 상단 버튼으로 시작.
// - 2026-08-25: 환자명 투어 — 이미 채워진 이름이면 변경 전 자동 진행 안 함(2→3 점프 방지).
// - 2026-08-25: full 치식 — 카드가 전폭을 나눠 갖고 스크롤 없이 16칸 표시. 위·아래 여백으로 경계 보존.
// - 2026-08-25: full 치식 카드 높이 12rem 복구·형태 버튼 shrink-0 — 어벗 상세 시 유형 스위치 가림 방지.
// - 2026-09-02: full 치식 슬롯 래퍼 contents 복구 — shrink-0 래퍼가 flex-1 전폭 분할을 막아 카드가 좁아지던 문제.

const PRACTICE_MEMO_SNIPPETS_LOCAL_KEY = "practice_transfer_memo_snippets_v1";
const MAX_MEMO_SNIPPETS = 40;
const MAX_MEMO_SUGGESTIONS = 8;
const MEMO_SUGGEST_MIN_CHARS = 1;
/** 카드 높이: 번호+형태+어벗+임플란트/스캔바디 2줄+복사 기준(이보다 짧으면 형태 버튼이 flex-shrink로 가려짐) */
const TOOTH_CARD_HEIGHT_CLASS = "h-[12rem]";
/** full(16칸) — compact와 동일. 9rem은 어벗 상세 시 유형 스위치가 찌그러짐 */
const TOOTH_CARD_HEIGHT_FULL_CLASS = "h-[12rem]";
/** compact — 치아당 5rem 고정, 가로 스크롤 */
const TOOTH_SLOT_COMPACT_CLASS = "relative w-[5rem] max-w-[5rem] shrink-0 snap-start";
/** full(16칸) — 전폭을 균등 분할(가로 스크롤·프로그레스 겹침 방지) */
const TOOTH_SLOT_FULL_CLASS = "min-w-0 flex-1 basis-0";
const BRIDGE_GAP_LINKED_CLASS =
  "w-1.5 border-y border-primary bg-gradient-to-b from-primary-soft via-primary-soft to-white";
const BRIDGE_GAP_UNLINKED_CLASS = "w-1.5";
/** 정중선(11–21 / 41–31) 이음 — 좌우 악궁을 조금 띄움 */
const BRIDGE_GAP_MIDLINE_CLASS = "w-2.5";
const BRIDGE_BUTTON_CLASS =
  "absolute left-1/2 top-1/2 z-10 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border shadow-sm transition-colors";

/** 치식: 위(18→11→21→28) / 아래(48→41→31→38). 한 줄 6칸, 스크롤은 견적 바 */
const TOOTH_CHART_ROWS: ReadonlyArray<{ key: string; label: string; teeth: readonly string[] }> = [
  {
    key: "upper",
    label: "상악",
    teeth: [
      "18", "17", "16", "15", "14", "13", "12", "11",
      "21", "22", "23", "24", "25", "26", "27", "28",
    ],
  },
  {
    key: "lower",
    label: "하악",
    teeth: [
      "48", "47", "46", "45", "44", "43", "42", "41",
      "31", "32", "33", "34", "35", "36", "37", "38",
    ],
  },
];

/** 빈 치아 슬롯 클릭·드래그 선택 시 행 추가(이미 있으면 no-op). */
const activateToothInWorks = (
  prev: ToothWorkSelection[],
  toothNumber: string,
  defaultProsthesisType: string,
  prosthesisTypes: string[],
  options?: { autoLinkBridgeNeighbor?: boolean },
): ToothWorkSelection[] => {
  const existingIdx = prev.findIndex(
    (row) => String(row.toothNumber || "").trim() === toothNumber,
  );
  if (existingIdx >= 0) return prev;

  const autoLinkBridgeNeighbor = options?.autoLinkBridgeNeighbor === true;
  const adj = getAdjacentTeeth(toothNumber);
  const bridgeNeighborIdx = autoLinkBridgeNeighbor
    ? prev.findIndex(
        (row) =>
          adj.includes(String(row.toothNumber || "").trim()) &&
          isLinkableProsthesisType(row.prosthesisType),
      )
    : -1;

  const emptyIdx = prev.findIndex(
    (row) => !/^[1-4][1-8]$/.test(String(row.toothNumber || "").trim()),
  );
  let next = [...prev];
  const base = {
    toothNumber,
    prosthesisType: defaultProsthesisType,
    customAbutment: false,
    bridgeLinkedTeeth: [] as string[],
    ...emptyToothWorkCustomSpecs(),
  };
  if (emptyIdx >= 0) next[emptyIdx] = { ...next[emptyIdx], ...base };
  else next.push(base);

  if (bridgeNeighborIdx >= 0) {
    const neighborTooth = String(next[bridgeNeighborIdx]?.toothNumber || "").trim();
    const targetIdx = next.findIndex(
      (row) => String(row.toothNumber || "").trim() === toothNumber,
    );
    if (targetIdx >= 0 && neighborTooth) {
      next = toggleAdjacentBridgeLink(
        next,
        bridgeNeighborIdx,
        toothNumber,
        true,
        prosthesisTypes,
      );
    }
  }
  return next;
};

const activateTeethInWorks = (
  prev: ToothWorkSelection[],
  toothNumbers: readonly string[],
  defaultProsthesisType: string,
  prosthesisTypes: string[],
  options?: { autoLinkBridgeNeighbor?: boolean },
): ToothWorkSelection[] => {
  let next = prev;
  for (const toothNumber of toothNumbers) {
    next = activateToothInWorks(
      next,
      toothNumber,
      defaultProsthesisType,
      prosthesisTypes,
      options,
    );
  }
  return next;
};

/** 선택 해제: 브리지 연결 정리 후 행 제거(목록이 비면 빈 행 1개 유지). */
const deactivateToothInWorks = (
  prev: ToothWorkSelection[],
  toothNumber: string,
  defaultProsthesisType: string,
  prosthesisTypes: string[],
): ToothWorkSelection[] => {
  let next = prev;
  let idx = next.findIndex((row) => String(row.toothNumber || "").trim() === toothNumber);
  if (idx < 0) return prev;

  const links = Array.isArray(next[idx].bridgeLinkedTeeth)
    ? [...next[idx].bridgeLinkedTeeth]
    : [];
  for (const adj of links) {
    idx = next.findIndex((row) => String(row.toothNumber || "").trim() === toothNumber);
    if (idx < 0) break;
    next = toggleAdjacentBridgeLink(next, idx, adj, false, prosthesisTypes);
  }

  const removeIdx = next.findIndex(
    (row) => String(row.toothNumber || "").trim() === toothNumber,
  );
  if (removeIdx < 0) return next;
  next = next.filter((_, i) => i !== removeIdx);
  if (next.length === 0) {
    return [
      {
        toothNumber: "",
        prosthesisType: defaultProsthesisType,
        customAbutment: false,
        bridgeLinkedTeeth: [],
        ...emptyToothWorkCustomSpecs(),
      },
    ];
  }
  return next;
};

const deactivateTeethInWorks = (
  prev: ToothWorkSelection[],
  toothNumbers: readonly string[],
  defaultProsthesisType: string,
  prosthesisTypes: string[],
): ToothWorkSelection[] => {
  let next = prev;
  for (const toothNumber of toothNumbers) {
    next = deactivateToothInWorks(next, toothNumber, defaultProsthesisType, prosthesisTypes);
  }
  return next;
};

/** 악궁 치열 순(차트 행)으로 인접 + 양방향 연결. 형태(prosthesisType)는 바꾸지 않는다. */
const linkConsecutiveTeethInArch = (
  rows: ToothWorkSelection[],
  archTeeth: readonly string[],
): ToothWorkSelection[] => {
  if (archTeeth.length < 2) return rows;
  const neighborMap = new Map<string, string[]>();
  for (let i = 0; i < archTeeth.length; i += 1) {
    const tooth = archTeeth[i];
    const links: string[] = [];
    if (i > 0) links.push(archTeeth[i - 1]);
    if (i < archTeeth.length - 1) links.push(archTeeth[i + 1]);
    neighborMap.set(tooth, links);
  }
  return rows.map((row) => {
    const tooth = String(row.toothNumber || "").trim();
    const neighbors = neighborMap.get(tooth);
    if (!neighbors) return row;
    return {
      ...row,
      bridgeLinkedTeeth: neighbors,
    };
  });
};

const applyBridgeLinksInWorks = (
  prev: ToothWorkSelection[],
  bridgeKeys: readonly string[],
  connect: boolean,
  prosthesisTypes: string[],
): ToothWorkSelection[] => {
  let next = prev;
  for (const key of bridgeKeys) {
    const [toothA, toothB] = String(key || "").split("|");
    if (!toothA || !toothB) continue;
    const idxA = next.findIndex((row) => String(row.toothNumber || "").trim() === toothA);
    if (idxA >= 0) {
      next = toggleAdjacentBridgeLink(next, idxA, toothB, connect, prosthesisTypes);
      continue;
    }
    const idxB = next.findIndex((row) => String(row.toothNumber || "").trim() === toothB);
    if (idxB >= 0) {
      next = toggleAdjacentBridgeLink(next, idxB, toothA, connect, prosthesisTypes);
    }
  }
  return next;
};

/** 소스 치아의 형태·어벗·규격을 대상 치아에 복사. 대상의 브리지 연결은 유지. */
const copyToothWorkContentToTooth = (
  prev: ToothWorkSelection[],
  sourceTooth: string,
  targetTooth: string,
  defaultProsthesisType: string,
  prosthesisTypes: string[],
  lockedAbutmentProductMode: AbutmentProductMode | null,
): ToothWorkSelection[] => {
  const src = String(sourceTooth || "").trim();
  const dst = String(targetTooth || "").trim();
  if (!src || !dst || src === dst) return prev;
  if (!/^[1-4][1-8]$/.test(src) || !/^[1-4][1-8]$/.test(dst)) return prev;

  const sourceIdx = prev.findIndex(
    (row) => String(row.toothNumber || "").trim() === src,
  );
  if (sourceIdx < 0) return prev;
  const source = prev[sourceIdx];

  let next = activateToothInWorks(prev, dst, defaultProsthesisType, prosthesisTypes, {
    autoLinkBridgeNeighbor: false,
  });
  const targetIdx = next.findIndex(
    (row) => String(row.toothNumber || "").trim() === dst,
  );
  if (targetIdx < 0) return prev;
  const target = next[targetIdx];
  const wantsCustom =
    Boolean(source.customAbutment) ||
    isCustomAbutmentProsthesisType(source.prosthesisType);
  const abutmentProductMode = wantsCustom
    ? lockedAbutmentProductMode ??
      (isAbutmentProductMode(source.abutmentProductMode)
        ? source.abutmentProductMode
        : undefined)
    : undefined;

  next = [...next];
  next[targetIdx] = {
    toothNumber: dst,
    prosthesisType:
      String(source.prosthesisType || "").trim() || defaultProsthesisType,
    customAbutment: wantsCustom,
    abutmentProductMode,
    bridgeLinkedTeeth: Array.isArray(target.bridgeLinkedTeeth)
      ? [...target.bridgeLinkedTeeth]
      : [],
    ...(wantsCustom
      ? pickToothWorkCustomSpecs(source, true)
      : emptyToothWorkCustomSpecs()),
  };
  return next;
};

const matchesLinkedToggleType = (current: string, type: string) => {
  if (type === NO_WORK_PROSTHESIS_TYPE) return isMissingToothProsthesisType(current);
  if (type === "유지장치") return isRetainerProsthesisType(current);
  if (type === "임시치아") return isTemporaryToothProsthesisType(current);
  return current === type;
};

/** 선택 치아 클릭: 인레이→크라운→커스텀어벗→임시치아 / 브리지↔결손치↔유지장치↔임시치아 */
const resolveNextProsthesisType = (
  prev: ToothWorkSelection[],
  toothNumber: string,
  prosthesisTypes: string[],
): { index: number; nextType: string } | null => {
  const idx = prev.findIndex((row) => String(row.toothNumber || "").trim() === toothNumber);
  if (idx < 0) return null;
  const row = prev[idx];
  const links = collectAdjacentBridgeLinks(prev, row.toothNumber);
  const isLinked = links.length > 0;
  const options = getProsthesisTypesForLinkState(isLinked, prosthesisTypes);
  if (options.length === 0) return null;

  const current = String(row.prosthesisType || "").trim();
  let nextType: string | null = null;
  if (isLinked) {
    const cycle = LINKED_PROSTHESIS_TYPES.filter((type) =>
      options.some((option) => matchesLinkedToggleType(option, type)),
    );
    if (cycle.length > 0) {
      const currentIdx = cycle.findIndex((type) => matchesLinkedToggleType(current, type));
      nextType = cycle[(currentIdx >= 0 ? currentIdx + 1 : 0) % cycle.length]!;
    }
  }
  if (!nextType) {
    const cycle = STANDALONE_PROSTHESIS_TYPES.filter((type) =>
      options.some((option) =>
        type === CUSTOM_ABUTMENT_PROSTHESIS_TYPE
          ? isCustomAbutmentProsthesisType(option)
          : type === "임시치아"
            ? isTemporaryToothProsthesisType(option)
            : option === type,
      ),
    ).map((type) =>
      type === CUSTOM_ABUTMENT_PROSTHESIS_TYPE
        ? options.find((option) => isCustomAbutmentProsthesisType(option)) || type
        : type,
    );
    const currentIdx = cycle.findIndex((type) =>
      isCustomAbutmentProsthesisType(type)
        ? isCustomAbutmentProsthesisType(current)
        : type === "임시치아"
          ? isTemporaryToothProsthesisType(current)
          : type === current,
    );
    nextType =
      cycle.length > 0
        ? cycle[(currentIdx >= 0 ? currentIdx + 1 : 0) % cycle.length]!
        : options.find((type) => type === "크라운") || options[0]!;
  }
  if (!nextType || nextType === current) return null;
  return { index: idx, nextType };
};

const TOOTH_MARQUEE_MOVE_THRESHOLD_PX = 6;

const clientRectsIntersect = (
  a: { left: number; top: number; right: number; bottom: number },
  b: DOMRect,
) =>
  !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);

/** 같은 악궁(상·하) 안에서만 파인더식 Shift 범위 선택 */
const teethInShiftRange = (anchor: string, target: string): string[] => {
  for (const row of TOOTH_CHART_ROWS) {
    const i = row.teeth.indexOf(anchor);
    const j = row.teeth.indexOf(target);
    if (i < 0 || j < 0) continue;
    const [lo, hi] = i <= j ? [i, j] : [j, i];
    return row.teeth.slice(lo, hi + 1) as string[];
  }
  return [target];
};

const isToothOverlayUiTarget = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "[data-no-tooth-marquee], [data-radix-tooltip-content], [data-radix-popper-content-wrapper], [role='tooltip']",
    ),
  );
};

/** 빈 슬롯·선택 카드·브리지 +/−·차트 여백은 마키 허용. 셀렉트·입력 등만 차단 */
const isToothMarqueeBlockedTarget = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return true;
  if (isToothOverlayUiTarget(target)) return true;
  if (target.closest("[data-tooth-slot-empty]")) return false;
  if (target.closest("[data-tooth-slot-selected]")) return false;
  if (target.closest("[data-bridge-link]")) return false;
  if (target.closest("button, input, textarea, select, a, [role='combobox']")) return true;
  return false;
};

/** 체험형 가이드투어 — 스텝별 변화 감지용 스냅샷 */
type ToothWorkGuideTourSnapshot = {
  teeth: ReadonlySet<string>;
  bridges: ReadonlySet<string>;
  abutmentKey: string;
  implantKey: string;
  scanbodyKey: string;
  contentKey: string;
};

const captureToothWorkGuideTourSnapshot = (
  rows: readonly ToothWorkSelection[],
): ToothWorkGuideTourSnapshot => {
  const teeth = new Set<string>();
  const bridges = new Set<string>();
  const abutmentParts: string[] = [];
  const implantParts: string[] = [];
  const scanbodyParts: string[] = [];
  const contentParts: string[] = [];
  for (const row of rows) {
    const tooth = String(row.toothNumber || "").trim();
    if (!/^[1-4][1-8]$/.test(tooth)) continue;
    teeth.add(tooth);
    abutmentParts.push(
      `${tooth}:${row.customAbutment || isCustomAbutmentProsthesisType(row.prosthesisType) ? "1" : "0"}`,
    );
    implantParts.push(
      `${tooth}:${hasToothWorkImplantPreset(row) ? "1" : "0"}:${String(row.implantManufacturer || "").trim()}:${String(row.implantBrand || "").trim()}:${String(row.implantType || "").trim()}`,
    );
    scanbodyParts.push(
      `${tooth}:${hasToothWorkAbutmentSidePreset(row) ? "1" : "0"}:${String(row.abutmentManufacturer || "").trim()}:${String(row.abutmentDiameter || "").trim()}:${String(row.abutmentHeight || "").trim()}`,
    );
    contentParts.push(
      `${tooth}:${String(row.prosthesisType || "").trim()}:${row.customAbutment ? "1" : "0"}:${String(row.implantManufacturer || "").trim()}:${String(row.abutmentManufacturer || "").trim()}`,
    );
    const links = Array.isArray(row.bridgeLinkedTeeth) ? row.bridgeLinkedTeeth : [];
    for (const link of links) {
      const other = String(link || "").trim();
      if (!/^[1-4][1-8]$/.test(other)) continue;
      bridges.add(tooth < other ? `${tooth}|${other}` : `${other}|${tooth}`);
    }
  }
  abutmentParts.sort();
  implantParts.sort();
  scanbodyParts.sort();
  contentParts.sort();
  return {
    teeth,
    bridges,
    abutmentKey: abutmentParts.join(","),
    implantKey: implantParts.join(","),
    scanbodyKey: scanbodyParts.join(","),
    contentKey: contentParts.join(","),
  };
};

export const normalizeMemoSnippets = (items: unknown): string[] => {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const next: string[] = [];
  for (const item of items) {
    const text = String(item || "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(text);
    if (next.length >= MAX_MEMO_SNIPPETS) break;
  }
  return next;
};

const filterMemoSuggestions = (input: string, snippets: string[]): string[] => {
  const q = String(input || "").trim().toLowerCase();
  if (q.length < MEMO_SUGGEST_MIN_CHARS) return [];
  const prefix: string[] = [];
  const contains: string[] = [];
  for (const snippet of snippets) {
    const text = String(snippet || "").trim();
    if (!text) continue;
    const lower = text.toLowerCase();
    if (lower === q) continue;
    if (lower.startsWith(q)) prefix.push(text);
    else if (lower.includes(q)) contains.push(text);
  }
  return [...prefix, ...contains].slice(0, MAX_MEMO_SUGGESTIONS);
};

const loadLocalMemoSnippets = (): string[] => {
  try {
    const raw = localStorage.getItem(PRACTICE_MEMO_SNIPPETS_LOCAL_KEY);
    if (!raw) return [];
    return normalizeMemoSnippets(JSON.parse(raw));
  } catch {
    return [];
  }
};

const persistLocalMemoSnippets = (items: string[]) => {
  try {
    localStorage.setItem(PRACTICE_MEMO_SNIPPETS_LOCAL_KEY, JSON.stringify(normalizeMemoSnippets(items)));
  } catch {
    // ignore
  }
};

export type PracticeTransferRequestIntakePanelProps = {
  /** false면 기공소·환자명·날짜를 숨기고 보철물·메모만 렌더 (기본 true) */
  showHeaderFields?: boolean;
  /** 헤더 필드 개별 표시. 미지정 시 showHeaderFields 따름 */
  showLabField?: boolean;
  showPatientField?: boolean;
  showDateFields?: boolean;
  /** 어벗츠기공소 선택 시에만 별점 하한·상한 표시(하청 수신 게이트) */
  showAutoMatchMinLabRating?: boolean;
  /** false면 보철물 치식 섹션 숨김 (기본 true) */
  showProsthesisSection?: boolean;
  /** false면 메모 섹션 숨김 (기본 true) */
  showMemoSection?: boolean;
  /** card: practice transfers 카드 스타일 / plain: 모달 등 상위 카드 안에 임베드 */
  variant?: "card" | "plain";
  className?: string;
  /** 크게 보기 버튼 숨김 */
  hideEnlargeButton?: boolean;
  /** compact: 6칸 스크롤 / full: 16칸 전체 표시 (크게 보기와 동일) */
  toothChartDisplayMode?: "compact" | "full";
  /** 상위 Dialog 위에 뜨는 내부 Dialog(커스텀어벗 설정 등) z-index */
  nestedDialogClassName?: string;
  nestedDialogOverlayClassName?: string;
  /** 메모 라벨 위에 렌더 (의뢰비 등) */
  aboveMemoContent?: ReactNode;
  /** 메모 오른쪽 열(드롭존 등). 있으면 메모|옆열 2열 → 보철물 순서 */
  besideMemoContent?: ReactNode;
  /** 메모 입력 박스 className 덮어쓰기 (높이·스크롤 등) */
  memoBoxClassName?: string;
  selectedLab: SearchBusinessResult | null;
  setSelectedLab: (value: SearchBusinessResult | null) => void;
  labOpen: boolean;
  setLabOpen: (open: boolean) => void;
  labSearch: string;
  setLabSearch: (value: string) => void;
  labSearchResults: SearchBusinessResult[];
  labSearching: boolean;
  recentLabs: SearchBusinessResult[];
  recentLabsInitialized: boolean;
  /** 「고정」섹션(어벗츠 항상 + 사용자 pin) */
  pinnedLabs?: SearchBusinessResult[];
  /** 최근 기공소 목록에서 제거(X) */
  onRemoveRecentLab?: (lab: SearchBusinessResult) => void;
  /** 기공소 고정/해제(어벗츠는 no-op) */
  onTogglePinLab?: (lab: SearchBusinessResult) => void;
  patientName: string;
  setPatientName: (value: string) => void;
  orderDate: string;
  setOrderDate: (value: string) => void;
  arrivalDate: string;
  setArrivalDate: (value: string) => void;
  /** 주문일·도착일을 한 번에 지정(대시보드 arrival auto-sync 스킵용) */
  onOrderArrivalDatesChange?: (next: { orderDate: string; arrivalDate: string }) => void;
  arrivalDefaultDays: number;
  normalizedProsthesisTypes: string[];
  setProsthesisTypeCatalogDraft: (value: string[]) => void;
  setProsthesisTypeSettingsDialogOpen: (open: boolean) => void;
  /** 전체 선택·커스텀 추가 시 카탈로그에 타입 합침 */
  onEnsureProsthesisTypesInCatalog?: (types: string[]) => void;
  toothWorks: ToothWorkSelection[];
  setToothWorks: Dispatch<SetStateAction<ToothWorkSelection[]>>;
  requestMemo: string;
  setRequestMemo: (value: string) => void;
  memoInputId: string;
  memoSnippets?: string[];
  onMemoSnippetsChange?: (next: string[]) => void | Promise<void>;
  onImeComposingChange?: (composing: boolean) => void;
  prosthesisTypeSelectWidthClassName?: string;
  showBridgeConnections?: boolean;
  onClearAll?: () => void;
  implantConnections?: ImplantConnection[];
  implantFavorites?: PracticeImplantFavorite[];
  onImplantFavoritesChange?: (next: PracticeImplantFavorite[]) => void | Promise<void>;
  /** 프리셋 편집을 열 때 서버 프리셋(도입 스펙)을 다시 불러온다 */
  onPresetEditorOpen?: () => void;
  abutmentFavorites?: PracticeAbutmentFavorite[];
  onAbutmentFavoritesChange?: (next: PracticeAbutmentFavorite[]) => void | Promise<void>;
  /** 계정 커스텀어벗 기본 모드. 신규 선택·모달 초기값 */
  defaultAbutmentProductMode?: AbutmentProductMode;
  onDefaultAbutmentProductModeChange?: (
    next: AbutmentProductMode,
  ) => void | Promise<void>;
  /** 고정 모드. 해당 항목 항상 체크. 다른 항목 클릭은 onAlternateAbutmentModeNavigate */
  lockedAbutmentProductMode?: AbutmentProductMode;
  /** 고정 모드의 반대 항목 클릭 시 이동(구강스캔↔어벗생산의뢰) */
  onAlternateAbutmentModeNavigate?: () => void;
  /**
   * 생산만 고정일 때 디자인+생산 이동 안내 라벨.
   * 치과=`구강스캔으로`, 기공소=`치과로부터 수신`. 기본=`구강스캔으로`.
   */
  alternateAbutmentModePageLabel?: string;
  /** 값이 바뀌면 치식 차트를 M(전치부) 위치로 되돌린다 (새로 작성 등) */
  toothChartResetNonce?: number;
  /** 상·하악 사이에 견적(크레딧 소비액) 표시. 기공의뢰서만 */
  showFeeEstimate?: boolean;
  /** @deprecated 2026-08-22 skipJig 옵션 삭제. 호환용 props */
  skipJig?: boolean;
  /** @deprecated 2026-08-22 skipJig 옵션 삭제 */
  onSkipJigChange?: (next: boolean) => void;
  /** 신속처리(합계≤3영업일 확인 후). 견적 할증 */
  rushProcessing?: boolean;
  /** 자동매칭 기공비(v4 고정수가 스냅샷) */
  autoMatchBudget?: PracticeTransferAutoMatchBudget | null;
  /** 어벗츠 수가 카탈로그 — 평균×배수 견적 SSOT */
  abutsLabFeeCatalog?: AbutsLabFeeCatalogItem[] | null;
  onAutoMatchBudgetChange?: (
    next: PracticeTransferAutoMatchBudget | null,
  ) => void | Promise<void>;
  /** 자동매칭 별점 하한(1~5). 기공비 배수 기준. */
  autoMatchMinLabRating?: number;
  onAutoMatchMinLabRatingChange?: (next: number) => void | Promise<void>;
  /** 자동매칭 별점 상한(1~5). */
  autoMatchMaxLabRating?: number;
  onAutoMatchMaxLabRatingChange?: (next: number) => void | Promise<void>;
  /**
   * 가이드투어 시작 버튼 표시(보철물 라벨 옆).
   * false면 상위에서 외부 버튼으로 제어(guideTourStartSignal 등).
   */
  showInlineGuideTourButton?: boolean;
  /** 값이 바뀌면 가이드투어 시작 */
  guideTourStartSignal?: number;
  /** 값이 바뀌면 가이드투어 종료 */
  guideTourExitSignal?: number;
  /** 투어 진행 중 여부 알림(외부 버튼 라벨용) */
  onGuideTourActiveChange?: (active: boolean) => void;
  /**
   * 가이드투어 스텝(제어). onGuideTourStepChange와 함께 쓰면 패널 unmount 후에도 유지.
   */
  guideTourStep?: PracticeToothWorkGuideTourStep | null;
  onGuideTourStepChange?: (step: PracticeToothWorkGuideTourStep | null) => void;
  /**
   * PC — 기공소·환자·날짜 위 툴바(모드·새로작성·투어 등).
   * 있으면 투어 카드가 툴바 윗단~입력 아랫단을 한 그리드로 맞춘다.
   */
  headerToolbar?: ReactNode;
  /**
   * headerToolbar 없이도 오른쪽 레일(투어) 자리를 예약.
   * 작성 툴바가 DialogHeader로 올라도 기공소·환자·날짜 폭이 투어 on/off에 점프하지 않게.
   */
  reserveGuideTourAside?: boolean;
  /** 툴바 아래·헤더 필드 위 소개 슬롯 */
  headerIntro?: ReactNode;
  /** 상단 CardHeader 오른쪽 — 기공소·환자·날짜 투어 배너 포털 대상(툴바 미사용 시) */
  guideTourHeaderSlotEl?: HTMLElement | null;
};

export const PracticeTransferRequestIntakePanel = ({
  showHeaderFields = true,
  showLabField: showLabFieldProp,
  showPatientField: showPatientFieldProp,
  showDateFields: showDateFieldsProp,
  showAutoMatchMinLabRating = true,
  showProsthesisSection = true,
  showMemoSection = true,
  variant = "card",
  className,
  hideEnlargeButton = false,
  toothChartDisplayMode = "compact",
  nestedDialogClassName,
  nestedDialogOverlayClassName,
  aboveMemoContent,
  besideMemoContent,
  memoBoxClassName,
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
  pinnedLabs = [],
  onRemoveRecentLab,
  onTogglePinLab,
  patientName,
  setPatientName,
  orderDate,
  setOrderDate,
  arrivalDate,
  setArrivalDate,
  onOrderArrivalDatesChange,
  arrivalDefaultDays,
  normalizedProsthesisTypes,
  setProsthesisTypeCatalogDraft,
  setProsthesisTypeSettingsDialogOpen,
  onEnsureProsthesisTypesInCatalog,
  toothWorks,
  setToothWorks,
  requestMemo,
  setRequestMemo,
  memoInputId,
  memoSnippets: memoSnippetsProp,
  onMemoSnippetsChange,
  onImeComposingChange,
  prosthesisTypeSelectWidthClassName = "w-[7rem]",
  showBridgeConnections = false,
  onClearAll,
  implantConnections = [],
  implantFavorites = [],
  onImplantFavoritesChange,
  onPresetEditorOpen,
  abutmentFavorites = [],
  onAbutmentFavoritesChange,
  defaultAbutmentProductMode: defaultAbutmentProductModeProp,
  onDefaultAbutmentProductModeChange,
  lockedAbutmentProductMode,
  onAlternateAbutmentModeNavigate,
  alternateAbutmentModePageLabel = "구강스캔으로",
  toothChartResetNonce = 0,
  showFeeEstimate = false,
  // 레거시(2026-08-22): skipJig / onSkipJigChange UI 삭제. props는 호환용으로만 수신.
  skipJig: _skipJig = true,
  onSkipJigChange: _onSkipJigChange,
  rushProcessing = false,
  autoMatchMinLabRating = DEFAULT_AUTO_MATCH_MIN_LAB_RATING,
  onAutoMatchMinLabRatingChange,
  autoMatchMaxLabRating = DEFAULT_AUTO_MATCH_MAX_LAB_RATING,
  onAutoMatchMaxLabRatingChange,
  showInlineGuideTourButton = false,
  guideTourStartSignal = 0,
  guideTourExitSignal = 0,
  onGuideTourActiveChange,
  guideTourStep: guideTourStepProp,
  onGuideTourStepChange,
  headerToolbar = null,
  reserveGuideTourAside = false,
  headerIntro = null,
  guideTourHeaderSlotEl = null,
}: PracticeTransferRequestIntakePanelProps) => {
  const { toast } = useToast();
  const authUser = useAuthStore((s) => s.user);
  const platformGuideTour = useGuideTour();
  const platformOralActive =
    platformGuideTour.active &&
    platformGuideTour.oralSubStepIndex != null &&
    isPracticeToothWorkOralStepId(platformGuideTour.stepId);
  const [labInviteCopyBusy, setLabInviteCopyBusy] = useState(false);
  /** 메모|파일 2열 — 오른쪽 파일 패널 높이에 메모 카드 맞춤 */
  const besideMemoPaneRef = useRef<HTMLDivElement | null>(null);
  const [memoMatchBesideHeightPx, setMemoMatchBesideHeightPx] = useState<
    number | null
  >(null);
  useLayoutEffect(() => {
    if (!showMemoSection || !besideMemoContent) {
      setMemoMatchBesideHeightPx(null);
      return;
    }
    const el = besideMemoPaneRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const apply = () => {
      const next = Math.round(el.getBoundingClientRect().height);
      setMemoMatchBesideHeightPx((prev) => (prev === next ? prev : next));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [showMemoSection, besideMemoContent]);
  const showLabField = showLabFieldProp ?? showHeaderFields;
  const showPatientField = showPatientFieldProp ?? showHeaderFields;
  const showDateFields = showDateFieldsProp ?? showHeaderFields;
  const defaultAbutmentProductMode = normalizeAccountAbutmentProductMode(
    defaultAbutmentProductModeProp ?? DEFAULT_ACCOUNT_ABUTMENT_PRODUCT_MODE,
  );
  // 레거시(2026-08-22): skipJig 옵션·UI 삭제.
  const lockedMode = isAbutmentProductMode(lockedAbutmentProductMode)
    ? lockedAbutmentProductMode
    : null;
  const applyIntakeProsthesisType = (
    row: ToothWorkSelection,
    prosthesisType: string,
  ) => {
    const next = applyProsthesisTypeToRow(
      row,
      prosthesisType,
      lockedMode ?? defaultAbutmentProductMode,
    );
    // locked 모드여도 어벗 체크 여부는 유지. 이미 체크된 경우만 모드를 고정한다.
    if (lockedMode && next.customAbutment) {
      return {
        ...next,
        customAbutment: true,
        abutmentProductMode: lockedMode,
      };
    }
    return next;
  };
  const defaultProsthesisType = normalizedProsthesisTypes.includes("크라운")
    ? "크라운"
    : normalizedProsthesisTypes[0] || "크라운";

  const handleCopyLabInviteLink = async () => {
    if (labInviteCopyBusy) return;
    const referralCode = String(authUser?.referralCode || "")
      .trim()
      .toUpperCase();
    if (!referralCode) {
      toast({
        title: "복사 실패",
        description: "소개 코드를 확인할 수 없습니다.",
        variant: "destructive",
      });
      return;
    }

    setLabInviteCopyBusy(true);
    try {
      const link = buildReferralSignupLink(referralCode);
      if (!link) {
        throw new Error("소개 링크를 만들 수 없습니다.");
      }
      const message = buildLabIntroMessage(link);
      if (!message) {
        throw new Error("안내 문구를 만들 수 없습니다.");
      }
      await navigator.clipboard.writeText(message);
      toast({
        title: "복사 완료",
        description: "거래 기공소에 보낼 안내 문구와 링크를 복사했습니다.",
        duration: 2000,
      });
      setLabOpen(false);
    } catch (error) {
      toast({
        title: "복사 실패",
        description:
          error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setLabInviteCopyBusy(false);
    }
  };

  const openArchSelectModal = () => {
    setArchDropUpperType(null);
    setArchDropLowerType(null);
    setArchSelectCustomName("");
    setArchSelectCustomOpen(false);
    setArchDragType(null);
    setArchDropHover(null);
    setArchSelectModalOpen(true);
  };

  const openExtraRequestModal = () => {
    setExtraRequestContent("");
    setExtraRequestLabIds(
      selectedLab && !isAutoMatchLab(selectedLab)
        ? [String(selectedLab._id || "").trim()].filter(Boolean)
        : [],
    );
    setExtraRequestLabPickerOpen(false);
    setExtraRequestLabQuery("");
    setExtraRequestSubmitting(false);
    setExtraRequestModalOpen(true);
  };

  const submitExtraRequest = async () => {
    const content = String(extraRequestContent || "").trim();
    if (!content || extraRequestSubmitting) return;
    if (isArchBulkProsthesisPreset(content)) return;

    const labOptions = [
      ...(Array.isArray(pinnedLabs) ? pinnedLabs : []),
      ...(Array.isArray(recentLabs) ? recentLabs : []),
      ...(Array.isArray(labSearchResults) ? labSearchResults : []),
      ...(selectedLab ? [selectedLab] : []),
    ];
    const pickedLabs: SearchBusinessResult[] = [];
    const seen = new Set<string>();
    for (const id of extraRequestLabIds) {
      const labId = String(id || "").trim();
      if (!labId || seen.has(labId)) continue;
      const lab =
        labOptions.find((row) => String(row._id || "").trim() === labId) ||
        null;
      if (!lab) continue;
      seen.add(labId);
      pickedLabs.push(lab);
    }

    setExtraRequestSubmitting(true);
    const ok = await createProsthesisFeeItemRequest({
      name: content,
      labs: pickedLabs.map((lab) => ({
        labAnchorId: String(lab._id || "").trim(),
        labName: getBusinessLabel(lab),
      })),
      source: "extra_request",
    });
    setExtraRequestSubmitting(false);
    if (!ok) {
      toast({
        title: "추가요청 실패",
        description: "잠시 후 다시 시도해주세요.",
        variant: "destructive",
      });
      return;
    }
    onEnsureProsthesisTypesInCatalog?.([content]);
    setExtraRequestModalOpen(false);
    setExtraRequestContent("");
    setExtraRequestLabIds([]);
    toast({
      title: "추가요청 접수",
      description: "관리자 승인 후 기공소 기공비 설정에 반영됩니다.",
    });
  };

  const applyArchBulkProsthesisSelection = () => {
    const assignments: Array<{ key: "upper" | "lower"; typeName: string }> = [];
    const upperType = String(archDropUpperType || "").trim();
    const lowerType = String(archDropLowerType || "").trim();
    if (upperType) assignments.push({ key: "upper", typeName: upperType });
    if (lowerType) assignments.push({ key: "lower", typeName: lowerType });
    if (assignments.length === 0) return;

    const selectedArches = assignments
      .map((assignment) => {
        const arch = TOOTH_CHART_ROWS.find((row) => row.key === assignment.key);
        if (!arch) return null;
        return { ...arch, typeName: assignment.typeName };
      })
      .filter(
        (
          row,
        ): row is (typeof TOOTH_CHART_ROWS)[number] & { typeName: string } =>
          Boolean(row),
      );
    if (selectedArches.length === 0) return;

    const teeth = selectedArches.flatMap((row) => [...row.teeth]);
    const toothSet = new Set(teeth);
    const uniqueTypes = [
      ...new Set(selectedArches.map((row) => row.typeName).filter(Boolean)),
    ];
    onEnsureProsthesisTypesInCatalog?.(uniqueTypes);

    setToothWorks((prev) => {
      const kept = prev
        .filter((row) => {
          const tooth = String(row.toothNumber || "").trim();
          if (!/^[1-4][1-8]$/.test(tooth)) return false;
          return !toothSet.has(tooth);
        })
        .map((row) => ({
          ...row,
          bridgeLinkedTeeth: (
            Array.isArray(row.bridgeLinkedTeeth) ? row.bridgeLinkedTeeth : []
          ).filter((linked) => !toothSet.has(String(linked || "").trim())),
        }));

      let added: ToothWorkSelection[] = [];
      for (const arch of selectedArches) {
        let archRows = arch.teeth.map((toothNumber) =>
          applyIntakeProsthesisType(
            {
              toothNumber,
              prosthesisType: arch.typeName,
              customAbutment: false,
              bridgeLinkedTeeth: [],
              ...emptyToothWorkCustomSpecs(),
            },
            arch.typeName,
          ),
        );
        archRows = linkConsecutiveTeethInArch(archRows, arch.teeth);
        added = [...added, ...archRows];
      }

      const next = [...kept, ...added];
      if (next.length === 0) {
        return [
          {
            toothNumber: "",
            prosthesisType: defaultProsthesisType,
            customAbutment: false,
            bridgeLinkedTeeth: [],
            ...emptyToothWorkCustomSpecs(),
          },
        ];
      }
      return next;
    });

    setArchSelectModalOpen(false);
  };

  const { quote: feeQuote } = usePracticeTransferFeeQuote({
    enabled: showFeeEstimate && Boolean(selectedLab),
    labAnchorId: selectedLab?._id,
    toothWorks,
    implantFavorites,
    autoMatchBudget: null,
    // 신속처리 할증 없음
    rushFeeMultiplier: 1,
  });
  const labFeeByTooth = useMemo(() => {
    const map = new Map<string, { min: number; max: number }>();
    if (!isAutoMatchLab(selectedLab)) return map;
    for (const line of feeQuote?.lines || []) {
      const tooth = String(line.toothNumber || "").trim();
      if (!tooth) continue;
      const max = Math.max(0, Math.round(Number(line.labFee || 0)));
      if (max <= 0 && !(line.labFeeMin != null && Number(line.labFeeMin) > 0)) {
        continue;
      }
      const min =
        line.labFeeMin != null && Number.isFinite(Number(line.labFeeMin))
          ? Math.max(0, Math.round(Number(line.labFeeMin)))
          : max;
      map.set(tooth, { min, max: Math.max(min, max) });
    }
    return map;
  }, [feeQuote?.lines, selectedLab]);
  /** null = closed; number = 해당 치아 커스텀어벗 설정 */
  const [customSpecsModalTarget, setCustomSpecsModalTarget] = useState<number | null>(null);
  /** 커스텀어벗 설정 위저드: 1 임플란트 → 2 스캔바디|심플어벗 */
  const [customSpecsWizardStep, setCustomSpecsWizardStep] = useState<
    "implant" | "abutment"
  >("implant");
  const [customSpecsPresetEditOpen, setCustomSpecsPresetEditOpen] = useState(false);
  const customSpecsPresetEditOpenRef = useRef(false);
  /** 이번 모달에서 임플란트/스캔바디를 각각 클릭 선택했는지 */
  const customSpecsPickSessionRef = useRef({ implant: false, scanbody: false });
  const customSpecsModalSnapshotRef = useRef<{
    index: number;
    row: ToothWorkSelection;
    accountMode: AbutmentProductMode;
  } | null>(null);
  const [toothChartEnlargeOpen, setToothChartEnlargeOpen] = useState(false);
  const [archSelectModalOpen, setArchSelectModalOpen] = useState(false);
  const [archDropUpperType, setArchDropUpperType] = useState<string | null>(null);
  const [archDropLowerType, setArchDropLowerType] = useState<string | null>(null);
  const [archSelectCustomName, setArchSelectCustomName] = useState("");
  const [archSelectCustomOpen, setArchSelectCustomOpen] = useState(false);
  const [archDragType, setArchDragType] = useState<string | null>(null);
  const [archDropHover, setArchDropHover] = useState<"upper" | "lower" | null>(
    null,
  );
  const [extraRequestModalOpen, setExtraRequestModalOpen] = useState(false);
  const [extraRequestContent, setExtraRequestContent] = useState("");
  const [extraRequestLabIds, setExtraRequestLabIds] = useState<string[]>([]);
  const [extraRequestLabPickerOpen, setExtraRequestLabPickerOpen] =
    useState(false);
  const [extraRequestLabQuery, setExtraRequestLabQuery] = useState("");
  const [extraRequestSubmitting, setExtraRequestSubmitting] = useState(false);
  /** null = 투어 종료. 0..N-1 체험, N 완료 — 상위 제어 시 guideTourStep 사용 */
  const [toothWorkGuideTourStepUncontrolled, setToothWorkGuideTourStepUncontrolled] =
    useState<PracticeToothWorkGuideTourStep | null>(null);
  const guideTourStepControlled = onGuideTourStepChange != null;
  const toothWorkGuideTourStep = guideTourStepControlled
    ? (guideTourStepProp ?? null)
    : toothWorkGuideTourStepUncontrolled;
  const setToothWorkGuideTourStep = (
    next: PracticeToothWorkGuideTourStep | null,
  ) => {
    if (!guideTourStepControlled) {
      setToothWorkGuideTourStepUncontrolled(next);
    }
    onGuideTourStepChange?.(next);
  };
  /** 현재 스텝 진입 시점 스냅샷(스텝마다 갱신) */
  const toothWorkGuideTourStepBaselineRef = useRef<ToothWorkGuideTourSnapshot | null>(
    null,
  );
  /** baseline이 확정된 스텝(자동보정 settle 후) */
  const toothWorkGuideTourBaselineReadyStepRef = useRef<number | null>(null);
  /** 견적 호버(툴팁 확인) 대기 타이머 */
  const toothWorkGuideTourEstimateHoverTimerRef = useRef<number | null>(null);
  const toothWorkGuideTourStepId = getPracticeToothWorkGuideTourStepId(
    toothWorkGuideTourStep,
  );
  /** Spotlight 홀 타깃 — 플랫폼 stepId 우선(작성 패널 마운트·sync 전에도 측정 가능) */
  const oralSpotlightTargetId: string | null = platformOralActive
    ? platformGuideTour.stepId
    : toothWorkGuideTourStepId
      ? `oral_${toothWorkGuideTourStepId}`
      : null;
  const isOralSpotlight = (id: string) => oralSpotlightTargetId === id;
  const showFullToothChart = toothChartDisplayMode === "full" || toothChartEnlargeOpen;
  const showInlineToothChartHeader = !toothChartEnlargeOpen || toothChartDisplayMode === "full";
  const toothChartResetNonceRef = useRef(toothChartResetNonce);
  /** 파인더식 마키·Shift 범위 선택 / 해제 + 브리지 + 히트 */
  const toothChartRef = useRef<HTMLDivElement | null>(null);
  const toothSelectAnchorRef = useRef<string | null>(null);
  const suppressToothClickRef = useRef(false);
  /** 인레이→크라운 직후 어벗 체크박스가 같은 클릭을 받아 모달이 열리는 것 방지 */
  const suppressAbutmentCheckboxUntilRef = useRef(0);
  /** 유지장치 진입 직전 치아별 행. 브리지 등으로 복귀 시 미클릭 치아 내용 복원 */
  const linkedSpanTypeSnapshotRef = useRef<LinkedSpanProsthesisSnapshot>({});
  const toothMarqueeSessionRef = useRef<{
    pointerId: number;
    originX: number;
    originY: number;
    lastX: number;
    lastY: number;
    shiftKey: boolean;
    mode: "select" | "deselect";
    startTooth: string | null;
    startBridge: string | null;
    startWasSelected: boolean;
    selectedAtStart: Set<string>;
    moved: boolean;
    active: boolean;
    hitTeeth: Set<string>;
    /** 포인터가 실제로 지나간 + 만 브리지로 친다(마키 사각형에 낀 +는 무시) */
    paintedBridges: Set<string>;
    onMove: ((ev: PointerEvent) => void) | null;
    onUp: ((ev: PointerEvent) => void) | null;
  } | null>(null);
  const [toothMarquee, setToothMarquee] = useState<{
    originX: number;
    originY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const [toothMarqueePreview, setToothMarqueePreview] = useState<{
    mode: "select" | "deselect";
    teeth: ReadonlySet<string>;
    bridges: ReadonlySet<string>;
  } | null>(null);
  const toothCopyDragRef = useRef<{
    pointerId: number;
    sourceTooth: string;
    onMove: ((ev: PointerEvent) => void) | null;
    onUp: ((ev: PointerEvent) => void) | null;
  } | null>(null);
  const [toothCopyDrag, setToothCopyDrag] = useState<{
    sourceTooth: string;
    hoverTooth: string | null;
  } | null>(null);

  const selectedToothSet = useMemo(() => {
    const teeth = new Set<string>();
    for (const row of toothWorks) {
      const tooth = String(row.toothNumber || "").trim();
      if (/^[1-4][1-8]$/.test(tooth)) teeth.add(tooth);
    }
    return teeth;
  }, [toothWorks]);

  const applyToothChartHits = (
    mode: "select" | "deselect",
    toothNumbers: readonly string[],
    bridgeKeys: readonly string[],
  ) => {
    if (toothNumbers.length === 0 && bridgeKeys.length === 0) return;
    setCustomSpecsModalTarget((prev) => {
      if (prev === null || mode !== "deselect") return prev;
      const modalTooth = String(toothWorks[prev]?.toothNumber || "").trim();
      return toothNumbers.includes(modalTooth) ? null : prev;
    });
    setToothWorks((prev) => {
      let next = prev;
      if (mode === "select") {
        // 치아 마키로 잡힌 치아만 선택. 브리지는 양끝이 그 치아 집합 안에 있는 + 만 적용.
        // (+만 클릭/페인트한 경우는 그 양끝을 치아 집합으로 씀)
        const selectedTeeth = new Set(toothNumbers);
        const bridgesToApply: string[] = [];
        if (selectedTeeth.size === 0) {
          for (const key of bridgeKeys) {
            const [toothA, toothB] = String(key || "").split("|");
            if (!toothA || !toothB) continue;
            selectedTeeth.add(toothA);
            selectedTeeth.add(toothB);
            bridgesToApply.push(key);
          }
        } else {
          for (const key of bridgeKeys) {
            const [toothA, toothB] = String(key || "").split("|");
            if (!toothA || !toothB) continue;
            if (selectedTeeth.has(toothA) && selectedTeeth.has(toothB)) {
              bridgesToApply.push(key);
            }
          }
        }
        next = activateTeethInWorks(
          next,
          [...selectedTeeth],
          defaultProsthesisType,
          normalizedProsthesisTypes,
          { autoLinkBridgeNeighbor: false },
        );
        if (bridgesToApply.length > 0) {
          next = applyBridgeLinksInWorks(
            next,
            bridgesToApply,
            true,
            normalizedProsthesisTypes,
          );
        }
      } else {
        next = applyBridgeLinksInWorks(
          next,
          bridgeKeys,
          false,
          normalizedProsthesisTypes,
        );
        next = deactivateTeethInWorks(
          next,
          toothNumbers,
          defaultProsthesisType,
          normalizedProsthesisTypes,
        );
      }
      return next;
    });
  };

  const collectToothMarqueeHits = (
    originX: number,
    originY: number,
    currentX: number,
    currentY: number,
  ) => {
    const chart = toothChartRef.current;
    const teeth = new Set<string>();
    if (!chart) return teeth;
    const box = {
      left: Math.min(originX, currentX),
      right: Math.max(originX, currentX),
      top: Math.min(originY, currentY),
      bottom: Math.max(originY, currentY),
    };
    chart.querySelectorAll("[data-tooth-select]").forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      const tooth = node.getAttribute("data-tooth-select");
      if (!tooth) return;
      if (clientRectsIntersect(box, node.getBoundingClientRect())) teeth.add(tooth);
    });
    return teeth;
  };

  const bridgeKeyUnderPoint = (clientX: number, clientY: number) => {
    const hit = document.elementFromPoint(clientX, clientY);
    if (!(hit instanceof Element)) return null;
    return hit.closest("[data-bridge-link]")?.getAttribute("data-bridge-link") ?? null;
  };

  /** 빠른 드래그로 좁은 + 열을 건너뛰지 않도록 구간 샘플링 */
  const paintBridgesAlongSegment = (
    into: Set<string>,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
  ) => {
    const dist = Math.hypot(toX - fromX, toY - fromY);
    const steps = Math.max(1, Math.ceil(dist / 4));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const key = bridgeKeyUnderPoint(fromX + (toX - fromX) * t, fromY + (toY - fromY) * t);
      if (key) into.add(key);
    }
  };

  const endToothMarqueeListeners = () => {
    const session = toothMarqueeSessionRef.current;
    if (!session) return;
    if (session.onMove) window.removeEventListener("pointermove", session.onMove);
    if (session.onUp) {
      window.removeEventListener("pointerup", session.onUp);
      window.removeEventListener("pointercancel", session.onUp);
    }
  };

  const handleToothChartPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (isToothMarqueeBlockedTarget(event.target)) return;

    const startEl =
      event.target instanceof Element
        ? (event.target.closest("[data-tooth-select]") as HTMLElement | null)
        : null;
    const startTooth = startEl?.getAttribute("data-tooth-select") ?? null;
    const bridgeEl =
      event.target instanceof Element
        ? (event.target.closest("[data-bridge-link]") as HTMLElement | null)
        : null;
    const startBridge = bridgeEl?.getAttribute("data-bridge-link") ?? null;
    const startWasSelected = Boolean(startTooth && selectedToothSet.has(startTooth));
    const startBridgeConnected = Boolean(
      startBridge && bridgeEl?.getAttribute("data-bridge-linked") === "1",
    );
    const mode: "select" | "deselect" =
      startWasSelected || startBridgeConnected ? "deselect" : "select";

    endToothMarqueeListeners();
    const session = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      shiftKey: event.shiftKey,
      mode,
      startTooth,
      startBridge,
      startWasSelected,
      selectedAtStart: new Set(selectedToothSet),
      moved: false,
      active: false,
      hitTeeth: new Set<string>(),
      paintedBridges: new Set<string>(startBridge ? [startBridge] : []),
      onMove: null as ((ev: PointerEvent) => void) | null,
      onUp: null as ((ev: PointerEvent) => void) | null,
    };
    toothMarqueeSessionRef.current = session;

    const publishPreview = (
      nextMode: "select" | "deselect",
      teeth: Set<string>,
      paintedBridges: Set<string>,
    ) => {
      let mode = nextMode;
      const bridges = new Set<string>();
      if (teeth.size === 0) {
        for (const key of paintedBridges) bridges.add(key);
      } else {
        for (const key of paintedBridges) {
          const [toothA, toothB] = String(key || "").split("|");
          if (toothA && toothB && teeth.has(toothA) && teeth.has(toothB)) {
            bridges.add(key);
          }
        }
      }
      if (
        mode === "select" &&
        teeth.size > 0 &&
        bridges.size === 0 &&
        [...teeth].every((t) => session.selectedAtStart.has(t))
      ) {
        mode = "deselect";
      }
      session.hitTeeth = teeth;
      setToothMarqueePreview({ mode, teeth, bridges });
    };

    const onMove = (ev: PointerEvent) => {
      const current = toothMarqueeSessionRef.current;
      if (!current || current.pointerId !== ev.pointerId) return;
      const dx = ev.clientX - current.originX;
      const dy = ev.clientY - current.originY;
      if (!current.active) {
        if (Math.hypot(dx, dy) < TOOTH_MARQUEE_MOVE_THRESHOLD_PX) return;
        current.active = true;
        current.moved = true;
        suppressToothClickRef.current = true;
      }

      paintBridgesAlongSegment(
        current.paintedBridges,
        current.lastX,
        current.lastY,
        ev.clientX,
        ev.clientY,
      );
      current.lastX = ev.clientX;
      current.lastY = ev.clientY;

      const anchor = toothSelectAnchorRef.current;
      // Shift+드래그: 앵커~현재 치아 범위. 브리지는 포인터가 지나간 + 만.
      if (current.shiftKey && anchor && current.mode === "select") {
        const hit = document.elementFromPoint(ev.clientX, ev.clientY);
        const tooth =
          (hit instanceof Element
            ? hit.closest("[data-tooth-select]")?.getAttribute("data-tooth-select")
            : null) || current.startTooth;
        if (tooth) {
          const range = new Set(teethInShiftRange(anchor, tooth));
          setToothMarquee(null);
          publishPreview(current.mode, range, new Set(current.paintedBridges));
        }
        return;
      }

      const teeth = collectToothMarqueeHits(
        current.originX,
        current.originY,
        ev.clientX,
        ev.clientY,
      );
      setToothMarquee({
        originX: current.originX,
        originY: current.originY,
        currentX: ev.clientX,
        currentY: ev.clientY,
      });
      publishPreview(current.mode, teeth, new Set(current.paintedBridges));
    };

    const onUp = (ev: PointerEvent) => {
      const current = toothMarqueeSessionRef.current;
      if (!current || current.pointerId !== ev.pointerId) return;
      endToothMarqueeListeners();
      toothMarqueeSessionRef.current = null;
      setToothMarquee(null);
      setToothMarqueePreview(null);

      paintBridgesAlongSegment(
        current.paintedBridges,
        current.lastX,
        current.lastY,
        ev.clientX,
        ev.clientY,
      );
      current.lastX = ev.clientX;
      current.lastY = ev.clientY;

      if (current.moved && current.active) {
        let teeth = [...current.hitTeeth];
        const bridges = [...current.paintedBridges];
        const anchor = toothSelectAnchorRef.current;
        if (current.shiftKey && anchor && current.mode === "select") {
          const hit = document.elementFromPoint(ev.clientX, ev.clientY);
          const tooth =
            (hit instanceof Element
              ? hit.closest("[data-tooth-select]")?.getAttribute("data-tooth-select")
              : null) || current.startTooth;
          if (tooth) teeth = teethInShiftRange(anchor, tooth);
        } else {
          teeth = [
            ...collectToothMarqueeHits(
              current.originX,
              current.originY,
              ev.clientX,
              ev.clientY,
            ),
          ];
        }

        let mode = current.mode;
        // 여백에서 시작해 이미 선택된 치아만 긁으면 해제로 전환
        if (
          mode === "select" &&
          teeth.length > 0 &&
          bridges.length === 0 &&
          teeth.every((t) => current.selectedAtStart.has(t))
        ) {
          mode = "deselect";
        }

        applyToothChartHits(mode, teeth, bridges);
        if (teeth.length > 0 && mode === "select") {
          toothSelectAnchorRef.current = teeth[teeth.length - 1] ?? anchor ?? null;
        } else if (mode === "deselect" && current.startTooth) {
          if (toothSelectAnchorRef.current === current.startTooth) {
            toothSelectAnchorRef.current = null;
          }
        }
        window.setTimeout(() => {
          suppressToothClickRef.current = false;
        }, 0);
        return;
      }

      // 클릭(드래그 아님)
      if (current.startBridge) {
        const [toothA, toothB] = current.startBridge.split("|");
        if (toothA && toothB) {
          applyToothChartHits(
            current.mode,
            [],
            [current.startBridge],
          );
        }
        suppressToothClickRef.current = true;
        window.setTimeout(() => {
          suppressToothClickRef.current = false;
        }, 0);
        return;
      }

      if (current.startTooth) {
        if (current.shiftKey && toothSelectAnchorRef.current && current.mode === "select") {
          applyToothChartHits(
            "select",
            teethInShiftRange(toothSelectAnchorRef.current, current.startTooth),
            [],
          );
          toothSelectAnchorRef.current = current.startTooth;
        } else if (current.startWasSelected) {
          // 선택 카드 본체 클릭 → 해제 (형태 토글은 라벨 글자만)
          applyToothChartHits("deselect", [current.startTooth], []);
          if (toothSelectAnchorRef.current === current.startTooth) {
            toothSelectAnchorRef.current = null;
          }
        } else {
          applyToothChartHits("select", [current.startTooth], []);
          toothSelectAnchorRef.current = current.startTooth;
        }
        suppressToothClickRef.current = true;
        window.setTimeout(() => {
          suppressToothClickRef.current = false;
        }, 0);
        return;
      }
      suppressToothClickRef.current = false;
    };

    session.onMove = onMove;
    session.onUp = onUp;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  useEffect(() => {
    return () => {
      endToothMarqueeListeners();
      toothMarqueeSessionRef.current = null;
      const copySession = toothCopyDragRef.current;
      if (copySession?.onMove) {
        window.removeEventListener("pointermove", copySession.onMove);
      }
      if (copySession?.onUp) {
        window.removeEventListener("pointerup", copySession.onUp);
        window.removeEventListener("pointercancel", copySession.onUp);
      }
      toothCopyDragRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount cleanup only
  }, []);

  const endToothCopyDragListeners = () => {
    const session = toothCopyDragRef.current;
    if (!session) return;
    if (session.onMove) window.removeEventListener("pointermove", session.onMove);
    if (session.onUp) {
      window.removeEventListener("pointerup", session.onUp);
      window.removeEventListener("pointercancel", session.onUp);
    }
  };

  const resolveToothUnderPoint = (clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY);
    if (!(el instanceof Element)) return null;
    const tooth = el.closest("[data-tooth-select]")?.getAttribute("data-tooth-select");
    const trimmed = String(tooth || "").trim();
    return /^[1-4][1-8]$/.test(trimmed) ? trimmed : null;
  };

  const beginToothCopyDrag = (
    event: ReactPointerEvent,
    sourceTooth: string,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const source = String(sourceTooth || "").trim();
    if (!/^[1-4][1-8]$/.test(source)) return;
    if (!selectedToothSet.has(source)) return;

    endToothCopyDragListeners();
    suppressToothClickRef.current = true;

    const session: {
      pointerId: number;
      sourceTooth: string;
      onMove: ((ev: PointerEvent) => void) | null;
      onUp: ((ev: PointerEvent) => void) | null;
    } = {
      pointerId: event.pointerId,
      sourceTooth: source,
      onMove: null,
      onUp: null,
    };

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== session.pointerId) return;
      const hoverTooth = resolveToothUnderPoint(ev.clientX, ev.clientY);
      setToothCopyDrag((prev) => {
        if (!prev) return prev;
        if (prev.hoverTooth === hoverTooth) return prev;
        return { ...prev, hoverTooth };
      });
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== session.pointerId) return;
      endToothCopyDragListeners();
      toothCopyDragRef.current = null;
      const targetTooth = resolveToothUnderPoint(ev.clientX, ev.clientY);
      setToothCopyDrag(null);
      if (targetTooth && targetTooth !== session.sourceTooth) {
        setToothWorks((prev) =>
          copyToothWorkContentToTooth(
            prev,
            session.sourceTooth,
            targetTooth,
            defaultProsthesisType,
            normalizedProsthesisTypes,
            lockedMode,
          ),
        );
        toothSelectAnchorRef.current = targetTooth;
      }
      window.setTimeout(() => {
        suppressToothClickRef.current = false;
      }, 0);
    };

    session.onMove = onMove;
    session.onUp = onUp;
    toothCopyDragRef.current = session;
    setToothCopyDrag({ sourceTooth: source, hoverTooth: null });
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const renderToothCopyHandle = (toothNumber: string, canDrag: boolean) => {
    const isSource = toothCopyDrag?.sourceTooth === toothNumber;
    return (
      <span
        data-no-tooth-marquee=""
        data-tooth-copy-handle={toothNumber}
        className={cn(
          "relative z-20 mt-auto mb-0.5 inline-flex shrink-0 select-none items-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none tracking-tight transition-colors",
          canDrag
            ? "cursor-grab border border-primary-muted/80 bg-primary-soft text-primary-strong shadow-sm hover:border-primary/70 hover:bg-primary/15 hover:text-primary-strong active:cursor-grabbing"
            : "cursor-default border border-transparent bg-slate-100/70 text-slate-400",
          isSource && "opacity-40",
          toothWorkGuideTourStepId === "card_ops" && canDrag && "practice-tooth-guide-pulse",
        )}
        title={canDrag ? "드래그해서 다른 치아에 복사" : undefined}
        onPointerDown={
          canDrag
            ? (event) => beginToothCopyDrag(event, toothNumber)
            : undefined
        }
      >
        복사
      </span>
    );
  };

  useEffect(() => {
    let overlayPointer = false;
    const onPointerDown = (event: PointerEvent) => {
      if (!isToothOverlayUiTarget(event.target)) return;
      overlayPointer = true;
      suppressToothClickRef.current = true;
    };
    const onPointerUp = () => {
      if (!overlayPointer) return;
      overlayPointer = false;
      // 복사 드래그는 beginToothCopyDrag가 suppress 생명주기를 담당
      if (toothCopyDragRef.current) return;
      window.setTimeout(() => {
        suppressToothClickRef.current = false;
      }, 0);
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onPointerUp, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerUp, true);
    };
  }, []);

  useEffect(() => {
    if (toothChartResetNonceRef.current === toothChartResetNonce) return;
    toothChartResetNonceRef.current = toothChartResetNonce;
    linkedSpanTypeSnapshotRef.current = {};
  }, [toothChartResetNonce]);

  useEffect(() => {
    linkedSpanTypeSnapshotRef.current = pruneLinkedSpanProsthesisSnapshot(
      linkedSpanTypeSnapshotRef.current,
      toothWorks,
    );
  }, [toothWorks]);

  const requestedToothCount = useMemo(() => {
    const teeth = new Set<string>();
    for (const row of toothWorks) {
      const tooth = String(row.toothNumber || "").trim();
      if (/^[1-4][1-8]$/.test(tooth)) teeth.add(tooth);
    }
    return teeth.size;
  }, [toothWorks]);

  const exitToothWorkGuideTour = () => {
    if (toothWorkGuideTourEstimateHoverTimerRef.current != null) {
      window.clearTimeout(toothWorkGuideTourEstimateHoverTimerRef.current);
      toothWorkGuideTourEstimateHoverTimerRef.current = null;
    }
    toothWorkGuideTourStepBaselineRef.current = null;
    toothWorkGuideTourBaselineReadyStepRef.current = null;
    if (platformGuideTour.active && isPracticeToothWorkOralStepId(platformGuideTour.stepId)) {
      platformGuideTour.pause();
      return;
    }
    setToothWorkGuideTourStep(null);
  };

  const goToothWorkGuideTourStep = (next: PracticeToothWorkGuideTourStep) => {
    if (toothWorkGuideTourEstimateHoverTimerRef.current != null) {
      window.clearTimeout(toothWorkGuideTourEstimateHoverTimerRef.current);
      toothWorkGuideTourEstimateHoverTimerRef.current = null;
    }
    toothWorkGuideTourBaselineReadyStepRef.current = null;
    if (
      platformOralActive &&
      toothWorkGuideTourStep != null &&
      next === toothWorkGuideTourStep + 1
    ) {
      platformGuideTour.advance();
      return;
    }
    if (
      platformOralActive &&
      next >= PRACTICE_TOOTH_WORK_GUIDE_TOUR_DONE_STEP
    ) {
      platformGuideTour.advance();
      return;
    }
    setToothWorkGuideTourStep(next);
  };

  const startToothWorkGuideTour = () => {
    setToothChartEnlargeOpen(false);
    toothWorkGuideTourStepBaselineRef.current = null;
    toothWorkGuideTourBaselineReadyStepRef.current = null;
    setToothWorkGuideTourStep(0);
  };

  // 플랫폼 가이드투어 oral 챕터 → 패널 스텝 동기화
  useEffect(() => {
    if (platformOralActive && platformGuideTour.oralSubStepIndex != null) {
      setToothChartEnlargeOpen(false);
      toothWorkGuideTourStepBaselineRef.current = null;
      toothWorkGuideTourBaselineReadyStepRef.current = null;
      setToothWorkGuideTourStep(platformGuideTour.oralSubStepIndex);
      return;
    }
    if (!isPracticeToothWorkOralStepId(platformGuideTour.stepId)) {
      setToothWorkGuideTourStep(null);
    }
  }, [
    platformOralActive,
    platformGuideTour.oralSubStepIndex,
    platformGuideTour.stepId,
  ]);

  // 치식 투어 스텝 — 작성 패널을 내려 상·하악이 보이게(Spotlight보다 패널 ref가 확실)
  useLayoutEffect(() => {
    if (
      !toothWorkGuideTourStepId ||
      !(TOOTH_CHART_GUIDE_STEP_IDS as readonly string[]).includes(
        toothWorkGuideTourStepId,
      )
    ) {
      return;
    }
    const run = () =>
      scrollToothChartGuideTargetIntoView(toothChartRef.current);
    run();
    const timers = [40, 160, 360].map((ms) => window.setTimeout(run, ms));
    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, [toothWorkGuideTourStepId]);

  useEffect(() => {
    onGuideTourActiveChange?.(toothWorkGuideTourStep != null);
  }, [toothWorkGuideTourStep, onGuideTourActiveChange]);

  const guideTourStartSignalPrevRef = useRef(guideTourStartSignal);
  useEffect(() => {
    if (guideTourStartSignal === guideTourStartSignalPrevRef.current) return;
    guideTourStartSignalPrevRef.current = guideTourStartSignal;
    if (guideTourStartSignal <= 0) return;
    startToothWorkGuideTour();
  }, [guideTourStartSignal]);

  const guideTourExitSignalPrevRef = useRef(guideTourExitSignal);
  useEffect(() => {
    if (guideTourExitSignal === guideTourExitSignalPrevRef.current) return;
    guideTourExitSignalPrevRef.current = guideTourExitSignal;
    if (guideTourExitSignal <= 0) return;
    exitToothWorkGuideTour();
  }, [guideTourExitSignal]);

  const completeToothWorkGuideTourAction = () => {
    if (toothWorkGuideTourStep == null) return;
    if (toothWorkGuideTourStep >= PRACTICE_TOOTH_WORK_GUIDE_TOUR_DONE_STEP) return;
    if (platformOralActive) {
      platformGuideTour.advance();
      return;
    }
    goToothWorkGuideTourStep(toothWorkGuideTourStep + 1);
  };

  // 스텝 진입 후 형태 자동보정 등이 끝난 뒤 baseline 확정
  useEffect(() => {
    if (toothWorkGuideTourStep == null) return;
    if (toothWorkGuideTourBaselineReadyStepRef.current === toothWorkGuideTourStep) return;
    const timer = window.setTimeout(() => {
      toothWorkGuideTourStepBaselineRef.current =
        captureToothWorkGuideTourSnapshot(toothWorks);
      toothWorkGuideTourBaselineReadyStepRef.current = toothWorkGuideTourStep;
    }, 60);
    return () => window.clearTimeout(timer);
  }, [toothWorkGuideTourStep, toothWorks]);

  // 체험형 투어: 선택·해제·브리지·복사·어벗·프리셋은 치식 상태 변화로 진행
  // 플랫폼 영화형 투어는 이전/다음만 — 자동 advance 끔
  useEffect(() => {
    if (platformOralActive) return;
    if (toothWorkGuideTourStep == null) return;
    if (toothWorkGuideTourBaselineReadyStepRef.current !== toothWorkGuideTourStep) return;
    const stepId = getPracticeToothWorkGuideTourStepId(toothWorkGuideTourStep);
    if (!stepId) return;
    const baseline = toothWorkGuideTourStepBaselineRef.current;
    if (!baseline) return;
    const current = captureToothWorkGuideTourSnapshot(toothWorks);

    if (stepId === "card_ops") {
      if (
        current.contentKey !== baseline.contentKey ||
        [...current.teeth].some((tooth) => !baseline.teeth.has(tooth)) ||
        [...baseline.teeth].some((tooth) => !current.teeth.has(tooth)) ||
        [...current.bridges].some((key) => !baseline.bridges.has(key))
      ) {
        // 로컬 폴백만 — 플랫폼은 Spotlight「다음」
        goToothWorkGuideTourStep(toothWorkGuideTourStep + 1);
      }
    }
  }, [toothWorkGuideTourStep, toothWorks, platformOralActive]);

  // 기공소 · 환자명 · 날짜 — 플랫폼 영화형에서는 스킵(프리필+다음)
  useEffect(() => {
    if (platformOralActive) return;
    if (toothWorkGuideTourStep == null) return;
    if (toothWorkGuideTourStepId === "header" && !showLabField && !showPatientField && !showDateFields) {
      goToothWorkGuideTourStep(toothWorkGuideTourStep + 1);
    }
  }, [
    toothWorkGuideTourStep,
    toothWorkGuideTourStepId,
    showLabField,
    showPatientField,
    showDateFields,
    platformOralActive,
  ]);

  /**
   * 기공소·환자 투어 — 이미 유효한 값이 있으면「값 변경」후에만 진행.
   * 플랫폼 영화형에서는 사용하지 않음.
   */
  const [guideTourLabArmed, setGuideTourLabArmed] = useState(false);
  const guideTourLabRequireSelectRef = useRef(false);
  const guideTourLabConfirmedRef = useRef(false);
  /** 뒤로+이미선택 시 팝오버 강제 오픈 생략(다이얼로그 위 겹침·즉시 3 재진입 방지) */
  const guideTourLabSkipForceOpenRef = useRef(false);
  const guideTourPatientBaselineRef = useRef<string | null>(null);
  const guideTourPatientRequireChangeRef = useRef(false);
  const guideTourPrevStepRef = useRef<PracticeToothWorkGuideTourStep | null>(null);

  useEffect(() => {
    if (platformOralActive) return;
    const prev = guideTourPrevStepRef.current;
    guideTourPrevStepRef.current = toothWorkGuideTourStep;
    const wentBack =
      prev != null &&
      toothWorkGuideTourStep != null &&
      toothWorkGuideTourStep < prev;

    if (toothWorkGuideTourStepId === "header" && toothWorkGuideTourStep != null) {
      const hadLab = Boolean(String(selectedLab?._id || "").trim());
      guideTourLabConfirmedRef.current = false;
      guideTourLabRequireSelectRef.current = wentBack || hadLab;
      guideTourLabSkipForceOpenRef.current = wentBack && hadLab;
      const name = String(patientName || "").trim();
      guideTourPatientBaselineRef.current = name;
      guideTourPatientRequireChangeRef.current = wentBack || /[가-힣]/.test(name);
    } else {
      guideTourLabRequireSelectRef.current = false;
      guideTourLabConfirmedRef.current = false;
      guideTourLabSkipForceOpenRef.current = false;
      guideTourPatientBaselineRef.current = null;
      guideTourPatientRequireChangeRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 스텝 전환 시 스냅샷만
  }, [toothWorkGuideTourStep, toothWorkGuideTourStepId, platformOralActive]);

  useEffect(() => {
    if (platformOralActive) return;
    if (toothWorkGuideTourStepId !== "header") {
      setGuideTourLabArmed(false);
      return;
    }
    if (toothWorkGuideTourStep == null) return;
    if (!showLabField) return;
    setGuideTourLabArmed(false);
    if (guideTourLabSkipForceOpenRef.current) {
      setLabOpen(false);
    } else {
      setLabOpen(true);
    }
    const t = window.setTimeout(() => {
      setGuideTourLabArmed(true);
    }, 120);
    return () => {
      window.clearTimeout(t);
      setGuideTourLabArmed(false);
      setLabOpen(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 스텝 진입 시 1회
  }, [
    toothWorkGuideTourStep,
    toothWorkGuideTourStepId,
    showLabField,
    setLabOpen,
    platformOralActive,
  ]);

  useEffect(() => {
    if (platformOralActive) return;
    if (toothWorkGuideTourStepId !== "header") return;
    if (toothWorkGuideTourStep == null) return;
    if (!guideTourLabArmed) return;
    if (labOpen) return;
    if (!selectedLab) return;
    if (
      guideTourLabRequireSelectRef.current &&
      !guideTourLabConfirmedRef.current
    ) {
      return;
    }
    const labId = String(selectedLab._id || "").trim();
    const ok =
      isAutoMatchLab(selectedLab) ||
      isPinnedAbutsRecentLab(selectedLab) ||
      /^[a-fA-F0-9]{24}$/.test(labId);
    if (!ok) return;
    goToothWorkGuideTourStep(toothWorkGuideTourStep + 1);
  }, [
    toothWorkGuideTourStep,
    toothWorkGuideTourStepId,
    selectedLab,
    labOpen,
    guideTourLabArmed,
    platformOralActive,
  ]);

  const selectLabFromPicker = (b: SearchBusinessResult) => {
    setSelectedLab(b);
    if (toothWorkGuideTourStepId === "header") {
      guideTourLabConfirmedRef.current = true;
    }
    setLabOpen(false);
  };

  /**
   * 환자명 투어 — 플랫폼 영화형에서는 Spotlight「다음」만.
   */
  const GUIDE_TOUR_PATIENT_IDLE_MS = 2000;

  const tryCompletePatientGuideTourStep = () => {
    if (platformOralActive) return;
    if (toothWorkGuideTourStepId !== "header") return;
    if (toothWorkGuideTourStep == null) return;
    const name = String(patientName || "").trim();
    if (!/[가-힣]/.test(name)) return;
    if (guideTourPatientRequireChangeRef.current) {
      if (name === (guideTourPatientBaselineRef.current ?? "")) return;
    }
    guideTourPatientRequireChangeRef.current = true;
    guideTourPatientBaselineRef.current = name;
    goToothWorkGuideTourStep(toothWorkGuideTourStep + 1);
  };

  useEffect(() => {
    if (platformOralActive) return;
    if (toothWorkGuideTourStepId !== "header") return;
    if (toothWorkGuideTourStep == null) return;
    const name = String(patientName || "").trim();
    if (!/[가-힣]/.test(name)) return;
    if (guideTourPatientRequireChangeRef.current) {
      if (name === (guideTourPatientBaselineRef.current ?? "")) return;
    }
    const t = window.setTimeout(() => {
      tryCompletePatientGuideTourStep();
    }, GUIDE_TOUR_PATIENT_IDLE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- patientName 변경 시 idle 재시작
  }, [toothWorkGuideTourStep, toothWorkGuideTourStepId, patientName, platformOralActive]);

  const completeDatesGuideTourStep = () => {
    if (platformOralActive) return;
    if (toothWorkGuideTourStepId !== "header") return;
    if (toothWorkGuideTourStep == null) return;
    goToothWorkGuideTourStep(toothWorkGuideTourStep + 1);
  };

  // 연결 여부 ↔ 형태(인레이/크라운/커스텀어벗/임시치아 vs 브리지/작업X/유지장치/임시치아) 불일치 보정 (드래프트·구버전 데이터)
  const toothWorkLinkTypeMismatch = useMemo(() => {
    return toothWorks.some((row) => {
      const links = collectAdjacentBridgeLinks(toothWorks, row.toothNumber);
      const isLinked = links.length > 0;
      const prevType = String(row.prosthesisType || "").trim();
      const prevLinks = Array.isArray(row.bridgeLinkedTeeth) ? row.bridgeLinkedTeeth : [];
      const linksChanged =
        links.length !== prevLinks.length ||
        links.some((t) => !prevLinks.includes(t)) ||
        prevLinks.some((t) => !links.includes(t));
      if (!prevType && !isLinked) return linksChanged;
      const resolved = resolveProsthesisTypeForLinkState(
        prevType,
        isLinked,
        normalizedProsthesisTypes,
        row.customAbutment || isCustomAbutmentProsthesisType(prevType),
      );
      return resolved !== prevType || linksChanged;
    });
  }, [normalizedProsthesisTypes, toothWorks]);

  useEffect(() => {
    if (!toothWorkLinkTypeMismatch) return;
    setToothWorks((prev) => {
      let changed = false;
      const next = prev.map((row) => {
        const links = collectAdjacentBridgeLinks(prev, row.toothNumber);
        const isLinked = links.length > 0;
        const prevType = String(row.prosthesisType || "").trim();
        const prosthesisType =
          !prevType && !isLinked
            ? prevType
            : resolveProsthesisTypeForLinkState(
                prevType,
                isLinked,
                normalizedProsthesisTypes,
                row.customAbutment || isCustomAbutmentProsthesisType(prevType),
              );
        const prevLinks = Array.isArray(row.bridgeLinkedTeeth) ? row.bridgeLinkedTeeth : [];
        const linksChanged =
          links.length !== prevLinks.length ||
          links.some((t) => !prevLinks.includes(t)) ||
          prevLinks.some((t) => !links.includes(t));
        if (prosthesisType === prevType && !linksChanged) return row;
        changed = true;
        return {
          ...applyIntakeProsthesisType(row, prosthesisType),
          bridgeLinkedTeeth: isLinked ? links : [],
        };
      });
      return changed ? next : prev;
    });
  }, [defaultAbutmentProductMode, normalizedProsthesisTypes, setToothWorks, toothWorkLinkTypeMismatch]);
  const isMemoSnippetsControlled = typeof onMemoSnippetsChange === "function";
  const [localMemoSnippets, setLocalMemoSnippets] = useState<string[]>(() => loadLocalMemoSnippets());
  const [suggestLineIndex, setSuggestLineIndex] = useState<number | null>(null);
  const [suggestActiveIndex, setSuggestActiveIndex] = useState(0);
  const memoInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const pendingFocusLineRef = useRef<number | null>(null);
  // 한글 IME: compositionend 직후 keydown에서 isComposing이 이미 false인 경우가 있어 ref로 한 틱 더 막습니다.
  const memoComposingRef = useRef(false);
  const patientComposingRef = useRef(false);
  // 조합 중 Enter → 조합 확정 후 줄바꿈 (글자가 다음 줄로 가는 것 방지)
  const pendingMemoNewlineIndexRef = useRef<number | null>(null);
  const suppressMemoEnterRef = useRef(false);

  const reportImeComposing = () => {
    onImeComposingChange?.(patientComposingRef.current || memoComposingRef.current);
  };

  const openCustomSpecsModal = (index: number) => {
    // 치식 투어 중에는 모달을 열지 않음 — 투어 홀(치식)이 모달 하단을 가로지르는 잘림 방지
    if (
      toothWorkGuideTourStep != null &&
      toothWorkGuideTourStepId &&
      (TOOTH_CHART_GUIDE_STEP_IDS as readonly string[]).includes(
        toothWorkGuideTourStepId,
      )
    ) {
      return;
    }
    const current = toothWorks[index];
    if (current) {
      const snapshotRow = clearSimpleAbutmentIfCustomProsthesis({
        ...current,
        bridgeLinkedTeeth: [...(current.bridgeLinkedTeeth || [])],
      });
      customSpecsModalSnapshotRef.current = {
        index,
        row: snapshotRow,
        accountMode: defaultAbutmentProductMode,
      };
    } else {
      customSpecsModalSnapshotRef.current = null;
    }
    customSpecsPresetEditOpenRef.current = false;
    customSpecsPickSessionRef.current = { implant: false, scanbody: false };
    setCustomSpecsPresetEditOpen(false);
      setCustomSpecsWizardStep(
      toothWorkGuideTourStepId === "custom_abut" ? "implant" : "implant",
    );
    setToothWorks((prev) => {
      const row = prev[index];
      if (!row) return prev;
      const canEnable =
        row.customAbutment ||
        isCustomAbutmentSupportedProsthesisType(row.prosthesisType);
      if (!canEnable) return prev;
      const nextMode = lockedMode
        ? lockedMode
        : isAbutmentProductMode(row.abutmentProductMode)
          ? row.abutmentProductMode
          : defaultAbutmentProductMode;
      const cleared = clearSimpleAbutmentIfCustomProsthesis(row);
      const clearedSimple =
        cleared.abutmentManufacturer !== row.abutmentManufacturer ||
        cleared.abutmentDiameter !== row.abutmentDiameter ||
        cleared.abutmentHeight !== row.abutmentHeight;
      if (
        row.customAbutment &&
        row.abutmentProductMode === nextMode &&
        !clearedSimple
      ) {
        return prev;
      }
      const next = [...prev];
      next[index] = {
        ...cleared,
        customAbutment: true,
        abutmentProductMode: nextMode,
      };
      return next;
    });
    setCustomSpecsModalTarget(index);
  };

  const closeCustomSpecsModal = () => {
    customSpecsPresetEditOpenRef.current = false;
    customSpecsPickSessionRef.current = { implant: false, scanbody: false };
    setCustomSpecsPresetEditOpen(false);
    setCustomSpecsWizardStep("implant");
    setCustomSpecsModalTarget(null);
  };

  const restoreCustomSpecsModalSnapshot = () => {
    const snap = customSpecsModalSnapshotRef.current;
    if (!snap) return;
    customSpecsModalSnapshotRef.current = null;
    setToothWorks((prev) => {
      if (!prev[snap.index]) return prev;
      const next = [...prev];
      next[snap.index] = snap.row;
      return next;
    });
    if (snap.accountMode !== defaultAbutmentProductMode) {
      void onDefaultAbutmentProductModeChange?.(snap.accountMode);
    }
  };

  const cancelCustomSpecsModal = () => {
    restoreCustomSpecsModalSnapshot();
    closeCustomSpecsModal();
  };

  const confirmCustomSpecsModal = () => {
    customSpecsModalSnapshotRef.current = null;
    closeCustomSpecsModal();
  };

  const isPresetGuideTourStep = toothWorkGuideTourStepId === "custom_abut";

  // 치식·헤더 투어 스텝에서는 커스텀어벗 모달을 강제 닫기(보철물 선택 홀이 모달을 가로지르는 문제)
  const blockCustomSpecsModalForTour =
    toothWorkGuideTourStep != null &&
    Boolean(
      toothWorkGuideTourStepId &&
        ((TOOTH_CHART_GUIDE_STEP_IDS as readonly string[]).includes(
          toothWorkGuideTourStepId,
        ) ||
          toothWorkGuideTourStepId === "header" ||
          toothWorkGuideTourStepId === "memo_files" ||
          toothWorkGuideTourStepId === "prosthesis"),
    );

  useLayoutEffect(() => {
    if (!blockCustomSpecsModalForTour) return;
    if (customSpecsModalTarget === null) return;
    confirmCustomSpecsModal();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 모달 오픈 직후 프리셋 스텝은 유지
  }, [blockCustomSpecsModalForTour, customSpecsModalTarget]);

  // 견적 스텝으로 들어올 때만 모달 닫기(하이라이트가 모달에 가려지지 않게).
  useEffect(() => {
    if (toothWorkGuideTourStepId !== "estimate") return;
    if (customSpecsModalTarget === null) return;
    confirmCustomSpecsModal();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 견적 스텝 진입만
  }, [toothWorkGuideTourStepId]);

  // 커스텀어벗 체험 중 설정 모달이 닫혀 있으면 열어 모달 안에서 이어간다.
  useEffect(() => {
    if (!isPresetGuideTourStep) return;
    if (customSpecsModalTarget !== null) return;
    const findPresetTourToothIndex = () => {
      const eligible = toothWorks.findIndex((row) => {
        const tooth = String(row.toothNumber || "").trim();
        if (!/^[1-4][1-8]$/.test(tooth)) return false;
        return (
          row.customAbutment ||
          isCustomAbutmentProsthesisType(row.prosthesisType) ||
          isCustomAbutmentSupportedProsthesisType(row.prosthesisType)
        );
      });
      if (eligible >= 0) return eligible;
      return toothWorks.findIndex((row) =>
        /^[1-4][1-8]$/.test(String(row.toothNumber || "").trim()),
      );
    };
    const index = findPresetTourToothIndex();
    if (index < 0) return;
    const timer = window.setTimeout(() => {
      openCustomSpecsModal(index);
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openCustomSpecsModal은 스텝·치식 스냅샷에 묶음
  }, [isPresetGuideTourStep, customSpecsModalTarget, toothWorks]);

  // 가이드투어 커스텀어벗 스텝 — 위저드 시작은 임플란트
  useEffect(() => {
    if (customSpecsModalTarget === null) return;
    if (toothWorkGuideTourStepId === "custom_abut") {
      setCustomSpecsWizardStep("implant");
    }
  }, [toothWorkGuideTourStepId, customSpecsModalTarget]);

  const tryConfirmCustomSpecsModalAfterPicks = () => {
    if (customSpecsPresetEditOpenRef.current) return;
    const { implant, scanbody } = customSpecsPickSessionRef.current;
    if (!implant || !scanbody) return;
    confirmCustomSpecsModal();
  };

  const setCustomSpecsPresetEditOpenSafe = (open: boolean) => {
    customSpecsPresetEditOpenRef.current = open;
    setCustomSpecsPresetEditOpen(open);
    if (open) onPresetEditorOpen?.();
    if (!open) tryConfirmCustomSpecsModalAfterPicks();
  };

  const registerCustomSpecsPick = (kind: "implant" | "scanbody" | "both") => {
    const prev = customSpecsPickSessionRef.current;
    customSpecsPickSessionRef.current = {
      implant: prev.implant || kind === "implant" || kind === "both",
      scanbody: prev.scanbody || kind === "scanbody" || kind === "both",
    };
    tryConfirmCustomSpecsModalAfterPicks();
  };

  const patchCustomSpecsOnTooth = (
    index: number,
    patch: Partial<ReturnType<typeof emptyToothWorkCustomSpecs>>,
  ) => {
    const row = toothWorks[index];
    if (!row) return;
    const customProsthesis = isCustomAbutmentProsthesisType(row.prosthesisType);
    // 커스텀어벗 보철 형태에서는 심플어벗 패치 무시
    if (
      customProsthesis &&
      ("abutmentManufacturer" in patch ||
        "abutmentDiameter" in patch ||
        "abutmentHeight" in patch) &&
      isSimpleAbutmentMode({ ...row, ...patch })
    ) {
      patch = { ...patch, ...emptyToothWorkAbutment() };
    }
    const merged = {
      ...pickToothWorkCustomSpecs(row, true),
      ...patch,
    };
    const implantTouched = (
      ["implantManufacturer", "implantBrand", "implantFamily", "implantType"] as const
    ).some((key) => key in patch);
    const scanbodyTouched = (
      ["abutmentManufacturer", "abutmentDiameter", "abutmentHeight"] as const
    ).some((key) => key in patch);
    const abutmentSideComplete = hasToothWorkAbutmentSidePreset({
      ...row,
      ...merged,
    });
    setToothWorks((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      next[index] = {
        ...current,
        customAbutment: true,
        ...merged,
      };
      return next;
    });
    if (implantTouched && scanbodyTouched && abutmentSideComplete) {
      registerCustomSpecsPick("both");
      setCustomSpecsWizardStep("abutment");
    } else if (implantTouched) {
      registerCustomSpecsPick("implant");
      if (hasToothWorkImplantPreset({ ...row, ...merged })) {
        setCustomSpecsWizardStep("abutment");
      }
    } else if (scanbodyTouched && abutmentSideComplete) {
      registerCustomSpecsPick("scanbody");
    }
  };

  useEffect(() => {
    if (isMemoSnippetsControlled) return;
    setLocalMemoSnippets(loadLocalMemoSnippets());
  }, [isMemoSnippetsControlled]);

  const memoSnippets = useMemo(
    () =>
      normalizeMemoSnippets(
        isMemoSnippetsControlled ? memoSnippetsProp || [] : localMemoSnippets,
      ),
    [isMemoSnippetsControlled, localMemoSnippets, memoSnippetsProp],
  );

  const memoLines = useMemo(() => {
    if (!String(requestMemo || "").length) return [""];
    return String(requestMemo).split("\n");
  }, [requestMemo]);

  useEffect(() => {
    const focusIndex = pendingFocusLineRef.current;
    if (focusIndex === null) return;
    pendingFocusLineRef.current = null;
    // 포커스를 바로 옮기면 조합 중이던 글자가 새 input에 들어가므로 IME 커밋 이후로 미룹니다.
    const timer = window.setTimeout(() => {
      const input = memoInputRefs.current[focusIndex];
      if (input) {
        input.focus();
        const len = input.value.length;
        input.setSelectionRange(len, len);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [memoLines]);

  const syncMemoLines = (nextLines: string[]) => {
    setRequestMemo(nextLines.join("\n"));
  };

  const insertMemoNewlineAfter = (index: number, currentValue: string) => {
    const prev = String(requestMemo || "");
    const nextLines = prev.length ? prev.split("\n") : [""];
    while (nextLines.length <= index) nextLines.push("");
    nextLines[index] = currentValue;
    nextLines.splice(index + 1, 0, "");
    pendingFocusLineRef.current = index + 1;
    syncMemoLines(nextLines);
  };

  const isNativeImeComposing = (e: KeyboardEvent<HTMLInputElement>) =>
    e.nativeEvent.isComposing || e.keyCode === 229;

  const handleDeleteMemoLine = (index: number) => {
    if (memoLines.length <= 1) {
      syncMemoLines([""]);
      pendingFocusLineRef.current = 0;
      return;
    }
    const nextLines = memoLines.filter((_, idx) => idx !== index);
    syncMemoLines(nextLines.length ? nextLines : [""]);
    pendingFocusLineRef.current = Math.max(0, index - 1);
  };

  const commitMemoSnippets = (nextRaw: string[]) => {
    const next = normalizeMemoSnippets(nextRaw);
    persistLocalMemoSnippets(next);
    if (isMemoSnippetsControlled) {
      void onMemoSnippetsChange?.(next);
      return;
    }
    setLocalMemoSnippets(next);
  };

  const rememberMemoSentence = (sentence: string) => {
    const text = String(sentence || "").trim();
    if (!text) return;
    const without = memoSnippets.filter((item) => item.toLowerCase() !== text.toLowerCase());
    commitMemoSnippets([text, ...without]);
  };

  const closeMemoSuggestions = () => {
    setSuggestLineIndex(null);
    setSuggestActiveIndex(0);
  };

  const openMemoSuggestions = (lineIndex: number, lineValue: string) => {
    const matches = filterMemoSuggestions(lineValue, memoSnippets);
    if (matches.length === 0) {
      closeMemoSuggestions();
      return;
    }
    setSuggestLineIndex(lineIndex);
    setSuggestActiveIndex(0);
  };

  const applyMemoSuggestion = (lineIndex: number, snippet: string) => {
    const text = String(snippet || "").trim();
    if (!text) return;
    const nextLines = [...memoLines];
    while (nextLines.length <= lineIndex) nextLines.push("");
    nextLines[lineIndex] = text;
    syncMemoLines(nextLines);
    rememberMemoSentence(text);
    closeMemoSuggestions();
    pendingFocusLineRef.current = lineIndex;
  };

  const suggestionsForActiveLine =
    suggestLineIndex === null
      ? []
      : filterMemoSuggestions(memoLines[suggestLineIndex] || "", memoSnippets);

  const memoOnly =
    showMemoSection && !showHeaderFields && !showProsthesisSection;

  const showAnyHeaderFields = showLabField || showPatientField || showDateFields;
  const headerFieldCount =
    Number(showLabField) + Number(showPatientField) + Number(showDateFields);
  const headerGridClassName =
    headerFieldCount <= 1
      ? "grid grid-cols-1 items-end gap-3 max-w-lg"
      : headerFieldCount === 2
        ? "grid grid-cols-1 items-end gap-3"
        : "grid grid-cols-1 items-end gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.7fr)_minmax(0,0.95fr)]";

  const isHeaderTourStep =
    toothWorkGuideTourStep != null && toothWorkGuideTourStepId === "header";
  /** 기공소·환자·날짜 투어는 오른쪽 레일 */
  const reserveAsideChrome = Boolean(headerToolbar) || reserveGuideTourAside;
  const useAsideTourRail =
    reserveAsideChrome &&
    toothWorkGuideTourStep != null &&
    isHeaderTourStep;
  const asideTourBanner =
    useAsideTourRail && !platformOralActive ? (
    <PracticeToothWorkGuideTourBanner
      placement="aside"
      step={toothWorkGuideTourStep}
      onExit={exitToothWorkGuideTour}
      onFinish={exitToothWorkGuideTour}
    />
  ) : null;
  const portaledHeaderTour =
    isHeaderTourStep &&
    !useAsideTourRail &&
    !platformOralActive &&
    guideTourHeaderSlotEl ? (
      createPortal(
        <PracticeToothWorkGuideTourBanner
          placement="aside"
          step={toothWorkGuideTourStep!}
          onExit={exitToothWorkGuideTour}
          onFinish={exitToothWorkGuideTour}
        />,
        guideTourHeaderSlotEl,
      )
    ) : null;
  /**
   * PC 툴바 크롬(또는 reserve)이면 오른쪽 레일(투어·단계) 자리를 항상 예약.
   * 카드가 없어도 기공소·환자명·주문-치과도착 폭/위치가 투어 on과 같게 유지된다.
   */
  const showRightRail = Boolean(
    reserveAsideChrome || asideTourBanner,
  );

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col",
        showProsthesisSection || showMemoSection || besideMemoContent
          ? "gap-10"
          : "gap-4",
        memoOnly && "h-full flex-1",
        variant === "card" &&
          "rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-white to-primary-soft/60 p-4 shadow-[0_4px_12px_rgba(15,23,42,0.03)] transition-all hover:shadow-[0_8px_20px_rgba(15,23,42,0.06)]",
        className,
      )}
    >
      {showAnyHeaderFields && onClearAll ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-lg border-slate-200 bg-white"
            onClick={onClearAll}
          >
            전체삭제
          </Button>
        </div>
      ) : null}

      {showAnyHeaderFields || headerToolbar || headerIntro || showRightRail ? (
        <>
          {portaledHeaderTour}
          {headerToolbar ? (
            <div className="mb-7 flex w-full min-w-0 flex-wrap items-center gap-2">
              {headerToolbar}
            </div>
          ) : null}
          <div
            className={cn(
              showRightRail
                ? "grid grid-cols-1 items-start gap-x-12 gap-y-7 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)]"
                : "flex flex-col gap-y-7",
            )}
          >
            <div className="flex min-w-0 flex-col gap-y-7">
              {headerIntro ? headerIntro : null}
              {showAnyHeaderFields ? (
      <div
        className={headerGridClassName}
        data-guide-tour={
          isOralSpotlight("oral_header") ? "oral_header" : undefined
        }
      >
        {showLabField ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Label className="text-sm">
              기공소 <span className="text-destructive">*</span>
            </Label>
            {showAutoMatchMinLabRating &&
            (isPinnedAbutsRecentLab(selectedLab) ||
              isAutoMatchLab(selectedLab)) ? (
              <AutoMatchMinLabRatingStars
                minValue={autoMatchMinLabRating}
                maxValue={autoMatchMaxLabRating}
                onMinChange={onAutoMatchMinLabRatingChange}
                onMaxChange={onAutoMatchMaxLabRatingChange}
              />
            ) : null}
          </div>
          {/*
            modal: Dialog RemoveScroll이 포털된 Popover 휠/터치를 막지 않게
            (스크롤바 드래그만 되고 터치·트랙패드가 안 되는 증상).
          */}
          <Popover modal open={labOpen} onOpenChange={setLabOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={labOpen}
                className={cn(
                  "h-11 w-full justify-between text-base",
                  isOralSpotlight("oral_header") && "practice-tooth-guide-pulse",
                )}
              >
                <span className="truncate">
                  {selectedLab
                    ? isAutoMatchLab(selectedLab)
                      ? ABUTS_PINNED_LAB_NAME
                      : getBusinessLabel(selectedLab)
                    : "기공소 선택"}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className={cn(
                "w-[var(--radix-popover-trigger-width)] max-w-[var(--radix-popover-trigger-width)] p-0",
                // Spotlight(z-420)보다 위 — 투어 중 검색 드롭다운이 블러에 가리지 않게
                // (index.css body:has(.guide-tour-root) wrapper z-430과 병행)
                platformOralActive &&
                  isOralSpotlight("oral_header") &&
                  "z-[430]",
              )}
              {...(platformOralActive && isOralSpotlight("oral_header")
                ? { "data-guide-tour-satellite": "oral_header" }
                : {})}
              align="start"
              onWheel={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
            >
              <Command>
                <CommandInput
                  placeholder="기공소 검색"
                  value={labSearch}
                  onValueChange={(v) => {
                    setLabSearch(v);
                  }}
                />
                <CommandList className="overscroll-contain touch-pan-y">
                  {!recentLabsInitialized ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">불러오는 중...</div>
                  ) : null}

                  {pinnedLabs.length > 0 ? (
                    <CommandGroup heading="고정">
                      {pinnedLabs.map((b) => {
                        const selected = selectedLab?._id === b._id;
                        const rep = String(b.representativeName || "").trim();
                        const bn = String(b.businessNumber || "").trim();
                        const addr = String(b.address || "").trim();
                        const meta = [rep ? `대표: ${rep}` : "", addr || ""]
                          .filter(Boolean)
                          .join(" · ");
                        const searchValue = [b.name, rep, bn, addr, "고정"].filter(Boolean).join(" ");
                        const label = getBusinessLabel(b);
                        const systemPinned = isPinnedAbutsRecentLab(b);

                        return (
                          <CommandItem
                            key={`pinned-${b._id}`}
                            value={searchValue}
                            onSelect={() => {
                              selectLabFromPicker(b);
                            }}
                            className="group items-start py-2.5"
                          >
                            <Check
                              className={cn(
                                "mr-2 mt-0.5 h-4 w-4 shrink-0",
                                selected ? "opacity-100" : "opacity-0",
                              )}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-base font-medium">{label}</div>
                              {meta ? (
                                <div className="truncate text-sm text-muted-foreground group-data-[selected=true]:text-accent-foreground/85">
                                  {meta}
                                </div>
                              ) : null}
                            </div>
                            {onTogglePinLab ? (
                              <button
                                type="button"
                                className={cn(
                                  "ml-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                                  systemPinned
                                    ? "cursor-default text-primary opacity-80"
                                    : "text-primary hover:bg-muted hover:opacity-100",
                                )}
                                aria-label={
                                  systemPinned
                                    ? `${label} 고정(해제 불가)`
                                    : `${label} 고정 해제`
                                }
                                title={systemPinned ? "항상 고정" : "고정 해제"}
                                disabled={systemPinned}
                                onPointerDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (!systemPinned) onTogglePinLab(b);
                                }}
                              >
                                <Pin className="h-3.5 w-3.5 fill-current" />
                              </button>
                            ) : null}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  ) : null}

                  {recentLabs.length > 0 ? (
                    <CommandGroup heading="최근">
                      {recentLabs.map((b) => {
                        const selected = selectedLab?._id === b._id;
                        const rep = String(b.representativeName || "").trim();
                        const bn = String(b.businessNumber || "").trim();
                        const addr = String(b.address || "").trim();
                        const meta = [rep ? `대표: ${rep}` : "", addr || ""]
                          .filter(Boolean)
                          .join(" · ");
                        const searchValue = [b.name, rep, bn, addr].filter(Boolean).join(" ");
                        const label = getBusinessLabel(b);

                        return (
                          <CommandItem
                            key={`recent-${b._id}`}
                            value={searchValue}
                            onSelect={() => {
                              selectLabFromPicker(b);
                            }}
                            className="group items-start py-2.5"
                          >
                            <Check
                              className={cn(
                                "mr-2 mt-0.5 h-4 w-4 shrink-0",
                                selected ? "opacity-100" : "opacity-0",
                              )}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-base font-medium">{label}</div>
                              {meta ? (
                                <div className="truncate text-sm text-muted-foreground group-data-[selected=true]:text-accent-foreground/85">
                                  {meta}
                                </div>
                              ) : null}
                            </div>
                            {onTogglePinLab ? (
                              <button
                                type="button"
                                className="ml-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-70 hover:bg-muted hover:text-foreground hover:opacity-100"
                                aria-label={`${label} 고정`}
                                title="고정"
                                onPointerDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  onTogglePinLab(b);
                                }}
                              >
                                <Pin className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                            {onRemoveRecentLab ? (
                              <button
                                type="button"
                                className="ml-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-70 hover:bg-muted hover:text-foreground hover:opacity-100"
                                aria-label={`${label} 최근에서 제거`}
                                title="최근에서 제거"
                                onPointerDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  onRemoveRecentLab(b);
                                }}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  ) : null}

                  <CommandSeparator />

                  <CommandGroup heading="검색">
                    {labSearching ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">검색 중...</div>
                    ) : labSearch.trim() ? (
                      labSearchResults.length > 0 ? (
                        labSearchResults.map((b) => {
                          const selected = selectedLab?._id === b._id;
                          const rep = String(b.representativeName || "").trim();
                          const bn = String(b.businessNumber || "").trim();
                          const addr = String(b.address || "").trim();
                          const meta = [rep ? `대표: ${rep}` : "", addr || ""]
                            .filter(Boolean)
                            .join(" · ");
                          const searchValue = [b.name, rep, bn, addr].filter(Boolean).join(" ");
                          const label = getBusinessLabel(b);
                          const pinned = isLabPinned(b, pinnedLabs);
                          const systemPinned = isPinnedAbutsRecentLab(b);

                          return (
                            <CommandItem
                              key={b._id}
                              value={searchValue}
                              onSelect={() => {
                                selectLabFromPicker(b);
                              }}
                              className="group"
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4 shrink-0",
                                  selected ? "opacity-100" : "opacity-0",
                                )}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-base font-medium">{label}</div>
                                {meta ? (
                                  <div className="truncate text-sm text-muted-foreground">{meta}</div>
                                ) : null}
                              </div>
                              {onTogglePinLab ? (
                                <button
                                  type="button"
                                  className={cn(
                                    "ml-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                                    pinned
                                      ? systemPinned
                                        ? "cursor-default text-primary opacity-80"
                                        : "text-primary hover:bg-muted"
                                      : "text-muted-foreground opacity-70 hover:bg-muted hover:text-foreground hover:opacity-100",
                                  )}
                                  aria-label={
                                    systemPinned
                                      ? `${label} 고정(해제 불가)`
                                      : pinned
                                        ? `${label} 고정 해제`
                                        : `${label} 고정`
                                  }
                                  title={
                                    systemPinned
                                      ? "항상 고정"
                                      : pinned
                                        ? "고정 해제"
                                        : "고정"
                                  }
                                  disabled={systemPinned}
                                  onPointerDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                  }}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (!systemPinned) onTogglePinLab(b);
                                  }}
                                >
                                  <Pin
                                    className={cn(
                                      "h-3.5 w-3.5",
                                      pinned && "fill-current",
                                    )}
                                  />
                                </button>
                              ) : null}
                            </CommandItem>
                          );
                        })
                      ) : (
                        <div className="px-3 py-2 text-sm text-muted-foreground">결과 없음</div>
                      )
                    ) : (
                      <div className="px-3 py-2 text-sm text-muted-foreground">검색어 입력</div>
                    )}
                  </CommandGroup>
                </CommandList>
                <div className="border-t border-primary-muted/60 bg-primary-soft/50 p-2">
                  <button
                    type="button"
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-strong disabled:pointer-events-none disabled:opacity-60"
                    disabled={labInviteCopyBusy}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void handleCopyLabInviteLink();
                    }}
                  >
                    {labInviteCopyBusy ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                    ) : (
                      <Link2 className="h-4 w-4 shrink-0" />
                    )}
                    <span className="min-w-0 truncate">
                      거래 기공소에 링크 보내기
                    </span>
                  </button>
                </div>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        ) : null}

        {showPatientField ? (
        <div className="space-y-2">
          <Label className="text-sm">환자명 <span className="text-destructive">*</span></Label>
          <ImeSafeInput
            value={patientName}
            onChange={setPatientName}
            onComposingChange={(composing) => {
              patientComposingRef.current = composing;
              reportImeComposing();
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              const ne = e.nativeEvent as Event & {
                isComposing?: boolean;
                keyCode?: number;
              };
              if (ne.isComposing || ne.keyCode === 229) return;
              e.preventDefault();
              tryCompletePatientGuideTourStep();
            }}
            placeholder="환자명"
            className={cn(
              "h-11 text-base",
              isOralSpotlight("oral_header") && "practice-tooth-guide-pulse",
            )}
          />
        </div>
        ) : null}

        {showDateFields ? (
        <PracticeOrderArrivalDateRangeField
          orderDate={orderDate}
          arrivalDate={arrivalDate}
          arrivalDefaultDays={arrivalDefaultDays}
          triggerClassName={
            isOralSpotlight("oral_header")
              ? "practice-tooth-guide-pulse"
              : undefined
          }
          triggerDataGuideTour={
            // 그리드가 primary; 트리거에도 동일 키 → 열린 캘린더는 satellite
            isOralSpotlight("oral_header") ? "oral_header" : undefined
          }
          onOpenChange={(open) => {
            if (!open) completeDatesGuideTourStep();
          }}
          onChange={(next) => {
            if (onOrderArrivalDatesChange) {
              onOrderArrivalDatesChange(next);
              return;
            }
            setOrderDate(next.orderDate);
            setArrivalDate(next.arrivalDate);
          }}
        />
        ) : null}
      </div>
              ) : null}
            </div>
            {showRightRail ? (
              <div className="flex w-full min-w-0 flex-col gap-3 self-start lg:max-w-[22rem]">
                {asideTourBanner}
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {showMemoSection || besideMemoContent ? (
      <div
        className={cn(
          showMemoSection && besideMemoContent
            ? "grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start"
            : "contents",
        )}
        data-guide-tour={
          isOralSpotlight("oral_memo_files") &&
          showMemoSection &&
          besideMemoContent
            ? "oral_memo_files"
            : undefined
        }
      >
      {showMemoSection ? (
      <div
        className={cn(
          "flex min-h-0 flex-col",
          memoOnly && "flex-1",
        )}
      >
        {aboveMemoContent}
        <div
          id={memoInputId}
          aria-label="메모"
          data-guide-tour={
            isOralSpotlight("oral_memo_files") && !besideMemoContent
              ? "oral_memo_files"
              : undefined
          }
          className={cn(
            "flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-white p-2.5",
            besideMemoContent
              ? "overflow-y-auto"
              : (memoBoxClassName ?? "min-h-[9rem]"),
          )}
          style={
            besideMemoContent && memoMatchBesideHeightPx != null
              ? { height: memoMatchBesideHeightPx }
              : undefined
          }
        >
          {memoLines.map((line, index) => {
            const lineSuggestions =
              suggestLineIndex === index
                ? suggestionsForActiveLine
                : filterMemoSuggestions(line, memoSnippets);
            const showSuggestions =
              suggestLineIndex === index && lineSuggestions.length > 0;

            return (
              <div key={`memo-line-${index}`} className="relative flex items-center gap-1.5">
                <div className="relative min-w-0 flex-1">
                  <ImeSafeInput
                    ref={(el) => {
                      memoInputRefs.current[index] = el;
                    }}
                    value={line}
                    onChange={(nextValue) => {
                      const nextLines = [...memoLines];
                      nextLines[index] = nextValue;
                      syncMemoLines(nextLines);
                      openMemoSuggestions(index, nextValue);
                    }}
                    onFocus={() => {
                      openMemoSuggestions(index, line);
                    }}
                    onBlur={() => {
                      // 클릭으로 제안을 고를 수 있게 살짝 늦춘다
                      window.setTimeout(() => {
                        rememberMemoSentence(memoInputRefs.current[index]?.value ?? line);
                        if (suggestLineIndex === index) closeMemoSuggestions();
                      }, 120);
                    }}
                    onComposingChange={(composing) => {
                      memoComposingRef.current = composing;
                      reportImeComposing();
                      if (composing) closeMemoSuggestions();
                    }}
                    onCompositionEnd={(e) => {
                      const shouldInsertNewline = pendingMemoNewlineIndexRef.current === index;
                      pendingMemoNewlineIndexRef.current = null;
                      const committed = e.currentTarget.value;
                      if (shouldInsertNewline) {
                        suppressMemoEnterRef.current = true;
                        rememberMemoSentence(committed);
                        insertMemoNewlineAfter(index, committed);
                        closeMemoSuggestions();
                      } else {
                        openMemoSuggestions(index, committed);
                      }
                      window.setTimeout(() => {
                        memoComposingRef.current = false;
                        suppressMemoEnterRef.current = false;
                        reportImeComposing();
                      }, 0);
                    }}
                    onKeyDown={(e) => {
                      if (isNativeImeComposing(e) || memoComposingRef.current) {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (suppressMemoEnterRef.current) return;
                          pendingMemoNewlineIndexRef.current = index;
                        }
                        return;
                      }

                      const open =
                        suggestLineIndex === index &&
                        suggestionsForActiveLine.length > 0;
                      const matches = open ? suggestionsForActiveLine : [];

                      if (open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                        e.preventDefault();
                        setSuggestActiveIndex((prev) => {
                          if (e.key === "ArrowDown") {
                            return prev + 1 >= matches.length ? 0 : prev + 1;
                          }
                          return prev - 1 < 0 ? matches.length - 1 : prev - 1;
                        });
                        return;
                      }

                      if (open && e.key === "Escape") {
                        e.preventDefault();
                        closeMemoSuggestions();
                        return;
                      }

                      // 제안이 열려 있으면 Enter로 수락. Tab도 동일하게 동작.
                      if (open && (e.key === "Enter" || e.key === "Tab")) {
                        const pick =
                          matches[
                            suggestActiveIndex >= 0 && suggestActiveIndex < matches.length
                              ? suggestActiveIndex
                              : 0
                          ];
                        if (pick) {
                          e.preventDefault();
                          applyMemoSuggestion(index, pick);
                          return;
                        }
                      }

                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (suppressMemoEnterRef.current) return;
                        rememberMemoSentence(e.currentTarget.value);
                        insertMemoNewlineAfter(index, e.currentTarget.value);
                        closeMemoSuggestions();
                        return;
                      }

                      if (
                        e.key === "Backspace" &&
                        !line &&
                        memoLines.length > 1
                      ) {
                        e.preventDefault();
                        closeMemoSuggestions();
                        handleDeleteMemoLine(index);
                      }
                    }}
                    placeholder={index === 0 ? "메모" : ""}
                    className="h-10 w-full text-sm"
                    autoComplete="off"
                  />
                  {showSuggestions ? (
                    <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-slate-200 bg-white text-slate-900 shadow-lg">
                      <ul className="max-h-48 overflow-y-auto py-1 text-sm">
                        {lineSuggestions.map((snippet, optionIndex) => (
                          <li key={`memo-suggest-${index}-${optionIndex}:${snippet}`}>
                            <button
                              type="button"
                              className={cn(
                                "flex w-full cursor-pointer items-center px-2.5 py-1.5 text-left hover:bg-primary-soft hover:text-primary-strong",
                                optionIndex === suggestActiveIndex &&
                                  "bg-primary-soft text-primary-strong",
                              )}
                              tabIndex={-1}
                              onMouseDown={(ev) => {
                                ev.preventDefault();
                                applyMemoSuggestion(index, snippet);
                              }}
                              onMouseEnter={() => setSuggestActiveIndex(optionIndex)}
                            >
                              <span className="truncate">{snippet}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0 text-slate-400 hover:text-destructive"
                  onClick={() => {
                    closeMemoSuggestions();
                    handleDeleteMemoLine(index);
                  }}
                  aria-label="문장 삭제"
                  title="문장 삭제"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      </div>
      ) : null}
      {besideMemoContent ? (
        <div
          ref={besideMemoPaneRef}
          className="flex min-h-0 min-w-0 flex-col"
        >
          {besideMemoContent}
        </div>
      ) : null}
      </div>
      ) : null}
      {showProsthesisSection ? (
      <div className={cn("space-y-2", showFullToothChart && "min-w-0")}>
        {showInlineToothChartHeader ? (
        <div className="relative flex min-h-8 items-center">
          <div className="flex items-center gap-1.5">
            <Label className="text-sm">
              보철물{" "}
              <span className="font-normal text-muted-foreground">({requestedToothCount}개)</span>{" "}
              <span className="text-destructive">*</span>
            </Label>
            {showInlineGuideTourButton && !platformOralActive ? (
              <Button
                type="button"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  if (toothWorkGuideTourStep != null) {
                    exitToothWorkGuideTour();
                    return;
                  }
                  startToothWorkGuideTour();
                }}
              >
                {toothWorkGuideTourStep != null ? "투어 종료" : "가이드투어"}
              </Button>
            ) : null}
          </div>

            <div className="absolute right-0 flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2.5 text-xs"
                onClick={openExtraRequestModal}
              >
                추가요청
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2.5 text-xs"
                onClick={openArchSelectModal}
              >
                전체치열
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2.5 text-xs"
                disabled={requestedToothCount === 0}
                onClick={() => {
                  setToothWorks([
                    {
                      toothNumber: "",
                      prosthesisType: defaultProsthesisType,
                      customAbutment: false,
                      bridgeLinkedTeeth: [],
                      ...emptyToothWorkCustomSpecs(),
                    },
                  ]);
                  customSpecsModalSnapshotRef.current = null;
                  closeCustomSpecsModal();
                  toothSelectAnchorRef.current = null;
                }}
              >
                전체해제
              </Button>
              {!hideEnlargeButton && toothChartDisplayMode !== "full" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs"
                  onClick={() => {
                    setToothChartEnlargeOpen(true);
                  }}
                >
                  크게 보기
                </Button>
              ) : null}
            </div>
        </div>
        ) : null}

        {toothWorkGuideTourStep != null &&
        !platformOralActive &&
        !useAsideTourRail &&
        customSpecsModalTarget === null &&
        toothWorkGuideTourStepId !== "header" ? (
          <PracticeToothWorkGuideTourBanner
            step={toothWorkGuideTourStep}
            onExit={exitToothWorkGuideTour}
            onFinish={exitToothWorkGuideTour}
          />
        ) : null}

        {(() => {
            const byTooth = new Map<string, { row: ToothWorkSelection; originalIndex: number }>();
            toothWorks.forEach((row, originalIndex) => {
              const tooth = String(row.toothNumber || "").trim();
              if (!/^[1-4][1-8]$/.test(tooth)) return;
              if (!byTooth.has(tooth)) byTooth.set(tooth, { row, originalIndex });
            });

            const handleEmptyToothClick = (
              e: ReactMouseEvent<HTMLElement>,
              toothNumber: string,
            ) => {
              if (suppressToothClickRef.current) return;
              if (e.shiftKey && toothSelectAnchorRef.current) {
                applyToothChartHits(
                  "select",
                  teethInShiftRange(toothSelectAnchorRef.current, toothNumber),
                  [],
                );
              } else {
                applyToothChartHits("select", [toothNumber], []);
              }
              toothSelectAnchorRef.current = toothNumber;
            };

            const isToothCopyDropTarget = (toothNumber: string) =>
              Boolean(
                toothCopyDrag &&
                  toothCopyDrag.hoverTooth === toothNumber &&
                  toothCopyDrag.sourceTooth !== toothNumber,
              );

            const toothSlotClass = showFullToothChart
              ? TOOTH_SLOT_FULL_CLASS
              : TOOTH_SLOT_COMPACT_CLASS;
            const toothCardHeightClass = showFullToothChart
              ? TOOTH_CARD_HEIGHT_FULL_CLASS
              : TOOTH_CARD_HEIGHT_CLASS;

            const chartRows = TOOTH_CHART_ROWS.map((decade) => {
              const rowTrack = (
                <div
                  className={cn(
                    "items-stretch gap-0.5",
                    showFullToothChart
                      ? "flex w-full min-w-0"
                      : "inline-flex w-max",
                  )}
                >
                  {decade.teeth.map((toothNumber, visibleIndex) => {
                      const configured = byTooth.get(toothNumber);
                      const chartIdx = decade.teeth.indexOf(toothNumber);
                      const chartNext =
                        chartIdx >= 0 && chartIdx < decade.teeth.length - 1
                          ? decade.teeth[chartIdx + 1]
                          : null;
                      const nextVisible = decade.teeth[visibleIndex + 1];
                      const showBridgeControl =
                        Boolean(chartNext) && nextVisible === chartNext;
                      const isMidlinePair =
                        (toothNumber === "11" && chartNext === "21") ||
                        (toothNumber === "41" && chartNext === "31");
                      const nextConfigured = chartNext ? byTooth.get(chartNext) : undefined;
                      const bridgeLinked = Boolean(
                        chartNext &&
                          ((configured &&
                            Array.isArray(configured.row.bridgeLinkedTeeth) &&
                            configured.row.bridgeLinkedTeeth.includes(chartNext)) ||
                            (nextConfigured &&
                              Array.isArray(nextConfigured.row.bridgeLinkedTeeth) &&
                              nextConfigured.row.bridgeLinkedTeeth.includes(toothNumber))),
                      );
                      const bridgeGapClass = bridgeLinked
                        ? BRIDGE_GAP_LINKED_CLASS
                        : isMidlinePair
                          ? BRIDGE_GAP_MIDLINE_CLASS
                          : BRIDGE_GAP_UNLINKED_CLASS;

                      const card = !configured ? (
                        <div
                          role="button"
                          tabIndex={0}
                          title={`${toothNumber} 크라운 선택`}
                          data-tooth-select={toothNumber}
                          data-tooth-slot-empty=""
                          className={cn(
                            "flex w-full touch-none flex-col items-center justify-start rounded-xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/80 px-0.5 pt-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition-all",
                            toothCardHeightClass,
                            "hover:border-primary/70 hover:from-primary-soft/80 hover:to-white hover:shadow-sm hover:shadow-primary-soft/60",
                            toothMarqueePreview?.teeth.has(toothNumber) &&
                              toothMarqueePreview.mode === "select" &&
                              "border-primary/70 from-primary-soft to-white ring-2 ring-primary/70",
                            toothMarqueePreview?.teeth.has(toothNumber) &&
                              toothMarqueePreview.mode === "deselect" &&
                              "border-destructive/80 ring-2 ring-destructive/70",
                            isToothCopyDropTarget(toothNumber) &&
                              "border-primary ring-2 ring-primary/80 from-primary-soft/70 to-white",
                            toothWorkGuideTourStepId === "select" && "practice-tooth-guide-pulse",
                          )}
                          onClick={(e) => handleEmptyToothClick(e, toothNumber)}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter" && e.key !== " ") return;
                            e.preventDefault();
                            if (suppressToothClickRef.current) return;
                            applyToothChartHits("select", [toothNumber], []);
                            toothSelectAnchorRef.current = toothNumber;
                          }}
                        >
                          <span
                            className={cn(
                              "flex items-center font-semibold tabular-nums tracking-tight text-slate-400/90",
                              showFullToothChart ? "h-8 text-base" : "h-10 text-xl",
                            )}
                          >
                            {toothNumber}
                          </span>
                          {renderToothCopyHandle(toothNumber, false)}
                        </div>
                      ) : null;

                      if (!configured) {
                        const emptyBridgeControl = showBridgeControl ? (
                          <div
                            data-bridge-link={`${toothNumber}|${chartNext}`}
                            data-bridge-linked={bridgeLinked ? "1" : "0"}
                            className={cn(
                              "relative z-20 flex shrink-0 items-center justify-center self-stretch",
                              bridgeGapClass,
                              toothMarqueePreview?.bridges.has(`${toothNumber}|${chartNext}`) &&
                                toothMarqueePreview.mode === "select" &&
                                "bg-primary-soft/80",
                              toothMarqueePreview?.bridges.has(`${toothNumber}|${chartNext}`) &&
                                toothMarqueePreview.mode === "deselect" &&
                                "bg-destructive-soft/80",
                            )}
                          >
                            {bridgeLinked ? (
                              <span
                                aria-hidden
                                className="pointer-events-none absolute inset-y-3 left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-primary/70"
                              />
                            ) : null}
                            <button
                              type="button"
                              data-bridge-link={`${toothNumber}|${chartNext}`}
                              data-bridge-linked={bridgeLinked ? "1" : "0"}
                              title={
                                bridgeLinked
                                  ? `${toothNumber}–${chartNext} 연결 해제`
                                  : `${toothNumber}–${chartNext} 브리지 연결`
                              }
                              className={cn(
                                BRIDGE_BUTTON_CLASS,
                                bridgeLinked
                                  ? "border-primary bg-primary text-white ring-2 ring-primary-soft hover:bg-primary-strong"
                                  : "border-slate-200 bg-white text-slate-500 hover:border-primary/70 hover:bg-primary-soft hover:text-primary-strong",
                                toothMarqueePreview?.bridges.has(`${toothNumber}|${chartNext}`) &&
                                  toothMarqueePreview.mode === "select" &&
                                  "border-primary bg-primary-soft text-primary-strong ring-2 ring-primary/70",
                                toothMarqueePreview?.bridges.has(`${toothNumber}|${chartNext}`) &&
                                  toothMarqueePreview.mode === "deselect" &&
                                  "border-destructive/80 bg-destructive-soft text-destructive ring-2 ring-destructive/80",
                                toothWorkGuideTourStepId === "bridge" &&
                                  !bridgeLinked &&
                                  "practice-tooth-guide-pulse",
                              )}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (suppressToothClickRef.current) return;
                                if (!chartNext) return;
                                const key = `${toothNumber}|${chartNext}`;
                                if (bridgeLinked) {
                                  applyToothChartHits("deselect", [], [key]);
                                } else {
                                  // 양옆 치아 크라운 선택(없으면 생성) 후 브리지 연결
                                  applyToothChartHits("select", [], [key]);
                                }
                              }}
                            >
                              {bridgeLinked ? (
                                <Minus className="h-3 w-3" strokeWidth={2.5} />
                              ) : (
                                <Plus className="h-3 w-3" strokeWidth={2.5} />
                              )}
                            </button>
                          </div>
                        ) : visibleIndex < decade.teeth.length - 1 ? (
                          <div
                            className={cn(
                              "shrink-0",
                              showFullToothChart ? "w-1.5" : "w-2",
                            )}
                            aria-hidden
                          />
                        ) : null;

                        return (
                          <div
                            key={`tooth-slot-${toothNumber}`}
                            className={
                              showFullToothChart
                                ? "contents"
                                : "flex shrink-0 items-stretch"
                            }
                          >
                            <div className={toothSlotClass}>{card}</div>
                            {emptyBridgeControl}
                          </div>
                        );
                      }

                      const { row, originalIndex } = configured;
                      const linkedTeeth = collectAdjacentBridgeLinks(toothWorks, row.toothNumber);
                      const isLinked = linkedTeeth.length > 0;
                      const isMissingTooth = isMissingToothProsthesisType(row.prosthesisType);
                      const isCustomType = isCustomAbutmentProsthesisType(row.prosthesisType);
                      // 커스텀어벗 형태도 어벗 체크박스를 보여 순환 중 체크 상태가 보이게 유지한다.
                      const showAbutmentCheckbox =
                        !isMissingTooth &&
                        isCustomAbutmentSupportedProsthesisType(row.prosthesisType);
                      // 상세(임플란트·스캔바디)는 체크됐을 때만 — 형태만 커스텀어벗이어도 미체크면 숨김.
                      const showCustomDetails =
                        isCustomAbutmentSupportedProsthesisType(row.prosthesisType) &&
                        Boolean(row.customAbutment);
                      const missingAbutmentPreset =
                        showCustomDetails && !hasCompleteAbutmentPresets(row);
                      const implantSummary = formatImplantSummary(row);
                      const abutmentSummary = formatAbutmentSummary(row);
                      const implantCompact = formatImplantCompact(row);
                      const abutmentCompact = formatAbutmentCompact(row);
                      const abutmentSidePlaceholder =
                        !isCustomType && isSimpleAbutmentMode(row)
                          ? "심플어벗"
                          : "스캔바디";
                      const abutmentSideHint =
                        !isCustomType && isSimpleAbutmentMode(row)
                          ? "심플어벗 규격을 선택해주세요"
                          : "스캔바디를 선택해주세요";
                      const abutmentSideEmptyHint =
                        !isCustomType && isSimpleAbutmentMode(row)
                          ? "심플어벗 선택"
                          : "스캔바디 선택";
                      const chartPrev = chartIdx > 0 ? decade.teeth[chartIdx - 1] : null;
                      const prevConfigured = chartPrev ? byTooth.get(chartPrev) : undefined;
                      const linkedChartNext = Boolean(
                        chartNext &&
                          (linkedTeeth.includes(chartNext) ||
                            (nextConfigured &&
                              Array.isArray(nextConfigured.row.bridgeLinkedTeeth) &&
                              nextConfigured.row.bridgeLinkedTeeth.includes(toothNumber))),
                      );
                      const linkedChartPrev = Boolean(
                        chartPrev &&
                          (linkedTeeth.includes(chartPrev) ||
                            (prevConfigured &&
                              Array.isArray(prevConfigured.row.bridgeLinkedTeeth) &&
                              prevConfigured.row.bridgeLinkedTeeth.includes(toothNumber))),
                      );

                      const bridgeControl = showBridgeControl ? (
                        <div
                          data-bridge-link={`${toothNumber}|${chartNext}`}
                          data-bridge-linked={bridgeLinked ? "1" : "0"}
                          className={cn(
                            "relative z-20 flex shrink-0 items-center justify-center self-stretch",
                            bridgeGapClass,
                            toothMarqueePreview?.bridges.has(`${toothNumber}|${chartNext}`) &&
                              toothMarqueePreview.mode === "select" &&
                              "bg-primary-soft/80",
                            toothMarqueePreview?.bridges.has(`${toothNumber}|${chartNext}`) &&
                              toothMarqueePreview.mode === "deselect" &&
                              "bg-destructive-soft/80",
                          )}
                        >
                          {bridgeLinked ? (
                            <span
                              aria-hidden
                              className="pointer-events-none absolute inset-y-3 left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-primary/70"
                            />
                          ) : null}
                          <button
                            type="button"
                            data-bridge-link={`${toothNumber}|${chartNext}`}
                            data-bridge-linked={bridgeLinked ? "1" : "0"}
                            title={
                              bridgeLinked
                                ? `${toothNumber}–${chartNext} 연결 해제`
                                : `${toothNumber}–${chartNext} 브리지 연결`
                            }
                            className={cn(
                              BRIDGE_BUTTON_CLASS,
                              bridgeLinked
                                ? "border-primary bg-primary text-white ring-2 ring-primary-soft hover:bg-primary-strong"
                                : "border-slate-200 bg-white text-slate-500 hover:border-primary/70 hover:bg-primary-soft hover:text-primary-strong",
                              toothMarqueePreview?.bridges.has(`${toothNumber}|${chartNext}`) &&
                                toothMarqueePreview.mode === "select" &&
                                "border-primary bg-primary-soft text-primary-strong ring-2 ring-primary/70",
                              toothMarqueePreview?.bridges.has(`${toothNumber}|${chartNext}`) &&
                                toothMarqueePreview.mode === "deselect" &&
                                "border-destructive/80 bg-destructive-soft text-destructive ring-2 ring-destructive/80",
                              toothWorkGuideTourStepId === "bridge" &&
                                !bridgeLinked &&
                                "practice-tooth-guide-pulse",
                            )}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (suppressToothClickRef.current) return;
                              if (!chartNext) return;
                              const key = `${toothNumber}|${chartNext}`;
                              if (bridgeLinked) {
                                applyToothChartHits("deselect", [], [key]);
                              } else {
                                applyToothChartHits("select", [], [key]);
                              }
                            }}
                          >
                            {bridgeLinked ? (
                              <Minus className="h-3 w-3" strokeWidth={2.5} />
                            ) : (
                              <Plus className="h-3 w-3" strokeWidth={2.5} />
                            )}
                          </button>
                        </div>
                      ) : visibleIndex < decade.teeth.length - 1 ? (
                        <div
                          className={cn(
                            "shrink-0",
                            showFullToothChart ? "w-1.5" : "w-2",
                          )}
                          aria-hidden
                        />
                      ) : null;

                      return (
                          <div
                            key={`tooth-slot-${toothNumber}`}
                            className={
                              showFullToothChart
                                ? "contents"
                                : "flex shrink-0 items-stretch"
                            }
                          >
                          <div className={cn("relative", toothSlotClass)}>
                          {linkedChartNext && !showBridgeControl ? (
                            <span
                              aria-hidden
                              className="pointer-events-none absolute right-0 top-1/2 z-20 h-8 w-1.5 -translate-y-1/2 rounded-l-full bg-primary/80"
                            />
                          ) : null}
                          {linkedChartPrev && decade.teeth[visibleIndex - 1] !== chartPrev ? (
                            <span
                              aria-hidden
                              className="pointer-events-none absolute left-0 top-1/2 z-20 h-8 w-1.5 -translate-y-1/2 rounded-r-full bg-primary/80"
                            />
                          ) : null}

                          <div
                            data-tooth-select={toothNumber}
                            data-tooth-slot-selected=""
                            className={cn(
                              "relative flex w-full min-w-0 flex-col items-center justify-start overflow-hidden border px-0.5 pb-1 pt-1.5 shadow-sm",
                              toothCardHeightClass,
                              isMissingTooth
                                ? isLinked
                                  ? "border-primary bg-slate-50"
                                  : "rounded-xl border-slate-300 bg-slate-50"
                                : missingAbutmentPreset
                                ? isLinked
                                  ? "border-destructive bg-gradient-to-b from-destructive-soft via-destructive-soft/95 to-white ring-1 ring-destructive/40"
                                  : "rounded-xl border-destructive bg-gradient-to-b from-destructive-soft via-white to-destructive-soft/40 ring-1 ring-destructive/40"
                                : isLinked
                                ? "border-primary bg-gradient-to-b from-primary-soft via-primary-soft/95 to-white ring-1 ring-primary/40"
                                : "rounded-xl border-primary/90 bg-gradient-to-b from-primary-soft via-white to-primary-soft/40 ring-1 ring-primary-muted/40",
                              isLinked && !linkedChartPrev && !linkedChartNext && "rounded-xl",
                              isLinked && linkedChartPrev && linkedChartNext && "rounded-none",
                              isLinked && linkedChartPrev && !linkedChartNext && "rounded-r-xl rounded-l-none",
                              isLinked && !linkedChartPrev && linkedChartNext && "rounded-l-xl rounded-r-none",
                              linkedChartPrev && "border-l-0",
                              linkedChartNext && "border-r-0",
                              toothMarqueePreview?.teeth.has(toothNumber) &&
                                toothMarqueePreview.mode === "select" &&
                                "ring-2 ring-primary/80",
                              toothMarqueePreview?.teeth.has(toothNumber) &&
                                toothMarqueePreview.mode === "deselect" &&
                                "ring-2 ring-destructive/80 opacity-80",
                              isToothCopyDropTarget(toothNumber) &&
                                "ring-2 ring-primary/80 brightness-[1.02]",
                              toothWorkGuideTourStepId === "deselect" &&
                              "practice-tooth-guide-pulse",
                            )}
                          >
                            {isMissingTooth ? (
                              <svg
                                aria-hidden
                                viewBox="0 0 100 100"
                                preserveAspectRatio="none"
                                className="pointer-events-none absolute inset-x-2 top-9 bottom-3 z-[5] text-slate-300/40"
                              >
                                <line
                                  x1="8"
                                  y1="8"
                                  x2="92"
                                  y2="92"
                                  stroke="currentColor"
                                  strokeWidth="10"
                                  strokeLinecap="round"
                                />
                                <line
                                  x1="92"
                                  y1="8"
                                  x2="8"
                                  y2="92"
                                  stroke="currentColor"
                                  strokeWidth="10"
                                  strokeLinecap="round"
                                />
                              </svg>
                            ) : null}

                            {/* 1) 치아번호 (차트 슬롯으로만 선택 — 번호 변경 팝업 없음) */}
                            <span
                              className={cn(
                                "relative z-[1] flex shrink-0 items-center font-bold tabular-nums tracking-tight text-slate-800",
                                showFullToothChart ? "h-8 text-base" : "h-10 text-xl",
                              )}
                            >
                              {row.toothNumber}
                            </span>

                            {/* 2) 치아형태 — 글자 클릭 시에만 인레이→크라운→커스텀어벗→임시치아 / 브리지↔결손치↔유지장치↔임시치아 */}
                            {(() => {
                              const typeLabel = isMissingTooth
                                ? NO_WORK_PROSTHESIS_TYPE
                                : row.prosthesisType ||
                                  resolveProsthesisTypeForLinkState(
                                    "",
                                    isLinked,
                                    normalizedProsthesisTypes,
                                  );
                              const typeButton = (
                                <button
                                  type="button"
                                  data-no-tooth-marquee=""
                                  data-prosthesis-type-toggle=""
                                  className={cn(
                                    "relative mt-1.5 flex h-7 w-full min-w-0 shrink-0 cursor-pointer items-center justify-center truncate rounded-md px-0.5 text-center text-[11px]",
                                    isMissingTooth
                                      ? "z-20 bg-transparent text-slate-500 hover:bg-transparent"
                                      : "z-[1] text-slate-600 hover:bg-primary-soft hover:text-primary-strong",
                                    toothWorkGuideTourStepId === "type" &&
                                      !isMissingTooth &&
                                      "practice-tooth-guide-pulse",
                                  )}
                                  title={
                                    isMissingTooth
                                      ? undefined
                                      : isLinked
                                        ? "클릭: 브리지 ↔ 결손치 ↔ 유지장치 ↔ 임시치아 (결손치로 바꿀 때만 해당 치아, 나머지는 연결 전체 동일)"
                                        : "클릭: 인레이 → 크라운 → 커스텀어벗 → 임시치아"
                                  }
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    // 마키 억제는 카드 해제용. 형태 버튼(여백 포함) 클릭은 순환한다.
                                    const resolved = resolveNextProsthesisType(
                                      toothWorks,
                                      toothNumber,
                                      normalizedProsthesisTypes,
                                    );
                                    if (!resolved) return;
                                    setToothWorks((prev) => {
                                      const current = prev[resolved.index];
                                      if (!current) return prev;
                                      const isLinkedSpan =
                                        collectAdjacentBridgeLinks(prev, current.toothNumber)
                                          .length > 0;
                                      if (isLinkedSpan) {
                                        const cycled = applyCycledLinkedSpanProsthesisType(
                                          prev,
                                          current.toothNumber,
                                          resolved.nextType,
                                          linkedSpanTypeSnapshotRef.current,
                                          lockedMode ?? defaultAbutmentProductMode,
                                        );
                                        linkedSpanTypeSnapshotRef.current = cycled.snapshot;
                                        return cycled.rows;
                                      }
                                      const next = [...prev];
                                      next[resolved.index] = applyIntakeProsthesisType(
                                        current,
                                        resolved.nextType,
                                      );
                                      return next;
                                    });
                                    // 형태 글자 클릭은 타입만 순환. 모달은 어벗 체크·상세 클릭에서만.
                                    suppressAbutmentCheckboxUntilRef.current = Date.now() + 500;
                                    if (customSpecsModalTarget === resolved.index) {
                                      customSpecsModalSnapshotRef.current = null;
                                      closeCustomSpecsModal();
                                    }
                                  }}
                                >
                                  {typeLabel}
                                </button>
                              );
                              if (!isMissingTooth) return typeButton;
                              return (
                                <Tooltip>
                                  <TooltipTrigger asChild>{typeButton}</TooltipTrigger>
                                  <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                                    {NO_WORK_PROSTHESIS_TOOLTIP}
                                  </TooltipContent>
                                </Tooltip>
                              );
                            })()}

                            {/* 3) 크라운·브리지·임시치아·커스텀어벗 → 어벗 체크. 상세는 체크 시에만 */}
                            {showAbutmentCheckbox ? (
                              <label
                                data-no-tooth-marquee=""
                                title={
                                  missingAbutmentPreset
                                    ? "임플란트·스캔바디/심플어벗을 선택해주세요"
                                    : undefined
                                }
                                className={cn(
                                  "mt-2 inline-flex h-5 shrink-0 cursor-pointer items-center justify-center gap-0.5 px-0.5 text-[11px] leading-none",
                                  missingAbutmentPreset
                                    ? "text-destructive"
                                    : "text-slate-600",
                                  toothWorkGuideTourStepId === "abutment" &&
                                    "practice-tooth-guide-pulse rounded-sm",
                                )}
                              >
                                <input
                                  type="checkbox"
                                  className="h-3 w-3 shrink-0 accent-primary-strong"
                                  checked={Boolean(row.customAbutment)}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (Date.now() < suppressAbutmentCheckboxUntilRef.current) {
                                      e.preventDefault();
                                    }
                                  }}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    if (Date.now() < suppressAbutmentCheckboxUntilRef.current) {
                                      return;
                                    }
                                    if (e.target.checked) {
                                      // 투어「어벗」스텝: 모달 없이 체크만 — 다음 프리셋 스텝에서 연다(치식 홀·모달 겹침 방지)
                                      if (toothWorkGuideTourStepId === "abutment") {
                                        setToothWorks((prev) => {
                                          const current = prev[originalIndex];
                                          if (!current) return prev;
                                          const nextMode = lockedMode
                                            ? lockedMode
                                            : isAbutmentProductMode(
                                                  current.abutmentProductMode,
                                                )
                                              ? current.abutmentProductMode
                                              : defaultAbutmentProductMode;
                                          const next = [...prev];
                                          next[originalIndex] = {
                                            ...current,
                                            customAbutment: true,
                                            abutmentProductMode: nextMode,
                                          };
                                          return next;
                                        });
                                        return;
                                      }
                                      openCustomSpecsModal(originalIndex);
                                      return;
                                    }
                                    setToothWorks((prev) => {
                                      const current = prev[originalIndex];
                                      if (!current) return prev;
                                      const next = [...prev];
                                      next[originalIndex] = {
                                        ...current,
                                        customAbutment: false,
                                        abutmentProductMode: undefined,
                                        ...emptyToothWorkCustomSpecs(),
                                      };
                                      return next;
                                    });
                                    if (customSpecsModalTarget === originalIndex) {
                                      customSpecsModalSnapshotRef.current = null;
                                      closeCustomSpecsModal();
                                    }
                                  }}
                                />
                                <span className="whitespace-nowrap">어벗</span>
                              </label>
                            ) : null}

                            {/* 4) 임플란트 · 스캔바디. 기공의뢰는 디자인+생산 고정이라 모드 라벨 없음 */}
                            {showCustomDetails ? (
                              <div
                                data-no-tooth-marquee=""
                                className={cn(
                                  "flex w-full shrink-0 flex-col items-center gap-0.5 leading-none",
                                  showAbutmentCheckbox ? "mt-0.5" : "mt-2",
                                  toothWorkGuideTourStepId === "custom_abut"
                                    ? "practice-tooth-guide-pulse rounded-md"
                                    : null,
                                )}
                              >
                                <TooltipProvider>
                                  <div className="flex w-full flex-col items-stretch gap-0.5 px-0.5">
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          type="button"
                                          className={cn(
                                            "h-5 w-full truncate px-0.5 text-center text-[10px] leading-none hover:underline",
                                            implantCompact
                                              ? "text-primary-strong hover:bg-primary-soft/70"
                                              : missingAbutmentPreset
                                                ? "font-semibold text-destructive hover:bg-destructive-soft"
                                                : "text-primary-strong hover:bg-primary-soft/70",
                                          )}
                                          onClick={() => openCustomSpecsModal(originalIndex)}
                                        >
                                          {implantCompact || "임플란트"}
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent side="bottom" className="max-w-[16rem] text-xs">
                                        {implantSummary ||
                                          (missingAbutmentPreset
                                            ? "임플란트를 선택해주세요"
                                            : "임플란트 선택")}
                                      </TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          type="button"
                                          className={cn(
                                            "h-5 w-full truncate px-0.5 text-center text-[10px] leading-none hover:underline",
                                            abutmentCompact
                                              ? "text-service-abut hover:bg-service-abut-soft"
                                              : missingAbutmentPreset
                                                ? "font-semibold text-destructive hover:bg-destructive-soft"
                                                : "text-service-abut hover:bg-service-abut-soft",
                                          )}
                                          onClick={() => openCustomSpecsModal(originalIndex)}
                                        >
                                          {abutmentCompact || abutmentSidePlaceholder}
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent side="bottom" className="max-w-[16rem] text-xs">
                                        {abutmentSummary ||
                                          (missingAbutmentPreset
                                            ? abutmentSideHint
                                            : abutmentSideEmptyHint)}
                                      </TooltipContent>
                                    </Tooltip>
                                  </div>
                                </TooltipProvider>
                              </div>
                            ) : null}

                            {(() => {
                              const fee = labFeeByTooth.get(
                                String(row.toothNumber || "").trim(),
                              );
                              if (!fee || isMissingTooth) return null;
                              return (
                                <p
                                  data-no-tooth-marquee=""
                                  className="relative z-[1] mt-1 w-full px-0.5 text-center text-[10px] leading-tight tabular-nums text-slate-500"
                                  title="기공소 기공비(하한~상한)"
                                >
                                  {formatWonRange(fee.min, fee.max)}
                                </p>
                              );
                            })()}
                            {renderToothCopyHandle(toothNumber, true)}
                          </div>
                          </div>
                          {bridgeControl}
                        </div>
                      );
                    })}
                </div>
              );

              return (
                <div key={`decade-${decade.key}`} className="w-full">
                  {showFullToothChart ? (
                    rowTrack
                  ) : (
                    <PracticeToothChartHorizontalScroll
                      ariaLabel={`${decade.label} 치식 가로 스크롤`}
                    >
                      {rowTrack}
                    </PracticeToothChartHorizontalScroll>
                  )}
                </div>
              );
            });

            const chartBody = (
              <div
                ref={toothChartRef}
                data-tooth-chart
                data-guide-tour={
                  isOralSpotlight("oral_prosthesis") ||
                  isOralSpotlight("oral_card_ops")
                    ? oralSpotlightTargetId!
                    : undefined
                }
                className={cn(
                  "relative select-none px-1",
                  showFullToothChart ? "space-y-3 py-2.5" : "space-y-2 py-1",
                  toothMarquee ? "cursor-crosshair" : null,
                  toothCopyDrag ? "cursor-copy" : null,
                )}
                onPointerDown={handleToothChartPointerDown}
              >
                {chartRows[0]}
                {showFeeEstimate ? (
                  <div
                    className={cn(
                      "flex items-center justify-center gap-3 px-1",
                      isOralSpotlight("oral_estimate") &&
                        "practice-tooth-guide-pulse rounded-lg",
                    )}
                    data-guide-tour={
                      isOralSpotlight("oral_estimate")
                        ? "oral_estimate"
                        : undefined
                    }
                  >
                    <PracticeTransferFeeEstimate
                      className="min-w-0 flex-1"
                      quote={feeQuote}
                      viewer="practice"
                      labPending={
                        !selectedLab ||
                        !/^[a-fA-F0-9]{24}$/.test(String(selectedLab._id || ""))
                      }
                      rushProcessing={rushProcessing}
                      // 투어 견적 스텝 — 홀 안 금액이 blur로 「내용 없음」처럼 보이지 않게
                      revealAmounts={toothWorkGuideTourStepId === "estimate"}
                      onBreakdownTooltipOpenChange={
                        toothWorkGuideTourStepId === "estimate" &&
                        !platformOralActive
                          ? (open) => {
                              if (
                                toothWorkGuideTourEstimateHoverTimerRef.current !=
                                null
                              ) {
                                window.clearTimeout(
                                  toothWorkGuideTourEstimateHoverTimerRef.current,
                                );
                                toothWorkGuideTourEstimateHoverTimerRef.current =
                                  null;
                              }
                              if (!open) return;
                              toothWorkGuideTourEstimateHoverTimerRef.current =
                                window.setTimeout(() => {
                                  toothWorkGuideTourEstimateHoverTimerRef.current =
                                    null;
                                  completeToothWorkGuideTourAction();
                                }, 1200);
                            }
                          : undefined
                      }
                    />
                    {/* 레거시(2026-08-22): skipJig「지그 필요없음」체크 UI 삭제 */}
                  </div>
                ) : null}
                {chartRows[1]}
                {toothMarquee && toothChartRef.current
                  ? (() => {
                      const container = toothChartRef.current!;
                      const bounds = container.getBoundingClientRect();
                      const left =
                        Math.min(toothMarquee.originX, toothMarquee.currentX) -
                        bounds.left +
                        container.scrollLeft;
                      const top =
                        Math.min(toothMarquee.originY, toothMarquee.currentY) -
                        bounds.top +
                        container.scrollTop;
                      const width = Math.abs(toothMarquee.currentX - toothMarquee.originX);
                      const height = Math.abs(toothMarquee.currentY - toothMarquee.originY);
                      if (width < 2 && height < 2) return null;
                      return (
                        <div
                          aria-hidden
                          className="pointer-events-none absolute z-30 rounded-sm border border-primary bg-primary/20"
                          style={{ left, top, width, height }}
                        />
                      );
                    })()
                  : null}
              </div>
            );

            return (
              <>
                {toothChartDisplayMode === "full" || !toothChartEnlargeOpen ? chartBody : null}
                {toothChartDisplayMode !== "full" ? (
                <Dialog
                  open={toothChartEnlargeOpen}
                  onOpenChange={setToothChartEnlargeOpen}
                >
                  <DialogContent className="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] gap-3 p-4 sm:max-w-[calc(100vw-1rem)] sm:p-5">
                    <DialogHeader className="pr-8 text-left">
                      <DialogTitle className="text-base">
                        보철물{" "}
                        <span className="font-normal text-muted-foreground">
                          ({requestedToothCount}개)
                        </span>
                      </DialogTitle>
                      <DialogDescription className="sr-only">
                        보철물 치식 차트를 가로로 크게 봅니다.
                      </DialogDescription>
                    </DialogHeader>
                    {toothChartEnlargeOpen ? chartBody : null}
                  </DialogContent>
                </Dialog>
                ) : null}
              </>
            );
          })()}
        </div>
      ) : null}

      <Dialog
        open={extraRequestModalOpen}
        onOpenChange={(open) => {
          setExtraRequestModalOpen(open);
          if (!open) {
            setExtraRequestContent("");
            setExtraRequestLabIds([]);
            setExtraRequestLabPickerOpen(false);
            setExtraRequestLabQuery("");
            setExtraRequestSubmitting(false);
          }
        }}
      >
        <DialogContent
          className={cn(
            "w-[min(100vw-2rem,28rem)] max-w-[min(100vw-2rem,28rem)] gap-0 overflow-visible p-0 text-sm sm:w-[28rem] sm:max-w-[28rem] sm:rounded-2xl sm:p-0",
            nestedDialogClassName,
          )}
          overlayClassName={nestedDialogOverlayClassName}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.shiftKey) return;
            if (extraRequestLabPickerOpen) return;
            const target = e.target as HTMLElement | null;
            if (target?.tagName === "TEXTAREA" || target?.tagName === "INPUT") {
              return;
            }
            if (
              !String(extraRequestContent || "").trim() ||
              isArchBulkProsthesisPreset(String(extraRequestContent || "").trim()) ||
              extraRequestSubmitting
            ) {
              return;
            }
            e.preventDefault();
            void submitExtraRequest();
          }}
        >
          <DialogHeader className="space-y-0 px-5 pb-3 pt-5 text-left">
            <DialogTitle className="pr-8 text-sm font-semibold tracking-tight text-slate-900">
              보철물 추가요청
            </DialogTitle>
            <DialogDescription className="px-0 pt-1.5 text-xs leading-relaxed text-slate-500">
              관리자 승인 후 기공소 설정·기공비에 반영됩니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-5 pb-4 pt-1">
            <div className="space-y-2">
              <Label htmlFor="prosthesis-extra-request-content" className="text-xs">
                내용 <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="prosthesis-extra-request-content"
                value={extraRequestContent}
                onChange={(e) => setExtraRequestContent(e.target.value)}
                placeholder="추가할 보철물 이름"
                className="min-h-[5rem] resize-none rounded-xl text-sm"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">
                대상 기공소{" "}
                <span className="font-normal text-muted-foreground">(선택 · 여러 개)</span>
              </Label>
              {(() => {
                const seen = new Set<string>();
                const options: SearchBusinessResult[] = [];
                for (const lab of [
                  ...(selectedLab ? [selectedLab] : []),
                  ...(Array.isArray(pinnedLabs) ? pinnedLabs : []),
                  ...(Array.isArray(recentLabs) ? recentLabs : []),
                  ...(Array.isArray(labSearchResults) ? labSearchResults : []),
                ]) {
                  if (isAutoMatchLab(lab)) continue;
                  const id = String(lab._id || "").trim();
                  if (!id || seen.has(id)) continue;
                  seen.add(id);
                  options.push(lab);
                }
                const query = String(extraRequestLabQuery || "").trim().toLowerCase();
                const filteredOptions = query
                  ? options.filter((lab) =>
                      getBusinessLabel(lab).toLowerCase().includes(query),
                    )
                  : options;
                const selectedOptions = options.filter((lab) =>
                  extraRequestLabIds.includes(String(lab._id || "").trim()),
                );
                const toggleLab = (labId: string) => {
                  const id = String(labId || "").trim();
                  if (!id) return;
                  setExtraRequestLabIds((prev) =>
                    prev.includes(id)
                      ? prev.filter((row) => row !== id)
                      : [...prev, id],
                  );
                };
                return (
                  <div className="space-y-2">
                    <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white">
                      <button
                        type="button"
                        className="flex h-10 w-full items-center justify-between px-3 text-left transition-colors hover:bg-slate-50"
                        aria-expanded={extraRequestLabPickerOpen}
                        onClick={() =>
                          setExtraRequestLabPickerOpen((prev) => !prev)
                        }
                      >
                        <span
                          className={cn(
                            "truncate text-sm",
                            selectedOptions.length === 0 && "text-muted-foreground",
                          )}
                        >
                          {selectedOptions.length === 0
                            ? "기공소 선택"
                            : `${selectedOptions.length}곳 선택됨`}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </button>

                      {extraRequestLabPickerOpen ? (
                        <div className="border-t border-slate-100">
                          <div className="p-2">
                            <Input
                              value={extraRequestLabQuery}
                              onChange={(e) => {
                                const next = e.target.value;
                                setExtraRequestLabQuery(next);
                                setLabSearch(next);
                              }}
                              placeholder="기공소 검색…"
                              className="h-9 rounded-lg text-sm"
                            />
                          </div>
                          <div className="max-h-44 overflow-y-auto px-1 pb-2">
                            {labSearching && filteredOptions.length === 0 ? (
                              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                                검색 중…
                              </div>
                            ) : filteredOptions.length === 0 ? (
                              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                                기공소가 없습니다.
                              </div>
                            ) : (
                              filteredOptions.map((lab) => {
                                const id = String(lab._id || "").trim();
                                const selected = extraRequestLabIds.includes(id);
                                return (
                                  <button
                                    key={id}
                                    type="button"
                                    onClick={() => toggleLab(id)}
                                    className={cn(
                                      "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                                      selected
                                        ? "bg-primary-soft/60 text-primary-strong"
                                        : "text-slate-800 hover:bg-slate-50",
                                    )}
                                  >
                                    <span
                                      className={cn(
                                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border",
                                        selected
                                          ? "border-primary bg-primary text-primary-foreground"
                                          : "border-slate-300 bg-white",
                                      )}
                                    >
                                      {selected ? (
                                        <Check className="h-3 w-3" />
                                      ) : null}
                                    </span>
                                    <span className="min-w-0 truncate">
                                      {getBusinessLabel(lab)}
                                    </span>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {selectedOptions.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedOptions.map((lab) => {
                          const id = String(lab._id || "").trim();
                          return (
                            <Badge
                              key={id}
                              variant="secondary"
                              className="gap-1 rounded-lg px-2 py-1 text-xs font-medium"
                            >
                              <span className="max-w-[10rem] truncate">
                                {getBusinessLabel(lab)}
                              </span>
                              <button
                                type="button"
                                className="rounded-sm text-slate-500 transition-colors hover:text-slate-800"
                                onClick={() => toggleLab(id)}
                                aria-label={`${getBusinessLabel(lab)} 제거`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[11px] leading-relaxed text-slate-400">
                        미지정 시 관리자가 모든 기공소로 승인할 수 있습니다.
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          <DialogFooter className="gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5 sm:flex-row sm:justify-end sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl"
              disabled={extraRequestSubmitting}
              onClick={() => setExtraRequestModalOpen(false)}
            >
              취소
            </Button>
            <Button
              type="button"
              size="sm"
              className="rounded-xl"
              disabled={
                extraRequestSubmitting ||
                !String(extraRequestContent || "").trim() ||
                isArchBulkProsthesisPreset(
                  String(extraRequestContent || "").trim(),
                )
              }
              onClick={() => void submitExtraRequest()}
            >
              {extraRequestSubmitting ? "제출 중…" : "요청"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={archSelectModalOpen}
        onOpenChange={(open) => {
          setArchSelectModalOpen(open);
          if (!open) {
            setArchDropUpperType(null);
            setArchDropLowerType(null);
            setArchSelectCustomName("");
            setArchSelectCustomOpen(false);
            setArchDragType(null);
            setArchDropHover(null);
          }
        }}
      >
        <DialogContent
          className={cn(
            // Dialog 기본 sm:max-w-lg 덮어쓰기.
            "w-[min(100vw-2rem,28rem)] max-w-[min(100vw-2rem,28rem)] gap-0 overflow-hidden p-0 text-sm sm:w-[28rem] sm:max-w-[28rem] sm:rounded-2xl sm:p-0",
            nestedDialogClassName,
          )}
          overlayClassName={nestedDialogOverlayClassName}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            if (!archDropUpperType && !archDropLowerType) return;
            e.preventDefault();
            applyArchBulkProsthesisSelection();
          }}
        >
          <DialogHeader className="space-y-0 px-5 pb-3 pt-5 text-left">
            <DialogTitle className="pr-8 text-sm font-semibold tracking-tight text-slate-900">
              전체치열
            </DialogTitle>
            <DialogDescription className="sr-only">
              왼쪽 보철물을 오른쪽 상·하악으로 드래그해 올립니다.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-stretch gap-4 px-5 pb-3 pt-2">
            <div className="flex min-w-0 flex-1 flex-col items-center gap-2.5">
              {ARCH_BULK_PROSTHESIS_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", preset);
                    e.dataTransfer.effectAllowed = "copy";
                    setArchDragType(preset);
                  }}
                  onDragEnd={() => {
                    setArchDragType(null);
                    setArchDropHover(null);
                  }}
                  className={cn(
                    "flex h-10 w-full max-w-[11.5em] shrink-0 cursor-grab items-center justify-center rounded-xl border border-slate-200/90 bg-white px-2 text-center text-sm font-medium text-slate-800 transition-colors active:cursor-grabbing hover:border-slate-300 hover:bg-slate-50",
                    archDragType === preset && "opacity-60 ring-1 ring-primary/30",
                  )}
                >
                  {preset}
                </button>
              ))}

              {archSelectCustomOpen ? (
                <div className="relative flex h-10 w-full max-w-[11.5em] shrink-0 items-center gap-1">
                  <button
                    type="button"
                    draggable={Boolean(String(archSelectCustomName || "").trim())}
                    disabled={!String(archSelectCustomName || "").trim()}
                    onDragStart={(e) => {
                      const name = String(archSelectCustomName || "").trim();
                      if (!name) {
                        e.preventDefault();
                        return;
                      }
                      e.dataTransfer.setData("text/plain", name);
                      e.dataTransfer.effectAllowed = "copy";
                      setArchDragType(name);
                    }}
                    onDragEnd={() => {
                      setArchDragType(null);
                      setArchDropHover(null);
                    }}
                    className={cn(
                      "flex h-10 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200/90 bg-white text-slate-400 transition-colors",
                      String(archSelectCustomName || "").trim()
                        ? "cursor-grab active:cursor-grabbing hover:border-slate-300 hover:text-slate-700"
                        : "cursor-not-allowed opacity-40",
                      archDragType === String(archSelectCustomName || "").trim() &&
                        Boolean(String(archSelectCustomName || "").trim()) &&
                        "opacity-60 ring-1 ring-primary/30",
                    )}
                    aria-label="커스텀 보철물 드래그"
                    title={
                      String(archSelectCustomName || "").trim()
                        ? "드래그해서 올려 주세요"
                        : "이름을 입력한 뒤 드래그하세요"
                    }
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </button>
                  <Input
                    value={archSelectCustomName}
                    onChange={(e) => setArchSelectCustomName(e.target.value)}
                    placeholder="보철물 이름"
                    className="h-10 min-w-0 flex-1 rounded-xl px-2 pr-7 text-center text-sm"
                    autoFocus
                  />
                  <button
                    type="button"
                    className="absolute right-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                    onClick={() => {
                      setArchSelectCustomOpen(false);
                      setArchSelectCustomName("");
                    }}
                    aria-label="커스텀 입력 닫기"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setArchSelectCustomOpen(true)}
                  className="flex h-10 w-full max-w-[11.5em] shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-200/90 bg-slate-50/50 text-slate-500 transition-colors hover:border-primary-muted hover:bg-primary-soft/30 hover:text-primary-strong"
                  aria-label="보철물 추가"
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
            </div>

            <div
              className="w-px self-stretch bg-slate-100"
              aria-hidden
            />

            <div className="flex w-[10.5rem] shrink-0 flex-col justify-center gap-3">
              {(
                [
                  {
                    key: "upper" as const,
                    label: "상악",
                    value: archDropUpperType,
                    setValue: setArchDropUpperType,
                  },
                  {
                    key: "lower" as const,
                    label: "하악",
                    value: archDropLowerType,
                    setValue: setArchDropLowerType,
                  },
                ] as const
              ).map((zone) => {
                const hovering = archDropHover === zone.key;
                const filled = Boolean(zone.value);
                return (
                  <div
                    key={zone.key}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "copy";
                      if (archDropHover !== zone.key) setArchDropHover(zone.key);
                    }}
                    onDragLeave={() => {
                      setArchDropHover((prev) =>
                        prev === zone.key ? null : prev,
                      );
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const raw =
                        e.dataTransfer.getData("text/plain") ||
                        archDragType ||
                        "";
                      const typeName = String(raw || "").trim();
                      setArchDropHover(null);
                      setArchDragType(null);
                      if (!typeName) return;
                      zone.setValue(typeName);
                    }}
                    className={cn(
                      "relative flex min-h-[5rem] flex-col items-center justify-center rounded-xl border border-dashed px-3 py-3 text-center transition-colors",
                      hovering
                        ? "border-primary bg-primary-soft/50 ring-1 ring-primary/25"
                        : filled
                          ? "border-primary/40 bg-primary-soft/30"
                          : "border-slate-200/90 bg-slate-50/60",
                    )}
                  >
                    <span className="text-[11px] font-semibold tracking-wide text-slate-500">
                      {zone.label}
                    </span>
                    {filled ? (
                      <>
                        <span className="mt-1 line-clamp-2 text-sm font-medium text-primary-strong">
                          {zone.value}
                        </span>
                        <button
                          type="button"
                          className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/80 hover:text-slate-700"
                          onClick={() => zone.setValue(null)}
                          aria-label={`${zone.label} 보철물 제거`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <span className="mt-1 text-[11px] text-slate-400">
                        여기에 놓기
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <p className="px-5 pb-4 pt-1 text-center text-[11px] leading-relaxed text-slate-500">
            드래그해서 올려 주세요
          </p>

          <DialogFooter className="gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5 sm:flex-row sm:justify-end sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => setArchSelectModalOpen(false)}
            >
              취소
            </Button>
            <Button
              type="button"
              size="sm"
              className="rounded-xl"
              disabled={!archDropUpperType && !archDropLowerType}
              onClick={applyArchBulkProsthesisSelection}
            >
              적용
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={customSpecsModalTarget !== null}
        onOpenChange={(open) => {
          if (!open) cancelCustomSpecsModal();
        }}
      >
        <DialogContent
          className={cn(
            // 화면 중앙. 2단(스캔바디|심플어벗 좌우) 기준 폭. max-h로 뷰포트 넘침만 방지
            "guide-tour-nested-dialog flex max-h-[calc(100dvh-2rem)] w-[min(48rem,calc(100vw-1.5rem))] flex-col gap-3 overflow-hidden p-4 sm:max-w-[min(48rem,calc(100vw-1.5rem))] sm:p-5",
            // 프리셋 투어: 코치마크 자리 확보(상단 여백)
            isPresetGuideTourStep &&
              "!top-[10.5rem] !translate-y-0 max-h-[calc(100dvh-11.5rem)]",
            nestedDialogClassName,
          )}
          overlayClassName={cn(
            "guide-tour-nested-dialog-overlay",
            nestedDialogOverlayClassName,
          )}
          // 투어 코치「뒤로/다음」클릭이 모달 outside로 잡혀 즉시 닫히는 것 방지
          onPointerDownOutside={
            isPresetGuideTourStep
              ? (event) => {
                  event.preventDefault();
                }
              : undefined
          }
          onInteractOutside={
            isPresetGuideTourStep
              ? (event) => {
                  event.preventDefault();
                }
              : undefined
          }
          onFocusOutside={
            isPresetGuideTourStep
              ? (event) => {
                  event.preventDefault();
                }
              : undefined
          }
          {...(isOralSpotlight("oral_custom_abut")
            ? { "data-guide-tour": "oral_custom_abut" }
            : {})}
        >
          {typeof customSpecsModalTarget === "number" && toothWorks[customSpecsModalTarget] ? (
            (() => {
              const modalTooth = toothWorks[customSpecsModalTarget];
              const modalMode =
                lockedMode ?? resolveToothAbutmentProductMode(modalTooth);
              const alternateMode =
                modalMode === ABUTMENT_PRODUCT_MODE.PRODUCTION
                  ? ABUTMENT_PRODUCT_MODE.DESIGN_AND_PRODUCTION
                  : ABUTMENT_PRODUCT_MODE.PRODUCTION;
              const toothLabel = modalTooth.toothNumber
                ? ` (#${modalTooth.toothNumber})`
                : "";
              const switchToAlternateMode = () => {
                if (lockedMode) {
                  cancelCustomSpecsModal();
                  onAlternateAbutmentModeNavigate?.();
                  return;
                }
                const index = customSpecsModalTarget;
                const current = toothWorks[index];
                if (!current) return;
                const previous = resolveToothAbutmentProductMode(current);
                if (
                  previous === alternateMode &&
                  isAbutmentProductMode(current.abutmentProductMode)
                ) {
                  return;
                }
                setToothWorks((prev) => {
                  const row = prev[index];
                  if (!row) return prev;
                  const next = [...prev];
                  next[index] = {
                    ...row,
                    customAbutment: true,
                    abutmentProductMode: alternateMode,
                  };
                  return next;
                });
                if (previous !== alternateMode) {
                  void onDefaultAbutmentProductModeChange?.(alternateMode);
                }
              };
              const modalSpecs = pickToothWorkCustomSpecs(modalTooth, true);
              const customProsthesis = isCustomAbutmentProsthesisType(
                modalTooth.prosthesisType,
              );
              const simpleDisabled = customProsthesis;
              const simpleMode =
                !simpleDisabled && isSimpleAbutmentMode(modalSpecs);
              const scanbodySelected =
                !simpleMode &&
                Boolean(
                  modalSpecs.abutmentManufacturer ||
                    modalSpecs.abutmentDiameter ||
                    modalSpecs.abutmentHeight,
                );
              const implantReady = hasToothWorkImplantPreset(modalSpecs);
              const wizardStep = customSpecsWizardStep;
              return (
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
                  <DialogHeader className="shrink-0 space-y-1 text-left">
                    <DialogTitle className="text-lg">
                      {`커스텀어벗 설정${toothLabel}`}
                    </DialogTitle>
                    <p className="text-sm text-slate-500" aria-live="polite">
                      {wizardStep === "implant"
                        ? "1/2 · 임플란트 선택"
                        : customProsthesis
                          ? "2/2 · 스캔바디 선택"
                          : "2/2 · 스캔바디 또는 심플어벗"}
                    </p>
                    <DialogDescription className="sr-only">
                      {(() => {
                        const abutmentSideHint = customProsthesis
                          ? "임플란트를 선택한 뒤 스캔바디를 선택하면 저장되고 닫힙니다."
                          : "임플란트를 선택한 뒤 스캔바디 또는 심플어벗을 선택하면 저장되고 닫힙니다.";
                        if (
                          lockedMode === ABUTMENT_PRODUCT_MODE.DESIGN_AND_PRODUCTION
                        ) {
                          return `디자인+생산 의뢰가 선택됩니다. 생산만 의뢰는 어벗생산의뢰 페이지로 이동합니다. ${abutmentSideHint}`;
                        }
                        if (lockedMode === ABUTMENT_PRODUCT_MODE.PRODUCTION) {
                          return `생산만 의뢰가 선택됩니다. 디자인+생산 의뢰는 ${alternateAbutmentModePageLabel} 페이지로 이동합니다. ${abutmentSideHint}`;
                        }
                        return `${abutmentSideHint} 확인도 동일하고, 취소하면 열기 전 값으로 돌아갑니다.`;
                      })()}
                    </DialogDescription>
                  </DialogHeader>

                  {toothWorkGuideTourStep != null &&
                  !platformOralActive &&
                  toothWorkGuideTourStepId === "custom_abut" ? (
                    <PracticeToothWorkGuideTourBanner
                      step={toothWorkGuideTourStep}
                      onExit={exitToothWorkGuideTour}
                      onFinish={exitToothWorkGuideTour}
                      className="shrink-0"
                    />
                  ) : null}

                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-1.5 sm:p-2">
                      {wizardStep === "implant" ? (
                        <div
                          className={cn(
                            "flex min-h-0 min-w-0 flex-1 flex-col gap-1.5",
                            toothWorkGuideTourStepId === "custom_abut" &&
                              "practice-tooth-guide-pulse rounded-xl",
                          )}
                        >
                          <PracticeToothImplantFields
                            mode="presets"
                            allowPresetEdit
                            heading="임플란트"
                            className="min-h-0 flex-1 border-primary/50 bg-primary-soft/60"
                            guideOpenAdd={false}
                            value={modalSpecs}
                            onChange={(nextImplant) => {
                              patchCustomSpecsOnTooth(
                                customSpecsModalTarget,
                                nextImplant,
                              );
                            }}
                            connections={implantConnections}
                            favorites={implantFavorites}
                            onFavoritesChange={onImplantFavoritesChange}
                          />
                        </div>
                      ) : (
                        <div
                          className={cn(
                            "grid min-h-0 min-w-0 flex-1 grid-cols-1 items-stretch gap-2.5 sm:grid-cols-2",
                            toothWorkGuideTourStepId === "custom_abut" &&
                              "practice-tooth-guide-pulse rounded-xl",
                          )}
                        >
                          <PracticeToothAbutmentFields
                            mode="presets"
                            allowPresetEdit
                            heading="스캔바디"
                            dimmed={simpleMode}
                            className="min-h-0 border-service-abut-muted/90 bg-service-abut-soft/40"
                            guideOpenAdd={false}
                            value={modalSpecs}
                            onChange={(nextAbutment) => {
                              patchCustomSpecsOnTooth(
                                customSpecsModalTarget,
                                nextAbutment,
                              );
                            }}
                            favorites={abutmentFavorites}
                            onFavoritesChange={onAbutmentFavoritesChange}
                          />
                          <PracticeToothSimpleAbutmentFields
                            heading="심플어벗"
                            dimmed={!simpleDisabled && scanbodySelected}
                            disabled={simpleDisabled}
                            disabledHint="커스텀어벗 형태에서는 스캔바디만 선택할 수 있습니다."
                            className="min-h-0 border-service-abut-muted/90 bg-service-abut-soft/40"
                            value={modalSpecs}
                            onChange={(nextSimple) => {
                              patchCustomSpecsOnTooth(
                                customSpecsModalTarget,
                                nextSimple,
                              );
                            }}
                          />
                        </div>
                      )}
                    </div>

                    <PracticeCustomSpecsPresetEditDialog
                      open={customSpecsPresetEditOpen}
                      onOpenChange={setCustomSpecsPresetEditOpenSafe}
                      className={nestedDialogClassName}
                      overlayClassName={nestedDialogOverlayClassName}
                      value={pickToothWorkCustomSpecs(modalTooth, true)}
                      onImplantChange={(nextImplant) => {
                        patchCustomSpecsOnTooth(customSpecsModalTarget, nextImplant);
                      }}
                      onAbutmentChange={(nextAbutment) => {
                        patchCustomSpecsOnTooth(customSpecsModalTarget, nextAbutment);
                      }}
                      connections={implantConnections}
                      implantFavorites={implantFavorites}
                      onImplantFavoritesChange={onImplantFavoritesChange}
                      abutmentFavorites={abutmentFavorites}
                      onAbutmentFavoritesChange={onAbutmentFavoritesChange}
                    />
                  </div>

                  <DialogFooter className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 sm:space-x-0">
                    <div className="flex flex-wrap items-center justify-start gap-2">
                      {wizardStep === "abutment" ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 min-w-[5.5rem]"
                          onClick={() => setCustomSpecsWizardStep("implant")}
                        >
                          <ChevronLeft className="mr-1 h-4 w-4" />
                          이전
                        </Button>
                      ) : implantReady ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 min-w-[5.5rem]"
                          onClick={() => setCustomSpecsWizardStep("abutment")}
                        >
                          다음
                          <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                    <div className="flex justify-center">
                      <Button
                        type="button"
                        className={
                          alternateMode === ABUTMENT_PRODUCT_MODE.PRODUCTION
                            ? "h-auto min-h-10 whitespace-normal rounded-lg border border-[hsl(46_85%_45%)] bg-[hsl(48_96%_58%)] px-3.5 py-1.5 text-center text-[13px] font-semibold leading-snug text-slate-900 shadow-sm hover:bg-[hsl(48_96%_50%)]"
                            : "h-10 min-w-[5.5rem] border-2 border-[hsl(46_85%_52%)] bg-[hsl(48_96%_58%)] px-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-[hsl(48_96%_50%)]"
                        }
                        onClick={switchToAlternateMode}
                      >
                        {alternateMode === ABUTMENT_PRODUCT_MODE.PRODUCTION ? (
                          <span className="flex flex-col items-center text-center">
                            <span>STL 디자인 파일로</span>
                            <span>어벗 생산만 의뢰</span>
                          </span>
                        ) : (
                          ABUTMENT_PRODUCT_MODE_LABEL[alternateMode]
                        )}
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 min-w-[5.5rem]"
                        onClick={cancelCustomSpecsModal}
                      >
                        취소
                      </Button>
                      <Button
                        type="button"
                        className="h-10 min-w-[5.5rem]"
                        onClick={confirmCustomSpecsModal}
                      >
                        확인
                      </Button>
                    </div>
                  </DialogFooter>
                </div>
              );
            })()
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};

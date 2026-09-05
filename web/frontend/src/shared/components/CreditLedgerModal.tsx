// change-log:
// - 2026-09-05: 요약 충전 카드 라벨「충전」(치과·기공소 공통, 유료 접두 제거)·안내 툴팁 정리.
// - 2026-09-05: 데모 모드 충전 카드 라벨「충전」(유료/선수금 아님)·가상 잔고 안내.
// - 2026-09-05: 요약 수식에서 무료 충전 카드 제거(유료 [+정산] − 소비). 잔여 무료 버킷은 compact만.
// - 2026-09-05: 기공소 현재 잔액 — spendableBalance(정산 적립 포함). balance(유료+무료)만 쓰던 버그 수정.
// - 2026-09-05: 데모/실사용 집계 필터·2줄 잔액·행「데모」뱃지 제거. 잔액 음수 표시 허용.
// - 2026-09-01: PTX 결제보류 — hold/adjust가 여러 저널로 흩어져도 목록·호버 금액을 견적(heldTotal)과 맞춤.
// - 2026-08-31: 요약 소비 카드 라벨「소비」(구「기공, 스토어」). 치과·기공소 공통.
// - 2026-08-31: 기공소 내역 요약 — 치과와 동일 +/− 수식(유료·무료·정산 적립·기공/스토어). 기간 필터는 카드만.
// - 2026-08-31: 기공소 — PTX 적립 보류 라벨·labShareOnly.
// - 2026-08-31: 유형 라벨 — 치과(구강스캔/어벗디자인)·기공소(치과로부터 수신/어벗츠로 의뢰).
// - 2026-08-26: 치과 요약 — 유료/무료 충전·소비는 기간 합계(잔여 버킷 아님). HOLD 소비 반영.
// - 2026-08-23: 내역 테이블 — scroll-x-bar-top을 flex-1 세로 스크롤과 분리(rotateX로 행이 아래로 붙던 문제).
// - 2026-08-22: 기공소→치과 배송 무료 — lab_shipping hold 미표시·레거시 baked 제거. 소비총액=기공비+(→어벗츠 박스만).
// - 2026-08-21: 어벗디자인 상세 — PTX 레거시 배송 hold는 합산에서 제외(Request 박스 SSOT).
// - 2026-08-21: 어벗디자인 상세 — 의뢰비·배송비에 지급완료/지급보류 뱃지.
// - 2026-08-21: 기공소 장부 — PTX CA 생산+기공소→어벗츠 배송을 박스키로 한 행. 치과는 레거시 배송 합산 표시 제거.
// - 2026-08-21: 기공의뢰(PTX) 정산에서 기공소→어벗츠 배송 제외(기공소 부담·의뢰 박스 행).
// - 2026-08-21: 치과→기공소 배송 무료 — baked labShipping·정산 줄 제거. 소비총액=기공비+→어벗츠만.
// - 2026-08-21: 기공수가 배송비(기공비 hold 합산)를 크레딧 호버·정산 상세에 분리. 견적 툴팁은 그대로 배송비 없음.
// - 2026-08-21: 기공소 크레딧 내역 — 지급상태·금액호버·상세를 치과와 동일(기공크레딧 잔액/필터만 lab).
// - 2026-08-20: PeriodFilter 달력·chevron 커스텀 기간을 원장 조회 from/to에 반영.
// - 2026-08-19: 구강스캔 호버 — 보철기공비|어벗 디자인+생산비는 견적(6만·2.5만). 경로 보류(7만+1.5만) 아님.
// - 2026-08-19: 어벗디자인·어벗생산은 의뢰 사업자+예정출고일로 1행·배송비 1건(치과명 무관).
// - 2026-08-19: 내역 무한스크롤을 10건 단위로 가져와 첫 화면을 빨리 연다.
// - 2026-08-19: 어벗디자인으로 행도 보류/일부 지급/지급 완료 상태를 표시.
// - 2026-08-19: 의뢰비·배송비 보류를 기공의뢰-어벗디자인으로 묶음. 기존 기공의뢰는 구강스캔으로.
// - 2026-08-19: 견적 상세 — 보철기공비|어벗 디자인+생산비(둘 다 기공비). 기공소몫/어벗츠몫 헤더 제거.
// - 2026-08-17: (레거시) 기공소 지급 상태는 기공비만 — 2026-08-21 치과와 동일로 복귀.
// - 2026-08-17: 기공소 기공의뢰 행 — 치과와 동일(기공비에 디자인 합침·일부 지급·상세 모달).
// - 2026-08-17: 기공소 보철기공비+디자인비(+지그)를 한 기공의뢰 행으로 묶음.
// - 2026-08-17: 잔액 카드를 정산 공통 SettlementStatCard로 교체.
// - 2026-08-17: 견적 상세 모달 — 환자·기공소·주문일·치과도착일·메모 표시.
// - 2026-08-17: 견적 상세 모달 — 기공소몫/어벗츠몫 보류·실지급을 각각 전달.
// - 2026-08-17: 금액 호버 툴팁 + 행 클릭 시 견적 상세 모달(첨1).
// - 2026-08-17: 기공소/어벗츠 비용 상세 Popover를 금액 열에 배치.
// - 2026-08-17: 기공소/어벗츠 비용 행 — 클릭 시 견적 툴팁 스타일 상세(Popover).
// - 2026-08-17: PTX 비용 툴팁 — 경로(치과→기공소/어벗츠) 중간행 제거, 항목만 표시.
// - 2026-08-17: 기공의뢰 크레딧 행을 기공소 비용 / 어벗츠 비용으로 분리(몫별 보류 라벨).
// - 2026-08-17: 기공의뢰 행 유형/금액 colSpan 해제 — 유형 열 가운데 정렬.
// - 2026-08-17: 기공의뢰 pending → 「기공의뢰 보류」표시. 장부 셀·PTX 트리 가운데 정렬.
// - 2026-08-17: 동일 PTX 기공의뢰 크레딧 행을 한 건으로 묶어 표시(세부 라벨·합계).
// - 2026-08-17: PTX 묶음 행 — 치과→기공소/어벗츠 트리(기공비·디자인·어벗제작·배송).
// - 2026-08-17: PTX 트리 — ASCII 이중선 제거, 인덴트·접기/펼치기.
// - 2026-08-17: 크레딧 기공의뢰 — 호버 툴팁에 기공비 내역. 거래내역은 기공소/환자명.
// - 2026-08-15: 테이블 잔액 칼럼 라벨「잔액」(행 시점 총잔액=유료+무료+기공).
// - 2026-08-15: 선입금 안내를 유료 카드 툴팁으로 이동. 현재잔액=유료+무료(+기공). 무료·기공 툴팁 추가.
// - 2026-08-17: 기공소몫/어벗츠몫 보류·플랫폼 수수료 displayLabel 우선 표시.
// - 2026-08-17: PRACTICE_TRANSFER 거래내역 — 배송비 displayLabel이면 배송비로 표시.
// - 2026-08-14: 내역에 유료 크레딧=기공료 선입금(선납) 안내 표시.
// - 2026-08-14: 내역 필터를 버킷(유료/무료/기공)·동작(충전/소비/조정) 이원으로 교체. 기공비 보류 라벨.
// - 2026-08-14: 치과·기공소 크레딧 내역 UI — 잔액 카드·필터·테이블을 기공크레딧 탭과 동일 최신 스타일로 정리.
// - 2026-08-13: 기공크레딧 표기 통일(잔액·필터·유형 라벨). 상단 잔액 요약(현재/유료/무료/정산) 중앙 정렬.
// - 2026-08-12: 치과는 기공크레딧 잔액/필터 숨김. 유료→유료크레딧. 기공소만 settlement 버킷 표시.
// - 2026-08-11: 초기 로드 시 테이블 스켈레톤(텍스트 "불러오는 중..." 대체).
// - 2026-08-11: 중복 일자(from~to) 입력 제거. 검색을 초기화 버튼 우측으로 이동.
// - 2026-08-11: embedded 무한스크롤 — sentinel 재마운트 시 IntersectionObserver 재연결.
// - 2026-08-11: embedded 모드에서 "크레딧 내역" 제목 숨김(탭 라벨로 충분). Dialog는 유지.
// - 2026-08-23: 스토어 유형 라벨·결제 상태 표기. 요약 카드「기공, 스토어」.
// - 2026-08-23: 요약 카드 안내 — 현재 잔액(선불금 잔여액), 기공료·쇼핑 라벨·툴팁.
// - 2026-08-23: 요약 카드 클릭 → 필터된 CreditLedgerModal 드릴다운. 안내 문구는 툴팁만.
// - 2026-08-23: 치과 기간 소비 — 카드 하단 PeriodFilter·별도 집계 조회. YMD from/to.
// - 2026-08-23: 치과 정산 내역 상단 — 소비액(필터기간) 카드. 클릭 시 소비 필터.
// - 2026-08-22: initialFilters·hideBalanceSummary·detailTitle — 통계 탭 드릴다운.
// - 2026-08-11: embedded 모드 추가 — 의뢰자 크레딧 페이지에서 Dialog 없이 동일 원장 UI 사용.
// - 2026-08-09: 잔액 요약 우측에 [충전] 버튼 노출 (chargeNavPath 제공 시).
// - 2026-08-04: 의뢰 차감 행에 신속/묶음배송 뱃지 표시. (display-only)
// - 2026-08-03: Credit ledger detail row의 공정 배지 표시를 normalizeStageLabel 기반으로 정규화(의뢰 -> 준비). (display-only)
// related files:
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/requestor/dashboard/RequestorDashboardPage.tsx
// - web/frontend/src/pages/requestor/credits/RequestorCreditsPage.tsx
// - web/frontend/src/pages/admin/credits/AdminCreditPage.tsx
// - web/frontend/src/features/settings/tabs/LabSettlementPayoutTab.tsx
// - web/frontend/src/shared/ui/skeletons/RequestorCreditsPageSkeleton.tsx
// - web/frontend/src/shared/realtime/useAppEventDebouncedReload.ts
// - web/frontend/src/shared/realtime/creditBalanceEvent.ts
// - web/frontend/src/shared/shipping/ShippingModeBadge.tsx
// - web/frontend/src/shared/legal/creditPrepaidCopy.ts
// - web/frontend/src/shared/demo/demoModeCopy.ts
// - web/backend/controllers/credits/creditLedger.controller.js
// - web/backend/controllers/credits/creditLedger.utils.js
// - web/backend/controllers/admin/adminCredit.controller.js
// - web/frontend/src/shared/components/AbutmentDesignLedgerDetailDialog.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { getNormalizedStageLabelSafe } from "@/utils/stage";
import { useAppEventDebouncedReload } from "@/shared/realtime/useAppEventDebouncedReload";
import { isCreditEventForBusiness } from "@/shared/realtime/creditBalanceEvent";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowDown, ArrowUp, ArrowUpDown, CircleHelp, CreditCard } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreditLedgerTableSkeleton } from "@/shared/ui/skeletons/RequestorCreditsPageSkeleton";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { generateModelNumber } from "@/utils/modelNumber";
import { PeriodFilter, type PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import { appendPeriodQueryParams } from "@/store/usePeriodStore";
import { cn } from "@/shared/ui/cn";
import { RESPONSIVE } from "@/shared/ui/responsive";
import {
  RequestDetailDialog,
  type RequestDetailDialogRequest,
} from "@/features/requests/components/RequestDetailDialog";
import { ShippingModeBadge } from "@/shared/shipping/ShippingModeBadge";
import type { ShippingMode } from "@/shared/shipping/shippingMode";
import {
  SettlementEquationOperator,
  SettlementStatCard,
} from "@/shared/settlement/settlementUi";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  PracticeTransferFeeEstimate,
  type PracticeTransferSettlementShippingLine,
} from "@/shared/components/practice/PracticeTransferFeeEstimate";
import {
  AbutmentDesignLedgerDetailDialog,
  type AbutmentDesignItemPayoutStatus,
  type AbutmentDesignLedgerDetail,
} from "@/shared/components/AbutmentDesignLedgerDetailDialog";
import {
  parsePracticeTransferFeeQuote,
  type PracticeTransferFeeQuote,
} from "@/shared/practice/practiceTransferFeeQuote";
import {
  canonicalizeFeeItemName,
  LAB_FEE_SHIPPING_ITEM_NAME,
} from "@/shared/practice/labFeeSchedule";
import { parsePracticeTransferMemoMeta } from "@/shared/practice/transferMemo";
import { formatKstYmdToKo } from "@/shared/date/kst";
import {
  CREDIT_FREE_BUCKET_HINT,
  CREDIT_LEDGER_FREE_NOTICE_BODY,
  CREDIT_LEDGER_PREPAID_NOTICE_BODY,
  CREDIT_LEDGER_SETTLEMENT_NOTICE_BODY,
  CREDIT_PAID_BUCKET_HINT,
  CREDIT_SETTLEMENT_BUCKET_HINT,
} from "@/shared/legal/creditPrepaidCopy";
import {
  CREDIT_LEDGER_CHARGE_DETAIL_TITLE,
  CREDIT_LEDGER_CHARGE_LABEL,
  CREDIT_LEDGER_DEMO_BALANCE_HINT,
  CREDIT_LEDGER_DEMO_CHARGE_HINT,
  CREDIT_LEDGER_DEMO_NOTICE_BODY,
  CREDIT_LEDGER_DEMO_PERIOD_SPEND_HINT,
} from "@/shared/demo/demoModeCopy";

type CreditLedgerType =
  | "CHARGE_PAID"
  | "CHARGE_FREE_REQUEST"
  | "CHARGE_FREE_SHIPPING"
  | "SPEND_PAID"
  | "SPEND_FREE_REQUEST"
  | "SPEND_FREE_SHIPPING"
  | "SPEND_SETTLEMENT"
  | "SPEND_HOLD"
  | "LAB_SETTLEMENT_CHARGE"
  | "LAB_SETTLEMENT_PAYOUT"
  | "ADJUST";

type LedgerCreditKindFilter = "all" | "PAID" | "FREE" | "SETTLEMENT";
type LedgerActionFilter = "all" | "CHARGE" | "SPEND" | "ADJUST";

export type CreditLedgerStatsCategory =
  | "charge"
  | "practice_transfer"
  | "abutment_production"
  | "shipping"
  | "store"
  | "settlement_earn"
  | "settlement_payout"
  | "adjust"
  | "other";

export type CreditLedgerInitialFilters = {
  period?: PeriodFilterValue;
  customStartDate?: string;
  customEndDate?: string;
  creditKind?: LedgerCreditKindFilter;
  action?: LedgerActionFilter;
  q?: string;
  partnerName?: string;
  prosthesisType?: string;
  statsCategory?: CreditLedgerStatsCategory;
  statsCategories?: string;
  onYmd?: string;
};

type ResolvedLedgerFilters = {
  period: PeriodFilterValue;
  customStartDate: string;
  customEndDate: string;
  creditKind: LedgerCreditKindFilter;
  action: LedgerActionFilter;
  q: string;
  partnerName: string;
  prosthesisType: string;
  statsCategory: CreditLedgerStatsCategory | "";
  statsCategories: string;
  onYmd: string;
};

function resolveLedgerFilters(
  initial?: CreditLedgerInitialFilters,
): ResolvedLedgerFilters {
  return {
    period: initial?.period ?? "30d",
    customStartDate: initial?.customStartDate ?? "",
    customEndDate: initial?.customEndDate ?? "",
    creditKind: initial?.creditKind ?? "all",
    action: initial?.action ?? "all",
    q: initial?.q ?? "",
    partnerName: initial?.partnerName ?? "",
    prosthesisType: initial?.prosthesisType ?? "",
    statsCategory: initial?.statsCategory ?? "",
    statsCategories: initial?.statsCategories ?? "",
    onYmd: initial?.onYmd ?? "",
  };
}

type CreditLedgerItem = {
  _id: string;
  type: CreditLedgerType;
  amount: number;
  spentPaidAmount?: number | null;
  spentFreeAmount?: number | null;
  refType?: string;
  refId?: string | null;
  refRequestId?: string;
  refPracticeTransferId?: string;
  uniqueKey: string;
  displayLabel?: string | null;
  spendKind?: string | null;
  includesExpressSurcharge?: boolean;
  createdAt: string;
  balanceAfter?: number;
  patientName?: string;
  labName?: string;
  /** 기공의뢰 원본 메모(메타 포함) — 상세 모달 주문일·도착일·메모 파싱용 */
  transferMemo?: string | null;
  /** 기공의뢰 CA 디자인비 저널이 가리키는 PTX */
  relatedPracticeTransferId?: string | null;
  ledgerSource?: string | null;
  /** 기공의뢰 에스크로 보류 중(heldAt && !settledAt) */
  practiceTransferPending?: boolean;
  /** 기공소몫 미정산(heldAt && !labSettledAt && !settledAt) */
  practiceTransferLabPending?: boolean;
  /** 어벗츠몫 미정산(heldAt && !abutmentSettledAt && !settledAt) */
  practiceTransferAbutmentPending?: boolean;
  /** 보류 미러 등 — 잔액 러닝에 아직 미반영 */
  excludeFromBalanceRunning?: boolean;
  /** 보류/배송 몫: lab | abutment | lab_shipping | abuts_shipping */
  holdShare?: string | null;
  /** 기공의뢰 견적(행 클릭 상세 모달) */
  feeQuote?: PracticeTransferFeeQuote | null;
  skipJig?: boolean;
  rushProcessing?: boolean;
  tooth?: string;
  clinicName?: string;
  manufacturerStage?: string;
  shippingMode?: ShippingMode | string | null;
  freeReason?: string;
  trackingNumbers?: string[];
  mailboxAddress?: string;
  shippingPackageId?: string;
  shippingReceiverGroupKey?: string;
  recipientName?: string;
  requestorBusinessName?: string;
  requestorBusinessAnchorId?: string;
  estimatedShipYmd?: string;
  abutmentBoxGroupKey?: string;
  shippingPackageRequestCount?: number;
  shippingPackageRequestIds?: string[];
  lotNumber?: {
    value?: string;
  } | null;
  refRequestSummary?: {
    requestId?: string;
    manufacturerStage?: string;
    patientName?: string;
    tooth?: string;
    clinicName?: string;
    shippingMode?: ShippingMode | string | null;
    finalShipping?: { mode?: string | null } | null;
    originalShipping?: { mode?: string | null } | null;
    lotNumber?: {
      value?: string;
    } | null;
    mailboxAddress?: string;
    shippingPackageId?: string;
    shippingReceiverGroupKey?: string;
    recipientName?: string;
    requestorBusinessName?: string;
    requestorBusinessAnchorId?: string;
    estimatedShipYmd?: string;
    abutmentBoxGroupKey?: string;
    relatedPracticeTransferId?: string;
    shippingReceiver?: {
      name?: string;
      address?: string;
      addressDetail?: string;
      zipCode?: string;
      phone?: string;
    } | null;
  } | null;
  caseInfos?: {
    clinicName?: string;
    patientName?: string;
    tooth?: string;
    implantManufacturer?: string;
    implantBrand?: string;
    implantFamily?: string;
    implantType?: string;
    maxDiameter?: number | null;
    connectionDiameter?: number | null;
  } | null;
};

type CreditBalanceSnapshot = {
  balance: number;
  paidCredit: number;
  freeRequestCredit?: number;
  freeShippingCredit?: number;
  freeCredit?: number;
  settlementCredit?: number;
  spendableBalance?: number;
  realBalance?: number;
  requestorKind?: "practice" | "lab" | null;
  showSettlementCredit?: boolean;
  demoMode?: boolean;
  updatedAt?: string | null;
};

type PeriodSpendSummary = {
  totalPaidChargeSupply?: number;
  totalFreeChargeSupply?: number;
  totalSpendSupply: number;
  totalSettlementEarnSupply?: number;
};

type SummaryDrillDownState = {
  title: string;
  filters: CreditLedgerInitialFilters;
} | null;

export type CreditLedgerModalProps = {
  /** embedded=false(기본)일 때 Dialog open. embedded면 무시하고 항상 로드 */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 관리자가 특정 조직의 원장을 볼 때 사용. 없으면 로그인 유저 기준 */
  businessAnchorId?: string;
  /** 모달 제목 suffix (예: "· org-001") */
  titleSuffix?: string;
  /** 충전하기 버튼 클릭 시 이동할 경로. 없으면 버튼 숨김 */
  chargeNavPath?: string;
  /** true면 Dialog 없이 페이지 패널로 렌더 */
  embedded?: boolean;
  className?: string;
  /** 통계 등 드릴다운 — 열릴 때 필터 프리셋 */
  initialFilters?: CreditLedgerInitialFilters;
  /** embedded가 아닐 때 Dialog 제목(미설정 시 크레딧 내역) */
  detailTitle?: string;
  /** true면 상단 잔액 카드 숨김(드릴다운) */
  hideBalanceSummary?: boolean;
};

const PAGE_SIZE = 10;

type SortDirection = "asc" | "desc";
type LedgerSortKey = "createdAt" | "type" | "amount" | "balanceAfter" | "detail";

const typeLabel = (t: CreditLedgerType) => {
  if (t === "CHARGE_PAID") return "유료충전(선입금)";
  if (t === "CHARGE_FREE_REQUEST") return "무료충전(의뢰)";
  if (t === "CHARGE_FREE_SHIPPING") return "무료충전(배송)";
  if (t === "SPEND_PAID") return "사용(선입금)";
  if (t === "SPEND_FREE_REQUEST") return "사용(무료)";
  if (t === "SPEND_FREE_SHIPPING") return "사용(무료)";
  if (t === "SPEND_SETTLEMENT") return "사용(기공크레딧)";
  if (t === "SPEND_HOLD") return "기공비 보류";
  if (t === "LAB_SETTLEMENT_CHARGE") return "기공크레딧 적립";
  if (t === "LAB_SETTLEMENT_PAYOUT") return "기공크레딧 정산";
  return "조정";
};

const STORE_ORDER_TYPE_LABEL = "스토어";

const isStoreOrderLedgerItem = (item: { refType?: string }) =>
  String(item?.refType || "").trim().toUpperCase() === "STORE_ORDER";

type LedgerDisplayPart = {
  label: string;
  amount: number;
  spentPaidAmount: number;
  spentFreeAmount: number;
};

type PracticeTransferRoute = "lab" | "abuts" | "other";

/** 기공의뢰 크레딧 지급 진행 상태(몫별 정산) */
type PracticeTransferPayoutStatus = "hold" | "partial" | "settled";

type LedgerDisplayRow = {
  key: string;
  createdAt: string;
  amount: number;
  balanceAfter?: number;
  spentPaidAmount: number;
  spentFreeAmount: number;
  type: CreditLedgerType;
  displayLabel: string;
  parts: LedgerDisplayPart[] | null;
  practiceTransferPending: boolean;
  practiceTransferPayoutStatus: PracticeTransferPayoutStatus | null;
  isPracticeTransfer: boolean;
  isAbutmentDesign: boolean;
  requestCount: number;
  recipientName: string;
  mailboxAddress: string;
  members: CreditLedgerItem[];
  item: CreditLedgerItem;
};

/** 사이드바 SSOT: 치과 구강스캔으로 ↔ 기공소 치과로부터 수신 */
const PRACTICE_TRANSFER_TYPE_LABEL = "기공의뢰-구강스캔으로";
const LAB_RECEIVE_TYPE_LABEL = "기공의뢰-치과로부터 수신";
/** 사이드바 SSOT: 치과 어벗디자인으로 ↔ 기공소 어벗츠로 의뢰 */
const ABUTMENT_DESIGN_TYPE_LABEL = "기공의뢰-어벗디자인으로";
const LAB_ABUTS_REQUEST_TYPE_LABEL = "기공의뢰-어벗츠로 의뢰";

const resolvePracticeTransferTypeLabel = (isLabViewer: boolean) =>
  isLabViewer ? LAB_RECEIVE_TYPE_LABEL : PRACTICE_TRANSFER_TYPE_LABEL;

const resolveAbutmentDesignTypeLabel = (isLabViewer: boolean) =>
  isLabViewer ? LAB_ABUTS_REQUEST_TYPE_LABEL : ABUTMENT_DESIGN_TYPE_LABEL;

const practiceTransferPayoutStatusLabel = (
  status: PracticeTransferPayoutStatus,
  isLabViewer = false,
) => {
  if (isLabViewer) {
    if (status === "settled") return "적립 완료";
    if (status === "partial") return "일부 적립";
    return "적립 보류";
  }
  if (status === "settled") return "결제 완료";
  if (status === "partial") return "일부 결제";
  return "결제 보류";
};

const practiceTransferPayoutStatusClass = (
  status: PracticeTransferPayoutStatus,
) => {
  if (status === "settled") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (status === "partial") {
    return "border-sky-200 bg-sky-50 text-sky-800";
  }
  return "border-amber-200 bg-amber-50 text-amber-900";
};

const resolvePracticeTransferRoute = (
  item: CreditLedgerItem,
): PracticeTransferRoute => {
  const share = String(item.holdShare || "").trim();
  if (share === "lab" || share === "lab_shipping") return "lab";
  if (share === "abutment" || share === "abuts_shipping") return "abuts";

  const label = String(item.displayLabel || "");
  if (label.includes("어벗츠") || label.includes("어벗제작") || label.includes("어벗생산")) {
    return "abuts";
  }
  if (label.includes("기공소")) return "lab";
  // 디자인비(+지그)는 기공소 경로
  if (label.includes("디자인") || label.includes("지그")) return "lab";
  return "other";
};

const resolvePracticeTransferPending = (
  item: CreditLedgerItem,
  route: PracticeTransferRoute = "other",
  members?: CreditLedgerItem[],
) => {
  if (route === "lab") {
    if (item.practiceTransferLabPending === true) return true;
    if (item.practiceTransferLabPending === false) return false;
    if (Array.isArray(members)) {
      if (members.some((m) => m.practiceTransferLabPending === true)) return true;
      if (members.some((m) => m.practiceTransferLabPending === false)) {
        return false;
      }
    }
  }
  if (route === "abuts") {
    if (item.practiceTransferAbutmentPending === true) return true;
    if (item.practiceTransferAbutmentPending === false) return false;
    if (Array.isArray(members)) {
      if (members.some((m) => m.practiceTransferAbutmentPending === true)) {
        return true;
      }
      if (members.some((m) => m.practiceTransferAbutmentPending === false)) {
        return false;
      }
    }
  }
  if (item.practiceTransferPending === true) return true;
  if (item.practiceTransferPending === false) return false;
  if (Array.isArray(members)) {
    if (members.some((m) => m.practiceTransferPending === true)) return true;
    if (members.some((m) => m.practiceTransferPending === false)) return false;
  }
  return String(item.type || "") === "SPEND_HOLD";
};

/** 기공소/어벗츠 몫 존재 여부에 따라 지급 보류·일부 지급·지급 완료.
 * labShareOnly: 기공소 장부 — 기공비(보철+디자인)만. 어벗츠 생산비는 무시. */
const resolvePracticeTransferPayoutStatus = (
  item: CreditLedgerItem,
  members?: CreditLedgerItem[],
  labShareOnly = false,
): PracticeTransferPayoutStatus | null => {
  const list =
    Array.isArray(members) && members.length > 0 ? members : [item];
  const looksLikePtx = list.some((row) => {
    if (String(row.refType || "") === "PRACTICE_TRANSFER") return true;
    if (String(row.ledgerSource || "").trim() === "abutment_design_lab_fee") {
      return true;
    }
    return String(row.uniqueKey || "").includes("abutment_design_fee");
  });
  if (!looksLikePtx) return null;

  if (labShareOnly) {
    return resolvePracticeTransferPending(item, "lab", list)
      ? "hold"
      : "settled";
  }

  let hasLab = false;
  let hasAbuts = false;
  for (const row of list) {
    const route = resolvePracticeTransferRoute(row);
    if (route === "abuts") hasAbuts = true;
    else if (route === "lab") hasLab = true;
  }

  // 기공소 장부에는 어벗츠몫 라인이 없어도, 의뢰 스냅샷이 있으면 치과와 같이 일부 지급을 표시한다.
  const quote =
    parsePracticeTransferFeeQuote(item.feeQuote) ||
    list
      .map((row) => parsePracticeTransferFeeQuote(row.feeQuote))
      .find(Boolean) ||
    null;
  const quoteHasAbuts =
    Math.max(0, Number(quote?.abutmentRetailTotal || 0)) > 0 ||
    Math.max(0, Number(quote?.abutmentQty || 0)) > 0;
  const hasLabFlag = list.some(
    (row) =>
      row.practiceTransferLabPending === true ||
      row.practiceTransferLabPending === false,
  );
  const hasAbutsFlag = list.some(
    (row) =>
      row.practiceTransferAbutmentPending === true ||
      row.practiceTransferAbutmentPending === false,
  );
  if (hasLabFlag) hasLab = true;
  if (hasAbutsFlag && (quoteHasAbuts || hasAbuts)) hasAbuts = true;

  const pendingFlags: boolean[] = [];
  if (hasLab) {
    pendingFlags.push(resolvePracticeTransferPending(item, "lab", list));
  }
  if (hasAbuts) {
    pendingFlags.push(resolvePracticeTransferPending(item, "abuts", list));
  }
  if (pendingFlags.length === 0) {
    return resolvePracticeTransferPending(item, "other", list)
      ? "hold"
      : "settled";
  }

  const pendingCount = pendingFlags.filter(Boolean).length;
  if (pendingCount === 0) return "settled";
  if (pendingCount === pendingFlags.length) return "hold";
  return "partial";
};

const resolvePracticeTransferDisplayLabel = (
  item: CreditLedgerItem,
  isLabViewer = false,
) => {
  if (isStoreOrderLedgerItem(item)) return STORE_ORDER_TYPE_LABEL;
  if (String(item.refType || "") === "PRACTICE_TRANSFER") {
    return resolvePracticeTransferTypeLabel(isLabViewer);
  }
  // DEMO_CREDIT도 GL eventType은 CHARGE_FREE_REQUEST — 유형 배지만 데모로 구분
  if (String(item.refType || "").trim().toUpperCase() === "DEMO_CREDIT") {
    return "무료충전(데모)";
  }
  return String(item.displayLabel || "").trim() || typeLabel(item.type);
};
type PracticeTransferFeeKind =
  | "labFee"
  | "design"
  | "abutProduction"
  | "abutCombined"
  | "shipping"
  | "other";

type PracticeTransferTreeLeaf = {
  kind: PracticeTransferFeeKind;
  label: string;
  amount: number;
};

const FEE_KIND_ORDER: PracticeTransferFeeKind[] = [
  "labFee",
  "abutCombined",
  "shipping",
  "other",
];

const FEE_KIND_LABEL: Record<PracticeTransferFeeKind, string> = {
  labFee: "보철기공비",
  design: "어벗 디자인+생산비",
  abutProduction: "어벗 디자인+생산비",
  abutCombined: "어벗 디자인+생산비",
  shipping: "배송비",
  other: "기타",
};

const classifyPracticeTransferPart = (
  part: LedgerDisplayPart,
): { route: PracticeTransferRoute; kind: PracticeTransferFeeKind } => {
  const label = String(part.label || "");
  const toAbuts = label.includes("어벗츠");
  const toLab = label.includes("기공소");
  const route: PracticeTransferRoute = toAbuts
    ? "abuts"
    : toLab
      ? "lab"
      : "other";

  if (label.includes("배송")) return { route, kind: "shipping" };
  if (label.includes("디자인") || label.includes("지그")) {
    return { route: route === "other" ? "lab" : route, kind: "design" };
  }
  if (toAbuts || label.includes("어벗제작") || label.includes("어벗생산")) {
    return { route: "abuts", kind: "abutProduction" };
  }
  if (
    label.includes("기공비") ||
    label.includes("보류") ||
    label.includes("기공크레딧")
  ) {
    return { route: route === "other" ? "lab" : route, kind: "labFee" };
  }
  return { route, kind: "other" };
};

const settlementShippingRouteLabel = (route: PracticeTransferRoute) => {
  if (route === "abuts") return "기공소→어벗츠";
  if (route === "lab") return "치과→기공소";
  return "배송비";
};

/** 기공소→어벗츠 배송 — 기공소(의뢰자) 박스 과금. 치과 기공의뢰 정산에 포함하지 않음. */
const isLabToAbutsShippingPart = (part: LedgerDisplayPart) => {
  const label = String(part.label || "");
  if (label.includes("기공소→어벗츠") || label.includes("기공소 -> 어벗츠")) {
    return true;
  }
  const { route, kind } = classifyPracticeTransferPart(part);
  return kind === "shipping" && route === "abuts";
};

const isFeeQuoteShippingLine = (prosthesisType: string) =>
  canonicalizeFeeItemName(String(prosthesisType || "")) ===
  LAB_FEE_SHIPPING_ITEM_NAME;

/** 견적 기공비(배송 제외). 레거시 기공수가「배송비」라인도 제외. */
const quoteWorkTotalExcludingShipping = (
  quote: PracticeTransferFeeQuote | null | undefined,
): number => {
  if (!quote) return 0;
  const lines = Array.isArray(quote.lines) ? quote.lines : [];
  let fromLines = 0;
  let hasWorkLine = false;
  for (const line of lines) {
    if (isFeeQuoteShippingLine(String(line.prosthesisType || ""))) continue;
    const labFee = Math.max(0, Math.round(Number(line.labFee || 0)));
    const labAbutment = Math.max(
      0,
      Math.round(Number(line.labAbutmentFee || 0)),
    );
    const abutmentRetail = Math.max(
      0,
      Math.round(Number(line.abutmentRetail || 0)),
    );
    if (labFee + labAbutment + abutmentRetail <= 0) continue;
    hasWorkLine = true;
    fromLines += labFee + labAbutment + abutmentRetail;
  }
  if (hasWorkLine) return fromLines;
  const explicitShip = Math.max(
    0,
    Math.round(Number(quote.labShippingFee || 0)),
  );
  const labFeeTotal = Math.max(0, Math.round(Number(quote.labFeeTotal || 0)));
  const abutmentRetailTotal = Math.max(
    0,
    Math.round(Number(quote.abutmentRetailTotal || 0)),
  );
  return Math.max(0, labFeeTotal + abutmentRetailTotal - explicitShip);
};

/**
 * 장부 배송비 = 배송 라벨 행만.
 * 치과→기공소·기공소→어벗츠는 기공의뢰(PTX) 정산에서 제외.
 * 레거시: 기공비 hold에 배송이 합쳐진 경우 feeQuote 작업액과의 차이를 baked로 떼어 표시에서만 제외.
 */
const resolvePracticeTransferShippingAmounts = (
  parts: LedgerDisplayPart[] | null | undefined,
  feeQuote?: PracticeTransferFeeQuote | null,
): {
  explicitShippingAmount: number;
  bakedLabShippingAmount: number;
  workAmount: number;
} => {
  let explicitShippingAmount = 0;
  let workAmount = 0;
  for (const part of Array.isArray(parts) ? parts : []) {
    const { kind, route } = classifyPracticeTransferPart(part);
    const amount = Math.round(Number(part.amount || 0));
    if (kind === "shipping") {
      // 치과→기공소 무료 · 기공소→어벗츠는 기공소 박스 과금(PTX에 떠넘기지 않음)
      if (route === "lab" || route === "abuts" || isLabToAbutsShippingPart(part)) {
        continue;
      }
      explicitShippingAmount += amount;
      continue;
    }
    workAmount += amount;
  }

  let bakedLabShippingAmount = 0;
  if (feeQuote && workAmount !== 0) {
    const quoteWork = quoteWorkTotalExcludingShipping(feeQuote);
    const gap = Math.abs(workAmount) - quoteWork;
    if (quoteWork > 0 && gap > 0) {
      const sign = workAmount < 0 ? -1 : 1;
      bakedLabShippingAmount = sign * gap;
      workAmount = sign * quoteWork;
    }
  }

  return {
    explicitShippingAmount,
    bakedLabShippingAmount,
    workAmount,
  };
};

/**
 * PTX 묶음 행 표시 금액.
 * - 레거시: 기공비 hold에 배송이 합쳐져 장부 합 > 견적 → 견적 작업액으로 내림.
 * - 보류 중: hold/adjust가 여러 저널·페이지에 흩어지면 합 < 견적 → 견적(heldTotal)으로 올림.
 */
const resolveGroupedPracticeTransferDisplayAmount = ({
  rawAmount,
  workAmount,
  quote,
  pending,
  isLabViewer,
}: {
  rawAmount: number;
  workAmount: number;
  quote: PracticeTransferFeeQuote | null | undefined;
  pending: boolean;
  isLabViewer: boolean;
}) => {
  if (isLabViewer || !quote) return rawAmount;
  const quoteWork = quoteWorkTotalExcludingShipping(quote);
  if (quoteWork <= 0 || workAmount === 0) return rawAmount;

  const absRaw = Math.abs(rawAmount);
  const absWork = Math.abs(workAmount);

  if (absRaw > absWork) return workAmount;

  if (pending && absRaw < quoteWork) {
    const sign = rawAmount < 0 ? -1 : rawAmount > 0 ? 1 : workAmount < 0 ? -1 : 1;
    return sign * quoteWork;
  }

  return rawAmount;
};

/** 기공의뢰 정산 배송 줄 — 치과→기공소·기공소→어벗츠 제외. */
const toSettlementShippingLines = (
  parts: LedgerDisplayPart[] | null | undefined,
  creditLabHoldPending: boolean | null,
  creditAbutmentHoldPending: boolean | null,
  feeQuote?: PracticeTransferFeeQuote | null,
): PracticeTransferSettlementShippingLine[] => {
  void feeQuote;
  void creditLabHoldPending;
  void creditAbutmentHoldPending;
  const byKey = new Map<string, PracticeTransferSettlementShippingLine>();
  const upsert = (
    key: string,
    label: string,
    amount: number,
    holdPending: boolean | null,
  ) => {
    const abs = Math.abs(Math.round(Number(amount || 0)));
    if (abs <= 0) return;
    const prev = byKey.get(key);
    if (prev) {
      prev.amount += abs;
      return;
    }
    byKey.set(key, { key, label, amount: abs, holdPending });
  };

  (Array.isArray(parts) ? parts : []).forEach((part, index) => {
    const { route, kind } = classifyPracticeTransferPart(part);
    if (kind !== "shipping") return;
    if (route === "lab" || route === "abuts") return;
    if (isLabToAbutsShippingPart(part)) return;
    const key = `other:${index}`;
    upsert(key, settlementShippingRouteLabel("other"), Number(part.amount || 0), null);
  });

  return Array.from(byKey.values());
};

/** 정산 상세용: 기공비(배송 제외) + settlementShippingLines. 이중합산 금지. */
const quoteForCreditSettlementDetail = (
  quote: PracticeTransferFeeQuote,
  settlementShippingLines: PracticeTransferSettlementShippingLine[],
): PracticeTransferFeeQuote => {
  const work = quoteWorkTotalExcludingShipping(quote);
  const shipFromLines = settlementShippingLines.reduce(
    (sum, row) => sum + Math.max(0, Math.round(Number(row.amount || 0))),
    0,
  );
  const totalRaw = Math.max(0, Math.round(Number(quote.total || 0)));
  const labFeeRaw = Math.max(0, Math.round(Number(quote.labFeeTotal || 0)));
  const legacyShip = Math.max(
    0,
    Math.round(Number(quote.labShippingFee || 0)),
  );
  const workTotal = work > 0 ? work : Math.max(0, totalRaw - legacyShip);
  return {
    ...quote,
    labFeeTotal: Math.max(0, labFeeRaw - legacyShip),
    total: workTotal,
    labShippingFee: shipFromLines,
    lines: (Array.isArray(quote.lines) ? quote.lines : []).filter(
      (line) => !isFeeQuoteShippingLine(String(line.prosthesisType || "")),
    ),
  };
};

const addFeeLeafAmount = (
  byKind: Map<PracticeTransferFeeKind, number>,
  kind: PracticeTransferFeeKind,
  amount: number,
) => {
  const n = Math.round(Number(amount || 0));
  if (!n) return;
  byKind.set(kind, (byKind.get(kind) || 0) + n);
};

/** 치과 고시: 보철기공비=기공수가, 어벗 디자인+생산비=디자인+생산가. 정산 경로 보류(디자인비를 기공소몫에 합산)는 쓰지 않는다. */
const splitWorkAmountByFeeQuote = (
  workAmount: number,
  quote: PracticeTransferFeeQuote,
  labShareOnly: boolean,
): { prosthetic: number; abutment: number } => {
  const quoteWork = quoteWorkTotalExcludingShipping(quote);
  const abutmentQuote = Math.max(
    0,
    Math.round(Number(quote.abutmentRetailTotal || 0)),
  );
  const prostheticQuote = Math.max(0, quoteWork - abutmentQuote);
  if (workAmount === 0) return { prosthetic: 0, abutment: 0 };
  if (labShareOnly) {
    const mag = Math.abs(workAmount);
    const sign = workAmount < 0 ? -1 : 1;
    const prostheticMag = Math.min(mag, prostheticQuote);
    return {
      prosthetic: sign * prostheticMag,
      abutment: sign * (mag - prostheticMag),
    };
  }
  if (quoteWork <= 0) return { prosthetic: workAmount, abutment: 0 };
  const prosthetic = Math.round((workAmount * prostheticQuote) / quoteWork);
  return { prosthetic, abutment: workAmount - prosthetic };
};

/** 경로 행 없이 보철기공비·어벗 디자인+생산비·배송만 합산. 둘 다 기공비. */
const buildPracticeTransferFeeLeaves = (
  parts: LedgerDisplayPart[],
  quote?: PracticeTransferFeeQuote | null,
  labShareOnly = false,
  displayTotalAmount?: number | null,
): PracticeTransferTreeLeaf[] => {
  const byKind = new Map<PracticeTransferFeeKind, number>();
  const {
    explicitShippingAmount,
    bakedLabShippingAmount,
    workAmount: partsWorkAmount,
  } = resolvePracticeTransferShippingAmounts(parts, quote);
  let workAmount = partsWorkAmount;
  if (quote && displayTotalAmount != null) {
    const quoteWork = quoteWorkTotalExcludingShipping(quote);
    if (
      quoteWork > 0 &&
      Math.abs(displayTotalAmount) >= quoteWork &&
      Math.abs(workAmount) < quoteWork
    ) {
      workAmount =
        displayTotalAmount < 0 ? -quoteWork : quoteWork;
    }
  }
  // 치과→기공소 배송은 무료 — baked 합산분은 작업액에서만 제거하고 배송 줄로 올리지 않음.
  void bakedLabShippingAmount;
  const shippingAmount = explicitShippingAmount;

  const hasQuoteSplit =
    Boolean(quote) &&
    workAmount !== 0 &&
    (Math.round(Number(quote?.labFeeTotal || 0)) > 0 ||
      Math.round(Number(quote?.labAbutmentTotal || 0)) > 0 ||
      Math.round(Number(quote?.abutmentRetailTotal || 0)) > 0 ||
      quoteWorkTotalExcludingShipping(quote) > 0);

  if (hasQuoteSplit && quote) {
    const split = splitWorkAmountByFeeQuote(workAmount, quote, labShareOnly);
    addFeeLeafAmount(byKind, "labFee", split.prosthetic);
    addFeeLeafAmount(byKind, "abutCombined", split.abutment);
  } else {
    for (const part of parts) {
      const { kind } = classifyPracticeTransferPart(part);
      if (kind === "shipping") continue;
      const mapped: PracticeTransferFeeKind =
        kind === "design" || kind === "abutProduction" ? "abutCombined" : kind;
      addFeeLeafAmount(byKind, mapped, Number(part.amount || 0));
    }
    // 기공수가 배송비는 기공비 라벨 행에 합쳐져 있으므로 labFee에서 분리(레거시).
    // 정책상 치과→기공소 무료라 shipping 리프에는 올리지 않는다.
    if (bakedLabShippingAmount !== 0) {
      const peelOrder: PracticeTransferFeeKind[] = [
        "labFee",
        "abutCombined",
        "other",
      ];
      let remaining = bakedLabShippingAmount;
      for (const kind of peelOrder) {
        if (!remaining) break;
        const cur = byKind.get(kind) || 0;
        if (!cur) continue;
        if (Math.sign(cur) !== 0 && Math.sign(cur) !== Math.sign(remaining)) {
          continue;
        }
        const peel =
          Math.abs(remaining) <= Math.abs(cur) ? remaining : cur;
        const next = cur - peel;
        remaining -= peel;
        if (next === 0) byKind.delete(kind);
        else byKind.set(kind, next);
      }
    }
  }
  addFeeLeafAmount(byKind, "shipping", shippingAmount);

  return FEE_KIND_ORDER.filter((kind) => byKind.has(kind)).map((kind) => ({
    kind,
    label: FEE_KIND_LABEL[kind],
    amount: byKind.get(kind) || 0,
  }));
};

const formatSignedWon = (amount: number) => {
  const n = Math.round(Number(amount || 0));
  const abs = Math.abs(n).toLocaleString();
  if (n < 0) return `-${abs}원`;
  if (n > 0) return `+${abs}원`;
  return `0원`;
};

function PracticeTransferAmountHover({
  totalAmount,
  parts,
  feeQuote = null,
  labShareOnly = false,
}: {
  totalAmount: number;
  parts: LedgerDisplayPart[];
  feeQuote?: PracticeTransferFeeQuote | null;
  labShareOnly?: boolean;
}) {
  const leaves = useMemo(
    () =>
      buildPracticeTransferFeeLeaves(
        parts,
        feeQuote,
        labShareOnly,
        totalAmount,
      ),
    [parts, feeQuote, labShareOnly, totalAmount],
  );
  const detailLines =
    leaves.length > 0
      ? leaves
      : [
          {
            kind: "other" as const,
            label: PRACTICE_TRANSFER_TYPE_LABEL,
            amount: totalAmount,
          },
        ];

  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            title="마우스를 올리면 금액이 보입니다"
            className={cn(
              "mx-auto inline-flex items-center justify-center gap-1 rounded-lg px-1.5 py-1 font-medium tabular-nums transition-colors hover:bg-slate-50/80",
              totalAmount < 0 ? "text-destructive" : "text-primary-strong",
            )}
          >
            <span>{formatSignedWon(totalAmount)}</span>
            <CircleHelp
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80"
              aria-hidden
            />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="center"
          className="pointer-events-auto w-max max-w-[min(100vw-2rem,20rem)] select-text px-3 py-3 text-xs leading-relaxed"
        >
          <div className="space-y-1.5 tabular-nums">
            {detailLines.map((leaf) => (
              <p
                key={leaf.kind}
                className="flex items-center justify-between gap-4"
              >
                <span className="text-muted-foreground">{leaf.label}</span>
                <span className="font-medium text-foreground">
                  {formatSignedWon(leaf.amount)}
                </span>
              </p>
            ))}
            {detailLines.length > 1 ? (
              <p className="flex items-center justify-between gap-4 border-t border-foreground/15 pt-1.5 font-medium text-foreground">
                <span>합계</span>
                <span>{formatSignedWon(totalAmount)}</span>
              </p>
            ) : null}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function LedgerPartsAmountHover({
  totalAmount,
  parts,
}: {
  totalAmount: number;
  parts: LedgerDisplayPart[];
}) {
  const merged = useMemo(() => {
    const byLabel = new Map<string, number>();
    for (const part of parts) {
      const label = String(part.label || "").trim() || "기타";
      byLabel.set(label, (byLabel.get(label) || 0) + Number(part.amount || 0));
    }
    return [...byLabel.entries()].map(([label, amount]) => ({ label, amount }));
  }, [parts]);

  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            title="마우스를 올리면 금액이 보입니다"
            className={cn(
              "mx-auto inline-flex items-center justify-center gap-1 rounded-lg px-1.5 py-1 font-medium tabular-nums transition-colors hover:bg-slate-50/80",
              totalAmount < 0 ? "text-destructive" : "text-primary-strong",
            )}
          >
            <span>{formatSignedWon(totalAmount)}</span>
            <CircleHelp
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80"
              aria-hidden
            />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="center"
          className="pointer-events-auto w-max max-w-[min(100vw-2rem,20rem)] select-text px-3 py-3 text-xs leading-relaxed"
        >
          <div className="space-y-1.5 tabular-nums">
            {merged.map((row) => (
              <p
                key={row.label}
                className="flex items-center justify-between gap-4"
              >
                <span className="text-muted-foreground">{row.label}</span>
                <span className="font-medium text-foreground">
                  {formatSignedWon(row.amount)}
                </span>
              </p>
            ))}
            {merged.length > 1 ? (
              <p className="flex items-center justify-between gap-4 border-t border-foreground/15 pt-1.5 font-medium text-foreground">
                <span>합계</span>
                <span>{formatSignedWon(totalAmount)}</span>
              </p>
            ) : null}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const isPtxDesignFeeLedgerItem = (item: CreditLedgerItem) => {
  const source = String(item.ledgerSource || "").trim();
  if (source === "abutment_design_lab_fee") return true;
  return String(item.uniqueKey || "").includes("abutment_design_fee");
};

/** 기공소→어벗츠(박스) 배송 원장 — 기공의뢰(PTX) 행에 묶지 않음. */
const isLabToAbutsShippingLedgerItem = (item: CreditLedgerItem) => {
  const share = String(item.holdShare || "").trim();
  if (share === "abuts_shipping" || share === "lab_shipping") return true;
  const spendKind = String(item.spendKind || item.ledgerSource || "").trim();
  const related = String(
    item.relatedPracticeTransferId ||
      item.refRequestSummary?.relatedPracticeTransferId ||
      "",
  ).trim();
  if (
    related &&
    (spendKind === "shipping_fee" ||
      spendKind === "shipping" ||
      String(item.refType || "") === "SHIPPING_PACKAGE" ||
      String(item.uniqueKey || "").includes(":shipping_fee") ||
      String(item.uniqueKey || "").includes(":abuts_shipping"))
  ) {
    return true;
  }
  const label = String(item.displayLabel || "");
  if (label.includes("기공소→어벗츠") || label.includes("기공소 -> 어벗츠")) {
    return true;
  }
  if (label.includes("배송") && label.includes("어벗츠") && label.includes("기공소")) {
    return true;
  }
  return false;
};

const practiceTransferGroupKey = (
  item: CreditLedgerItem,
  opts: { isLabViewer?: boolean } = {},
) => {
  const isLabViewer = Boolean(opts.isLabViewer);
  // 기공소→어벗츠 배송은 박스 행으로(기공의뢰 정산과 분리).
  if (isLabToAbutsShippingLedgerItem(item)) return "";
  // 기공소 장부: PTX CA 생산도 박스키로 — 배송과 한 행.
  if (isLabViewer && String(item.refType || "") === "REQUEST") {
    const relatedFromRequest = String(
      item.relatedPracticeTransferId ||
        item.refRequestSummary?.relatedPracticeTransferId ||
        "",
    ).trim();
    if (relatedFromRequest) return "";
  }
  const refType = String(item.refType || "");
  const isDesignFee = isPtxDesignFeeLedgerItem(item);
  if (refType !== "PRACTICE_TRANSFER" && !isDesignFee) {
    const relatedFromRequest = String(
      item.relatedPracticeTransferId ||
        item.refRequestSummary?.relatedPracticeTransferId ||
        "",
    ).trim();
    if (relatedFromRequest) return `ptx:${relatedFromRequest}`;
    return "";
  }
  const related = String(item.relatedPracticeTransferId || "").trim();
  const refId = String(item.refId || "").trim();
  const ptx = String(item.refPracticeTransferId || "").trim();
  // mongo id 우선 — 보철기공비(refId)와 디자인비(relatedPracticeTransferId)를 같은 키로
  if (refType === "PRACTICE_TRANSFER" && refId) return `ptx:${refId}`;
  if (related) return `ptx:${related}`;
  if (ptx) return `ptx-human:${ptx}`;
  return "";
};

const isAbutmentShippingPackageItem = (item: CreditLedgerItem) => {
  if (String(item.refType || "") !== "SHIPPING_PACKAGE") return false;
  const label = String(item.displayLabel || "");
  if (label.includes("어벗츠") || label.includes("기공소")) return false;
  return true;
};

const abutmentDesignGroupKey = (
  item: CreditLedgerItem,
  opts: { isLabViewer?: boolean } = {},
) => {
  if (practiceTransferGroupKey(item, opts)) return "";
  // Request 박스 배송이 SSOT — PTX 건당 배송 hold는 어벗디자인 행에 합치지 않음.
  if (
    String(item.refType || "") === "PRACTICE_TRANSFER" &&
    (String(item.holdShare || "").trim() === "abuts_shipping" ||
      String(item.holdShare || "").trim() === "lab_shipping")
  ) {
    return "";
  }
  const refType = String(item.refType || "");
  const relatedPtx = String(
    item.relatedPracticeTransferId ||
      item.refRequestSummary?.relatedPracticeTransferId ||
      "",
  ).trim();
  // PTX 링크여도 기공소→어벗츠 배송·(기공소) CA 생산은 박스로 묶는다.
  const allowBoxDespitePtx =
    isLabToAbutsShippingLedgerItem(item) ||
    (Boolean(opts.isLabViewer) && refType === "REQUEST");
  if (relatedPtx && !allowBoxDespitePtx) return "";

  const pkg = String(
    item.shippingPackageId || item.refRequestSummary?.shippingPackageId || "",
  ).trim();
  if (pkg && (refType === "REQUEST" || isAbutmentShippingPackageItem(item))) {
    return `pkg:${pkg}`;
  }

  const box = String(
    item.abutmentBoxGroupKey ||
      item.refRequestSummary?.abutmentBoxGroupKey ||
      "",
  ).trim();
  if (box) return `box:${box}`;

  const ba = String(
    item.requestorBusinessAnchorId ||
      item.refRequestSummary?.requestorBusinessAnchorId ||
      "",
  ).trim();
  const ymd = String(
    item.estimatedShipYmd || item.refRequestSummary?.estimatedShipYmd || "",
  ).trim();
  if (ba && ymd) return `box:${ba}:${ymd}`;
  if (
    ba &&
    (refType === "REQUEST" ||
      isAbutmentShippingPackageItem(item) ||
      isLabToAbutsShippingLedgerItem(item))
  ) {
    return `box:${ba}`;
  }

  if (refType === "REQUEST") {
    const mailbox = String(
      item.mailboxAddress || item.refRequestSummary?.mailboxAddress || "",
    )
      .trim()
      .toUpperCase();
    if (mailbox) return `mb:${mailbox}`;
    const refId = String(item.refId || "").trim();
    return refId ? `req:${refId}` : "";
  }

  if (isAbutmentShippingPackageItem(item)) {
    const mailbox = String(item.mailboxAddress || "")
      .trim()
      .toUpperCase();
    if (mailbox) return `mb:${mailbox}`;
  }
  return "";
};

const isAbutmentShippingLedgerItem = (item: CreditLedgerItem) => {
  if (isLabToAbutsShippingLedgerItem(item)) return true;
  if (String(item.refType || "") === "SHIPPING_PACKAGE") return true;
  if (String(item.spendKind || "") === "shipping_fee") return true;
  const label = String(item.displayLabel || "");
  return label.includes("배송");
};

const abutmentPartLabel = (item: CreditLedgerItem) => {
  if (isAbutmentShippingLedgerItem(item)) return "배송비";
  return "의뢰비";
};

const toAbutmentDisplayPart = (item: CreditLedgerItem): LedgerDisplayPart => ({
  label: abutmentPartLabel(item),
  amount: Number(item.amount || 0),
  spentPaidAmount: Number(item.spentPaidAmount || 0),
  spentFreeAmount: Number(item.spentFreeAmount || 0),
});

const recipientNameOf = (item: CreditLedgerItem) =>
  String(
    item.recipientName ||
      item.refRequestSummary?.recipientName ||
      item.requestorBusinessName ||
      item.refRequestSummary?.requestorBusinessName ||
      item.refRequestSummary?.shippingReceiver?.name ||
      "",
  ).trim();

const mailboxAddressOf = (item: CreditLedgerItem) =>
  String(
    item.mailboxAddress || item.refRequestSummary?.mailboxAddress || "",
  )
    .trim()
    .toUpperCase();

const emptyDisplayRowExtras = {
  isAbutmentDesign: false,
  requestCount: 0,
  recipientName: "",
  mailboxAddress: "",
  members: [] as CreditLedgerItem[],
};

const isAbutmentDesignHoldLedgerItem = (item: CreditLedgerItem) =>
  String(item.type || "") === "SPEND_HOLD";

/** 어벗디자인 원장: 보류만=지급 보류, 보류+확정 혼재=일부 지급, 확정만=지급 완료. */
const resolveAbutmentDesignPayoutStatus = (
  members: CreditLedgerItem[],
): PracticeTransferPayoutStatus => {
  const list = Array.isArray(members) && members.length > 0 ? members : [];
  if (list.length === 0) return "hold";
  const holdCount = list.filter(isAbutmentDesignHoldLedgerItem).length;
  if (holdCount === list.length) return "hold";
  if (holdCount > 0) return "partial";
  return "settled";
};

/** 상세 모달 항목용 — hold/settled 카운트로 지급완료·지급보류·일부 지급. */
const resolveAbutmentItemPayoutStatus = (
  holdCount: number,
  settledCount: number,
): AbutmentDesignItemPayoutStatus => {
  if (holdCount <= 0) return "settled";
  if (settledCount <= 0) return "hold";
  return "partial";
};

const toDisplayPart = (item: CreditLedgerItem): LedgerDisplayPart => ({
  label: String(item.displayLabel || "").trim() || typeLabel(item.type),
  amount: Number(item.amount || 0),
  spentPaidAmount: Number(item.spentPaidAmount || 0),
  spentFreeAmount: Number(item.spentFreeAmount || 0),
});

/** 동일 기공의뢰(PTX)와 어벗디자인(수신자 박스) 원장을 한 행으로 묶는다. */
const groupLedgerItemsForDisplay = (
  items: CreditLedgerItem[],
  labShareOnly = false,
  isLabViewer = false,
): LedgerDisplayRow[] => {
  const groupOpts = { isLabViewer };
  const ptxMap = new Map<string, CreditLedgerItem[]>();
  const abutmentMap = new Map<string, CreditLedgerItem[]>();
  for (const item of items) {
    const ptxKey = practiceTransferGroupKey(item, groupOpts);
    if (ptxKey) {
      const list = ptxMap.get(ptxKey);
      if (list) list.push(item);
      else ptxMap.set(ptxKey, [item]);
      continue;
    }
    const abutmentKey = abutmentDesignGroupKey(item, groupOpts);
    if (!abutmentKey) continue;
    const list = abutmentMap.get(abutmentKey);
    if (list) list.push(item);
    else abutmentMap.set(abutmentKey, [item]);
  }

  const seenGroups = new Set<string>();
  const out: LedgerDisplayRow[] = [];

  for (const item of items) {
    const ptxKey = practiceTransferGroupKey(item, groupOpts);
    if (ptxKey) {
      if (seenGroups.has(ptxKey)) continue;
      seenGroups.add(ptxKey);

      const members = [...(ptxMap.get(ptxKey) || [])].sort(
        (a, b) =>
          new Date(a.createdAt || 0).getTime() -
          new Date(b.createdAt || 0).getTime(),
      );
      if (members.length === 0) continue;

      const latest = members[members.length - 1];
      const representative =
        [...members].reverse().find((m) => m.feeQuote) || latest;
      const parts = members.map(toDisplayPart);
      const quote = parsePracticeTransferFeeQuote(representative.feeQuote);
      // 치과: 레거시 기공비 hold에 합쳐진 배송은 표시 금액에서 제외.
      const { workAmount } = resolvePracticeTransferShippingAmounts(parts, quote);
      const rawAmount = members.reduce(
        (sum, m) => sum + Number(m.amount || 0),
        0,
      );
      const pending = resolvePracticeTransferPending(latest, "other", members);
      const amount = resolveGroupedPracticeTransferDisplayAmount({
        rawAmount,
        workAmount,
        quote,
        pending,
        isLabViewer,
      });
      const spentPaidAmount = members.reduce(
        (sum, m) => sum + Number(m.spentPaidAmount || 0),
        0,
      );
      const spentFreeAmount = members.reduce(
        (sum, m) => sum + Number(m.spentFreeAmount || 0),
        0,
      );
      const payoutStatus = resolvePracticeTransferPayoutStatus(
        representative,
        members,
        labShareOnly,
      );
      out.push({
        key: ptxKey,
        createdAt: String(latest.createdAt || ""),
        amount,
        balanceAfter: latest.balanceAfter,
        spentPaidAmount,
        spentFreeAmount,
        type: latest.type,
        displayLabel: resolvePracticeTransferTypeLabel(isLabViewer),
        parts,
        practiceTransferPending: pending,
        practiceTransferPayoutStatus: payoutStatus,
        isPracticeTransfer: true,
        ...emptyDisplayRowExtras,
        members,
        item: representative,
      });
      continue;
    }

    const abutmentKey = abutmentDesignGroupKey(item, groupOpts);
    if (abutmentKey) {
      if (seenGroups.has(abutmentKey)) continue;
      seenGroups.add(abutmentKey);

      const members = [...(abutmentMap.get(abutmentKey) || [])].sort(
        (a, b) =>
          new Date(a.createdAt || 0).getTime() -
          new Date(b.createdAt || 0).getTime(),
      );
      if (members.length === 0) continue;

      const latest = members[members.length - 1];
      const amount = members.reduce((sum, m) => sum + Number(m.amount || 0), 0);
      const spentPaidAmount = members.reduce(
        (sum, m) => sum + Number(m.spentPaidAmount || 0),
        0,
      );
      const spentFreeAmount = members.reduce(
        (sum, m) => sum + Number(m.spentFreeAmount || 0),
        0,
      );
      const requestIds = new Set<string>();
      for (const member of members) {
        if (String(member.refType || "") !== "REQUEST") continue;
        const id = String(member.refId || "").trim();
        if (id) requestIds.add(id);
      }
      const packageRequestCount = members.reduce(
        (max, member) =>
          Math.max(max, Number(member.shippingPackageRequestCount || 0)),
        0,
      );
      const requestCount = Math.max(requestIds.size, packageRequestCount, 1);
      const named = [...members].reverse().find((m) => recipientNameOf(m));
      const payoutStatus = resolveAbutmentDesignPayoutStatus(members);
      out.push({
        key: abutmentKey,
        createdAt: String(latest.createdAt || ""),
        amount,
        balanceAfter: latest.balanceAfter,
        spentPaidAmount,
        spentFreeAmount,
        type: latest.type,
        displayLabel: resolveAbutmentDesignTypeLabel(isLabViewer),
        parts: members.map(toAbutmentDisplayPart),
        practiceTransferPending: payoutStatus !== "settled",
        practiceTransferPayoutStatus: payoutStatus,
        isPracticeTransfer: false,
        isAbutmentDesign: true,
        requestCount,
        recipientName: recipientNameOf(named || latest) || "수신자 미확인",
        mailboxAddress: mailboxAddressOf(named || latest),
        members,
        item: named || latest,
      });
      continue;
    }

    out.push({
      key: String(item._id || item.uniqueKey),
      createdAt: String(item.createdAt || ""),
      amount: Number(item.amount || 0),
      balanceAfter: item.balanceAfter,
      spentPaidAmount: Number(item.spentPaidAmount || 0),
      spentFreeAmount: Number(item.spentFreeAmount || 0),
      type: item.type,
      displayLabel: resolvePracticeTransferDisplayLabel(item, isLabViewer),
      parts: null,
      practiceTransferPending: resolvePracticeTransferPending(
        item,
        resolvePracticeTransferRoute(item),
      ),
      practiceTransferPayoutStatus: isStoreOrderLedgerItem(item)
        ? "settled"
        : resolvePracticeTransferPayoutStatus(
            item,
            undefined,
            labShareOnly,
          ),
      isPracticeTransfer: String(item.refType || "") === "PRACTICE_TRANSFER",
      ...emptyDisplayRowExtras,
      item,
    });
  }

  return out;
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const REF_TYPE_LABELS: Record<string, string> = {
  CHARGE_ORDER: "유료충전",
  SHIPPING_PACKAGE: "택배비",
  REQUEST: "의뢰",
  PRACTICE_TRANSFER: "기공비",
  PRACTICE_MEMBERSHIP: "치과 멤버십",
  LAB_SETTLEMENT_PAYOUT: "기공크레딧 정산",
  SETTLEMENT_BATCH_ITEM: "기공크레딧 정산",
  FREE_REQUEST_CREDIT: "환영 무료크레딧",
  REQUEST_FREE_CREDIT: "환영 무료크레딧",
  WELCOME_BONUS: "환영 무료크레딧",
  FREE_SHIPPING_CREDIT: "환영 무료크레딧",
  SHIPPING_FREE_CREDIT: "환영 무료크레딧",
  DEMO_CREDIT: "데모 크레딧",
  DEMO_CREDIT_EXIT: "데모 크레딧 회수",
  FREE_CREDIT_CANCEL: "무료크레딧 취소",
  CREDIT_RECONCILE: "잔액 조정",
  SEED_REQUESTOR_CHARGE: "시드 초기 충전",
  STORE_ORDER: "스토어",
};

const refTypeLabel = (refType?: string) => {
  const t = String(refType || "").trim();
  if (!t) return "-";
  return REF_TYPE_LABELS[t] || t;
};

const formatTrackingNumbers = (trackingNumbers?: string[]) => {
  const values = Array.isArray(trackingNumbers)
    ? trackingNumbers.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  if (values.length === 0) return "-";
  if (values.length === 1) return values[0];
  return `${values[0]} 외 ${values.length - 1}건`;
};

const hashToBase36 = (input: string) => {
  const str = String(input || "");
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).toUpperCase();
};

const formatRequestIdSafe = (requestId?: string, seed?: string) => {
  const raw = String(requestId || "").trim();
  const m = raw.match(/^(\d{8})-(\d{6})$/);
  if (!m) return raw;
  const datePart = m[1];
  const code = hashToBase36(`${String(seed || raw)}|abuts|requestId`)
    .padStart(6, "0")
    .slice(-6);
  return `${datePart}-${code}`;
};

const renderTransactionDetail = ({
  item,
  safeRef,
  onOpenRequestDetail,
}: {
  item: CreditLedgerItem;
  safeRef: string;
  onOpenRequestDetail: () => void;
}) => {
  const refType = String(item.refType || "");
  const requestSummary = item.refRequestSummary;
  const requestReference = safeRef || "참조 내역 없음";

  if (refType === "REQUEST") {
    const manufacturerStageRaw =
      item.manufacturerStage || requestSummary?.manufacturerStage || "준비";
    const manufacturerStage = getNormalizedStageLabelSafe({ manufacturerStage: manufacturerStageRaw }) || String(manufacturerStageRaw);
    const spendKind = String(item.spendKind || "");
    const isExpressSurchargeOnly = spendKind === "express_surcharge";

    return (
      <>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <ShippingModeBadge
            source={
              requestSummary || {
                shippingMode: item.shippingMode,
              }
            }
            size="sm"
          />
          <Badge variant="outline" className="h-5 px-1.5 text-[10px] leading-none">
            {manufacturerStage}
          </Badge>
          {isExpressSurchargeOnly ? (
            <Badge
              variant="outline"
              className="h-5 px-1.5 text-[10px] leading-none border-accent-muted text-accent-strong bg-accent-soft"
            >
              신속추가
            </Badge>
          ) : null}
          <span className="font-mono text-xs font-semibold text-slate-900">
            {requestReference}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 pt-1 text-[11px] text-slate-700">
          <span>
            {requestSummary?.clinicName || item.clinicName || "-"} /{" "}
            {requestSummary?.patientName || item.patientName || "-"} /{" "}
            {requestSummary?.tooth || item.tooth || "-"}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 px-1.5 text-[10px] leading-none"
            onClick={(event) => {
              event.stopPropagation();
              onOpenRequestDetail();
            }}
          >
            자세히 보기
          </Button>
        </div>
      </>
    );
  }

  if (refType === "SHIPPING_PACKAGE") {
    const label = String(item.displayLabel || "").trim();
    return (
      <>
        <span className="text-[11px] text-muted-foreground">
          {label.includes("배송비") ? label : refTypeLabel(refType)}
        </span>
        <span className="pt-1 text-[11px] text-slate-700">
          송장번호 {formatTrackingNumbers(item.trackingNumbers)}
        </span>
      </>
    );
  }

  if (refType === "PRACTICE_TRANSFER") {
    const labName = String(item.labName || "").trim() || "-";
    const patientName = String(item.patientName || "").trim() || "-";
    return (
      <span className="pt-1 text-[11px] text-slate-700">
        {labName} / {patientName}
      </span>
    );
  }

  if (
    item.type === "CHARGE_FREE_REQUEST" ||
    item.type === "CHARGE_FREE_SHIPPING"
  ) {
    const reason = String(item.freeReason || "").trim();
    return (
      <>
        <span className="text-[11px] text-slate-700">
          {reason || refTypeLabel(refType)}
        </span>
      </>
    );
  }

  return (
    <>
      <span className="text-[11px] text-muted-foreground">
        {refTypeLabel(refType)}
      </span>
    </>
  );
};

export const CreditLedgerModal = ({
  open = false,
  onOpenChange,
  businessAnchorId,
  titleSuffix,
  chargeNavPath,
  embedded = false,
  className,
  initialFilters,
  detailTitle,
  hideBalanceSummary = false,
}: CreditLedgerModalProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { token, user } = useAuthStore();
  const accessKind = user?.requestorKind || null;
  const isOpen = embedded ? true : open;

  const goCharge = () => {
    if (!chargeNavPath) return;
    if (!embedded) onOpenChange?.(false);
    navigate(chargeNavPath);
  };

  const [period, setPeriod] = useState<PeriodFilterValue>(
    () => resolveLedgerFilters(initialFilters).period,
  );
  const [customStartDate, setCustomStartDate] = useState(
    () => resolveLedgerFilters(initialFilters).customStartDate,
  );
  const [customEndDate, setCustomEndDate] = useState(
    () => resolveLedgerFilters(initialFilters).customEndDate,
  );
  const [spendPeriod, setSpendPeriod] = useState<PeriodFilterValue>(
    () => resolveLedgerFilters(initialFilters).period,
  );
  const [spendCustomStartDate, setSpendCustomStartDate] = useState(
    () => resolveLedgerFilters(initialFilters).customStartDate,
  );
  const [spendCustomEndDate, setSpendCustomEndDate] = useState(
    () => resolveLedgerFilters(initialFilters).customEndDate,
  );
  const [creditKind, setCreditKind] = useState<LedgerCreditKindFilter>(
    () => resolveLedgerFilters(initialFilters).creditKind,
  );
  const [action, setAction] = useState<LedgerActionFilter>(
    () => resolveLedgerFilters(initialFilters).action,
  );
  const [q, setQ] = useState(() => resolveLedgerFilters(initialFilters).q);
  const [partnerName, setPartnerName] = useState(
    () => resolveLedgerFilters(initialFilters).partnerName,
  );
  const [prosthesisType, setProsthesisType] = useState(
    () => resolveLedgerFilters(initialFilters).prosthesisType,
  );
  const [statsCategory, setStatsCategory] = useState<
    CreditLedgerStatsCategory | ""
  >(() => resolveLedgerFilters(initialFilters).statsCategory);
  const [statsCategories, setStatsCategories] = useState(
    () => resolveLedgerFilters(initialFilters).statsCategories,
  );
  const [onYmd, setOnYmd] = useState(
    () => resolveLedgerFilters(initialFilters).onYmd,
  );

  const initialFiltersKey = useMemo(
    () => JSON.stringify(initialFilters ?? null),
    [initialFilters],
  );

  useEffect(() => {
    if (!initialFilters || (!isOpen && !embedded)) return;
    const next = resolveLedgerFilters(initialFilters);
    setPeriod(next.period);
    setCustomStartDate(next.customStartDate);
    setCustomEndDate(next.customEndDate);
    setSpendPeriod(next.period);
    setSpendCustomStartDate(next.customStartDate);
    setSpendCustomEndDate(next.customEndDate);
    setCreditKind(next.creditKind);
    setAction(next.action);
    setQ(next.q);
    setPartnerName(next.partnerName);
    setProsthesisType(next.prosthesisType);
    setStatsCategory(next.statsCategory);
    setStatsCategories(next.statsCategories);
    setOnYmd(next.onYmd);
  }, [embedded, initialFilters, initialFiltersKey, isOpen]);

  const [loading, setLoading] = useState(Boolean(embedded));
  const [items, setItems] = useState<CreditLedgerItem[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: LedgerSortKey; direction: SortDirection }>({
    key: "createdAt",
    direction: "desc",
  });
  const [selectedDetail, setSelectedDetail] =
    useState<RequestDetailDialogRequest | null>(null);
  const [feeQuoteDetail, setFeeQuoteDetail] = useState<{
    quote: PracticeTransferFeeQuote;
    skipJig: boolean;
    rushProcessing: boolean;
    title: string;
    creditLabHoldPending: boolean;
    creditAbutmentHoldPending: boolean;
    patientName: string;
    labName: string;
    orderDate: string;
    arrivalDate: string;
    memo: string;
    settlementShippingLines: PracticeTransferSettlementShippingLine[];
  } | null>(null);
  const [abutmentDetail, setAbutmentDetail] =
    useState<AbutmentDesignLedgerDetail | null>(null);
  const [currentBalanceSnapshot, setCurrentBalanceSnapshot] =
    useState<CreditBalanceSnapshot | null>(null);
  const [periodSpendSummary, setPeriodSpendSummary] =
    useState<PeriodSpendSummary | null>(null);
  const [summaryDrillDown, setSummaryDrillDown] =
    useState<SummaryDrillDownState>(null);

  const showSettlementCredit = useMemo(() => {
    if (currentBalanceSnapshot?.showSettlementCredit === true) return true;
    if (currentBalanceSnapshot?.showSettlementCredit === false) return false;
    const kind =
      currentBalanceSnapshot?.requestorKind ||
      (!businessAnchorId ? accessKind : null);
    return kind === "lab";
  }, [
    accessKind,
    businessAnchorId,
    currentBalanceSnapshot?.requestorKind,
    currentBalanceSnapshot?.showSettlementCredit,
  ]);

  const isPracticeViewer = useMemo(() => {
    const kind =
      currentBalanceSnapshot?.requestorKind ||
      (!businessAnchorId ? accessKind : null);
    return kind === "practice";
  }, [
    accessKind,
    businessAnchorId,
    currentBalanceSnapshot?.requestorKind,
  ]);

  /** 치과·기공소 내역 상단 — 기간 합계 수식 카드(= + −). 테이블은 기간 무관. */
  const equationLedgerUi =
    !hideBalanceSummary && (isPracticeViewer || showSettlementCredit);

  const summaryFilterBase = useMemo(
    (): CreditLedgerInitialFilters =>
      equationLedgerUi
        ? {
            period: spendPeriod,
            customStartDate: spendCustomStartDate,
            customEndDate: spendCustomEndDate,
          }
        : {
            period,
            customStartDate,
            customEndDate,
          },
    [
      equationLedgerUi,
      spendPeriod,
      spendCustomStartDate,
      spendCustomEndDate,
      period,
      customStartDate,
      customEndDate,
    ],
  );

  const openSummaryDrillDown = (next: NonNullable<SummaryDrillDownState>) => {
    setSummaryDrillDown(next);
  };

  useEffect(() => {
    if (!showSettlementCredit && creditKind === "SETTLEMENT") {
      setCreditKind("all");
    }
  }, [showSettlementCredit, creditKind]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef(page);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(false);
  const fetchSeqRef = useRef(0);

  // page 상태 변경 시 ref 동기화
  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  const buildPath = (
    pageNum: number,
    mode: "ledger" | "spendSummary" = "ledger",
  ) => {
    const params = new URLSearchParams();
    const applyPeriodBounds = mode === "spendSummary" || !equationLedgerUi;
    if (applyPeriodBounds) {
      if (mode === "spendSummary") {
        appendPeriodQueryParams(params, spendPeriod, {
          customStartDate: spendCustomStartDate,
          customEndDate: spendCustomEndDate,
        });
      } else {
        appendPeriodQueryParams(params, period, {
          customStartDate,
          customEndDate,
        });
      }
    }
    // 기간 요약은 버킷·동작·검색과 무관.
    if (mode !== "spendSummary") {
      if (creditKind && creditKind !== "all") {
        params.set("creditKind", creditKind);
      }
      if (action && action !== "all") params.set("action", action);
      if (q.trim()) params.set("q", q.trim());
      if (partnerName.trim()) params.set("partnerName", partnerName.trim());
      if (prosthesisType.trim()) {
        params.set("prosthesisType", prosthesisType.trim());
      }
      if (statsCategory) params.set("statsCategory", statsCategory);
      if (statsCategories.trim()) {
        params.set("statsCategories", statsCategories.trim());
      }
      if (onYmd.trim()) params.set("onYmd", onYmd.trim());
    }
    params.set("page", String(pageNum));
    params.set("pageSize", String(PAGE_SIZE));

    if (businessAnchorId) {
      return `/api/admin/credits/businesses/${businessAnchorId}/ledger?${params.toString()}`;
    }
    return `/api/credits/ledger?${params.toString()}`;
  };

  const load = async (pageNum: number, reset: boolean) => {
    if (!token) return;
    if (loadingRef.current && !reset) return;
    const seq = ++fetchSeqRef.current;
    loadingRef.current = true;
    setLoading(true);
    try {
      const res = await apiFetch<{
        success: boolean;
        data: {
          items: CreditLedgerItem[];
          total: number;
          page: number;
          pageSize: number;
          hasMore?: boolean;
          currentBalanceSnapshot?: CreditBalanceSnapshot;
          periodSpendSummary?: PeriodSpendSummary | null;
        };
        message?: string;
      }>({
        path: buildPath(pageNum),
        method: "GET",
        token,
      });

      if (!res.ok || !res.data?.success) {
        const message =
          res.data && typeof res.data === "object" && "message" in res.data
            ? String((res.data as { message?: string }).message || "")
            : "";
        throw new Error(message || "크레딧 내역 조회에 실패했습니다.");
      }

      const data = res.data.data;
      if (seq !== fetchSeqRef.current) return;
      const fetched = Array.isArray(data?.items)
        ? data.items.map((it) => {
            const quote = parsePracticeTransferFeeQuote(it.feeQuote);
            return quote ? { ...it, feeQuote: quote } : { ...it, feeQuote: null };
          })
        : [];
      const total = Number(data?.total ?? 0);
      if (reset) {
        setCurrentBalanceSnapshot(data?.currentBalanceSnapshot || null);
        if (!equationLedgerUi) {
          setPeriodSpendSummary(data?.periodSpendSummary ?? null);
        }
      }
      setItems((prev) => {
        const next = reset ? fetched : [...prev, ...fetched];
        const more =
          typeof data?.hasMore === "boolean"
            ? data.hasMore
            : next.length < total;
        setHasMore(more);
        hasMoreRef.current = more;
        return next;
      });
    } catch (e: unknown) {
      if (seq !== fetchSeqRef.current) return;
      if (reset) {
        setItems([]);
        setCurrentBalanceSnapshot(null);
        setPeriodSpendSummary(null);
      }
      setHasMore(false);
      hasMoreRef.current = false;
      toast({
        title: "크레딧 내역 조회 실패",
        description:
          e instanceof Error ? e.message : "다시 시도해주세요.",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      if (seq !== fetchSeqRef.current) return;
      loadingRef.current = false;
      setLoading(false);
    }
  };

  const loadPeriodSpend = async () => {
    if (!token || !equationLedgerUi) return;
    try {
      const res = await apiFetch<{
        success: boolean;
        data?: {
          periodSpendSummary?: PeriodSpendSummary | null;
        };
        message?: string;
      }>({
        path: buildPath(1, "spendSummary"),
        method: "GET",
        token,
        skipCache: true,
      });

      if (!res.ok || !res.data?.success) return;
      setPeriodSpendSummary(res.data.data?.periodSpendSummary ?? null);
    } catch {
      setPeriodSpendSummary(null);
    }
  };

  // 필터 변경 시 초기화
  useEffect(() => {
    if (!isOpen) return;
    setPage(1);
    pageRef.current = 1;
    setHasMore(true);
    hasMoreRef.current = true;
    loadingRef.current = false;
    load(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isOpen,
    ...(equationLedgerUi ? [] : [period, customStartDate, customEndDate]),
    creditKind,
    action,
    q,
    partnerName,
    prosthesisType,
    statsCategory,
    statsCategories,
    onYmd,
    businessAnchorId,
    initialFiltersKey,
    equationLedgerUi,
  ]);

  useEffect(() => {
    if (!isOpen || !equationLedgerUi) return;
    void loadPeriodSpend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isOpen,
    equationLedgerUi,
    spendPeriod,
    spendCustomStartDate,
    spendCustomEndDate,
    businessAnchorId,
  ]);

  // 무한 스크롤
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root || !isOpen || !hasMore) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        if (loadingRef.current || !hasMoreRef.current) return;
        const nextPage = pageRef.current + 1;
        setPage(nextPage);
        void load(nextPage, false);
      },
      { root, rootMargin: "200px", threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, hasMore, items.length]);

  // 웹소켓 실시간 업데이트: 모달이 열린 상태를 유지한 채
  // 동일 모달 내 데이터(목록/잔액 스냅샷)만 갱신한다.
  useAppEventDebouncedReload({
    enabled: Boolean(isOpen && token),
    eventTypes: ["credit:balance-updated"],
    delayMs: 80,
    deferWhenEditing: false,
    shouldHandle: (evt) =>
      isCreditEventForBusiness(evt, businessAnchorId || user?.businessAnchorId),
    onMatch: () => {
      setPage(1);
      pageRef.current = 1;
      setHasMore(true);
      hasMoreRef.current = true;
      void load(1, true);
    },
  });

  const isLabViewer = useMemo(() => {
    const kind =
      currentBalanceSnapshot?.requestorKind ||
      (!businessAnchorId ? accessKind : null);
    return kind === "lab";
  }, [
    accessKind,
    businessAnchorId,
    currentBalanceSnapshot?.requestorKind,
  ]);

  const rows = useMemo(
    () =>
      groupLedgerItemsForDisplay(
        Array.isArray(items) ? items : [],
        isLabViewer,
        isLabViewer,
      ),
    [items, isLabViewer],
  );

  const toggleSort = (key: LedgerSortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "createdAt" ? "desc" : "asc" },
    );
  };

  const renderSortIcon = (active: boolean, direction: SortDirection) => {
    if (!active) return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />;
    return direction === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5 text-foreground" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-foreground" />
    );
  };

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (sort.key === "createdAt") {
        const av = new Date(a.createdAt || 0).getTime();
        const bv = new Date(b.createdAt || 0).getTime();
        return sort.direction === "asc" ? av - bv : bv - av;
      }
      if (sort.key === "type") {
        const av = a.displayLabel || typeLabel(a.type);
        const bv = b.displayLabel || typeLabel(b.type);
        return sort.direction === "asc"
          ? av.localeCompare(bv, "ko")
          : bv.localeCompare(av, "ko");
      }
      if (sort.key === "amount") {
        const av = Number(a.amount || 0);
        const bv = Number(b.amount || 0);
        return sort.direction === "asc" ? av - bv : bv - av;
      }
      if (sort.key === "balanceAfter") {
        const av = Number(a.balanceAfter ?? Number.NEGATIVE_INFINITY);
        const bv = Number(b.balanceAfter ?? Number.NEGATIVE_INFINITY);
        return sort.direction === "asc" ? av - bv : bv - av;
      }
      const av = `${String(a.item.refType || "")} ${String(
        a.item.refRequestId || a.item.refPracticeTransferId || a.item.refId || "",
      )}`;
      const bv = `${String(b.item.refType || "")} ${String(
        b.item.refRequestId || b.item.refPracticeTransferId || b.item.refId || "",
      )}`;
      return sort.direction === "asc"
        ? av.localeCompare(bv, "ko")
        : bv.localeCompare(av, "ko");
    });
  }, [rows, sort]);

  const canCharge =
    chargeNavPath && (user?.role === "requestor" || user?.role === "admin");

  const toRequestDetail = (
    item: CreditLedgerItem,
  ): RequestDetailDialogRequest => ({
    requestId: item.refRequestId || item.refRequestSummary?.requestId || "",
    manufacturerStage:
      item.manufacturerStage || item.refRequestSummary?.manufacturerStage || "",
    createdAt: item.createdAt,
    shippingMode:
      item.shippingMode ||
      item.refRequestSummary?.shippingMode ||
      item.refRequestSummary?.finalShipping?.mode ||
      item.refRequestSummary?.originalShipping?.mode ||
      null,
    caseInfos: {
      clinicName:
        item.caseInfos?.clinicName ||
        item.clinicName ||
        item.refRequestSummary?.clinicName ||
        "",
      patientName:
        item.caseInfos?.patientName ||
        item.patientName ||
        item.refRequestSummary?.patientName ||
        "",
      tooth:
        item.caseInfos?.tooth ||
        item.tooth ||
        item.refRequestSummary?.tooth ||
        "",
      implantManufacturer: item.caseInfos?.implantManufacturer || "",
      implantBrand: item.caseInfos?.implantBrand || "",
      implantFamily: item.caseInfos?.implantFamily || "",
      implantType: item.caseInfos?.implantType || "",
      maxDiameter: item.caseInfos?.maxDiameter ?? null,
      connectionDiameter: item.caseInfos?.connectionDiameter ?? null,
    },
  });

  const toAbutmentDetail = (
    row: LedgerDisplayRow,
  ): AbutmentDesignLedgerDetail => {
    const requestById = new Map<
      string,
      AbutmentDesignLedgerDetail["items"][number] & {
        holdCount: number;
        settledCount: number;
      }
    >();
    let shippingAmount = 0;
    let shippingCount = 0;
    let shippingHoldCount = 0;
    let shippingSettledCount = 0;
    for (const member of row.members) {
      const isHold = isAbutmentDesignHoldLedgerItem(member);
      // Request 박스 배송이 SSOT — PTX 건당 abuts_shipping hold는 합산하지 않음.
      if (
        isAbutmentShippingLedgerItem(member) &&
        String(member.refType || "") === "PRACTICE_TRANSFER"
      ) {
        continue;
      }
      if (isAbutmentShippingLedgerItem(member)) {
        shippingAmount += Number(member.amount || 0);
        shippingCount += 1;
        if (isHold) shippingHoldCount += 1;
        else shippingSettledCount += 1;
        continue;
      }
      const refId = String(member.refId || "").trim();
      const requestId = formatRequestIdSafe(
        member.refRequestId || member.refRequestSummary?.requestId || "",
        `${refId}::${String(member.uniqueKey || "")}`,
      );
      const key = refId || requestId || String(member._id || member.uniqueKey);
      const prev = requestById.get(key);
      requestById.set(key, {
        kind: "request",
        amount: Number(prev?.amount || 0) + Number(member.amount || 0),
        requestId: requestId || prev?.requestId,
        clinicName:
          member.clinicName ||
          member.refRequestSummary?.clinicName ||
          prev?.clinicName ||
          "",
        patientName:
          member.patientName ||
          member.refRequestSummary?.patientName ||
          prev?.patientName ||
          "",
        tooth:
          member.tooth ||
          member.refRequestSummary?.tooth ||
          prev?.tooth ||
          "",
        shippingMode:
          member.shippingMode ||
          member.refRequestSummary?.shippingMode ||
          prev?.shippingMode ||
          "normal",
        holdCount: Number(prev?.holdCount || 0) + (isHold ? 1 : 0),
        settledCount: Number(prev?.settledCount || 0) + (isHold ? 0 : 1),
        payoutStatus: null,
      });
    }
    const requestItems = [...requestById.values()].map(
      ({ holdCount, settledCount, ...item }) => ({
        ...item,
        payoutStatus: resolveAbutmentItemPayoutStatus(holdCount, settledCount),
      }),
    );
    const requestAmount = requestItems.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0,
    );
    const shippingModes = Array.from(
      new Set(
        requestItems.map((item) =>
          item.shippingMode === "express" ? "express" : "normal",
        ),
      ),
    ) as ShippingMode[];
    const items = [
      ...requestItems,
      ...(shippingCount > 0
        ? [
            {
              kind: "shipping" as const,
              amount: shippingAmount,
              payoutStatus: resolveAbutmentItemPayoutStatus(
                shippingHoldCount,
                shippingSettledCount,
              ),
            },
          ]
        : []),
    ];
    return {
      title: row.displayLabel || ABUTMENT_DESIGN_TYPE_LABEL,
      recipientName: row.recipientName || "수신자 미확인",
      mailboxAddress: row.mailboxAddress || "",
      amount: Number(row.amount || 0),
      requestAmount,
      requestCount: Math.max(row.requestCount, requestItems.length),
      shippingAmount,
      shippingCount: shippingCount > 0 ? 1 : 0,
      shippingModes:
        shippingModes.length > 0
          ? shippingModes
          : (["normal"] as ShippingMode[]),
      items,
    };
  };

  const title =
    detailTitle ||
    `크레딧 내역${titleSuffix ? ` · ${titleSuffix}` : ""}`;

  const headerActions = (
    <>
      {canCharge && !currentBalanceSnapshot ? (
        <Button
          type="button"
          size="sm"
          className="h-9 shrink-0 rounded-xl px-4 font-semibold"
          onClick={goCharge}
          disabled={loading}
        >
          <CreditCard className="mr-1.5 h-3.5 w-3.5" />
          충전
        </Button>
      ) : null}
    </>
  );

  const freeCreditTotal = currentBalanceSnapshot
    ? Number(
        currentBalanceSnapshot.freeCredit ??
          Number(currentBalanceSnapshot.freeRequestCredit ?? 0) +
            Number(currentBalanceSnapshot.freeShippingCredit ?? 0),
      )
    : 0;
  const settlementCreditTotal = currentBalanceSnapshot
    ? Number(currentBalanceSnapshot.settlementCredit ?? 0)
    : 0;
  const currentBalanceTotal = currentBalanceSnapshot
    ? showSettlementCredit
      ? Number(
          currentBalanceSnapshot.spendableBalance ??
            currentBalanceSnapshot.realBalance ??
            Number(currentBalanceSnapshot.paidCredit || 0) +
              freeCreditTotal +
              settlementCreditTotal,
        )
      : Number(
          currentBalanceSnapshot.balance ??
            Number(currentBalanceSnapshot.paidCredit || 0) + freeCreditTotal,
        )
    : 0;
  const isDemoMode = Boolean(currentBalanceSnapshot?.demoMode);

  const periodPaidChargeTotal = Number(
    periodSpendSummary?.totalPaidChargeSupply || 0,
  );
  const periodSpendTotal = Number(
    periodSpendSummary?.totalSpendSupply || 0,
  );
  const periodSettlementEarnTotal = Number(
    periodSpendSummary?.totalSettlementEarnSupply || 0,
  );

  const showPeriodSpendCard =
    Boolean(currentBalanceSnapshot) && equationLedgerUi;
  const freeBucketLabelCompact = "무료크레딧";
  const freeBucketHint = isDemoMode ? "데모 체험" : CREDIT_FREE_BUCKET_HINT;
  const freeBucketTooltip = isDemoMode
    ? CREDIT_LEDGER_DEMO_NOTICE_BODY
    : CREDIT_LEDGER_FREE_NOTICE_BODY;
  const showResidualFreeBucket = freeCreditTotal > 0;
  const balanceHintTooltip = isDemoMode
    ? CREDIT_LEDGER_DEMO_BALANCE_HINT
    : showSettlementCredit
      ? "충전과 기공 정산 적립에서 기공·스토어 소비를 뺀 잔여액입니다. 적립 보류분은 잔액에 아직 반영되지 않습니다."
      : "충전에서 소비액을 뺀 선불금 잔여액입니다.";
  const periodChargeLabel = CREDIT_LEDGER_CHARGE_LABEL;
  const periodChargeDetailTitle = CREDIT_LEDGER_CHARGE_DETAIL_TITLE;
  const periodPaidChargeTooltip = isDemoMode
    ? CREDIT_LEDGER_DEMO_CHARGE_HINT
    : "선택한 기간에 충전된 금액 합계입니다.";
  const periodSettlementEarnTooltip =
    "선택한 기간에 적립된 기공 정산(작업완료 전 적립 보류 포함) 합계입니다.";
  const periodSpendTooltip = isDemoMode
    ? CREDIT_LEDGER_DEMO_PERIOD_SPEND_HINT
    : showSettlementCredit
      ? "선택한 기간에 지출한 어벗 생산·배송·스토어 결제 합계입니다."
      : "선택한 기간에 지출한 기공료와 스토어 결제 합계입니다.";

  const body = (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-4",
        !embedded && "max-h-[min(58vh,640px)]",
      )}
    >
      {loading && items.length === 0 ? (
        <CreditLedgerTableSkeleton showSettlement={showSettlementCredit} />
      ) : (
        <>
          {currentBalanceSnapshot && !hideBalanceSummary ? (
            showPeriodSpendCard ? (
              <div className="scroll-x-bar-top -mx-1 px-1">
                <div className="flex min-w-max items-stretch gap-0.5 px-1 sm:gap-1">
                  <SettlementStatCard
                    className="min-w-[9.5rem] flex-1 sm:min-w-[10.5rem]"
                    label="현재 잔액"
                    value={currentBalanceTotal}
                    tone="primary"
                    hint="안내"
                    hintTooltip={balanceHintTooltip}
                    onClick={() =>
                      openSummaryDrillDown({
                        title: "현재 잔액 내역",
                        filters: summaryFilterBase,
                      })
                    }
                  />
                  <SettlementEquationOperator symbol="=" />
                  <SettlementStatCard
                    className="min-w-[9.5rem] flex-1 sm:min-w-[10.5rem]"
                    label={periodChargeLabel}
                    value={periodPaidChargeTotal}
                    hint="안내"
                    hintTooltip={periodPaidChargeTooltip}
                    onClick={() =>
                      openSummaryDrillDown({
                        title: periodChargeDetailTitle,
                        filters: {
                          ...summaryFilterBase,
                          creditKind: "PAID",
                          action: "CHARGE",
                        },
                      })
                    }
                  />
                  {showSettlementCredit ? (
                    <>
                      <SettlementEquationOperator symbol="+" />
                      <SettlementStatCard
                        className="min-w-[9.5rem] flex-1 sm:min-w-[10.5rem]"
                        label="정산 적립"
                        value={periodSettlementEarnTotal}
                        hint="안내"
                        hintTooltip={periodSettlementEarnTooltip}
                        onClick={() =>
                          openSummaryDrillDown({
                            title: "정산 적립 내역",
                            filters: {
                              ...summaryFilterBase,
                              statsCategory: "settlement_earn",
                            },
                          })
                        }
                      />
                    </>
                  ) : null}
                  <SettlementEquationOperator symbol="−" />
                  <SettlementStatCard
                    className="min-w-[9.5rem] flex-1 sm:min-w-[10.5rem]"
                    label="소비"
                    value={periodSpendTotal}
                    hint="안내"
                    hintTooltip={periodSpendTooltip}
                    onClick={() =>
                      openSummaryDrillDown({
                        title: "소비 내역",
                        filters: {
                          ...summaryFilterBase,
                          action: "SPEND",
                        },
                      })
                    }
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SettlementStatCard
                  label="현재 잔액"
                  value={currentBalanceTotal}
                  tone="primary"
                  hint="안내"
                  hintTooltip={balanceHintTooltip}
                  onClick={() =>
                    openSummaryDrillDown({
                      title: "현재 잔액 내역",
                      filters: summaryFilterBase,
                    })
                  }
                />
                <SettlementStatCard
                  label="유료크레딧"
                  value={Number(currentBalanceSnapshot.paidCredit || 0)}
                  hint={CREDIT_PAID_BUCKET_HINT}
                  hintTooltip={CREDIT_LEDGER_PREPAID_NOTICE_BODY}
                  onClick={() =>
                    openSummaryDrillDown({
                      title: "유료 크레딧 내역",
                      filters: {
                        ...summaryFilterBase,
                        creditKind: "PAID",
                      },
                    })
                  }
                />
                {showResidualFreeBucket ? (
                  <SettlementStatCard
                    label={freeBucketLabelCompact}
                    value={freeCreditTotal}
                    hint={freeBucketHint}
                    hintTooltip={freeBucketTooltip}
                    onClick={() =>
                      openSummaryDrillDown({
                        title: "무료 크레딧 내역",
                        filters: {
                          ...summaryFilterBase,
                          creditKind: "FREE",
                        },
                      })
                    }
                  />
                ) : null}
                {showSettlementCredit ? (
                  <SettlementStatCard
                    label="기공크레딧"
                    value={settlementCreditTotal}
                    hint={CREDIT_SETTLEMENT_BUCKET_HINT}
                    hintTooltip={CREDIT_LEDGER_SETTLEMENT_NOTICE_BODY}
                    onClick={() =>
                      openSummaryDrillDown({
                        title: "기공크레딧 내역",
                        filters: {
                          ...summaryFilterBase,
                          creditKind: "SETTLEMENT",
                        },
                      })
                    }
                  />
                ) : null}
              </div>
            )
          ) : null}

          <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
            <div className="w-full min-w-0 sm:w-[130px]">
              <Select
                value={creditKind}
                onValueChange={(v) =>
                  setCreditKind(v as LedgerCreditKindFilter)
                }
              >
                <SelectTrigger className="h-9 rounded-xl border-slate-200">
                  <SelectValue placeholder="버킷" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 버킷</SelectItem>
                  <SelectItem value="PAID">유료(선입금)</SelectItem>
                  <SelectItem value="FREE">무료</SelectItem>
                  {showSettlementCredit ? (
                    <SelectItem value="SETTLEMENT">기공</SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            </div>

            <div className="w-full min-w-0 sm:w-[130px]">
              <Select
                value={action}
                onValueChange={(v) => setAction(v as LedgerActionFilter)}
              >
                <SelectTrigger className="h-9 rounded-xl border-slate-200">
                  <SelectValue placeholder="동작" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 동작</SelectItem>
                  <SelectItem value="CHARGE">충전</SelectItem>
                  <SelectItem value="SPEND">소비</SelectItem>
                  <SelectItem value="ADJUST">조정</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="검색 (거래내역/코드/refId)"
              className="h-9 w-full rounded-xl border-slate-200 sm:w-[280px]"
            />

            {canCharge && currentBalanceSnapshot ? (
              <Button
                type="button"
                size="sm"
                className="h-9 rounded-xl px-4 font-semibold"
                onClick={goCharge}
                disabled={loading}
              >
                <CreditCard className="mr-1.5 h-3.5 w-3.5" />
                충전
              </Button>
            ) : null}

            <div className="ml-auto w-full min-w-0 shrink-0 sm:w-auto">
              {equationLedgerUi ? (
                <PeriodFilter
                  value={spendPeriod}
                  onChange={setSpendPeriod}
                  useStoreCustomRange={false}
                  customStartDate={spendCustomStartDate}
                  customEndDate={spendCustomEndDate}
                  onCustomRangeChange={({ startDate, endDate }) => {
                    setSpendCustomStartDate(startDate);
                    setSpendCustomEndDate(endDate);
                  }}
                  onClearCustomRange={() => {
                    setSpendCustomStartDate("");
                    setSpendCustomEndDate("");
                  }}
                />
              ) : (
                <PeriodFilter
                  value={period}
                  onChange={setPeriod}
                  useStoreCustomRange={false}
                  customStartDate={customStartDate}
                  customEndDate={customEndDate}
                  onCustomRangeChange={({ startDate, endDate }) => {
                    setCustomStartDate(startDate);
                    setCustomEndDate(endDate);
                  }}
                  onClearCustomRange={() => {
                    setCustomStartDate("");
                    setCustomEndDate("");
                  }}
                />
              )}
            </div>
          </div>

          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-slate-200/80 bg-white/70 shadow-sm"
          >
            <div className={RESPONSIVE.tableShell}>
              <Table className={RESPONSIVE.tableMinExtraWide}>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[190px] text-center">
                    <button
                      type="button"
                      className="mx-auto inline-flex items-center gap-1 whitespace-nowrap text-xs sm:text-sm"
                      onClick={() => toggleSort("createdAt")}
                    >
                      일시
                      {renderSortIcon(sort.key === "createdAt", sort.direction)}
                    </button>
                  </TableHead>
                  <TableHead className="w-[140px] text-center">
                    <button
                      type="button"
                      className="mx-auto inline-flex items-center gap-1 whitespace-nowrap text-xs sm:text-sm"
                      onClick={() => toggleSort("type")}
                    >
                      유형
                      {renderSortIcon(sort.key === "type", sort.direction)}
                    </button>
                  </TableHead>
                  <TableHead className="w-[110px] text-center">
                    <span className="whitespace-nowrap text-xs sm:text-sm">
                      결제
                    </span>
                  </TableHead>
                  <TableHead className="min-w-[160px] text-center">
                    <button
                      type="button"
                      className="mx-auto inline-flex items-center gap-1 whitespace-nowrap text-xs sm:text-sm"
                      onClick={() => toggleSort("amount")}
                    >
                      금액
                      {renderSortIcon(sort.key === "amount", sort.direction)}
                    </button>
                  </TableHead>
                  <TableHead className="w-[150px] text-center">
                    <button
                      type="button"
                      className="mx-auto inline-flex items-center gap-1 whitespace-nowrap text-xs sm:text-sm"
                      onClick={() => toggleSort("balanceAfter")}
                    >
                      잔액
                      {renderSortIcon(
                        sort.key === "balanceAfter",
                        sort.direction,
                      )}
                    </button>
                  </TableHead>
                  <TableHead className="min-w-[240px] text-center">
                    <button
                      type="button"
                      className="mx-auto inline-flex items-center gap-1 whitespace-nowrap text-xs sm:text-sm"
                      onClick={() => toggleSort("detail")}
                    >
                      거래내역
                      {renderSortIcon(sort.key === "detail", sort.direction)}
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRows.map((r) => {
                  const amount = Number(r.amount || 0);
                  const isMinus = amount < 0;
                  const spentPaid = Number(r.spentPaidAmount || 0);
                  const spentFree = Number(r.spentFreeAmount ?? 0);
                  const hasParts =
                    (Boolean(r.isPracticeTransfer) ||
                      Boolean(r.isAbutmentDesign)) &&
                    Array.isArray(r.parts) &&
                    r.parts.length > 0;
                  const showSplit =
                    !hasParts &&
                    (String(r.type) === "SPEND_PAID" ||
                      String(r.type) === "SPEND_FREE_REQUEST" ||
                      String(r.type) === "SPEND_FREE_SHIPPING") &&
                    (spentPaid > 0 || spentFree > 0);
                  const safeRef = r.item.refRequestId
                    ? formatRequestIdSafe(
                        r.item.refRequestId,
                        `${String(r.item.refId || "")}::${String(r.item.uniqueKey || "")}`,
                      )
                    : "";
                  const freeSpendLabel = (() => {
                    if (r.type === "SPEND_FREE_REQUEST") return "무료(의뢰)";
                    if (r.type === "SPEND_FREE_SHIPPING") return "무료(배송)";
                    const refType = String(r.item.refType || "");
                    if (refType === "REQUEST") return "무료(의뢰)";
                    if (refType === "SHIPPING_PACKAGE") return "무료(배송)";
                    return "무료";
                  })();
                  const canOpenFeeQuote = Boolean(
                    r.isPracticeTransfer &&
                      parsePracticeTransferFeeQuote(r.item.feeQuote),
                  );
                  const canOpenAbutmentDetail = Boolean(r.isAbutmentDesign);
                  const payoutStatus = r.practiceTransferPayoutStatus;
                  return (
                    <TableRow
                      key={r.key}
                      className={cn(
                        canOpenFeeQuote || canOpenAbutmentDetail
                          ? "cursor-pointer hover:bg-slate-50/80"
                          : undefined,
                      )}
                      onClick={() => {
                        if (canOpenAbutmentDetail) {
                          setAbutmentDetail(toAbutmentDetail(r));
                          return;
                        }
                        if (!canOpenFeeQuote) return;
                        const quote = parsePracticeTransferFeeQuote(
                          r.item.feeQuote,
                        );
                        if (!quote) return;
                        const memoMeta = parsePracticeTransferMemoMeta(
                          String(r.item.transferMemo || ""),
                        );
                        const creditLabHoldPending =
                          resolvePracticeTransferPending(r.item, "lab");
                        const creditAbutmentHoldPending =
                          resolvePracticeTransferPending(r.item, "abuts");
                        const parts =
                          r.parts && r.parts.length > 0
                            ? r.parts
                            : r.members.map(toDisplayPart);
                        const settlementShippingLines =
                          toSettlementShippingLines(
                            parts,
                            creditLabHoldPending,
                            creditAbutmentHoldPending,
                            quote,
                          );
                        setFeeQuoteDetail({
                          quote: quoteForCreditSettlementDetail(
                            quote,
                            settlementShippingLines,
                          ),
                          skipJig: r.item.skipJig !== false,
                          rushProcessing: Boolean(r.item.rushProcessing),
                          title:
                            r.displayLabel ||
                            resolvePracticeTransferTypeLabel(isLabViewer),
                          creditLabHoldPending,
                          creditAbutmentHoldPending,
                          patientName:
                            String(r.item.patientName || "").trim() ||
                            String(memoMeta.patientName || "").trim(),
                          labName: String(r.item.labName || "").trim(),
                          orderDate: String(memoMeta.orderDate || "").trim(),
                          arrivalDate: String(memoMeta.arrivalDate || "").trim(),
                          memo: String(memoMeta.memo || "").trim(),
                          settlementShippingLines,
                        });
                      }}
                    >
                      <TableCell className="whitespace-nowrap text-center align-middle text-xs">
                        {formatDate(String(r.createdAt || ""))}
                      </TableCell>
                      <TableCell className="text-center text-xs font-medium align-middle">
                        <span className="inline-block whitespace-nowrap text-center">
                          {r.displayLabel || typeLabel(r.type)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center align-middle">
                        {payoutStatus ? (
                          <span
                            className={cn(
                              "inline-flex whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none",
                              practiceTransferPayoutStatusClass(payoutStatus),
                            )}
                          >
                            {practiceTransferPayoutStatusLabel(
                              payoutStatus,
                              isLabViewer,
                            )}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-center font-medium tabular-nums align-middle",
                          hasParts
                            ? undefined
                            : isMinus
                              ? "text-destructive"
                              : "text-primary-strong",
                        )}
                      >
                        <div className="flex flex-col items-center leading-4">
                          {hasParts ? (
                            r.isAbutmentDesign ? (
                              <LedgerPartsAmountHover
                                totalAmount={amount}
                                parts={r.parts!}
                              />
                            ) : (
                              <PracticeTransferAmountHover
                                totalAmount={amount}
                                parts={r.parts!}
                                feeQuote={parsePracticeTransferFeeQuote(
                                  r.item.feeQuote,
                                )}
                              />
                            )
                          ) : showSplit ? (
                            <>
                              {spentPaid > 0 && (
                                <div className="text-xs tabular-nums">
                                  유료 -{spentPaid.toLocaleString()}원
                                </div>
                              )}
                              {spentFree > 0 && (
                                <div className="text-xs tabular-nums">
                                  {freeSpendLabel} -
                                  {spentFree.toLocaleString()}원
                                </div>
                              )}
                            </>
                          ) : (
                            <span>{`${amount.toLocaleString()}원`}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-center align-middle text-xs tabular-nums text-muted-foreground">
                        {r.balanceAfter !== undefined
                          ? `${Number(r.balanceAfter).toLocaleString()}원`
                          : "-"}
                      </TableCell>
                      <TableCell
                        className="text-center align-middle text-xs"
                        onClick={(event) => {
                          if (canOpenFeeQuote || canOpenAbutmentDetail) return;
                          event.stopPropagation();
                        }}
                      >
                        <div className="flex flex-col items-center leading-4">
                          {r.isAbutmentDesign ? (
                            <>
                              <span className="text-[11px] font-medium text-slate-800">
                                {r.recipientName || "수신자 미확인"}
                              </span>
                              <span className="pt-1 text-[11px] text-muted-foreground">
                                {r.requestCount}건
                              </span>
                            </>
                          ) : (
                            renderTransactionDetail({
                              item: r.item,
                              safeRef,
                              onOpenRequestDetail: () =>
                                setSelectedDetail(toRequestDetail(r.item)),
                            })
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}

                {loading && rows.length > 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-4 text-center text-sm text-muted-foreground"
                    >
                      불러오는 중…
                    </TableCell>
                  </TableRow>
                )}

                {!loading && rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      조회 결과가 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
              </Table>
            </div>

            {hasMore ? (
              <div ref={sentinelRef} className="h-8" aria-hidden="true" />
            ) : null}
          </div>
        </>
      )}
    </div>
  );

  return (
    <>
      {embedded ? (
        <div
          className={cn(
            "flex h-full min-h-0 flex-col gap-3 overflow-hidden",
            className,
          )}
        >
          {canCharge && !currentBalanceSnapshot ? (
            <div className="flex shrink-0 items-center justify-end gap-2">
              {headerActions}
            </div>
          ) : null}
          {body}
        </div>
      ) : (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent
            className={cn(
              "flex max-h-[90vh] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:rounded-2xl",
              RESPONSIVE.dialogContentFull,
              "sm:max-w-6xl",
            )}
          >
            <DialogHeader className="space-y-0 border-b border-slate-100 px-4 pb-4 pt-5 pr-12 sm:px-6 sm:pr-14">
              <div className="flex items-center justify-between gap-2">
                <DialogTitle className="text-lg font-semibold tracking-tight text-slate-900">
                  {title}
                </DialogTitle>
                {headerActions}
              </div>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-hidden px-4 py-4 sm:px-6">
              <div className="flex h-full min-h-0 flex-col">{body}</div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {summaryDrillDown ? (
        <CreditLedgerModal
          open
          onOpenChange={(next) => {
            if (!next) setSummaryDrillDown(null);
          }}
          businessAnchorId={businessAnchorId}
          titleSuffix={titleSuffix}
          chargeNavPath={chargeNavPath}
          initialFilters={summaryDrillDown.filters}
          detailTitle={summaryDrillDown.title}
          hideBalanceSummary
        />
      ) : null}

      <RequestDetailDialog
        open={Boolean(selectedDetail)}
        onOpenChange={(next) => {
          if (!next) setSelectedDetail(null);
        }}
        request={selectedDetail}
        rows={rows}
      />

      <AbutmentDesignLedgerDetailDialog
        detail={abutmentDetail}
        onOpenChange={(next) => {
          if (!next) setAbutmentDetail(null);
        }}
      />

      <Dialog
        open={Boolean(feeQuoteDetail)}
        onOpenChange={(next) => {
          if (!next) setFeeQuoteDetail(null);
        }}
      >
        <DialogContent
          className={cn(
            "max-h-[85vh] overflow-y-auto rounded-2xl sm:rounded-2xl",
            RESPONSIVE.dialogContentMd,
          )}
        >
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-tight text-slate-900">
              {feeQuoteDetail?.title || "기공의뢰-구강스캔으로 상세 내역"}
            </DialogTitle>
          </DialogHeader>
          {feeQuoteDetail ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2.5 text-xs leading-snug sm:grid-cols-2">
                <p className="min-w-0">
                  <span className="text-muted-foreground">환자명</span>{" "}
                  <span className="font-medium text-slate-900">
                    {feeQuoteDetail.patientName || "—"}
                  </span>
                </p>
                <p className="min-w-0">
                  <span className="text-muted-foreground">기공소</span>{" "}
                  <span className="font-medium text-slate-900">
                    {feeQuoteDetail.labName || "—"}
                  </span>
                </p>
                <p className="min-w-0">
                  <span className="text-muted-foreground">주문일</span>{" "}
                  <span className="font-medium tabular-nums text-slate-900">
                    {feeQuoteDetail.orderDate
                      ? formatKstYmdToKo(feeQuoteDetail.orderDate)
                      : "—"}
                  </span>
                </p>
                <p className="min-w-0">
                  <span className="text-muted-foreground">치과도착일</span>{" "}
                  <span className="font-medium tabular-nums text-slate-900">
                    {feeQuoteDetail.arrivalDate
                      ? formatKstYmdToKo(feeQuoteDetail.arrivalDate)
                      : "—"}
                  </span>
                </p>
                <p className="min-w-0 sm:col-span-2 whitespace-pre-wrap break-words">
                  <span className="text-muted-foreground">메모</span>{" "}
                  <span className="font-medium text-slate-900">
                    {feeQuoteDetail.memo || "—"}
                  </span>
                </p>
              </div>
              <PracticeTransferFeeEstimate
                quote={feeQuoteDetail.quote}
                viewer="practice"
                density="detail"
                skipJig={feeQuoteDetail.skipJig}
                rushProcessing={feeQuoteDetail.rushProcessing}
                creditLabHoldPending={feeQuoteDetail.creditLabHoldPending}
                creditAbutmentHoldPending={
                  feeQuoteDetail.creditAbutmentHoldPending
                }
                settlementShippingLines={
                  feeQuoteDetail.settlementShippingLines
                }
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
};

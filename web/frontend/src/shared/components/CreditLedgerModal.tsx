// change-log:
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
// - 2026-08-11: embedded 모드 추가 — 의뢰자 크레딧 페이지에서 Dialog 없이 동일 원장 UI 사용.
// - 2026-08-09: 잔액 요약 우측에 [충전] 버튼 노출 (chargeNavPath 제공 시).
// - 2026-08-04: 의뢰 차감 행에 신속/묶음배송 뱃지 표시. (display-only)
// - 2026-08-03: Credit ledger detail row의 공정 배지 표시를 normalizeStageLabel 기반으로 정규화(의뢰 -> 준비). (display-only)
// related files:
// - web/frontend/rules.md
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
// - web/frontend/src/shared/business/useRequestorBusinessAccess.ts
// - web/backend/controllers/admin/adminCredit.controller.js
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
import { periodToRange } from "@/store/usePeriodStore";
import { cn } from "@/shared/ui/cn";
import {
  RequestDetailDialog,
  type RequestDetailDialogRequest,
} from "@/features/requests/components/RequestDetailDialog";
import { ShippingModeBadge } from "@/shared/shipping/ShippingModeBadge";
import type { ShippingMode } from "@/shared/shipping/shippingMode";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRequestorBusinessAccess } from "@/shared/business/useRequestorBusinessAccess";
import {
  CREDIT_FREE_BUCKET_HINT,
  CREDIT_LEDGER_FREE_NOTICE_BODY,
  CREDIT_LEDGER_PREPAID_NOTICE_BODY,
  CREDIT_LEDGER_SETTLEMENT_NOTICE_BODY,
  CREDIT_PAID_BUCKET_HINT,
  CREDIT_SETTLEMENT_BUCKET_HINT,
} from "@/shared/legal/creditPrepaidCopy";

function BalanceStatCard({
  label,
  value,
  hint,
  hintTooltip,
  tone = "default",
}: {
  label: string;
  value: number;
  hint?: string;
  hintTooltip?: string;
  tone?: "default" | "primary";
}) {
  const hintNode =
    hint && hintTooltip ? (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="mx-auto cursor-help border-b border-dotted border-slate-400 text-[11px] text-slate-500 sm:text-xs"
            >
              {hint}
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            className="max-w-xs text-xs leading-relaxed"
          >
            <p>{hintTooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ) : hint ? (
      <div className="text-center text-[11px] text-slate-500 sm:text-xs">
        {hint}
      </div>
    ) : null;

  return (
    <div
      className={cn(
        "flex min-h-[6.5rem] flex-col justify-center rounded-2xl border px-4 py-3.5 shadow-sm",
        tone === "primary"
          ? "border-primary-muted bg-primary-soft/40 ring-1 ring-primary-muted/70"
          : "border-slate-200/80 bg-white/80",
      )}
    >
      <div className="text-center text-[13px] font-medium text-slate-500">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-center text-2xl font-semibold tabular-nums tracking-tight sm:text-[1.55rem]",
          tone === "primary" ? "text-primary-strong" : "text-slate-900",
        )}
      >
        ₩{value.toLocaleString()}
      </div>
      {hintNode ? (
        <div className="mt-2 border-t border-slate-100/80 pt-2 text-center">
          {hintNode}
        </div>
      ) : null}
    </div>
  );
}

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
  tooth?: string;
  clinicName?: string;
  manufacturerStage?: string;
  shippingMode?: ShippingMode | string | null;
  freeReason?: string;
  trackingNumbers?: string[];
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
  requestorKind?: "practice" | "lab" | null;
  showSettlementCredit?: boolean;
  updatedAt?: string | null;
};

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
};

const PAGE_SIZE = 50;

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

type LedgerDisplayPart = {
  label: string;
  amount: number;
  spentPaidAmount: number;
  spentFreeAmount: number;
};

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
  item: CreditLedgerItem;
};

type PracticeTransferRoute = "lab" | "abuts" | "other";
type PracticeTransferFeeKind =
  | "labFee"
  | "design"
  | "abutProduction"
  | "shipping"
  | "other";

type PracticeTransferTreeLeaf = {
  kind: PracticeTransferFeeKind;
  label: string;
  amount: number;
};

type PracticeTransferTreeBranch = {
  route: PracticeTransferRoute;
  title: string;
  amount: number;
  leaves: PracticeTransferTreeLeaf[];
};

const FEE_KIND_ORDER: PracticeTransferFeeKind[] = [
  "labFee",
  "design",
  "abutProduction",
  "shipping",
  "other",
];

const FEE_KIND_LABEL: Record<PracticeTransferFeeKind, string> = {
  labFee: "기공비",
  design: "디자인비+지그",
  abutProduction: "어벗제작비",
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
  if (label.includes("기공비") || label.includes("보류")) {
    return { route: route === "other" ? "lab" : route, kind: "labFee" };
  }
  return { route, kind: "other" };
};

const buildPracticeTransferFeeTree = (
  parts: LedgerDisplayPart[],
): PracticeTransferTreeBranch[] => {
  const buckets = new Map<
    PracticeTransferRoute,
    Map<PracticeTransferFeeKind, number>
  >();

  for (const part of parts) {
    const { route, kind } = classifyPracticeTransferPart(part);
    if (!buckets.has(route)) buckets.set(route, new Map());
    const byKind = buckets.get(route)!;
    byKind.set(kind, (byKind.get(kind) || 0) + Number(part.amount || 0));
  }

  const routeOrder: PracticeTransferRoute[] = ["lab", "abuts", "other"];
  const routeTitle: Record<PracticeTransferRoute, string> = {
    lab: "치과 → 기공소",
    abuts: "치과 → 어벗츠",
    other: "기타",
  };

  return routeOrder
    .filter((route) => buckets.has(route))
    .map((route) => {
      const byKind = buckets.get(route)!;
      const leaves = FEE_KIND_ORDER.filter((kind) => byKind.has(kind)).map(
        (kind) => ({
          kind,
          label: FEE_KIND_LABEL[kind],
          amount: byKind.get(kind) || 0,
        }),
      );
      return {
        route,
        title: routeTitle[route],
        amount: leaves.reduce((sum, leaf) => sum + leaf.amount, 0),
        leaves,
      };
    });
};

const formatSignedWon = (amount: number) => {
  const n = Math.round(Number(amount || 0));
  const abs = Math.abs(n).toLocaleString();
  if (n < 0) return `-${abs}원`;
  if (n > 0) return `+${abs}원`;
  return `0원`;
};

function PracticeTransferLedgerTree({
  totalAmount,
  parts,
}: {
  totalAmount: number;
  parts: LedgerDisplayPart[];
}) {
  const branches = useMemo(
    () => buildPracticeTransferFeeTree(parts),
    [parts],
  );

  const treeBody = (
    <div className="w-[min(100vw-2rem,22rem)] overflow-hidden rounded-xl border border-slate-200/80 bg-white text-left shadow-md">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <span className="min-w-0 text-xs font-semibold text-slate-800">
          기공의뢰
        </span>
        <span
          className={cn(
            "shrink-0 text-xs font-semibold tabular-nums",
            totalAmount < 0 ? "text-destructive" : "text-primary-strong",
          )}
        >
          {formatSignedWon(totalAmount)}
        </span>
      </div>
      <div className="space-y-1.5 border-t border-slate-100 bg-slate-50/40 px-2.5 py-2">
        {branches.map((branch) => (
          <div
            key={branch.route}
            className="overflow-hidden rounded-lg border border-slate-200/70 bg-white"
          >
            <div className="flex items-center justify-between gap-2 px-2.5 py-2">
              <span className="min-w-0 truncate text-[11px] font-medium text-slate-700">
                {branch.title}
              </span>
              <span className="shrink-0 text-[11px] font-medium tabular-nums text-slate-600">
                {formatSignedWon(branch.amount)}
              </span>
            </div>
            {branch.leaves.length > 0 ? (
              <ul className="border-t border-slate-100 px-2.5 py-1.5">
                {branch.leaves.map((leaf) => (
                  <li
                    key={`${branch.route}-${leaf.kind}`}
                    className="flex items-center justify-between gap-2 py-1 pl-5"
                  >
                    <span className="min-w-0 truncate text-[11px] text-slate-500">
                      {leaf.label}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-slate-500">
                      {formatSignedWon(leaf.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="mx-auto flex w-full max-w-[14rem] items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-slate-50/80"
          >
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800">
              기공의뢰
            </span>
            <span
              className={cn(
                "shrink-0 text-xs font-semibold tabular-nums",
                totalAmount < 0 ? "text-destructive" : "text-primary-strong",
              )}
            >
              {formatSignedWon(totalAmount)}
            </span>
            <CircleHelp
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80"
              aria-hidden
            />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="center"
          className="max-w-none border-0 bg-transparent p-0 shadow-none"
        >
          {treeBody}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const practiceTransferGroupKey = (item: CreditLedgerItem) => {
  if (String(item.refType || "") !== "PRACTICE_TRANSFER") return "";
  const ptx = String(item.refPracticeTransferId || "").trim();
  if (ptx) return `ptx:${ptx}`;
  const refId = String(item.refId || "").trim();
  return refId ? `ptx-ref:${refId}` : "";
};

const toDisplayPart = (item: CreditLedgerItem): LedgerDisplayPart => ({
  label: String(item.displayLabel || "").trim() || typeLabel(item.type),
  amount: Number(item.amount || 0),
  spentPaidAmount: Number(item.spentPaidAmount || 0),
  spentFreeAmount: Number(item.spentFreeAmount || 0),
});

/** 동일 기공의뢰(PTX) 원장 행을 한 건으로 묶는다. */
const groupLedgerItemsForDisplay = (
  items: CreditLedgerItem[],
): LedgerDisplayRow[] => {
  const groupMap = new Map<string, CreditLedgerItem[]>();
  for (const item of items) {
    const gKey = practiceTransferGroupKey(item);
    if (!gKey) continue;
    const list = groupMap.get(gKey);
    if (list) list.push(item);
    else groupMap.set(gKey, [item]);
  }

  const seenGroups = new Set<string>();
  const out: LedgerDisplayRow[] = [];

  for (const item of items) {
    const gKey = practiceTransferGroupKey(item);
    if (!gKey) {
      out.push({
        key: String(item._id || item.uniqueKey),
        createdAt: String(item.createdAt || ""),
        amount: Number(item.amount || 0),
        balanceAfter: item.balanceAfter,
        spentPaidAmount: Number(item.spentPaidAmount || 0),
        spentFreeAmount: Number(item.spentFreeAmount || 0),
        type: item.type,
        displayLabel:
          String(item.displayLabel || "").trim() || typeLabel(item.type),
        parts: null,
        item,
      });
      continue;
    }
    if (seenGroups.has(gKey)) continue;
    seenGroups.add(gKey);

    const members = [...(groupMap.get(gKey) || [])].sort(
      (a, b) =>
        new Date(a.createdAt || 0).getTime() -
        new Date(b.createdAt || 0).getTime(),
    );
    if (members.length === 0) continue;

    if (members.length === 1) {
      const only = members[0];
      out.push({
        key: String(only._id || only.uniqueKey),
        createdAt: String(only.createdAt || ""),
        amount: Number(only.amount || 0),
        balanceAfter: only.balanceAfter,
        spentPaidAmount: Number(only.spentPaidAmount || 0),
        spentFreeAmount: Number(only.spentFreeAmount || 0),
        type: only.type,
        displayLabel:
          String(only.displayLabel || "").trim() || typeLabel(only.type),
        parts: null,
        item: only,
      });
      continue;
    }

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
    out.push({
      key: gKey,
      createdAt: String(latest.createdAt || ""),
      amount,
      balanceAfter: latest.balanceAfter,
      spentPaidAmount,
      spentFreeAmount,
      type: latest.type,
      displayLabel: "기공의뢰",
      parts: members.map(toDisplayPart),
      item: latest,
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
  FREE_CREDIT_CANCEL: "무료크레딧 취소",
  CREDIT_RECONCILE: "잔액 조정",
  SEED_REQUESTOR_CHARGE: "시드 초기 충전",
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
            onClick={onOpenRequestDetail}
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
      <>
        <span className="text-[11px] text-muted-foreground">기공의뢰</span>
        <span className="pt-1 text-[11px] text-slate-700">
          {labName} / {patientName}
        </span>
      </>
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
}: CreditLedgerModalProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { token, user } = useAuthStore();
  const { kind: accessKind } = useRequestorBusinessAccess();
  const isOpen = embedded ? true : open;

  const goCharge = () => {
    if (!chargeNavPath) return;
    if (!embedded) onOpenChange?.(false);
    navigate(chargeNavPath);
  };

  const [period, setPeriod] = useState<PeriodFilterValue>("30d");
  const [creditKind, setCreditKind] = useState<LedgerCreditKindFilter>("all");
  const [action, setAction] = useState<LedgerActionFilter>("all");
  const [q, setQ] = useState("");

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
  const [currentBalanceSnapshot, setCurrentBalanceSnapshot] =
    useState<CreditBalanceSnapshot | null>(null);

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

  // page 상태 변경 시 ref 동기화
  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  const buildPath = (pageNum: number) => {
    const params = new URLSearchParams();
    if (period === "thisMonth" || period === "lastMonth") {
      const range = periodToRange(period);
      if (range?.startDate) params.set("from", range.startDate);
      if (range?.endDate) params.set("to", range.endDate);
    } else if (period) {
      params.set("period", period);
    }
    if (creditKind && creditKind !== "all") params.set("creditKind", creditKind);
    if (action && action !== "all") params.set("action", action);
    if (q.trim()) params.set("q", q.trim());
    params.set("page", String(pageNum));
    params.set("pageSize", String(PAGE_SIZE));

    if (businessAnchorId) {
      return `/api/admin/credits/businesses/${businessAnchorId}/ledger?${params.toString()}`;
    }
    return `/api/credits/ledger?${params.toString()}`;
  };

  const load = async (pageNum: number, reset: boolean) => {
    if (!token) return;
    if (loadingRef.current) return;
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
          currentBalanceSnapshot?: CreditBalanceSnapshot;
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
      const fetched = Array.isArray(data?.items) ? data.items : [];
      const total = Number(data?.total ?? 0);
      if (reset) {
        setCurrentBalanceSnapshot(data?.currentBalanceSnapshot || null);
      }
      setItems((prev) => {
        const next = reset ? fetched : [...prev, ...fetched];
        const more = next.length < total;
        setHasMore(more);
        hasMoreRef.current = more;
        return next;
      });
    } catch (e: unknown) {
      if (reset) {
        setItems([]);
        setCurrentBalanceSnapshot(null);
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
      loadingRef.current = false;
      setLoading(false);
    }
  };

  // 필터 변경 시 초기화
  useEffect(() => {
    if (!isOpen) return;
    setPage(1);
    pageRef.current = 1;
    setHasMore(true);
    hasMoreRef.current = true;
    load(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, period, creditKind, action, q, businessAnchorId]);

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

  const rows = useMemo(
    () => groupLedgerItemsForDisplay(Array.isArray(items) ? items : []),
    [items],
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

  const title = `크레딧 내역${titleSuffix ? ` · ${titleSuffix}` : ""}`;

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
    ? Number(currentBalanceSnapshot.paidCredit || 0) +
      freeCreditTotal +
      (showSettlementCredit ? settlementCreditTotal : 0)
    : 0;

  const body = (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {loading && items.length === 0 ? (
        <CreditLedgerTableSkeleton showSettlement={showSettlementCredit} />
      ) : (
        <>
          {currentBalanceSnapshot ? (
            <div
              className={cn(
                "grid gap-3",
                showSettlementCredit
                  ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4"
                  : "grid-cols-1 sm:grid-cols-3",
              )}
            >
              <BalanceStatCard
                label="현재 잔액"
                value={currentBalanceTotal}
                tone="primary"
                hint={
                  showSettlementCredit
                    ? "유료(선입금) + 무료 + 기공"
                    : "유료(선입금) + 무료"
                }
              />
              <BalanceStatCard
                label="유료크레딧"
                value={Number(currentBalanceSnapshot.paidCredit || 0)}
                hint={CREDIT_PAID_BUCKET_HINT}
                hintTooltip={CREDIT_LEDGER_PREPAID_NOTICE_BODY}
              />
              <BalanceStatCard
                label="무료크레딧"
                value={freeCreditTotal}
                hint={CREDIT_FREE_BUCKET_HINT}
                hintTooltip={CREDIT_LEDGER_FREE_NOTICE_BODY}
              />
              {showSettlementCredit ? (
                <BalanceStatCard
                  label="기공크레딧"
                  value={settlementCreditTotal}
                  hint={CREDIT_SETTLEMENT_BUCKET_HINT}
                  hintTooltip={CREDIT_LEDGER_SETTLEMENT_NOTICE_BODY}
                />
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <PeriodFilter
              value={period}
              onChange={setPeriod}
              useStoreCustomRange={false}
            />

            <div className="w-[130px]">
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

            <div className="w-[130px]">
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
                className="ml-auto h-9 rounded-xl px-4 font-semibold"
                onClick={goCharge}
                disabled={loading}
              >
                <CreditCard className="mr-1.5 h-3.5 w-3.5" />
                충전
              </Button>
            ) : null}
          </div>

          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-x-auto overflow-y-auto rounded-2xl border border-slate-200/80 bg-white/70 shadow-sm"
          >
            <Table>
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
                  <TableHead className="w-[110px] text-center">
                    <button
                      type="button"
                      className="mx-auto inline-flex items-center gap-1 whitespace-nowrap text-xs sm:text-sm"
                      onClick={() => toggleSort("type")}
                    >
                      유형
                      {renderSortIcon(sort.key === "type", sort.direction)}
                    </button>
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
                  const hasParts = Array.isArray(r.parts) && r.parts.length > 1;
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
                  return (
                    <TableRow key={r.key}>
                      <TableCell className="whitespace-nowrap text-center align-middle text-xs">
                        {formatDate(String(r.createdAt || ""))}
                      </TableCell>
                      {hasParts ? (
                        <TableCell colSpan={2} className="px-2 py-2.5 align-middle">
                          <PracticeTransferLedgerTree
                            totalAmount={amount}
                            parts={r.parts!}
                          />
                        </TableCell>
                      ) : (
                        <>
                          <TableCell className="text-center text-xs font-medium align-middle">
                            <span className="whitespace-nowrap">
                              {r.displayLabel || typeLabel(r.type)}
                            </span>
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-center font-medium tabular-nums align-middle",
                              isMinus
                                ? "text-destructive"
                                : "text-primary-strong",
                            )}
                          >
                            {showSplit ? (
                              <div className="flex flex-col items-center leading-4">
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
                              </div>
                            ) : (
                              `${amount.toLocaleString()}원`
                            )}
                          </TableCell>
                        </>
                      )}
                      <TableCell className="whitespace-nowrap text-center align-middle text-xs tabular-nums text-muted-foreground">
                        {r.balanceAfter !== undefined
                          ? `${Number(r.balanceAfter).toLocaleString()}원`
                          : "-"}
                      </TableCell>
                      <TableCell className="text-center align-middle text-xs">
                        <div className="flex flex-col items-center leading-4">
                          {renderTransactionDetail({
                            item: r.item,
                            safeRef,
                            onOpenRequestDetail: () =>
                              setSelectedDetail(toRequestDetail(r.item)),
                          })}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}

                {loading && rows.length > 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-4 text-center text-sm text-muted-foreground"
                    >
                      불러오는 중…
                    </TableCell>
                  </TableRow>
                )}

                {!loading && rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      조회 결과가 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

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
          <DialogContent className="flex max-h-[85vh] w-[92vw] max-w-5xl flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:rounded-2xl">
            <DialogHeader className="space-y-0 border-b border-slate-100 px-5 pb-4 pt-5 pr-12 sm:px-6 sm:pr-14">
              <div className="flex items-center justify-between gap-2">
                <DialogTitle className="text-lg font-semibold tracking-tight text-slate-900">
                  {title}
                </DialogTitle>
                {headerActions}
              </div>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-hidden px-5 py-4 sm:px-6">
              {body}
            </div>
          </DialogContent>
        </Dialog>
      )}

      <RequestDetailDialog
        open={Boolean(selectedDetail)}
        onOpenChange={(next) => {
          if (!next) setSelectedDetail(null);
        }}
        request={selectedDetail}
        rows={rows}
      />
    </>
  );
};

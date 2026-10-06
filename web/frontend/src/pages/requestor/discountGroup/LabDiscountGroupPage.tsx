// related files:
// - web/frontend/src/pages/requestor/discountGroup/labDiscountGroupPolicy.ts
// - web/frontend/src/pages/requestor/referralGroups/hooks/useReferralData.ts
// - web/frontend/src/shared/settlement/settlementUi.tsx
// - web/frontend/src/shared/ui/dashboard/DashboardShell.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/App.tsx
// - web/frontend/rules.md
// change-log:
// - 2026-10-07: 정책 모달 폭 축소·fact 3장 세로 배치.
// - 2026-10-07: 정책 모달 — 가격 카드 + fact 그리드. 문구 단축.
// - 2026-10-07: 정책 fact — 기본가격·사용량할인·가입이벤트·소개그룹.
// - 2026-10-07: 단가 ₩1.5만원 취소선. 상단 4카드 1행. 할인정책은 소개그룹 헤더.
// - 2026-10-07: 가입링크·소개링크. 단가 취소선. 할인 카드 제거·기공소/그룹 할인 표시.
// - 2026-10-07: DashboardShell·SettlementStatCard 스타일. 정책 문구는 fact 모달로 단축.
// - 2026-10-07: 기공소 할인그룹 페이지 복구(표시만). 청구 적용 로직은 추후.
import { useMemo, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BadgeCheck, Check, Copy, Link2 } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";
import { useRequestorBusinessAccess } from "@/shared/business/useRequestorBusinessAccess";
import { useReferralData } from "@/pages/requestor/referralGroups/hooks/useReferralData";
import { ReferralNetworkChart } from "@/features/referral/components/ReferralNetworkChart";
import { buildLabIntroMessage } from "@/shared/platform/referralShareMessages";
import { formatKstYmdToKo, toKstYmd } from "@/shared/date/kst";
import { formatAbutsManwon } from "@/shared/pricing/abutsAbutmentService";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import { cn } from "@/shared/ui/cn";
import {
  SETTLEMENT_STAT_ROW_CLASS,
  SettlementPolicyDialog,
  SettlementPolicyFact,
  SettlementStatCard,
} from "@/shared/settlement/settlementUi";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  LAB_DISCOUNT_BASE_UNIT_PRICE,
  LAB_DISCOUNT_INTRO_DAYS,
  LAB_DISCOUNT_INTRO_UNIT_PRICE,
  LAB_DISCOUNT_MAX_AMOUNT,
  LAB_DISCOUNT_PER_ORDER,
  formatLabDiscountWon,
  previewLabDiscountUnitPrice,
} from "./labDiscountGroupPolicy";

/** 상단 4카드 1행 — 고정 max 없이 가로를 나눠 쓴다. */
const LAB_DISCOUNT_STATS_ROW_CLASS = cn(
  SETTLEMENT_STAT_ROW_CLASS,
  "flex-nowrap",
);
const LAB_DISCOUNT_CODE_CARD_CLASS =
  "flex min-h-[7.25rem] min-w-0 flex-[1.35] basis-0 flex-col rounded-2xl border-2 border-primary/60 bg-white p-3 shadow-sm sm:p-4";
const LAB_DISCOUNT_STAT_CARD_WIDTH_CLASS = "min-w-0 flex-1 basis-0";

function volumeDiscountAmount(orders: number): number {
  return Math.min(
    Math.max(0, Math.floor(Number(orders) || 0)) * LAB_DISCOUNT_PER_ORDER,
    LAB_DISCOUNT_MAX_AMOUNT,
  );
}

function formatManwonWithWonPrefix(price: number): string {
  return `₩${formatAbutsManwon(price)}`;
}

function UnitPriceValue({
  unitPrice,
  basePrice,
}: {
  unitPrice: number;
  basePrice: number;
}): ReactNode {
  if (unitPrice < basePrice) {
    return (
      <span className="inline-flex flex-wrap items-baseline justify-center gap-1.5">
        <span className="text-base font-normal text-slate-400 line-through">
          {formatManwonWithWonPrefix(basePrice)}
        </span>
        <span>{formatAbutsManwon(unitPrice)}</span>
      </span>
    );
  }
  return formatManwonWithWonPrefix(unitPrice);
}

/** 정책 모달 가격 행 — PricingPolicyDialog PriceRow와 동일 톤. */
function PolicyPriceRow({
  label,
  value,
  strikeValue,
  note,
}: {
  label: string;
  value: string;
  strikeValue?: string;
  note?: string;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0 text-sm text-slate-600">{label}</div>
        <div className="flex shrink-0 items-baseline gap-1.5 tabular-nums">
          {strikeValue ? (
            <span className="text-base font-normal text-slate-400 line-through">
              {strikeValue}
            </span>
          ) : null}
          <div className="text-xl font-semibold tracking-tight text-slate-900">
            {value}
          </div>
        </div>
      </div>
      {note ? (
        <div className="text-right text-xs tabular-nums text-slate-500">
          {note}
        </div>
      ) : null}
    </div>
  );
}

export default function LabDiscountGroupPage() {
  const { toast } = useToast();
  const { user } = useAuthStore();
  const { kind, loading: accessLoading } = useRequestorBusinessAccess();
  const [signupCopied, setSignupCopied] = useState(false);
  const [introCopied, setIntroCopied] = useState(false);

  const {
    isReferralEligible,
    referralCode,
    referralLink,
    requestorStats,
    loadingRequestor,
    treeData,
    loadingTree,
    treeMemberCount,
  } = useReferralData({
    fetchStats: true,
    fetchDirectMembers: false,
    fetchTree: true,
  });

  const myOrders = Number(
    requestorStats?.selfBusinessOrders ??
      requestorStats?.myLast30DaysOrders ??
      requestorStats?.myLastMonthOrders ??
      0,
  );
  const groupOrders = Number(
    requestorStats?.groupTotalOrders ??
      requestorStats?.referralBusinessOrders ??
      0,
  );
  const memberCount = Number(
    treeMemberCount ?? requestorStats?.groupMemberCount ?? 0,
  );
  const myDiscount = volumeDiscountAmount(myOrders);
  const groupDiscount = volumeDiscountAmount(groupOrders);

  const pricePreview = useMemo(
    () =>
      previewLabDiscountUnitPrice({
        groupOrders,
        approvedAt: user?.approvedAt,
        createdAt: user?.createdAt,
      }),
    [groupOrders, user?.approvedAt, user?.createdAt],
  );

  const introEndsLabel = pricePreview.introEndsAt
    ? formatKstYmdToKo(toKstYmd(pricePreview.introEndsAt))
    : null;

  const unitPriceHint = pricePreview.inIntroPeriod ? (
    <>
      {LAB_DISCOUNT_INTRO_DAYS}일 가입이벤트
      {introEndsLabel ? (
        <>
          <br />
          {introEndsLabel}까지
        </>
      ) : null}
    </>
  ) : pricePreview.rule === "usage_discount" ? (
    <>지난 30일 사용량</>
  ) : (
    <>기본 가격</>
  );

  const handleCopySignupLink = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setSignupCopied(true);
      setTimeout(() => setSignupCopied(false), 2000);
      toast({
        title: "복사 완료",
        description: "가입 링크가 복사되었습니다.",
        duration: 2000,
      });
    } catch {
      toast({
        title: "복사 실패",
        description: "브라우저 권한을 확인해주세요.",
        variant: "destructive",
      });
    }
  };

  const handleCopyIntroLink = async () => {
    if (!referralLink) return;
    try {
      const text = buildLabIntroMessage(referralLink) || referralLink;
      await navigator.clipboard.writeText(text);
      setIntroCopied(true);
      setTimeout(() => setIntroCopied(false), 2000);
      toast({
        title: "복사 완료",
        description: "소개 링크가 복사되었습니다.",
        duration: 2000,
      });
    } catch {
      toast({
        title: "복사 실패",
        description: "브라우저 권한을 확인해주세요.",
        variant: "destructive",
      });
    }
  };

  if (accessLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  if (user?.role !== "requestor" || kind !== "lab") {
    return <Navigate to="/dashboard" replace />;
  }

  if (!isReferralEligible) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-sm text-slate-500">
        기공소 계정에서 확인할 수 있습니다.
      </div>
    );
  }

  const statsLoading = loadingRequestor || loadingTree;
  const maxOrdersForFloor = LAB_DISCOUNT_MAX_AMOUNT / LAB_DISCOUNT_PER_ORDER;
  const groupLabel =
    memberCount > 0
      ? `그룹 (${memberCount.toLocaleString("ko-KR")}개소)`
      : "그룹";

  const policyDialog = (
    <SettlementPolicyDialog
      title="할인그룹 정책"
      description="커스텀어벗 건당 의뢰비"
      triggerLabel="할인 정책"
      contentClassName="sm:max-w-md"
    >
      <div className="space-y-3">
        <section className="rounded-2xl border border-slate-200/80 bg-white px-4 py-4 shadow-sm ring-1 ring-slate-900/[0.02]">
          <div className="space-y-3">
            <PolicyPriceRow
              label="기본 가격"
              value={`${formatLabDiscountWon(LAB_DISCOUNT_BASE_UNIT_PRICE)}원`}
            />
            <div className="h-px bg-slate-100" />
            <PolicyPriceRow
              label="오늘 가격"
              strikeValue={`${formatLabDiscountWon(LAB_DISCOUNT_BASE_UNIT_PRICE)}원`}
              value={`${formatLabDiscountWon(LAB_DISCOUNT_INTRO_UNIT_PRICE)}원`}
              note={`${LAB_DISCOUNT_INTRO_DAYS}일 가입이벤트`}
            />
          </div>
        </section>

        <div className="grid gap-2.5">
          <SettlementPolicyFact label="사용량 할인">
            지난 30일 합산 1건당 {LAB_DISCOUNT_PER_ORDER}원
            <br />
            {maxOrdersForFloor}건 이상이면 최대{" "}
            {formatLabDiscountWon(LAB_DISCOUNT_MAX_AMOUNT)}원
          </SettlementPolicyFact>
          <SettlementPolicyFact label="가입 이벤트">
            {LAB_DISCOUNT_INTRO_DAYS}일간{" "}
            {formatLabDiscountWon(LAB_DISCOUNT_INTRO_UNIT_PRICE)}원 고정
            <br />
            {LAB_DISCOUNT_INTRO_DAYS + 1}일부터 지난 30일 주문량으로 결정
          </SettlementPolicyFact>
          <SettlementPolicyFact label="소개 그룹">
            소개한 기공소 주문량을 합산해 할인합니다.
          </SettlementPolicyFact>
        </div>
      </div>
    </SettlementPolicyDialog>
  );

  return (
    <TooltipProvider>
      <DashboardShell
        title="할인그룹"
        subtitle=""
        statsGridClassName={LAB_DISCOUNT_STATS_ROW_CLASS}
        stats={
          statsLoading ? (
            <>
              <Skeleton className="min-h-[7.25rem] min-w-0 flex-[1.35] basis-0" />
              <Skeleton className="min-h-[7.25rem] min-w-0 flex-1 basis-0" />
              <Skeleton className="min-h-[7.25rem] min-w-0 flex-1 basis-0" />
              <Skeleton className="min-h-[7.25rem] min-w-0 flex-1 basis-0" />
            </>
          ) : (
            <>
              <div className={LAB_DISCOUNT_CODE_CARD_CLASS}>
                <div className="flex shrink-0 items-center justify-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 border-primary text-primary-strong hover:bg-primary-soft"
                    disabled={!referralLink}
                    onClick={() => void handleCopySignupLink()}
                  >
                    {signupCopied ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    가입링크
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 border-primary text-primary-strong hover:bg-primary-soft"
                    disabled={!referralLink}
                    onClick={() => void handleCopyIntroLink()}
                  >
                    {introCopied ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Link2 className="h-3.5 w-3.5" />
                    )}
                    소개링크
                  </Button>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => void handleCopySignupLink()}
                      className="flex flex-1 items-center justify-center gap-2 sm:gap-3"
                    >
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-slate-500 sm:text-[13px]">
                        <BadgeCheck className="h-3.5 w-3.5 text-primary" />
                        소개 코드
                      </span>
                      <span className="font-mono text-4xl font-bold tracking-[0.2em] text-slate-900 sm:text-5xl">
                        {referralCode || "—"}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    다른 기공소 가입 시 입력하는 코드
                  </TooltipContent>
                </Tooltip>
              </div>

              <SettlementStatCard
                className={LAB_DISCOUNT_STAT_CARD_WIDTH_CLASS}
                label="오늘 건당 의뢰비"
                value={
                  <UnitPriceValue
                    unitPrice={pricePreview.unitPrice}
                    basePrice={LAB_DISCOUNT_BASE_UNIT_PRICE}
                  />
                }
                tone="primary"
                hint={unitPriceHint}
              />
              <SettlementStatCard
                className={LAB_DISCOUNT_STAT_CARD_WIDTH_CLASS}
                label="우리 기공소"
                value={`${myOrders.toLocaleString("ko-KR")}건`}
                hint={`${formatLabDiscountWon(myDiscount)}원 할인`}
              />
              <SettlementStatCard
                className={LAB_DISCOUNT_STAT_CARD_WIDTH_CLASS}
                label={groupLabel}
                value={`${groupOrders.toLocaleString("ko-KR")}건`}
                hint={`${formatLabDiscountWon(groupDiscount)}원 할인`}
              />
            </>
          )
        }
        mainLeft={
          loadingTree ? (
            <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-700">
                  소개 그룹
                </div>
                {policyDialog}
              </div>
              <Skeleton className="h-[320px] w-full" />
            </div>
          ) : (
            <ReferralNetworkChart
              data={treeData}
              maxDepth={1}
              title="소개 그룹"
              headerRight={policyDialog}
              mode="radial-tree"
              currentBusinessAnchorId={user?.businessAnchorId || null}
              visibleRoles={["requestor"]}
              legendRoles={[]}
              chartHeight={420}
            />
          )
        }
      />
    </TooltipProvider>
  );
}

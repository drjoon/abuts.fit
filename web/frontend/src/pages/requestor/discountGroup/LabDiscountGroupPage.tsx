// related files:
// - web/frontend/src/pages/requestor/discountGroup/labDiscountGroupPolicy.ts
// - web/frontend/src/pages/requestor/referralGroups/hooks/useReferralData.ts
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/App.tsx
// - web/frontend/rules.md
// change-log:
// - 2026-10-07: 기공소 할인그룹 페이지 복구(표시만). 청구 적용 로직은 추후.
import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Copy, Link2 } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";
import { useRequestorBusinessAccess } from "@/shared/business/useRequestorBusinessAccess";
import { useReferralData } from "@/pages/requestor/referralGroups/hooks/useReferralData";
import { ReferralNetworkChart } from "@/features/referral/components/ReferralNetworkChart";
import { buildLabIntroMessage } from "@/shared/platform/referralShareMessages";
import { formatKstYmdToKo, toKstYmd } from "@/shared/date/kst";
import {
  LAB_DISCOUNT_BASE_UNIT_PRICE,
  LAB_DISCOUNT_INTRO_DAYS,
  LAB_DISCOUNT_INTRO_UNIT_PRICE,
  LAB_DISCOUNT_MAX_AMOUNT,
  LAB_DISCOUNT_MIN_UNIT_PRICE,
  LAB_DISCOUNT_PER_ORDER,
  formatLabDiscountWon,
  previewLabDiscountUnitPrice,
} from "./labDiscountGroupPolicy";

function MetricCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3.5">
      <div className="text-xs text-slate-500">{title}</div>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
        {value}
      </div>
      {subtitle ? (
        <div className="mt-1 text-xs text-slate-500">{subtitle}</div>
      ) : null}
    </div>
  );
}

export default function LabDiscountGroupPage() {
  const { toast } = useToast();
  const { user } = useAuthStore();
  const { kind, loading: accessLoading } = useRequestorBusinessAccess();
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

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

  const ruleSubtitle = pricePreview.inIntroPeriod
    ? introEndsLabel
      ? `가입 후 ${LAB_DISCOUNT_INTRO_DAYS}일 고정 · ${introEndsLabel}까지`
      : `가입 후 ${LAB_DISCOUNT_INTRO_DAYS}일 고정`
    : pricePreview.rule === "usage_discount"
      ? `그룹 합산 ${groupOrders.toLocaleString("ko-KR")}건 · 건당 ${LAB_DISCOUNT_PER_ORDER}원 할인`
      : "기본가 적용";

  const handleCopyLink = async () => {
    if (!referralLink) return;
    try {
      const text = buildLabIntroMessage(referralLink) || referralLink;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "복사 완료",
        description: "소개 안내와 링크가 복사되었습니다.",
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

  const handleCopyCode = async () => {
    if (!referralCode) return;
    try {
      await navigator.clipboard.writeText(referralCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
      toast({
        title: "복사 완료",
        description: "소개 코드가 복사되었습니다.",
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
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  if (user?.role !== "requestor" || kind !== "lab") {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-1.5 py-1.5">
        {!isReferralEligible ? (
          <Card>
            <CardContent className="pt-6">
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                기공소 계정에서 확인할 수 있습니다.
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-12 xl:items-stretch">
            <Card className="flex h-full flex-col xl:col-span-5">
              <CardHeader className="pb-3">
                <CardTitle className="text-xl">소개 링크</CardTitle>
                <CardDescription>
                  다른 기공소를 소개하면 같은 할인그룹으로 묶입니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4 pt-0">
                <button
                  type="button"
                  onClick={() => void handleCopyCode()}
                  className="w-full rounded-xl bg-slate-50 px-4 py-5 text-left transition-colors hover:bg-slate-100"
                >
                  <div className="text-xs font-medium text-slate-500">
                    소개 코드
                  </div>
                  <div className="mt-1 font-mono text-3xl font-semibold tracking-wider text-slate-900">
                    {referralCode || "—"}
                  </div>
                </button>

                <div className="mt-auto grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void handleCopyCode()}
                    className="h-9 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {codeCopied ? (
                      <>
                        <Check className="h-4 w-4" />
                        복사됨
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        코드 복사
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void handleCopyLink()}
                    className="h-9 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4" />
                        복사됨
                      </>
                    ) : (
                      <>
                        <Link2 className="h-4 w-4" />
                        링크 복사
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="flex h-full flex-col xl:col-span-7">
              <CardHeader className="pb-3">
                <CardTitle className="text-xl">오늘 건당 의뢰비</CardTitle>
                <CardDescription>
                  정책 미리보기 · 청구 적용은 추후 연결
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col pt-0">
                {loadingRequestor || loadingTree ? (
                  <div className="grid flex-1 gap-3 sm:grid-cols-2">
                    <Skeleton className="h-full min-h-[88px]" />
                    <Skeleton className="h-full min-h-[88px]" />
                    <Skeleton className="h-full min-h-[88px]" />
                    <Skeleton className="h-full min-h-[88px]" />
                  </div>
                ) : (
                  <div className="grid flex-1 gap-3 sm:grid-cols-2">
                    <MetricCard
                      title="오늘 우리 기공소 건당 의뢰비"
                      value={`${formatLabDiscountWon(pricePreview.unitPrice)}원`}
                      subtitle={ruleSubtitle}
                    />
                    <MetricCard
                      title="기본가 대비 할인"
                      value={`${formatLabDiscountWon(pricePreview.discountAmount)}원`}
                      subtitle={`기본 ${formatLabDiscountWon(LAB_DISCOUNT_BASE_UNIT_PRICE)}원 · 최저 ${formatLabDiscountWon(LAB_DISCOUNT_MIN_UNIT_PRICE)}원`}
                    />
                    <MetricCard
                      title="우리 기공소 의뢰"
                      value={`${myOrders.toLocaleString("ko-KR")}건`}
                      subtitle="측정 구간 합산(표시)"
                    />
                    <MetricCard
                      title="그룹 합산 의뢰"
                      value={`${groupOrders.toLocaleString("ko-KR")}건`}
                      subtitle={
                        memberCount > 0
                          ? `그룹 ${memberCount.toLocaleString("ko-KR")}개소 · 할인 ${formatLabDiscountWon(pricePreview.discountAmount)}원`
                          : `할인 ${formatLabDiscountWon(pricePreview.discountAmount)}원`
                      }
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="xl:col-span-12">
              <CardHeader className="pb-3">
                <CardTitle className="text-xl">할인 정책</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-relaxed text-slate-700">
                <p>
                  기본 가격은{" "}
                  {formatLabDiscountWon(LAB_DISCOUNT_BASE_UNIT_PRICE)}원입니다.
                  <br />
                  지난 달 합계 의뢰 1건당 {LAB_DISCOUNT_PER_ORDER}원
                  할인합니다.
                  <br />
                  {LAB_DISCOUNT_MAX_AMOUNT / LAB_DISCOUNT_PER_ORDER}건이면{" "}
                  {formatLabDiscountWon(LAB_DISCOUNT_MIN_UNIT_PRICE)}원입니다.
                </p>
                <p>
                  가입 후 {LAB_DISCOUNT_INTRO_DAYS}일간은{" "}
                  {formatLabDiscountWon(LAB_DISCOUNT_INTRO_UNIT_PRICE)}원
                  고정입니다.
                  <br />
                  이후에는 지난 달 사용량으로 이번 달 가격이 정해집니다.
                </p>
                <p>
                  예: 1월 10일 가입 → 4월 10일부터는 3월 10일~4월 9일
                  주문량으로 가격이 정해집니다.
                </p>
                <p>
                  다른 기공소를 소개하면 그룹으로 묶이고, 주문량을 합산해
                  할인합니다.
                </p>
              </CardContent>
            </Card>

            <div className="xl:col-span-12">
              {loadingTree ? (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-xl">소개 그룹</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-[320px]" />
                  </CardContent>
                </Card>
              ) : (
                <ReferralNetworkChart
                  data={treeData}
                  maxDepth={1}
                  title="소개 그룹"
                  mode="radial-tree"
                  currentBusinessAnchorId={user?.businessAnchorId || null}
                  visibleRoles={["requestor"]}
                  legendRoles={[]}
                  chartHeight={420}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

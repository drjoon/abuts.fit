// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/salesman/referral/SalesmanReferralPage.tsx
import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PricingPolicyDialog } from "@/shared/ui/PricingPolicyDialog";
import { useReferralData } from "@/pages/requestor/referralGroups/hooks/useReferralData";
import { ReferralNetworkChart } from "@/features/referral/components/ReferralNetworkChart";
import { useAuthStore } from "@/store/useAuthStore";

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
      <div className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-900">
        {value}
      </div>
      {subtitle ? (
        <div className="mt-1 text-xs text-slate-500">{subtitle}</div>
      ) : null}
    </div>
  );
}

export const DevopsReferralPage = () => {
  const { user } = useAuthStore();
  const [policyOpen, setPolicyOpen] = useState(false);
  const {
    isReferralEligible,
    requestorStats,
    loadingRequestor,
    directMembers,
    loadingDirectMembers,
    treeData,
    loadingTree,
  } = useReferralData({
    fetchStats: true,
    fetchDirectMembers: true,
    fetchTree: true,
  });

  const noSalesmanSignupCount = directMembers.length;
  const requestorOrders = Number(
    requestorStats?.selfBusinessOrders ??
      requestorStats?.myLast30DaysOrders ??
      requestorStats?.myLastMonthOrders ??
      0,
  );
  const referralBusinessCount = Number(
    requestorStats?.referralBusinessCount ?? noSalesmanSignupCount,
  );
  const requestorGroupOrders = Number(
    (requestorStats?.referralBusinessOrders ??
      requestorStats?.groupTotalOrders) ||
      0,
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {!isReferralEligible ? (
          <Card>
            <CardContent className="pt-6">
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                개발운영사 계정에서 확인할 수 있습니다.
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-12 xl:items-stretch">
            <Card className="flex h-full flex-col xl:col-span-12">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-xl">개발운영사 소개 통계</CardTitle>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setPolicyOpen(true)}
                  >
                    정책 보기
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col pt-0">
                {loadingRequestor || loadingDirectMembers ? (
                  <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Skeleton className="h-full min-h-[88px]" />
                    <Skeleton className="h-full min-h-[88px]" />
                    <Skeleton className="h-full min-h-[88px]" />
                  </div>
                ) : (
                  <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <MetricCard
                      title="내가 소개한 사업자 수"
                      value={`${referralBusinessCount.toLocaleString()}개소`}
                      subtitle="영업자 연결 없이 자동 배정된 사업자"
                    />
                    <MetricCard
                      title="소개 사업자 의뢰건수 합산 (최근 30일)"
                      value={`${requestorGroupOrders.toLocaleString()}건`}
                      subtitle={
                        requestorGroupOrders > 0
                          ? `내 사업자 포함: ${requestorOrders.toLocaleString()}건`
                          : undefined
                      }
                    />
                    <div className="rounded-xl bg-primary-soft px-4 py-3.5 text-xs leading-relaxed text-primary-strong sm:col-span-2 lg:col-span-1">
                      <p>
                        영업자 소개 없이 가입한 의뢰자는 자동으로 개발운영사
                        소개로 등록됩니다.
                      </p>
                      <p className="mt-1.5">
                        개발·운영사 분배율은 유료의뢰비 기준 10%가 지급됩니다.
                      </p>
                      <p className="mt-1.5">
                        수수료는 사업자 기준으로 매일 자정(00:00) 업데이트됩니다.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="xl:col-span-12">
              {loadingTree ? (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-xl">소개 네트워크</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-[320px]" />
                  </CardContent>
                </Card>
              ) : (
                <ReferralNetworkChart
                  data={treeData}
                  maxDepth={1}
                  title="소개 네트워크"
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

      <PricingPolicyDialog
        open={policyOpen}
        onOpenChange={setPolicyOpen}
        variant="devops"
      />
    </div>
  );
};

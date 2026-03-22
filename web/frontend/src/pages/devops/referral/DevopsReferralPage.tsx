import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useReferralData } from "@/pages/requestor/referralGroups/hooks/useReferralData";
import { ReferralNetworkChart } from "@/features/referral/components/ReferralNetworkChart";

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
    <div className="rounded-2xl border border-gray-200 bg-white/80 shadow-sm p-4">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      {subtitle ? (
        <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>
      ) : null}
    </div>
  );
}

export const DevopsReferralPage = () => {
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
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-3 space-y-3 min-h-full">
          {!isReferralEligible ? (
            <Card className="border-gray-200">
              <CardContent className="pt-6">
                <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  개발운영사 계정에서 확인할 수 있습니다.
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="border-gray-200">
                <CardHeader>
                  <CardTitle className="text-base">
                    개발운영사 소개 통계
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingRequestor || loadingDirectMembers ? (
                    <div className="grid gap-2 md:grid-cols-4">
                      <Skeleton className="h-20" />
                      <Skeleton className="h-20" />
                      <Skeleton className="h-20" />
                      <Skeleton className="h-20" />
                    </div>
                  ) : (
                    <div className="grid gap-2 md:grid-cols-4">
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
                      <div className="rounded-2xl border border-gray-200 bg-white/80 shadow-sm p-4 md:col-span-2 flex flex-col justify-between gap-2">
                        <div className="text-xs text-muted-foreground">
                          - 영업자 소개 없이 가입한 의뢰자는 자동으로 개발운영사
                          소개로 등록됩니다.
                          <br />- 직접 소개한 의뢰자의 유료 매출의 5%를 수수료로
                          지급합니다.
                          <br />- 수수료는 사업자 기준으로 매일 자정(00:00)
                          업데이트됩니다.
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {loadingTree ? (
                <Card className="border-gray-200">
                  <CardHeader>
                    <CardTitle className="text-base">소개 네트워크</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-[320px]" />
                  </CardContent>
                </Card>
              ) : (
                <ReferralNetworkChart
                  data={treeData}
                  maxDepth={1}
                  title="내 소개 네트워크"
                  mode="radial-group"
                  visibleRoles={["requestor"]}
                  legendRoles={[]}
                  chartHeight={320}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

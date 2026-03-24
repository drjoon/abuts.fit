import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Check } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";
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

export const SalesmanReferralPage = () => {
  const { toast } = useToast();
  const { user } = useAuthStore();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"link" | "dashboard">("link");
  const [codeCopied, setCodeCopied] = useState(false);

  const {
    isReferralEligible,
    referralCode,
    referralLink,
    requestorStats,
    loadingRequestor,
    directMembers,
    loadingDirectMembers,
    treeData,
    loadingTree,
  } = useReferralData({
    fetchStats: activeTab === "dashboard",
    fetchDirectMembers: activeTab === "dashboard",
    fetchTree: activeTab === "dashboard",
  });

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

  const handleCopyLink = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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

  const directReferralBusinessCount = Number(
    requestorStats?.referralBusinessCount ?? directMembers.length,
  );
  const directReferralOrders = Number(
    (requestorStats?.referralBusinessOrders ??
      requestorStats?.groupTotalOrders) ||
      0,
  );
  const indirectReferralBusinessCount = Number(
    requestorStats?.indirectReferralBusinessCount ?? 0,
  );
  const indirectReferralOrders = Number(
    requestorStats?.indirectReferralBusinessOrders ?? 0,
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 탭 네비게이션 */}
      <div className="border-b border-gray-200 bg-white">
        <div className="flex gap-8 px-4 sm:px-6">
          <button
            onClick={() => setActiveTab("link")}
            className={`py-4 px-1 font-medium text-sm border-b-2 transition-colors ${
              activeTab === "link"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            소개 링크
          </button>
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`py-4 px-1 font-medium text-sm border-b-2 transition-colors ${
              activeTab === "dashboard"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            소개 대시보드
          </button>
        </div>
      </div>

      {/* 탭 콘텐츠 */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* 소개 링크 탭 */}
        {activeTab === "link" && (
          <div className="flex items-start justify-center min-h-full p-6 bg-transparent">
            <Card className="w-full border-slate-200">
              <CardHeader className="space-y-2 px-8 pt-8 pb-4">
                <CardTitle className="text-2xl">내 소개 링크</CardTitle>
                <p className="text-sm text-slate-600">
                  이 링크를 공유하고 새로운 사업자를 소개하세요.
                </p>
              </CardHeader>

              <CardContent className="space-y-2 px-8 pb-8">
                {!isReferralEligible ? (
                  <div className="rounded-lg bg-blue-50 border border-blue-100 p-4 text-sm text-blue-700">
                    영업자 또는 개발운영사 계정에서 확인할 수 있습니다.
                  </div>
                ) : (
                  <>
                    {/* 소개 코드 */}
                    <div className="space-y-2 pb-4">
                      <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                        소개 코드
                      </label>
                      <div
                        className="rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-4 px-4 py-5 cursor-pointer hover:bg-slate-100 transition-colors"
                        onClick={() => void handleCopyCode()}
                      >
                        <p className="text-4xl font-mono text-slate-700 break-all leading-relaxed">
                          {referralCode || "—"}
                        </p>
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleCopyCode();
                          }}
                          variant="default"
                          size="sm"
                          className="px-4 text-xs h-8 gap-1.5 shrink-0"
                        >
                          {codeCopied ? (
                            <>
                              <Check className="w-4 h-4" />
                              복사됨
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4" />
                              코드 복사
                            </>
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* 소개 링크 */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                        소개 링크
                      </label>
                      <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 flex items-center justify-between gap-4">
                        <p className="text-sm font-mono text-slate-700 break-all leading-relaxed">
                          {referralLink}
                        </p>
                        <Button
                          onClick={handleCopyLink}
                          variant="default"
                          size="sm"
                          className="px-4 text-xs h-8 gap-1.5 shrink-0"
                        >
                          {copied ? (
                            <>
                              <Check className="w-4 h-4" />
                              복사됨
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4" />
                              링크 복사
                            </>
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* 정책 안내 */}
                    <div className="space-y-3 pt-4">
                      <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                        소개 정책
                      </div>
                    </div>

                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
                      <div className="text-xs text-slate-600 space-y-1">
                        <p>
                          - 직접 소개한 의뢰자의 유료 매출의 5%를 수수료로
                          지급합니다.
                        </p>
                        <p>
                          - 간접 소개한 의뢰자(직접 소개한 사람이 다시 소개한
                          의뢰자)의 유료 매출의 2.5%를 수수료로 지급합니다.
                        </p>
                        <p>
                          - 수수료는 사업자 기준으로 매일 자정(00:00)
                          업데이트됩니다.
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* 소개 대시보드 탭 */}
        {activeTab === "dashboard" && (
          <div className="p-3 space-y-3">
            {!isReferralEligible ? (
              <Card className="border-gray-200">
                <CardContent className="pt-6">
                  <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                    영업자 계정에서 확인할 수 있습니다.
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* 통계 카드 */}
                <Card className="border-gray-200">
                  <CardHeader>
                    <CardTitle className="text-base">
                      영업자 소개 통계
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {loadingRequestor || loadingDirectMembers ? (
                      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
                        <Skeleton className="h-20" />
                        <Skeleton className="h-20" />
                        <Skeleton className="h-20" />
                        <Skeleton className="h-20" />
                      </div>
                    ) : (
                      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
                        <MetricCard
                          title="직접 소개 사업자 수"
                          value={`${directReferralBusinessCount.toLocaleString()}개소`}
                          subtitle="내가 직접 소개한 사업자 (5% 수수료)"
                        />
                        <MetricCard
                          title="직접 소개 의뢰건수 (최근 30일)"
                          value={`${directReferralOrders.toLocaleString()}건`}
                          subtitle="직접 소개 사업자들의 의뢰 합산"
                        />
                        <MetricCard
                          title="간접 소개 사업자 수"
                          value={`${indirectReferralBusinessCount.toLocaleString()}개소`}
                          subtitle="직접 소개한 사업자가 다시 소개한 사업자 (2.5% 수수료)"
                        />
                        <MetricCard
                          title="간접 소개 의뢰건수 (최근 30일)"
                          value={`${indirectReferralOrders.toLocaleString()}건`}
                          subtitle="간접 소개 사업자들의 의뢰 합산"
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* 소개 네트워크 차트 */}
                {loadingTree ? (
                  <Card className="border-gray-200">
                    <CardHeader>
                      <CardTitle className="text-base">소개 네트워크</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-[430px]" />
                    </CardContent>
                  </Card>
                ) : (
                  <ReferralNetworkChart
                    data={treeData}
                    maxDepth={2}
                    title="내 소개 네트워크"
                    mode="radial-tree"
                    currentBusinessAnchorId={user?.businessAnchorId || null}
                    visibleRoles={["requestor", "salesman"]}
                    legendRoles={["requestor", "salesman"]}
                    chartHeight={430}
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

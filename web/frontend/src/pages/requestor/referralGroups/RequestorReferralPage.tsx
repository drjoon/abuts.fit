import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PricingPolicyDialog } from "@/shared/ui/PricingPolicyDialog";
import { Copy, Check } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useReferralData } from "./hooks/useReferralData";
import { ReferralNetworkChart } from "@/features/referral/components/ReferralNetworkChart";

function fmtMoney(n: number) {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return "0";
  try {
    return v.toLocaleString("ko-KR");
  } catch {
    return String(v);
  }
}

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

export const RequestorReferralPage = () => {
  const { toast } = useToast();
  const [policyOpen, setPolicyOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"link" | "dashboard">("link");
  const [copied, setCopied] = useState(false);

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
  } = useReferralData();

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

  const requestorOrders = Number(
    requestorStats?.myLast30DaysOrders ??
      requestorStats?.myLastMonthOrders ??
      0,
  );
  const requestorGroupOrders = Number(requestorStats?.groupTotalOrders || 0);
  const requestorMembers = Number(requestorStats?.groupMemberCount || 0);
  const requestorUnitPrice = Number(
    requestorStats?.effectiveUnitPrice ||
      requestorStats?.baseUnitPrice ||
      15000,
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
          <div className="flex items-center justify-center min-h-full p-4 bg-gradient-to-br from-slate-50 to-slate-100">
            <Card className="w-full max-w-md border-slate-200 shadow-lg">
              <CardHeader className="space-y-2">
                <CardTitle className="text-2xl">내 사업자 소개 링크</CardTitle>
                <p className="text-sm text-slate-600">
                  이 링크를 공유하고 새로운 사업자를 소개하세요.
                </p>
              </CardHeader>

              <CardContent className="space-y-6">
                {!isReferralEligible ? (
                  <div className="rounded-lg bg-blue-50 border border-blue-100 p-4 text-sm text-blue-700">
                    의뢰자 계정에서 확인할 수 있습니다.
                  </div>
                ) : (
                  <>
                    {/* 소개 링크 */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                        소개 링크
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={referralLink}
                          readOnly
                          className="flex-1 px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg font-mono text-slate-600"
                        />
                        <Button
                          onClick={handleCopyLink}
                          variant="outline"
                          size="sm"
                          className="px-3"
                        >
                          {copied ? (
                            <Check className="w-4 h-4 text-green-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* 혜택 안내 */}
                    <div className="space-y-3">
                      <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                        소개 혜택
                      </div>
                      <p className="text-sm text-slate-600">
                        본인과 직접 소개한 사업자의 최근 30일 주문량을 합산하여
                        단가 계산
                      </p>
                    </div>

                    {/* 정책 안내 */}
                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
                      <div className="text-xs text-slate-600 space-y-1">
                        <p>
                          - 최근 30일 사업자 주문량 기준으로 단가가 적용됩니다.
                        </p>
                        <p>
                          - 주문량 집계는 사용자 개인이 아니라 사업자 기준으로
                          매일 자정(00:00) 업데이트됩니다.
                        </p>
                        <p>
                          - 직접 소개한 사업자와 함께 그룹 할인이 적용됩니다.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-3 text-xs h-8"
                        onClick={() => setPolicyOpen(true)}
                      >
                        전체 정책 보기
                      </Button>
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
                    의뢰자 계정에서 확인할 수 있습니다.
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* 통계 카드 */}
                <Card className="border-gray-200">
                  <CardHeader>
                    <CardTitle className="text-base">
                      의뢰자 그룹 통계
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {loadingRequestor ? (
                      <div className="grid gap-2 md:grid-cols-4">
                        <Skeleton className="h-20" />
                        <Skeleton className="h-20" />
                        <Skeleton className="h-20" />
                        <Skeleton className="h-20" />
                      </div>
                    ) : (
                      <div className="grid gap-2 md:grid-cols-5">
                        <MetricCard
                          title="그룹 사업자 수"
                          value={`${requestorMembers.toLocaleString()}개소`}
                          subtitle="본인 포함 그룹 전체"
                        />
                        <MetricCard
                          title="사업자 그룹 합산 (최근 30일)"
                          value={`${requestorGroupOrders.toLocaleString()}건`}
                          subtitle={
                            requestorGroupOrders > 0
                              ? `내 사업자: ${requestorOrders.toLocaleString()}건`
                              : undefined
                          }
                        />
                        <MetricCard
                          title="적용 단가"
                          value={`${fmtMoney(requestorUnitPrice)}원`}
                          subtitle="부가세·배송비 별도"
                        />

                        <div className="rounded-2xl border border-gray-200 bg-white/80 shadow-sm p-4 md:col-span-2 flex flex-col justify-between gap-2">
                          <div>
                            <div className="text-xs text-muted-foreground">
                              - 신규 가입 이벤트 기간 중에는 90일간 10,000원으로
                              고정됩니다.
                              <br />- 직접 소개한 사업자들과 주문량을 합산하여
                              할인받을 수 있습니다.
                            </div>
                          </div>
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              variant="default"
                              size="sm"
                              className="text-xs h-8"
                              onClick={() => setPolicyOpen(true)}
                            >
                              정책 보기
                            </Button>
                          </div>
                        </div>
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
                      <Skeleton className="h-[320px]" />
                    </CardContent>
                  </Card>
                ) : (
                  <ReferralNetworkChart
                    data={treeData}
                    maxDepth={1}
                    title="소개 네트워크 (직접 소개만)"
                    visibleRoles={["requestor"]}
                    legendRoles={[]}
                    chartHeight={320}
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>

      <PricingPolicyDialog open={policyOpen} onOpenChange={setPolicyOpen} />
    </div>
  );
};

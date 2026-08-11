// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { useState } from "react";
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
import { useReferralData } from "@/pages/requestor/referralGroups/hooks/useReferralData";
import { ReferralNetworkChart } from "@/features/referral/components/ReferralNetworkChart";
import { PricingPolicyDialog } from "@/shared/ui/PricingPolicyDialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function MetricCard({
  title,
  tooltip,
  primaryLabel,
  primaryValue,
  secondaryLabel,
  secondaryValue,
}: {
  title: string;
  tooltip: string;
  primaryLabel: string;
  primaryValue: string;
  secondaryLabel: string;
  secondaryValue: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="cursor-help rounded-xl bg-slate-50 px-4 py-3.5">
          <div className="mb-3 text-xs font-medium text-slate-500">{title}</div>
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-slate-500">{primaryLabel}</span>
              <span className="text-xl font-semibold tabular-nums text-slate-900">
                {primaryValue}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-slate-500">{secondaryLabel}</span>
              <span className="text-base font-semibold tabular-nums text-slate-700">
                {secondaryValue}
              </span>
            </div>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export const SalesmanReferralPage = () => {
  const { toast } = useToast();
  const { user } = useAuthStore();
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);

  const {
    isReferralEligible,
    referralCode,
    referralLink,
    loadingRequestor,
    loadingDirectMembers,
    treeData,
    loadingTree,
  } = useReferralData({
    fetchStats: true,
    fetchDirectMembers: true,
    fetchTree: true,
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

  const directRequestorChildren = (treeData?.children || []).filter(
    (c) => c.role === "requestor",
  );
  const directReferralBusinessCount = directRequestorChildren.length;
  const directReferralOrders = directRequestorChildren.reduce(
    (sum, c) => sum + Number(c.lastMonthOrders || 0),
    0,
  );

  const salesmanChildren = (treeData?.children || []).filter(
    (c) => c.role === "salesman",
  );
  const salesmanCount = salesmanChildren.length;

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          {!isReferralEligible ? (
            <Card>
              <CardContent className="pt-6">
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  영업자 계정에서 확인할 수 있습니다.
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-12 xl:items-stretch">
              <Card className="flex h-full flex-col xl:col-span-5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xl">내 소개 링크</CardTitle>
                  <CardDescription>
                    이 링크를 공유하고 새로운 사업자를 소개하세요
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
                      className="h-9 gap-1.5 bg-primary-strong text-white hover:bg-primary-strong"
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
                      className="h-9 gap-1.5 bg-primary-strong text-white hover:bg-primary-strong"
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
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-xl">영업자 소개 통계</CardTitle>
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
                  {loadingRequestor || loadingDirectMembers || loadingTree ? (
                    <div className="grid flex-1 gap-3 sm:grid-cols-2">
                      <Skeleton className="h-full min-h-[96px]" />
                      <Skeleton className="h-full min-h-[96px]" />
                    </div>
                  ) : (
                    <div className="grid flex-1 gap-3 sm:grid-cols-2">
                      <MetricCard
                        title="소개 의뢰자"
                        tooltip="내가 소개한 의뢰자 사업자 (10% 수수료 적용)"
                        primaryLabel="의뢰자 수"
                        primaryValue={`${directReferralBusinessCount.toLocaleString()}개소`}
                        secondaryLabel="의뢰건수"
                        secondaryValue={`${directReferralOrders.toLocaleString()}건`}
                      />
                      <MetricCard
                        title="소개 영업자"
                        tooltip="내가 소개한 영업자 수"
                        primaryLabel="영업자"
                        primaryValue={`${salesmanCount.toLocaleString()}개소`}
                        secondaryLabel="소개 의뢰건수"
                        secondaryValue={`${directReferralOrders.toLocaleString()}건`}
                      />
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
                      <Skeleton className="h-[430px]" />
                    </CardContent>
                  </Card>
                ) : (
                  <ReferralNetworkChart
                    data={treeData}
                    maxDepth={1}
                    title="소개 네트워크"
                    mode="radial-tree"
                    currentBusinessAnchorId={user?.businessAnchorId || null}
                    visibleRoles={["requestor", "salesman"]}
                    legendRoles={["requestor", "salesman"]}
                    chartHeight={560}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        <PricingPolicyDialog
          open={policyOpen}
          onOpenChange={setPolicyOpen}
          variant="salesman"
        />
      </div>
    </TooltipProvider>
  );
};

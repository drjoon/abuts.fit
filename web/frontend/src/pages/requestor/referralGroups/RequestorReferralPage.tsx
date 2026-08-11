// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/features/lab/LabTradingPartnerWindowBanner.tsx
// - 2026-08-11: 기공소 소개 상단 — 거래 치과 등록 D-day 배너.
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
import { PricingPolicyDialog } from "@/shared/ui/PricingPolicyDialog";
import { Check, Copy, Link2 } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";
import { useReferralData } from "./hooks/useReferralData";
import { ReferralNetworkChart } from "@/features/referral/components/ReferralNetworkChart";
import { LabTradingPartnerWindowBanner } from "@/features/lab/LabTradingPartnerWindowBanner";
import { useRequestorBusinessAccess } from "@/shared/business/useRequestorBusinessAccess";

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

export const RequestorReferralPage = () => {
  const { toast } = useToast();
  const { user } = useAuthStore();
  const { kind } = useRequestorBusinessAccess();
  const isLab = kind === "lab";
  const [policyOpen, setPolicyOpen] = useState(false);
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

  const requestorOrders = Number(
    requestorStats?.myLast30DaysOrders ??
      requestorStats?.myLastMonthOrders ??
      0,
  );
  const requestorGroupOrders = Number(requestorStats?.groupTotalOrders || 0);
  const requestorMembers = Number(treeMemberCount || 0);
  const requestorUnitPrice = Number(
    requestorStats?.effectiveUnitPrice ||
      requestorStats?.baseUnitPrice ||
      15000,
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {isLab ? <LabTradingPartnerWindowBanner /> : null}
        {!isReferralEligible ? (
          <Card>
            <CardContent className="pt-6">
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                의뢰자 계정에서 확인할 수 있습니다.
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-12 xl:items-stretch">
            <Card className="flex h-full flex-col xl:col-span-5">
              <CardHeader className="pb-3">
                <CardTitle className="text-xl">내 사업자 소개 링크</CardTitle>
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
                  <CardTitle className="text-xl">의뢰자 그룹 통계</CardTitle>
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
                      subtitle="배송비 별도 · 부가세 없음"
                    />
                    <div className="rounded-xl bg-primary-soft px-4 py-3.5 text-xs leading-relaxed text-primary-strong">
                      <p>
                        신규 가입 이벤트 기간에는 90일간 10,000원으로
                        고정됩니다.
                      </p>
                      <p className="mt-1.5">
                        소개한 사업자와 주문량을 합산해 할인받을 수 있습니다.
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

      <PricingPolicyDialog open={policyOpen} onOpenChange={setPolicyOpen} />
    </div>
  );
};

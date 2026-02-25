import { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { request } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
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

type RequestorReferralStats = {
  myLastMonthOrders?: number;
  myLast30DaysOrders?: number;
  groupTotalOrders?: number;
  groupMemberCount?: number;
  effectiveUnitPrice?: number;
  baseUnitPrice?: number;
  discountAmount?: number;
  rule?: string;
  maxDiscountPerUnit?: number;
  discountPerOrder?: number;
};

type DirectMemberRow = {
  _id: string;
  name?: string;
  email?: string;
  organization?: string;
  active?: boolean;
  createdAt?: string;
  approvedAt?: string | null;
  lastMonthOrders?: number;
  last30DaysOrders?: number;
};

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

export default function ReferralGroupsPage() {
  const { user, token } = useAuthStore();
  const { toast } = useToast();
  const [policyOpen, setPolicyOpen] = useState(false);

  const [requestorStats, setRequestorStats] =
    useState<RequestorReferralStats | null>(null);
  const [loadingRequestor, setLoadingRequestor] = useState(false);

  const [directMembers, setDirectMembers] = useState<DirectMemberRow[]>([]);
  const [loadingDirectMembers, setLoadingDirectMembers] = useState(false);

  const isRequestor = user?.role === "requestor";

  const referralCode = String(user?.referralCode || "")
    .trim()
    .toUpperCase();

  const referralLink = useMemo(() => {
    if (!referralCode) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/signup?ref=${encodeURIComponent(referralCode)}`;
  }, [referralCode]);

  useEffect(() => {
    if (!token || !isRequestor) return;

    setLoadingRequestor(true);
    request<any>({
      path: "/api/requests/my/pricing-referral-stats",
      method: "GET",
      token,
    })
      .then((res) => {
        const body: any = res.data || {};
        if (!res.ok || !body?.success) {
          throw new Error(body?.message || "리퍼럴 통계 조회에 실패했습니다.");
        }
        setRequestorStats((body.data || {}) as RequestorReferralStats);
      })
      .catch((err) => {
        toast({
          title: "오류",
          description: (err as any)?.message || "다시 시도해주세요.",
          variant: "destructive",
        });
      })
      .finally(() => setLoadingRequestor(false));
  }, [isRequestor, toast, token]);

  useEffect(() => {
    if (!token || !isRequestor) return;

    setLoadingDirectMembers(true);
    request<any>({
      path: "/api/requests/my/referral-direct-members",
      method: "GET",
      token,
    })
      .then((res) => {
        const body: any = res.data || {};
        if (!res.ok || !body?.success) {
          throw new Error(body?.message || "직계 멤버 조회에 실패했습니다.");
        }
        setDirectMembers((body.data?.members || []) as DirectMemberRow[]);
      })
      .catch((err) => {
        toast({
          title: "오류",
          description: (err as any)?.message || "다시 시도해주세요.",
          variant: "destructive",
        });
      })
      .finally(() => setLoadingDirectMembers(false));
  }, [isRequestor, toast, token]);

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
    <div className="p-4 space-y-4">
      <Card className="border-gray-200">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">의뢰자</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {!isRequestor ? (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              의뢰자 계정에서 확인할 수 있습니다.
            </div>
          ) : loadingRequestor ? (
            <div className="grid gap-3 md:grid-cols-4">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : (
            <div className="space-y-4 text-right">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm">
                  <div className="text-muted-foreground">내 추천 링크</div>
                  <div className="font-mono text-sm break-all">
                    {referralLink || "-"}

                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      className="h-9 ml-6"
                      disabled={!referralLink}
                      onClick={async () => {
                        try {
                          if (!referralLink) return;
                          await navigator.clipboard.writeText(referralLink);
                          toast({ title: "복사 완료", duration: 2000 });
                        } catch {
                          toast({
                            title: "복사 실패",
                            description: "브라우저 권한을 확인해주세요.",
                            variant: "destructive",
                          });
                        }
                      }}
                    >
                      링크 복사
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-5">
                <MetricCard
                  title="직계 멤버 수(나 포함)"
                  value={`${requestorMembers.toLocaleString()}명`}
                />
                <MetricCard
                  title="그룹 합산 (최근 30일)"
                  value={`${requestorGroupOrders.toLocaleString()}건`}
                  subtitle={
                    requestorGroupOrders > 0
                      ? `내 주문: ${requestorOrders.toLocaleString()}건`
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
                      - 최근 30일 완료 주문량 기준으로 단가가 적용됩니다.
                      <br />
                      - 주문량 집계는 매일 자정(00:00) 업데이트됩니다.
                      <br />- 신규 가입 이벤트 기간 중에는 90일간 10,000원으로
                      고정됩니다.
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
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-gray-200">
        <CardHeader>
          <CardTitle className="text-base">직계 멤버</CardTitle>
          <CardDescription>
            내가 속한 사업자와 내가 소개한 사업자만 표시합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!isRequestor ? (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              의뢰자 계정에서 확인할 수 있습니다.
            </div>
          ) : loadingDirectMembers ? (
            <div className="grid gap-3 md:grid-cols-4">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : directMembers.length === 0 ? (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              아직 직계 멤버가 없습니다.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-4">
              {directMembers.map((m) => {
                const label = String(
                  m.organization || m.name || m.email || "-",
                );
                const last30 = Number(m.last30DaysOrders || 0);
                return (
                  <div
                    key={m._id}
                    className="rounded-2xl border border-gray-200 bg-white/80 shadow-sm p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">
                          {label}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {m.email || ""}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        최근 30일{" "}
                        {Number(
                          m.last30DaysOrders ?? m.lastMonthOrders ?? 0,
                        ).toLocaleString()}
                        건
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <PricingPolicyDialog open={policyOpen} onOpenChange={setPolicyOpen} />
    </div>
  );
}

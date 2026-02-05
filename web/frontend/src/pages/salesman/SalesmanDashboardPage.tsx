import { useEffect, useMemo, useState } from "react";
import { request } from "@/lib/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type ApiDashboard = {
  ym: string;
  commissionRate: number;
  payoutDayOfMonth: number;
  referralCode: string;
  overview: {
    referredOrganizationCount: number;
    monthRevenueAmount: number;
    monthCommissionAmount: number;
  };
  organizations: Array<{
    organizationId: string;
    name: string;
    monthRevenueAmount: number;
    monthOrderCount: number;
    monthCommissionAmount: number;
  }>;
};

const formatMoney = (n: number) => {
  const v = Number(n || 0);
  try {
    return v.toLocaleString("ko-KR");
  } catch {
    return String(v);
  }
};

export const SalesmanDashboardPage = () => {
  const { token, user } = useAuthStore();
  const { toast } = useToast();
  const [data, setData] = useState<ApiDashboard | null>(null);
  const [loading, setLoading] = useState(false);

  const ym = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }, []);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    request<any>({
      path: `/api/salesman/dashboard?ym=${encodeURIComponent(ym)}`,
      method: "GET",
      token,
    })
      .then((res) => {
        const body: any = res.data || {};
        if (!res.ok || !body?.success) {
          throw new Error(body?.message || "대시보드 조회에 실패했습니다.");
        }
        setData(body.data as ApiDashboard);
      })
      .catch((err) => {
        toast({
          title: "오류",
          description: (err as any)?.message || "다시 시도해주세요.",
          variant: "destructive",
        });
      })
      .finally(() => setLoading(false));
  }, [toast, token, ym]);

  if (!user) return null;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">영업자 대시보드</h1>
        <p className="text-sm text-muted-foreground">
          {data?.ym || ym} 기준 · 수수료율 {(data?.commissionRate ?? 0.05) * 100}%
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">내 리퍼럴 코드</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <div className="text-sm font-mono break-all">
            {data?.referralCode || user.referralCode || ""}
          </div>
          <Badge variant="secondary">공유</Badge>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">소개 기공소</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold">
              {data?.overview?.referredOrganizationCount ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">이번 달 수수료</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold">
              {formatMoney(data?.overview?.monthCommissionAmount ?? 0)}원
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">이번 달 매출</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold">
              {formatMoney(data?.overview?.monthRevenueAmount ?? 0)}원
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              지급일: 매달 {data?.payoutDayOfMonth ?? 1}일
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-semibold">소개 기공소</h2>
        {loading && (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              불러오는 중...
            </CardContent>
          </Card>
        )}

        {!loading && (data?.organizations || []).length === 0 && (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              아직 소개된 기공소가 없습니다.
            </CardContent>
          </Card>
        )}

        {(data?.organizations || []).map((org) => (
          <Card key={org.organizationId}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{org.name || "기공소"}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-muted-foreground">이번 달 매출</div>
                <div className="text-sm font-semibold">
                  {formatMoney(org.monthRevenueAmount)}원
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">이번 달 수수료</div>
                <div className="text-sm font-semibold">
                  {formatMoney(org.monthCommissionAmount)}원
                </div>
              </div>
              <div className="col-span-2">
                <div className="text-xs text-muted-foreground">이번 달 완료 건수</div>
                <div className="text-sm font-semibold">{org.monthOrderCount}건</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

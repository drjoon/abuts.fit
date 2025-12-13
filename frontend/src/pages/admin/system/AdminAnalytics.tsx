import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/store/useAuthStore";
import { DollarSign, FileText, Users } from "lucide-react";

type PricingSummary = {
  range?: { startDate?: string; endDate?: string };
  totalOrders?: number;
  totalRevenue?: number;
  totalBaseAmount?: number;
  totalDiscountAmount?: number;
  avgUnitPrice?: number;
  avgDiscountPerOrder?: number;
};

type PricingUserRow = {
  user?: {
    _id?: string;
    name?: string;
    email?: string;
    organization?: string;
    role?: string;
    createdAt?: string;
  };
  orders?: number;
  referralLast30DaysOrders?: number;
  totalOrders?: number;
  revenue?: number;
  baseAmount?: number;
  discountAmount?: number;
  avgUnitPrice?: number;
  avgDiscountPerOrder?: number;
};

export const AdminAnalytics = () => {
  const { token, user } = useAuthStore();
  const [summary, setSummary] = useState<PricingSummary | null>(null);
  const [rows, setRows] = useState<PricingUserRow[]>([]);
  const [loading, setLoading] = useState(false);

  const headers = useMemo(() => {
    const h: Record<string, string> = {};
    if (token === "MOCK_DEV_TOKEN") {
      h["x-mock-role"] = "admin";
    }
    if (token) {
      h["Authorization"] = `Bearer ${token}`;
    }
    return h;
  }, [token]);

  useEffect(() => {
    const run = async () => {
      if (!token || !user || user.role !== "admin") return;
      setLoading(true);
      try {
        const [sRes, uRes] = await Promise.all([
          fetch("/api/admin/pricing-stats", { headers }),
          fetch("/api/admin/pricing-stats/users", { headers }),
        ]);

        const sJson = await sRes.json().catch(() => null);
        const uJson = await uRes.json().catch(() => null);

        if (sRes.ok && sJson?.success) setSummary(sJson.data);
        if (uRes.ok && uJson?.success) setRows(uJson.data?.items || []);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [headers, token, user]);

  if (!user || user.role !== "admin") return null;

  const totalOrders = summary?.totalOrders ?? 0;
  const totalRevenue = summary?.totalRevenue ?? 0;
  const totalDiscountAmount = summary?.totalDiscountAmount ?? 0;
  const avgUnitPrice = summary?.avgUnitPrice ?? 0;
  const avgDiscountPerOrder = summary?.avgDiscountPerOrder ?? 0;

  return (
    <div className="min-h-screen bg-gradient-subtle p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold bg-gradient-hero bg-clip-text text-transparent">
            시스템 통계
          </h1>
          <p className="text-muted-foreground text-lg">
            플랫폼의 핵심 지표와 성과를 확인하세요
          </p>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="hover:shadow-elegant transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">총 주문</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {totalOrders.toLocaleString()}건
              </div>
              <div className="text-xs text-muted-foreground">
                {loading ? "조회 중..." : "기간 내 주문(취소 제외)"}
              </div>
            </CardContent>
          </Card>
          <Card className="hover:shadow-elegant transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">거래 금액</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ₩{totalRevenue.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">
                VAT·배송비 별도
              </div>
            </CardContent>
          </Card>
          <Card className="hover:shadow-elegant transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">총 할인액</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ₩{totalDiscountAmount.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">
                정책 적용 할인 합계
              </div>
            </CardContent>
          </Card>
          <Card className="hover:shadow-elegant transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">평균 단가</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ₩{avgUnitPrice.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">
                평균 할인: ₩{avgDiscountPerOrder.toLocaleString()}/건
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>사용자별 주문/할인</CardTitle>
            <CardDescription>
              기간 내 주문(취소 제외) 기준 통계입니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-4">사용자</th>
                    <th className="py-2 pr-4">소속</th>
                    <th className="py-2 pr-4">주문</th>
                    <th className="py-2 pr-4">리퍼럴 주문</th>
                    <th className="py-2 pr-4">합산</th>
                    <th className="py-2 pr-4">매출</th>
                    <th className="py-2 pr-4">할인</th>
                    <th className="py-2 pr-4">평균 단가</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.user?._id} className="border-b last:border-b-0">
                      <td className="py-2 pr-4">
                        <div className="font-medium">
                          {r.user?.name || r.user?._id}
                        </div>
                        {r.user?.email ? (
                          <div className="text-xs text-muted-foreground">
                            {r.user.email}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-2 pr-4">
                        {r.user?.organization || "-"}
                      </td>
                      <td className="py-2 pr-4">
                        {(r.orders || 0).toLocaleString()}건
                      </td>
                      <td className="py-2 pr-4">
                        {(r.referralLast30DaysOrders || 0).toLocaleString()}건
                      </td>
                      <td className="py-2 pr-4">
                        {(r.totalOrders || 0).toLocaleString()}건
                      </td>
                      <td className="py-2 pr-4">
                        ₩{(r.revenue || 0).toLocaleString()}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge variant="outline">
                          ₩{(r.discountAmount || 0).toLocaleString()}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4">
                        ₩{(r.avgUnitPrice || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

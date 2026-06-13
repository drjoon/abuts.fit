import { useEffect, useMemo, useState } from "react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { usePeriodStore, periodToRangeQuery } from "@/store/usePeriodStore";
import { useToast } from "@/shared/hooks/use-toast";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * AdminPaymentsPage - 관리자 정산 페이지
 *
 * SSOT 원칙 (rules.md 1.0):
 * - businessType은 BusinessAnchor.businessType만 사용 (fallback 금지)
 * - 정산 금액은 백엔드 집계값을 그대로 표시 (frontend 재계산 최소화)
 */

type SalesmanRow = {
  userId: string;
  name: string;
  email: string;
  active: boolean;
  businessAnchorId: string;
  businessAnchor: {
    id: string;
    name: string;
    businessType: string;
    representativeName?: string;
    email?: string;
    phoneNumber?: string;
  };
  wallet?: {
    balanceAmountPeriod?: number;
  };
  performance30d?: {
    commissionAmount?: number;
    revenueAmount?: number;
    introducedCount?: number;
  };
};

type Overview = {
  salesmenCount?: number;
  referral?: {
    paidRevenueAmount?: number;
    bonusRevenueAmount?: number;
    orderCount?: number;
  };
  commission?: {
    totalAmount?: number;
    amount?: number;
  };
  walletPeriod?: {
    earnedAmount?: number;
    paidOutAmount?: number;
    adjustedAmount?: number;
    balanceAmount?: number;
  };
};

type ManufacturerSummary = {
  anchorCount?: number;
  periodEarnedAmount?: number;
  periodPaidOutAmount?: number;
  periodBalanceAmount?: number;
  totalBalanceAmount?: number;
};

const formatMoney = (value?: number) =>
  typeof value === "number" ? value.toLocaleString("ko-KR") : "0";

type AnchorGroup = {
  businessAnchorId: string;
  businessType: string;
  name: string;
  representativeName?: string;
  email?: string;
  phoneNumber?: string;
  memberCount: number;
  activeMemberCount: number;
  revenueAmount: number;
  commissionAmount: number;
  balanceAmount: number;
  introducedCount: number;
};

type AdminCreditRow = {
  adminUserId: string;
  name: string;
  email: string;
  active: boolean;
  wallet?: {
    earnedAmount?: number;
    paidOutAmount?: number;
    adjustedAmount?: number;
    balanceAmount?: number;
    earnedAmountPeriod?: number;
    paidOutAmountPeriod?: number;
    adjustedAmountPeriod?: number;
    balanceAmountPeriod?: number;
  };
};

/** 역할별 정산 카드 */
function SettlementCard({ group }: { group: AnchorGroup }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{group.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">대표자</span>
          <span>{group.representativeName || "-"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">연락처</span>
          <span>{group.email || group.phoneNumber || "-"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">활성 멤버</span>
          <span>
            {group.activeMemberCount}/{group.memberCount}명
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">소개한 사업자</span>
          <span>{group.introducedCount}개</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">기간 매출</span>
          <span>{formatMoney(group.revenueAmount)}원</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">기간 수수료</span>
          <span>{formatMoney(group.commissionAmount)}원</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">정산 잔액</span>
          <span className="font-semibold text-blue-600">
            {formatMoney(group.balanceAmount)}원
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function AdminSettlementCard({ row }: { row: AdminCreditRow }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{row.name || "-"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">연락처</span>
          <span>{row.email || "-"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">기간 발생 수익</span>
          <span>{formatMoney(row.wallet?.earnedAmountPeriod)}원</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">기간 정산 완료</span>
          <span>{formatMoney(row.wallet?.paidOutAmountPeriod)}원</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">미정산 잔액</span>
          <span className="font-semibold text-blue-600">
            {formatMoney(row.wallet?.balanceAmount)}원
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/** 정책/요약 카드 */
function SummaryCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </CardContent>
    </Card>
  );
}

/** 역할별 요약 섹션 */
function RoleSummarySection({
  title,
  rate,
  groups,
  summaryData,
}: {
  title: string;
  rate: string;
  groups: AnchorGroup[];
  summaryData?: {
    count?: number;
    earned?: number;
    balance?: number;
    paidOut?: number;
  };
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title={`${title} 배분율`}
          value={rate}
          description="유료의뢰비 기준 (rules.md 6.9.1)"
        />
        <SummaryCard
          title="사업자 수"
          value={`${summaryData?.count ?? groups.length}개`}
          description="BusinessAnchor 기준"
        />
        <SummaryCard
          title="기간 발생 수익"
          value={`${formatMoney(summaryData?.earned)}원`}
          description="기간 내 EARN 합계"
        />
        <SummaryCard
          title="미정산 잔액"
          value={`${formatMoney(summaryData?.balance)}원`}
          description="누적 미지급 잔액"
        />
      </div>
      {groups.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => (
            <SettlementCard key={group.businessAnchorId} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminPaymentsPage() {
  const { token, user } = useAuthStore();
  const { period } = usePeriodStore();
  const { toast } = useToast();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [rows, setRows] = useState<SalesmanRow[]>([]);
  const [manufacturerSummary, setManufacturerSummary] =
    useState<ManufacturerSummary | null>(null);
  const [adminRows, setAdminRows] = useState<AdminCreditRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setIsLoading(true);

    Promise.all([
      request<{ success?: boolean; data?: Overview; message?: string }>({
        path: `/api/admin/credits/salesmen/overview?period=${encodeURIComponent(period)}`,
        method: "GET",
        token,
      }),
      request<{
        success?: boolean;
        data?: { items?: SalesmanRow[] };
        message?: string;
      }>({
        path: `/api/admin/credits/salesmen?limit=200&skip=0${periodToRangeQuery(period).replace(/^\?/, "&")}`,
        method: "GET",
        token,
      }),
      request<{
        success?: boolean;
        data?: ManufacturerSummary;
        message?: string;
      }>({
        path: `/api/admin/credits/manufacturer/summary?period=${encodeURIComponent(period)}`,
        method: "GET",
        token,
      }),
      request<{
        success?: boolean;
        data?: { items?: AdminCreditRow[] };
        message?: string;
      }>({
        path: `/api/admin/credits/admins?limit=200&skip=0${periodToRangeQuery(period).replace(/^\?/, "&")}`,
        method: "GET",
        token,
      }),
    ])
      .then(([overviewRes, rowsRes, mfgRes, adminRes]) => {
        if (overviewRes.ok && overviewRes.data?.success) {
          setOverview(overviewRes.data.data || null);
        }
        if (rowsRes.ok && rowsRes.data?.success) {
          setRows(
            Array.isArray(rowsRes.data.data?.items)
              ? rowsRes.data.data.items
              : [],
          );
        }
        if (mfgRes.ok && mfgRes.data?.success) {
          setManufacturerSummary(mfgRes.data.data || null);
        }
        if (adminRes.ok && adminRes.data?.success) {
          setAdminRows(
            Array.isArray(adminRes.data.data?.items)
              ? adminRes.data.data.items
              : [],
          );
        }
      })
      .catch((error: unknown) => {
        toast({
          title: "정산 조회 실패",
          description:
            error instanceof Error ? error.message : "다시 시도해주세요.",
          variant: "destructive",
        });
      })
      .finally(() => setIsLoading(false));
  }, [period, token, toast]);

  /**
   * BusinessAnchor 기준 그룹화
   * - SSOT: businessAnchorId, businessType은 BusinessAnchor 값만 사용
   * - 집계: sum (Math.max 오류 수정)
   */
  const anchorGroups = useMemo((): AnchorGroup[] => {
    const map = new Map<string, AnchorGroup>();

    for (const row of rows) {
      // SSOT: businessAnchorId는 반드시 존재해야 함
      const anchorId = row.businessAnchorId?.trim();
      if (!anchorId) continue;

      // SSOT: businessType은 BusinessAnchor.businessType만 사용 (fallback 금지)
      const businessType = row.businessAnchor?.businessType?.trim();
      if (!businessType) continue; // businessType 없으면 skip (rules.md 1.0)

      const existing = map.get(anchorId);
      if (existing) {
        // 동일 BusinessAnchor의 멤버 데이터 합산
        existing.memberCount += 1;
        if (row.active) existing.activeMemberCount += 1;
        existing.balanceAmount += Number(row.wallet?.balanceAmountPeriod || 0);
        existing.revenueAmount += Number(
          row.performance30d?.revenueAmount || 0,
        );
        existing.commissionAmount += Number(
          row.performance30d?.commissionAmount || 0,
        );
        existing.introducedCount += Number(
          row.performance30d?.introducedCount || 0,
        );
      } else {
        map.set(anchorId, {
          businessAnchorId: anchorId,
          businessType,
          name: row.businessAnchor?.name?.trim() || row.name?.trim() || "-",
          representativeName: row.businessAnchor?.representativeName?.trim(),
          email: row.businessAnchor?.email?.trim() || row.email?.trim(),
          phoneNumber: row.businessAnchor?.phoneNumber?.trim(),
          memberCount: 1,
          activeMemberCount: row.active ? 1 : 0,
          revenueAmount: Number(row.performance30d?.revenueAmount || 0),
          commissionAmount: Number(row.performance30d?.commissionAmount || 0),
          balanceAmount: Number(row.wallet?.balanceAmountPeriod || 0),
          introducedCount: Number(row.performance30d?.introducedCount || 0),
        });
      }
    }

    return Array.from(map.values()).sort(
      (a, b) =>
        b.balanceAmount - a.balanceAmount ||
        b.commissionAmount - a.commissionAmount ||
        a.name.localeCompare(b.name, "ko"),
    );
  }, [rows]);

  const groupsByType = useMemo(() => {
    const byType = (type: string) =>
      anchorGroups.filter((g) => g.businessType === type);
    return {
      manufacturer: byType("manufacturer"),
      salesman: byType("salesman"),
      devops: byType("devops"),
    };
  }, [anchorGroups]);

  const totals = useMemo(() => {
    const referralRevenue = Number(overview?.referral?.paidRevenueAmount || 0);
    const referralCommission = Number(overview?.commission?.totalAmount || 0);
    const referralBalance = Number(overview?.walletPeriod?.balanceAmount || 0);
    const adminBalance = adminRows.reduce(
      (sum, row) => sum + Number(row.wallet?.balanceAmount || 0),
      0,
    );
    const manufacturerBalance = Number(
      manufacturerSummary?.totalBalanceAmount || 0,
    );

    return {
      count:
        Number(manufacturerSummary?.anchorCount || 0) +
        groupsByType.salesman.length +
        groupsByType.devops.length +
        adminRows.length,
      paidRequestRevenue: referralRevenue,
      commission: referralCommission,
      unpaidBalance: referralBalance + manufacturerBalance + adminBalance,
    };
  }, [
    adminRows,
    groupsByType.devops.length,
    groupsByType.salesman.length,
    manufacturerSummary,
    overview,
  ]);

  if (!user || user.role !== "admin") return null;

  return (
    <DashboardShell
      title="정산"
      subtitle="유료의뢰비 기준 수익 배분 및 정산 현황"
      statsGridClassName="grid grid-cols-2 md:grid-cols-4 gap-3"
      stats={
        <>
          <SummaryCard
            title="정산 대상"
            value={isLoading ? "-" : `${totals.count}개`}
            description="소개 주체 BusinessAnchor 기준"
          />
          <SummaryCard
            title="유료 의뢰비 총액"
            value={
              isLoading ? "-" : `${formatMoney(totals.paidRequestRevenue)}원`
            }
            description="기간 내 paidAmount 합계"
          />
          <SummaryCard
            title="총 수수료"
            value={isLoading ? "-" : `${formatMoney(totals.commission)}원`}
            description="기간 내 배분 수수료 합계"
          />
          <SummaryCard
            title="미정산 잔액"
            value={isLoading ? "-" : `${formatMoney(totals.unpaidBalance)}원`}
            description="누적 미지급액"
          />
        </>
      }
      mainLeft={
        <Tabs defaultValue="manufacturer" className="space-y-4">
          <TabsList>
            <TabsTrigger value="manufacturer">제조사</TabsTrigger>
            <TabsTrigger value="salesman">영업자</TabsTrigger>
            <TabsTrigger value="devops">개발운영사</TabsTrigger>
            <TabsTrigger value="admin">관리자</TabsTrigger>
          </TabsList>

          <TabsContent value="manufacturer">
            <RoleSummarySection
              title="제조사"
              rate="60% / 65%"
              groups={groupsByType.manufacturer}
              summaryData={{
                count:
                  manufacturerSummary?.anchorCount ??
                  groupsByType.manufacturer.length,
                earned: manufacturerSummary?.periodEarnedAmount,
                balance: manufacturerSummary?.totalBalanceAmount,
                paidOut: manufacturerSummary?.periodPaidOutAmount,
              }}
            />
          </TabsContent>

          <TabsContent value="salesman">
            <RoleSummarySection
              title="영업자"
              rate="10%"
              groups={groupsByType.salesman}
            />
          </TabsContent>

          <TabsContent value="devops">
            <RoleSummarySection
              title="개발운영사"
              rate="10%"
              groups={groupsByType.devops}
            />
          </TabsContent>

          <TabsContent value="admin">
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SummaryCard
                  title="관리자 계정 수"
                  value={`${adminRows.length}개`}
                  description="admin 사용자 기준"
                />
                <SummaryCard
                  title="기간 발생 수익"
                  value={`${formatMoney(
                    adminRows.reduce(
                      (sum, row) =>
                        sum + Number(row.wallet?.earnedAmountPeriod || 0),
                      0,
                    ),
                  )}원`}
                  description="AdminCreditLedger EARN 합계"
                />
                <SummaryCard
                  title="기간 정산 완료"
                  value={`${formatMoney(
                    adminRows.reduce(
                      (sum, row) =>
                        sum + Number(row.wallet?.paidOutAmountPeriod || 0),
                      0,
                    ),
                  )}원`}
                  description="AdminCreditLedger PAYOUT 합계"
                />
                <SummaryCard
                  title="미정산 잔액"
                  value={`${formatMoney(
                    adminRows.reduce(
                      (sum, row) =>
                        sum + Number(row.wallet?.balanceAmount || 0),
                      0,
                    ),
                  )}원`}
                  description="누적 미지급 잔액"
                />
              </div>

              {adminRows.length > 0 && (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {adminRows.map((row) => (
                    <AdminSettlementCard key={row.adminUserId} row={row} />
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      }
      mainRight={null}
    />
  );
}

import { useEffect, useMemo, useState } from "react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { usePeriodStore } from "@/store/usePeriodStore";
import { useToast } from "@/shared/hooks/use-toast";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type SalesmanRow = {
  salesmanId: string;
  name: string;
  email: string;
  role?: string;
  active: boolean;
  businessAnchorId?: string | null;
  businessAnchor?: {
    id: string;
    name: string;
    businessType?: string;
    status?: string;
    representativeName?: string;
    email?: string;
    phoneNumber?: string;
  } | null;
  wallet?: {
    balanceAmountPeriod?: number;
  };
  performance30d?: {
    commissionAmount?: number;
    revenueAmount?: number;
    referredOrgCount?: number;
    level1OrgCount?: number;
  };
};

type Overview = {
  totalCount?: number;
  activeCount?: number;
  totalBalanceAmount?: number;
  totalEarnedAmount?: number;
  totalPaidOutAmount?: number;
  totalAdjustedAmount?: number;
  totalCommissionAmount?: number;
};

const formatMoney = (value?: number) =>
  Number(value || 0).toLocaleString("ko-KR");

const roleRateCards = [
  { key: "manufacturer", label: "제조사 배분율", value: "65%" },
  { key: "salesman", label: "영업자 배분율", value: "5~7.5%" },
  { key: "devops", label: "개발운영사 배분율", value: "5~10%" },
  { key: "admin", label: "관리사 배분율", value: "22.5~25%" },
] as const;

type AnchorSettlementGroup = {
  businessAnchorId: string;
  businessType: string;
  name: string;
  representativeName: string;
  email: string;
  phoneNumber: string;
  memberCount: number;
  activeMemberCount: number;
  revenueAmount: number;
  commissionAmount: number;
  balanceAmount: number;
  directOrgCount: number;
  level1OrgCount: number;
};

function AnchorSettlementCard({ group }: { group: AnchorSettlementGroup }) {
  return (
    <Card key={group.businessAnchorId}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{group.name || "-"}</CardTitle>
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
          <span className="text-muted-foreground">활성 인원</span>
          <span>
            {group.activeMemberCount}/{group.memberCount}명
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">기간 수수료</span>
          <span>{formatMoney(group.commissionAmount)}원</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">기간 매출</span>
          <span>{formatMoney(group.revenueAmount)}원</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">기간 잔액</span>
          <span className="font-semibold">
            {formatMoney(group.balanceAmount)}원
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">직접/간접 사업자</span>
          <span>
            {group.directOrgCount}/{group.level1OrgCount}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function StaticInfoCard({
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
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </CardContent>
    </Card>
  );
}

export default function AdminPaymentsPage() {
  const { token, user } = useAuthStore();
  const { period, setPeriod } = usePeriodStore();
  const { toast } = useToast();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [rows, setRows] = useState<SalesmanRow[]>([]);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      request<any>({
        path: `/api/admin/credits/salesmen/overview?period=${encodeURIComponent(period)}`,
        method: "GET",
        token,
      }),
      request<any>({
        path: `/api/admin/credits/salesmen?limit=200&skip=0`,
        method: "GET",
        token,
      }),
    ])
      .then(([overviewRes, rowsRes]) => {
        if (!overviewRes.ok || !overviewRes.data?.success) {
          throw new Error(
            overviewRes.data?.message || "정산 overview 조회 실패",
          );
        }
        if (!rowsRes.ok || !rowsRes.data?.success) {
          throw new Error(rowsRes.data?.message || "정산 목록 조회 실패");
        }
        setOverview(overviewRes.data.data || null);
        setRows(
          Array.isArray(rowsRes.data.data?.items)
            ? rowsRes.data.data.items
            : [],
        );
      })
      .catch((error: any) => {
        toast({
          title: "정산 조회 실패",
          description: error?.message || "다시 시도해주세요.",
          variant: "destructive",
        });
      });
  }, [period, token, toast]);

  const anchorGroups = useMemo(() => {
    const map = new Map<string, AnchorSettlementGroup>();
    for (const row of rows) {
      const anchorId = String(
        row.businessAnchorId || row.businessAnchor?.id || "",
      ).trim();
      if (!anchorId) continue;
      const prev = map.get(anchorId) || {
        businessAnchorId: anchorId,
        businessType: String(
          row.businessAnchor?.businessType || row.role || "",
        ).trim(),
        name: String(row.businessAnchor?.name || row.name || "").trim(),
        representativeName: String(
          row.businessAnchor?.representativeName || "",
        ).trim(),
        email: String(row.businessAnchor?.email || row.email || "").trim(),
        phoneNumber: String(row.businessAnchor?.phoneNumber || "").trim(),
        memberCount: 0,
        activeMemberCount: 0,
        revenueAmount: 0,
        commissionAmount: 0,
        balanceAmount: 0,
        directOrgCount: 0,
        level1OrgCount: 0,
      };
      prev.memberCount += 1;
      if (row.active) prev.activeMemberCount += 1;
      prev.balanceAmount += Number(row.wallet?.balanceAmountPeriod || 0);
      prev.revenueAmount = Math.max(
        prev.revenueAmount,
        Number(row.performance30d?.revenueAmount || 0),
      );
      prev.commissionAmount = Math.max(
        prev.commissionAmount,
        Number(row.performance30d?.commissionAmount || 0),
      );
      prev.directOrgCount = Math.max(
        prev.directOrgCount,
        Number(row.performance30d?.referredOrgCount || 0),
      );
      prev.level1OrgCount = Math.max(
        prev.level1OrgCount,
        Number(row.performance30d?.level1OrgCount || 0),
      );
      if (!prev.name) prev.name = String(row.name || "").trim();
      if (!prev.email) prev.email = String(row.email || "").trim();
      map.set(anchorId, prev);
    }
    return Array.from(map.values()).sort(
      (a, b) =>
        b.balanceAmount - a.balanceAmount ||
        b.commissionAmount - a.commissionAmount ||
        a.name.localeCompare(b.name, "ko"),
    );
  }, [rows]);

  const salesmanGroups = useMemo(
    () => anchorGroups.filter((group) => group.businessType === "salesman"),
    [anchorGroups],
  );
  const devopsGroups = useMemo(
    () => anchorGroups.filter((group) => group.businessType === "devops"),
    [anchorGroups],
  );
  const manufacturerGroups = useMemo(
    () => anchorGroups.filter((group) => group.businessType === "manufacturer"),
    [anchorGroups],
  );
  const adminGroups = useMemo(
    () => anchorGroups.filter((group) => group.businessType === "admin"),
    [anchorGroups],
  );

  const summaryCards = useMemo(
    () => [
      ...roleRateCards.map((item) => ({
        key: item.key,
        label: item.label,
        value: item.value,
        helper: "최근 30일 기준 정책 범위",
      })),
      {
        key: "count",
        label: "총 대상 수",
        value: `${Number(anchorGroups.length || 0).toLocaleString()}개`,
        helper: "BusinessAnchor 기준 정산 대상",
      },
      {
        key: "commission",
        label: "총 수수료",
        value: `${formatMoney(
          anchorGroups.reduce((sum, group) => sum + group.commissionAmount, 0),
        )}원`,
        helper: "BusinessAnchor 기준 발생 수수료",
      },
      {
        key: "balance",
        label: "총 정산 잔액",
        value: `${formatMoney(
          anchorGroups.reduce((sum, group) => sum + group.balanceAmount, 0),
        )}원`,
        helper: "BusinessAnchor 기준 잔액 합계",
      },
      {
        key: "paidOut",
        label: "총 정산 완료액",
        value: `${formatMoney(overview?.totalPaidOutAmount)}원`,
        helper: "기간 내 지급 완료 금액",
      },
    ],
    [anchorGroups, overview],
  );

  if (!user || user.role !== "admin") return null;

  return (
    <DashboardShell
      title="정산"
      subtitle="상단은 운영 요약, 하단은 역할별 정산 탭입니다."
      statsGridClassName="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3"
      stats={
        <>
          {summaryCards.map((item) => (
            <StaticInfoCard
              key={item.key}
              title={item.label}
              value={item.value}
              description={item.helper}
            />
          ))}
        </>
      }
      mainLeft={
        <Tabs defaultValue="manufacturer" className="space-y-4">
          <TabsList>
            <TabsTrigger value="manufacturer">제조사</TabsTrigger>
            <TabsTrigger value="salesman">영업자</TabsTrigger>
            <TabsTrigger value="devops">개발운영사</TabsTrigger>
            <TabsTrigger value="admin">관리사</TabsTrigger>
          </TabsList>

          <TabsContent value="manufacturer">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StaticInfoCard
                title="제조사 배분율"
                value="65%"
                description="제작/출고 완료 기준으로 정산합니다."
              />
              <StaticInfoCard
                title="제조사 앵커 수"
                value={`${manufacturerGroups.length.toLocaleString()}개`}
                description="BusinessAnchor 기준 제조사 수"
              />
              <StaticInfoCard
                title="스냅샷 처리"
                value="일별 집계"
                description="전일 정산 스냅샷과 지급 이력을 누적 관리합니다."
              />
              <StaticInfoCard
                title="운영 메모"
                value="수동 보정 가능"
                description="환불/조정/지급은 별도 원장으로 추적합니다."
              />
            </div>
          </TabsContent>

          <TabsContent value="salesman">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {salesmanGroups.map((group) => (
                <AnchorSettlementCard
                  key={group.businessAnchorId}
                  group={group}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="devops">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {devopsGroups.map((group) => (
                <AnchorSettlementCard
                  key={group.businessAnchorId}
                  group={group}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="admin">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StaticInfoCard
                title="관리사 배분율"
                value="22.5~25%"
                description="플랫폼 운영/정산/지원 몫"
              />
              <StaticInfoCard
                title="관리사 앵커 수"
                value={`${adminGroups.length.toLocaleString()}개`}
                description="BusinessAnchor 기준 운영 주체"
              />
              <StaticInfoCard
                title="정산 대기 잔액"
                value={`${formatMoney(overview?.totalBalanceAmount)}원`}
                description="전체 미정산 잔액 기준"
              />
              <StaticInfoCard
                title="정산 완료 누계"
                value={`${formatMoney(overview?.totalPaidOutAmount)}원`}
                description="기간 내 지급 완료 기준"
              />
            </div>
          </TabsContent>
        </Tabs>
      }
      mainRight={null}
    />
  );
}

// related files:
// - web/frontend/src/App.tsx
// - web/frontend/src/pages/salesman/SalesmanPaymentsPage.tsx
// - web/frontend/src/pages/salesTeam/salesTeamApi.ts
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, Wallet } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { Button } from "@/components/ui/button";
import { salesTeamApi } from "./salesTeamApi";
import {
  SalesEmptyState,
  SalesListRow,
  SalesPageShell,
  SalesPanel,
  SalesStatCard,
} from "./salesUi";

/**
 * 영업본부 정산 — 소개 실적 요약.
 * 금전 인센티브(기공사업 분배)는 관리자 사업영역에서 정산한다.
 */
export default function SalesTeamPaymentsPage() {
  const token = useAuthStore((s) => s.token);

  const { data, isLoading, error } = useQuery({
    queryKey: ["sales-team-referral-payments"],
    enabled: Boolean(token),
    queryFn: () => salesTeamApi.referral(token),
  });

  const orgs = Array.isArray(data?.organizations) ? data.organizations : [];

  return (
    <SalesPageShell
      title="정산"
      subtitle="소개 실적을 확인합니다. 기공사업 인센티브는 관리자 사업영역에서 정산됩니다."
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to="/dashboard/sales/performance?tab=referral">성과 · 소개</Link>
        </Button>
      }
    >
      {error ? (
        <SalesEmptyState
          icon={Wallet}
          title="정산 정보를 불러오지 못했습니다"
          description={
            error instanceof Error ? error.message : "다시 시도해 주세요."
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <SalesStatCard
              label="소개 거래처"
              value={isLoading ? "…" : String(orgs.length)}
              hint="소개코드로 가입한 누적"
              icon={Building2}
            />
            <SalesStatCard
              label="소개코드"
              value={isLoading ? "…" : String(data?.referralCode || "—")}
              hint="성과 탭에서 공유"
              icon={Wallet}
            />
          </div>

          <SalesPanel
            title="소개 거래처"
            description={data?.policyNote}
          >
            {isLoading ? (
              <p className="text-sm text-muted-foreground">불러오는 중…</p>
            ) : orgs.length === 0 ? (
              <SalesEmptyState
                icon={Building2}
                title="소개 가입이 없습니다"
                description="현장에서 소개코드를 공유하세요."
                actionLabel="소개·피치"
                actionTo="/#pitch"
              />
            ) : (
              <ul className="space-y-2">
                {orgs.slice(0, 50).map((org) => (
                  <li key={org._id}>
                    <SalesListRow
                      title={org.name || "이름 없음"}
                      meta={
                        org.createdAt
                          ? new Date(org.createdAt).toLocaleDateString("ko-KR")
                          : undefined
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </SalesPanel>
        </div>
      )}
    </SalesPageShell>
  );
}

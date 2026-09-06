// related files:
// - web/frontend/src/pages/salesTeam/salesTeamApi.ts
// - web/frontend/src/pages/salesTeam/salesUi.tsx
import { useQuery } from "@tanstack/react-query";
import { Copy, Link2, Share2 } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KIND_LABEL, salesTeamApi } from "./salesTeamApi";
import {
  SalesEmptyState,
  SalesListRow,
  SalesPageShell,
  SalesPanel,
  SalesStatCard,
} from "./salesUi";

export default function SalesReferralPage() {
  const token = useAuthStore((s) => s.token);
  const { toast } = useToast();
  const { data, isLoading, error } = useQuery({
    queryKey: ["sales-team-referral"],
    enabled: Boolean(token),
    queryFn: () => salesTeamApi.referral(token),
  });

  const code = String(data?.referralCode || "")
    .trim()
    .toUpperCase();
  const link =
    typeof window !== "undefined" && /^[A-Z]{3}$/.test(code)
      ? `${window.location.origin}/signup/referral?ref=${encodeURIComponent(code)}`
      : "";

  const orgs = data?.organizations || [];
  const practiceCount = orgs.filter(
    (o) => String(o.requestorKind || "") === "practice",
  ).length;
  const labCount = orgs.filter(
    (o) => String(o.requestorKind || "") === "lab",
  ).length;

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${label} 복사됨` });
    } catch {
      toast({ title: "복사에 실패했습니다.", variant: "destructive" });
    }
  };

  return (
    <SalesPageShell
      title="소개"
      subtitle="영문 3글자 소개코드로 가입한 치과·기공소가 담당 실적입니다."
    >
      {isLoading ? (
        <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />
      ) : error ? (
        <p className="text-sm text-destructive">{(error as Error).message}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <SalesStatCard
              label="소개 가입"
              value={orgs.length}
              icon={Share2}
              hint="누적 사업자"
            />
            <SalesStatCard label="치과" value={practiceCount} />
            <SalesStatCard label="기공소" value={labCount} />
          </div>

          <SalesPanel
            title="내 소개코드"
            description="현장에서 코드나 가입 링크를 공유하세요."
          >
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-primary-muted/50 bg-gradient-to-br from-primary-soft/80 to-white px-4 py-8 text-center sm:px-8">
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-primary-strong">
                Referral code
              </div>
              <div className="font-mono text-4xl font-semibold tracking-[0.35em] text-slate-900 sm:text-5xl">
                {code || "—"}
              </div>
              {code ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copy(code, "소개코드")}
                  >
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    코드 복사
                  </Button>
                  {link ? (
                    <Button
                      size="sm"
                      onClick={() => copy(link, "가입 링크")}
                    >
                      <Link2 className="mr-1.5 h-3.5 w-3.5" />
                      가입 링크 복사
                    </Button>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  소개코드가 아직 없습니다. 설정에서 확인하세요.
                </p>
              )}
              {link ? (
                <code className="max-w-full truncate rounded-lg bg-white/80 px-3 py-1.5 text-xs text-slate-600 ring-1 ring-slate-200/80">
                  {link}
                </code>
              ) : null}
              {data?.policyNote ? (
                <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
                  {data.policyNote}
                </p>
              ) : null}
            </div>
          </SalesPanel>

          <SalesPanel
            title="소개로 가입한 거래처"
            description="코드로 가입한 치과·기공소 목록입니다."
          >
            {orgs.length === 0 ? (
              <SalesEmptyState
                icon={Share2}
                title="아직 소개 가입이 없습니다"
                description="코드를 공유하면 가입한 사업자가 여기에 표시되고 실적에 반영됩니다."
              />
            ) : (
              <div className="space-y-2">
                {orgs.map((o) => (
                  <SalesListRow
                    key={String(o._id)}
                    title={o.name || "사업자"}
                    meta={
                      o.createdAt
                        ? new Date(o.createdAt).toLocaleDateString("ko-KR", {
                            timeZone: "Asia/Seoul",
                          })
                        : undefined
                    }
                    trailing={
                      <Badge variant="secondary">
                        {KIND_LABEL[String(o.requestorKind || "")] ||
                          o.requestorKind ||
                          "의뢰자"}
                      </Badge>
                    }
                  />
                ))}
              </div>
            )}
          </SalesPanel>
        </>
      )}
    </SalesPageShell>
  );
}

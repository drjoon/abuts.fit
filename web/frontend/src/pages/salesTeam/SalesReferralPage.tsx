// related files:
// - web/frontend/src/pages/salesTeam/salesTeamApi.ts
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { KIND_LABEL, salesTeamApi } from "./salesTeamApi";

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

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${label} 복사됨` });
    } catch {
      toast({ title: "복사에 실패했습니다.", variant: "destructive" });
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-3 pb-24 sm:pb-6">
      <div>
        <h1 className="text-xl font-semibold">소개</h1>
        <p className="text-sm text-muted-foreground">
          영문 3글자 소개코드로 가입한 치과·기공소가 담당 실적입니다.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      ) : error ? (
        <p className="text-sm text-destructive">{(error as Error).message}</p>
      ) : (
        <>
          <Card>
            <CardHeader className="p-3">
              <CardTitle className="text-base">내 소개코드</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-3 pt-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-3xl font-semibold tracking-widest">
                  {code || "—"}
                </span>
                {code ? (
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => copy(code, "소개코드")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
              {link ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <code className="flex-1 truncate rounded-md bg-muted px-2 py-1.5 text-xs">
                    {link}
                  </code>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => copy(link, "가입 링크")}
                  >
                    링크 복사
                  </Button>
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {data?.policyNote}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-3">
              <CardTitle className="text-base">소개로 가입한 거래처</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 p-3 pt-0">
              {(data?.organizations || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">아직 없습니다.</p>
              ) : (
                (data?.organizations || []).map((o) => (
                  <div
                    key={String(o._id)}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {o.name || "사업자"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {o.createdAt
                          ? new Date(o.createdAt).toLocaleDateString("ko-KR", {
                              timeZone: "Asia/Seoul",
                            })
                          : ""}
                      </div>
                    </div>
                    <Badge variant="secondary">
                      {KIND_LABEL[String(o.requestorKind || "")] ||
                        o.requestorKind ||
                        "의뢰자"}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

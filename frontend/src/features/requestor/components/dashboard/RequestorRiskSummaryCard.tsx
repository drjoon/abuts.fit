import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type RiskSummary = {
  delayedCount?: number;
  warningCount?: number;
  onTimeRate?: number;
  items?: {
    id: string;
    title: string;
    manufacturer?: string;
    riskLevel?: string;
    message?: string;
    status?: string;
    status1?: string;
    status2?: string;
    dueDate?: string | null;
    daysOverdue?: number;
    daysUntilDue?: number;
  }[];
};

type Props = {
  riskSummary?: RiskSummary | null;
};

export const RequestorRiskSummaryCard = ({ riskSummary }: Props) => {
  const summary = riskSummary || {};

  return (
    <Card className="relative flex flex-1 flex-col rounded-2xl border border-gray-200 bg-white/80 shadow-sm transition-all hover:shadow-lg h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">
          지연 위험 요약
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col space-y-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>지연 가능 의뢰: {summary.warningCount ?? 0}건</span>
          <span>지연 확정 의뢰: {summary.delayedCount ?? 0}건</span>
          <span>정시 출고 비율: {summary.onTimeRate ?? 0}%</span>
        </div>
        <div className="space-y-2 flex-1">
          {summary.items?.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between rounded-lg border border-border bg-muted/40 p-3 gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{item.title}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {item.manufacturer || "-"}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
                  {[
                    item.status,
                    item.status1
                      ? `${item.status1}${
                          item.status2 && item.status2 !== "없음"
                            ? `/${item.status2}`
                            : ""
                        }`
                      : null,
                    item.dueDate ? `도착예정 ${item.dueDate}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground line-clamp-2">
                  {item.message}
                </div>
              </div>
              <div className="ml-2 flex-shrink-0">
                {item.riskLevel === "danger" ? (
                  <Badge variant="destructive" className="text-[10px]">
                    지연 위험
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    주의
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

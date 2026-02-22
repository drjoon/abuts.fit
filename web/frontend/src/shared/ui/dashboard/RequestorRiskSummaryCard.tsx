import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FunctionalItemCard } from "@/shared/ui/components/FunctionalItemCard";

export type RiskSummary = {
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
    manufacturerStage?: string;
    dueDate?: string | null;
    daysOverdue?: number;
    daysUntilDue?: number;
    caseInfos?: any;
  }[];
};

export type RiskSummaryItem = NonNullable<RiskSummary["items"]>[number];

type Props = {
  riskSummary?: RiskSummary | null;
  loading?: boolean;
  onItemClick?: (item: RiskSummaryItem) => void;
};

export const RequestorRiskSummaryCard = ({
  riskSummary,
  loading,
  onItemClick,
}: Props) => {
  if (loading) {
    return (
      <Card className="app-glass-card app-glass-card--lg h-full">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  const summary = riskSummary || {};

  // 최근 의뢰 스타일의 상태 배지 가져오기
  const getStatusBadge = (status: string, manufacturerStage?: string) => {
    if (manufacturerStage) {
      switch (manufacturerStage) {
        case "의뢰":
          return (
            <Badge
              variant="outline"
              className="text-[10px] h-4 px-1.5 whitespace-nowrap leading-none"
            >
              의뢰
            </Badge>
          );
        case "의뢰접수":
          return (
            <Badge
              variant="outline"
              className="text-[10px] h-4 px-1.5 whitespace-nowrap leading-none"
            >
              의뢰접수
            </Badge>
          );
        case "CAM":
          return (
            <Badge
              variant="default"
              className="text-[10px] h-4 px-1.5 whitespace-nowrap leading-none"
            >
              CAM
            </Badge>
          );
        case "가공":
          return (
            <Badge
              variant="default"
              className="text-[10px] h-4 px-1.5 whitespace-nowrap leading-none"
            >
              가공
            </Badge>
          );
        case "생산":
          return (
            <Badge
              variant="default"
              className="text-[10px] h-4 px-1.5 whitespace-nowrap leading-none"
            >
              생산
            </Badge>
          );
        case "세척.포장":
        case "세척.패킹":
          return (
            <Badge
              variant="default"
              className="bg-purple-50 text-purple-700 border-purple-200 text-xs"
            >
              세척.패킹
            </Badge>
          );
        case "발송":
        case "포장.발송":
          return (
            <Badge
              variant="default"
              className="bg-blue-50 text-blue-700 border-blue-200 text-xs"
            >
              포장.발송
            </Badge>
          );
        case "추적관리":
          return (
            <Badge
              variant="secondary"
              className="text-[10px] h-4 px-1.5 whitespace-nowrap leading-none"
            >
              추적관리
            </Badge>
          );
        default:
          break;
      }
    }

    switch (status) {
      case "의뢰":
        return (
          <Badge
            variant="outline"
            className="text-[10px] h-4 px-1.5 whitespace-nowrap leading-none"
          >
            의뢰
          </Badge>
        );
      case "의뢰접수":
        return (
          <Badge
            variant="outline"
            className="text-[10px] h-4 px-1.5 whitespace-nowrap leading-none"
          >
            의뢰접수
          </Badge>
        );
      case "가공전":
        return (
          <Badge
            variant="default"
            className="text-[10px] h-4 px-1.5 whitespace-nowrap leading-none"
          >
            CAM
          </Badge>
        );
      case "가공후":
        return (
          <Badge
            variant="default"
            className="text-[10px] h-4 px-1.5 whitespace-nowrap leading-none"
          >
            생산
          </Badge>
        );
      case "배송중":
        return (
          <Badge
            variant="default"
            className="text-[10px] h-4 px-1.5 whitespace-nowrap leading-none"
          >
            발송
          </Badge>
        );
      case "완료":
        return (
          <Badge
            variant="secondary"
            className="text-[10px] h-4 px-1.5 whitespace-nowrap leading-none"
          >
            완료
          </Badge>
        );
      case "취소":
        return (
          <Badge
            variant="destructive"
            className="text-[10px] h-4 px-1.5 whitespace-nowrap leading-none"
          >
            취소
          </Badge>
        );
      default:
        return (
          <Badge
            variant="outline"
            className="text-[10px] h-4 px-1.5 whitespace-nowrap leading-none"
          >
            {status}
          </Badge>
        );
    }
  };

  return (
    <Card className="app-glass-card app-glass-card--lg">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">
          지연 위험 요약
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col space-y-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>지연 가능 의뢰: {summary.warningCount ?? 0}건</span>
          <span>지연 확정 의뢰: {summary.delayedCount ?? 0}건</span>
          <span>정시 발송 비율: {summary.onTimeRate ?? 0}%</span>
        </div>
        <div className="space-y-2 flex-1 max-h-[350px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
          {summary.items && summary.items.length > 0 ? (
            summary.items.map((item) => (
              <FunctionalItemCard
                key={item.id}
                className="flex items-center justify-between p-3 border border-border rounded-lg"
                disabled
                onClick={(e) => {
                  if (!onItemClick) return;
                  e.preventDefault();
                  e.stopPropagation();
                  onItemClick(item);
                }}
              >
                <div className="flex-1 min-w-0 mr-2">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="text-sm font-medium truncate">
                      {item.title}
                    </div>
                    {getStatusBadge(item.status || "", item.manufacturerStage)}
                    {item.riskLevel === "danger" ? (
                      <Badge
                        variant="destructive"
                        className="text-[10px] h-4 px-1.5 whitespace-nowrap leading-none"
                      >
                        지연확정
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-[10px] h-4 px-1.5 whitespace-nowrap leading-none"
                      >
                        지연가능
                      </Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {item.caseInfos?.clinicName && (
                      <span>{item.caseInfos.clinicName}</span>
                    )}
                    {item.caseInfos?.patientName && (
                      <span className="ml-1">{item.caseInfos.patientName}</span>
                    )}
                    {item.caseInfos?.tooth && (
                      <span className="ml-1">#{item.caseInfos.tooth}</span>
                    )}
                    <span className="ml-1">
                      {(() => {
                        const m = item.caseInfos?.implantManufacturer;
                        const s = item.caseInfos?.implantSystem;
                        const t = item.caseInfos?.implantType;
                        if (!m && !s && !t) return "-";
                        return `${m || "-"} / ${s || "-"} / ${t || "-"}`;
                      })()}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2">
                    {item.dueDate && (
                      <span className="text-blue-600 font-medium">
                        발송 예정: {item.dueDate}
                      </span>
                    )}
                    <span className="truncate">{item.manufacturer || "-"}</span>
                  </div>
                </div>
              </FunctionalItemCard>
            ))
          ) : (
            <div className="flex h-32 items-center justify-center text-xs text-muted-foreground border border-dashed rounded-lg">
              지연 위험 내역이 없습니다.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

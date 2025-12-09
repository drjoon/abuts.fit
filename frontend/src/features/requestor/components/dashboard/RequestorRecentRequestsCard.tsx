import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FunctionalItemCard } from "@/components/FunctionalItemCard";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";

const getStatusBadge = (status: string) => {
  switch (status) {
    case "진행중":
    case "제작중":
      return <Badge variant="default">{status}</Badge>;
    case "완료":
      return <Badge variant="secondary">{status}</Badge>;
    case "검토중":
      return <Badge variant="outline">{status}</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
};

type Props = {
  items: any[];
  onRefresh: () => void;
  onEdit: (item: any) => void;
  onCancel: (id: string) => void;
};

export const RequestorRecentRequestsCard = ({
  items,
  onRefresh,
  onEdit,
  onCancel,
}: Props) => {
  const navigate = useNavigate();
  return (
    <Card
      className="relative flex flex-col rounded-2xl border border-gray-200 bg-white/80 shadow-sm transition-all hover:shadow-lg flex-1 min-h-[220px] cursor-pointer"
      onClick={onRefresh}
    >
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base font-semibold m-0">최근 의뢰</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-between pt-0">
        <div className="space-y-3 max-h-[240px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
          {items.map((item: any) => {
            const displayId = item.requestId || item.id || item._id || "";

            return (
              <FunctionalItemCard
                key={displayId}
                className="flex items-center justify-between p-3 border border-border rounded-lg"
                onClick={(e) => e.stopPropagation()}
                // U 버튼: 프로필/배송 옵션 설정 페이지로 이동
                onUpdate={() => navigate("/dashboard/settings")}
                onRemove={
                  item._id || item.id
                    ? () => onCancel(item._id || (item.id as string))
                    : undefined
                }
                confirmTitle="이 의뢰를 취소하시겠습니까?"
                confirmDescription={
                  <div className="text-md">
                    <div className="font-medium mb-1 truncate">
                      {item.title || displayId}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {item.caseInfos?.clinicName && (
                        <span>{item.caseInfos.clinicName}</span>
                      )}
                      {item.caseInfos?.patientName && (
                        <span className="ml-1">
                          {item.caseInfos.patientName}
                        </span>
                      )}
                      {item.caseInfos?.tooth && (
                        <span className="ml-1">{item.caseInfos.tooth}</span>
                      )}
                      {item.caseInfos?.implantSystem && (
                        <span className="ml-1">
                          {item.caseInfos.implantSystem}
                        </span>
                      )}
                      {item.caseInfos?.implantType && (
                        <span className="ml-1">
                          {item.caseInfos.implantType}
                        </span>
                      )}
                      {item.caseInfos?.maxDiameter && (
                        <span className="ml-1">
                          {item.caseInfos.maxDiameter.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                }
                confirmLabel="의뢰 취소"
                cancelLabel="닫기"
              >
                <div className="flex-1">
                  <div className="text-md font-medium truncate">
                    {item.title || displayId}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {item.caseInfos?.clinicName && (
                      <span>{item.caseInfos.clinicName}</span>
                    )}
                    {item.caseInfos?.patientName && (
                      <span className="ml-1">{item.caseInfos.patientName}</span>
                    )}
                    {item.caseInfos?.tooth && (
                      <span className="ml-1">{item.caseInfos.tooth}</span>
                    )}
                    {item.caseInfos?.implantSystem && (
                      <span className="ml-1">
                        {item.caseInfos.implantSystem}
                      </span>
                    )}
                    {item.caseInfos?.implantType && (
                      <span className="ml-1">{item.caseInfos.implantType}</span>
                    )}
                    {item.caseInfos?.maxDiameter && (
                      <span className="ml-1">
                        {item.caseInfos.maxDiameter.toFixed(1)}
                      </span>
                    )}
                  </div>
                </div>
              </FunctionalItemCard>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

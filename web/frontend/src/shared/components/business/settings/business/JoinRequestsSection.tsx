import { Button } from "@/components/ui/button";

interface JoinRequestsSectionProps {
  myJoinRequests: {
    businessId: string;
    businessName: string;
    status: string;
  }[];
  cancelLoadingBusinessId: string;
  onCancelJoinRequest: (businessId: string) => void;
  onLeaveOrganization: (businessId: string) => void;
}

export const JoinRequestsSection = ({
  myJoinRequests,
  cancelLoadingBusinessId,
  onCancelJoinRequest,
  onLeaveOrganization,
}: JoinRequestsSectionProps) => {
  const getJoinStatusLabel = (status: string) => {
    const s = String(status || "").trim();
    if (s === "pending") return "승인대기중";
    if (s === "approved") return "승인됨";
    if (s === "rejected") return "거절됨";
    return s || "-";
  };

  if (!Array.isArray(myJoinRequests) || myJoinRequests.length === 0)
    return null;

  return (
    <div className="app-surface app-surface--panel">
      <div className="text-sm font-medium mb-2">내 소속 신청:</div>
      <div className="space-y-2">
        {myJoinRequests.map((r) => (
          <div
            key={`${r.businessId}-${r.status}`}
            className="flex items-center justify-between gap-3"
          >
            <div className="text-sm">
              {r.businessName} - {getJoinStatusLabel(r.status)}
            </div>
            {String(r.status) === "pending" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onCancelJoinRequest(String(r.businessId))}
                disabled={cancelLoadingBusinessId === r.businessId}
              >
                {cancelLoadingBusinessId === r.businessId
                  ? "취소 중..."
                  : "신청 취소"}
              </Button>
            )}

            {String(r.status) === "approved" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onLeaveOrganization(String(r.businessId))}
                disabled={cancelLoadingBusinessId === r.businessId}
              >
                {cancelLoadingBusinessId === r.businessId
                  ? "취소 중..."
                  : "소속 해제"}
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

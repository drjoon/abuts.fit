import { Button } from "@/components/ui/button";

interface JoinRequestsSectionProps {
  myJoinRequests: {
    organizationId: string;
    organizationName: string;
    status: string;
  }[];
  cancelLoadingOrgId: string;
  onCancelJoinRequest: (organizationId: string) => void;
  onLeaveOrganization: (organizationId: string) => void;
}

export const JoinRequestsSection = ({
  myJoinRequests,
  cancelLoadingOrgId,
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
    <div className="rounded-lg border bg-white/60 p-4">
      <div className="text-sm font-medium mb-2">내 소속 신청:</div>
      <div className="space-y-2">
        {myJoinRequests.map((r) => (
          <div
            key={`${r.organizationId}-${r.status}`}
            className="flex items-center justify-between gap-3"
          >
            <div className="text-sm">
              {r.organizationName} - {getJoinStatusLabel(r.status)}
            </div>
            {String(r.status) === "pending" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onCancelJoinRequest(String(r.organizationId))}
                disabled={cancelLoadingOrgId === r.organizationId}
              >
                {cancelLoadingOrgId === r.organizationId
                  ? "취소 중..."
                  : "신청 취소"}
              </Button>
            )}

            {String(r.status) === "approved" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onLeaveOrganization(String(r.organizationId))}
                disabled={cancelLoadingOrgId === r.organizationId}
              >
                {cancelLoadingOrgId === r.organizationId
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

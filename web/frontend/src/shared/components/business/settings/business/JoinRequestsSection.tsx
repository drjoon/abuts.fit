// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { Button } from "@/components/ui/button";
import { Building2 } from "lucide-react";
import { cn } from "@/shared/ui/cn";

interface JoinRequestsSectionProps {
  myJoinRequests: {
    businessId: string;
    businessName: string;
    status: string;
  }[];
  cancelLoadingBusinessId: string;
  onCancelJoinRequest: (businessId: string) => void;
  onLeaveBusiness: (businessId: string) => void;
}

export const JoinRequestsSection = ({
  myJoinRequests,
  cancelLoadingBusinessId,
  onCancelJoinRequest,
  onLeaveBusiness,
}: JoinRequestsSectionProps) => {
  const getJoinStatusLabel = (status: string) => {
    const s = String(status || "").trim();
    if (s === "pending") return "승인 대기";
    if (s === "approved") return "승인됨";
    if (s === "rejected") return "거절됨";
    return s || "-";
  };

  if (!Array.isArray(myJoinRequests) || myJoinRequests.length === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 sm:p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white ring-1 ring-slate-200/80">
          <Building2 className="h-4 w-4 text-primary-strong" />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-900">내 소속 신청</p>
          <p className="text-xs text-muted-foreground">
            {myJoinRequests.length}건
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {myJoinRequests.map((r) => {
          const isPending = String(r.status) === "pending";
          const isApproved = String(r.status) === "approved";
          return (
            <div
              key={`${r.businessId}-${r.status}`}
              className="flex flex-col gap-2 rounded-xl border border-slate-200/80 bg-white/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  {r.businessName}
                </p>
                <span
                  className={cn(
                    "mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1",
                    isPending
                      ? "bg-amber-50 text-amber-800 ring-amber-200"
                      : isApproved
                        ? "bg-primary-soft text-primary-strong ring-primary-muted"
                        : "bg-slate-100 text-slate-600 ring-slate-200",
                  )}
                >
                  {getJoinStatusLabel(r.status)}
                </span>
              </div>
              {isPending && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 rounded-lg"
                  onClick={() => onCancelJoinRequest(String(r.businessId))}
                  disabled={cancelLoadingBusinessId === r.businessId}
                >
                  {cancelLoadingBusinessId === r.businessId
                    ? "취소 중..."
                    : "신청 취소"}
                </Button>
              )}
              {isApproved && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 rounded-lg"
                  onClick={() => onLeaveBusiness(String(r.businessId))}
                  disabled={cancelLoadingBusinessId === r.businessId}
                >
                  {cancelLoadingBusinessId === r.businessId
                    ? "처리 중..."
                    : "소속 해제"}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};

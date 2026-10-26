// related files:
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx
// - web/backend/controllers/admin/admin.newMembers.controller.js
// change-log:
// - 2026-10-26: 가입 후 7일간 신규 회원을 관리자 대시보드에 표시.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { DashBigNumber, DashTile } from "@/shared/ui/dashboard/DashTile";
import { request } from "@/shared/api/apiClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { REQUESTOR_KIND_LABEL } from "@/shared/business/requestorCapabilities";

type NewMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  requestorKind?: string | null;
  businessName: string;
  phone: string;
  onboardingWizardCompleted: boolean;
  active: boolean;
  createdAt?: string | null;
};

type NewMembersData = {
  days: number;
  count: number;
  members: NewMember[];
};

function memberKindLabel(row: NewMember) {
  if (row.role === "salesman") return "딜러사";
  if (row.requestorKind === "practice") return REQUESTOR_KIND_LABEL.practice;
  if (row.requestorKind === "lab") return REQUESTOR_KIND_LABEL.lab;
  return "의뢰자";
}

function formatJoinedAt(iso?: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AdminNewMembersCard({
  enabled = true,
  className,
}: {
  enabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["admin-new-members"],
    enabled,
    queryFn: async () => {
      const res = await request<{ success?: boolean; data?: NewMembersData }>({
        path: "/api/admin/new-members",
        method: "GET",
      });
      if (!res.ok || !res.data?.data) {
        throw new Error("신규 회원을 불러오지 못했습니다.");
      }
      return res.data.data;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const members = query.data?.members || [];
  const count = query.data?.count ?? members.length;
  const lead = members[0];

  return (
    <>
      <DashTile
        className={className}
        title="신규 회원"
        icon={<UserPlus className="h-4 w-4 text-muted-foreground" />}
        tone={count > 0 ? "warn" : "default"}
        onClick={count > 0 ? () => setOpen(true) : undefined}
      >
        <div className="flex h-full flex-col justify-end gap-0.5">
          <DashBigNumber value={count.toLocaleString("ko-KR")} unit="명" />
          <p className="truncate text-[11px] text-muted-foreground">
            {lead
              ? `${lead.businessName || lead.name}${count > 1 ? ` 외 ${count - 1}명` : ""}`
              : query.isLoading
                ? "불러오는 중…"
                : "7일 이내 없음"}
          </p>
        </div>
      </DashTile>
      <Dialog open={open && count > 0} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>신규 회원</DialogTitle>
            <DialogDescription asChild>
              <div className="text-sm text-muted-foreground">
                가입한 지 7일이 지나지 않은 회원입니다.
              </div>
            </DialogDescription>
          </DialogHeader>
          <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto px-1.5 py-1.5">
            {members.map((row) => {
              const kind = memberKindLabel(row);
              const title = row.businessName || row.name || row.email;
              const meta = [
                kind,
                row.businessName && row.name ? row.name : "",
                row.phone,
                formatJoinedAt(row.createdAt),
              ]
                .filter(Boolean)
                .join(" · ");
              const flags = [
                row.active ? "" : "승인 대기",
                row.onboardingWizardCompleted ? "" : "가입 설정 전",
              ].filter(Boolean);
              return (
                <li
                  key={row.id}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
                >
                  <div className="truncate text-sm font-medium text-slate-800">
                    {title}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {meta}
                    {row.email ? ` · ${row.email}` : ""}
                  </div>
                  {flags.length > 0 ? (
                    <div className="mt-0.5 truncate text-[11px] text-amber-800">
                      {flags.join(" · ")}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}

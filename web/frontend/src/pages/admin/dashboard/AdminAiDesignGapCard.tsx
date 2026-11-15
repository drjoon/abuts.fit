// 관리자 대시보드 — 자동 디자인으로 바꾸지 못한 커스텀어벗 요청.
// related files:
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx
// - web/backend/controllers/admin/admin.aiDesignGap.controller.js
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PenLine } from "lucide-react";
import { DashBigNumber, DashTile } from "@/shared/ui/dashboard/DashTile";
import { request } from "@/shared/api/apiClient";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type DesignGap = {
  id: string;
  practiceName: string;
  transferId: string;
  patientName: string;
  toothNumber: string;
  message: string;
  manualChoice: "yes" | "no" | null;
  createdAt?: string | null;
};

type GapData = {
  count: number;
  items: DesignGap[];
};

const CHOICE_LABEL: Record<string, string> = {
  yes: "수작업 전환",
  no: "자동 유지",
};

function formatAt(iso?: string | null) {
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

function toothLabel(tooth: string) {
  const text = tooth.trim();
  if (!text) return "";
  return text.startsWith("#") ? text : `#${text}`;
}

export function AdminAiDesignGapCard({
  enabled = true,
  className,
}: {
  enabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["admin-ai-design-gaps"],
    enabled,
    queryFn: async () => {
      const res = await request<{ success?: boolean; data?: GapData }>({
        path: "/api/admin/ai-design-gaps",
        method: "GET",
      });
      if (!res.ok || !res.data?.data) {
        throw new Error("미지원 디자인을 불러오지 못했습니다.");
      }
      return res.data.data;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const review = useMutation({
    mutationFn: async (id: string) => {
      const res = await request<{ success?: boolean; data?: GapData }>({
        path: `/api/admin/ai-design-gaps/${encodeURIComponent(id)}/review`,
        method: "POST",
      });
      if (!res.ok || !res.data?.data) {
        throw new Error("확인을 저장하지 못했습니다.");
      }
      return res.data.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["admin-ai-design-gaps"], data);
    },
  });

  const count = query.data?.count ?? 0;
  const items = query.data?.items || [];

  return (
    <>
      <DashTile
        className={className}
        title="미지원 디자인"
        tone={count > 0 ? "warn" : "default"}
        icon={<PenLine className="h-4 w-4 text-muted-foreground" />}
        onClick={count > 0 ? () => setOpen(true) : undefined}
      >
        <div className="flex min-h-full flex-col justify-end gap-0.5">
          <DashBigNumber
            value={query.isLoading || query.isError ? "—" : count.toLocaleString("ko-KR")}
            unit={query.isLoading || query.isError ? undefined : "건"}
          />
          <p className="truncate text-[11px] text-muted-foreground">
            {query.isLoading ? "불러오는 중…" : query.isError ? "불러오지 못함" : count > 0 ? "확인 대기" : "없음"}
          </p>
        </div>
      </DashTile>
      <Dialog open={open && count > 0} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>미지원 디자인</DialogTitle>
            <DialogDescription asChild>
              <div className="text-sm text-muted-foreground">
                자동으로 바꾸지 못한 요청입니다.
                <br />
                확인하면 홈 건수에서 빠집니다.
              </div>
            </DialogDescription>
          </DialogHeader>
          <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto px-1.5 py-1.5">
            {items.map((row) => {
              const meta = [row.practiceName, row.patientName, toothLabel(row.toothNumber)]
                .map((part) => part.trim())
                .filter(Boolean)
                .join(" · ");
              return (
                <li
                  key={row.id}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {row.transferId || "케이스 번호 없음"}
                      </p>
                      {meta ? <p className="truncate text-xs text-slate-500">{meta}</p> : null}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 shrink-0 px-2 text-xs"
                      disabled={review.isPending}
                      onClick={() => review.mutate(row.id)}
                    >
                      확인
                    </Button>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-slate-800">
                    {row.message}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {[CHOICE_LABEL[row.manualChoice || ""] || "답 없음", formatAt(row.createdAt)]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}

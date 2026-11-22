// 관리자 홈 — 확정 디자인이 자동 생성과 다른 건.
// 건을 열면 읽기 전용 디자인에서 변경 전·후를 한 쪽씩 본다.
// related files:
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx
// - web/backend/controllers/admin/admin.abutmentDesignLogic.controller.js
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SlidersHorizontal } from "lucide-react";
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
import { useToast } from "@/shared/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";
import {
  PracticeCustomAbutmentPreviewDialog,
  type PracticeDesignPreviewFileItem,
} from "@/shared/components/practice/PracticeCustomAbutmentPreviewDialog";
import type { CustomAbutmentDesignParams } from "@/shared/practice/customAbutmentDesignParams";
import { normalizeToothWorks, type ToothWorkSelection } from "@/shared/practice/transferMemo";

type DesignChangeItem = {
  id: string;
  transferId: string;
  patientName: string;
  practiceName: string;
  editorName: string;
  lines: string[];
  toothNumbers: string[];
};

type LogicData = {
  count: number;
  items: DesignChangeItem[];
};

type OriginTooth = {
  toothNumber: string;
  baselineParams: Partial<CustomAbutmentDesignParams>;
};

type DesignPreview = {
  transferId: string;
  patientName: string;
  toothWorks: ToothWorkSelection[];
  files: PracticeDesignPreviewFileItem[];
  workScanFiles: PracticeDesignPreviewFileItem[];
  changeId: string;
  lines: string[];
  originTeeth: OriginTooth[];
};

type DecideScope = "user" | "global" | "skip";

function toothLabel(tooth: string) {
  const text = tooth.trim().replace(/^#/, "");
  if (!text) return "";
  return `#${text}`;
}

export function AdminAbutmentDesignLogicCard({
  enabled = true,
  className,
}: {
  enabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<DesignPreview | null>(null);
  const [openingId, setOpeningId] = useState("");
  const [busyId, setBusyId] = useState("");
  const { toast } = useToast();
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["admin-abutment-design-logic"],
    enabled,
    queryFn: async () => {
      const res = await request<{ success?: boolean; data?: LogicData }>({
        path: "/api/admin/abutment-design-logic",
        method: "GET",
      });
      if (!res.ok || !res.data?.data) {
        throw new Error("디자인 변경을 불러오지 못했습니다.");
      }
      return res.data.data;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const decide = useMutation({
    mutationFn: async ({ id, scope }: { id: string; scope: DecideScope }) => {
      const res = await request<{ success?: boolean; message?: string; data?: LogicData }>({
        path:
          scope === "skip"
            ? `/api/admin/abutment-design-logic/${encodeURIComponent(id)}/dismiss`
            : `/api/admin/abutment-design-logic/${encodeURIComponent(id)}/apply`,
        method: "POST",
        ...(scope === "skip" ? {} : { jsonBody: { scope } }),
      });
      if (res.data?.data) {
        queryClient.setQueryData(["admin-abutment-design-logic"], res.data.data);
      }
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.message || "저장하지 못했습니다.");
      }
      return { id, data: res.data.data };
    },
    onSuccess: ({ id }) => {
      setPreview((current) => (current?.changeId === id ? null : current));
    },
    onError: (error) => {
      toast({
        title: error instanceof Error ? error.message : "저장하지 못했습니다.",
        variant: "destructive",
      });
    },
    onSettled: () => setBusyId(""),
  });

  const count = query.data?.count ?? 0;
  const items = query.data?.items || [];

  const openPreview = async (row: DesignChangeItem) => {
    if (openingId || !row.transferId) return;
    setOpeningId(row.id);
    try {
      const params = new URLSearchParams({
        transferId: row.transferId,
        patientName: row.patientName || "",
        changeId: row.id,
      });
      const res = await request<{ success?: boolean; data?: DesignPreview; message?: string }>({
        path: `/api/admin/abutment-design-logic/preview?${params.toString()}`,
        method: "GET",
      });
      if (!res.ok || !res.data?.data?.transferId) {
        throw new Error(res.data?.message || "이 의뢰의 디자인을 열 수 없습니다.");
      }
      setPreview(res.data.data);
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "디자인을 불러오지 못했습니다.",
        variant: "destructive",
      });
    } finally {
      setOpeningId("");
    }
  };

  const decideChange = (id: string, scope: DecideScope) => {
    if (!id || busyId) return;
    setBusyId(id);
    decide.mutate({ id, scope });
  };

  return (
    <>
      <DashTile
        className={className}
        title="생성 로직"
        tone={count > 0 ? "warn" : "default"}
        icon={<SlidersHorizontal className="h-4 w-4 text-muted-foreground" />}
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
        <DialogContent className="max-w-lg space-y-3 p-5">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="text-base font-semibold">디자인 변경</DialogTitle>
            <DialogDescription asChild>
              <p className="text-xs leading-relaxed text-muted-foreground">
                확정 디자인과 자동 생성의 차이입니다.
                <br />
                전후를 보고 다음 생성에 반영합니다.
              </p>
            </DialogDescription>
          </DialogHeader>
          <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto px-1.5 py-1.5">
            {items.map((row) => {
              const title = [
                row.toothNumbers.map(toothLabel).filter(Boolean).join(", "),
                row.patientName,
                row.practiceName,
                row.editorName,
              ]
                .map((part) => part.trim())
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={row.id} className="rounded-lg border bg-background px-3 py-2 shadow-sm">
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => void openPreview(row)}
                  >
                    <p className="truncate text-sm font-medium text-foreground">
                      {openingId === row.id ? "불러오는 중…" : title || row.transferId}
                    </p>
                    {row.lines.length > 0 ? (
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {row.lines.map((line, index) => (
                          <span key={`${row.id}-${index}`}>
                            {index > 0 ? <br /> : null}
                            {line}
                          </span>
                        ))}
                      </p>
                    ) : null}
                  </button>
                  <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busyId !== ""}
                      onClick={() => decideChange(row.id, "skip")}
                    >
                      건너뛰기
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busyId !== ""}
                      onClick={() => decideChange(row.id, "user")}
                    >
                      이 사용자만
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busyId !== ""}
                      onClick={() => decideChange(row.id, "global")}
                    >
                      모든 사용자
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>
      {preview ? (
        <PracticeCustomAbutmentPreviewDialog
          key={preview.changeId || preview.transferId}
          open
          onOpenChange={(next) => {
            if (!next) setPreview(null);
          }}
          authToken={token}
          caseTitle={preview.transferId}
          patientName={preview.patientName}
          toothWorks={normalizeToothWorks(preview.toothWorks || [])}
          files={preview.files || []}
          workScanFiles={preview.workScanFiles || []}
          transferId={preview.transferId}
          readOnly
          originTeeth={preview.originTeeth || []}
          reviewDecideBusy={busyId !== "" && busyId === preview.changeId}
          onReviewDecide={
            preview.changeId
              ? (scope) => decideChange(preview.changeId, scope)
              : undefined
          }
        />
      ) : null}
    </>
  );
}

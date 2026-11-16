// 관리자 대시보드 — 여러 케이스에서 반복된 커스텀어벗 생성 편향.
// 의뢰자 취향(커프·대합 거리)은 여기 오지 않는다.
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
import { normalizeToothWorks, type ToothWorkSelection } from "@/shared/practice/transferMemo";

type LogicSample = {
  transferId: string;
  patientName: string;
  practiceName: string;
  toothNumber: string;
  changeText: string;
};

type LogicProposal = {
  id: string;
  changeLabel: string;
  summary: string;
  detail: string;
  applyText: string;
  beforeText: string;
  afterText: string;
  samples: LogicSample[];
};

type LogicData = {
  count: number;
  items: LogicProposal[];
};

type DesignPreview = {
  transferId: string;
  patientName: string;
  toothWorks: ToothWorkSelection[];
  files: PracticeDesignPreviewFileItem[];
  workScanFiles: PracticeDesignPreviewFileItem[];
};

function toothLabel(tooth: string) {
  const text = tooth.trim();
  if (!text) return "";
  return text.startsWith("#") ? text : `#${text}`;
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
        throw new Error("생성 로직 제안을 불러오지 못했습니다.");
      }
      return res.data.data;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const decide = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "approve" | "dismiss" }) => {
      const res = await request<{ success?: boolean; data?: LogicData }>({
        path: `/api/admin/abutment-design-logic/${encodeURIComponent(id)}/${action}`,
        method: "POST",
      });
      if (!res.ok || !res.data?.data) {
        throw new Error(action === "approve" ? "승인을 저장하지 못했습니다." : "거절을 저장하지 못했습니다.");
      }
      return res.data.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["admin-abutment-design-logic"], data);
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

  const openPreview = async (sample: LogicSample) => {
    if (openingId || !sample.transferId) return;
    setOpeningId(sample.transferId);
    try {
      const params = new URLSearchParams({
        transferId: sample.transferId,
        patientName: sample.patientName || "",
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
        <DialogContent className="max-w-md space-y-3 p-5">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="text-base font-semibold">생성 로직을 업데이트할까요?</DialogTitle>
            <DialogDescription asChild>
              <p className="text-xs leading-relaxed text-muted-foreground">
                여러 케이스에서 같은 수정이 반복됐습니다.
                <br />
                승인하면 다음 케이스 생성부터 적용합니다.
              </p>
            </DialogDescription>
          </DialogHeader>
          <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto px-1.5 py-1.5">
            {items.map((row) => (
              <li key={row.id} className="rounded-lg border bg-background px-3 py-2 shadow-sm">
                <p className="text-sm leading-relaxed text-foreground">
                  {row.summary}
                  <br />
                  {row.detail}
                  <br />
                  {row.applyText}
                </p>
                <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium text-foreground">{row.changeLabel}</span>
                  <span className="shrink-0 text-xs tabular-nums">
                    <span className="text-muted-foreground">{row.beforeText}</span>
                    <span className="mx-1.5 text-muted-foreground">→</span>
                    <span className="font-semibold text-primary">{row.afterText}</span>
                  </span>
                </div>
                {row.samples.length > 0 ? (
                  <div className="mt-2">
                    <p className="text-[11px] text-muted-foreground">샘플 케이스</p>
                    <ul className="mt-1 space-y-1">
                      {row.samples.map((sample) => {
                        const meta = [toothLabel(sample.toothNumber), sample.patientName, sample.practiceName]
                          .map((part) => part.trim())
                          .filter(Boolean)
                          .join(" · ");
                        return (
                          <li key={`${row.id}-${sample.transferId}-${sample.toothNumber}`}>
                            <button
                              type="button"
                              className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-1 text-left text-xs hover:bg-muted/50"
                              onClick={() => void openPreview(sample)}
                            >
                              <span className="min-w-0 truncate text-foreground">
                                {sample.transferId}
                                {meta ? ` · ${meta}` : ""}
                              </span>
                              <span className="shrink-0 text-muted-foreground">
                                {openingId === sample.transferId ? "불러오는 중…" : sample.changeText}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
                <div className="mt-2 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busyId !== ""}
                    onClick={() => {
                      setBusyId(row.id);
                      decide.mutate({ id: row.id, action: "dismiss" });
                    }}
                  >
                    거절
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busyId !== ""}
                    onClick={() => {
                      setBusyId(row.id);
                      decide.mutate({ id: row.id, action: "approve" });
                    }}
                  >
                    승인
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
      {preview ? (
        <PracticeCustomAbutmentPreviewDialog
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
        />
      ) : null}
    </>
  );
}

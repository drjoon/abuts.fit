// 관리자 홈 생산 — 커스텀어벗 AI 사용량 · 미지원 요청 · 생성 로직 변경을 한 카드에서 본다.
// related files:
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx
// - web/backend/controllers/admin/admin.aiDesignChatUsage.controller.js
// - web/backend/controllers/admin/admin.aiDesignGap.controller.js
// - web/backend/controllers/admin/admin.abutmentDesignLogic.controller.js
// change-log:
// - 2026-11-25: 60초 폴링 제거. 대시보드를 열 때 한 번만 조회.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot } from "lucide-react";
import { DashStat, DashTile } from "@/shared/ui/dashboard/DashTile";
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
import { cn } from "@/shared/ui/cn";

type HubTab = "logic" | "gap" | "usage";

type UsageAccount = {
  anchorId: string;
  name: string;
  calls: number;
  totalTokens: number;
  costKrw: number;
};

type UsageData = {
  fxKrwPerUsd: number;
  totals: { calls: number; totalTokens: number; costKrw: number; accounts: number };
  accounts: UsageAccount[];
};

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

type LogicPreview = {
  transferId: string;
  patientName: string;
  toothWorks: ToothWorkSelection[];
  files: PracticeDesignPreviewFileItem[];
  workScanFiles: PracticeDesignPreviewFileItem[];
  changeId: string;
  lines: string[];
  originTeeth: OriginTooth[];
};

type GapPreview = {
  transferId: string;
  patientName: string;
  toothWorks: ToothWorkSelection[];
  files: PracticeDesignPreviewFileItem[];
  workScanFiles: PracticeDesignPreviewFileItem[];
};

type DecideScope = "user" | "global" | "skip";

const CHOICE_LABEL: Record<string, string> = {
  yes: "수작업 전환",
  no: "자동 유지",
};

function formatKrw(value: number) {
  const n = Math.max(0, Math.round(Number(value) || 0));
  if (n <= 0) return "0원";
  return `${n.toLocaleString("ko-KR")}원`;
}

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
  const text = tooth.trim().replace(/^#/, "");
  if (!text) return "";
  return `#${text}`;
}

export function AdminCustomAbutmentDesignHubCard({
  enabled = true,
  className,
}: {
  enabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<HubTab>("logic");
  const [logicPreview, setLogicPreview] = useState<LogicPreview | null>(null);
  const [gapPreview, setGapPreview] = useState<GapPreview | null>(null);
  const [openingId, setOpeningId] = useState("");
  const [busyId, setBusyId] = useState("");
  const { toast } = useToast();
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  const usageQuery = useQuery({
    queryKey: ["admin-ai-design-chat-usage"],
    enabled,
    queryFn: async () => {
      const res = await request<{ success?: boolean; data?: UsageData }>({
        path: "/api/admin/ai-design-chat-usage",
        method: "GET",
      });
      if (!res.ok || !res.data?.data) {
        throw new Error("AI 디자인 사용량을 불러오지 못했습니다.");
      }
      return res.data.data;
    },
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const gapQuery = useQuery({
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
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const logicQuery = useQuery({
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
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const reviewGap = useMutation({
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

  const decideLogic = useMutation({
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
      setLogicPreview((current) => (current?.changeId === id ? null : current));
    },
    onError: (error) => {
      toast({
        title: error instanceof Error ? error.message : "저장하지 못했습니다.",
        variant: "destructive",
      });
    },
    onSettled: () => setBusyId(""),
  });

  const usageTotals = usageQuery.data?.totals;
  const usageAccounts = usageQuery.data?.accounts || [];
  const costKrw = usageTotals?.costKrw ?? 0;
  const totalTokens = usageTotals?.totalTokens ?? 0;
  const fx = usageQuery.data?.fxKrwPerUsd ?? 1332;
  const gapCount = gapQuery.data?.count ?? 0;
  const gapItems = gapQuery.data?.items || [];
  const logicCount = logicQuery.data?.count ?? 0;
  const logicItems = logicQuery.data?.items || [];
  const loading = usageQuery.isLoading || gapQuery.isLoading || logicQuery.isLoading;
  const errored = usageQuery.isError || gapQuery.isError || logicQuery.isError;
  const attention = gapCount > 0 || logicCount > 0;

  const openHub = (nextTab?: HubTab) => {
    const preferred =
      nextTab ||
      (logicCount > 0 ? "logic" : gapCount > 0 ? "gap" : "usage");
    setTab(preferred);
    setOpen(true);
  };

  const openLogicPreview = async (row: DesignChangeItem) => {
    if (openingId || !row.transferId) return;
    setOpeningId(row.id);
    try {
      const params = new URLSearchParams({
        transferId: row.transferId,
        patientName: row.patientName || "",
        changeId: row.id,
      });
      const res = await request<{ success?: boolean; data?: LogicPreview; message?: string }>({
        path: `/api/admin/abutment-design-logic/preview?${params.toString()}`,
        method: "GET",
      });
      if (!res.ok || !res.data?.data?.transferId) {
        throw new Error(res.data?.message || "이 의뢰의 디자인을 열 수 없습니다.");
      }
      setLogicPreview(res.data.data);
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "디자인을 불러오지 못했습니다.",
        variant: "destructive",
      });
    } finally {
      setOpeningId("");
    }
  };

  const openGapPreview = async (row: DesignGap) => {
    if (openingId) return;
    setOpeningId(row.id);
    try {
      const res = await request<{ success?: boolean; data?: GapPreview; message?: string }>({
        path: `/api/admin/ai-design-gaps/${encodeURIComponent(row.id)}/preview`,
        method: "GET",
      });
      if (!res.ok || !res.data?.data?.transferId) {
        throw new Error(res.data?.message || "이 의뢰의 디자인을 열 수 없습니다.");
      }
      setGapPreview(res.data.data);
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
    decideLogic.mutate({ id, scope });
  };

  const tabButtons = useMemo(
    () =>
      [
        { id: "logic" as const, label: "생성 로직", badge: logicCount },
        { id: "gap" as const, label: "미지원", badge: gapCount },
        { id: "usage" as const, label: "AI 사용", badge: null },
      ] as const,
    [gapCount, logicCount],
  );

  return (
    <>
      <DashTile
        className={className}
        title="커스텀어벗 디자인"
        tone={attention ? "warn" : "default"}
        icon={<Bot className="h-4 w-4 text-muted-foreground" />}
        onClick={() => openHub()}
      >
        <div className="grid min-h-full grid-cols-3 content-end gap-1.5">
          <DashStat
            label="AI"
            value={
              loading || usageQuery.isError
                ? "—"
                : costKrw > 0
                  ? formatKrw(costKrw)
                  : totalTokens > 0
                    ? `${totalTokens.toLocaleString("ko-KR")}토큰`
                    : "0원"
            }
          />
          <DashStat
            label="미지원"
            value={loading || gapQuery.isError ? "—" : `${gapCount.toLocaleString("ko-KR")}건`}
            tone={gapCount > 0 ? "warn" : undefined}
          />
          <DashStat
            label="생성 로직"
            value={loading || logicQuery.isError ? "—" : `${logicCount.toLocaleString("ko-KR")}건`}
            tone={logicCount > 0 ? "warn" : undefined}
          />
        </div>
      </DashTile>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg space-y-3 p-5">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="text-base font-semibold">커스텀어벗 디자인</DialogTitle>
            <DialogDescription asChild>
              <p className="text-xs leading-relaxed text-muted-foreground">
                사용량·미지원 요청·생성 로직을 한곳에서 봅니다.
                <br />
                {errored ? "일부 값을 불러오지 못했습니다." : "탭을 바꿔 확인합니다."}
              </p>
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-1 rounded-full border bg-background p-1">
            {tabButtons.map((row) => (
              <Button
                key={row.id}
                type="button"
                size="sm"
                variant={tab === row.id ? "default" : "outline"}
                className={cn("h-8 flex-1 px-2 text-xs", row.badge ? "gap-1" : "")}
                onClick={() => setTab(row.id)}
              >
                {row.label}
                {row.badge != null && row.badge > 0 ? (
                  <span className="tabular-nums">{row.badge}</span>
                ) : null}
              </Button>
            ))}
          </div>
          {tab === "usage" ? (
            <div className="space-y-2">
              <p className="text-xs leading-relaxed text-muted-foreground">
                의뢰 치과별 누적입니다.
                <br />
                금액은 Gemini 3.5 Flash-Lite 유료 단가입니다.
                <br />
                달러는 {fx.toLocaleString("ko-KR")}원으로 계산해 호출 때 확정합니다.
              </p>
              <ul className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto px-1.5 py-1.5">
                {usageAccounts.length === 0 ? (
                  <li className="px-1 py-6 text-center text-xs text-muted-foreground">사용 없음</li>
                ) : (
                  usageAccounts.map((row) => (
                    <li
                      key={row.anchorId || row.name}
                      className="rounded-lg border bg-background px-3 py-2 shadow-sm"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-sm font-medium text-foreground">
                          {row.name}
                        </span>
                        <span className="shrink-0 text-sm font-medium tabular-nums">
                          {formatKrw(row.costKrw)}
                        </span>
                      </div>
                      <p className="truncate text-[11px] tabular-nums text-muted-foreground">
                        {row.totalTokens.toLocaleString("ko-KR")}토큰 ·{" "}
                        {row.calls.toLocaleString("ko-KR")}회
                      </p>
                    </li>
                  ))
                )}
              </ul>
            </div>
          ) : null}
          {tab === "gap" ? (
            <div className="space-y-2">
              <p className="text-xs leading-relaxed text-muted-foreground">
                자동으로 바꾸지 못한 요청입니다.
                <br />
                확인하면 건수에서 빠집니다.
              </p>
              <ul className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto px-1.5 py-1.5">
                {gapItems.length === 0 ? (
                  <li className="px-1 py-6 text-center text-xs text-muted-foreground">없음</li>
                ) : (
                  gapItems.map((row) => {
                    const meta = [row.practiceName, row.patientName, toothLabel(row.toothNumber)]
                      .map((part) => part.trim())
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <li key={row.id} className="rounded-lg border bg-background px-3 py-2 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={() => void openGapPreview(row)}
                          >
                            <p className="truncate text-sm font-medium text-foreground">
                              {openingId === row.id
                                ? "불러오는 중…"
                                : row.transferId || "케이스 번호 없음"}
                            </p>
                            {meta ? (
                              <p className="truncate text-xs text-muted-foreground">{meta}</p>
                            ) : null}
                          </button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 shrink-0 px-2 text-xs"
                            disabled={reviewGap.isPending}
                            onClick={() => reviewGap.mutate(row.id)}
                          >
                            확인
                          </Button>
                        </div>
                        <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-foreground">
                          {row.message}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {[CHOICE_LABEL[row.manualChoice || ""] || "답 없음", formatAt(row.createdAt)]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          ) : null}
          {tab === "logic" ? (
            <div className="space-y-2">
              <p className="text-xs leading-relaxed text-muted-foreground">
                저장된 디자인과 자동 생성의 차이입니다.
                <br />
                전후를 보고 다음 생성에 반영합니다.
              </p>
              <ul className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto px-1.5 py-1.5">
                {logicItems.length === 0 ? (
                  <li className="px-1 py-6 text-center text-xs text-muted-foreground">없음</li>
                ) : (
                  logicItems.map((row) => {
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
                          onClick={() => void openLogicPreview(row)}
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
                  })
                )}
              </ul>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      {logicPreview ? (
        <PracticeCustomAbutmentPreviewDialog
          key={logicPreview.changeId || logicPreview.transferId}
          open
          onOpenChange={(next) => {
            if (!next) setLogicPreview(null);
          }}
          authToken={token}
          caseTitle={logicPreview.transferId}
          patientName={logicPreview.patientName}
          toothWorks={normalizeToothWorks(logicPreview.toothWorks || [])}
          files={logicPreview.files || []}
          workScanFiles={logicPreview.workScanFiles || []}
          transferId={logicPreview.transferId}
          readOnly
          originTeeth={logicPreview.originTeeth || []}
          reviewDecideBusy={busyId !== "" && busyId === logicPreview.changeId}
          onReviewDecide={
            logicPreview.changeId
              ? (scope) => decideChange(logicPreview.changeId, scope)
              : undefined
          }
        />
      ) : null}
      {gapPreview ? (
        <PracticeCustomAbutmentPreviewDialog
          open
          onOpenChange={(next) => {
            if (!next) setGapPreview(null);
          }}
          authToken={token}
          caseTitle={gapPreview.transferId}
          patientName={gapPreview.patientName}
          toothWorks={normalizeToothWorks(gapPreview.toothWorks || [])}
          files={gapPreview.files || []}
          workScanFiles={gapPreview.workScanFiles || []}
          transferId={gapPreview.transferId}
          readOnly
        />
      ) : null}
    </>
  );
}

// related files:
// - web/frontend/src/pages/manufacturer/worksheet/WorksheetPage.tsx
// - web/backend/controllers/manufacturers/selfProduction.controller.js
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { useAppEventDebouncedReload } from "@/shared/realtime/useAppEventDebouncedReload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const STAGES = ["준비", "CAM", "가공", "세척.패킹", "포장.발송", "추적관리"] as const;

type SelfShipment = {
  carrier?: string;
  trackingNumber?: string;
};

type SelfRequest = {
  _id: string;
  requestId?: string;
  manufacturerStage?: string;
  createdAt?: string;
  selfShipment?: SelfShipment | null;
  caseInfos?: {
    patientName?: string;
    tooth?: string;
    clinicName?: string;
    implantManufacturer?: string;
    implantBrand?: string;
    file?: { filePath?: string; originalName?: string };
  };
  requestor?: { business?: string; name?: string } | null;
  timeline?: { estimatedShipYmd?: string; nextEstimatedShipYmd?: string };
  businessAnchorId?: { name?: string } | string | null;
};

function stageIndex(stage: string) {
  return STAGES.indexOf(stage as (typeof STAGES)[number]);
}

function orgName(row: SelfRequest) {
  const anchor = row.businessAnchorId;
  if (anchor && typeof anchor === "object" && anchor.name) return anchor.name;
  return (
    row.caseInfos?.clinicName ||
    row.requestor?.business ||
    row.requestor?.name ||
    "치과"
  );
}

function implantLabel(row: SelfRequest) {
  return [row.caseInfos?.implantManufacturer, row.caseInfos?.implantBrand]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
}

export function SelfProductionPage() {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [rows, setRows] = useState<SelfRequest[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, SelfShipment>>({});

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await apiFetch<any>({
        path: "/api/requests?page=1&limit=100&includeTotal=1&producerControl=self&view=worksheet",
        method: "GET",
        token,
      });
      const list = res.data?.data?.requests;
      setRows(Array.isArray(list) ? list : []);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useAppEventDebouncedReload({
    enabled: Boolean(token),
    eventTypes: ["request:stage-changed"],
    delayMs: 200,
    onMatch: () => load(),
  });

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const hay = [
        row.caseInfos?.patientName,
        orgName(row),
        row.caseInfos?.tooth,
        implantLabel(row),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [query, rows]);

  const patchStage = async (
    row: SelfRequest,
    manufacturerStage: string,
    shipment?: SelfShipment,
  ) => {
    if (!token) return;
    setBusyId(row._id);
    const previous = rows;
    setRows((current) =>
      current.map((item) =>
        item._id === row._id
          ? {
              ...item,
              manufacturerStage,
              ...(shipment ? { selfShipment: shipment } : {}),
            }
          : item,
      ),
    );
    const res = await apiFetch<any>({
      path: `/api/requests/${row._id}/self-production`,
      method: "PATCH",
      token,
      jsonBody: {
        manufacturerStage,
        ...(shipment || {}),
      },
    });
    setBusyId(null);
    if (manufacturerStage === "취소" && res.ok && res.data?.success) {
      setRows((current) => current.filter((item) => item._id !== row._id));
      setBusyId(null);
      return;
    }
    if (!res.ok || !res.data?.success) {
      setRows(previous);
      toast({
        title: "단계를 바꾸지 못했습니다",
        description: res.data?.message || "다시 시도해 주세요.",
        variant: "destructive",
      });
      return;
    }
    const saved = res.data?.data?.selfShipment;
    if (saved) {
      setRows((current) =>
        current.map((item) =>
          item._id === row._id ? { ...item, selfShipment: saved } : item,
        ),
      );
    }
  };

  const downloadStl = async (row: SelfRequest) => {
    if (!token) return;
    const res = await apiFetch<any>({
      path: `/api/requests/${row._id}/original-file-url`,
      method: "GET",
      token,
    });
    const url = String(res.data?.data?.url || "").trim();
    if (!res.ok || !url) {
      toast({
        title: "파일을 열지 못했습니다",
        description: res.data?.message || "STL이 없습니다.",
        variant: "destructive",
      });
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="환자, 치과, 치아, 임플란트"
        className="max-w-md"
      />
      {loading ? (
        <p className="text-sm text-slate-500">의뢰를 불러오는 중입니다.</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-slate-600">
          배정된 의뢰가 없습니다.
          <br />
          임플란트 브랜드가 이 제조사로 매칭되면 여기에 표시됩니다.
        </p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-3 overflow-y-auto px-1.5 py-1.5">
          {visible.map((row) => {
            const stage = String(row.manufacturerStage || "준비");
            const index = stageIndex(stage);
            const shipYmd = String(
              row.timeline?.nextEstimatedShipYmd ||
                row.timeline?.estimatedShipYmd ||
                "",
            ).trim();
            const draft = drafts[row._id] || {
              carrier: row.selfShipment?.carrier || "",
              trackingNumber: row.selfShipment?.trackingNumber || "",
            };
            const showTracking = stage === "포장.발송" || stage === "추적관리";
            return (
              <li
                key={row._id}
                className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {row.caseInfos?.patientName || "환자"}
                    {row.caseInfos?.tooth ? ` · ${row.caseInfos.tooth}` : ""}
                  </p>
                  <p className="truncate text-xs text-slate-500">{orgName(row)}</p>
                  <p className="truncate text-xs text-slate-500">
                    {implantLabel(row) || "임플란트 없음"}
                  </p>
                  <p className="text-xs text-slate-500">
                    출고 목표 {shipYmd || "-"} · {stage}
                  </p>
                </div>
                {stage === "준비" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busyId === row._id}
                    onClick={() => void downloadStl(row)}
                  >
                    STL 받기
                  </Button>
                ) : null}
                <div className="flex flex-wrap gap-1">
                  {STAGES.map((next, nextIndex) => (
                    <Button
                      key={next}
                      type="button"
                      size="sm"
                      variant={next === stage ? "default" : "outline"}
                      disabled={busyId === row._id || next === stage}
                      onClick={() => {
                        if (nextIndex < index && nextIndex !== index - 1) {
                          toast({
                            title: "한 칸만 되돌릴 수 있습니다",
                          });
                          return;
                        }
                        void patchStage(
                          row,
                          next,
                          next === "포장.발송" || next === "추적관리"
                            ? draft
                            : undefined,
                        );
                      }}
                    >
                      {next}
                    </Button>
                  ))}
                  {stage === "준비" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busyId === row._id}
                      onClick={() => void patchStage(row, "취소")}
                    >
                      취소
                    </Button>
                  ) : null}
                </div>
                {showTracking ? (
                  <div className="flex flex-col gap-1.5">
                    <Input
                      value={draft.carrier || ""}
                      placeholder="택배사"
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [row._id]: {
                            ...draft,
                            carrier: event.target.value,
                          },
                        }))
                      }
                    />
                    <Input
                      value={draft.trackingNumber || ""}
                      placeholder="운송장 번호"
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [row._id]: {
                            ...draft,
                            trackingNumber: event.target.value,
                          },
                        }))
                      }
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busyId === row._id}
                      onClick={() => void patchStage(row, stage, draft)}
                    >
                      운송장 저장
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

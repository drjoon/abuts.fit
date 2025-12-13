import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FunctionalItemCard } from "@/components/FunctionalItemCard";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

const DRAFT_ID_STORAGE_KEY = "abutsfit:new-request-draft-id:v1";
const DRAFT_META_KEY_PREFIX = "abutsfit:new-request-draft-meta:v1:";

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
  onEdit: _onEdit,
  onCancel,
}: Props) => {
  const { token, user } = useAuthStore();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string>("");
  const [detail, setDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const getDraftMetaKey = () => {
    const userId = (user as any)?.id;
    if (!userId) return null;
    return `${DRAFT_META_KEY_PREFIX}${String(userId)}`;
  };

  const handleCancelRequest = async (requestId: string) => {
    if (!requestId) return;
    await Promise.resolve(onCancel(requestId));
  };

  const handleEditFromDetail = async () => {
    try {
      if (!token) {
        toast({
          title: "로그인이 필요합니다",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      if (!selectedRequestId) return;

      const res = await apiFetch<any>({
        path: `/api/requests/${selectedRequestId}/clone-to-draft`,
        method: "POST",
        token,
        headers: token
          ? {
              "x-mock-role": "requestor",
            }
          : undefined,
      });

      if (!res.ok || !res.data?.data) {
        throw new Error(res.data?.message || "Draft 생성에 실패했습니다.");
      }

      const draft = res.data.data;
      const draftId = draft?._id || draft?.id;
      if (!draftId) {
        throw new Error("Draft ID가 없습니다.");
      }

      try {
        const metaKey = getDraftMetaKey();
        if (metaKey && typeof window !== "undefined") {
          const draftCaseInfos = Array.isArray(draft.caseInfos)
            ? draft.caseInfos
            : [];
          const defaultCaseInfos = draftCaseInfos[0] || {
            workType: "abutment",
          };
          const meta = {
            draftId,
            updatedAt: Date.now(),
            caseInfos: defaultCaseInfos,
            caseInfosMap: {
              __default__: {
                ...(defaultCaseInfos || {}),
                workType: "abutment",
              },
            },
          };
          window.localStorage.setItem(metaKey, JSON.stringify(meta));
          window.localStorage.setItem(DRAFT_ID_STORAGE_KEY, String(draftId));
        }
      } catch {
        // no-op
      }

      setOpen(false);
      setSelectedRequestId("");
      setDetail(null);
      navigate("/dashboard/new-request");
    } catch (err: any) {
      toast({
        title: "변경 시작 실패",
        description: err?.message || "다시 시도해주세요.",
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  const handleCancelFromDetail = async () => {
    if (!selectedRequestId) return;
    await handleCancelRequest(selectedRequestId);
    setOpen(false);
    setSelectedRequestId("");
    setDetail(null);
  };

  const selectedSummary = useMemo(() => {
    if (!selectedRequestId) return null;
    return items.find((it) => (it._id || it.id) === selectedRequestId) || null;
  }, [items, selectedRequestId]);

  useEffect(() => {
    const run = async () => {
      if (!open || !selectedRequestId) return;
      setLoadingDetail(true);
      try {
        const res = await apiFetch<any>({
          path: `/api/requests/${selectedRequestId}`,
          method: "GET",
          token,
          headers: token
            ? {
                "x-mock-role": "requestor",
              }
            : undefined,
        });

        if (res.ok && res.data?.success) {
          setDetail(res.data.data);
        } else {
          setDetail(null);
        }
      } finally {
        setLoadingDetail(false);
      }
    };
    void run();
  }, [open, selectedRequestId, token]);
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
                onClick={(e) => {
                  e.stopPropagation();
                  const reqId = item._id || item.id;
                  if (!reqId) return;
                  setSelectedRequestId(reqId);
                  setOpen(true);
                }}
                onRemove={
                  item._id || item.id
                    ? () => handleCancelRequest(item._id || (item.id as string))
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

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setSelectedRequestId("");
            setDetail(null);
          }
        }}
      >
        <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detail?.title || selectedSummary?.title || "의뢰 상세"}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-2 text-sm text-muted-foreground">
                {loadingDetail ? (
                  <div>불러오는 중...</div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="text-foreground font-medium">상태</div>
                      <div>
                        {getStatusBadge(
                          detail?.status || selectedSummary?.status || "-"
                        )}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="text-foreground font-medium">
                        케이스 정보
                      </div>
                      <div>
                        {detail?.caseInfos?.clinicName ||
                          selectedSummary?.caseInfos?.clinicName ||
                          "-"}
                        {detail?.caseInfos?.patientName ||
                        selectedSummary?.caseInfos?.patientName
                          ? ` / ${
                              detail?.caseInfos?.patientName ||
                              selectedSummary?.caseInfos?.patientName
                            }`
                          : ""}
                        {detail?.caseInfos?.tooth ||
                        selectedSummary?.caseInfos?.tooth
                          ? ` / ${
                              detail?.caseInfos?.tooth ||
                              selectedSummary?.caseInfos?.tooth
                            }`
                          : ""}
                      </div>
                      {(detail?.caseInfos?.implantSystem ||
                        selectedSummary?.caseInfos?.implantSystem) && (
                        <div>
                          {detail?.caseInfos?.implantSystem ||
                            selectedSummary?.caseInfos?.implantSystem}
                          {detail?.caseInfos?.implantType ||
                          selectedSummary?.caseInfos?.implantType
                            ? ` / ${
                                detail?.caseInfos?.implantType ||
                                selectedSummary?.caseInfos?.implantType
                              }`
                            : ""}
                        </div>
                      )}
                      {(detail?.caseInfos?.maxDiameter ||
                        selectedSummary?.caseInfos?.maxDiameter) && (
                        <div>
                          최대 직경:{" "}
                          {(
                            detail?.caseInfos?.maxDiameter ??
                            selectedSummary?.caseInfos?.maxDiameter
                          ).toFixed(1)}
                        </div>
                      )}
                    </div>

                    {detail?.price?.amount != null && (
                      <div className="space-y-1">
                        <div className="text-foreground font-medium">가격</div>
                        <div>
                          {Number(detail.price.amount || 0).toLocaleString()}원
                          {detail.price.rule ? ` (${detail.price.rule})` : ""}
                        </div>
                      </div>
                    )}

                    <div className="pt-4 flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleEditFromDetail}
                        disabled={loadingDetail}
                      >
                        의뢰 변경
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={handleCancelFromDetail}
                        disabled={loadingDetail}
                      >
                        의뢰 취소
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

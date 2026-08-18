// change-log:
// - 2026-08-18: 치과 어벗디자인 헤더 [불완전 가공 x건] + 결정 모달(대시보드에서 이전).
// related files:
// - web/frontend/src/pages/requestor/new_request/components/RequestorAbutmentPageHeader.tsx
// - web/frontend/src/pages/requestor/dashboard/RequestorDashboardPage.tsx
// - web/frontend/src/features/requests/components/StlPreviewViewer.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { StlPreviewViewer } from "@/features/requests/components/StlPreviewViewer";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { resolveImplantConnectionSpec } from "@/utils/implantConnectionSpec";
import { getFileBlob, setFileBlob } from "@/shared/files/stlIndexedDb";
import {
  fileFromModelBlob,
  modelFileBasename,
} from "@/shared/files/modelPreviewFile";
import type { PeriodFilterValue } from "@/shared/ui/PeriodFilter";

type Props = {
  period: PeriodFilterValue;
  count: number;
};

const splitUnmachinableReasons = (rawReason: unknown): string[] => {
  const text = String(rawReason || "").trim();
  if (!text) return [];
  return Array.from(
    new Set(
      text
        .split(/\s*\/\s*|\r?\n|\s*·\s*|\s*•\s*|\s*\|\s*/)
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  );
};

export const RequestorUnmachinableHost = ({ period, count }: Props) => {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const overviewQueryKey = useMemo(
    () => ["requestor-unmachinable-overview", period],
    [period],
  );

  const [open, setOpen] = useState(false);
  const [focusedRequestId, setFocusedRequestId] = useState<string | null>(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [pendingCancelIds, setPendingCancelIdsState] = useState<string[]>([]);
  const pendingCancelIdsRef = useRef<string[]>([]);
  const [approving, setApproving] = useState(false);
  const promptedFingerprintRef = useRef<string>("");
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [detailRequest, setDetailRequest] = useState<any | null>(null);

  const setPendingCancelIds = (ids: string[]) => {
    const normalized = ids.map((id) => String(id || "").trim()).filter(Boolean);
    pendingCancelIdsRef.current = normalized;
    setPendingCancelIdsState(normalized);
  };

  const clearPendingCancelIds = () => {
    pendingCancelIdsRef.current = [];
    setPendingCancelIdsState([]);
  };

  const { data: overviewResponse, isLoading } = useQuery({
    queryKey: overviewQueryKey,
    queryFn: async () => {
      const res = await apiFetch<any>({
        path: `/api/requests/unmachinable-overview?period=${period}&limit=100`,
        method: "GET",
        token,
      });
      if (!res.ok) {
        throw new Error("불완전 가공 목록 조회에 실패했습니다.");
      }
      return res.data;
    },
    enabled: Boolean(token) && (open || count > 0),
    retry: false,
    placeholderData: (previous) => previous,
  });

  const overviewItems = useMemo(() => {
    const rows = Array.isArray(overviewResponse?.data?.items)
      ? overviewResponse.data.items
      : [];
    return rows.filter((row: any) => {
      if (!row?.rnd?.unmachinableAt) return false;
      const stage = String(row?.manufacturerStage || "").trim();
      return stage !== "취소" && stage.toLowerCase() !== "cancel";
    });
  }, [overviewResponse]);

  const pendingItems = useMemo(
    () => overviewItems.filter((row: any) => !row?.rnd?.unmachinableConfirmedAt),
    [overviewItems],
  );

  const pendingIds = useMemo(
    () =>
      pendingItems
        .map((row: any) => String(row?._id || "").trim())
        .filter(Boolean),
    [pendingItems],
  );

  const pendingFingerprint = pendingIds.join(",");

  useEffect(() => {
    if (!pendingIds.length) return;
    if (!pendingFingerprint) return;
    if (promptedFingerprintRef.current === pendingFingerprint) return;
    promptedFingerprintRef.current = pendingFingerprint;
    setFocusedRequestId(null);
    clearPendingCancelIds();
    setOpen(true);
  }, [pendingFingerprint, pendingIds]);

  const focusedItem = useMemo(() => {
    const targetId = String(focusedRequestId || "").trim();
    if (targetId) {
      const match = overviewItems.find(
        (row: any) => String(row?._id || row?.id || "").trim() === targetId,
      );
      if (match) return match;
    }
    return pendingItems[0] || overviewItems[0] || null;
  }, [focusedRequestId, overviewItems, pendingItems]);

  useEffect(() => {
    let cancelled = false;
    const requestMongoId = String(
      focusedItem?._id || focusedItem?.id || "",
    ).trim();

    if (!open || !token || !requestMongoId) {
      setPreviewFile(null);
      setPreviewLoading(false);
      setPreviewError(null);
      setDetailRequest(null);
      return;
    }

    setPreviewFile(null);
    setPreviewLoading(true);
    setPreviewError(null);

    const load = async () => {
      try {
        const requestNo = String(focusedItem?.requestId || requestMongoId).trim();
        const fallbackName = `${requestNo || requestMongoId}-original.stl`;
        const cacheKey = `stl:requestor-unmachinable:${requestMongoId}:original-file-url`;

        const detailRes = await apiFetch<any>({
          path: `/api/requests/${requestMongoId}`,
          method: "GET",
          token,
        });
        const detail =
          detailRes.ok && detailRes.data?.success
            ? detailRes.data?.data || null
            : null;
        if (!cancelled) setDetailRequest(detail);

        const resolveFileName = (apiFileName?: unknown) =>
          modelFileBasename(
            apiFileName ||
              detail?.caseInfos?.file?.filePath ||
              detail?.caseInfos?.file?.originalName ||
              detail?.caseInfos?.file?.fileName ||
              focusedItem?.caseInfos?.file?.filePath ||
              focusedItem?.caseInfos?.file?.originalName ||
              fallbackName,
            fallbackName,
          );

        const cached = await getFileBlob(cacheKey);
        if (cached && !cancelled) {
          setPreviewFile(fileFromModelBlob(cached, resolveFileName()));
          setPreviewLoading(false);
          return;
        }

        const originalFileRes = await fetch(
          `/api/requests/${encodeURIComponent(requestMongoId)}/original-file-url`,
          {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          },
        );
        const originalFileBody: any = await originalFileRes.json().catch(() => ({}));
        const signedUrl = String(originalFileBody?.data?.url || "").trim();
        const fileName = resolveFileName(originalFileBody?.data?.fileName);

        if (!originalFileRes.ok || !signedUrl) {
          if (cancelled) return;
          setPreviewError("3D 모델 파일을 찾을 수 없습니다.");
          setPreviewLoading(false);
          return;
        }

        const fileRes = await fetch(signedUrl, { method: "GET" });
        if (!fileRes.ok) {
          if (cancelled) return;
          setPreviewError("3D 모델 파일을 불러오지 못했습니다.");
          setPreviewLoading(false);
          return;
        }

        const blob = await fileRes.blob();
        if (cancelled) return;
        try {
          await setFileBlob(cacheKey, blob);
        } catch {
          // ignore cache write errors
        }
        setPreviewFile(fileFromModelBlob(blob, fileName));
        setPreviewLoading(false);
      } catch (error) {
        if (cancelled) return;
        console.error("불완전 가공 3D 모델 로드 실패", error);
        setPreviewError("3D 모델 파일을 불러오지 못했습니다.");
        setPreviewLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [focusedItem, token, open]);

  const refreshOverview = () => {
    void queryClient.invalidateQueries({ queryKey: overviewQueryKey });
    void queryClient.invalidateQueries({
      queryKey: ["requestor-dashboard-cards-summary"],
    });
  };

  const markContinue = async (requestId: string): Promise<boolean> => {
    if (!token || !requestId) return false;
    setApproving(true);
    try {
      const res = await apiFetch<any>({
        path: `/api/requests/${requestId}/rnd-unmachinable/continue`,
        method: "PATCH",
        token,
      });
      if (!res.ok) {
        toast({
          title: "불완전 가공 진행 전환 실패",
          description: "처리된 의뢰가 없습니다. 잠시 후 다시 시도해주세요.",
          variant: "destructive",
          duration: 2500,
        });
        return false;
      }
      toast({
        title: "가공 계속 진행",
        description: "1건이 계속 진행으로 처리되었습니다.",
        duration: 2000,
      });
      refreshOverview();
      return true;
    } catch (error) {
      console.error("불완전 가공 진행 전환 실패", error);
      toast({
        title: "불완전 가공 진행 전환 실패",
        description: "잠시 후 다시 시도해주세요.",
        variant: "destructive",
        duration: 2500,
      });
      return false;
    } finally {
      setApproving(false);
    }
  };

  const cancelRequests = async (targetIds: string[]): Promise<number> => {
    if (!token) return 0;
    const normalizedIds = targetIds.map((id) => String(id || "").trim()).filter(Boolean);
    let canceledCount = 0;
    for (const requestId of normalizedIds) {
      const res = await apiFetch<any>({
        path: `/api/requests/${requestId}/status`,
        method: "PATCH",
        token,
        headers: { "Content-Type": "application/json" },
        jsonBody: { manufacturerStage: "취소" },
      });
      if (res.ok) canceledCount += 1;
    }
    return canceledCount;
  };

  const handleConfirmCancel = async () => {
    const cancelIds = (
      pendingCancelIds.length > 0
        ? pendingCancelIds
        : pendingCancelIdsRef.current
    )
      .map((id) => String(id || "").trim())
      .filter(Boolean);
    if (!cancelIds.length) {
      setCancelConfirmOpen(false);
      return;
    }
    setApproving(true);
    try {
      const canceledCount = await cancelRequests(cancelIds);
      if (canceledCount <= 0) {
        toast({
          title: "불완전 가공 취소 처리 실패",
          description: "취소 처리된 의뢰가 없습니다. 잠시 후 다시 시도해주세요.",
          variant: "destructive",
          duration: 2500,
        });
        return;
      }
      toast({
        title: "의뢰건 자체를 취소합니다",
        description: `${canceledCount}건이 취소 처리되었습니다.`,
        duration: 2200,
      });
      setCancelConfirmOpen(false);
      clearPendingCancelIds();
      setOpen(false);
      refreshOverview();
    } catch (error) {
      console.error("불완전 가공 취소 처리 실패", error);
      toast({
        title: "불완전 가공 취소 처리 실패",
        description: "잠시 후 다시 시도해주세요.",
        variant: "destructive",
        duration: 2500,
      });
    } finally {
      setApproving(false);
    }
  };

  const item = focusedItem as any;
  const detail = detailRequest || item;
  const requestMongoId = String(item?._id || item?.id || "").trim();
  const canDecide = Boolean(requestMongoId);
  const requestId = String(detail?.requestId || item?.requestId || "-").trim() || "-";
  const ci = detail?.caseInfos || item?.caseInfos || {};
  const reason = String(
    detail?.rnd?.unmachinableReason || item?.rnd?.unmachinableReason || "",
  ).trim();
  const reasonItems = splitUnmachinableReasons(reason);
  const implantManufacturer =
    String(ci?.implantManufacturer || detail?.implantManufacturer || "").trim() || "-";
  const implantBrand =
    String(ci?.implantBrand || detail?.implantBrand || "").trim() || "-";
  const implantFamily =
    String(ci?.implantFamily || detail?.implantFamily || "").trim() || "-";
  const implantType =
    String(ci?.implantType || detail?.implantType || "").trim() || "-";
  const clinicName = String(ci?.clinicName || detail?.clinicName || "").trim() || "-";
  const patientName = String(ci?.patientName || detail?.patientName || "").trim() || "-";
  const tooth = String(ci?.tooth || detail?.tooth || "").trim() || "-";
  const resolvedSpec = resolveImplantConnectionSpec({
    implantManufacturer,
    implantBrand,
    implantFamily,
    implantType,
    connectionDiameter: ci?.connectionDiameter,
  });
  const connectionDiameterText =
    typeof resolvedSpec.connectionDiameter === "number" &&
    Number.isFinite(resolvedSpec.connectionDiameter)
      ? resolvedSpec.connectionDiameter.toFixed(2)
      : "-";

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={
          count > 0
            ? "h-8 border-accent-muted bg-accent-soft px-3 text-xs font-semibold text-accent-strong hover:bg-accent-muted/50"
            : "h-8 px-3 text-xs"
        }
        onClick={() => {
          setFocusedRequestId(null);
          setOpen(true);
        }}
      >
        불완전 가공 {count.toLocaleString()}건
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setFocusedRequestId(null);
        }}
      >
        <DialogContent className="w-[92vw] max-w-4xl h-[64vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>불완전 가공 안내</DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="text-sm text-muted-foreground">불러오는 중...</div>
          ) : !item ? (
            <div className="text-sm text-muted-foreground">
              표시할 불완전 가공 의뢰가 없습니다.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0 overflow-hidden">
              {previewLoading ? (
                <div className="flex-1 min-h-0 rounded-md border border-dashed border-slate-300 flex items-center justify-center text-base text-slate-500">
                  원본 STL 불러오는 중...
                </div>
              ) : previewFile ? (
                <div className="flex-1 min-h-0 rounded-md border border-slate-200 overflow-hidden">
                  <StlPreviewViewer file={previewFile} showOverlay={false} />
                </div>
              ) : (
                <div className="flex-1 min-h-0 rounded-md border border-dashed border-slate-300 flex items-center justify-center text-base text-slate-500">
                  {previewError || "원본 3D 모델 파일이 없습니다."}
                </div>
              )}

              <div className="rounded-lg border border-accent-muted bg-accent-soft/60 p-3.5 flex flex-col min-h-0 overflow-hidden">
                <div className="space-y-2.5 overflow-auto pr-1">
                  <div className="text-sm text-slate-600">의뢰번호: {requestId}</div>
                  <div className="rounded-md border border-slate-200 bg-white px-3 py-2.5 space-y-2 text-sm leading-6 text-slate-800">
                    <div>
                      <span className="font-semibold">치과:</span> {clinicName}
                    </div>
                    <div>
                      <span className="font-semibold">환자:</span> {patientName}
                    </div>
                    <div>
                      <span className="font-semibold">치아번호:</span> {tooth}
                    </div>
                    <div className="break-words">
                      <span className="font-semibold">임플란트:</span>{" "}
                      {implantManufacturer} / {implantBrand} / {implantFamily} /{" "}
                      {implantType}
                    </div>
                    <div>
                      <span className="font-semibold">커넥션 직경:</span>{" "}
                      {connectionDiameterText}
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-1">
                  <div className="text-sm font-semibold text-accent-strong">
                    불완전 가공 사유
                  </div>
                  {reasonItems.length > 0 ? (
                    <div className="space-y-0.5">
                      {reasonItems.map((reasonItem, idx) => (
                        <div
                          key={`unmachinable-reason-${idx}`}
                          className="text-[15px] leading-6 text-accent-strong break-words font-medium"
                        >
                          • {reasonItem}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[15px] leading-6 text-accent-strong break-words font-medium">
                      • 미등록
                    </div>
                  )}
                </div>

                <div className="mt-auto pt-4">
                  <div className="text-sm text-right leading-6 text-slate-800">
                    해당 의뢰건을 취소할지, 그대로 진행할지 선택해주세요.
                  </div>
                  <div className="mt-3.5 flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setOpen(false)}
                      disabled={approving}
                    >
                      나중에 결정
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-destructive text-destructive hover:bg-destructive"
                      onClick={() => {
                        if (!canDecide) return;
                        setPendingCancelIds([requestMongoId]);
                        setCancelConfirmOpen(true);
                      }}
                      disabled={approving || !canDecide}
                    >
                      의뢰 취소
                    </Button>
                    <Button
                      type="button"
                      onClick={async () => {
                        if (!canDecide) return;
                        const continued = await markContinue(requestMongoId);
                        if (continued) setOpen(false);
                      }}
                      disabled={approving || !canDecide}
                    >
                      의뢰 계속 진행
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={cancelConfirmOpen}
        title="의뢰건 자체를 취소합니다"
        description="해당 불완전 가공 의뢰건을 취소 처리합니다. 계속할까요?"
        confirmLabel="취소 진행"
        cancelLabel="닫기"
        onCancel={() => {
          setCancelConfirmOpen(false);
          clearPendingCancelIds();
        }}
        onConfirm={handleConfirmCancel}
      />
    </>
  );
};

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAuthStore } from "@/store/useAuthStore";
import { StlPreviewViewer } from "@/components/StlPreviewViewer";
import { getFileBlob, setFileBlob } from "@/utils/stlIndexedDb";
import { useToast } from "@/hooks/use-toast";
import type { DiameterBucketKey } from "./WorksheetDiameterQueueBar";

export type WorksheetQueueItem = {
  id: string;
  client: string;
  patient: string;
  tooth: string;
  connectionDiameter?: number | null;
  maxDiameter?: number | null;
  camDiameter?: number | null;
  programText: string;
  qty: number;
};

export interface WorksheetDiameterQueueModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  processLabel: string; // e.g. "커스텀어벗 > 가공", "커스텀어벗 > 의뢰, CAM"
  queues: Record<DiameterBucketKey, WorksheetQueueItem[]>;
  selectedBucket: DiameterBucketKey | null;
  onSelectBucket: (bucket: DiameterBucketKey) => void;
}

export const WorksheetDiameterQueueModal = ({
  open,
  onOpenChange,
  processLabel,
  queues,
  selectedBucket,
  onSelectBucket,
}: WorksheetDiameterQueueModalProps) => {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const labels: DiameterBucketKey[] = useMemo(
    () => ["6", "8", "10", "10+"],
    [],
  );

  const effectiveBucket: DiameterBucketKey = useMemo(() => {
    if (selectedBucket && labels.includes(selectedBucket))
      return selectedBucket;
    return labels[0];
  }, [labels, selectedBucket]);

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSelectedItemId(null);
      return;
    }
    const items = queues[effectiveBucket] ?? [];
    setSelectedItemId(items[0]?.id ?? null);
  }, [open, effectiveBucket, queues]);

  const items = queues[effectiveBucket] ?? [];
  const activeItem = items.find((it) => it.id === selectedItemId) ?? null;

  const bucketCount = (queues[effectiveBucket] ?? []).length;

  const [stlFile, setStlFile] = useState<File | null>(null);
  const [stlLoading, setStlLoading] = useState(false);
  const [stlError, setStlError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!open) {
      setStlFile(null);
      setStlLoading(false);
      setStlError(null);
      return;
    }
    if (!activeItem?.id) {
      setStlFile(null);
      setStlLoading(false);
      setStlError(null);
      return;
    }
    if (!token) {
      setStlFile(null);
      setStlLoading(false);
      setStlError(null);
      return;
    }

    setStlFile(null);
    setStlError(null);
    setStlLoading(true);

    const stageText = String(processLabel || "").toLowerCase();
    const isRequestStage =
      stageText.includes("의뢰") || stageText.includes("request");
    const endpoint = isRequestStage ? "original-file-url" : "cam-file-url";
    const cacheKey = `stl:${activeItem.id}:${endpoint}`;
    const filename = isRequestStage
      ? `${activeItem.id}-original.stl`
      : `${activeItem.id}-cam.stl`;

    const blobToFile = (blob: Blob) =>
      new File([blob], filename, { type: blob.type || "model/stl" });

    const load = async () => {
      try {
        const cached = await getFileBlob(cacheKey);
        if (cached) {
          if (cancelled) return;
          setStlFile(blobToFile(cached));
          setStlLoading(false);
          toast({
            title: "STL 캐시 사용",
            description: "IndexedDB 캐시 데이터로 로드했습니다.",
            duration: 2000,
          });
          return;
        }

        const res = await fetch(
          `/api/requests/${encodeURIComponent(activeItem.id)}/${endpoint}`,
          {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          },
        );
        const body: any = await res.json().catch(() => ({}));
        const url = body?.data?.url;
        if (!res.ok || !url) {
          if (cancelled) return;
          setStlLoading(false);
          setStlError(
            isRequestStage
              ? "원본 STL 파일이 없습니다"
              : "CAM STL 파일이 없습니다",
          );
          return;
        }

        const r = await fetch(url, { method: "GET" });
        if (!r.ok) {
          if (cancelled) return;
          setStlLoading(false);
          setStlError("STL 파일을 불러오지 못했습니다");
          return;
        }
        const blob = await r.blob();
        if (cancelled) return;

        try {
          await setFileBlob(cacheKey, blob);
        } catch {
          // ignore cache errors
        }

        setStlFile(blobToFile(blob));
        setStlLoading(false);
        toast({
          title: "STL 다운로드",
          description: "S3에서 다운로드 후 캐시에 저장했습니다.",
          duration: 2000,
        });
      } catch {
        if (cancelled) return;
        setStlLoading(false);
        setStlError("STL 파일을 불러오지 못했습니다");
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, activeItem?.id, processLabel, token, toast]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[90vw] max-w-5xl h-[82vh] px-6 pt-3 pb-4 overflow-hidden
                   [&>[aria-label='Close']]:h-12 [&>[aria-label='Close']]:w-12
                   [&>[aria-label='Close']>svg]:h-12 [&>[aria-label='Close']>svg]:w-12"
      >
        <div className="flex flex-wrap items-center gap-6 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-slate-800">
              {bucketCount}건
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {labels.map((label) => (
              <button
                key={label}
                type="button"
                className={`min-w-[64px] rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
                  effectiveBucket === label
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-700 hover:border-blue-400 hover:bg-blue-50/60"
                }`}
                onClick={() => {
                  onSelectBucket(label);
                }}
              >
                {label === "10+" ? "10mm+" : `${label}mm`}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-base text-slate-700 h-full">
          <div className="flex flex-col min-h-0">
            <div className="flex-1 min-h-0 space-y-3 overflow-auto pr-1">
              {items.map((item) => {
                const active = item.id === selectedItemId;

                const line1 = (() => {
                  const parts: string[] = [];
                  if (item.client) parts.push(item.client);
                  if (item.patient) parts.push(item.patient);
                  if (item.tooth) parts.push(`치아번호 ${item.tooth}`);
                  return parts.join(" • ");
                })();

                const line2 = (() => {
                  const parts: string[] = [];
                  if (
                    typeof item.connectionDiameter === "number" &&
                    Number.isFinite(item.connectionDiameter)
                  ) {
                    parts.push(
                      `커넥션 직경 ${item.connectionDiameter.toFixed(2)}`,
                    );
                  }
                  if (
                    typeof item.maxDiameter === "number" &&
                    Number.isFinite(item.maxDiameter)
                  ) {
                    parts.push(`최대 직경 ${item.maxDiameter.toFixed(3)}`);
                  }
                  if (
                    typeof item.camDiameter === "number" &&
                    Number.isFinite(item.camDiameter)
                  ) {
                    parts.push(`CAM 직경 ${item.camDiameter.toFixed(3)}`);
                  }
                  return parts.join(" • ");
                })();

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedItemId(item.id)}
                    className={`app-surface app-surface--item w-full text-left px-5 py-4 text-lg transition-colors ${
                      active
                        ? "border-blue-400 bg-blue-50"
                        : "bg-slate-50 hover:border-blue-300 hover:bg-blue-50/60"
                    }`}
                  >
                    <div className="mt-1 text-sm font-semibold text-slate-900">
                      {line1}
                    </div>
                    <div className="mt-1 text-[13px] text-slate-600">
                      {line2}
                    </div>
                  </button>
                );
              })}
              {items.length === 0 && (
                <div className="app-surface app-surface--panel h-full min-h-[180px] flex items-center justify-center text-base text-slate-500">
                  해당 직경의 대기 의뢰가 없습니다.
                </div>
              )}
            </div>
          </div>

          <div className="app-surface app-surface--panel flex flex-col min-h-0 p-4">
            {stlLoading && (
              <div className="flex-1 flex items-center justify-center text-slate-500">
                STL 불러오는 중...
              </div>
            )}
            {!stlLoading && stlError && (
              <div className="flex-1 flex items-center justify-center text-slate-500">
                {stlError}
              </div>
            )}
            {!stlLoading && !stlError && stlFile && (
              <div className="flex-1 min-h-0">
                <StlPreviewViewer file={stlFile} showOverlay={false} />
              </div>
            )}
            {!stlLoading && !stlError && !stlFile && (
              <div className="flex-1 flex items-center justify-center text-slate-400">
                CAM STL 없음
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

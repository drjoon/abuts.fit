import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DiameterBucketKey } from "./WorksheetDiameterQueueBar";

export type WorksheetQueueItem = {
  id: string;
  client: string;
  patient: string;
  tooth: string;
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[80vw] max-w-5xl max-h-[80vh] px-6 pt-3 pb-4 overflow-y-auto
                   [&>[aria-label='Close']]:h-12 [&>[aria-label='Close']]:w-12
                   [&>[aria-label='Close']>svg]:h-12 [&>[aria-label='Close']>svg]:w-12"
      >
        <div className="flex flex-wrap items-center gap-6 mb-1">
          <span className="text-lg font-semibold text-slate-800">
            {processLabel}
          </span>
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-base text-slate-700">
          {/* STL 뷰어 자리 (모크) */}
          <div className="md:col-span-1 flex flex-col">
            <div className="app-surface app-surface--panel flex-1 min-h-[350px] border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-base text-slate-400">
              STL 뷰어 연동 예정
            </div>
          </div>

          {/* 대기 리스트 */}
          <div className="md:col-span-1 flex flex-col min-h-[220px] max-h-[420px]">
            <div className="flex-1 space-y-3 overflow-auto pr-1">
              {items.map((item) => {
                const active = item.id === selectedItemId;
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
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-slate-900">
                        {item.client}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        ID {item.id}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 text-slate-700">
                      <span>환자 {item.patient}</span>
                      <span>•</span>
                      <span>치아번호 {item.tooth}</span>
                    </div>
                  </button>
                );
              })}
              {items.length === 0 && (
                <p className="text-base text-slate-500">
                  해당 직경의 대기 의뢰가 없습니다.
                </p>
              )}
            </div>
          </div>

          {/* 선택된 항목 상세 */}
          <div className="md:col-span-1 flex flex-col min-h-[330px]">
            <div className="app-surface app-surface--panel flex-1 px-6 py-5 text-lg text-slate-700">
              {activeItem ? (
                <div className="space-y-2">
                  <div>
                    <div className="text-[10px] text-slate-500 mb-0.5">
                      기공소
                    </div>
                    <div className="text-sm font-semibold text-slate-900">
                      {activeItem.client}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[10px] text-slate-500 mb-0.5">
                        환자
                      </div>
                      <div>{activeItem.patient}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 mb-0.5">
                        치아번호
                      </div>
                      <div>{activeItem.tooth}</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 mb-0.5">
                      프로그램
                    </div>
                    <div className="text-base text-slate-700">
                      {activeItem.programText}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-slate-500 mb-0.5">
                        수량
                      </div>
                      <div className="font-semibold">{activeItem.qty}ea</div>
                    </div>
                    <div className="text-[10px] text-slate-500">
                      (모든 데이터는 mock 예시입니다)
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-base text-slate-500">
                  왼쪽 목록에서 항목을 선택하면 상세 정보가 표시됩니다.
                </p>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

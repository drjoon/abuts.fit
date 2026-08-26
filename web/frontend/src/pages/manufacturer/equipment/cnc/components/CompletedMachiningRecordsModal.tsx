// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// change-log:
// - 2026-08-26: 되돌리기 이력(rollbackCount) 취소선·흐림 표시 제거.
// - 2026-08-26: requestDeleted(샘플 삭제) 건은 스냅샷 라벨 + 되돌리기/자주검사 비활성.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/shared/ui/cn";
import { RESPONSIVE } from "@/shared/ui/responsive";
import { useAuthStore } from "@/store/useAuthStore";
import { MachiningRequestLabel } from "@/pages/manufacturer/worksheet/custom_abutment/machining/components/MachiningRequestLabel";
import { ArrowLeft } from "lucide-react";
import {
  SelfInspectionReportModal,
  type SelfInspectionReportItem,
} from "./SelfInspectionReportModal";

type CompletedMachiningItem = {
  id: string;
  machineId: string;
  requestId: string | null;
  requestMongoId?: string | null;
  /** 샘플 등 의뢰 하드삭제 — 라벨은 스냅샷, 되돌리기/자주검사 비활성 */
  requestDeleted?: boolean;
  jobId: string | null;
  status: string;
  completedAt: string | null;
  durationSeconds: number;
  displayLabel: string | null;
  rollbackCount?: number;
  clinicName?: string;
  patientName?: string;
  tooth?: string;
  lotNumber?: { value?: string } | null;
  implantManufacturer?: string | null;
  implantBrand?: string | null;
  implantFamily?: string | null;
  implantType?: string | null;
  caseInfos?: Record<string, any> | null;
  source?: string | null;
  requestCategory?: "order" | "rnd_sample" | "copied_sample" | string | null;
};

export type CompletedMachiningRecordsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  machineId: string;
  title?: string;
  pageSize?: number;
  includeRequests?: boolean;
  onRollbackRequest?: (requestId: string, machineId: string) => void;
};

export const CompletedMachiningRecordsModal = ({
  open,
  onOpenChange,
  machineId,
  title,
  pageSize = 5,
  includeRequests = false,
  onRollbackRequest,
}: CompletedMachiningRecordsModalProps) => {
  const { token } = useAuthStore();
  const [items, setItems] = useState<CompletedMachiningItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [inspectionItem, setInspectionItem] =
    useState<SelfInspectionReportItem | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const inFlightRef = useRef(false);
  const cursorRef = useRef<string | null>(null);
  const hasMoreRef = useRef(true);
  const errorRef = useRef<string | null>(null);
  const cooldownUntilRef = useRef<number>(0);

  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(() => {
    errorRef.current = error;
  }, [error]);

  const effectiveTitle = useMemo(() => {
    const mid = String(machineId || "").trim();
    return title || (mid ? `${mid} 가공 완료` : "가공 완료");
  }, [machineId, title]);

  const fetchPage = useCallback(
    async (opts?: { reset?: boolean }) => {
      if (!token) return;
      const mid = String(machineId || "").trim();
      if (!mid) return;

      const now = Date.now();
      if (now < cooldownUntilRef.current) return;
      if (inFlightRef.current) return;
      if (!opts?.reset && (!hasMoreRef.current || !!errorRef.current)) return;

      inFlightRef.current = true;
      setLoading(true);
      setError(null);
      try {
        const nextCursor = opts?.reset ? null : cursorRef.current;
        const url = new URL(
          "/api/cnc-machines/machining/completed",
          window.location.origin,
        );
        url.searchParams.set("machineId", mid);
        url.searchParams.set("limit", String(pageSize));
        if (nextCursor) url.searchParams.set("cursor", nextCursor);
        if (includeRequests) url.searchParams.set("includeRequests", "true");

        const controller = new AbortController();
        const timeoutMs = 8000;
        const timeoutId = window.setTimeout(
          () => controller.abort(),
          timeoutMs,
        );

        const fetchPromise = fetch(url.pathname + url.search, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
          signal: controller.signal,
        });

        const timeoutPromise = new Promise<Response>((_, reject) => {
          window.setTimeout(() => {
            reject(new Error("timeout"));
          }, timeoutMs + 200);
        });

        const res = await Promise.race([fetchPromise, timeoutPromise]);
        window.clearTimeout(timeoutId);
        const body: any = await res.json().catch(() => ({}));
        if (!res.ok || body?.success === false) {
          setHasMore(false);
          setError(
            body?.message || body?.error || "완료 목록을 불러오지 못했습니다.",
          );
          if (res.status === 429) {
            cooldownUntilRef.current = Date.now() + 2000;
          }
          return;
        }

        const data = body?.data ?? {};
        const list: CompletedMachiningItem[] = Array.isArray(data?.items)
          ? data.items
          : [];
        const next =
          typeof data?.nextCursor === "string" ? data.nextCursor : null;

        setItems((prev) => {
          const base = opts?.reset ? [] : prev;
          const merged = [...base, ...list];
          const uniq = new Map<string, CompletedMachiningItem>();
          for (const it of merged) {
            if (it?.id) uniq.set(String(it.id), it);
          }
          return Array.from(uniq.values());
        });
        setCursor(next);
        setHasMore(!!next);
      } catch (e: any) {
        const msg =
          e?.message === "timeout" || e?.name === "AbortError"
            ? "완료 목록 조회가 지연되어 중단했습니다. 잠시 후 다시 시도해 주세요."
            : e?.message || "완료 목록을 불러오지 못했습니다.";
        setHasMore(false);
        setError(msg);
      } finally {
        setLoading(false);
        inFlightRef.current = false;
      }
    },
    [machineId, pageSize, token, includeRequests],
  );

  useEffect(() => {
    if (!open) return;
    setItems([]);
    setCursor(null);
    setHasMore(true);
    setError(null);
    void fetchPage({ reset: true });
  }, [open, machineId, fetchPage]);

  useEffect(() => {
    if (!open) return;
    const handleRollback = () => {
      setItems([]);
      setCursor(null);
      setHasMore(true);
      setError(null);
      void fetchPage({ reset: true });
    };

    window.addEventListener("request-rollback", handleRollback);
    return () => {
      window.removeEventListener("request-rollback", handleRollback);
    };
  }, [open, fetchPage]);

  useEffect(() => {
    if (!open) return;
    if (!sentinelRef.current) return;
    const el = sentinelRef.current;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        if (!hasMoreRef.current) return;
        if (inFlightRef.current) return;
        if (Date.now() < cooldownUntilRef.current) return;
        if (errorRef.current) return;
        void fetchPage();
      },
      { root: null, threshold: 1 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [open, hasMore, loading, fetchPage]);

  const formatRow = (it: CompletedMachiningItem) => {
    const done = it.completedAt ? new Date(it.completedAt) : null;
    const hhmm = done
      ? `${String(done.getMonth() + 1).padStart(2, "0")}-${String(
          done.getDate(),
        ).padStart(
          2,
          "0",
        )} ${String(done.getHours()).padStart(2, "0")}:${String(
          done.getMinutes(),
        ).padStart(2, "0")}`
      : "-";

    const sec =
      typeof it.durationSeconds === "number" && it.durationSeconds >= 0
        ? Math.floor(it.durationSeconds)
        : null;
    const mmss =
      sec == null
        ? "-"
        : `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(
            sec % 60,
          ).padStart(2, "0")}`;

    const lotRaw = String((it as any)?.lotNumber?.value || "")
      .trim()
      .replace(/^CA(P)?/i, "");
    const clinic = String((it as any)?.clinicName || "").trim();
    const patient = String((it as any)?.patientName || "").trim();
    const tooth = String((it as any)?.tooth || "").trim();
    const rid = String(it.requestId || "").trim();

    return { hhmm, mmss, clinic, patient, tooth, rid, lotRaw };
  };

  const formattedItems = useMemo(
    () => items.map((it) => formatRow(it)),
    [items],
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn(
            "flex max-h-[78vh] flex-col gap-0 overflow-hidden rounded-2xl border border-slate-200/80 p-0 shadow-[0_24px_64px_rgba(15,23,42,0.28)]",
            RESPONSIVE.dialogContentFull,
            "sm:max-w-3xl",
          )}
        >
          <DialogHeader className="shrink-0 border-b border-slate-100 px-5 py-4 sm:px-6">
            <DialogTitle className="text-lg font-bold tracking-tight text-slate-900">
              {effectiveTitle}
            </DialogTitle>
            <p className="mt-0.5 text-xs font-normal text-slate-500">
              완료 기록 · 자주검사 · 되돌리기
            </p>
          </DialogHeader>

          <div className="mt-0 flex min-h-0 flex-1 flex-col gap-1.5 overflow-auto px-5 pt-4 pb-8 sm:px-6">
            {!!error && (
              <div className="rounded-xl border border-destructive-muted bg-destructive-soft p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {items.length === 0 && !loading && (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
                표시할 완료 기록이 없습니다.
              </div>
            )}

            {formattedItems.map((row, index) => {
              const item = items[index];
              const requestDeleted = Boolean(item?.requestDeleted);
              const canActOnRequest = Boolean(row.rid) && !requestDeleted;
              return (
                <div
                  key={item.id}
                  role={canActOnRequest ? "button" : undefined}
                  tabIndex={canActOnRequest ? 0 : undefined}
                  className={cn(
                    "rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition-colors",
                    canActOnRequest
                      ? "hover:bg-slate-50 cursor-pointer"
                      : "cursor-default",
                    requestDeleted && "opacity-80",
                  )}
                  onClick={() => {
                    if (!canActOnRequest) return;
                    setInspectionItem({
                      requestId: item.requestId!,
                      requestMongoId: item.requestMongoId,
                      clinicName: item.clinicName,
                      patientName: item.patientName,
                      tooth: item.tooth,
                      lotNumber: item.lotNumber?.value,
                      completedAt: item.completedAt,
                      implantManufacturer: item.implantManufacturer ?? undefined,
                      implantBrand: item.implantBrand ?? undefined,
                      implantFamily: item.implantFamily ?? undefined,
                      implantType: item.implantType ?? undefined,
                    });
                    setInspectionOpen(true);
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-medium text-slate-500">
                        종료 {row.hhmm}
                        <span className="ml-3">소요 {row.mmss}</span>
                        {requestDeleted ? (
                          <span className="ml-3 text-slate-400">삭제됨</span>
                        ) : null}
                      </div>
                      <div className="mt-0.5">
                        <MachiningRequestLabel
                          density="compact"
                          clinicName={row.clinic}
                          patientName={row.patient}
                          tooth={row.tooth}
                          requestId={row.rid}
                          lotShortCode={row.lotRaw.slice(-3).toUpperCase()}
                          caseInfos={(item as any)?.caseInfos}
                          isSample={(() => {
                            const category = String(
                              (item as any)?.requestCategory || "",
                            ).trim();
                            return (
                              category === "rnd_sample" ||
                              category === "copied_sample" ||
                              requestDeleted
                            );
                          })()}
                          isRndArchivedSample={
                            String(
                              (item as any)?.requestCategory || "",
                            ).trim() === "rnd_sample"
                          }
                          hideRequestId
                        />
                      </div>
                    </div>
                    {canActOnRequest && onRollbackRequest ? (
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRollbackRequest(row.rid, machineId);
                        }}
                        title="준비로 되돌리기"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}

            <div ref={sentinelRef} className="h-6" />

            {loading && (
              <div className="py-2 text-center text-sm text-slate-500">
                불러오는 중...
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <SelfInspectionReportModal
        open={inspectionOpen}
        onOpenChange={setInspectionOpen}
        item={inspectionItem}
      />
    </>
  );
};

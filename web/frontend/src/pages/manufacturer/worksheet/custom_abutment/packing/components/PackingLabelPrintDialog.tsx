// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/components/PackingPageContent.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/utils/packLabelZip.ts
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/utils/packLabelRenderer.ts
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/shared/ui/cn";
import type { ManufacturerRequest } from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";
import {
  renderPackLabelToCanvas,
  type PackLabelBranding,
} from "../utils/packLabelRenderer";
import { buildPackLabelRenderOptions } from "../utils/packLabelZip";
import { LabelPrinterField } from "./LabelPrinterField";

type Scope = "unprinted" | "printed" | "all";

const requestIdOf = (req: ManufacturerRequest) => String(req._id || "").trim();

const isPrintedRequest = (req: ManufacturerRequest) =>
  Boolean((req as { shippingLabelPrinted?: { printed?: boolean } }).shippingLabelPrinted?.printed);

const caseText = (req: ManufacturerRequest, key: "patientName" | "clinicName" | "tooth") =>
  String((req.caseInfos as Record<string, unknown> | undefined)?.[key] || "").trim();

const lotSuffix = (req: ManufacturerRequest) => {
  const lot = String(
    (req.lotNumber as { value?: string } | undefined)?.value || "",
  ).trim();
  if (lot.length <= 3) return lot;
  return lot.slice(-3);
};

export function PackingLabelPrintDialog({
  open,
  onOpenChange,
  requests,
  printer,
  onPrinterChange,
  printerOptions,
  printerLoading,
  printerError,
  onRefreshPrinters,
  packLabelDpi,
  packLabelDots,
  packLabelDesignDots,
  branding,
  printing,
  onPrint,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requests: ManufacturerRequest[];
  printer: string;
  onPrinterChange: (value: string) => void;
  printerOptions: string[];
  printerLoading: boolean;
  printerError: string | null;
  onRefreshPrinters: () => void;
  packLabelDpi: number;
  packLabelDots?: { pw: number; ll: number };
  packLabelDesignDots?: { pw: number; ll: number; dpi: number };
  branding?: PackLabelBranding | null;
  printing: boolean;
  onPrint: (requests: ManufacturerRequest[]) => Promise<boolean>;
}) {
  const [scope, setScope] = useState<Scope>("unprinted");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [focusId, setFocusId] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const requestsRef = useRef(requests);
  requestsRef.current = requests;

  const unprinted = useMemo(
    () => requests.filter((req) => requestIdOf(req) && !isPrintedRequest(req)),
    [requests],
  );
  const printed = useMemo(
    () => requests.filter((req) => requestIdOf(req) && isPrintedRequest(req)),
    [requests],
  );
  const visible = scope === "unprinted" ? unprinted : scope === "printed" ? printed : requests.filter((req) => requestIdOf(req));

  const idsFor = (next: Scope) => {
    const source = next === "unprinted" ? unprinted : next === "printed" ? printed : requests;
    return source.map(requestIdOf).filter(Boolean);
  };

  useEffect(() => {
    if (!open) return;
    const valid = new Set(requests.map(requestIdOf).filter(Boolean));
    setSelectedIds((prev) => {
      const next = prev.filter((id) => valid.has(id));
      return next.length === prev.length ? prev : next;
    });
    setFocusId((prev) => (prev && valid.has(prev) ? prev : ""));
  }, [open, requests]);

  useEffect(() => {
    if (!open) return;
    const current = requestsRef.current;
    const ids = current
      .filter((req) => requestIdOf(req) && !isPrintedRequest(req))
      .map(requestIdOf);
    setScope("unprinted");
    setSelectedIds(ids);
    setFocusId(ids[0] || "");
  }, [open]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedRequests = useMemo(
    () => requests.filter((req) => selectedIdSet.has(requestIdOf(req))),
    [requests, selectedIdSet],
  );
  const focusIndex = Math.max(
    0,
    visible.findIndex((req) => requestIdOf(req) === focusId),
  );
  const focusReq = visible.find((req) => requestIdOf(req) === focusId) || visible[0] || null;

  useEffect(() => {
    if (!open || !focusReq) {
      setPreviewUrl("");
      setPreviewError("");
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setPreviewUrl("");
    setPreviewLoading(true);
    setPreviewError("");
    const previewDpi = packLabelDesignDots?.dpi || Math.min(packLabelDpi || 203, 203);
    const previewDots = packLabelDesignDots
      ? { pw: packLabelDesignDots.pw, ll: packLabelDesignDots.ll }
      : packLabelDots;
    void (async () => {
      try {
        const canvas = await renderPackLabelToCanvas(
          buildPackLabelRenderOptions({
            req: focusReq,
            packLabelDpi: previewDpi,
            packLabelDots: previewDots,
            packLabelDesignDots,
            branding,
          }),
        );
        if (cancelled) return;
        setPreviewUrl(canvas.toDataURL("image/png"));
      } catch (error) {
        if (cancelled) return;
        setPreviewUrl("");
        setPreviewError(
          error instanceof Error ? error.message : "미리보기를 만들 수 없습니다.",
        );
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    branding,
    focusReq,
    open,
    packLabelDesignDots,
    packLabelDots,
    packLabelDpi,
  ]);

  const applyScope = (next: Scope) => {
    const ids = idsFor(next);
    setScope(next);
    setSelectedIds(ids);
    setFocusId(ids[0] || "");
  };

  const toggleId = (id: string) => {
    setFocusId(id);
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    );
  };

  const stepFocus = (delta: number) => {
    if (!visible.length) return;
    const current = visible.findIndex((req) => requestIdOf(req) === focusId);
    const base = current >= 0 ? current : 0;
    const next = Math.min(visible.length - 1, Math.max(0, base + delta));
    setFocusId(requestIdOf(visible[next]));
  };

  const handlePrint = async () => {
    if (!selectedRequests.length || printing || !printer.trim()) return;
    const ok = await onPrint(selectedRequests);
    if (ok) onOpenChange(false);
  };

  const focusPatient = focusReq ? caseText(focusReq, "patientName") : "";
  const focusTooth = focusReq ? caseText(focusReq, "tooth") : "";
  const focusCaption = [focusPatient, focusTooth ? `#${focusTooth}` : ""]
    .filter(Boolean)
    .join(" · ");

  const scopes: { id: Scope; label: string; count: number }[] = [
    { id: "unprinted", label: "미출력", count: unprinted.length },
    { id: "printed", label: "기출력", count: printed.length },
    { id: "all", label: "전체", count: requests.filter((req) => requestIdOf(req)).length },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeTabIndex={-1}
        className="max-h-[calc(100vh-2rem)] overflow-y-auto border-stone-200 bg-white shadow-2xl sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>패킹 라벨</DialogTitle>
          <DialogDescription>
            출력할 의뢰를 고르면 라벨을 미리 봅니다.
            <br />
            확인하면 선택한 프린터로 출력합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-2xl bg-[#efeae2] px-6 py-5">
          {previewLoading && !previewUrl ? (
            <div className="mx-auto aspect-[80/65] w-full max-w-[22rem] animate-pulse rounded-sm bg-white/80 shadow-[0_12px_28px_rgba(41,37,36,0.12)]" />
          ) : previewUrl ? (
            <img
              src={previewUrl}
              alt={focusCaption ? `${focusCaption} 패킹 라벨 미리보기` : "패킹 라벨 미리보기"}
              className="mx-auto block h-auto w-full max-w-[22rem] bg-white shadow-[0_12px_28px_rgba(41,37,36,0.16)]"
            />
          ) : (
            <div className="mx-auto flex aspect-[80/65] w-full max-w-[22rem] items-center justify-center bg-white/70 px-6 text-center text-sm text-stone-500 shadow-[0_12px_28px_rgba(41,37,36,0.08)]">
              {previewError || "의뢰를 고르면 라벨이 보입니다."}
            </div>
          )}
          <div className="mt-3 flex items-center justify-center gap-2">
            <button
              type="button"
              aria-label="이전 라벨"
              disabled={visible.length < 2 || focusIndex <= 0}
              onClick={() => stepFocus(-1)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-stone-600 hover:bg-white/70 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="min-w-0 truncate text-center text-[0.7rem] font-medium tracking-[0.08em] text-stone-500">
              {visible.length
                ? `${Math.min(focusIndex + 1, visible.length)} / ${visible.length}${focusCaption ? ` · ${focusCaption}` : ""}`
                : "80 × 65 mm"}
            </p>
            <button
              type="button"
              aria-label="다음 라벨"
              disabled={visible.length < 2 || focusIndex >= visible.length - 1}
              onClick={() => stepFocus(1)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-stone-600 hover:bg-white/70 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {visible.length ? (
            <p className="mt-1 text-center text-[0.7rem] font-medium tracking-[0.16em] text-stone-400">
              80 × 65 mm
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-xl bg-stone-100 p-1" role="tablist" aria-label="패킹 라벨 선택">
            {scopes.map((item) => {
              const active = scope === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => applyScope(item.id)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                    active
                      ? "bg-white text-stone-900 shadow-sm"
                      : "text-stone-500 hover:text-stone-800",
                  )}
                >
                  {item.label}
                  <span className="ml-1 tabular-nums text-stone-400">{item.count}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setSelectedIds([])}
            disabled={!selectedIds.length || printing}
            className="rounded-lg px-2 py-1 text-xs font-medium text-stone-500 hover:bg-stone-100 hover:text-stone-800 disabled:opacity-40"
          >
            해제
          </button>
        </div>

        <ul className="max-h-44 overflow-y-auto rounded-2xl bg-stone-50 px-1.5 py-1.5">
          {visible.length === 0 ? (
            <li className="px-2 py-6 text-center text-sm text-stone-500">
              {scope === "unprinted"
                ? "미출력 의뢰가 없습니다."
                : scope === "printed"
                  ? "기출력 의뢰가 없습니다."
                  : "의뢰가 없습니다."}
            </li>
          ) : (
            visible.map((req) => {
              const id = requestIdOf(req);
              const checked = selectedIdSet.has(id);
              const focused = focusReq ? requestIdOf(focusReq) === id : false;
              const patient = caseText(req, "patientName") || "환자 없음";
              const tooth = caseText(req, "tooth");
              const clinic = caseText(req, "clinicName");
              const suffix = lotSuffix(req);
              return (
                <li key={id} className="py-0.5">
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-2 py-1.5",
                      focused
                        ? "border-stone-900 bg-white shadow-sm"
                        : "border-transparent hover:bg-white",
                    )}
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      aria-label={`${patient} 선택`}
                      onClick={() => toggleId(id)}
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                        checked
                          ? "border-stone-900 bg-stone-900 text-white"
                          : "border-stone-300 bg-white text-transparent",
                      )}
                    >
                      <Check className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setFocusId(id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-stone-900">
                          {patient}
                          {tooth ? ` · #${tooth}` : ""}
                        </span>
                        {suffix ? (
                          <span className="shrink-0 font-mono text-xs tracking-widest text-stone-500">
                            {suffix}
                          </span>
                        ) : null}
                      </div>
                      {clinic ? (
                        <div className="truncate text-xs text-stone-500">{clinic}</div>
                      ) : null}
                    </button>
                    {isPrintedRequest(req) ? (
                      <span className="shrink-0 text-[10px] font-medium text-stone-400">
                        출력됨
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })
          )}
        </ul>

        <LabelPrinterField
          value={printer}
          onChange={onPrinterChange}
          options={printerOptions}
          loading={printerLoading}
          error={printerError}
          onRefresh={onRefreshPrinters}
        />

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={printing}
            className="rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void handlePrint()}
            disabled={printing || selectedRequests.length === 0 || !printer.trim()}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-semibold",
              printing || selectedRequests.length === 0 || !printer.trim()
                ? "cursor-not-allowed bg-stone-100 text-stone-400"
                : "bg-stone-900 text-white hover:bg-stone-800",
            )}
          >
            {printing
              ? "출력 중..."
              : selectedRequests.length > 0
                ? `출력 ${selectedRequests.length}장`
                : "출력"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

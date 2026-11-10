// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/components/PackingPageContent.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/utils/vialStickerLabel.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/shared/hooks/use-toast";
import { cn } from "@/shared/ui/cn";
import { ABUTS_PACKING_SCREW_TYPES } from "@/shared/practice/screwSupply";
import { buildVialStickerZpl, paintVialSticker } from "../utils/vialStickerLabel";

const parseQty = (value: string | undefined) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return 0;
  const n = Number.parseInt(digits, 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(99, n);
};

const resolveZm400 = (printers: string[], selected: string) => {
  const named = printers.find((name) => /ZM-?400/i.test(name));
  return named || selected.trim() || "";
};

export function VialStickerPrintDialog({
  open,
  onOpenChange,
  token,
  printerProfile,
  printerOptions,
  dpi,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token?: string | null;
  printerProfile: string;
  printerOptions: string[];
  dpi: number;
}) {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [previewType, setPreviewType] = useState<string>(ABUTS_PACKING_SCREW_TYPES[0]);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (open) return;
    setQty({});
    setPreviewType(ABUTS_PACKING_SCREW_TYPES[0]);
    setPrinting(false);
  }, [open]);

  const setPreviewCanvas = useCallback(
    (node: HTMLCanvasElement | null) => {
      canvasRef.current = node;
      if (!node) return;
      paintVialSticker(node, { screwType: previewType, dpi });
    },
    [dpi, previewType],
  );

  const jobs = useMemo(
    () =>
      ABUTS_PACKING_SCREW_TYPES.map((type) => ({
        type,
        count: parseQty(qty[type]),
      })).filter((job) => job.count > 0),
    [qty],
  );
  const total = jobs.reduce((sum, job) => sum + job.count, 0);

  const handlePrint = async () => {
    if (!jobs.length || printing) return;
    setPrinting(true);
    const printer = resolveZm400(printerOptions, printerProfile);
    try {
      for (const job of jobs) {
        const canvas = document.createElement("canvas");
        paintVialSticker(canvas, { screwType: job.type, dpi });
        const zpl = buildVialStickerZpl(canvas, job.count);
        const response = await fetch("/api/requests/packing/print-zpl", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            printer: printer || undefined,
            copies: 1,
            title: `Vial sticker ${job.type}`,
            zpl,
          }),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.success) {
          throw new Error(
            data?.message || `${job.type} 출력에 실패했습니다.`,
          );
        }
      }
      const summary = jobs.map((job) => `${job.type} ${job.count}장`).join(", ");
      toast({
        title: "공병 스티커 출력",
        description: `${summary}을 출력했습니다.`,
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "공병 스티커 출력 실패",
        description:
          error instanceof Error ? error.message : "출력에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl border-stone-200 bg-white shadow-2xl">
        <DialogHeader>
          <DialogTitle>공병 스티커</DialogTitle>
          <DialogDescription>
            장수를 넣은 타입만 출력합니다.
            <br />
            오른쪽 끝 3mm는 겹쳐 붙입니다.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-2xl bg-[#efeae2] px-6 py-5">
          <canvas
            ref={setPreviewCanvas}
            className="mx-auto block aspect-[5/2] h-auto w-full max-w-[28rem] bg-white shadow-[0_12px_28px_rgba(41,37,36,0.16)]"
            aria-label={`${previewType} 공병 스티커 미리보기`}
          />
          <p className="mt-3 text-center text-[0.7rem] font-medium tracking-[0.16em] text-stone-500">
            50 × 20 mm
          </p>
        </div>

        <div className="grid grid-cols-5 gap-2 px-0.5 py-0.5">
          {ABUTS_PACKING_SCREW_TYPES.map((type) => {
            const active = previewType === type;
            const count = parseQty(qty[type]);
            return (
              <div
                key={type}
                className={cn(
                  "rounded-2xl border px-1.5 py-2",
                  active
                    ? "border-stone-900 bg-white shadow-sm"
                    : count > 0
                      ? "border-stone-300 bg-white"
                      : "border-transparent bg-stone-50",
                )}
              >
                <button
                  type="button"
                  onClick={() => setPreviewType(type)}
                  className="block w-full text-center text-base font-semibold tracking-tight text-stone-900"
                >
                  {type}
                </button>
                <Input
                  inputMode="numeric"
                  value={qty[type] ?? ""}
                  placeholder="0"
                  maxLength={2}
                  aria-label={`${type} 장수`}
                  onFocus={() => setPreviewType(type)}
                  onChange={(event) => {
                    setPreviewType(type);
                    setQty((prev) => ({
                      ...prev,
                      [type]: event.target.value.replace(/\D/g, "").slice(0, 2),
                    }));
                  }}
                  className="mt-1.5 h-8 px-1 text-center tabular-nums"
                />
              </div>
            );
          })}
        </div>

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
            disabled={printing || total === 0}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-semibold",
              printing || total === 0
                ? "cursor-not-allowed bg-stone-100 text-stone-400"
                : "bg-stone-900 text-white hover:bg-stone-800",
            )}
          >
            {printing ? "출력 중..." : total > 0 ? `출력 ${total}장` : "출력"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

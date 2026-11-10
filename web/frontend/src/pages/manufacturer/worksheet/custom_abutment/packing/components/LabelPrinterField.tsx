// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/components/VialStickerPrintDialog.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/packing/components/PackingLabelPrintDialog.tsx
import { ChevronDown } from "lucide-react";
import { cn } from "@/shared/ui/cn";

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  loading: boolean;
  error: string | null;
  className?: string;
};

export function LabelPrinterField({
  value,
  onChange,
  options,
  loading,
  error,
  className,
}: Props) {
  const listed =
    value && !options.includes(value) ? [value, ...options] : options;

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <div className="relative w-44 shrink-0">
        <select
          value={value}
          title={value || "프린터"}
          aria-label="프린터"
          disabled={loading}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-full appearance-none truncate rounded-lg border border-stone-200 bg-stone-50 pl-3 pr-8 text-sm text-stone-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] outline-none transition focus:border-stone-400 focus:bg-white focus:ring-2 focus:ring-stone-900/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <option value={value}>{value || "프린터"}</option>
          ) : (
            <>
              <option value="">프린터</option>
              {listed.map((printer) => (
                <option key={printer} value={printer} title={printer}>
                  {printer}
                </option>
              ))}
            </>
          )}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
      </div>
      {error ? (
        <p className="shrink-0 text-xs font-medium text-destructive" title={error}>
          프린터 조회 불가
        </p>
      ) : !loading && options.length === 0 ? (
        <p className="shrink-0 text-xs text-stone-500">프린터 없음</p>
      ) : null}
    </div>
  );
}

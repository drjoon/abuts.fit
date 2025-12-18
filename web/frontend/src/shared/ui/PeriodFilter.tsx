import { cn } from "@/lib/utils";

export type PeriodFilterValue = "7d" | "30d" | "90d" | "all";

type Props = {
  value: PeriodFilterValue;
  onChange: (value: PeriodFilterValue) => void;
  label?: string;
  className?: string;
};

export const PeriodFilter = ({
  value,
  onChange,
  label = "기간",
  className,
}: Props) => {
  const labelMap: Record<PeriodFilterValue, string> = {
    "7d": "최근 7일",
    "30d": "최근 30일",
    "90d": "최근 90일",
    all: "전체",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border bg-muted p-1 text-xs",
        className
      )}
    >
      <span className="px-2 text-muted-foreground">{label}</span>
      {(Object.keys(labelMap) as PeriodFilterValue[]).map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          className={cn(
            "rounded-md px-2.5 py-1 text-[11px] transition-colors",
            value === k
              ? "bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground hover:bg-muted"
          )}
        >
          {labelMap[k]}
        </button>
      ))}
    </div>
  );
};

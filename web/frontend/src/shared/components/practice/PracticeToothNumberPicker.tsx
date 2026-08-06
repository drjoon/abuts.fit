// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
import { useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/shared/ui/cn";

type PracticeToothNumberPickerProps = {
  value: string;
  onChange: (toothNumber: string) => void;
  tensOptions: readonly string[];
  onesOptions: readonly string[];
  className?: string;
};

const parseTens = (value: string) => {
  const raw = String(value || "").trim();
  return /^[1-4]$/.test(raw.slice(0, 1)) ? raw.slice(0, 1) : "";
};

const parseOnes = (value: string) => {
  const raw = String(value || "").trim();
  return /^[1-8]$/.test(raw.slice(1, 2)) ? raw.slice(1, 2) : "";
};

export const PracticeToothNumberPicker = ({
  value,
  onChange,
  tensOptions,
  onesOptions,
  className,
}: PracticeToothNumberPickerProps) => {
  const [open, setOpen] = useState(false);
  const [draftTens, setDraftTens] = useState(() => parseTens(value));
  const [draftOnes, setDraftOnes] = useState(() => parseOnes(value));

  useEffect(() => {
    if (!open) return;
    setDraftTens(parseTens(value));
    setDraftOnes(parseOnes(value));
  }, [open, value]);

  const committed = /^[1-4][1-8]$/.test(String(value || "").trim())
    ? String(value).trim()
    : "";
  const display = committed
    ? committed
    : open && draftTens && draftOnes
      ? `${draftTens}${draftOnes}`
      : open && draftTens
        ? `${draftTens}-`
        : open && draftOnes
          ? `-${draftOnes}`
          : "--";

  const pickTens = (digit: string) => {
    setDraftTens(digit);
    if (draftOnes) {
      onChange(`${digit}${draftOnes}`);
      setOpen(false);
    }
  };

  const pickOnes = (digit: string) => {
    setDraftOnes(digit);
    if (draftTens) {
      onChange(`${draftTens}${digit}`);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-md border border-input bg-background tabular-nums shadow-sm hover:bg-accent",
            "h-8 w-10 px-1 text-sm",
            !committed && "text-muted-foreground",
            className,
          )}
          aria-label="치아번호 선택"
        >
          {display}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto p-2"
        sideOffset={6}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-start gap-1">
          <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
            {tensOptions.map((digit) => {
              const selected = draftTens === digit;
              return (
                <button
                  key={`tens-${digit}`}
                  type="button"
                  className={cn(
                    "inline-flex h-8 w-9 items-center justify-center rounded-md text-sm tabular-nums transition-colors",
                    selected
                      ? "bg-sky-600 font-semibold text-white"
                      : "hover:bg-accent",
                  )}
                  onClick={() => pickTens(digit)}
                >
                  {digit}
                </button>
              );
            })}
          </div>

          <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
            {onesOptions.map((digit) => {
              const selected = draftOnes === digit;
              return (
                <button
                  key={`ones-${digit}`}
                  type="button"
                  className={cn(
                    "inline-flex h-8 w-9 items-center justify-center rounded-md text-sm tabular-nums transition-colors",
                    selected
                      ? "bg-sky-600 font-semibold text-white"
                      : "hover:bg-accent",
                  )}
                  onClick={() => pickOnes(digit)}
                >
                  {digit}
                </button>
              );
            })}
          </div>
        </div>
        {draftTens || draftOnes || committed ? (
          <button
            type="button"
            className="mt-2 w-full rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => {
              setDraftTens("");
              setDraftOnes("");
              onChange("");
              setOpen(false);
            }}
          >
            지우기
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
};

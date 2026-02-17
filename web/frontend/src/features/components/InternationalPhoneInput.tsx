import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/shared/ui/cn";
import { Check, ChevronsUpDown } from "lucide-react";

export type InternationalPhoneParts = {
  dialCode: string;
  nationalNumber: string;
};

type CountryDialCode = {
  country: string;
  dialCode: string;
};

export const COUNTRY_DIAL_CODES: CountryDialCode[] = [
  { country: "Korea", dialCode: "82" },
  { country: "United States", dialCode: "1" },
  { country: "Canada", dialCode: "1" },
  { country: "Japan", dialCode: "81" },
  { country: "China", dialCode: "86" },
  { country: "Hong Kong", dialCode: "852" },
  { country: "Taiwan", dialCode: "886" },
  { country: "Singapore", dialCode: "65" },
  { country: "Vietnam", dialCode: "84" },
  { country: "Thailand", dialCode: "66" },
  { country: "Philippines", dialCode: "63" },
  { country: "Indonesia", dialCode: "62" },
  { country: "Malaysia", dialCode: "60" },
  { country: "India", dialCode: "91" },
  { country: "Australia", dialCode: "61" },
  { country: "New Zealand", dialCode: "64" },
  { country: "United Kingdom", dialCode: "44" },
  { country: "France", dialCode: "33" },
  { country: "Germany", dialCode: "49" },
  { country: "Spain", dialCode: "34" },
  { country: "Italy", dialCode: "39" },
  { country: "Netherlands", dialCode: "31" },
  { country: "Sweden", dialCode: "46" },
  { country: "Norway", dialCode: "47" },
  { country: "Denmark", dialCode: "45" },
  { country: "Finland", dialCode: "358" },
  { country: "Switzerland", dialCode: "41" },
];

const digitsOnly = (value: string) => value.replace(/\D/g, "");

export const normalizeE164FromParts = (
  dialCode: string,
  nationalNumber: string
) => {
  const dc = digitsOnly(dialCode);
  let nn = digitsOnly(nationalNumber);
  if (dc === "82" && nn.startsWith("0")) {
    nn = nn.slice(1);
  }
  if (!dc || !nn) return "";
  return `+${dc}${nn}`;
};

export const splitE164ToParts = (
  value: string,
  defaultDialCode: string = "82"
): InternationalPhoneParts => {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return { dialCode: defaultDialCode, nationalNumber: "" };
  }

  const normalized = trimmed.replace(/[()\s.-]/g, "");
  const plus = normalized.startsWith("00")
    ? `+${normalized.slice(2)}`
    : normalized;

  if (!plus.startsWith("+")) {
    return { dialCode: defaultDialCode, nationalNumber: digitsOnly(plus) };
  }

  const digits = digitsOnly(plus);
  const sorted = [...COUNTRY_DIAL_CODES].sort(
    (a, b) => b.dialCode.length - a.dialCode.length
  );
  const found = sorted.find((c) => digits.startsWith(c.dialCode));
  if (!found) {
    return { dialCode: defaultDialCode, nationalNumber: digits.slice(0, 15) };
  }
  return {
    dialCode: found.dialCode,
    nationalNumber: digits.slice(found.dialCode.length),
  };
};

export const isValidE164 = (value: string) => {
  if (!value) return true;
  if (!/^\+\d+$/.test(value)) return false;
  const digits = value.slice(1);
  return digits.length >= 7 && digits.length <= 15;
};

type Props = {
  value: InternationalPhoneParts;
  onChange: (next: InternationalPhoneParts) => void;
  invalid?: boolean;
  error?: string;
  disabled?: boolean;
  dialButtonClassName?: string;
  inputClassName?: string;
};

export function InternationalPhoneInput({
  value,
  onChange,
  invalid,
  error,
  disabled,
  dialButtonClassName,
  inputClassName,
}: Props) {
  const [open, setOpen] = useState(false);

  const countryLabel = useMemo(() => {
    return (
      COUNTRY_DIAL_CODES.find((c) => c.dialCode === value.dialCode)?.country ||
      "Country"
    );
  }, [value.dialCode]);

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              className={cn(
                "w-[210px] justify-between",
                invalid
                  ? "border-destructive focus-visible:ring-destructive"
                  : "",
                dialButtonClassName
              )}
            >
              <span className="truncate">
                +{value.dialCode} {countryLabel}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[320px] p-0" align="start">
            <Command>
              <CommandInput placeholder="국가 검색..." />
              <CommandList>
                <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>
                <CommandGroup>
                  {COUNTRY_DIAL_CODES.map((c) => {
                    const itemValue = `${c.country} ${c.dialCode}`;
                    const selected = c.dialCode === value.dialCode;
                    return (
                      <CommandItem
                        key={`${c.country}-${c.dialCode}`}
                        value={itemValue}
                        onSelect={() => {
                          onChange({ ...value, dialCode: c.dialCode });
                          setOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            selected ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <span className="flex-1 truncate">{c.country}</span>
                        <span className="text-muted-foreground">
                          +{c.dialCode}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <Input
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="전화번호"
          disabled={disabled}
          value={value.nationalNumber}
          className={cn(
            "flex-1",
            invalid ? "border-destructive focus-visible:ring-destructive" : "",
            inputClassName
          )}
          onChange={(e) =>
            onChange({ ...value, nationalNumber: e.target.value })
          }
        />
      </div>

      {!!error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

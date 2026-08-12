// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { Button } from "@/components/ui/button";
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
import { Check, ChevronsUpDown, Search, UserPlus } from "lucide-react";
import { cn } from "@/shared/ui/cn";

interface BusinessSearchSectionProps {
  businessSearch: string;
  setBusinessSearch: (value: string) => void;
  businessSearchResults: {
    _id: string;
    name: string;
    representativeName?: string;
    businessNumber?: string;
    address?: string;
  }[];
  selectedBusiness: {
    _id: string;
    name: string;
    representativeName?: string;
    businessNumber?: string;
    address?: string;
  } | null;
  setSelectedBusiness: (business: any) => void;
  businessOpen: boolean;
  setBusinessOpen: (open: boolean) => void;
  joinLoading: boolean;
  onJoinRequest: () => void;
}

export const BusinessSearchSection = ({
  businessSearch,
  setBusinessSearch,
  businessSearchResults,
  selectedBusiness,
  setSelectedBusiness,
  businessOpen,
  setBusinessOpen,
  joinLoading,
  onJoinRequest,
}: BusinessSearchSectionProps) => {
  const getBusinessLabel = (b: { name: string; businessNumber?: string }) => {
    const name = String(b?.name || "").trim();
    const bn = String(b?.businessNumber || "").trim();
    return bn ? `${name} (${bn})` : name;
  };

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 sm:p-5 space-y-4">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white ring-1 ring-slate-200/80">
          <Search className="h-4 w-4 text-primary-strong" />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-900">기존 사업자 가입</p>
          <p className="text-xs text-muted-foreground">
            소속할 사업자를 검색해 신청합니다
          </p>
        </div>
      </div>

      <Popover open={businessOpen} onOpenChange={setBusinessOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={businessOpen}
            disabled={joinLoading}
            className="h-11 w-full justify-between rounded-xl bg-white/80"
          >
            <span className="truncate text-left">
              {selectedBusiness
                ? getBusinessLabel(selectedBusiness)
                : "사업자를 검색해서 선택하세요"}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(420px,calc(100vw-2rem))] p-0">
          <Command>
            <CommandInput
              placeholder="사업자명/대표자명/주소 검색..."
              value={businessSearch}
              onValueChange={(v) => {
                setBusinessSearch(v);
                setSelectedBusiness(null);
              }}
            />
            <CommandList>
              <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>
              <CommandGroup>
                {businessSearchResults.map((b) => {
                  const selected = selectedBusiness?._id === b._id;
                  const rep = String(b.representativeName || "").trim();
                  const bn = String(b.businessNumber || "").trim();
                  const addr = String(b.address || "").trim();
                  const meta = [rep ? `대표: ${rep}` : "", bn ? bn : "", addr]
                    .filter(Boolean)
                    .join(" · ");
                  const searchValue = [b.name, rep, bn, b._id, addr]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <CommandItem
                      key={b._id}
                      value={searchValue}
                      onSelect={() => {
                        setSelectedBusiness(b);
                        setBusinessOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          selected ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm">
                          {getBusinessLabel(b)}
                        </div>
                        {!!meta && (
                          <div className="truncate text-xs text-muted-foreground">
                            {meta}
                          </div>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          className="h-10 rounded-xl"
          onClick={() => {
            setBusinessSearch("");
            setSelectedBusiness(null);
            setBusinessOpen(false);
          }}
          disabled={joinLoading}
        >
          초기화
        </Button>
        <Button
          type="button"
          className="h-10 gap-1.5 rounded-xl"
          onClick={onJoinRequest}
          disabled={joinLoading || !selectedBusiness?._id}
        >
          <UserPlus className="h-4 w-4" />
          {joinLoading ? "신청 중..." : "소속 신청"}
        </Button>
      </div>
    </section>
  );
};

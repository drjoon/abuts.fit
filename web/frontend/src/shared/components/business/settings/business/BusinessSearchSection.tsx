import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { Check, ChevronsUpDown } from "lucide-react";
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
    <div className="space-y-5">
      <div className="flex gap-2 justify-center">
        <Popover open={businessOpen} onOpenChange={setBusinessOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={businessOpen}
              disabled={joinLoading}
            >
              <span className="truncate">
                {selectedBusiness
                  ? getBusinessLabel(selectedBusiness)
                  : "사업자를 검색해서 선택하세요"}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[420px] p-0">
            <Command>
              <CommandInput
                placeholder="사업자명/대표자명/사업자번호/주소 검색..."
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
                    const meta = [
                      rep ? `대표: ${rep}` : "",
                      bn ? `사업자: ${bn}` : "",
                      addr ? addr : "",
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    const searchValue = [b.name, rep, bn, addr]
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
                          <div className="text-sm truncate">
                            {getBusinessLabel(b)}
                          </div>
                          {!!meta && (
                            <div className="text-xs text-muted-foreground truncate">
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
      </div>
      <div className="flex gap-2 justify-center">
        <Button
          type="button"
          variant="outline"
          size="sm"
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
          variant="default"
          size="sm"
          onClick={onJoinRequest}
          disabled={joinLoading || !selectedBusiness?._id}
        >
          {joinLoading ? "신청 중..." : "소속 신청"}
        </Button>
      </div>
    </div>
  );
};

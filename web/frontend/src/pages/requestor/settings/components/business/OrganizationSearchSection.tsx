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

interface OrganizationSearchSectionProps {
  orgSearch: string;
  setOrgSearch: (value: string) => void;
  orgSearchResults: {
    _id: string;
    name: string;
    representativeName?: string;
    businessNumber?: string;
    address?: string;
  }[];
  selectedOrg: {
    _id: string;
    name: string;
    representativeName?: string;
    businessNumber?: string;
    address?: string;
  } | null;
  setSelectedOrg: (org: any) => void;
  orgOpen: boolean;
  setOrgOpen: (open: boolean) => void;
  joinLoading: boolean;
  onJoinRequest: () => void;
}

export const OrganizationSearchSection = ({
  orgSearch,
  setOrgSearch,
  orgSearchResults,
  selectedOrg,
  setSelectedOrg,
  orgOpen,
  setOrgOpen,
  joinLoading,
  onJoinRequest,
}: OrganizationSearchSectionProps) => {
  const getOrgLabel = (o: { name: string; businessNumber?: string }) => {
    const name = String(o?.name || "").trim();
    const bn = String(o?.businessNumber || "").trim();
    return bn ? `${name} (${bn})` : name;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="md:col-span-2 space-y-2">
        <Label>기공소 선택</Label>
        <Popover open={orgOpen} onOpenChange={setOrgOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={orgOpen}
              className="w-full justify-between"
              disabled={joinLoading}
            >
              <span className="truncate">
                {selectedOrg
                  ? getOrgLabel(selectedOrg)
                  : "기공소를 검색해서 선택하세요"}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[520px] p-0" align="start">
            <Command>
              <CommandInput
                placeholder="기공소명/대표자명/사업자번호/주소 검색..."
                value={orgSearch}
                onValueChange={(v) => {
                  setOrgSearch(v);
                  setSelectedOrg(null);
                }}
              />
              <CommandList>
                <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>
                <CommandGroup>
                  {orgSearchResults.map((o) => {
                    const selected = selectedOrg?._id === o._id;
                    const rep = String(o.representativeName || "").trim();
                    const bn = String(o.businessNumber || "").trim();
                    const addr = String(o.address || "").trim();
                    const meta = [
                      rep ? `대표: ${rep}` : "",
                      bn ? `사업자: ${bn}` : "",
                      addr ? addr : "",
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    const searchValue = [o.name, rep, bn, addr]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <CommandItem
                        key={o._id}
                        value={searchValue}
                        onSelect={() => {
                          setSelectedOrg(o);
                          setOrgOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            selected ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <div className="min-w-0">
                          <div className="text-sm truncate">
                            {getOrgLabel(o)}
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
      <div className="space-y-2">
        <Label className="opacity-0">신청</Label>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={onJoinRequest}
          disabled={joinLoading || !selectedOrg?._id}
        >
          {joinLoading ? "신청 중..." : "소속 신청"}
        </Button>
      </div>
    </div>
  );
};

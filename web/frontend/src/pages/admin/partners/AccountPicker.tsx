// change-log:
// - 2026-08-17: 사업영역 계정·사업자 검색 피커.
// related files:
// - web/frontend/src/pages/admin/partners/DepartmentRoster.tsx
import { useEffect, useState } from "react";
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
import { ChevronsUpDown, Plus } from "lucide-react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { partnerRoleLabel } from "./partnerShare";

export type UserPickItem = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type BusinessPickItem = {
  id: string;
  name: string;
  businessNumber?: string;
  businessType?: string;
};

export function AccountPicker({
  excludedIds,
  onPick,
  label = "계정 검색 후 추가…",
  compact = false,
}: {
  excludedIds: Set<string>;
  onPick: (user: UserPickItem) => void;
  label?: string;
  compact?: boolean;
}) {
  const { token } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<UserPickItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !token) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: "1",
          limit: "50",
          active: "true",
        });
        const q = search.trim();
        if (q) params.set("search", q);
        const res = await request<{
          success?: boolean;
          data?: {
            users?: Array<{
              _id?: string;
              name?: string;
              email?: string;
              originalEmail?: string;
              role?: string;
            }>;
          };
        }>({
          path: `/api/admin/users?${params.toString()}`,
          method: "GET",
          token,
        });
        if (cancelled || !res.ok) return;
        const raw = res.data?.data?.users || [];
        setUsers(
          raw
            .filter((item) => item?._id)
            .map((item) => ({
              id: String(item._id),
              name: String(item.name || "").trim() || "이름 없음",
              email: String(item.originalEmail || item.email || "").trim(),
              role: String(item.role || ""),
            })),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, search, token]);

  const available = users.filter((user) => !excludedIds.has(user.id));

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={
            compact
              ? "h-7 w-full justify-between rounded-lg border-slate-200 bg-white px-2 text-[12px] hover:bg-slate-50"
              : "h-10 w-full justify-between rounded-xl border-slate-200 bg-white hover:bg-slate-50"
          }
        >
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Plus className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
            {label}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(28rem,calc(100vw-2rem))] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="이름·이메일 검색"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>{loading ? "검색 중…" : "검색 결과가 없습니다."}</CommandEmpty>
            <CommandGroup>
              {available.map((user) => (
                <CommandItem
                  key={user.id}
                  value={`${user.name} ${user.email} ${user.id}`}
                  onSelect={() => {
                    onPick(user);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm">{user.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {partnerRoleLabel(user.role)}
                      {user.email ? ` · ${user.email}` : ""}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function BusinessPicker({
  excludedIds,
  onPick,
  compact = false,
}: {
  excludedIds: Set<string>;
  onPick: (business: BusinessPickItem) => void;
  compact?: boolean;
}) {
  const { token } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<BusinessPickItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !token) return;
    const q = search.trim();
    if (!q) {
      setItems([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await request<{
          success?: boolean;
          data?: Array<{
            _id?: string;
            name?: string;
            businessNumber?: string;
            businessType?: string;
          }>;
        }>({
          path: `/api/businesses/search?q=${encodeURIComponent(q)}&businessType=all`,
          method: "GET",
          token,
        });
        if (cancelled || !res.ok) return;
        const raw = Array.isArray(res.data?.data) ? res.data.data : [];
        setItems(
          raw
            .filter((item) => item?._id)
            .map((item) => ({
              id: String(item._id),
              name: String(item.name || "").trim() || "이름 없음",
              businessNumber: String(item.businessNumber || "").trim(),
              businessType: String(item.businessType || "").trim(),
            })),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, search, token]);

  const available = items.filter((item) => !excludedIds.has(item.id));

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={
            compact
              ? "h-8 rounded-lg border-slate-200 px-2.5 text-[12px]"
              : "h-10 rounded-xl border-slate-200 bg-white hover:bg-slate-50"
          }
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          사업자
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(28rem,calc(100vw-2rem))] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="사업자명·사업자번호 검색"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {loading
                ? "검색 중…"
                : search.trim()
                  ? "검색 결과가 없습니다."
                  : "사업자명을 입력하세요."}
            </CommandEmpty>
            <CommandGroup>
              {available.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${item.name} ${item.businessNumber} ${item.id}`}
                  onSelect={() => {
                    onPick(item);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm">{item.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[item.businessType, item.businessNumber]
                        .filter(Boolean)
                        .join(" · ") || "사업자"}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

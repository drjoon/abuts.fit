// 채팅 헤더 담당 기사. 작업시작 계정이 기본이고, 수행 기공소가 같은 계정으로 바꾼다.
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";

import { apiFetch } from "@/shared/api/apiClient";
import type { LabTechnician } from "@/shared/practice/labTechnician";
import { useAuthStore } from "@/store/useAuthStore";
import { cn } from "@/shared/ui/cn";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type LabMember = {
  id: string;
  name: string;
  subRole?: string | null;
};

type ColleaguesResponse = {
  success?: boolean;
  data?: { colleagues?: LabMember[] };
};

const initialOf = (name: string) => {
  const trimmed = String(name || "").trim();
  return trimmed ? trimmed.slice(0, 1) : "?";
};

const roleLabel = (subRole?: string | null) => {
  if (subRole === "owner") return "대표";
  if (subRole === "staff") return "직원";
  return "";
};

type LabTechnicianAssignControlProps = {
  technician: LabTechnician | null;
  canAssign: boolean;
  busy?: boolean;
  token?: string | null;
  onAssign?: (member: LabMember) => void;
};

export function LabTechnicianAssignControl({
  technician,
  canAssign,
  busy = false,
  token = null,
  onAssign,
}: LabTechnicianAssignControlProps) {
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [colleagues, setColleagues] = useState<LabMember[]>([]);

  useEffect(() => {
    if (!open || !canAssign || !token) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const res = await apiFetch<ColleaguesResponse>({
          path: "/api/auth/colleagues",
          method: "GET",
          token,
        });
        if (cancelled) return;
        const list = Array.isArray(res.data?.data?.colleagues)
          ? res.data.data.colleagues
          : [];
        setColleagues(
          list
            .map((row) => ({
              id: String(row.id || "").trim(),
              name: String(row.name || "").trim(),
              subRole: row.subRole ? String(row.subRole) : null,
            }))
            .filter((row) => row.id && row.name),
        );
      } catch {
        if (!cancelled) setColleagues([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [open, canAssign, token]);

  const allMembers = useMemo(() => {
    const self: LabMember | null = user?.id
      ? {
          id: String(user.id),
          name: String(user.name || "").trim() || "나",
          subRole: user.subRole ? String(user.subRole) : null,
        }
      : null;
    const rest = colleagues.filter((row) => row.id !== self?.id);
    const rank = (sub?: string | null) =>
      sub === "owner" ? 0 : sub === "staff" ? 1 : 2;
    rest.sort((a, b) => {
      const d = rank(a.subRole) - rank(b.subRole);
      if (d !== 0) return d;
      return a.name.localeCompare(b.name, "ko");
    });
    return self ? [self, ...rest] : rest;
  }, [colleagues, user?.id, user?.name, user?.subRole]);
  const members = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allMembers;
    return allMembers.filter((row) => row.name.toLowerCase().includes(q));
  }, [allMembers, query]);

  const name = String(technician?.name || "").trim();
  const label = name || "지정";
  const selectedId = String(technician?.userId || "").trim();

  const chip = (
    <span
      className={cn(
        "inline-flex h-7 max-w-[13rem] items-center gap-1.5 rounded-full border bg-white pl-1 pr-2 text-left shadow-sm",
        canAssign
          ? "border-slate-200 transition hover:border-primary/35 hover:bg-primary-soft/50"
          : "border-slate-200/80",
        busy && "opacity-70",
      )}
    >
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[0.625rem] font-semibold text-primary">
        {busy ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          initialOf(name)
        )}
      </span>
      <span className="min-w-0 truncate text-xs leading-none">
        <span className="text-muted-foreground">담당</span>{" "}
        <span className="font-medium text-foreground">{label}</span>
      </span>
      {canAssign ? (
        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
      ) : null}
    </span>
  );

  if (!canAssign || !onAssign) {
    return (
      <span className="shrink-0" title={name ? `담당 기사 ${name}` : "담당 기사"} data-no-drag>
        {chip}
      </span>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={name ? `담당 기사 ${name}` : "담당 기사 지정"}
          title={name ? `담당 기사 ${name}` : "담당 기사 지정"}
          disabled={busy}
          data-no-drag
        >
          {chip}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-60 p-1.5"
        data-no-drag
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <p className="px-2 pb-1 pt-1 text-xs font-medium text-foreground">
          담당 기사
        </p>
        {allMembers.length > 6 ? (
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="이름"
            className="mb-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        ) : null}
        <div className="max-h-64 overflow-y-auto px-0.5 py-0.5">
          {loading && members.length === 0 ? (
            <div className="flex items-center justify-center py-4 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : members.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              같은 기공소 계정이 없습니다.
            </p>
          ) : (
            members.map((member) => {
              const selected = member.id === selectedId;
              const sub = roleLabel(member.subRole);
              const mine = member.id === String(user?.id || "");
              return (
                <button
                  key={member.id}
                  type="button"
                  disabled={busy}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-50",
                    selected && "bg-primary-soft/70",
                  )}
                  onClick={() => {
                    setOpen(false);
                    setQuery("");
                    if (member.id !== selectedId) onAssign(member);
                  }}
                >
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                    {initialOf(member.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {member.name}
                    </span>
                    {sub || mine ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {[sub, mine ? "나" : ""].filter(Boolean).join(" · ")}
                      </span>
                    ) : null}
                  </span>
                  {selected ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

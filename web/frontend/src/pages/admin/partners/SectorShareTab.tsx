// change-log:
// - 2026-08-17: 사업부·파트너 개인 배분 UI — 최소지급·배분비·실지급(세전).
// related files:
// - web/frontend/src/pages/admin/partners/AdminPartnersPage.tsx
// - web/frontend/src/pages/admin/partners/partnerShare.ts
// - web/frontend/src/pages/admin/partners/PartnerShareContext.tsx
// - web/frontend/src/pages/admin/partners/RevenueShareTab.tsx
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Briefcase,
  ChevronsUpDown,
  CircleHelp,
  FlaskConical,
  Handshake,
  Landmark,
  Megaphone,
  Plus,
  Users,
  X,
} from "lucide-react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { usePartnerShare } from "./PartnerShareContext";
import {
  SECTOR_META,
  formatPercent,
  formatWon,
  memberGrossPayout,
  memberShareAmount,
  partnerRoleLabel,
  sectorPoolAmount,
  sumMemberPercents,
  type SectorKey,
} from "./partnerShare";

const SECTOR_ICON = {
  labUnit: FlaskConical,
  salesUnit: Briefcase,
  labPartner: Handshake,
  salesPartner: Megaphone,
} as const;

type UserPickItem = {
  id: string;
  name: string;
  email: string;
  role: string;
};

function FieldHelp({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:text-slate-600"
          aria-label="도움말"
        >
          <CircleHelp className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-left leading-relaxed">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

function initials(name: string) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return "?";
  return trimmed.slice(0, 1);
}

export function SectorShareTab({ sectorKey }: { sectorKey: SectorKey }) {
  const { token } = useAuthStore();
  const { state, addMember, updateMember, removeMember } = usePartnerShare();
  const meta = SECTOR_META[sectorKey];
  const Icon = SECTOR_ICON[sectorKey];
  const members = state.members[sectorKey];
  const sectorAmount = sectorPoolAmount(
    state.previewPool,
    state.rates[sectorKey],
  );
  const usedPercent = sumMemberPercents(members);
  const remainPercent = Math.round((100 - usedPercent) * 10) / 10;
  const overflow = usedPercent > 100;
  const isDepartment = meta.kind === "department";

  const payouts = useMemo(
    () =>
      members.map((member) => {
        const shareAmount = memberShareAmount(
          sectorAmount,
          member.sharePercent,
        );
        const gross = memberGrossPayout({
          kind: meta.kind,
          shareAmount,
          monthlyMinimum: member.monthlyMinimum,
        });
        return { userId: member.userId, shareAmount, gross };
      }),
    [members, meta.kind, sectorAmount],
  );

  const grossTotal = payouts.reduce((sum, item) => sum + item.gross, 0);
  const minGuaranteeOver =
    isDepartment && grossTotal > sectorAmount && sectorAmount > 0;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<UserPickItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  useEffect(() => {
    if (!pickerOpen || !token) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoadingUsers(true);
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
        if (!cancelled) setLoadingUsers(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pickerOpen, search, token]);

  const selectedIds = useMemo(
    () => new Set(members.map((item) => item.userId)),
    [members],
  );
  const availableUsers = users.filter((user) => !selectedIds.has(user.id));

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-medium text-slate-500">
            전체 수익분배비
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
              {formatPercent(state.rates[sectorKey])}
            </span>
            <span className="text-[12px] text-muted-foreground">분배 재원 대비</span>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-medium text-slate-500">
              분배금액
            </span>
            <FieldHelp text="수익분배 탭의 미리보기 재원 × 이 섹터 분배비입니다. 실제 지급 시에는 어벗츠 매출 − 제조사 생산비로 산출됩니다." />
          </div>
          <div className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
            {formatWon(sectorAmount)}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-medium text-slate-500">실지급 합계</div>
          <div className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
            {formatWon(grossTotal)}
          </div>
          <div className="mt-1 text-[12px] text-muted-foreground">
            세전 · 세금 설정 후 세후 적용
          </div>
        </div>
      </div>

      {minGuaranteeOver ? (
        <div className="rounded-2xl border border-accent-muted/70 bg-accent-soft/70 px-4 py-3 text-[13px] leading-relaxed text-accent-strong">
          최소지급액 때문에 실지급 합계가 이 섹터 분배금액을 넘습니다.
        </div>
      ) : null}

      <Card className="app-glass-card app-glass-card--lg overflow-hidden">
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ring-1 ${meta.iconTone}`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0 space-y-1">
                <h3 className="text-base font-semibold tracking-tight text-slate-900">
                  {isDepartment ? "사업부원" : "파트너"}
                </h3>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  {meta.description}{" "}
                  {isDepartment
                    ? "실지급은 max(매달 최소지급액, 수익배분액)입니다."
                    : "실지급은 수익 배분비에 따른 금액입니다."}
                </p>
              </div>
            </div>
            <div
              className={`rounded-full px-3 py-1 text-[12px] font-semibold tabular-nums ring-1 ${
                overflow
                  ? "bg-destructive-soft text-destructive ring-destructive/30"
                  : "bg-slate-100 text-slate-600 ring-slate-200"
              }`}
            >
              배분 합계 {formatPercent(usedPercent)}
              {overflow
                ? " · 100% 초과"
                : ` · 잔여 ${formatPercent(Math.max(0, remainPercent))}`}
            </div>
          </div>

          {members.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-10 text-center">
              <Users className="mb-2 h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-700">
                아직 추가된 계정이 없습니다
              </p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                아래에서 계정을 검색해 {meta.label}에 추가하세요.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {members.map((member) => {
                const payout = payouts.find(
                  (item) => item.userId === member.userId,
                );
                const shareAmount = payout?.shareAmount || 0;
                const gross = payout?.gross || 0;
                const usedMin =
                  isDepartment && gross > shareAmount && member.monthlyMinimum > 0;
                return (
                  <div
                    key={member.userId}
                    className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-slate-100 text-sm font-semibold text-slate-600">
                            {initials(member.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-900">
                            {member.name}
                          </div>
                          <div className="truncate text-[12px] text-muted-foreground">
                            {partnerRoleLabel(member.role)}
                            {member.email ? ` · ${member.email}` : ""}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeMember(sectorKey, member.userId)}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        aria-label="제거"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div
                      className={`mt-4 grid gap-3 ${
                        isDepartment ? "sm:grid-cols-2" : "sm:grid-cols-1"
                      }`}
                    >
                      {isDepartment ? (
                        <div>
                          <Label
                            htmlFor={`min-${member.userId}`}
                            className="mb-1.5 block text-[11px] font-medium text-slate-500"
                          >
                            매달 최소지급액
                          </Label>
                          <div className="relative">
                            <Input
                              id={`min-${member.userId}`}
                              type="number"
                              min="0"
                              step="10000"
                              className="h-10 rounded-xl border-slate-200 bg-slate-50/60 pr-9 text-right font-semibold tabular-nums"
                              value={member.monthlyMinimum}
                              onChange={(event) =>
                                updateMember(sectorKey, member.userId, {
                                  monthlyMinimum: Number(event.target.value),
                                })
                              }
                            />
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">
                              원
                            </span>
                          </div>
                        </div>
                      ) : null}
                      <div>
                        <Label
                          htmlFor={`pct-${member.userId}`}
                          className="mb-1.5 block text-[11px] font-medium text-slate-500"
                        >
                          {meta.label} 내 배분비
                        </Label>
                        <div className="relative">
                          <Input
                            id={`pct-${member.userId}`}
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            className="h-10 rounded-xl border-slate-200 bg-slate-50/60 pr-9 text-right font-semibold tabular-nums"
                            value={member.sharePercent}
                            onChange={(event) =>
                              updateMember(sectorKey, member.userId, {
                                sharePercent: Number(event.target.value),
                              })
                            }
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">
                            %
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <div className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200/70">
                        <div className="text-[11px] text-slate-500">수익배분액</div>
                        <div className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
                          {formatWon(shareAmount)}
                        </div>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200/70">
                        <div className="text-[11px] text-slate-500">
                          실지급 (세전)
                          {usedMin ? (
                            <span className="ml-1 text-accent-strong">최소보장</span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
                          {formatWon(gross)}
                        </div>
                      </div>
                      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2">
                        <div className="text-[11px] text-slate-500">실지급 (세후)</div>
                        <div className="mt-0.5 text-[12px] font-medium text-muted-foreground">
                          세금 설정 후 적용
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <Popover
            open={pickerOpen}
            onOpenChange={(open) => {
              setPickerOpen(open);
              if (!open) setSearch("");
            }}
          >
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={pickerOpen}
                className="h-11 w-full justify-between rounded-xl border-slate-200 bg-white hover:bg-slate-50 sm:max-w-md"
              >
                <span className="inline-flex items-center gap-2 text-muted-foreground">
                  <Plus className="h-4 w-4" />
                  계정 검색 후 추가…
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
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
                  <CommandEmpty>
                    {loadingUsers ? "검색 중…" : "검색 결과가 없습니다."}
                  </CommandEmpty>
                  <CommandGroup>
                    {availableUsers.map((user) => (
                      <CommandItem
                        key={user.id}
                        value={`${user.name} ${user.email} ${user.id}`}
                        onSelect={() => {
                          addMember(sectorKey, {
                            userId: user.id,
                            name: user.name,
                            email: user.email,
                            role: user.role,
                            sharePercent: 0,
                            monthlyMinimum: 0,
                          });
                          setPickerOpen(false);
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
        </CardContent>
      </Card>

      <div className="flex items-start gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-3.5">
        <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          실제 지급 금액은 세법에 따른 세금을 제한 세후 금액입니다. 세금 설정은
          수익분배 탭에서 이후 추가됩니다.
        </p>
      </div>
    </div>
  );
}

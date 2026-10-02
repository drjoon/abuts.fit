/**
 * 기공의뢰수신 — PC 알람 설정(전체·치과별).
 * related files:
 * - web/frontend/src/shared/practice/labReceiveSoundPrefs.ts
 * - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
 * - web/frontend/src/pages/practice/components/LabReceiveUnreadNotice.tsx
 * change-log:
 * - 2026-10-03: 헤더 데모 뱃지 왼쪽 — 전체 on/off + 치과별 리스트.
 */
import { useEffect, useMemo, useState } from "react";
import { Search, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/shared/ui/cn";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import {
  LAB_RECEIVE_SOUND_PREFS_CHANGED_EVENT,
  getLabReceiveSoundPrefs,
  setLabReceivePracticeMuted,
  setLabReceiveSoundEnabled,
  type LabReceiveSoundPrefs,
} from "@/shared/practice/labReceiveSoundPrefs";

export type LabReceiveAlarmPracticeOption = {
  id: string;
  name: string;
};

type LabReceiveAlarmSettingsButtonProps = {
  practices?: readonly LabReceiveAlarmPracticeOption[];
  className?: string;
};

function useLabReceiveSoundPrefsState(): LabReceiveSoundPrefs {
  const [prefs, setPrefs] = useState<LabReceiveSoundPrefs>(() =>
    getLabReceiveSoundPrefs(),
  );

  useEffect(() => {
    const sync = () => setPrefs(getLabReceiveSoundPrefs());
    window.addEventListener(LAB_RECEIVE_SOUND_PREFS_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(LAB_RECEIVE_SOUND_PREFS_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return prefs;
}

export function LabReceiveAlarmSettingsButton({
  practices = [],
  className,
}: LabReceiveAlarmSettingsButtonProps) {
  const { token } = useAuthStore();
  const prefs = useLabReceiveSoundPrefsState();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [partnerPractices, setPartnerPractices] = useState<
    LabReceiveAlarmPracticeOption[]
  >([]);

  useEffect(() => {
    if (!open || !token) return;
    let cancelled = false;
    void (async () => {
      const res = await request<{
        data?: {
          items?: Array<{
            practiceAnchorId?: string | null;
            practiceName?: string;
            status?: string;
          }>;
        };
      }>({
        path: "/api/lab-trading-partners",
        method: "GET",
        token,
      });
      if (cancelled || !res.ok) return;
      const items = Array.isArray(res.data?.data?.items)
        ? res.data.data.items
        : [];
      const next: LabReceiveAlarmPracticeOption[] = [];
      for (const row of items) {
        const id = String(row.practiceAnchorId || "").trim();
        if (!id) continue;
        const name = String(row.practiceName || "").trim() || "치과";
        next.push({ id, name });
      }
      setPartnerPractices(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, token]);

  const mergedPractices = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of practices) {
      const id = String(row.id || "").trim();
      if (!id) continue;
      map.set(id, String(row.name || "").trim() || map.get(id) || "치과");
    }
    for (const row of partnerPractices) {
      const id = String(row.id || "").trim();
      if (!id) continue;
      if (!map.has(id)) map.set(id, String(row.name || "").trim() || "치과");
    }
    // 음소거만 남아 있는 치과도 목록에 보이게
    for (const id of prefs.mutedPracticeIds) {
      if (!map.has(id)) map.set(id, "치과");
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [practices, partnerPractices, prefs.mutedPracticeIds]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return mergedPractices;
    return mergedPractices.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        row.id.toLowerCase().includes(q),
    );
  }, [mergedPractices, search]);

  const globalOn = prefs.enabled;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  "h-9 w-9 shrink-0 rounded-full border-slate-200 bg-white p-0 shadow-sm",
                  !globalOn && "text-slate-400",
                  className,
                )}
                aria-label="알림 설정"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">알림 설정</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        className="w-[min(100vw-1.5rem,20rem)] gap-0 overflow-hidden p-0"
      >
        <div className="border-b border-slate-100 px-3 py-2.5">
          <p className="text-sm font-semibold text-slate-900">알림 설정</p>
          <p className="mt-0.5 text-xs text-slate-500">
            PC 연결 프로그램으로도 울립니다.
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">전체 치과</p>
            <p className="text-xs text-slate-500">의뢰·채팅 알림</p>
          </div>
          <Switch
            checked={globalOn}
            onCheckedChange={(checked) => setLabReceiveSoundEnabled(checked)}
            aria-label="전체 치과 알림"
          />
        </div>
        <div
          className={cn(
            "border-t border-slate-100 px-3 py-2",
            !globalOn && "pointer-events-none opacity-45",
          )}
        >
          <p className="mb-1.5 text-xs font-medium text-slate-600">치과별</p>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="치과명 검색"
              className="h-8 pl-8 text-sm"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto px-0.5 py-0.5">
            {filtered.length === 0 ? (
              <li className="px-1 py-6 text-center text-xs text-slate-500">
                표시할 치과가 없습니다.
              </li>
            ) : (
              filtered.map((row) => {
                const muted = prefs.mutedPracticeIds.includes(row.id);
                const checked = !muted;
                return (
                  <li key={row.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 hover:bg-slate-50">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => {
                          setLabReceivePracticeMuted(row.id, value !== true);
                        }}
                        aria-label={`${row.name} 알림`}
                      />
                      <span className="min-w-0 truncate text-sm text-slate-800">
                        {row.name}
                      </span>
                    </label>
                  </li>
                );
              })
            )}
          </ul>
          <p className="mt-1 text-[11px] leading-snug text-slate-500">
            체크를 끄면 해당 치과 알림만 받지 않습니다.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

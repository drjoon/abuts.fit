// change-log:
// - 2026-08-14: 타입(헥스 사이즈) 관리자 수정·자동저장. 치과 프리셋에 반영.
// - 2026-08-14: CNC어벗=Primary, 환봉어벗=어벗 골드. 선택 전에도 색으로 구분.
// - 2026-08-14: 도입 전 CNC어벗/환봉어벗 선택 필수. 선택값이 치과 단가에 반영.
// - 2026-08-14: 되돌리기 버튼 제거. 도입 체크 해제가 해제 동작.
// - 2026-08-14: 섹션 제목을「어벗 추가 요청」으로 변경. 요금·크레딧에서는 독립 카드로 표시.
// - 2026-08-14: 요금·크레딧에 임베드 시 작은제목(제조사 추가요청)만 쓰고 큰제목 아이콘 헤더는 숨김.
// - 2026-08-14: 치과 제조사 추가요청(환봉방식 커스텀어벗) 목록·편집·도입/되돌리기.
// related files:
// - web/frontend/src/pages/admin/system/AdminPlatformSettingsPage.tsx
// - web/frontend/src/shared/practice/roundBarAbutment.ts
// - web/backend/controllers/admin/admin.roundBarAbutment.controller.js
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Hexagon, Search } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { cn } from "@/shared/ui/cn";
import {
  ABUTMENT_ADOPTED_KIND,
  ROUND_BAR_HEX_TYPE,
  fetchAdminRoundBarRequests,
  normalizeAdoptedKind,
  patchAdminRoundBarRequest,
  type AbutmentAdoptedKind,
  type RoundBarAbutmentRequest,
} from "@/shared/practice/roundBarAbutment";

const AUTO_SAVE_DELAY_MS = 700;

type DraftRow = {
  manufacturer: string;
  brand: string;
  family: string;
  type: string;
};

export const AdminRoundBarAbutmentTab = ({
  embedded = false,
}: {
  embedded?: boolean;
}) => {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<RoundBarAbutmentRequest[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const saveTimers = useRef<Record<string, number>>({});

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchAdminRoundBarRequests({
        token,
        q: debouncedQ,
      });
      setRows(data);
      setDrafts(
        Object.fromEntries(
          data.map((row) => [
            row.id,
            {
              manufacturer: row.manufacturer,
              brand: row.brand,
              family: row.family,
              type: row.type || ROUND_BAR_HEX_TYPE,
            },
          ]),
        ),
      );
    } catch (error) {
      toast({
        title: "목록 로딩 실패",
        description:
          error instanceof Error ? error.message : "요청 목록을 불러오지 못했습니다.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, toast, token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(
    () => () => {
      Object.values(saveTimers.current).forEach((id) => window.clearTimeout(id));
    },
    [],
  );

  const applyRow = (next: RoundBarAbutmentRequest) => {
    setRows((cur) => cur.map((row) => (row.id === next.id ? next : row)));
    setDrafts((cur) => ({
      ...cur,
      [next.id]: {
        manufacturer: next.manufacturer,
        brand: next.brand,
        family: next.family,
        type: next.type || ROUND_BAR_HEX_TYPE,
      },
    }));
  };

  const saveSpec = async (id: string, draft: DraftRow) => {
    if (!token) return;
    const manufacturer = draft.manufacturer.trim();
    const brand = draft.brand.trim();
    const family = draft.family.trim();
    const type = draft.type.trim();
    if (!manufacturer || !brand || !family || !type) return;
    setSavingId(id);
    try {
      const updated = await patchAdminRoundBarRequest({
        token,
        id,
        patch: { manufacturer, brand, family, type },
      });
      if (updated) applyRow(updated);
    } catch (error) {
      toast({
        title: "저장 실패",
        description: error instanceof Error ? error.message : "프리셋 내용을 저장하지 못했습니다.",
        variant: "destructive",
      });
    } finally {
      setSavingId(null);
    }
  };

  const scheduleSave = (id: string, nextDraft: DraftRow) => {
    setDrafts((cur) => ({ ...cur, [id]: nextDraft }));
    if (saveTimers.current[id]) window.clearTimeout(saveTimers.current[id]);
    saveTimers.current[id] = window.setTimeout(() => {
      void saveSpec(id, nextDraft);
    }, AUTO_SAVE_DELAY_MS);
  };

  const setAdoptedKind = async (
    row: RoundBarAbutmentRequest,
    adoptedKind: AbutmentAdoptedKind,
  ) => {
    if (!token || normalizeAdoptedKind(row.adoptedKind) === adoptedKind) return;
    setSavingId(row.id);
    const prev = rows;
    setRows((cur) =>
      cur.map((item) => (item.id === row.id ? { ...item, adoptedKind } : item)),
    );
    try {
      const updated = await patchAdminRoundBarRequest({
        token,
        id: row.id,
        patch: { adoptedKind },
      });
      if (updated) applyRow(updated);
    } catch (error) {
      setRows(prev);
      toast({
        title: "유형 저장 실패",
        description:
          error instanceof Error ? error.message : "어벗 유형을 저장하지 못했습니다.",
        variant: "destructive",
      });
    } finally {
      setSavingId(null);
    }
  };

  const setAdopted = async (row: RoundBarAbutmentRequest, adopted: boolean) => {
    if (!token) return;
    const adoptedKind = normalizeAdoptedKind(row.adoptedKind);
    if (adopted && !adoptedKind) {
      toast({
        title: "유형을 먼저 선택하세요",
        description: "도입 전에 CNC어벗 또는 환봉어벗을 선택해주세요.",
        variant: "destructive",
      });
      return;
    }
    setSavingId(row.id);
    const prev = rows;
    setRows((cur) =>
      cur.map((item) => (item.id === row.id ? { ...item, adopted } : item)),
    );
    try {
      const updated = await patchAdminRoundBarRequest({
        token,
        id: row.id,
        patch: { adopted, adoptedKind },
      });
      if (updated) applyRow(updated);
    } catch (error) {
      setRows(prev);
      toast({
        title: adopted ? "도입 실패" : "도입 해제 실패",
        description:
          error instanceof Error ? error.message : "도입 상태를 변경하지 못했습니다.",
        variant: "destructive",
      });
    } finally {
      setSavingId(null);
    }
  };

  const countBadge =
    !loading && rows.length > 0 ? (
      <span className="inline-flex items-center rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-semibold tabular-nums text-primary-strong ring-1 ring-primary-muted">
        대기 {rows.filter((row) => !row.adopted).length} / {rows.length}
      </span>
    ) : null;

  const header = embedded ? (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-0.5">
        <h4 className="text-sm font-semibold tracking-tight text-slate-800">
          어벗 추가 요청
        </h4>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          치과에서 요청한 제조사·브랜드·패밀리입니다. 도입하면 해당 치과
          프리셋에 정식 채택됩니다.
        </p>
      </div>
      {countBadge}
    </div>
  ) : (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft/60 ring-1 ring-primary-muted/70">
          <Hexagon className="h-5 w-5 text-primary-strong" />
        </span>
        <div className="min-w-0 space-y-1">
          <h3 className="text-base font-semibold tracking-tight text-slate-900">
            어벗 추가 요청
          </h3>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            치과에서 요청한 제조사·브랜드·패밀리를 확인하고, 도입하면 해당 치과
            프리셋에 정식 채택됩니다.
          </p>
        </div>
      </div>
      {countBadge}
    </div>
  );

  const body = (
      <div className="space-y-5">
        {header}

        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="치과명, 제조사, 브랜드, 패밀리, 타입"
            className="h-11 rounded-xl border-slate-200 bg-white pl-10 shadow-sm"
          />
        </div>

        {loading ? (
          <div className="rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/40 px-6 py-12 text-center text-sm text-muted-foreground">
            불러오는 중…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/40 px-6 py-12 text-center text-sm text-muted-foreground">
            치과에서 전달받은 제조사 추가 요청이 없습니다.
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => {
              const draft = drafts[row.id] || {
                manufacturer: row.manufacturer,
                brand: row.brand,
                family: row.family,
                type: row.type || ROUND_BAR_HEX_TYPE,
              };
              const busy = savingId === row.id;
              return (
                <li
                  key={row.id}
                  className={cn(
                    "rounded-2xl border bg-white/80 p-4 shadow-sm",
                    row.adopted
                      ? normalizeAdoptedKind(row.adoptedKind) ===
                        ABUTMENT_ADOPTED_KIND.ROUND_BAR
                        ? "border-service-abut-muted/80"
                        : "border-primary-muted/80"
                      : "border-slate-200/80",
                  )}
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {row.practiceName || "치과"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {row.createdAt
                          ? new Date(row.createdAt).toLocaleString("ko-KR")
                          : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5">
                        {(
                          [
                            {
                              id: ABUTMENT_ADOPTED_KIND.CNC,
                              label: "CNC어벗",
                              active:
                                "bg-primary text-primary-foreground shadow-sm",
                              idle: "text-primary-strong/75 hover:bg-primary-soft",
                            },
                            {
                              id: ABUTMENT_ADOPTED_KIND.ROUND_BAR,
                              label: "환봉어벗",
                              active:
                                "bg-service-abut text-service-abut-foreground shadow-sm",
                              idle: "text-service-abut hover:bg-service-abut-soft",
                            },
                          ] as const
                        ).map((option) => {
                          const active =
                            normalizeAdoptedKind(row.adoptedKind) === option.id;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              disabled={busy}
                              className={cn(
                                "rounded-[10px] px-2.5 py-1 text-xs font-semibold transition-colors",
                                active ? option.active : option.idle,
                              )}
                              onClick={() => void setAdoptedKind(row, option.id)}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <Checkbox
                          checked={row.adopted}
                          disabled={
                            busy ||
                            (row.adopted
                              ? false
                              : !normalizeAdoptedKind(row.adoptedKind))
                          }
                          onCheckedChange={(checked) => {
                            void setAdopted(row, checked === true);
                          }}
                        />
                        도입
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">제조사</Label>
                      <Input
                        value={draft.manufacturer}
                        className="h-10 text-sm"
                        disabled={busy}
                        onChange={(e) =>
                          scheduleSave(row.id, {
                            ...draft,
                            manufacturer: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">브랜드</Label>
                      <Input
                        value={draft.brand}
                        className="h-10 text-sm"
                        disabled={busy}
                        onChange={(e) =>
                          scheduleSave(row.id, { ...draft, brand: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">패밀리</Label>
                      <Input
                        value={draft.family}
                        className="h-10 text-sm"
                        disabled={busy}
                        onChange={(e) =>
                          scheduleSave(row.id, { ...draft, family: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">타입</Label>
                      <Input
                        value={draft.type}
                        className="h-10 text-sm"
                        disabled={busy}
                        onChange={(e) =>
                          scheduleSave(row.id, {
                            ...draft,
                            type: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
  );

  if (embedded) return body;

  return (
    <Card className="app-glass-card app-glass-card--lg overflow-hidden">
      <CardContent className="p-5 sm:p-6">{body}</CardContent>
    </Card>
  );
};

// change-log:
// - 2026-08-26: 디바운스 제거·명시 저장, 관리자 추가, 대문자 입력, 공개 체크·툴팁.
// - 2026-08-24: 요청 카드별 삭제.
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
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Hexagon, Plus, Search, Trash2 } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { cn } from "@/shared/ui/cn";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import {
  ABUTMENT_ADOPTED_KIND,
  ROUND_BAR_HEX_TYPE,
  createAdminRoundBarRequest,
  deleteAdminRoundBarRequest,
  fetchAdminRoundBarRequests,
  normalizeAdoptedKind,
  patchAdminRoundBarRequest,
  type AbutmentAdoptedKind,
  type RoundBarAbutmentRequest,
} from "@/shared/practice/roundBarAbutment";

type DraftRow = {
  manufacturer: string;
  brand: string;
  family: string;
  type: string;
};

const emptyDraft = (): DraftRow => ({
  manufacturer: "",
  brand: "",
  family: "",
  type: "HEX",
});

const toUpperDraft = (draft: DraftRow): DraftRow => ({
  manufacturer: draft.manufacturer.toUpperCase(),
  brand: draft.brand.toUpperCase(),
  family: draft.family.toUpperCase(),
  type: draft.type.toUpperCase(),
});

const draftFromRow = (row: RoundBarAbutmentRequest): DraftRow =>
  toUpperDraft({
    manufacturer: row.manufacturer,
    brand: row.brand,
    family: row.family,
    type: row.type || ROUND_BAR_HEX_TYPE,
  });

const isDraftDirty = (draft: DraftRow, row: RoundBarAbutmentRequest) => {
  const saved = draftFromRow(row);
  return (
    draft.manufacturer !== saved.manufacturer ||
    draft.brand !== saved.brand ||
    draft.family !== saved.family ||
    draft.type !== saved.type
  );
};

const ADOPT_TOOLTIP = "체크시 해당 치과 프리셋에 정식 채택됩니다.";
const PUBLIC_TOOLTIP = "체크시 모든 치과에 공개.";

const CheckboxWithTooltip = ({
  label,
  tooltip,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string;
  tooltip: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
        <Checkbox
          checked={checked}
          disabled={disabled}
          onCheckedChange={(value) => onCheckedChange(value === true)}
        />
        {label}
      </label>
    </TooltipTrigger>
    <TooltipContent side="top" className="max-w-xs text-left leading-relaxed">
      {tooltip}
    </TooltipContent>
  </Tooltip>
);

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
  const [creating, setCreating] = useState(false);
  const [newDraft, setNewDraft] = useState<DraftRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RoundBarAbutmentRequest | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

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
        Object.fromEntries(data.map((row) => [row.id, draftFromRow(row)])),
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

  const applyRow = (next: RoundBarAbutmentRequest) => {
    setRows((cur) => {
      const exists = cur.some((row) => row.id === next.id);
      if (!exists) return [next, ...cur];
      return cur.map((row) => (row.id === next.id ? next : row));
    });
    setDrafts((cur) => ({
      ...cur,
      [next.id]: draftFromRow(next),
    }));
  };

  const updateDraftField = (
    id: string,
    key: keyof DraftRow,
    value: string,
  ) => {
    setDrafts((cur) => {
      const prev = cur[id] || emptyDraft();
      return {
        ...cur,
        [id]: { ...prev, [key]: value.toUpperCase() },
      };
    });
  };

  const saveSpec = async (id: string, draft: DraftRow) => {
    if (!token) return;
    const next = toUpperDraft({
      manufacturer: draft.manufacturer.trim(),
      brand: draft.brand.trim(),
      family: draft.family.trim(),
      type: draft.type.trim(),
    });
    if (!next.manufacturer || !next.brand || !next.family || !next.type) {
      toast({
        title: "입력 필요",
        description: "제조사, 브랜드, 패밀리, 타입을 모두 입력해주세요.",
        variant: "destructive",
      });
      return;
    }
    setSavingId(id);
    try {
      const updated = await patchAdminRoundBarRequest({
        token,
        id,
        patch: next,
      });
      if (updated) applyRow(updated);
      toast({ title: "저장 완료", description: "스펙을 저장했습니다." });
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

  const createSpec = async () => {
    if (!token || !newDraft) return;
    const next = toUpperDraft({
      manufacturer: newDraft.manufacturer.trim(),
      brand: newDraft.brand.trim(),
      family: newDraft.family.trim(),
      type: newDraft.type.trim(),
    });
    if (!next.manufacturer || !next.brand || !next.family || !next.type) {
      toast({
        title: "입력 필요",
        description: "제조사, 브랜드, 패밀리, 타입을 모두 입력해주세요.",
        variant: "destructive",
      });
      return;
    }
    setCreating(true);
    try {
      const created = await createAdminRoundBarRequest({
        token,
        payload: next,
      });
      if (created) {
        applyRow(created);
        setNewDraft(null);
        toast({ title: "추가 완료", description: "임플란트를 추가했습니다." });
      }
    } catch (error) {
      toast({
        title: "추가 실패",
        description:
          error instanceof Error ? error.message : "임플란트를 추가하지 못했습니다.",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
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
      cur.map((item) =>
        item.id === row.id
          ? { ...item, adopted, isPublic: adopted ? item.isPublic : false }
          : item,
      ),
    );
    try {
      const updated = await patchAdminRoundBarRequest({
        token,
        id: row.id,
        patch: {
          adopted,
          adoptedKind,
          ...(adopted ? {} : { isPublic: false }),
        },
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

  const setPublic = async (row: RoundBarAbutmentRequest, isPublic: boolean) => {
    if (!token) return;
    if (isPublic && !row.adopted) {
      toast({
        title: "도입을 먼저 해주세요",
        description: "공개하려면 먼저 도입을 체크해주세요.",
        variant: "destructive",
      });
      return;
    }
    setSavingId(row.id);
    const prev = rows;
    setRows((cur) =>
      cur.map((item) => (item.id === row.id ? { ...item, isPublic } : item)),
    );
    try {
      const updated = await patchAdminRoundBarRequest({
        token,
        id: row.id,
        patch: { isPublic },
      });
      if (updated) applyRow(updated);
    } catch (error) {
      setRows(prev);
      toast({
        title: isPublic ? "공개 실패" : "공개 해제 실패",
        description:
          error instanceof Error ? error.message : "공개 상태를 변경하지 못했습니다.",
        variant: "destructive",
      });
    } finally {
      setSavingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!token || !deleteTarget) return;
    const id = deleteTarget.id;
    setDeleting(true);
    try {
      await deleteAdminRoundBarRequest({ token, id });
      setRows((cur) => cur.filter((row) => row.id !== id));
      setDrafts((cur) => {
        const next = { ...cur };
        delete next[id];
        return next;
      });
      setDeleteTarget(null);
      toast({
        title: "삭제 완료",
        description: "어벗 추가 요청을 삭제했습니다.",
      });
    } catch (error) {
      toast({
        title: "삭제 실패",
        description:
          error instanceof Error ? error.message : "요청을 삭제하지 못했습니다.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
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
      <div className="flex flex-wrap items-center gap-2">
        {countBadge}
        <Button
          type="button"
          size="sm"
          className="h-8 gap-1.5"
          disabled={Boolean(newDraft) || creating}
          onClick={() => setNewDraft(emptyDraft())}
        >
          <Plus className="h-3.5 w-3.5" />
          추가
        </Button>
      </div>
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
      <div className="flex flex-wrap items-center gap-2">
        {countBadge}
        <Button
          type="button"
          size="sm"
          className="h-9 gap-1.5"
          disabled={Boolean(newDraft) || creating}
          onClick={() => setNewDraft(emptyDraft())}
        >
          <Plus className="h-4 w-4" />
          추가
        </Button>
      </div>
    </div>
  );

  const renderSpecFields = (
    draft: DraftRow,
    opts: {
      disabled?: boolean;
      onChange: (key: keyof DraftRow, value: string) => void;
    },
  ) => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {(
        [
          ["manufacturer", "제조사"],
          ["brand", "브랜드"],
          ["family", "패밀리"],
          ["type", "타입"],
        ] as const
      ).map(([key, label]) => (
        <div key={key} className="space-y-1">
          <Label className="text-xs text-slate-500">{label}</Label>
          <Input
            value={draft[key]}
            className="h-10 text-sm uppercase"
            disabled={opts.disabled}
            onChange={(e) => opts.onChange(key, e.target.value)}
          />
        </div>
      ))}
    </div>
  );

  const renderRowCard = (row: RoundBarAbutmentRequest) => {
    const draft = drafts[row.id] || draftFromRow(row);
    const busy = savingId === row.id;
    const dirty = isDraftDirty(draft, row);
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
                    active: "bg-primary text-primary-foreground shadow-sm",
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
            <CheckboxWithTooltip
              label="도입"
              tooltip={ADOPT_TOOLTIP}
              checked={row.adopted}
              disabled={
                busy ||
                (row.adopted
                  ? false
                  : !normalizeAdoptedKind(row.adoptedKind))
              }
              onCheckedChange={(checked) => {
                void setAdopted(row, checked);
              }}
            />
            <CheckboxWithTooltip
              label="공개"
              tooltip={PUBLIC_TOOLTIP}
              checked={Boolean(row.isPublic)}
              disabled={busy || !row.adopted}
              onCheckedChange={(checked) => {
                void setPublic(row, checked);
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-400 hover:text-destructive"
              disabled={busy || deleting}
              title="삭제"
              aria-label="요청 삭제"
              onClick={() => setDeleteTarget(row)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {renderSpecFields(draft, {
          disabled: busy,
          onChange: (key, value) => updateDraftField(row.id, key, value),
        })}

        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            size="sm"
            className="h-8 min-w-[4.5rem]"
            disabled={busy || !dirty}
            onClick={() => void saveSpec(row.id, draft)}
          >
            {busy ? "저장 중…" : "저장"}
          </Button>
        </div>
      </li>
    );
  };

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

      {newDraft ? (
        <div className="rounded-2xl border border-dashed border-primary-muted/80 bg-primary-soft/20 p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">
                새 임플란트 추가
              </p>
              <p className="text-xs text-slate-500">
                저장 후 CNC/환봉·도입·공개를 설정하세요.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8"
                disabled={creating}
                onClick={() => setNewDraft(null)}
              >
                취소
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 min-w-[4.5rem]"
                disabled={creating}
                onClick={() => void createSpec()}
              >
                {creating ? "추가 중…" : "저장"}
              </Button>
            </div>
          </div>
          {renderSpecFields(newDraft, {
            disabled: creating,
            onChange: (key, value) =>
              setNewDraft((cur) =>
                cur ? { ...cur, [key]: value.toUpperCase() } : cur,
              ),
          })}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/40 px-6 py-12 text-center text-sm text-muted-foreground">
          불러오는 중…
        </div>
      ) : rows.length === 0 && !newDraft ? (
        <div className="rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/40 px-6 py-12 text-center text-sm text-muted-foreground">
          치과에서 전달받은 임플란트 추가 요청이 없습니다.
        </div>
      ) : (
        <ul className="space-y-3">{rows.map(renderRowCard)}</ul>
      )}
    </div>
  );

  const dialog = (
    <ConfirmDialog
      open={Boolean(deleteTarget)}
      title="어벗 추가 요청 삭제"
      description={
        deleteTarget ? (
          <>
            <span className="font-medium text-slate-900">
              {deleteTarget.practiceName || "치과"}
            </span>
            의 요청(
            {[deleteTarget.manufacturer, deleteTarget.brand, deleteTarget.family]
              .filter(Boolean)
              .join(" / ") || "스펙 미정"}
            )을 삭제합니다.
            {deleteTarget.adopted
              ? " 도입된 치과 프리셋은 유지됩니다."
              : " 치과 대기 프리셋도 함께 제거됩니다."}
          </>
        ) : null
      }
      confirmLabel={deleting ? "삭제 중…" : "삭제"}
      busy={deleting}
      onConfirm={() => void confirmDelete()}
      onCancel={() => {
        if (!deleting) setDeleteTarget(null);
      }}
    />
  );

  if (embedded) {
    return (
      <>
        {body}
        {dialog}
      </>
    );
  }

  return (
    <>
      <Card className="app-glass-card app-glass-card--lg overflow-hidden">
        <CardContent className="p-5 sm:p-6">{body}</CardContent>
      </Card>
      {dialog}
    </>
  );
};

// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/shared/autoApproval/AutoApprovalGateSwitch.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/shared/autoApproval/useAutoApprovalGate.ts
// change-log:
// - 2026-10-14: 신설. 자동 승인에서 뺄 의뢰자를 검색해 저장한다.
import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";
import {
  type ExcludedRequestor,
  useAutoApprovalGate,
} from "./useAutoApprovalGate";

type SearchHit = ExcludedRequestor & {
  kind: string;
};

function kindLabel(kind: string) {
  if (kind === "lab") return "기공소";
  if (kind === "practice") return "치과";
  return "";
}

export function AutoApprovalExcludeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { token } = useAuthStore();
  const { state: gate, busy, save } = useAutoApprovalGate(token);
  const { toast } = useToast();
  const [draft, setDraft] = useState<ExcludedRequestor[]>([]);
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setDraft(gate?.excludedRequestors || []);
      setSearch("");
      setHits([]);
    }
    wasOpen.current = open;
  }, [open, gate?.excludedRequestors]);

  useEffect(() => {
    if (!open || !token) return;
    const q = search.trim();
    if (!q) {
      setHits([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearching(true);
      void apiFetch({
        path: `/api/businesses/search?q=${encodeURIComponent(q)}&businessType=requestor`,
        method: "GET",
        token,
      })
        .then((res) => {
          if (cancelled || !res.ok) return;
          const raw = (res.data as { data?: unknown })?.data;
          const rows = Array.isArray(raw) ? raw : [];
          setHits(
            rows
              .map((row) => {
                const item = row as {
                  _id?: unknown;
                  name?: unknown;
                  requestorKind?: unknown;
                };
                return {
                  id: String(item?._id || "").trim(),
                  name: String(item?.name || "").trim() || "이름 없음",
                  kind: String(item?.requestorKind || "").trim(),
                };
              })
              .filter((row) => row.id),
          );
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, search, token]);

  const selectedIds = useMemo(
    () => new Set(draft.map((row) => row.id)),
    [draft],
  );
  const availableHits = hits.filter((row) => !selectedIds.has(row.id));

  const onSave = async () => {
    const ok = await save({
      excludedRequestorAnchorIds: draft.map((row) => row.id),
    });
    if (!ok) {
      toast({
        title: "제외 목록 저장 실패",
        description: "잠시 후 다시 시도해 주세요.",
        variant: "destructive",
      });
      return;
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>자동 승인 제외</DialogTitle>
          <DialogDescription>
            선택한 의뢰자의 의뢰는 자동으로 가공에 들어가지 않습니다.
            <br />
            카드에서 승인하면 가공으로 넘길 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="의뢰자명 검색"
          aria-label="의뢰자명 검색"
        />

        {search.trim() ? (
          <ul className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 px-1.5 py-1.5">
            {searching ? (
              <li className="px-2 py-1.5 text-sm text-slate-500">검색 중…</li>
            ) : availableHits.length === 0 ? (
              <li className="px-2 py-1.5 text-sm text-slate-500">
                검색 결과가 없습니다.
              </li>
            ) : (
              availableHits.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-50"
                    onClick={() =>
                      setDraft((prev) =>
                        prev.some((item) => item.id === row.id)
                          ? prev
                          : [...prev, { id: row.id, name: row.name }],
                      )
                    }
                  >
                    <span className="min-w-0 truncate">{row.name}</span>
                    {kindLabel(row.kind) ? (
                      <span className="shrink-0 text-xs text-slate-500">
                        {kindLabel(row.kind)}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}

        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-700">제외 중</p>
          {draft.length === 0 ? (
            <p className="text-sm text-slate-500">제외한 의뢰자가 없습니다.</p>
          ) : (
            <ul className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 px-1.5 py-1.5">
              {draft.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-2 px-2 py-1"
                >
                  <span className="min-w-0 truncate text-sm">{row.name}</span>
                  <button
                    type="button"
                    className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    aria-label={`${row.name} 제외 해제`}
                    onClick={() =>
                      setDraft((prev) => prev.filter((item) => item.id !== row.id))
                    }
                  >
                    <X className="h-3.5 w-3.5" />
                    빼기
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            취소
          </Button>
          <Button type="button" onClick={() => void onSave()} disabled={busy}>
            {busy ? "저장 중…" : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

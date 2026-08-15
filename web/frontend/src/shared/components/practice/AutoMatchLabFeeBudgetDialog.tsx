// related files:
// - web/frontend/src/shared/practice/autoMatchBudget.ts
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/backend/controllers/support/support.controller.js
// change-log:
// - 2026-08-15: 「추가 요청」카드 — 관리자 확인용 기공비 항목 추가 문의 접수.
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { apiFetch } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import {
  bandFromAdminBase,
  catalogItemLabel,
  floorToFeeStep,
  normalizeAbutsLabFeeCatalog,
  resolveAutoMatchBudgetOrDefaults,
  type AbutsLabFeeCatalogItem,
  type PracticeTransferAutoMatchBudget,
} from "@/shared/practice/autoMatchBudget";
import { formatWon } from "@/shared/practice/practiceTransferFeeQuote";
import { cn } from "@/shared/ui/cn";

export const LAB_FEE_ITEM_ADD_REQUEST_TYPE = "lab_fee_item_add_request";

type AutoMatchLabFeeBudgetDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: PracticeTransferAutoMatchBudget | null;
  catalog?: AbutsLabFeeCatalogItem[] | null;
  onSave: (next: PracticeTransferAutoMatchBudget) => void | Promise<void>;
};

export function AutoMatchLabFeeBudgetDialog({
  open,
  onOpenChange,
  value,
  catalog,
  onSave,
}: AutoMatchLabFeeBudgetDialogProps) {
  const { toast } = useToast();
  const rows = normalizeAbutsLabFeeCatalog(catalog);
  const [draft, setDraft] = useState<PracticeTransferAutoMatchBudget>(() =>
    resolveAutoMatchBudgetOrDefaults(value, catalog),
  );
  const [saving, setSaving] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestName, setRequestName] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(resolveAutoMatchBudgetOrDefaults(value, catalog));
    setRequestOpen(false);
    setRequestName("");
    setRequestNote("");
  }, [open, value, catalog]);

  const setBand = (id: string, side: "min" | "max", raw: string) => {
    const n = floorToFeeStep(Number(raw || 0));
    const baseRow = rows.find((row) => row.id === id);
    setDraft((prev) => {
      const current =
        prev.items[id] || bandFromAdminBase(baseRow?.price || 0);
      const nextBand =
        side === "min"
          ? { min: Math.min(n, current.max), max: current.max }
          : { min: Math.min(current.min, n), max: Math.max(n, 1000) };
      return {
        version: 2,
        items: { ...prev.items, [id]: nextBand },
      };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(resolveAutoMatchBudgetOrDefaults(draft, catalog));
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitRequest = async () => {
    const name = requestName.trim();
    if (!name) {
      toast({
        title: "기공물 이름을 입력해주세요",
        variant: "destructive",
      });
      return;
    }

    setRequesting(true);
    try {
      const note = requestNote.trim();
      const res = await apiFetch<{ success?: boolean; message?: string }>({
        path: "/api/support/inquiries",
        method: "POST",
        jsonBody: {
          type: LAB_FEE_ITEM_ADD_REQUEST_TYPE,
          subject: `기공비 항목 추가 요청: ${name}`,
          message: [
            "자동매칭 기공비 카탈로그 추가 요청입니다.",
            `요청 기공물: ${name}`,
            note ? `참고: ${note}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      });
      if (!res.ok) {
        throw new Error(
          (res.data as { message?: string } | null)?.message ||
            "요청에 실패했습니다.",
        );
      }
      setRequestOpen(false);
      setRequestName("");
      setRequestNote("");
      setGuideOpen(true);
    } catch (error) {
      toast({
        title: "추가 요청 실패",
        description:
          error instanceof Error ? error.message : "요청에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setRequesting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] w-[calc(100%-1.5rem)] max-w-3xl gap-5 overflow-y-auto p-0 sm:rounded-2xl">
          <div className="border-b border-slate-200/80 px-6 pb-4 pt-6">
            <DialogHeader className="space-y-1.5 text-left">
              <DialogTitle className="text-lg font-semibold tracking-tight text-slate-900">
                자동매칭 기공비 설정
              </DialogTitle>
              <DialogDescription className="text-sm text-slate-500">
                기공비 범위에 맞는 인증 기공소만 참여합니다.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="grid grid-cols-1 gap-3 px-6 sm:grid-cols-2">
            {rows.map((row) => {
              const band = draft.items[row.id] || bandFromAdminBase(row.price);
              return (
                <div
                  key={row.id}
                  className={cn(
                    "rounded-xl border border-slate-200/90 bg-slate-50/60 p-4",
                    "shadow-[0_1px_0_rgba(15,23,42,0.03)]",
                  )}
                >
                  <div className="mb-3 flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {catalogItemLabel(row)}
                    </p>
                    <p className="shrink-0 text-[11px] tabular-nums text-slate-400">
                      기준 {formatWon(row.price)}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1.5">
                      <Label
                        htmlFor={`auto-match-fee-min-${row.id}`}
                        className="text-[11px] font-medium text-slate-500"
                      >
                        최소
                      </Label>
                      <Input
                        id={`auto-match-fee-min-${row.id}`}
                        type="number"
                        min={0}
                        step={1000}
                        className="h-10 rounded-lg border-slate-200 bg-white tabular-nums shadow-none focus-visible:ring-slate-300"
                        value={band.min}
                        onChange={(event) =>
                          setBand(row.id, "min", event.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label
                        htmlFor={`auto-match-fee-max-${row.id}`}
                        className="text-[11px] font-medium text-slate-500"
                      >
                        최대
                      </Label>
                      <Input
                        id={`auto-match-fee-max-${row.id}`}
                        type="number"
                        min={0}
                        step={1000}
                        className="h-10 rounded-lg border-slate-200 bg-white tabular-nums shadow-none focus-visible:ring-slate-300"
                        value={band.max}
                        onChange={(event) =>
                          setBand(row.id, "max", event.target.value)
                        }
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              className={cn(
                "flex min-h-[7.5rem] flex-col items-start justify-between rounded-xl border border-dashed border-slate-300 bg-white p-4 text-left",
                "shadow-[0_1px_0_rgba(15,23,42,0.03)] transition-colors",
                "hover:border-primary/50 hover:bg-primary-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300",
              )}
              onClick={() => setRequestOpen(true)}
            >
              <div className="space-y-1">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                  <Plus className="h-4 w-4 text-primary" aria-hidden />
                  추가 요청
                </p>
                <p className="text-xs leading-relaxed text-slate-500">
                  목록에 없는 기공물입니다. 어벗츠 관리자가 확인 후 반영합니다.
                </p>
              </div>
              <span className="mt-3 text-xs font-medium text-primary">요청하기</span>
            </button>
          </div>

          <DialogFooter className="border-t border-slate-200/80 px-6 py-4 sm:justify-end">
            <Button
              type="button"
              className="h-10 min-w-[5.5rem] rounded-lg"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? "저장 중…" : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent className="max-w-md gap-4 sm:rounded-2xl">
          <DialogHeader className="space-y-1.5 text-left">
            <DialogTitle className="text-base font-semibold text-slate-900">
              기공비 항목 추가 요청
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              요청하시면 어벗츠 관리자가 확인한 뒤 카탈로그에 넣어 드립니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="lab-fee-add-request-name" className="text-sm">
                기공물 이름 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lab-fee-add-request-name"
                value={requestName}
                onChange={(event) => setRequestName(event.target.value)}
                placeholder="예: 라미네이트"
                className="h-10"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lab-fee-add-request-note" className="text-sm">
                참고 (선택)
              </Label>
              <Textarea
                id="lab-fee-add-request-note"
                value={requestNote}
                onChange={(event) => setRequestNote(event.target.value)}
                placeholder="원하는 기준 단가·단위 등이 있으면 적어 주세요"
                className="min-h-[88px] resize-none"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRequestOpen(false)}
              disabled={requesting}
            >
              취소
            </Button>
            <Button
              type="button"
              onClick={() => void handleSubmitRequest()}
              disabled={requesting || !requestName.trim()}
            >
              {requesting ? "요청 중…" : "요청"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={guideOpen}
        title="안내"
        description={
          <>
            요청이 접수되었습니다.
            <br />
            어벗츠 관리자가 확인 후 기공비 항목에 반영합니다.
          </>
        }
        confirmLabel="확인"
        cancelLabel="닫기"
        confirmTone="primary"
        onConfirm={() => setGuideOpen(false)}
        onCancel={() => setGuideOpen(false)}
      />
    </>
  );
}

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImeSafeInput } from "@/shared/components/practice/ImeSafeInput";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/shared/ui/cn";

// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/backend/controllers/practiceTransfers/practiceTransferSettings.controller.js
// - web/backend/models/businessAnchor.model.js
// change-log:
// - 2026-09-21: 신규의뢰 원장님 성함 드롭다운(추가·수정·삭제 → BA doctorNames).

const MAX_DOCTOR_NAMES = 40;
const MAX_DOCTOR_NAME_LENGTH = 40;

export const normalizeDoctorNames = (items: unknown): string[] => {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const next: string[] = [];
  for (const item of items) {
    const text = String(item || "").trim().slice(0, MAX_DOCTOR_NAME_LENGTH);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(text);
    if (next.length >= MAX_DOCTOR_NAMES) break;
  }
  return next;
};

export type PracticeDoctorNameFieldProps = {
  value: string;
  onChange: (next: string) => void;
  doctorNames: string[];
  onDoctorNamesChange: (next: string[]) => void | Promise<void>;
  className?: string;
  triggerClassName?: string;
};

export function PracticeDoctorNameField({
  value,
  onChange,
  doctorNames,
  onDoctorNamesChange,
  className,
  triggerClassName,
}: PracticeDoctorNameFieldProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const names = useMemo(() => normalizeDoctorNames(doctorNames), [doctorNames]);
  const selected = String(value || "").trim();

  const persistNames = async (next: string[]) => {
    const normalized = normalizeDoctorNames(next);
    await onDoctorNamesChange(normalized);
  };

  const selectName = (name: string) => {
    const next = String(name || "").trim().slice(0, MAX_DOCTOR_NAME_LENGTH);
    onChange(next);
    setOpen(false);
    setEditingName(null);
    setEditDraft("");
    setDraft("");
  };

  const handleAdd = async () => {
    const nextName = String(draft || "").trim().slice(0, MAX_DOCTOR_NAME_LENGTH);
    if (!nextName) return;
    const exists = names.some((n) => n.toLowerCase() === nextName.toLowerCase());
    const nextList = exists
      ? names.map((n) =>
          n.toLowerCase() === nextName.toLowerCase() ? nextName : n,
        )
      : [...names, nextName];
    await persistNames(nextList);
    selectName(nextName);
  };

  const handleDelete = async (name: string) => {
    const key = name.toLowerCase();
    const nextList = names.filter((n) => n.toLowerCase() !== key);
    await persistNames(nextList);
    if (selected.toLowerCase() === key) {
      onChange("");
    }
    if (editingName?.toLowerCase() === key) {
      setEditingName(null);
      setEditDraft("");
    }
  };

  const startEdit = (name: string) => {
    setEditingName(name);
    setEditDraft(name);
  };

  const cancelEdit = () => {
    setEditingName(null);
    setEditDraft("");
  };

  const commitEdit = async () => {
    const from = String(editingName || "").trim();
    const to = String(editDraft || "").trim().slice(0, MAX_DOCTOR_NAME_LENGTH);
    if (!from) {
      cancelEdit();
      return;
    }
    if (!to) {
      await handleDelete(from);
      return;
    }
    const fromKey = from.toLowerCase();
    const nextList: string[] = [];
    const seen = new Set<string>();
    for (const n of names) {
      const replaced = n.toLowerCase() === fromKey ? to : n;
      const key = replaced.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      nextList.push(replaced);
    }
    await persistNames(nextList);
    if (selected.toLowerCase() === fromKey) {
      onChange(to);
    }
    cancelEdit();
  };

  const canAdd = Boolean(String(draft || "").trim());

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex h-7 items-center gap-1">
        <Label className="text-sm leading-none">원장님 성함</Label>
      </div>
      <Popover
        modal
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            cancelEdit();
            setDraft("");
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "h-11 w-full justify-between text-base font-normal",
              !selected && "text-muted-foreground",
              triggerClassName,
            )}
          >
            <span className="truncate">{selected || "원장님 선택"}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] max-w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          <div className="max-h-56 overflow-y-auto overscroll-contain touch-pan-y p-1">
            {names.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                등록된 원장님이 없습니다. 아래에서 추가하세요.
              </div>
            ) : (
              names.map((name) => {
                const isSelected = selected.toLowerCase() === name.toLowerCase();
                const isEditing = editingName === name;
                if (isEditing) {
                  return (
                    <div
                      key={`edit-${name}`}
                      className="flex items-center gap-1 rounded-md px-1 py-1"
                    >
                      <ImeSafeInput
                        value={editDraft}
                        onChange={setEditDraft}
                        placeholder="원장님 성함"
                        className="h-8 flex-1 text-sm"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void commitEdit();
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            cancelEdit();
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-primary hover:bg-muted"
                        aria-label="수정 저장"
                        title="저장"
                        onClick={() => void commitEdit()}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="수정 취소"
                        title="취소"
                        onClick={cancelEdit}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                }
                return (
                  <div
                    key={name}
                    className={cn(
                      "group flex items-center gap-0.5 rounded-md px-1 py-0.5",
                      isSelected && "bg-accent",
                    )}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/80"
                      onClick={() => selectName(name)}
                    >
                      <Check
                        className={cn(
                          "h-4 w-4 shrink-0",
                          isSelected ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="min-w-0 truncate">{name}</span>
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-70 hover:bg-muted hover:text-foreground hover:opacity-100"
                      aria-label={`${name} 수정`}
                      title="수정"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        startEdit(name);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-70 hover:bg-muted hover:text-foreground hover:opacity-100"
                      aria-label={`${name} 삭제`}
                      title="삭제"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void handleDelete(name);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
          <div className="border-t border-slate-200/80 p-2">
            <div className="flex items-center gap-1.5">
              <ImeSafeInput
                value={draft}
                onChange={setDraft}
                placeholder="원장님 성함 추가"
                className="h-9 flex-1 text-sm"
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (canAdd) void handleAdd();
                }}
              />
              <Button
                type="button"
                size="sm"
                className="h-9 shrink-0 gap-1 px-2.5"
                disabled={!canAdd}
                onClick={() => void handleAdd()}
              >
                <Plus className="h-3.5 w-3.5" />
                추가
              </Button>
            </div>
            {selected ? (
              <button
                type="button"
                className="mt-1.5 w-full rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => selectName("")}
              >
                선택 해제
              </button>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

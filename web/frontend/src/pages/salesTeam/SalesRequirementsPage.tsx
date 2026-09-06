// related files:
// - web/frontend/src/pages/salesTeam/salesTeamApi.ts
// - web/frontend/src/pages/salesTeam/salesUi.tsx
// - web/frontend/src/pages/salesTeam/SalesPlaceSuggestInput.tsx
// - web/frontend/src/pages/salesTeam/SalesAccountsPage.tsx
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ClipboardList, Plus } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { cn } from "@/shared/ui/cn";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  KIND_LABEL,
  REQUIREMENT_DOC_STATUS_LABEL,
  REQUIREMENT_TARGET_LABEL,
  REQUIREMENT_TARGET_OPTIONS,
  REQUIREMENT_WORK_STATUS_LABEL,
  salesTeamApi,
  type CustomerRequirement,
  type CustomerRequirementTargetRole,
  type CustomerRequirementWorkStatus,
  type SalesPlaceSuggest,
} from "./salesTeamApi";
import SalesPlaceSuggestInput from "./SalesPlaceSuggestInput";
import {
  SalesEmptyState,
  SalesListRow,
  SalesPageShell,
  SalesPanel,
  SalesSegmentTabs,
  SalesSplit,
  SalesToolbar,
} from "./salesUi";

type StatusFilter = "all" | "active" | CustomerRequirement["status"];

const DEFAULT_TARGETS: CustomerRequirementTargetRole[] = ["internalLab"];

export default function SalesRequirementsPage() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const qc = useQueryClient();
  const role = String(user?.role || "");
  const canCreate = role === "salesTeam" || role === "admin";

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [placeQuery, setPlaceQuery] = useState("");
  const [pickedPlace, setPickedPlace] = useState<SalesPlaceSuggest | null>(
    null,
  );
  const [targets, setTargets] =
    useState<CustomerRequirementTargetRole[]>(DEFAULT_TARGETS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [workStatus, setWorkStatus] =
    useState<CustomerRequirementWorkStatus>("inProgress");
  const [workNote, setWorkNote] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const resetForm = () => {
    setTitle("");
    setBody("");
    setPlaceQuery("");
    setPickedPlace(null);
    setTargets(DEFAULT_TARGETS);
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["sales-team-requirements"],
    enabled: Boolean(token),
    queryFn: () => salesTeamApi.listRequirements(token),
  });

  const { data: detail } = useQuery({
    queryKey: ["sales-team-requirement", selectedId],
    enabled: Boolean(token && selectedId),
    queryFn: () => salesTeamApi.getRequirement(token, selectedId!),
  });

  const createMut = useMutation({
    mutationFn: () =>
      salesTeamApi.createRequirement(token, {
        title,
        body,
        customerName: (pickedPlace?.name || placeQuery).trim(),
        accountId: pickedPlace?.accountId || null,
        targetRoles: targets,
      }),
    onSuccess: () => {
      toast({ title: "요구사항이 등록되었습니다." });
      setShowForm(false);
      resetForm();
      void qc.invalidateQueries({ queryKey: ["sales-team-requirements"] });
    },
    onError: (e: Error) =>
      toast({ title: e.message, variant: "destructive" }),
  });

  const closeForm = () => {
    if (createMut.isPending) return;
    setShowForm(false);
    resetForm();
  };

  const workMut = useMutation({
    mutationFn: () =>
      salesTeamApi.updateRequirementWork(token, selectedId!, {
        status: workStatus,
        note: workNote,
      }),
    onSuccess: () => {
      toast({ title: "업무 상태가 업데이트되었습니다." });
      void qc.invalidateQueries({ queryKey: ["sales-team-requirements"] });
      void qc.invalidateQueries({
        queryKey: ["sales-team-requirement", selectedId],
      });
    },
    onError: (e: Error) =>
      toast({ title: e.message, variant: "destructive" }),
  });

  const statusMut = useMutation({
    mutationFn: (status: CustomerRequirement["status"]) =>
      salesTeamApi.updateRequirement(token, selectedId!, { status }),
    onSuccess: () => {
      toast({ title: "상태가 변경되었습니다." });
      void qc.invalidateQueries({ queryKey: ["sales-team-requirements"] });
      void qc.invalidateQueries({
        queryKey: ["sales-team-requirement", selectedId],
      });
    },
    onError: (e: Error) =>
      toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: () => salesTeamApi.deleteRequirement(token, selectedId!),
    onSuccess: () => {
      toast({ title: "삭제되었습니다." });
      setDeleteConfirmOpen(false);
      setSelectedId(null);
      void qc.invalidateQueries({ queryKey: ["sales-team-requirements"] });
    },
    onError: (e: Error) =>
      toast({ title: e.message, variant: "destructive" }),
  });

  const items = data?.items || [];
  const filtered = useMemo(() => {
    if (statusFilter === "all") return items;
    if (statusFilter === "active") {
      return items.filter(
        (i) => i.status === "open" || i.status === "inProgress",
      );
    }
    return items.filter((i) => i.status === statusFilter);
  }, [items, statusFilter]);

  const openCount = items.filter((i) => i.status === "open").length;
  const activeCount = items.filter(
    (i) => i.status === "open" || i.status === "inProgress",
  ).length;
  const doneCount = items.filter((i) => i.status === "done").length;

  const isTargetOfSelected = useMemo(() => {
    if (!detail) return false;
    return (detail.targetRoles || []).includes(
      role as CustomerRequirementTargetRole,
    );
  }, [detail, role]);

  const myWork = useMemo(() => {
    if (!detail || !user?._id) return null;
    const updates = detail.workUpdates || [];
    return (
      updates.find(
        (w) =>
          String(w.role) === role && String(w.userId) === String(user._id),
      ) || null
    );
  }, [detail, role, user?._id]);

  const canSubmit =
    Boolean(title.trim()) && targets.length > 0 && !createMut.isPending;

  const toggleTarget = (t: CustomerRequirementTargetRole) => {
    setTargets((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  };

  return (
    <SalesPageShell wide>
      <SalesToolbar className="w-full">
        <div className="flex w-full flex-wrap items-center gap-x-2 gap-y-2">
          <SalesSegmentTabs
            fit
            compact
            value={statusFilter}
            onChange={(v) => setStatusFilter(v)}
            options={[
              { value: "all", label: `전체 · ${items.length}` },
              { value: "active", label: `진행 · ${activeCount}` },
              { value: "open", label: `접수 · ${openCount}` },
              { value: "done", label: `완료 · ${doneCount}` },
            ]}
          />
          {canCreate ? (
            <div className="ml-auto shrink-0">
              <Button
                size="sm"
                className="h-8 gap-1"
                onClick={() => setShowForm(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                등록
              </Button>
            </div>
          ) : null}
        </div>
      </SalesToolbar>

      <SalesSplit
        primary={
          <SalesPanel
            title="보드"
            description={
              statusFilter === "all"
                ? "최근 등록순"
                : statusFilter === "active"
                  ? "접수·진행 중"
                  : `${REQUIREMENT_DOC_STATUS_LABEL[statusFilter as CustomerRequirement["status"]] || statusFilter}`
            }
            bodyClassName="lg:max-h-[min(74vh,48rem)] lg:overflow-y-auto"
          >
            {isLoading ? (
              <p className="text-sm text-muted-foreground">불러오는 중…</p>
            ) : error ? (
              <p className="text-sm text-destructive">
                {(error as Error).message}
              </p>
            ) : filtered.length === 0 ? (
              <SalesEmptyState
                icon={ClipboardList}
                title={
                  items.length === 0
                    ? "등록된 요구사항이 없습니다"
                    : "이 상태에 해당하는 항목이 없습니다"
                }
                description={
                  canCreate
                    ? "고객 현장에서 받은 요청을 등록하면 담당 팀이 업무를 업데이트합니다."
                    : "지정된 요구사항이 여기 표시됩니다."
                }
                actionLabel={canCreate ? "요구사항 등록" : undefined}
                onAction={canCreate ? () => setShowForm(true) : undefined}
              />
            ) : (
              <div className="space-y-2">
                {filtered.map((item) => (
                  <SalesListRow
                    key={item._id}
                    selected={selectedId === item._id}
                    onClick={() => {
                      setSelectedId((prev) =>
                        prev === item._id ? null : item._id,
                      );
                      const mine = (item.workUpdates || []).find(
                        (w) =>
                          String(w.role) === role &&
                          String(w.userId) === String(user?._id || ""),
                      );
                      setWorkStatus(mine?.status || "inProgress");
                      setWorkNote(mine?.note || "");
                    }}
                    title={item.title}
                    meta={
                      [item.customerName, item.createdByName]
                        .filter(Boolean)
                        .join(" · ") || "—"
                    }
                    trailing={
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant="secondary">
                          {REQUIREMENT_DOC_STATUS_LABEL[item.status] ||
                            item.status}
                        </Badge>
                        <div className="hidden flex-wrap justify-end gap-1 sm:flex">
                          {(item.targetRoles || []).slice(0, 2).map((t) => (
                            <Badge
                              key={t}
                              variant="outline"
                              className="text-[10px]"
                            >
                              {REQUIREMENT_TARGET_LABEL[t] || t}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    }
                  />
                ))}
              </div>
            )}
          </SalesPanel>
        }
        secondary={
          detail ? (
            <SalesPanel
              title={detail.title}
              description={
                detail.customerName
                  ? `고객: ${detail.customerName}`
                  : undefined
              }
              actions={
                <Badge>
                  {REQUIREMENT_DOC_STATUS_LABEL[detail.status] ||
                    detail.status}
                </Badge>
              }
              bodyClassName="lg:max-h-[min(74vh,48rem)] lg:overflow-y-auto"
            >
              <div className="space-y-4 text-sm">
                <div className="whitespace-pre-wrap rounded-xl bg-slate-50 px-3.5 py-3 leading-relaxed text-slate-800">
                  {detail.body || "(내용 없음)"}
                </div>

                <div>
                  <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                    담당 팀
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(detail.targetRoles || []).map((t) => (
                      <Badge key={t} variant="outline">
                        {REQUIREMENT_TARGET_LABEL[t] || t}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                    팀별 업무 업데이트
                  </div>
                  {(detail.workUpdates || []).length === 0 ? (
                    <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-xs text-muted-foreground">
                      아직 업데이트가 없습니다.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {(detail.workUpdates || []).map((w, i) => (
                        <div
                          key={w._id || `${w.role}-${w.userId}-${i}`}
                          className="rounded-xl border border-slate-200/80 px-3 py-2.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">
                              {REQUIREMENT_TARGET_LABEL[w.role] || w.role}
                              {w.userName ? ` · ${w.userName}` : ""}
                            </span>
                            <Badge variant="secondary">
                              {REQUIREMENT_WORK_STATUS_LABEL[w.status] ||
                                w.status}
                            </Badge>
                          </div>
                          {w.note ? (
                            <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                              {w.note}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {isTargetOfSelected ? (
                  <div className="space-y-2 rounded-xl border border-primary-muted/50 bg-primary-soft/20 p-3.5">
                    <div className="text-xs font-medium text-muted-foreground">
                      내 업무 업데이트
                      {myWork
                        ? ` (현재: ${REQUIREMENT_WORK_STATUS_LABEL[myWork.status]})`
                        : ""}
                    </div>
                    <Select
                      value={workStatus}
                      onValueChange={(v) =>
                        setWorkStatus(v as CustomerRequirementWorkStatus)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todo">대기</SelectItem>
                        <SelectItem value="inProgress">진행중</SelectItem>
                        <SelectItem value="done">완료</SelectItem>
                      </SelectContent>
                    </Select>
                    <Textarea
                      rows={3}
                      placeholder="진행 메모"
                      value={workNote}
                      onChange={(e) => setWorkNote(e.target.value)}
                    />
                    <Button
                      size="sm"
                      disabled={workMut.isPending}
                      onClick={() => workMut.mutate()}
                    >
                      업무 저장
                    </Button>
                  </div>
                ) : null}

                {canCreate ? (
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => statusMut.mutate("inProgress")}
                    >
                      진행중으로
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => statusMut.mutate("done")}
                    >
                      완료로
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => statusMut.mutate("canceled")}
                    >
                      취소
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setDeleteConfirmOpen(true)}
                    >
                      삭제
                    </Button>
                  </div>
                ) : null}
              </div>
            </SalesPanel>
          ) : undefined
        }
        secondaryEmpty={
          <SalesEmptyState
            className="h-full min-h-[20rem]"
            icon={ClipboardList}
            title="항목을 선택하세요"
            description="보드에서 요구사항을 누르면 상세와 업무 업데이트가 여기에 표시됩니다."
          />
        }
      />

      <Dialog
        open={showForm && canCreate}
        onOpenChange={(open) => {
          if (!open) closeForm();
          else setShowForm(true);
        }}
      >
        <DialogContent
          className="flex max-h-[min(90vh,40rem)] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-xl"
          closeClassName="z-50 right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-background opacity-100 shadow-sm ring-1 ring-slate-200/80 hover:bg-slate-50"
          closeIconClassName="h-5 w-5"
        >
          <DialogHeader className="relative z-0 shrink-0 space-y-1 border-b border-slate-100 bg-background px-4 py-3.5 pr-14 text-left sm:px-5 sm:pr-14">
            <DialogTitle>요구사항 등록</DialogTitle>
            <DialogDescription className="sr-only">
              제목과 담당 팀을 입력해 요구사항을 등록합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="relative z-0 min-h-0 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
            <div className="space-y-1.5">
              <Label htmlFor="requirement-title">
                제목 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="requirement-title"
                className="h-10 rounded-xl"
                placeholder="예: ○○치과 스캔 파일 재요청"
                value={title}
                autoFocus
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSubmit) {
                    e.preventDefault();
                    createMut.mutate();
                  }
                }}
              />
            </div>

            <div className="space-y-1.5">
              <Label>치과/기공소</Label>
              <SalesPlaceSuggestInput
                className="min-w-0"
                inputClassName="h-10 rounded-xl"
                listMode="inline"
                listClassName="max-h-[14rem] overflow-y-auto"
                maxItems={20}
                value={placeQuery}
                onChange={(v) => {
                  setPlaceQuery(v);
                  setPickedPlace(null);
                }}
                onPick={(item) => {
                  setPickedPlace(item);
                  setPlaceQuery(item.name);
                }}
                placeholder="지역명 상호 · 예: 거제 서울미소"
              />
              {pickedPlace ? (
                <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-700">
                  <span className="font-medium text-slate-900">
                    {KIND_LABEL[pickedPlace.kind] || pickedPlace.kind}
                    {" · "}
                    {pickedPlace.address?.trim() || "주소 없음"}
                  </span>
                  {pickedPlace.phone ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · {pickedPlace.phone}
                    </span>
                  ) : null}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="requirement-body">상세 내용</Label>
              <Textarea
                id="requirement-body"
                className="min-h-[7.5rem] rounded-xl"
                placeholder="현장 요청, 납기, 제약 조건 등"
                rows={5}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <Label>
                  담당 팀 <span className="text-destructive">*</span>
                </Label>
                <span className="text-[11px] text-muted-foreground">
                  복수 선택 · {targets.length}개
                </span>
              </div>
              <div
                className="grid grid-cols-2 gap-2"
                role="group"
                aria-label="담당 팀"
              >
                {REQUIREMENT_TARGET_OPTIONS.map((t) => {
                  const on = targets.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleTarget(t)}
                      className={cn(
                        "flex h-11 items-center justify-between gap-2 rounded-xl border px-3 text-left text-sm font-medium transition-colors",
                        on
                          ? "border-primary/40 bg-primary-soft/60 text-primary-strong shadow-sm ring-1 ring-primary/20"
                          : "border-slate-200/80 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
                      )}
                    >
                      <span className="truncate">
                        {REQUIREMENT_TARGET_LABEL[t]}
                      </span>
                      <span
                        className={cn(
                          "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors",
                          on
                            ? "bg-primary text-primary-foreground"
                            : "bg-slate-100 text-transparent",
                        )}
                      >
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                    </button>
                  );
                })}
              </div>
              {targets.length === 0 ? (
                <p className="text-xs text-destructive">
                  담당 팀을 하나 이상 선택해 주세요.
                </p>
              ) : null}
            </div>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-slate-100 bg-background px-4 py-3 sm:space-x-0 sm:px-5">
            <Button
              variant="outline"
              onClick={closeForm}
              disabled={createMut.isPending}
            >
              취소
            </Button>
            <Button
              disabled={!canSubmit}
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending ? "저장 중…" : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !deleteMut.isPending) {
            setDeleteConfirmOpen(false);
          }
        }}
      >
        <AlertDialogContent className="rounded-2xl sm:max-w-md">
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle>이 요구사항을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {detail?.title
                ? `「${detail.title}」 요구사항을 삭제합니다. 되돌릴 수 없습니다.`
                : "선택한 요구사항을 삭제합니다. 되돌릴 수 없습니다."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:space-x-0">
            <AlertDialogCancel disabled={deleteMut.isPending}>
              취소
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!selectedId || deleteMut.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (!selectedId) return;
                deleteMut.mutate();
              }}
            >
              {deleteMut.isPending ? "삭제 중…" : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SalesPageShell>
  );
}

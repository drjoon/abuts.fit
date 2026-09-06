// related files:
// - web/frontend/src/pages/salesTeam/salesTeamApi.ts
// - web/frontend/src/pages/salesTeam/salesUi.tsx
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Filter } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  REQUIREMENT_DOC_STATUS_LABEL,
  REQUIREMENT_TARGET_LABEL,
  REQUIREMENT_TARGET_OPTIONS,
  REQUIREMENT_WORK_STATUS_LABEL,
  salesTeamApi,
  type CustomerRequirement,
  type CustomerRequirementTargetRole,
  type CustomerRequirementWorkStatus,
} from "./salesTeamApi";
import {
  SalesEmptyState,
  SalesListRow,
  SalesPageShell,
  SalesPanel,
  SalesStatCard,
} from "./salesUi";

type StatusFilter = "all" | "active" | CustomerRequirement["status"];

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
  const [customerName, setCustomerName] = useState("");
  const [targets, setTargets] = useState<CustomerRequirementTargetRole[]>([
    "internalLab",
  ]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [workStatus, setWorkStatus] =
    useState<CustomerRequirementWorkStatus>("inProgress");
  const [workNote, setWorkNote] = useState("");

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
        customerName,
        targetRoles: targets,
      }),
    onSuccess: () => {
      toast({ title: "요구사항이 등록되었습니다." });
      setShowForm(false);
      setTitle("");
      setBody("");
      setCustomerName("");
      void qc.invalidateQueries({ queryKey: ["sales-team-requirements"] });
    },
    onError: (e: Error) =>
      toast({ title: e.message, variant: "destructive" }),
  });

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

  const toggleTarget = (t: CustomerRequirementTargetRole) => {
    setTargets((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  };

  return (
    <SalesPageShell
      title="고객 요구사항"
      subtitle={
        canCreate
          ? "고객 요청을 내부 팀(기공실·DevOps 등)에 전달하고 진행 상태를 추적합니다."
          : "나에게 지정된 요구사항을 확인하고 업무 상태를 업데이트합니다."
      }
      actions={
        canCreate ? (
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "닫기" : "요구사항 등록"}
          </Button>
        ) : null
      }
    >
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <SalesStatCard
          label="전체"
          value={items.length}
          icon={ClipboardList}
          onClick={() => setStatusFilter("all")}
          selected={statusFilter === "all"}
        />
        <SalesStatCard
          label="접수"
          value={openCount}
          onClick={() => setStatusFilter("open")}
          selected={statusFilter === "open"}
        />
        <SalesStatCard
          label="진행 중"
          value={activeCount}
          hint="접수+진행"
          icon={Filter}
          onClick={() => setStatusFilter("active")}
          selected={statusFilter === "active"}
        />
        <SalesStatCard
          label="완료"
          value={doneCount}
          tone={doneCount > 0 ? "ok" : "default"}
          onClick={() => setStatusFilter("done")}
          selected={statusFilter === "done"}
        />
      </div>

      {showForm && canCreate ? (
        <SalesPanel
          title="요구사항 등록"
          description="제목·고객·상세·담당 팀을 지정합니다."
        >
          <div className="space-y-3">
            <Input
              placeholder="제목 *"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Input
              placeholder="고객명 (선택)"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
            <Textarea
              placeholder="상세 내용 — 현장 요청, 납기, 제약 조건"
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                담당 팀 (복수 선택)
              </div>
              <div className="flex flex-wrap gap-2">
                {REQUIREMENT_TARGET_OPTIONS.map((t) => {
                  const on = targets.includes(t);
                  return (
                    <Button
                      key={t}
                      type="button"
                      size="sm"
                      variant={on ? "default" : "outline"}
                      onClick={() => toggleTarget(t)}
                    >
                      {REQUIREMENT_TARGET_LABEL[t]}
                    </Button>
                  );
                })}
              </div>
            </div>
            <Button
              size="sm"
              disabled={
                !title.trim() || targets.length === 0 || createMut.isPending
              }
              onClick={() => createMut.mutate()}
            >
              저장
            </Button>
          </div>
        </SalesPanel>
      ) : null}

      <SalesPanel
        title="요구사항 보드"
        description={
          statusFilter === "all"
            ? "최근 등록순 · 카드를 눌러 상세를 엽니다."
            : statusFilter === "active"
              ? "접수·진행 중만 표시"
              : `${REQUIREMENT_DOC_STATUS_LABEL[statusFilter] || statusFilter}만 표시`
        }
        actions={
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as StatusFilter)}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="active">진행 중(접수+)</SelectItem>
              <SelectItem value="open">접수</SelectItem>
              <SelectItem value="inProgress">진행중</SelectItem>
              <SelectItem value="done">완료</SelectItem>
              <SelectItem value="canceled">취소</SelectItem>
            </SelectContent>
          </Select>
        }
      >
        {isLoading ? (
          <p className="text-sm text-muted-foreground">불러오는 중…</p>
        ) : error ? (
          <p className="text-sm text-destructive">{(error as Error).message}</p>
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
                  setSelectedId(item._id);
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
                      {REQUIREMENT_DOC_STATUS_LABEL[item.status] || item.status}
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

      {detail ? (
        <SalesPanel
          title={detail.title}
          description={
            detail.customerName ? `고객: ${detail.customerName}` : undefined
          }
          actions={
            <Badge>
              {REQUIREMENT_DOC_STATUS_LABEL[detail.status] || detail.status}
            </Badge>
          }
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
                          {REQUIREMENT_WORK_STATUS_LABEL[w.status] || w.status}
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
                  onClick={() => {
                    if (confirm("이 요구사항을 삭제할까요?")) {
                      deleteMut.mutate();
                    }
                  }}
                >
                  삭제
                </Button>
              </div>
            ) : null}

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedId(null)}
            >
              닫기
            </Button>
          </div>
        </SalesPanel>
      ) : null}
    </SalesPageShell>
  );
}

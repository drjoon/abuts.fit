// related files:
// - web/frontend/src/pages/salesTeam/salesTeamApi.ts
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="mx-auto max-w-3xl space-y-4 p-3 pb-24 sm:pb-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">고객 요구사항</h1>
          <p className="text-sm text-muted-foreground">
            {canCreate
              ? "대상을 지정해 요구사항을 등록합니다. 대상 팀은 업무 상태를 업데이트합니다."
              : "나에게 지정된 요구사항을 확인하고 업무를 업데이트합니다."}
          </p>
        </div>
        {canCreate ? (
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "닫기" : "등록"}
          </Button>
        ) : null}
      </div>

      {showForm && canCreate ? (
        <Card>
          <CardHeader className="p-3">
            <CardTitle className="text-base">요구사항 등록</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-3 pt-0">
            <Input
              placeholder="제목"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Input
              placeholder="고객명 (선택)"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
            <Textarea
              placeholder="상세 내용"
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <div>
              <div className="mb-1.5 text-xs text-muted-foreground">
                대상 (복수 선택)
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
              disabled={!title.trim() || targets.length === 0 || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              저장
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">불러오는 중…</p>
        ) : error ? (
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">요구사항이 없습니다.</p>
        ) : (
          items.map((item) => (
            <button
              key={item._id}
              type="button"
              className="w-full rounded-md border px-3 py-2.5 text-left hover:bg-muted/40"
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
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{item.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {[item.customerName, item.createdByName]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </div>
                </div>
                <Badge variant="secondary">
                  {REQUIREMENT_DOC_STATUS_LABEL[item.status] || item.status}
                </Badge>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {(item.targetRoles || []).map((t) => (
                  <Badge key={t} variant="outline" className="text-[10px]">
                    {REQUIREMENT_TARGET_LABEL[t] || t}
                  </Badge>
                ))}
              </div>
            </button>
          ))
        )}
      </div>

      {detail ? (
        <Card>
          <CardHeader className="space-y-1 p-3">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-base">{detail.title}</CardTitle>
              <Badge>
                {REQUIREMENT_DOC_STATUS_LABEL[detail.status] || detail.status}
              </Badge>
            </div>
            {detail.customerName ? (
              <p className="text-sm text-muted-foreground">
                고객: {detail.customerName}
              </p>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-3 p-3 pt-0 text-sm">
            <div className="whitespace-pre-wrap rounded-md bg-muted/40 p-3">
              {detail.body || "(내용 없음)"}
            </div>

            <div>
              <div className="mb-1 text-xs text-muted-foreground">대상</div>
              <div className="flex flex-wrap gap-1">
                {(detail.targetRoles || []).map((t) => (
                  <Badge key={t} variant="outline">
                    {REQUIREMENT_TARGET_LABEL[t] || t}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1 text-xs text-muted-foreground">
                팀별 업무 업데이트
              </div>
              {(detail.workUpdates || []).length === 0 ? (
                <p className="text-xs text-muted-foreground">아직 없습니다.</p>
              ) : (
                <div className="space-y-1.5">
                  {(detail.workUpdates || []).map((w, i) => (
                    <div
                      key={w._id || `${w.role}-${w.userId}-${i}`}
                      className="rounded-md border px-2.5 py-2"
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
                        <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">
                          {w.note}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {isTargetOfSelected ? (
              <div className="space-y-2 rounded-md border p-3">
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
              <div className="flex flex-wrap gap-1">
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

            <Button size="sm" variant="ghost" onClick={() => setSelectedId(null)}>
              닫기
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

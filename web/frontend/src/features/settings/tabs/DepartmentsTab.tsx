// related files:
// - web/frontend/src/pages/admin/settings/SettingsPage.tsx
// - web/backend/controllers/businesses/business.department.controller.js
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FunctionalItemCard } from "@/shared/ui/components/FunctionalItemCard";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { Building2, Loader2, Pencil, Plus } from "lucide-react";

type DepartmentRow = {
  _id: string;
  name: string;
  sortOrder?: number;
};

export const DepartmentsTab = () => {
  const { toast } = useToast();
  const { token } = useAuthStore();
  const businessType = "admin";

  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [editingName, setEditingName] = useState("");
  const [savingId, setSavingId] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const refreshDepartments = useCallback(async () => {
    if (!token) return;
    const res = await request<{ data?: { departments?: DepartmentRow[] } }>({
      path: `/api/businesses/departments?businessType=${encodeURIComponent(businessType)}`,
      method: "GET",
      token,
    });
    if (!res.ok) {
      setDepartments([]);
      return;
    }
    const body = res.data || {};
    const data = (body as { data?: { departments?: DepartmentRow[] } }).data || body;
    setDepartments(Array.isArray(data?.departments) ? data.departments : []);
  }, [token]);

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      setLoading(true);
      try {
        await refreshDepartments();
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [refreshDepartments, token]);

  const sortedDepartments = useMemo(() => {
    return [...departments].sort((a, b) => {
      const orderDiff = Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0);
      if (orderDiff !== 0) return orderDiff;
      return String(a.name).localeCompare(String(b.name), "ko");
    });
  }, [departments]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || !token) return;
    setCreating(true);
    try {
      const res = await request<{ message?: string }>({
        path: `/api/businesses/departments?businessType=${encodeURIComponent(businessType)}`,
        method: "POST",
        token,
        jsonBody: { name, businessType },
      });
      if (!res.ok) {
        toast({
          title: "부서 추가에 실패했어요",
          description: String((res.data as { message?: string })?.message || ""),
          variant: "destructive",
        });
        return;
      }
      setNewName("");
      toast({ title: "부서가 추가되었습니다" });
      await refreshDepartments();
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (row: DepartmentRow) => {
    setEditingId(row._id);
    setEditingName(row.name);
  };

  const cancelEdit = () => {
    setEditingId("");
    setEditingName("");
  };

  const handleSaveEdit = async (departmentId: string) => {
    const name = editingName.trim();
    if (!name || !token) return;
    setSavingId(departmentId);
    try {
      const res = await request<{ message?: string }>({
        path: `/api/businesses/departments/${departmentId}?businessType=${encodeURIComponent(businessType)}`,
        method: "PATCH",
        token,
        jsonBody: { name, businessType },
      });
      if (!res.ok) {
        toast({
          title: "부서 수정에 실패했어요",
          description: String((res.data as { message?: string })?.message || ""),
          variant: "destructive",
        });
        return;
      }
      toast({ title: "부서 이름이 수정되었습니다" });
      cancelEdit();
      await refreshDepartments();
    } finally {
      setSavingId("");
    }
  };

  const handleDelete = async (departmentId: string) => {
    if (!token) return;
    setDeletingId(departmentId);
    try {
      const res = await request<{ message?: string }>({
        path: `/api/businesses/departments/${departmentId}?businessType=${encodeURIComponent(businessType)}`,
        method: "DELETE",
        token,
        jsonBody: { businessType },
      });
      if (!res.ok) {
        toast({
          title: "부서 삭제에 실패했어요",
          description: String((res.data as { message?: string })?.message || ""),
          variant: "destructive",
        });
        return;
      }
      toast({ title: "부서가 삭제되었습니다" });
      await refreshDepartments();
    } finally {
      setDeletingId("");
    }
  };

  return (
    <Card className="app-glass-card app-glass-card--lg">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-5 w-5 text-primary-strong" />
          부서 관리
        </CardTitle>
        <CardDescription className="text-[13px] leading-relaxed">
          어벗츠 임직원을 배치할 부서를 추가·편집합니다. 사이드바 계정 전환은
          같은 부서 계정만 표시됩니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <section className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                새 부서 이름
              </label>
              <Input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="예: 고객지원부"
                disabled={creating}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleCreate();
                  }
                }}
              />
            </div>
            <Button
              type="button"
              className="shrink-0"
              disabled={creating || !newName.trim()}
              onClick={() => void handleCreate()}
            >
              {creating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              부서 추가
            </Button>
          </div>

          {loading && sortedDepartments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200/90 bg-white/50 px-6 py-8 text-center text-sm text-muted-foreground">
              불러오는 중...
            </div>
          ) : sortedDepartments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200/90 bg-white/50 px-6 py-8 text-center text-sm text-muted-foreground">
              등록된 부서가 없습니다.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sortedDepartments.map((row) => {
                const isEditing = editingId === row._id;
                return (
                  <FunctionalItemCard
                    key={row._id}
                    className="overflow-hidden rounded-2xl border-slate-200/80 bg-white/80 p-0 shadow-sm"
                    onRemove={() => handleDelete(row._id)}
                    confirmTitle="부서를 삭제할까요?"
                    confirmDescription={
                      <div className="text-sm text-muted-foreground">
                        {row.name}
                        <div className="mt-1 text-xs">
                          소속 임직원이 있으면 삭제할 수 없습니다.
                        </div>
                      </div>
                    }
                    confirmLabel="삭제"
                    cancelLabel="닫기"
                    disabled={deletingId === row._id || savingId === row._id}
                  >
                    <div className="border-t-4 border-primary-strong">
                      <div className="space-y-3 px-3.5 py-3 pr-8">
                        {isEditing ? (
                          <>
                            <Input
                              value={editingName}
                              onChange={(event) =>
                                setEditingName(event.target.value)
                              }
                              disabled={savingId === row._id}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  void handleSaveEdit(row._id);
                                }
                              }}
                            />
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                size="sm"
                                className="h-8 flex-1 rounded-lg text-xs"
                                disabled={
                                  savingId === row._id || !editingName.trim()
                                }
                                onClick={() => void handleSaveEdit(row._id)}
                              >
                                저장
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 flex-1 rounded-lg text-xs"
                                disabled={savingId === row._id}
                                onClick={cancelEdit}
                              >
                                취소
                              </Button>
                            </div>
                          </>
                        ) : (
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold text-slate-900">
                                {row.name}
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              disabled={deletingId === row._id}
                              onClick={() => startEdit(row)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </FunctionalItemCard>
                );
              })}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
};

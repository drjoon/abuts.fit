// related files:
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx
// - web/backend/controllers/dashboardNotice.controller.js
// - web/frontend/src/shared/notices/DashboardNoticeAlert.tsx
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { apiFetch, invalidateApiGetCache } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { cn } from "@/shared/ui/cn";
import { useAuthStore } from "@/store/useAuthStore";
import {
  NOTICE_AUDIENCE_OPTIONS,
  noticeAudienceLabel,
  type DashboardNotice,
  type NoticeAudience,
} from "@/shared/notices/dashboardNotice";

type ListResponse = {
  success?: boolean;
  message?: string;
  data?: { items?: DashboardNotice[] };
};

type SaveResponse = {
  success?: boolean;
  message?: string;
  data?: DashboardNotice;
};

type Draft = {
  id?: string;
  title: string;
  body: string;
  audiences: NoticeAudience[];
  published: boolean;
  startsAt: string;
  endsAt: string;
  images: DashboardNotice["images"];
};

const CARD_ITEMS = 2;

const EMPTY_DRAFT: Draft = {
  title: "",
  body: "",
  audiences: [],
  published: true,
  startsAt: "",
  endsAt: "",
  images: [],
};

function kstDateTimeLocal(iso: string | null | undefined) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${pick("year")}-${pick("month")}-${pick("day")}T${pick("hour")}:${pick("minute")}`;
}

function fromDateTimeLocal(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withSeconds = trimmed.length === 16 ? `${trimmed}:00` : trimmed;
  const date = new Date(`${withSeconds}+09:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function formatKstRange(item: DashboardNotice) {
  const end = item.endsAt
    ? new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(item.endsAt))
    : "";
  if (!item.published) return "내림";
  if (end) return `${end}까지`;
  return "게시 중";
}

export function NoticeAdminCard({ className }: { className?: string }) {
  const token = useAuthStore((s) => s.token);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [listOpen, setListOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DashboardNotice | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["admin-dashboard-notices"],
    enabled: Boolean(token),
    queryFn: async () => {
      const res = await apiFetch<ListResponse>({
        path: "/api/admin/notices",
        token,
        skipCache: true,
      });
      if (!res.ok || res.data?.success === false) {
        throw new Error(res.data?.message || "공지 목록을 불러오지 못했습니다.");
      }
      return res.data?.data?.items || [];
    },
  });

  const pendingPreviews = useMemo(
    () => pendingFiles.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [pendingFiles],
  );

  const refresh = async () => {
    invalidateApiGetCache("/api/notices/active");
    invalidateApiGetCache("/api/admin/notices");
    await queryClient.invalidateQueries({ queryKey: ["admin-dashboard-notices"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard-notices-active"] });
  };

  const openCreate = () => {
    setPendingFiles([]);
    setDraft({ ...EMPTY_DRAFT, audiences: [] });
  };

  const openEdit = (item: DashboardNotice) => {
    setPendingFiles([]);
    setDraft({
      id: item.id,
      title: item.title,
      body: item.body,
      audiences: item.audiences,
      published: item.published,
      startsAt: kstDateTimeLocal(item.startsAt),
      endsAt: kstDateTimeLocal(item.endsAt),
      images: item.images || [],
    });
  };

  const toggleAudience = (id: NoticeAudience) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const has = prev.audiences.includes(id);
      return {
        ...prev,
        audiences: has
          ? prev.audiences.filter((audience) => audience !== id)
          : [...prev.audiences, id],
      };
    });
  };

  const save = async () => {
    if (!draft || saving) return;
    const startsAt = fromDateTimeLocal(draft.startsAt);
    const endsAt = fromDateTimeLocal(draft.endsAt);
    if (draft.startsAt.trim() && !startsAt) {
      toast({ title: "게시 시작 시각이 올바르지 않습니다.", variant: "destructive" });
      return;
    }
    if (draft.endsAt.trim() && !endsAt) {
      toast({ title: "게시 종료 시각이 올바르지 않습니다.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: draft.title.trim(),
        body: draft.body.trim(),
        audiences: draft.audiences,
        published: draft.published,
        startsAt,
        endsAt,
      };
      const res = await apiFetch<SaveResponse>({
        path: draft.id ? `/api/admin/notices/${draft.id}` : "/api/admin/notices",
        method: draft.id ? "PATCH" : "POST",
        token,
        jsonBody: payload,
      });
      if (!res.ok || res.data?.success === false || !res.data?.data?.id) {
        throw new Error(res.data?.message || "공지를 저장하지 못했습니다.");
      }
      const id = res.data.data.id;
      for (const file of pendingFiles) {
        const body = new FormData();
        body.append("image", file);
        const uploaded = await apiFetch<SaveResponse>({
          path: `/api/admin/notices/${id}/images`,
          method: "POST",
          token,
          body,
        });
        if (!uploaded.ok || uploaded.data?.success === false) {
          throw new Error(uploaded.data?.message || "이미지를 올리지 못했습니다.");
        }
      }
      toast({ title: "공지를 저장했습니다." });
      setDraft(null);
      setPendingFiles([]);
      await refresh();
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "공지를 저장하지 못했습니다.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const removeImage = async (key: string) => {
    if (!draft?.id || !key) return;
    const res = await apiFetch<SaveResponse>({
      path: `/api/admin/notices/${draft.id}/images`,
      method: "DELETE",
      token,
      jsonBody: { key },
    });
    if (!res.ok || res.data?.success === false || !res.data?.data) {
      toast({
        title: res.data?.message || "이미지를 삭제하지 못했습니다.",
        variant: "destructive",
      });
      return;
    }
    setDraft((prev) =>
      prev ? { ...prev, images: res.data?.data?.images || [] } : prev,
    );
    await refresh();
  };

  const removeNotice = async () => {
    if (!deleteTarget) return;
    const res = await apiFetch({
      path: `/api/admin/notices/${deleteTarget.id}`,
      method: "DELETE",
      token,
    });
    if (!res.ok) {
      toast({ title: "공지를 삭제하지 못했습니다.", variant: "destructive" });
      return;
    }
    setDeleteTarget(null);
    toast({ title: "공지를 삭제했습니다." });
    await refresh();
  };

  const renderItem = (item: DashboardNotice, compact: boolean) => (
    <li
      key={item.id}
      className={
        compact
          ? "flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white/70 px-2.5 py-1.5"
          : "flex items-start justify-between gap-2 rounded-md border border-slate-200 bg-white/70 px-3 py-2"
      }
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {item.audiences.map(noticeAudienceLabel).join(" · ") || "대상 없음"}
          {" · "}
          {formatKstRange(item)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          aria-label="공지 수정"
          onClick={() => openEdit(item)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          aria-label="공지 삭제"
          onClick={() => setDeleteTarget(item)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </li>
  );

  const preview = items.slice(0, CARD_ITEMS);

  return (
    <>
      <Card className={cn("app-glass-card app-glass-card--lg", className)}>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
            <Megaphone className="h-4 w-4 text-muted-foreground" />
            공지 관리
            {items.length > 0 ? (
              <span className="text-xs font-normal text-muted-foreground">{items.length}건</span>
            ) : null}
          </CardTitle>
          <div className="flex items-center gap-1">
            {items.length > CARD_ITEMS ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => setListOpen(true)}
              >
                전체 보기
              </Button>
            ) : null}
            <Button type="button" size="sm" className="h-7 px-2.5 text-xs" onClick={openCreate}>
              새 공지
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-xs text-muted-foreground">불러오는 중…</p>
          ) : items.length === 0 ? (
            <p className="text-xs text-muted-foreground">등록된 공지가 없습니다.</p>
          ) : (
            <ul className="space-y-1.5">{preview.map((item) => renderItem(item, true))}</ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={listOpen} onOpenChange={setListOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>공지 {items.length}건</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            대상 대시보드 상단에 제목 한 줄이 보입니다.
            <br />
            클릭하면 내용과 이미지를 볼 수 있습니다.
          </p>
          <ul className="space-y-2">{items.map((item) => renderItem(item, false))}</ul>
          <DialogFooter>
            <Button type="button" size="sm" onClick={openCreate}>
              새 공지
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(draft)}
        onOpenChange={(next) => {
          if (!next && !saving) {
            setDraft(null);
            setPendingFiles([]);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "공지 수정" : "새 공지"}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>대상</Label>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {NOTICE_AUDIENCE_OPTIONS.map((option) => (
                    <label
                      key={option.id}
                      className="inline-flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={draft.audiences.includes(option.id)}
                        onCheckedChange={() => toggleAudience(option.id)}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notice-title">제목</Label>
                <Input
                  id="notice-title"
                  value={draft.title}
                  maxLength={200}
                  onChange={(event) =>
                    setDraft({ ...draft, title: event.target.value })
                  }
                  placeholder="대시보드에 한 줄로 보입니다"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notice-body">내용</Label>
                <Textarea
                  id="notice-body"
                  value={draft.body}
                  maxLength={4000}
                  rows={4}
                  onChange={(event) =>
                    setDraft({ ...draft, body: event.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="notice-start">게시 시작 (KST)</Label>
                  <Input
                    id="notice-start"
                    type="datetime-local"
                    value={draft.startsAt}
                    onChange={(event) =>
                      setDraft({ ...draft, startsAt: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notice-end">게시 종료 (KST)</Label>
                  <Input
                    id="notice-end"
                    type="datetime-local"
                    value={draft.endsAt}
                    onChange={(event) =>
                      setDraft({ ...draft, endsAt: event.target.value })
                    }
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                비우면 기간 제한 없이 게시됩니다.
                <br />
                종료 시각이 지나면 대시보드에서 내려갑니다.
              </p>
              <div className="flex items-center gap-2">
                <Switch
                  checked={draft.published}
                  onCheckedChange={(checked) =>
                    setDraft({ ...draft, published: checked })
                  }
                  id="notice-published"
                />
                <Label htmlFor="notice-published">게시</Label>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notice-image">이미지</Label>
                <Input
                  id="notice-image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  onChange={(event) => {
                    const files = Array.from(event.target.files || []);
                    setPendingFiles((prev) => [...prev, ...files].slice(0, 4));
                    event.target.value = "";
                  }}
                />
                <div className="flex flex-wrap gap-2">
                  {draft.images.map((image) =>
                    image.url ? (
                      <div key={image.key || image.url} className="relative">
                        <img
                          src={image.url}
                          alt={image.fileName || "공지 이미지"}
                          className="h-16 w-16 rounded-md object-cover"
                        />
                        {image.key ? (
                          <button
                            type="button"
                            className="absolute -right-1 -top-1 rounded-full bg-white px-1 text-xs text-slate-700 shadow"
                            onClick={() => void removeImage(image.key || "")}
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                    ) : null,
                  )}
                  {pendingPreviews.map((preview, index) => (
                    <div key={preview.url} className="relative">
                      <img
                        src={preview.url}
                        alt={preview.file.name}
                        className="h-16 w-16 rounded-md object-cover"
                      />
                      <button
                        type="button"
                        className="absolute -right-1 -top-1 rounded-full bg-white px-1 text-xs text-slate-700 shadow"
                        onClick={() =>
                          setPendingFiles((prev) =>
                            prev.filter((_, fileIndex) => fileIndex !== index),
                          )
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => {
                setDraft(null);
                setPendingFiles([]);
              }}
            >
              취소
            </Button>
            <Button type="button" disabled={saving} onClick={() => void save()}>
              {saving ? "저장 중…" : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="공지를 삭제할까요?"
        description={deleteTarget?.title}
        confirmLabel="삭제"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void removeNotice()}
      />
    </>
  );
}

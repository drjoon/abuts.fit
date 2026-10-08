// related files:
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx
// - web/backend/controllers/dashboardNotice.controller.js
// - web/frontend/src/shared/notices/DashboardNoticeAlert.tsx
// - 2026-10-08: 편집 모달은 고정 헤더·푸터. 제목·내용은 여러 줄로 고친다.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Megaphone, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashTile } from "@/shared/ui/dashboard/DashTile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  NOTICE_DIALOG_BODY_CLASS,
  NOTICE_DIALOG_HEADER_CLASS,
  NOTICE_DIALOG_SHELL_CLASS,
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

type NoticePhase = "live" | "scheduled" | "ended" | "hidden";

const CARD_ITEMS = 2;
const MAX_IMAGES = 4;
const ALL_AUDIENCES = NOTICE_AUDIENCE_OPTIONS.map((option) => option.id);

const EMPTY_DRAFT: Draft = {
  title: "",
  body: "",
  audiences: [],
  published: true,
  startsAt: "",
  endsAt: "",
  images: [],
};

const PHASE_LABEL: Record<NoticePhase, string> = {
  live: "게시 중",
  scheduled: "예약",
  ended: "종료",
  hidden: "내림",
};

const PHASE_CLASS: Record<NoticePhase, string> = {
  live: "bg-emerald-50 text-emerald-700 ring-emerald-200/80",
  scheduled: "bg-sky-50 text-sky-700 ring-sky-200/80",
  ended: "bg-slate-100 text-slate-500 ring-slate-200/80",
  hidden: "bg-amber-50 text-amber-800 ring-amber-200/80",
};

const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

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

/** 종료일 당일 23:59:59 KST. */
function fromEndOfKstDay(ymd: string) {
  const day = ymd.trim().slice(0, 10);
  if (!day) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const date = new Date(`${day}T23:59:59+09:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function kstYmd(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDaysYmd(ymd: string, days: number) {
  const [year, month, day] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  const yy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(utc.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function formatKstDate(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
  }).format(new Date(iso));
}

function formatKstDateTime(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatSchedule(item: DashboardNotice) {
  const start = item.startsAt ? formatKstDateTime(item.startsAt) : "";
  const end = item.endsAt ? formatKstDate(item.endsAt) : "";
  if (start && end) return `${start} – ${end}`;
  if (end) return `${end}까지`;
  if (start) return `${start}부터`;
  return "기간 없음";
}

function noticePhase(item: DashboardNotice, now = new Date()): NoticePhase {
  if (!item.published) return "hidden";
  if (item.startsAt) {
    const start = new Date(item.startsAt);
    if (!Number.isNaN(start.getTime()) && start > now) return "scheduled";
  }
  if (item.endsAt) {
    const end = new Date(item.endsAt);
    if (!Number.isNaN(end.getTime()) && end < now) return "ended";
  }
  return "live";
}

function splitLocal(value: string) {
  if (!value) return { date: "", time: "" };
  return {
    date: value.slice(0, 10),
    time: value.length >= 16 ? value.slice(11, 16) : "",
  };
}

function NoticeRow({
  item,
  onEdit,
  onDelete,
}: {
  item: DashboardNotice;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const phase = noticePhase(item);
  return (
    <li className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
      <div className="flex items-start gap-1 p-1.5">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-2 rounded-lg px-1.5 py-1 text-left transition hover:bg-slate-50"
          aria-label="공지 수정"
          onClick={onEdit}
        >
          <span className="min-w-0 flex-1">
            <p className="line-clamp-1 text-sm font-medium leading-snug text-slate-900">
              {item.title}
            </p>
            <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className={cn(
                  "shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium ring-1",
                  PHASE_CLASS[phase],
                )}
              >
                {PHASE_LABEL[phase]}
              </span>
              <span className="truncate">
                {item.audiences.map(noticeAudienceLabel).join(" · ") || "대상 없음"}
                {" · "}
                {formatSchedule(item)}
              </span>
            </p>
          </span>
          <Pencil className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        </button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          aria-label="공지 삭제"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </li>
  );
}

function KstDateTimeFields({
  id,
  label,
  value,
  defaultTime,
  dateOnly,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  defaultTime: string;
  /** 날짜만. 시각은 호출 쪽에서 그날 끝으로 맞춘다. */
  dateOnly?: boolean;
  disabled?: boolean;
  onChange: (next: string) => void;
}) {
  const { date, time } = splitLocal(value);
  return (
    <div className="space-y-2 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3">
      <Label htmlFor={`${id}-date`}>{label}</Label>
      <Input
        id={`${id}-date`}
        type="date"
        value={date}
        disabled={disabled}
        className="bg-white"
        onChange={(event) => {
          const nextDate = event.target.value;
          if (!nextDate) {
            onChange("");
            return;
          }
          onChange(dateOnly ? nextDate : `${nextDate}T${time || defaultTime}`);
        }}
      />
      {!dateOnly && date ? (
        <Input
          id={`${id}-time`}
          type="time"
          value={time}
          disabled={disabled}
          className="bg-white"
          onChange={(event) => {
            onChange(`${date}T${event.target.value || "00:00"}`);
          }}
        />
      ) : null}
    </div>
  );
}

export function NoticeAdminCard({ className }: { className?: string }) {
  const token = useAuthStore((s) => s.token);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [listOpen, setListOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingPreviews, setPendingPreviews] = useState<{ name: string; url: string }[]>([]);
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

  useEffect(() => {
    const next = pendingFiles.map((file) => ({
      name: file.name,
      url: URL.createObjectURL(file),
    }));
    setPendingPreviews(next);
    return () => {
      next.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [pendingFiles]);

  const refresh = async () => {
    invalidateApiGetCache("/api/notices/active");
    invalidateApiGetCache("/api/admin/notices");
    await queryClient.invalidateQueries({ queryKey: ["admin-dashboard-notices"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard-notices-active"] });
  };

  const closeEditor = () => {
    if (saving) return;
    setEditorOpen(false);
    setPendingFiles([]);
  };

  const openCreate = () => {
    setPendingFiles([]);
    setDraft({ ...EMPTY_DRAFT, audiences: [...ALL_AUDIENCES] });
    setEditorOpen(true);
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
      endsAt: item.endsAt ? kstYmd(new Date(item.endsAt)) : "",
      images: item.images || [],
    });
    setEditorOpen(true);
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

  const addImages = (list: FileList | File[] | null) => {
    if (!draft) return;
    const incoming = Array.from(list || []).filter((file) => file.type.startsWith("image/"));
    if (!incoming.length) return;
    const room = MAX_IMAGES - draft.images.length;
    if (room <= 0) {
      toast({ title: "이미지는 4장까지 첨부할 수 있습니다.", variant: "destructive" });
      return;
    }
    setPendingFiles((prev) => [...prev, ...incoming].slice(0, room));
  };

  const save = async () => {
    if (!draft || saving) return;
    const titleSource = draft.title.replace(/\s+/g, " ").trim();
    const bodySource = draft.body.trim();
    const title = (titleSource || bodySource.split(/\n/)[0] || "").slice(0, 200);
    const body = bodySource || titleSource;
    if (!title || !body) {
      toast({ title: "내용을 입력해 주세요.", variant: "destructive" });
      return;
    }
    if (!draft.audiences.length) {
      toast({ title: "대상을 한 곳 이상 선택해 주세요.", variant: "destructive" });
      return;
    }
    const startsAt = fromDateTimeLocal(draft.startsAt);
    const endsAt = fromEndOfKstDay(draft.endsAt);
    if (draft.startsAt.trim() && !startsAt) {
      toast({ title: "게시 시작 시각이 올바르지 않습니다.", variant: "destructive" });
      return;
    }
    if (draft.endsAt.trim() && !endsAt) {
      toast({ title: "게시 종료일이 올바르지 않습니다.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title,
        body,
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
        const form = new FormData();
        form.append("image", file);
        const uploaded = await apiFetch<SaveResponse>({
          path: `/api/admin/notices/${id}/images`,
          method: "POST",
          token,
          body: form,
        });
        if (!uploaded.ok || uploaded.data?.success === false) {
          throw new Error(uploaded.data?.message || "이미지를 올리지 못했습니다.");
        }
      }
      toast({ title: "공지를 저장했습니다." });
      setEditorOpen(false);
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

  const preview = items.slice(0, CARD_ITEMS);
  const allAudiencesOn = Boolean(
    draft && ALL_AUDIENCES.every((id) => draft.audiences.includes(id)),
  );
  const imageCount = (draft?.images.length || 0) + pendingFiles.length;
  const today = kstYmd();
  const endPresets = [
    { label: "오늘", value: today },
    { label: "3일 후", value: addDaysYmd(today, 3) },
    { label: "7일 후", value: addDaysYmd(today, 7) },
  ];

  return (
    <>
      <DashTile
        className={className}
        bodyClassName="overflow-y-auto px-1.5 py-1.5"
        title={
          <>
            <Megaphone className="h-4 w-4 shrink-0" />
            공지 관리
            {items.length > 0 ? <span className="font-normal">{items.length}건</span> : null}
          </>
        }
        extra={
          <div className="flex shrink-0 items-center gap-1">
            {items.length > CARD_ITEMS ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                onClick={() => setListOpen(true)}
              >
                전체 보기
              </Button>
            ) : null}
            <Button type="button" size="sm" className="h-6 px-2.5 text-xs" onClick={openCreate}>
              새 공지
            </Button>
          </div>
        }
      >
        {isLoading ? (
          <p className="text-xs text-muted-foreground">불러오는 중…</p>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-3 py-6 text-center text-xs text-muted-foreground">
            등록된 공지가 없습니다.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {preview.map((item) => (
              <NoticeRow
                key={item.id}
                item={item}
                onEdit={() => openEdit(item)}
                onDelete={() => setDeleteTarget(item)}
              />
            ))}
          </ul>
        )}
      </DashTile>

      <Dialog open={listOpen} onOpenChange={setListOpen}>
        <DialogContent className={cn(NOTICE_DIALOG_SHELL_CLASS, "sm:max-w-xl")}>
          <DialogHeader className={NOTICE_DIALOG_HEADER_CLASS}>
            <DialogTitle className="pr-8 text-xl font-semibold tracking-tight text-slate-900">
              공지 {items.length}건
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-slate-500">
              대상 대시보드 상단에 제목이 보입니다.
              <br />
              클릭하면 내용과 이미지를 볼 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          <div className={NOTICE_DIALOG_BODY_CLASS}>
            <ul className="space-y-2">
              {items.map((item) => (
                <NoticeRow
                  key={item.id}
                  item={item}
                  onEdit={() => openEdit(item)}
                  onDelete={() => setDeleteTarget(item)}
                />
              ))}
            </ul>
          </div>
          <div className="flex shrink-0 justify-end border-t border-slate-100 px-5 py-3.5 sm:px-6">
            <Button type="button" size="sm" onClick={openCreate}>
              새 공지
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editorOpen} onOpenChange={(next) => !next && closeEditor()}>
        <DialogContent className={cn(NOTICE_DIALOG_SHELL_CLASS, "sm:max-w-2xl")}>
          <DialogHeader className={NOTICE_DIALOG_HEADER_CLASS}>
            <DialogTitle className="pr-8 text-xl font-semibold tracking-tight text-slate-900">
              {draft?.id ? "공지 수정" : "새 공지"}
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-slate-500">
              제목은 대시보드에 한 줄로 보입니다.
              <br />
              내용은 클릭하면 열립니다.
            </DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className={NOTICE_DIALOG_BODY_CLASS}>
              <div className="space-y-2">
                <Label>대상</Label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    aria-pressed={allAudiencesOn}
                    className={cn(
                      "rounded-full border px-3 py-1 text-sm transition-colors",
                      allAudiencesOn
                        ? "border-primary/25 bg-primary-soft text-primary-strong"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                    )}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        audiences: allAudiencesOn ? [] : [...ALL_AUDIENCES],
                      })
                    }
                  >
                    전체
                  </button>
                  {NOTICE_AUDIENCE_OPTIONS.map((option) => {
                    const on = draft.audiences.includes(option.id);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={on}
                        className={cn(
                          "rounded-full border px-3 py-1 text-sm transition-colors",
                          on
                            ? "border-primary/25 bg-primary-soft text-primary-strong"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                        )}
                        onClick={() => toggleAudience(option.id)}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="notice-title">제목</Label>
                  <button
                    type="button"
                    className="text-xs font-medium text-primary-strong hover:underline disabled:text-slate-300 disabled:no-underline"
                    disabled={!draft.body.trim() || saving}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        title: draft.body.replace(/\s+/g, " ").trim().slice(0, 200),
                      })
                    }
                  >
                    내용과 같게
                  </button>
                </div>
                <Textarea
                  id="notice-title"
                  value={draft.title}
                  maxLength={200}
                  rows={2}
                  disabled={saving}
                  placeholder="대시보드에 한 줄로 보입니다"
                  className="min-h-[4.5rem] resize-y leading-relaxed"
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                />
                {draft.title.trim() ? (
                  <div className="rounded-xl border border-amber-300 bg-gradient-to-b from-amber-200 to-amber-300 px-3 py-2 text-center text-sm font-semibold leading-snug text-amber-950">
                    {draft.title.replace(/\s+/g, " ").trim()}
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="notice-body">내용</Label>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {draft.body.length}/4000
                  </span>
                </div>
                <Textarea
                  id="notice-body"
                  value={draft.body}
                  maxLength={4000}
                  rows={6}
                  autoFocus
                  disabled={saving}
                  placeholder="클릭하면 열리는 내용"
                  className="min-h-[9rem] resize-y leading-relaxed"
                  onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>게시 기간 (KST)</Label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <KstDateTimeFields
                    id="notice-start"
                    label="시작"
                    value={draft.startsAt}
                    defaultTime="09:00"
                    disabled={saving}
                    onChange={(startsAt) => setDraft({ ...draft, startsAt })}
                  />
                  <KstDateTimeFields
                    id="notice-end"
                    label="종료"
                    value={draft.endsAt}
                    defaultTime="23:59"
                    dateOnly
                    disabled={saving}
                    onChange={(endsAt) => setDraft({ ...draft, endsAt })}
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {endPresets.map((preset) => {
                    const on = draft.endsAt === preset.value;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        disabled={saving}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs transition-colors",
                          on
                            ? "border-primary/25 bg-primary-soft text-primary-strong"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                        )}
                        onClick={() => setDraft({ ...draft, endsAt: preset.value })}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    disabled={saving}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs transition-colors",
                      !draft.startsAt && !draft.endsAt
                        ? "border-primary/25 bg-primary-soft text-primary-strong"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                    )}
                    onClick={() => setDraft({ ...draft, startsAt: "", endsAt: "" })}
                  >
                    기간 없음
                  </button>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  비우면 기간 없이 게시됩니다.
                  <br />
                  종료일은 그날 23:59:59에 내려갑니다.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="notice-image">이미지</Label>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {imageCount}/{MAX_IMAGES}
                  </span>
                </div>
                <label
                  htmlFor="notice-image"
                  className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-3 py-4 text-center hover:bg-slate-50"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    addImages(event.dataTransfer.files);
                  }}
                >
                  <ImagePlus className="h-4 w-4 text-slate-400" />
                  <span className="text-sm text-slate-700">이미지를 선택하거나 끌어오세요.</span>
                  <span className="text-xs text-muted-foreground">jpg, png, webp, gif</span>
                  <input
                    id="notice-image"
                    type="file"
                    accept={IMAGE_ACCEPT}
                    multiple
                    disabled={saving}
                    className="sr-only"
                    onChange={(event) => {
                      addImages(event.target.files);
                      event.target.value = "";
                    }}
                  />
                </label>
                {draft.images.length || pendingPreviews.length ? (
                  <div className="flex flex-wrap gap-2 px-1 py-1">
                    {draft.images.map((image) =>
                      image.url ? (
                        <div key={image.key || image.url} className="relative">
                          <img
                            src={image.url}
                            alt={image.fileName || "공지 이미지"}
                            className="h-16 w-16 rounded-lg border border-slate-200/80 object-cover"
                          />
                          {image.key ? (
                            <button
                              type="button"
                              className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow ring-1 ring-slate-200"
                              aria-label="이미지 삭제"
                              onClick={() => void removeImage(image.key || "")}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          ) : null}
                        </div>
                      ) : null,
                    )}
                    {pendingPreviews.map((preview, index) => (
                      <div key={preview.url} className="relative">
                        <img
                          src={preview.url}
                          alt={preview.name}
                          className="h-16 w-16 rounded-lg border border-slate-200/80 object-cover"
                        />
                        <button
                          type="button"
                          className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow ring-1 ring-slate-200"
                          aria-label="이미지 삭제"
                          onClick={() =>
                            setPendingFiles((prev) =>
                              prev.filter((_, fileIndex) => fileIndex !== index),
                            )
                          }
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3.5 sm:px-6">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <Switch
                checked={Boolean(draft?.published)}
                disabled={!draft || saving}
                id="notice-published"
                onCheckedChange={(checked) =>
                  setDraft((prev) => (prev ? { ...prev, published: checked } : prev))
                }
              />
              게시
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={closeEditor}
              >
                취소
              </Button>
              <Button type="button" disabled={saving || !draft} onClick={() => void save()}>
                {saving ? "저장 중…" : "저장"}
              </Button>
            </div>
          </div>
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

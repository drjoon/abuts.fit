// related files:
// - web/backend/controllers/practiceTransfers/practiceTransferShare.controller.js
// - web/frontend/src/shared/share/caseShareTypes.ts
// - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
// - web/frontend/src/pages/practice/PracticeTransferCaseViewPage.tsx
// - 2026-09-28: 케이스 공유 — 플랫폼 내(치과·원청·협력·하청) 고정 링크와 공유 링크.
// - 2026-09-28: 공유 링크 공개 범위(누구나·지정 계정·관계자)·유효 기간. 소유자만 수정·차단·삭제.
import { useCallback, useEffect, useState } from "react";
import { Copy, ExternalLink, Link2, Loader2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { request } from "@/shared/api/apiClient";
import { formatKstDateTimeToKo } from "@/shared/date/kst";
import { useToast } from "@/shared/hooks/use-toast";
import { cn } from "@/shared/ui/cn";
import { useAuthStore } from "@/store/useAuthStore";
import {
  CASE_SHARE_EXPIRY_OPTIONS,
  CASE_SHARE_VISIBILITY_OPTIONS,
  caseShareTitle,
  caseShareUrl,
  caseShareVisibilityLabel,
  caseViewUrl,
  type CaseShareLink,
  type CaseShareView,
  type CaseShareVisibility,
} from "@/shared/share/caseShareTypes";

type LinksResponse = { data?: { items?: CaseShareLink[] }; message?: string };

function responseMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && typeof (data as { message?: unknown }).message === "string") {
    return String((data as { message: string }).message);
  }
  return fallback;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function parseEmails(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

const STATUS_LABEL: Record<CaseShareLink["status"], string> = {
  active: "공유 중",
  blocked: "차단됨",
  expired: "만료",
};

function ParticipantChips({ view }: { view: CaseShareView | null }) {
  const p = view?.participants;
  if (!p) return null;
  const chips: { label: string; name: string }[] = [];
  if (p.practiceName) chips.push({ label: "치과", name: p.practiceName });
  if (p.primeLabName) chips.push({ label: "원청", name: p.primeLabName });
  if (p.assigneeLabName && p.assigneeLabName !== p.primeLabName) {
    chips.push({
      label: p.assigneeKind === "subcontract" ? "하청" : "협력",
      name: p.assigneeLabName,
    });
  }
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <span
          key={`${chip.label}-${chip.name}`}
          className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-xs"
        >
          <span className="font-semibold text-muted-foreground">{chip.label}</span>
          <span className="max-w-[12rem] truncate">{chip.name}</span>
        </span>
      ))}
    </div>
  );
}

function LinkRow({ url, onCopy }: { url: string; onCopy: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <Input
        readOnly
        value={url}
        className="h-9 min-w-0 flex-1 bg-muted/40 text-xs"
        onFocus={(e) => e.currentTarget.select()}
      />
      <Button type="button" size="sm" className="h-9 shrink-0 gap-1.5" onClick={onCopy}>
        <Copy className="h-3.5 w-3.5" />
        링크 복사
      </Button>
    </div>
  );
}

type ShareFormValue = {
  visibility: CaseShareVisibility;
  emailsText: string;
  expiresInDays: number;
};

const DEFAULT_FORM: ShareFormValue = {
  visibility: "public",
  emailsText: "",
  expiresInDays: 7,
};

function ShareLinkForm({
  value,
  onChange,
  submitLabel,
  busy,
  disabled,
  onSubmit,
  onCancel,
}: {
  value: ShareFormValue;
  onChange: (next: ShareFormValue) => void;
  submitLabel: string;
  busy: boolean;
  disabled?: boolean;
  onSubmit: () => void;
  onCancel?: () => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-muted-foreground">공개 범위</p>
        <div className="grid gap-1.5">
          {CASE_SHARE_VISIBILITY_OPTIONS.map((opt) => {
            const selected = value.visibility === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                className={cn(
                  "rounded-md border px-3 py-2 text-left transition-colors",
                  selected
                    ? "border-primary bg-primary-soft/50"
                    : "bg-background hover:bg-muted/50",
                )}
                aria-pressed={selected}
                onClick={() => onChange({ ...value, visibility: opt.value })}
              >
                <span className="block text-sm font-medium">{opt.label}</span>
                <span className="block text-xs text-muted-foreground">{opt.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      {value.visibility === "accounts" ? (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground">볼 수 있는 계정 이메일</p>
          <Textarea
            value={value.emailsText}
            onChange={(e) => onChange({ ...value, emailsText: e.target.value })}
            placeholder="name@lab.com, other@clinic.com"
            className="min-h-[4.5rem] text-sm"
          />
          <p className="text-xs text-muted-foreground">
            쉼표나 줄바꿈으로 나눕니다.
            <br />
            어벗츠에 가입된 계정만 넣을 수 있습니다.
          </p>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-muted-foreground">유효 기간</p>
        <div className="flex gap-1.5">
          {CASE_SHARE_EXPIRY_OPTIONS.map((days) => (
            <Button
              key={days}
              type="button"
              size="sm"
              variant={value.expiresInDays === days ? "default" : "outline"}
              className="h-8 px-3"
              onClick={() => onChange({ ...value, expiresInDays: days })}
            >
              {days}일
            </Button>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" size="sm" variant="ghost" className="h-9" onClick={onCancel}>
            취소
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          className="h-9 gap-1.5"
          onClick={onSubmit}
          disabled={busy || disabled}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Link2 className="h-3.5 w-3.5" />
          )}
          {busy ? "처리 중…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}

type PracticeTransferShareDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** PracticeTransfer._id 또는 transferId */
  transferKey: string;
  /** 이미 불러온 케이스 뷰(3D 화면에서 열 때) */
  initialView?: CaseShareView | null;
  /** 3D 화면 안에서 열면 「3D로 열기」를 숨긴다. */
  hideOpenViewer?: boolean;
};

export function PracticeTransferShareDialog({
  open,
  onOpenChange,
  transferKey,
  initialView = null,
  hideOpenViewer = false,
}: PracticeTransferShareDialogProps) {
  const token = useAuthStore((s) => s.token);
  const { toast } = useToast();
  const key = String(transferKey || "").trim();
  const basePath = `/api/practice/transfers/${encodeURIComponent(key)}/share-links`;
  const [view, setView] = useState<CaseShareView | null>(initialView);
  const [viewError, setViewError] = useState("");
  const [links, setLinks] = useState<CaseShareLink[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<ShareFormValue>(DEFAULT_FORM);
  const [editToken, setEditToken] = useState("");
  const [editForm, setEditForm] = useState<ShareFormValue>(DEFAULT_FORM);
  const [busyToken, setBusyToken] = useState("");
  const [confirmDeleteToken, setConfirmDeleteToken] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (initialView) setView(initialView);
  }, [initialView]);

  const loadLinks = useCallback(async () => {
    if (!key || !token) return;
    const res = await request<LinksResponse>({ path: basePath, token, skipCache: true });
    if (res.ok) setLinks(res.data?.data?.items || []);
  }, [basePath, key, token]);

  useEffect(() => {
    if (!open || !key || !token) return;
    setCreateOpen(false);
    setEditToken("");
    setConfirmDeleteToken("");
    void loadLinks();
    if (initialView) return;
    setViewError("");
    void (async () => {
      const res = await request<{ data?: CaseShareView }>({
        path: `/api/practice/transfers/${encodeURIComponent(key)}/case-view`,
        token,
        skipCache: true,
      });
      if (res.ok && res.data?.data) {
        setView(res.data.data);
      } else {
        setViewError(responseMessage(res.data, "케이스를 불러오지 못했습니다."));
      }
    })();
  }, [initialView, key, loadLinks, open, token]);

  const copyAndToast = async (url: string) => {
    const ok = await copyText(url);
    toast({
      title: ok ? "링크를 복사했습니다." : "복사하지 못했습니다.",
      description: ok ? undefined : "링크를 직접 선택해 복사해 주세요.",
      variant: ok ? undefined : "destructive",
    });
  };

  const replaceLink = (next: CaseShareLink) =>
    setLinks((rows) => rows.map((row) => (row.token === next.token ? next : row)));

  const formBody = (form: ShareFormValue) => ({
    visibility: form.visibility,
    expiresInDays: form.expiresInDays,
    ...(form.visibility === "accounts" ? { allowedEmails: parseEmails(form.emailsText) } : {}),
  });

  const handleCreate = async () => {
    if (!key || !token || creating) return;
    setCreating(true);
    try {
      const res = await request<LinksResponse>({
        path: basePath,
        method: "POST",
        token,
        jsonBody: formBody(createForm),
      });
      const link = res.data?.data?.items?.[0];
      if (!res.ok || !link) {
        throw new Error(responseMessage(res.data, "공유 링크를 만들지 못했습니다."));
      }
      setLinks((prev) => [link, ...prev]);
      setCreateOpen(false);
      setCreateForm(DEFAULT_FORM);
      await copyAndToast(caseShareUrl(link.token));
    } catch (error) {
      toast({
        title: "공유 링크를 만들지 못했습니다.",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const patchLink = async (
    linkToken: string,
    body: Record<string, unknown>,
    doneTitle: string,
  ): Promise<boolean> => {
    if (!token || busyToken) return false;
    setBusyToken(linkToken);
    try {
      const res = await request<LinksResponse>({
        path: `${basePath}/${encodeURIComponent(linkToken)}`,
        method: "PATCH",
        token,
        jsonBody: body,
      });
      const link = res.data?.data?.items?.[0];
      if (!res.ok || !link) throw new Error(responseMessage(res.data, "다시 시도해 주세요."));
      replaceLink(link);
      toast({ title: doneTitle });
      return true;
    } catch (error) {
      toast({
        title: "바꾸지 못했습니다.",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
      return false;
    } finally {
      setBusyToken("");
    }
  };

  const handleDelete = async (linkToken: string) => {
    if (!token || busyToken) return;
    setBusyToken(linkToken);
    const prevLinks = links;
    setLinks((rows) => rows.filter((row) => row.token !== linkToken));
    try {
      const res = await request({
        path: `${basePath}/${encodeURIComponent(linkToken)}`,
        method: "DELETE",
        token,
      });
      if (!res.ok) throw new Error(responseMessage(res.data, "다시 시도해 주세요."));
      toast({ title: "공유 링크를 삭제했습니다." });
    } catch (error) {
      setLinks(prevLinks);
      toast({
        title: "삭제하지 못했습니다.",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusyToken("");
      setConfirmDeleteToken("");
    }
  };

  const startEdit = (link: CaseShareLink) => {
    setConfirmDeleteToken("");
    setEditToken(link.token);
    setEditForm({
      visibility: link.visibility,
      emailsText: link.allowedAccounts.map((a) => a.email).join(", "),
      expiresInDays: 7,
    });
  };

  const internalUrl = key ? caseViewUrl(key) : "";
  const hasModel = Boolean(view?.files.some((f) => f.isModel));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="z-[450] flex max-h-[90dvh] max-w-lg flex-col gap-0 p-0"
        overlayClassName="z-[445]"
      >
        <DialogHeader className="shrink-0 border-b bg-muted/50 px-5 py-3 text-left">
          <DialogTitle className="text-base">케이스 공유</DialogTitle>
          <DialogDescription className="truncate text-xs">
            {view ? caseShareTitle(view) : viewError || "불러오는 중…"}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <section className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">공유 링크</h3>
              {!createOpen ? (
                <Button
                  type="button"
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={() => {
                    setEditToken("");
                    setCreateOpen(true);
                  }}
                  disabled={!view || !hasModel}
                >
                  <Link2 className="h-3.5 w-3.5" />
                  새 링크
                </Button>
              ) : null}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              링크를 누르면 어벗츠 화면에서 3D 프리뷰가 열립니다.
              <br />
              기간이 지나거나 만든 사람이 차단·삭제하면 더 이상 열리지 않습니다.
            </p>
            {view && !hasModel ? (
              <p className="text-xs text-muted-foreground">공유할 3D 파일이 아직 없습니다.</p>
            ) : null}

            {createOpen ? (
              <ShareLinkForm
                value={createForm}
                onChange={setCreateForm}
                submitLabel="링크 만들고 복사"
                busy={creating}
                onSubmit={() => void handleCreate()}
                onCancel={() => setCreateOpen(false)}
              />
            ) : null}

            {links.length > 0 ? (
              <ul className="divide-y rounded-lg border">
                {links.map((link) => {
                  const busy = busyToken === link.token;
                  const editing = editToken === link.token;
                  return (
                    <li key={link.token} className="space-y-2 px-3 py-2.5">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[0.6875rem]",
                                link.status === "active"
                                  ? "bg-primary-soft text-primary-strong"
                                  : "bg-muted text-muted-foreground",
                              )}
                            >
                              {STATUS_LABEL[link.status]}
                            </span>
                            {caseShareVisibilityLabel(link.visibility)}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {link.createdByName || "공유 링크"} · 조회 {link.viewCount}회 ·{" "}
                            {formatKstDateTimeToKo(link.expiresAt)}까지
                          </p>
                          {link.isOwner && link.visibility === "accounts" ? (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {link.allowedAccounts.map((a) => a.name || a.email).join(", ")}
                            </p>
                          ) : null}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2"
                          onClick={() => void copyAndToast(caseShareUrl(link.token))}
                          aria-label="링크 복사"
                          title="링크 복사"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      {link.isOwner && !editing ? (
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 text-xs"
                            onClick={() => startEdit(link)}
                            disabled={busy}
                          >
                            범위·기간
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 text-xs"
                            onClick={() =>
                              void patchLink(
                                link.token,
                                { blocked: link.status !== "blocked" },
                                link.status === "blocked"
                                  ? "차단을 풀었습니다."
                                  : "링크를 차단했습니다.",
                              )
                            }
                            disabled={busy}
                          >
                            {link.status === "blocked" ? "차단 해제" : "차단"}
                          </Button>
                          {confirmDeleteToken === link.token ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              className="h-7 px-2.5 text-xs"
                              onClick={() => void handleDelete(link.token)}
                              disabled={busy}
                            >
                              삭제 확인
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2.5 text-xs text-destructive"
                              onClick={() => setConfirmDeleteToken(link.token)}
                              disabled={busy}
                            >
                              삭제
                            </Button>
                          )}
                        </div>
                      ) : null}

                      {editing ? (
                        <ShareLinkForm
                          value={editForm}
                          onChange={setEditForm}
                          submitLabel="저장"
                          busy={busy}
                          onSubmit={() =>
                            void patchLink(link.token, formBody(editForm), "공유 설정을 바꿨습니다.").then(
                              (ok) => {
                                if (ok) setEditToken("");
                              },
                            )
                          }
                          onCancel={() => setEditToken("")}
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>

          <section className="space-y-2.5 border-t pt-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">관계자 고정 링크</h3>
              {!hideOpenViewer && internalUrl ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5"
                  onClick={() => window.open(internalUrl, "_blank", "noopener")}
                  disabled={!hasModel}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  3D로 열기
                </Button>
              ) : null}
            </div>
            <ParticipantChips view={view} />
            <p className="text-xs leading-relaxed text-muted-foreground">
              이 의뢰의 치과·기공소 구성원만 로그인해 엽니다.
              <br />
              기간 제한이 없습니다.
            </p>
            {internalUrl ? (
              <LinkRow url={internalUrl} onCopy={() => void copyAndToast(internalUrl)} />
            ) : null}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** 의뢰 상세 헤더 아이콘 버튼 */
export function PracticeTransferShareButton({
  transferKey,
  className,
}: {
  transferKey: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const key = String(transferKey || "").trim();
  if (!key) return null;
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={cn("h-8 w-8 shrink-0 p-0", className)}
            aria-label="케이스 공유"
            onClick={() => setOpen(true)}
          >
            <Share2 className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">케이스 공유</TooltipContent>
      </Tooltip>
      <PracticeTransferShareDialog
        open={open}
        onOpenChange={setOpen}
        transferKey={key}
      />
    </>
  );
}

// related files:
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/backend/controllers/dashboardNotice.controller.js
// - 2026-10-08: 열람 모달은 고정 헤더·스크롤 본문.
// - 2026-10-07: 공지는 DashboardLayout 작업영역 맨 위 전폭 1행. 페이지 inline 자리 제거.
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { cn } from "@/shared/ui/cn";
import {
  DASHBOARD_FULL_BLEED_GUTTER_CLASS,
  DASHBOARD_FULL_BLEED_HEADER_ROW_CLASS,
} from "@/shared/ui/dashboardChrome";
import {
  isNoticeWindowOpen,
  NOTICE_DIALOG_BODY_CLASS,
  NOTICE_DIALOG_HEADER_CLASS,
  NOTICE_DIALOG_SHELL_CLASS,
  type DashboardNotice,
} from "./dashboardNotice";

/** @deprecated 레이아웃 전폭 공지 바로 통일. */
export const DASHBOARD_NOTICE_HEADER_CLASS =
  "min-w-[6rem] max-w-none flex-1 shrink overflow-hidden 2xl:max-w-none";

/** 레이아웃 호환용 no-op. 공지는 `DashboardNoticeBar`가 맡는다. */
export function DashboardNoticeHostProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

type ActiveResponse = {
  success?: boolean;
  data?: { items?: DashboardNotice[] };
};

function NoticeCopy({ text }: { text: string }) {
  const parts = text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=\.)\s+/))
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  return (
    <p className="text-sm leading-relaxed text-slate-700">
      {parts.map((part, index) => (
        <span key={`${index}-${part.slice(0, 16)}`}>
          {index > 0 ? <br /> : null}
          {part}
        </span>
      ))}
    </p>
  );
}

const NOTICE_BANNER_CLASS =
  "pointer-events-auto flex min-w-0 w-full max-w-none items-center justify-center gap-2 rounded-xl border border-amber-300 bg-gradient-to-b from-amber-200 to-amber-300 px-3 py-1.5 text-sm font-semibold text-amber-950 shadow-sm";

/**
 * 대시보드 활성 공지. 레이아웃 전폭 바(`DashboardNoticeBar`)에서만 쓴다.
 * 활성 공지가 여러 개여도 전폭 1개 배너에 가운데 정렬로 모은다.
 */
export function DashboardNoticeAlert({
  className,
  placement = "banner",
}: {
  className?: string;
  /** banner: 작업영역 맨 위 전폭 1행. */
  placement?: "banner";
}) {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data: fetched = [] } = useQuery({
    queryKey: ["dashboard-notices-active"],
    enabled: Boolean(token) && role !== "admin",
    staleTime: 60_000,
    queryFn: async () => {
      const res = await apiFetch<ActiveResponse>({
        path: "/api/notices/active",
        token,
      });
      if (!res.ok || res.data?.success === false) return [];
      return res.data?.data?.items || [];
    },
  });
  // API·캐시가 남아 있어도 기간이 지난 공지는 숨긴다.
  const items = fetched.filter((item) => isNoticeWindowOpen(item));

  const dialogOpen = openId !== null;
  if (!items.length) return null;

  const single = items.length === 1 ? items[0] : null;
  const bannerTitle = items.map((item) => item.title).join("\n");
  const bannerAria = single ? single.title : `공지 ${items.length}건`;
  const dialogTitle =
    single && single.body.trim() !== single.title.trim()
      ? single.title
      : "공지";

  return (
    <>
      <div
        className={cn(
          "shrink-0 border-b border-border bg-background/95",
          DASHBOARD_FULL_BLEED_HEADER_ROW_CLASS,
          DASHBOARD_FULL_BLEED_GUTTER_CLASS,
          className,
        )}
      >
        <button
          type="button"
          onClick={() => setOpenId(items[0].id)}
          className={cn(
            NOTICE_BANNER_CLASS,
            "transition hover:from-amber-100 hover:to-amber-200",
          )}
          title={bannerTitle}
          aria-label={bannerAria}
        >
          <Megaphone className="h-4 w-4 shrink-0" />
          <span className="min-w-0 text-center">
            {items.map((item, index) => (
              <span key={item.id}>
                {index > 0 ? <br /> : null}
                {item.title}
              </span>
            ))}
          </span>
        </button>
      </div>
      <Dialog open={dialogOpen} onOpenChange={(next) => !next && setOpenId(null)}>
        <DialogContent className={cn(NOTICE_DIALOG_SHELL_CLASS, "sm:max-w-lg")}>
          <DialogHeader className={NOTICE_DIALOG_HEADER_CLASS}>
            <DialogTitle className="pr-8 text-xl font-semibold leading-snug tracking-tight text-slate-900">
              {dialogTitle}
            </DialogTitle>
          </DialogHeader>
          <div className={NOTICE_DIALOG_BODY_CLASS}>
            {items.map((item) => (
              <article
                key={item.id}
                className={
                  items.length > 1
                    ? "space-y-3 rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm"
                    : "space-y-3"
                }
              >
                {!single && item.body.trim() !== item.title.trim() ? (
                  <p className="text-sm font-semibold leading-snug text-slate-900">
                    {item.title}
                  </p>
                ) : null}
                <NoticeCopy text={item.body} />
                {item.images?.length ? (
                  <div className="flex flex-col gap-3">
                    {item.images.map((image, index) =>
                      image.url ? (
                        <img
                          key={image.url}
                          src={image.url}
                          alt={image.fileName || `공지 이미지 ${index + 1}`}
                          className="max-h-80 w-full rounded-xl border border-slate-200/80 bg-slate-50 object-contain"
                        />
                      ) : null,
                    )}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** DashboardLayout 작업영역 맨 위 전폭 공지. 모든 role 공통(관리자 제외). */
export function DashboardNoticeBar() {
  return <DashboardNoticeAlert placement="banner" />;
}

/** @deprecated `DashboardNoticeBar`로 대체. */
export function DashboardNoticeFallback() {
  return <DashboardNoticeBar />;
}

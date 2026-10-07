// related files:
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/backend/controllers/dashboardNotice.controller.js
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
import type { DashboardNotice } from "./dashboardNotice";

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

const NOTICE_BUTTON_CLASS =
  "pointer-events-auto inline-flex min-w-0 w-full max-w-none shrink items-center justify-start gap-2 rounded-md border border-amber-700 bg-amber-400 px-2.5 py-1 text-left text-sm font-semibold text-amber-950 shadow-md transition hover:bg-amber-300";

/**
 * 대시보드 활성 공지. 레이아웃 전폭 바(`DashboardNoticeBar`)에서만 쓴다.
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
  const { data: items = [] } = useQuery({
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

  const open = items.find((item) => item.id === openId) || null;
  if (!items.length) return null;

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
        <div className="flex min-w-0 w-full items-center gap-1.5">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setOpenId(item.id)}
              className={NOTICE_BUTTON_CLASS}
              title={item.title}
              aria-label={item.title}
            >
              <Megaphone className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate">{item.title}</span>
            </button>
          ))}
        </div>
      </div>
      <Dialog open={Boolean(open)} onOpenChange={(next) => !next && setOpenId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="pr-6 text-base leading-snug">
              {open && open.body.trim() === open.title.trim() ? "공지" : open?.title}
            </DialogTitle>
          </DialogHeader>
          {open ? <NoticeCopy text={open.body} /> : null}
          {open?.images?.length ? (
            <div className="flex flex-col gap-3">
              {open.images.map((image, index) =>
                image.url ? (
                  <img
                    key={image.url}
                    src={image.url}
                    alt={image.fileName || `공지 이미지 ${index + 1}`}
                    className="max-h-80 w-full rounded-md object-contain"
                  />
                ) : null,
              )}
            </div>
          ) : null}
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

// related files:
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/practice/components/PracticeRecentTransfersAllModal.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/backend/controllers/dashboardNotice.controller.js
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
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

/** 헤더 줄에서 필터와 액션 버튼 사이 남는 폭. 기공소 수신과 같다. */
export const DASHBOARD_NOTICE_HEADER_CLASS =
  "min-w-[6rem] max-w-none flex-1 shrink overflow-hidden 2xl:max-w-none";

const NoticeClaimContext = createContext<(() => () => void) | null>(null);
const NoticeHostedContext = createContext(false);

export function DashboardNoticeHostProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const claim = useCallback(() => {
    setCount((n) => n + 1);
    return () => setCount((n) => Math.max(0, n - 1));
  }, []);
  const hosted = count > 0;
  const hostedValue = useMemo(() => hosted, [hosted]);
  return (
    <NoticeClaimContext.Provider value={claim}>
      <NoticeHostedContext.Provider value={hostedValue}>
        {children}
      </NoticeHostedContext.Provider>
    </NoticeClaimContext.Provider>
  );
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
  "pointer-events-auto inline-flex min-w-0 max-w-[min(100%,14rem)] shrink-0 items-center gap-2 rounded-md border border-amber-700 bg-amber-400 px-2.5 py-1 text-left text-sm font-semibold text-amber-950 shadow-md transition hover:bg-amber-300 2xl:max-w-[min(100%,32rem)]";

export function DashboardNoticeAlert({
  className,
  placement = "overlay",
  claimHost = placement === "inline",
}: {
  className?: string;
  /**
   * inline: 헤더 줄에 붙인다.
   * banner: 페이지가 자리를 안 잡으면 작업영역 상단 줄.
   * overlay: 쓰지 않는다.
   */
  placement?: "inline" | "banner" | "overlay";
  /** 이 자리가 공지를 맡으면 상단 배너를 숨긴다. */
  claimHost?: boolean;
}) {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  const claim = useContext(NoticeClaimContext);
  const [openId, setOpenId] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (!claimHost || !claim) return;
    return claim();
  }, [claim, claimHost]);
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

  const buttons = items.map((item) => (
    <button
      key={item.id}
      type="button"
      onClick={() => setOpenId(item.id)}
      className={cn(
        NOTICE_BUTTON_CLASS,
        placement === "inline" && className,
        placement === "banner" && DASHBOARD_NOTICE_HEADER_CLASS,
      )}
      title={item.title}
      aria-label={item.title}
    >
      <Megaphone className="h-4 w-4 shrink-0" />
      <span className="min-w-0 truncate">{item.title}</span>
    </button>
  ));

  const buttonsRow = (
    <div className="flex min-w-0 items-center">{buttons}</div>
  );

  return (
    <>
      {placement === "inline" ? (
        <div className="contents">{buttons}</div>
      ) : placement === "banner" ? (
        <div
          className={cn(
            "shrink-0 border-b border-border bg-background/95",
            DASHBOARD_FULL_BLEED_HEADER_ROW_CLASS,
            DASHBOARD_FULL_BLEED_GUTTER_CLASS,
          )}
        >
          {buttonsRow}
        </div>
      ) : (
        <div
          className={cn(
            "pointer-events-none absolute z-30 flex max-w-[min(100%,32rem)] flex-col items-stretch gap-1",
            className,
          )}
        >
          {buttons}
        </div>
      )}
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

/** 페이지 헤더가 공지 자리를 안 잡았을 때 작업영역 상단 줄. */
export function DashboardNoticeFallback() {
  const hosted = useContext(NoticeHostedContext);
  if (hosted) return null;
  return <DashboardNoticeAlert placement="banner" claimHost={false} />;
}

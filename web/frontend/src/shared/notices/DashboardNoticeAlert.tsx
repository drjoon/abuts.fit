// related files:
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/practice/components/PracticeRecentTransfersAllModal.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/backend/controllers/dashboardNotice.controller.js
import { useState } from "react";
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
import { CONTENT_MEASURED_CHROME_CLASS } from "@/shared/ui/contentMeasuredChrome";
import type { DashboardNotice } from "./dashboardNotice";

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

export function DashboardNoticeAlert({ className }: { className?: string }) {
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
      <div className={cn("flex flex-col items-start gap-2", className)}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setOpenId(item.id)}
            className={cn(
              CONTENT_MEASURED_CHROME_CLASS,
              "inline-flex min-w-0 items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-sm font-medium text-amber-950 transition hover:bg-amber-100",
            )}
          >
            <Megaphone className="h-4 w-4 shrink-0 text-amber-700" />
            <span className="min-w-0 truncate">{item.title}</span>
          </button>
        ))}
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

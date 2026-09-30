// 프리뷰 상단 — 불완전가공 처리 여부를 1줄로 보여 주고, 누르면 전달 내용(사유·메시지·사진)을 모달로 연다.
import { useState } from "react";
import { CheckCircle2, ChevronRight, ImageIcon, MessageSquare } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ManufacturerRequest } from "../utils/request";

const formatKst = (value: unknown) => {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

type LabPhoto = {
  kind?: string;
  viewUrl?: string;
  s3Url?: string;
  fileName?: string;
};

export function UnmachinableProcessedNotice({
  req,
}: {
  req: ManufacturerRequest | null;
}) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const rnd = (req as any)?.rnd || {};
  const message = String(rnd.unmachinableLabMessage || "").trim();
  const photos: LabPhoto[] = Array.isArray(rnd.unmachinableLabPhotos)
    ? rnd.unmachinableLabPhotos
    : [];
  const reason = String(rnd.unmachinableReason || "").trim();
  const at = formatKst(rnd.unmachinableAt);
  const sent = Boolean(message || photos.length);

  return (
    <>
      <button
        type="button"
        className="flex w-full shrink-0 items-center gap-2 overflow-hidden rounded-md border border-accent-muted bg-accent-soft/60 px-2.5 py-1 text-left text-[12px] hover:bg-accent-soft"
        onClick={() => setOpen(true)}
        title="전달 내용 보기"
      >
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-accent-strong" />
        <span className="shrink-0 font-semibold text-accent-strong">
          불완전가공 처리됨{at ? ` · ${at}` : ""}
        </span>
        <span
          className={`inline-flex shrink-0 items-center gap-1 font-semibold ${
            sent ? "text-primary-strong" : "text-slate-500"
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          {sent ? "기공소 전달됨" : "전달 내용 없음"}
        </span>
        {photos.length ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-slate-600">
            <ImageIcon className="h-3.5 w-3.5" />
            {photos.length}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-slate-600">
          {[reason, message].filter(Boolean).join(" · ")}
        </span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="z-[120] max-h-[min(90dvh,860px)] w-[min(40rem,calc(100vw-2rem))] max-w-[min(40rem,calc(100vw-2rem))] overflow-y-auto sm:max-w-[min(40rem,calc(100vw-2rem))]"
          overlayClassName="z-[120] bg-black/45"
        >
          <DialogTitle>불완전가공 전달 내용</DialogTitle>
          <DialogDescription>
            {at ? `${at}에 처리했습니다.` : "처리한 내용입니다."}
            <br />
            {sent ? "기공소에 메시지를 전달했습니다." : "기공소에 전달한 내용이 없습니다."}
          </DialogDescription>

          <div className="space-y-3 text-sm">
            <section className="space-y-1">
              <div className="text-xs font-semibold text-slate-500">사유</div>
              <div className="whitespace-pre-wrap break-words rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                {reason || "기록된 사유가 없습니다."}
              </div>
            </section>
            <section className="space-y-1">
              <div className="text-xs font-semibold text-slate-500">기공소 메시지</div>
              <div className="whitespace-pre-wrap break-words rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                {message || "전달한 메시지가 없습니다."}
              </div>
            </section>
            {photos.length ? (
              <section className="space-y-1">
                <div className="text-xs font-semibold text-slate-500">
                  사진 {photos.length}장
                </div>
                <div className="grid gap-2">
                  {photos.map((photo, idx) => {
                    const url = String(photo.viewUrl || photo.s3Url || "").trim();
                    return (
                      <figure
                        key={`${photo.fileName}-${idx}`}
                        className="overflow-hidden rounded-md border border-slate-200 bg-slate-50"
                      >
                        {url && !failed[idx] ? (
                          <img
                            src={url}
                            alt={photo.fileName || "불완전가공 사진"}
                            className="mx-auto max-h-[50vh] max-w-full object-contain"
                            onError={() => setFailed((prev) => ({ ...prev, [idx]: true }))}
                          />
                        ) : (
                          <div className="px-3 py-8 text-center text-xs text-slate-500">
                            사진을 불러오지 못했습니다.
                            <br />
                            목록을 새로고침한 뒤 다시 열어 주세요.
                          </div>
                        )}
                        <figcaption className="border-t border-slate-200 px-3 py-1 text-[11px] text-slate-500">
                          {photo.kind === "painted" ? "페인트 표시본" : "원본 사진"}
                        </figcaption>
                      </figure>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

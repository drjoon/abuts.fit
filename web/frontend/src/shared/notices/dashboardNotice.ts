export const NOTICE_AUDIENCE_OPTIONS = [
  { id: "practice", label: "치과" },
  { id: "lab", label: "기공소" },
  { id: "manufacturer", label: "제조사" },
  { id: "dealer", label: "딜러" },
  { id: "salesTeam", label: "영업팀" },
  { id: "labHq", label: "기공본부팀" },
] as const;

export type NoticeAudience = (typeof NOTICE_AUDIENCE_OPTIONS)[number]["id"];

export type DashboardNoticeImage = {
  key?: string;
  fileName?: string;
  contentType?: string;
  url?: string;
};

export type DashboardNotice = {
  id: string;
  title: string;
  body: string;
  audiences: NoticeAudience[];
  images: DashboardNoticeImage[];
  published: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdAt?: string | null;
};

export function noticeAudienceLabel(id: string) {
  return NOTICE_AUDIENCE_OPTIONS.find((option) => option.id === id)?.label || id;
}

/** 공지 편집·열람 모달. 헤더·본문·푸터를 나누고 본문만 스크롤한다. */
export const NOTICE_DIALOG_SHELL_CLASS =
  "flex max-h-[min(92vh,48rem)] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden border-slate-200/80 p-0 shadow-xl sm:rounded-2xl sm:p-0";

export const NOTICE_DIALOG_HEADER_CLASS =
  "shrink-0 space-y-1.5 border-b border-slate-100/90 bg-gradient-to-b from-slate-50/90 to-white px-5 pb-4 pt-6 text-left sm:px-6";

export const NOTICE_DIALOG_BODY_CLASS =
  "min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-8 pt-5 sm:px-6";

/** published 이고 시작~종료 시각(없으면 제한 없음) 안인지. */
export function isNoticeWindowOpen(
  notice: Pick<DashboardNotice, "published" | "startsAt" | "endsAt">,
  now: Date = new Date(),
) {
  if (!notice || notice.published === false) return false;
  if (notice.startsAt) {
    const start = new Date(notice.startsAt);
    if (!Number.isNaN(start.getTime()) && start > now) return false;
  }
  if (notice.endsAt) {
    const end = new Date(notice.endsAt);
    if (!Number.isNaN(end.getTime()) && end < now) return false;
  }
  return true;
}

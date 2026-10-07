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

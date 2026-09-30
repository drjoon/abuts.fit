export const NOTICE_AUDIENCE_OPTIONS = [
  { id: "practice", label: "치과" },
  { id: "lab", label: "기공소" },
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

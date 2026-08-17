// change-log:
// - 2026-08-17: 관리자 파트너 수익분배 UI — 섹터 비율·개인 배분·실지급 계산.
// related files:
// - web/frontend/src/pages/admin/partners/AdminPartnersPage.tsx
// - web/frontend/src/pages/admin/partners/PartnerShareContext.tsx
// - web/frontend/src/pages/admin/partners/RevenueShareTab.tsx
// - web/frontend/src/pages/admin/partners/SectorShareTab.tsx

export const SECTOR_KEYS = [
  "labUnit",
  "salesUnit",
  "labPartner",
  "salesPartner",
] as const;

export type SectorKey = (typeof SECTOR_KEYS)[number];

export type SectorKind = "department" | "partner";

export type PartnerAccount = {
  userId: string;
  name: string;
  email: string;
  role: string;
  sharePercent: number;
  monthlyMinimum: number;
};

export type PartnerShareRates = Record<SectorKey, number>;
export type PartnerShareMembers = Record<SectorKey, PartnerAccount[]>;

export type PartnerShareState = {
  rates: PartnerShareRates;
  previewPool: number;
  members: PartnerShareMembers;
};

export const DEFAULT_PARTNER_SHARE_RATES: PartnerShareRates = {
  labUnit: 20,
  salesUnit: 10,
  labPartner: 30,
  salesPartner: 20,
};

export const SECTOR_META: Record<
  SectorKey,
  {
    label: string;
    kind: SectorKind;
    description: string;
    barClass: string;
    chipClass: string;
    iconTone: string;
  }
> = {
  labUnit: {
    label: "기공사업부",
    kind: "department",
    description: "사업부원별 최소지급액과 배분비를 지정합니다.",
    barClass: "bg-service-gigong",
    chipClass: "bg-service-gigong-soft text-service-gigong ring-service-gigong-muted/70",
    iconTone: "bg-service-gigong-soft ring-service-gigong-muted/70 text-service-gigong",
  },
  salesUnit: {
    label: "영업부",
    kind: "department",
    description: "사업부원별 최소지급액과 배분비를 지정합니다.",
    barClass: "bg-primary",
    chipClass: "bg-primary-soft text-primary-strong ring-primary-muted/70",
    iconTone: "bg-primary-soft ring-primary-muted/70 text-primary-strong",
  },
  labPartner: {
    label: "기공파트너",
    kind: "partner",
    description: "파트너 전체를 100%로 보고 개인 배분비를 지정합니다.",
    barClass: "bg-service-gigong-muted",
    chipClass: "bg-service-gigong-soft text-service-gigong ring-service-gigong-muted/80",
    iconTone: "bg-service-gigong-soft ring-service-gigong-muted/80 text-service-gigong",
  },
  salesPartner: {
    label: "영업파트너",
    kind: "partner",
    description: "파트너 전체를 100%로 보고 개인 배분비를 지정합니다.",
    barClass: "bg-primary-muted",
    chipClass: "bg-primary-soft text-primary-strong ring-primary-muted/80",
    iconTone: "bg-primary-soft ring-primary-muted/80 text-primary-strong",
  },
};

export const emptyMembers = (): PartnerShareMembers => ({
  labUnit: [],
  salesUnit: [],
  labPartner: [],
  salesPartner: [],
});

export const defaultPartnerShareState = (): PartnerShareState => ({
  rates: { ...DEFAULT_PARTNER_SHARE_RATES },
  previewPool: 0,
  members: emptyMembers(),
});

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value * 10) / 10));
}

export function clampAmount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function sumRates(rates: PartnerShareRates): number {
  return SECTOR_KEYS.reduce((sum, key) => sum + Number(rates[key] || 0), 0);
}

export function remainingRates(rates: PartnerShareRates): number {
  return Math.round((100 - sumRates(rates)) * 10) / 10;
}

export function sumMemberPercents(members: PartnerAccount[]): number {
  return Math.round(
    members.reduce((sum, item) => sum + Number(item.sharePercent || 0), 0) * 10,
  ) / 10;
}

export function sectorPoolAmount(
  previewPool: number,
  sectorRate: number,
): number {
  return clampAmount((previewPool * sectorRate) / 100);
}

export function memberShareAmount(
  sectorAmount: number,
  sharePercent: number,
): number {
  return clampAmount((sectorAmount * sharePercent) / 100);
}

export function memberGrossPayout(args: {
  kind: SectorKind;
  shareAmount: number;
  monthlyMinimum: number;
}): number {
  if (args.kind === "department") {
    return Math.max(clampAmount(args.monthlyMinimum), args.shareAmount);
  }
  return args.shareAmount;
}

export function formatWon(value: number): string {
  return `${clampAmount(value).toLocaleString("ko-KR")}원`;
}

export function formatPercent(value: number): string {
  const n = clampPercent(value);
  return Number.isInteger(n) ? `${n}%` : `${n.toFixed(1)}%`;
}

export function partnerRoleLabel(role: string): string {
  switch (String(role || "").trim()) {
    case "requestor":
      return "의뢰자";
    case "manufacturer":
      return "제조사";
    case "internalLab":
      return "어벗츠기공소";
    case "admin":
      return "어벗츠.핏";
    case "salesman":
      return "영업자";
    case "devops":
      return "개발운영사";
    default:
      return "사용자";
  }
}

// change-log:
// - 2026-08-17: 분배 주체에 role을 두고 기공팀·영업팀을 기본 주체로.
// - 2026-08-17: 관리자「사업영역」— 기공·어벗·플랫폼 부서/팀원 분배 모델.
// related files:
// - web/frontend/src/pages/admin/partners/AdminPartnersPage.tsx
// - web/frontend/src/pages/admin/partners/PartnerShareContext.tsx
// - rules.md

import { AFFILIATE_VAT_RATE } from "@/shared/settlement/affiliateVat";
import { sharePartyLabel } from "@/shared/types/role";

export const AREA_KEYS = ["lab", "abutment", "platform"] as const;
export type AreaKey = (typeof AREA_KEYS)[number];

export type ShareKind = "percent" | "perCase" | "remainder";

export type TeamMember = {
  userId: string;
  name: string;
  email: string;
  role: string;
  sharePercent: number;
};

export type Department = {
  id: string;
  name: string;
  role?: string;
  businessAnchorId?: string;
  businessNumber?: string;
  shareKind: ShareKind;
  sharePercent: number;
  perCaseAmount: number;
  taxable: boolean;
  salesmanFallback: boolean;
  members: TeamMember[];
};

export type SpecialPartyShare = {
  id: string;
  requestorAnchorId: string;
  requestorName: string;
  manufacturer: number;
  devops: number;
  salesman: number;
  abuts: number;
};

export type LabAreaState = {
  previewPool: number;
  departments: Department[];
};

export type AbutmentAreaState = {
  previewSellPrice: number;
  hasSalesman: boolean;
  departments: Department[];
  specialShares: SpecialPartyShare[];
};

export type PlatformAreaState = {
  previewPool: number;
  departments: Department[];
};

export type BusinessAreaState = {
  lab: LabAreaState;
  abutment: AbutmentAreaState;
  platform: PlatformAreaState;
};

export const DEFAULT_ABUTMENT_UNITS = {
  manufacturer: 9000,
  devops: 1000,
  salesman: 3000,
} as const;

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createDepartment(partial: Partial<Department> & { name: string }): Department {
  return {
    id: partial.id || newId("dept"),
    name: partial.name,
    role: partial.role,
    businessAnchorId: partial.businessAnchorId,
    businessNumber: partial.businessNumber,
    shareKind: partial.shareKind || "percent",
    sharePercent: clampPercent(partial.sharePercent ?? 0),
    perCaseAmount: clampAmount(partial.perCaseAmount ?? 0),
    taxable: Boolean(partial.taxable),
    salesmanFallback: Boolean(partial.salesmanFallback),
    members: Array.isArray(partial.members) ? partial.members : [],
  };
}

export function defaultLabDepartments(): Department[] {
  return [
    createDepartment({
      id: "lab-gigong",
      name: sharePartyLabel("labTeam"),
      role: "labTeam",
      shareKind: "percent",
      sharePercent: 0,
      taxable: false,
    }),
    createDepartment({
      id: "lab-sales",
      name: sharePartyLabel("salesTeam"),
      role: "salesTeam",
      shareKind: "percent",
      sharePercent: 0,
      taxable: false,
    }),
    createDepartment({
      id: "lab-devops",
      name: sharePartyLabel("devops"),
      role: "devops",
      shareKind: "percent",
      sharePercent: 0,
      taxable: true,
    }),
  ];
}

export function defaultAbutmentDepartments(): Department[] {
  return [
    createDepartment({
      id: "abut-manufacturer",
      name: sharePartyLabel("manufacturer"),
      role: "manufacturer",
      shareKind: "perCase",
      perCaseAmount: DEFAULT_ABUTMENT_UNITS.manufacturer,
      taxable: false,
    }),
    createDepartment({
      id: "abut-devops",
      name: sharePartyLabel("devops"),
      role: "devops",
      shareKind: "perCase",
      perCaseAmount: DEFAULT_ABUTMENT_UNITS.devops,
      taxable: true,
    }),
    createDepartment({
      id: "abut-salesman",
      name: sharePartyLabel("salesman"),
      role: "salesman",
      shareKind: "perCase",
      perCaseAmount: DEFAULT_ABUTMENT_UNITS.salesman,
      taxable: true,
      salesmanFallback: true,
    }),
    createDepartment({
      id: "abut-abuts",
      name: sharePartyLabel("admin"),
      role: "admin",
      shareKind: "remainder",
      taxable: false,
    }),
  ];
}

export function defaultPlatformDepartments(): Department[] {
  return [
    createDepartment({
      id: "plat-abuts",
      name: sharePartyLabel("admin"),
      role: "admin",
      shareKind: "percent",
      sharePercent: 90,
      taxable: false,
    }),
    createDepartment({
      id: "plat-devops",
      name: sharePartyLabel("devops"),
      role: "devops",
      shareKind: "percent",
      sharePercent: 10,
      taxable: true,
    }),
  ];
}

export function defaultBusinessAreaState(): BusinessAreaState {
  return {
    lab: { previewPool: 0, departments: defaultLabDepartments() },
    abutment: {
      previewSellPrice: 15000,
      hasSalesman: true,
      departments: defaultAbutmentDepartments(),
      specialShares: [],
    },
    platform: { previewPool: 0, departments: defaultPlatformDepartments() },
  };
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value * 10) / 10));
}

export function clampAmount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function sumPercents(values: number[]): number {
  return Math.round(values.reduce((sum, n) => sum + Number(n || 0), 0) * 10) / 10;
}

export function remainingPercent(values: number[]): number {
  return Math.round((100 - sumPercents(values)) * 10) / 10;
}

export function formatWon(value: number): string {
  return `${clampAmount(value).toLocaleString("ko-KR")}원`;
}

export function formatPercent(value: number): string {
  const n = clampPercent(value);
  return Number.isInteger(n) ? `${n}%` : `${n.toFixed(1)}%`;
}

export function vatOn(supply: number, rate = AFFILIATE_VAT_RATE): number {
  return clampAmount(supply * Number(rate || 0));
}

export function payoutWithVat(supply: number, taxable: boolean, rate = AFFILIATE_VAT_RATE) {
  const vat = taxable ? vatOn(supply, rate) : 0;
  return { supply: clampAmount(supply), vat, total: clampAmount(supply) + vat };
}

export function partnerRoleLabel(role: string): string {
  return sharePartyLabel(role);
}

export function departmentPoolAmount(pool: number, sharePercent: number): number {
  return clampAmount((pool * sharePercent) / 100);
}

export function memberShareAmount(departmentAmount: number, sharePercent: number): number {
  return clampAmount((departmentAmount * sharePercent) / 100);
}

export function sumMemberPercents(members: TeamMember[]): number {
  return sumPercents(members.map((item) => item.sharePercent));
}

export function sumDepartmentPercents(departments: Department[]): number {
  return sumPercents(
    departments.filter((item) => item.shareKind === "percent").map((item) => item.sharePercent),
  );
}

export type AbutmentCaseRow = {
  id: string;
  name: string;
  supply: number;
  vat: number;
  total: number;
  skippedToAbuts: boolean;
  shareKind: ShareKind;
};

export function allocateAbutmentCase(args: {
  sellPrice: number;
  hasSalesman: boolean;
  departments: Department[];
  vatRate?: number;
}): { rows: AbutmentCaseRow[]; assigned: number; remainder: number } {
  const sellPrice = clampAmount(args.sellPrice);
  const vatRate = args.vatRate ?? AFFILIATE_VAT_RATE;
  let assigned = 0;
  const rows: AbutmentCaseRow[] = args.departments.map((dept) => {
    if (dept.shareKind === "remainder") {
      return {
        id: dept.id,
        name: dept.name,
        supply: 0,
        vat: 0,
        total: 0,
        skippedToAbuts: false,
        shareKind: dept.shareKind,
      };
    }
    const skippedToAbuts = Boolean(dept.salesmanFallback) && !args.hasSalesman;
    const supply = skippedToAbuts ? 0 : clampAmount(dept.perCaseAmount);
    if (!skippedToAbuts) assigned += supply;
    const payout = payoutWithVat(supply, dept.taxable, vatRate);
    return {
      id: dept.id,
      name: dept.name,
      supply: payout.supply,
      vat: payout.vat,
      total: payout.total,
      skippedToAbuts,
      shareKind: dept.shareKind,
    };
  });

  const remainder = Math.max(0, sellPrice - assigned);
  const remainderDepts = args.departments.filter((item) => item.shareKind === "remainder");
  const remainderEach =
    remainderDepts.length > 0
      ? Math.floor(remainder / remainderDepts.length)
      : remainder;
  let remainderUsed = 0;
  const nextRows = rows.map((row, index) => {
    const dept = args.departments[index];
    if (dept?.shareKind !== "remainder") return row;
    const isLast =
      remainderDepts.length > 0 &&
      dept.id === remainderDepts[remainderDepts.length - 1]?.id;
    const supply = isLast ? remainder - remainderUsed : remainderEach;
    remainderUsed += supply;
    const payout = payoutWithVat(supply, dept.taxable, vatRate);
    return { ...row, supply: payout.supply, vat: payout.vat, total: payout.total };
  });

  return { rows: nextRows, assigned, remainder };
}

export function createSpecialShare(args: {
  requestorAnchorId: string;
  requestorName: string;
  manufacturer?: number;
  devops?: number;
  salesman?: number;
  abuts?: number;
}): SpecialPartyShare {
  return {
    id: newId("special"),
    requestorAnchorId: args.requestorAnchorId,
    requestorName: args.requestorName,
    manufacturer: clampAmount(
      args.manufacturer ?? DEFAULT_ABUTMENT_UNITS.manufacturer,
    ),
    devops: clampAmount(args.devops ?? DEFAULT_ABUTMENT_UNITS.devops),
    salesman: clampAmount(args.salesman ?? DEFAULT_ABUTMENT_UNITS.salesman),
    abuts: clampAmount(args.abuts ?? 0),
  };
}

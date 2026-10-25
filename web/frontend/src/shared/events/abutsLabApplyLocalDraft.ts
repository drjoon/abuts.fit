// related files:
// - web/frontend/src/pages/public/AbutsLabEventPage.tsx
// - web/frontend/src/shared/events/eventsApi.ts
//
// 어벗츠기공소 소개 상담 신청 초안. 새로고침해도 남긴다. 접수되면 지운다.

import type { EventPlaceSuggest } from "@/shared/events/eventsApi";
import { formatPhoneNumberInput } from "@/shared/components/business/settings/business/validations";

const STORAGE_PREFIX = "abutsfit:abuts-lab-apply-draft:v1:";

export type AbutsLabApplyLocalDraft = {
  directorName: string;
  phone: string;
  clinicQuery: string;
  place: EventPlaceSuggest | null;
  addressMode: "search" | "manual";
  manualAddress: string;
  manualClinicName: string;
  usesOralScan: boolean | null;
  updatedAt: number;
};

function storageKey(userId?: string | null) {
  const uid = String(userId || "anon")
    .trim()
    .slice(0, 64);
  return `${STORAGE_PREFIX}${uid}`;
}

function normalizePlace(raw: unknown): EventPlaceSuggest | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const name = String(src.name || "").trim().slice(0, 120);
  const address = String(src.address || "").trim().slice(0, 240);
  if (!name && !address) return null;
  const lat = Number(src.lat);
  const lng = Number(src.lng);
  const kind = src.kind === "dealer" || src.kind === "lab" ? src.kind : "practice";
  return {
    source: "kakao",
    name,
    kind,
    address,
    representativeName: String(src.representativeName || "").trim().slice(0, 80),
    phone: formatPhoneNumberInput(String(src.phone || "")),
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  };
}

function normalizeDraft(raw: unknown): AbutsLabApplyLocalDraft {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const oral = src.usesOralScan;
  return {
    directorName: String(src.directorName || "").trim().slice(0, 80),
    phone: formatPhoneNumberInput(String(src.phone || "")),
    clinicQuery: String(src.clinicQuery || "").trim().slice(0, 240),
    place: normalizePlace(src.place),
    addressMode: src.addressMode === "manual" ? "manual" : "search",
    manualAddress: String(src.manualAddress || "").trim().slice(0, 240),
    manualClinicName: String(src.manualClinicName || "").trim().slice(0, 120),
    usesOralScan: oral === true || oral === false ? oral : null,
    updatedAt: Number(src.updatedAt) || Date.now(),
  };
}

export function abutsLabApplyDraftHasContent(
  draft: AbutsLabApplyLocalDraft | null | undefined,
) {
  if (!draft) return false;
  return Boolean(
    draft.directorName ||
      draft.phone ||
      draft.clinicQuery ||
      draft.place ||
      draft.manualAddress ||
      draft.manualClinicName ||
      draft.usesOralScan != null,
  );
}

export function readAbutsLabApplyLocalDraft(
  userId?: string | null,
): AbutsLabApplyLocalDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    return normalizeDraft(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeAbutsLabApplyLocalDraft(
  draft: Omit<AbutsLabApplyLocalDraft, "updatedAt">,
  userId?: string | null,
) {
  if (typeof window === "undefined") return;
  try {
    const payload = normalizeDraft({ ...draft, updatedAt: Date.now() });
    window.localStorage.setItem(storageKey(userId), JSON.stringify(payload));
  } catch {
    // 저장을 막은 브라우저에서는 이번 입력만 둔다.
  }
}

export function clearAbutsLabApplyLocalDraft(userId?: string | null) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(userId));
  } catch {
    // ignore
  }
}

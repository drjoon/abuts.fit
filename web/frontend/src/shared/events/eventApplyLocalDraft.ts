// related files:
// - web/frontend/src/pages/public/EventApplyPage.tsx
// - web/frontend/src/shared/events/eventsApi.ts
// - web/frontend/src/shared/components/business/settings/business/validations.ts
//
// 출시 행사 신청 폼(구강 스캔·재료상) 초안 — 새로고침 유지. 신청 성공 시 삭제.

import type { EventPlaceFields } from "@/shared/events/eventsApi";
import { formatPhoneNumberInput } from "@/shared/components/business/settings/business/validations";

const STORAGE_PREFIX = "abutsfit:event-apply-draft:v1:";

export type EventApplyLocalDraft = {
  usesOralScan: boolean | null;
  dealer: EventPlaceFields;
  updatedAt: number;
};

function storageKey(slug: string, userId?: string | null): string {
  const safeSlug = String(slug || "")
    .trim()
    .toLowerCase()
    .slice(0, 80);
  const uid = String(userId || "anon")
    .trim()
    .slice(0, 64);
  return `${STORAGE_PREFIX}${safeSlug}:${uid}`;
}

function emptyDealer(): EventPlaceFields {
  return {
    name: "",
    representativeName: "",
    phone: "",
    address: "",
    lat: null,
    lng: null,
  };
}

function normalizeDealer(raw: unknown): EventPlaceFields {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const lat = Number(src.lat);
  const lng = Number(src.lng);
  return {
    name: String(src.name || "").trim().slice(0, 120),
    representativeName: String(src.representativeName || "")
      .trim()
      .slice(0, 80),
    phone: formatPhoneNumberInput(String(src.phone || "")),
    address: String(src.address || "").trim().slice(0, 240),
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  };
}

export function readEventApplyLocalDraft(
  slug: string,
  userId?: string | null,
): EventApplyLocalDraft | null {
  if (typeof window === "undefined" || !slug) return null;
  try {
    const raw = window.localStorage.getItem(storageKey(slug, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<EventApplyLocalDraft>;
    const usesOralScan =
      parsed.usesOralScan === true
        ? true
        : parsed.usesOralScan === false
          ? false
          : null;
    return {
      usesOralScan,
      dealer: normalizeDealer(parsed.dealer),
      updatedAt: Number(parsed.updatedAt) || Date.now(),
    };
  } catch {
    return null;
  }
}

export function writeEventApplyLocalDraft(
  slug: string,
  draft: {
    usesOralScan: boolean | null;
    dealer: EventPlaceFields;
  },
  userId?: string | null,
) {
  if (typeof window === "undefined" || !slug) return;
  try {
    const payload: EventApplyLocalDraft = {
      usesOralScan:
        draft.usesOralScan === true
          ? true
          : draft.usesOralScan === false
            ? false
            : null,
      dealer: normalizeDealer(draft.dealer),
      updatedAt: Date.now(),
    };
    window.localStorage.setItem(
      storageKey(slug, userId),
      JSON.stringify(payload),
    );
  } catch {
    // ignore quota / private mode
  }
}

export function clearEventApplyLocalDraft(
  slug: string,
  userId?: string | null,
) {
  if (typeof window === "undefined" || !slug) return;
  try {
    window.localStorage.removeItem(storageKey(slug, userId));
  } catch {
    // ignore
  }
}

export function emptyEventApplyDealer(): EventPlaceFields {
  return emptyDealer();
}

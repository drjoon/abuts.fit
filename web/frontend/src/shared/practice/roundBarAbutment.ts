// related files:
// - web/backend/utils/roundBarAbutment.js
// - web/backend/controllers/practiceTransfers/roundBarAbutmentRequest.controller.js
// - web/backend/controllers/admin/admin.roundBarAbutment.controller.js
// - web/frontend/src/shared/components/practice/PracticeToothImplantFields.tsx
// - web/frontend/src/pages/admin/system/AdminRoundBarAbutmentTab.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// change-log:
// - 2026-08-14: 관리자 타입 수정 패치.
// - 2026-08-14: 도입 실시간 이벤트(`practice:round-bar-request-updated`) 프리셋 patch.
import { apiFetch } from "@/shared/api/apiClient";
import type { PracticeImplantFavorite } from "@/shared/practice/transferMemo";

export const ROUND_BAR_HEX_TYPE = "헥스(사이즈 미정)";
export const MANUFACTURER_ADD_REQUEST_VALUE = "__add_manufacturer_request__";
export const ROUND_BAR_REQUEST_UPDATED_EVENT = "practice:round-bar-request-updated";
export const ABUTMENT_ADOPTED_KIND = {
  CNC: "cnc",
  ROUND_BAR: "round_bar",
} as const;
export type AbutmentAdoptedKind = "" | "cnc" | "round_bar";

export const normalizeAdoptedKind = (value: unknown): AbutmentAdoptedKind => {
  const raw = String(value || "").trim().toLowerCase().replace(/-/g, "_");
  if (raw === ABUTMENT_ADOPTED_KIND.CNC) return ABUTMENT_ADOPTED_KIND.CNC;
  if (raw === ABUTMENT_ADOPTED_KIND.ROUND_BAR || raw === "roundbar") {
    return ABUTMENT_ADOPTED_KIND.ROUND_BAR;
  }
  return "";
};
export const ROUND_BAR_GUIDE_TITLE = "안내";
export const ROUND_BAR_GUIDE_LINES = [
  "어벗츠에서 빠른 시일내 준비하겠습니다.",
  "일단 거래하시는 기공소로 주문합니다.",
] as const;

export type RoundBarAbutmentRequest = {
  id: string;
  practiceAnchorId: string;
  practiceName: string;
  requestedBy: string;
  favoriteId: string;
  inquiryId: string;
  manufacturer: string;
  brand: string;
  family: string;
  type: string;
  adopted: boolean;
  adoptedKind?: AbutmentAdoptedKind;
  adoptedAt?: string | null;
  revertedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type RoundBarRequestPayload = {
  manufacturer: string;
  brand: string;
  family: string;
  favoriteId?: string;
};

export const isRoundBarFavorite = (row: Partial<PracticeImplantFavorite> | null | undefined) =>
  Boolean(row?.roundBar) || Boolean(String(row?.roundBarRequestId || "").trim());

export type RoundBarRequestUpdatedPayload = {
  practiceAnchorId?: string;
  requestId?: string;
  favoriteId?: string;
  adopted?: boolean;
  adoptedKind?: AbutmentAdoptedKind;
  manufacturer?: string;
  brand?: string;
  family?: string;
  type?: string;
};

export const applyRoundBarRequestUpdate = (
  favorites: PracticeImplantFavorite[],
  payload: RoundBarRequestUpdatedPayload | null | undefined,
): PracticeImplantFavorite[] => {
  const requestId = String(payload?.requestId || "").trim();
  const favoriteId = String(payload?.favoriteId || "").trim();
  if (!requestId && !favoriteId) return favorites;
  const adopted = Boolean(payload?.adopted);
  const adoptedKind = normalizeAdoptedKind(payload?.adoptedKind);
  const manufacturer = String(payload?.manufacturer || "").trim();
  const brand = String(payload?.brand || "").trim();
  const family = String(payload?.family || "").trim();
  const type = String(payload?.type || "").trim() || ROUND_BAR_HEX_TYPE;
  return favorites.map((fav) => {
    const match =
      (requestId && String(fav.roundBarRequestId || "").trim() === requestId) ||
      (favoriteId && fav.id === favoriteId);
    if (!match) return fav;
    return {
      ...fav,
      roundBar: true,
      adopted,
      adoptedKind,
      roundBarRequestId: requestId || fav.roundBarRequestId,
      manufacturer: manufacturer || fav.manufacturer,
      brand: brand || fav.brand,
      family: family || fav.family,
      type,
    };
  });
};

export async function submitRoundBarManufacturerRequest(params: {
  token: string;
  payload: RoundBarRequestPayload;
}) {
  const res = await apiFetch<{
    success?: boolean;
    message?: string;
    data?: {
      request?: RoundBarAbutmentRequest;
      favorite?: PracticeImplantFavorite;
    };
  }>({
    path: "/api/practice/transfers/round-bar-requests",
    method: "POST",
    token: params.token,
    jsonBody: {
      manufacturer: String(params.payload.manufacturer || "").trim(),
      brand: String(params.payload.brand || "").trim(),
      family: String(params.payload.family || "").trim(),
      type: ROUND_BAR_HEX_TYPE,
      favoriteId: String(params.payload.favoriteId || "").trim() || undefined,
    },
    skipCache: true,
  });
  if (!res.ok) {
    throw new Error(res.data?.message || "제조사 추가 요청에 실패했습니다.");
  }
  return res.data?.data || {};
}

export async function fetchAdminRoundBarRequests(params: {
  token: string;
  q?: string;
  status?: "pending" | "adopted" | "";
}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.status) qs.set("status", params.status);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await apiFetch<{
    success?: boolean;
    message?: string;
    data?: RoundBarAbutmentRequest[];
  }>({
    path: `/api/admin/round-bar-requests${suffix}`,
    method: "GET",
    token: params.token,
    skipCache: true,
  });
  if (!res.ok) {
    throw new Error(res.data?.message || "목록을 불러오지 못했습니다.");
  }
  return Array.isArray(res.data?.data) ? res.data.data : [];
}

export async function patchAdminRoundBarRequest(params: {
  token: string;
  id: string;
  patch: Partial<
    Pick<
      RoundBarAbutmentRequest,
      "manufacturer" | "brand" | "family" | "type" | "adopted" | "adoptedKind"
    >
  >;
}) {
  const res = await apiFetch<{
    success?: boolean;
    message?: string;
    data?: RoundBarAbutmentRequest;
  }>({
    path: `/api/admin/round-bar-requests/${encodeURIComponent(params.id)}`,
    method: "PATCH",
    token: params.token,
    jsonBody: params.patch,
    skipCache: true,
  });
  if (!res.ok) {
    throw new Error(res.data?.message || "저장에 실패했습니다.");
  }
  return res.data?.data || null;
}

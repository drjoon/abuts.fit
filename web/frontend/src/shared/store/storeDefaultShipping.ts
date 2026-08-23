// change-log:
// - 2026-08-23: 배송지 SSOT = 설정·사업자 metadata(표시·주문 동일).
// - 2026-08-23: 스토어 장바구니 기본 배송지 — practiceProfile·metadata 조합.
// related files:
// - web/backend/controllers/store/storeOrder.controller.js (resolveDefaultShipping)
// - web/frontend/src/pages/requestor/store/RequestorStoreCartPage.tsx
import type { User } from "@/store/useAuthStore";

export type StoreShippingForm = {
  recipientName: string;
  phone: string;
  zipCode: string;
  address: string;
  addressDetail: string;
  memo: string;
};

export const STORE_BUSINESS_SETTINGS_PATH = "/dashboard/settings?tab=business";

export const EMPTY_STORE_SHIPPING: StoreShippingForm = {
  recipientName: "",
  phone: "",
  zipCode: "",
  address: "",
  addressDetail: "",
  memo: "",
};

type BusinessMetadata = {
  companyName?: string;
  phoneNumber?: string;
  zipCode?: string;
  address?: string;
  addressDetail?: string;
};

/** 설정·사업자 metadata 우선(장바구니 표시·주문 SSOT). */
export function resolveStoreShippingFromBusiness(
  user: User | null | undefined,
  metadata?: BusinessMetadata | null,
): StoreShippingForm {
  const profile = user?.practiceProfile || {};
  const meta = metadata || {};
  return {
    recipientName:
      meta.companyName ||
      profile.clinicName ||
      profile.directorName ||
      user?.name ||
      "",
    phone: meta.phoneNumber || profile.clinicPhone || profile.phone || "",
    zipCode: meta.zipCode || profile.zipCode || "",
    address: meta.address || profile.address || "",
    addressDetail: meta.addressDetail || profile.addressDetail || "",
    memo: "",
  };
}

/** @deprecated resolveStoreShippingFromBusiness 사용 */
export function resolveDefaultStoreShipping(
  user: User | null | undefined,
  metadata?: BusinessMetadata | null,
): StoreShippingForm {
  return resolveStoreShippingFromBusiness(user, metadata);
}

export function isStoreShippingReady(shipping: StoreShippingForm): boolean {
  return Boolean(
    shipping.recipientName.trim() &&
      shipping.phone.trim() &&
      shipping.address.trim(),
  );
}

export function formatStoreShippingAddressLine(shipping: StoreShippingForm): string {
  const zip = shipping.zipCode.trim();
  const base = shipping.address.trim();
  const detail = shipping.addressDetail.trim();
  const parts = [
    zip ? `[${zip}]` : "",
    base,
    detail,
  ].filter(Boolean);
  return parts.join(" ");
}

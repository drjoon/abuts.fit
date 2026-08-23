// change-log:
// - 2026-08-23: 스토어 장바구니 기본 배송지 — API 없이 practiceProfile·metadata 조합.
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

/** 백엔드 resolveDefaultShipping과 동일 우선순위. */
export function resolveDefaultStoreShipping(
  user: User | null | undefined,
  metadata?: BusinessMetadata | null,
): StoreShippingForm {
  const profile = user?.practiceProfile || {};
  const meta = metadata || {};
  return {
    recipientName:
      profile.clinicName ||
      profile.directorName ||
      meta.companyName ||
      user?.name ||
      "",
    phone: profile.clinicPhone || profile.phone || meta.phoneNumber || "",
    zipCode: profile.zipCode || meta.zipCode || "",
    address: profile.address || meta.address || "",
    addressDetail: profile.addressDetail || meta.addressDetail || "",
    memo: "",
  };
}

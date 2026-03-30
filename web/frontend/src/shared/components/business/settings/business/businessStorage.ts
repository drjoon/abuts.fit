// SSOT: metadata 사용 (extracted 레거시 제거)
import {
  BusinessMetadata,
  BusinessData,
  LicenseStatus,
} from "@/shared/components/business/types";

const SETUP_MODE_STORAGE_KEY = "business_tab_setup_mode";
const BUSINESS_DRAFT_STORAGE_KEY = "business_tab_draft_v1";

export type SetupMode = "license" | "search" | "manual" | null;

export interface BusinessDraftPayload {
  businessData: BusinessData;
  metadata: BusinessMetadata;
  licenseFileName: string;
  licenseFileId: string;
  licenseS3Key: string;
  licenseStatus: LicenseStatus;
  isVerified: boolean;
  updatedAt: number;
}

const getSetupModeStorageKey = (
  userId?: string | null,
  businessType?: string | null,
): string | null => {
  if (!userId) return null;
  const suffix = businessType ? `:${businessType}` : "";
  return `${SETUP_MODE_STORAGE_KEY}:${userId}${suffix}`;
};

const getBusinessDraftStorageKey = (
  userId?: string | null,
  businessType?: string | null,
): string | null => {
  if (!userId) return null;
  const suffix = businessType ? `:${businessType}` : "";
  return `${BUSINESS_DRAFT_STORAGE_KEY}:${userId}${suffix}`;
};

export const readStoredSetupMode = (
  userId?: string | null,
  businessType?: string | null,
): SetupMode => {
  if (typeof window === "undefined") return null;
  try {
    const storageKey = getSetupModeStorageKey(userId, businessType);
    if (!storageKey) return null;
    const raw = window.localStorage.getItem(storageKey);
    if (raw === "license" || raw === "search" || raw === "manual") return raw;
    return null;
  } catch {
    return null;
  }
};

export const writeStoredSetupMode = (
  userId: string | null,
  mode: SetupMode,
  businessType?: string | null,
): void => {
  if (typeof window === "undefined") return;
  try {
    const storageKey = getSetupModeStorageKey(userId, businessType);
    if (!storageKey) return;
    if (!mode) {
      window.localStorage.removeItem(storageKey);
      return;
    }
    window.localStorage.setItem(storageKey, mode);
  } catch {
    // ignore
  }
};

export const readStoredBusinessDraft = (
  userId?: string | null,
  businessType?: string | null,
): BusinessDraftPayload | null => {
  if (typeof window === "undefined") return null;
  try {
    const storageKey = getBusinessDraftStorageKey(userId, businessType);
    if (!storageKey) return null;
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.businessData) return null;
    return {
      ...parsed,
      businessData: normalizeBusinessData(parsed.businessData),
      metadata: normalizeMetadata(parsed.metadata || parsed.extracted),
    };
  } catch {
    return null;
  }
};

export const writeStoredBusinessDraft = (
  userId: string | null,
  payload: BusinessDraftPayload | null,
  businessType?: string | null,
): void => {
  if (typeof window === "undefined") return;
  try {
    const storageKey = getBusinessDraftStorageKey(userId, businessType);
    if (!storageKey) return;
    if (!payload) {
      window.localStorage.removeItem(storageKey);
      return;
    }
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // ignore
  }
};

export const createEmptyMetadata = (): BusinessMetadata => ({
  companyName: "",
  businessNumber: "",
  address: "",
  addressDetail: "",
  zipCode: "",
  phoneNumber: "",
  email: "",
  representativeName: "",
  businessType: "",
  businessItem: "",
  startDate: "",
});

export const normalizeBusinessData = (
  value?: Partial<BusinessData> | null,
): BusinessData => ({
  companyName: String(value?.companyName || "").trim(),
  owner: String(value?.owner || "").trim(),
  businessNumber: String(value?.businessNumber || "").trim(),
  address: String(value?.address || "").trim(),
  addressDetail: String(value?.addressDetail || "").trim(),
  zipCode: String(value?.zipCode || "").trim(),
  phone: String(value?.phone || "").trim(),
  email: String(value?.email || "").trim(),
  businessType: String(value?.businessType || "").trim(),
  businessItem: String(value?.businessItem || "").trim(),
  startDate: String(value?.startDate || "").trim(),
});

export const normalizeMetadata = (
  value?: Partial<BusinessMetadata> | null,
): BusinessMetadata => ({
  ...createEmptyMetadata(),
  ...(value || {}),
  companyName: String(value?.companyName || "").trim(),
  businessNumber: String(value?.businessNumber || "").trim(),
  address: String(value?.address || "").trim(),
  addressDetail: String(value?.addressDetail || "").trim(),
  zipCode: String(value?.zipCode || "").trim(),
  phoneNumber: String(value?.phoneNumber || "").trim(),
  email: String(value?.email || "").trim(),
  representativeName: String(value?.representativeName || "").trim(),
  businessType: String(value?.businessType || "").trim(),
  businessItem: String(value?.businessItem || "").trim(),
  startDate: String(value?.startDate || "").trim(),
});

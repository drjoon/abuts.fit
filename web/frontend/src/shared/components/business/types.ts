// 레거시: LicenseExtracted 타입 제거 (2026-03-31)
// SSOT: BusinessMetadata 사용 (백엔드 metadata 필드와 동일)
export type BusinessMetadata = {
  companyName?: string;
  businessNumber?: string;
  address?: string;
  addressDetail?: string;
  zipCode?: string;
  phoneNumber?: string;
  email?: string;
  representativeName?: string;
  businessType?: string; // 업태 (백엔드 metadata.businessType)
  businessItem?: string; // 종목
  startDate?: string;
};

// 레거시 호환성 (deprecated)
export type LicenseExtracted = BusinessMetadata;

export type BusinessData = {
  companyName: string;
  owner: string;
  businessNumber: string;
  phone: string;
  email: string;
  businessType: string; // 업태
  businessItem: string;
  address: string;
  zipCode: string;
  addressDetail: string;
  startDate: string;
};

export type LicenseStatus =
  | "missing"
  | "uploading"
  | "uploaded"
  | "processing"
  | "ready"
  | "error";

export type MembershipStatus = "none" | "owner" | "member" | "pending";

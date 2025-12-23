export type LicenseExtracted = {
  companyName?: string;
  businessNumber?: string;
  address?: string;
  phoneNumber?: string;
  email?: string;
  representativeName?: string;
  businessType?: string;
  businessItem?: string;
  startDate?: string; // YYYY-MM-DD 입력 예상, 저장은 그대로
};

export type BusinessData = {
  companyName: string;
  businessNumber: string;
  address: string;
  phone: string;
};

export type LicenseStatus =
  | "missing"
  | "uploading"
  | "uploaded"
  | "processing"
  | "ready"
  | "error";

export type MembershipStatus = "none" | "owner" | "member" | "pending";

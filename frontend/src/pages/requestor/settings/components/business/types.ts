export type LicenseExtracted = {
  companyName?: string;
  businessNumber?: string;
  address?: string;
  phoneNumber?: string;
  email?: string;
  representativeName?: string;
  businessType?: string;
  businessItem?: string;
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

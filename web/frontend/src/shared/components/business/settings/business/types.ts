// SSOT: metadata 사용 (extracted 레거시 제거)
export type {
  BusinessMetadata,
  BusinessData,
  LicenseStatus,
  MembershipStatus,
} from "@/shared/components/business/types";

export type FieldKey =
  | "repName"
  | "startDate"
  | "companyName"
  | "phone"
  | "bizNo"
  | "bizType"
  | "bizItem"
  | "email"
  | "address"
  | "addressDetail"
  | "zipCode"
  | "submit";

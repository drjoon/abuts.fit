export type ClinicFavoriteImplant = {
  manufacturer: string;
  system: string;
  type: string;
};

export type ClinicPreset = {
  id: string;
  name: string;
  favorite?: ClinicFavoriteImplant;
};

export type CaseInfos = {
  clinicName?: string;
  patientName?: string;
  tooth?: string;
  implantManufacturer?: string;
  implantSystem?: string;
  implantType?: string;
  maxDiameter?: number;
  connectionDiameter?: number;
  workType?: string; // "abutment" | "crown" | "prosthesis"
  shippingMode?: "normal" | "express";
  requestedShipDate?: string; // ISO date string or YYYY-MM-DD
};

export type DraftFileMeta = {
  fileId?: string; // 기존 File 도큐먼트 ID (선택적)
  originalName: string;
  size: number;
  mimetype: string;
  s3Key?: string;
};

export type DraftCaseInfo = CaseInfos & {
  _id: string; // Draft 내 caseInfos 서브도큐먼트 ID
  file?: DraftFileMeta; // 임베디드 파일 메타데이터
};

export type DraftMeta = {
  draftId: string;
  updatedAt: number; // 캐시 갱신 시각 (ms)
  caseInfos: CaseInfos;
};

export type DraftRequest = {
  _id: string;
  requestor: string;
  status: "draft" | "submitted" | "cancelled";
  caseInfos: DraftCaseInfo[];
  createdAt: string;
  updatedAt: string;
};

export type ClinicFavoriteImplant = {
  manufacturer: string;
  brand: string;
  family?: string;
  type: string;
};

export type RetentionGrooveValue = "none" | "shallow" | "deep";

export type ClinicPreset = {
  id: string;
  name: string;
  favorite?: ClinicFavoriteImplant;
  // 치과별 유지홈 디폴트값. 새 의뢰 작성 시 치과를 선택하면 이 값이
  // caseInfos.retentionGroove 로 자동 채워진다. 사용자가 값을 바꾸면
  // 자동으로 해당 치과의 디폴트로 갱신된다 (favorite 임플란트와 동일 패턴).
  defaultRetentionGroove?: RetentionGrooveValue;
};

export type Connection = {
  _id?: string;
  manufacturer: string;
  manufacturerKor?: string;
  brand?: string;
  family?: string;
  type: string;
  isActive?: boolean;
  displayManufacturer?: string | null;
  displayBrand?: string | null;
  displayFamily?: string | null;
  displayType?: string | null;
  connectionPrcFileName?: string | null;
  faceHolePrcFileName?: string | null;
  prcTypeCode?: string | null;
  prcSystemCode?: string | null;
  diameter?: number | null;
  connectionDiameter?: number | null;
  hexSize?: number | null;
  screwType?: string | null;
};

export type CaseInfos = {
  clinicName?: string;
  patientName?: string;
  tooth?: string;
  implantManufacturer?: string;
  implantBrand?: string;
  implantFamily?: string;
  implantType?: string;
  maxDiameter?: number;
  connectionDiameter?: number;
  totalLength?: number;
  taperAngle?: number;
  tiltAxisVector?: { x: number; y: number; z: number };
  frontPoint?: { x: number; y: number; z: number };
  workType?: string; // "abutment" | "crown" | "prosthesis"
  shippingMode?: "normal" | "express";
  requestedShipDate?: string; // ISO date string or YYYY-MM-DD
  newSystemRequest?: {
    requested: boolean;
    manufacturer?: string;
    brand?: string;
    family?: string;
    message?: string;
    free?: boolean;
    tag?: string;
  };
  retentionGroove?: "none" | "shallow" | "deep";
  // 헥스 회전 모드값 SSOT
  // - "0": 각도 보정
  // - "30": 원본 각도
  requestorHexRotation?: "0" | "30";
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

// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
// - web/backend/controllers/requests/creation.from-draft.controller.js
import type { ToothWorkSelection } from "@/shared/practice/transferMemo";

export type ClinicFavoriteImplant = {
  manufacturer: string;
  brand: string;
  family?: string;
  type: string;
};

export type RetentionGrooveValue = "none" | "shallow" | "deep";

/** 신규의뢰 상세 모달: 커스텀어벗 생산 vs 커스텀어벗 디자인+생산 */
export type NewRequestProductMode = "custom_abutment" | "design_custom_abutment";

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
  /** 커스텀어벗 생산 탭 치아번호 (단일/자유 입력). 디자인+생산 toothWorks 와 별개. */
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
  /** 상세 모달 상품 모드. 기본 custom_abutment. workType(abutment)과 별개. */
  productMode?: NewRequestProductMode;
  /** 디자인+생산 탭 보철물 치식. 커스텀어벗 생산 tooth 와 별개. */
  toothWorks?: ToothWorkSelection[];
  /** @deprecated 치식(toothWorks)으로 대체. 레거시 호환용 */
  prosthesisType?: string;
  /** 디자인+생산: 자유 메모 */
  memo?: string;
  shippingMode?: "normal" | "express";
  requestedShipDate?: string; // ISO date string or YYYY-MM-DD
  designSoftware?: string;
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
  requestorHexRotation?: "STL모델대로" | "헥스30도회전";
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

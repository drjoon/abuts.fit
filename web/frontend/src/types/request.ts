export interface RequestUserSummary {
  _id?: string;
  id?: string;
  name?: string;
  email?: string;
  organization?: string;
  phone?: string;
}

export interface DeliveryInfoSummary {
  trackingNumber?: string;
  carrier?: string;
  shippedAt?: string;
  deliveredAt?: string;
}

export interface RequestCaseInfos {
  clinicName?: string;
  patientName?: string;
  tooth?: string;
  implantManufacturer?: string;
  implantSystem?: string;
  implantType?: string;
  maxDiameter?: number;
  connectionDiameter?: number;
  workType?: string;
  finishLine?: {
    version?: number;
    sectionCount?: number;
    maxStepDistance?: number;
    points?: number[][];
    pt0?: number[];
    updatedAt?: string;
  };
  reviewByStage?: {
    request?: {
      status?: "PENDING" | "APPROVED" | "REJECTED";
      updatedAt?: string;
      updatedBy?: string;
      reason?: string;
    };
    cam?: {
      status?: "PENDING" | "APPROVED" | "REJECTED";
      updatedAt?: string;
      updatedBy?: string;
      reason?: string;
    };
    machining?: {
      status?: "PENDING" | "APPROVED" | "REJECTED";
      updatedAt?: string;
      updatedBy?: string;
      reason?: string;
    };
    packaging?: {
      status?: "PENDING" | "APPROVED" | "REJECTED";
      updatedAt?: string;
      updatedBy?: string;
      reason?: string;
    };
    shipping?: {
      status?: "PENDING" | "APPROVED" | "REJECTED";
      updatedAt?: string;
      updatedBy?: string;
      reason?: string;
    };
    tracking?: {
      status?: "PENDING" | "APPROVED" | "REJECTED";
      updatedAt?: string;
      updatedBy?: string;
      reason?: string;
    };
  };
  stageFiles?: {
    machining?: {
      fileName?: string;
      fileType?: string;
      fileSize?: number;
      filePath?: string;
      s3Key?: string;
      s3Url?: string;
      source?: "worker" | "manual";
      uploadedBy?: string;
      uploadedAt?: string;
    };
    packaging?: {
      fileName?: string;
      fileType?: string;
      fileSize?: number;
      filePath?: string;
      s3Key?: string;
      s3Url?: string;
      source?: "worker" | "manual";
      uploadedBy?: string;
      uploadedAt?: string;
    };
    shipping?: {
      fileName?: string;
      fileType?: string;
      fileSize?: number;
      filePath?: string;
      s3Key?: string;
      s3Url?: string;
      source?: "worker" | "manual";
      uploadedBy?: string;
      uploadedAt?: string;
    };
    tracking?: {
      fileName?: string;
      fileType?: string;
      fileSize?: number;
      filePath?: string;
      s3Key?: string;
      s3Url?: string;
      source?: "worker" | "manual";
      uploadedBy?: string;
      uploadedAt?: string;
    };
  };
  file?: {
    originalName?: string;
    fileType?: string;
    fileSize?: number;
    filePath?: string;
    s3Key?: string;
    s3Url?: string;
  };
  camFile?: {
    fileName?: string;
    originalName?: string;
    fileType?: string;
    fileSize?: number;
    filePath?: string;
    s3Key?: string;
    s3Url?: string;
    uploadedAt?: string;
  };
  ncFile?: {
    fileName?: string;
    originalName?: string;
    fileType?: string;
    fileSize?: number;
    filePath?: string;
    s3Key?: string;
    s3Url?: string;
    uploadedAt?: string;
  };
}

// 프론트에서 공통으로 사용하는 의뢰 타입 (백엔드 Request 모델의 부분집합)
export interface RequestBase {
  _id?: string; // Mongo ObjectId
  requestId?: string; // YYYYMMDD-###### 형식의 의뢰 ID
  title?: string;
  status?: string;
  manufacturerStage?: "의뢰" | "CAM" | "생산" | "발송" | "추적관리" | string;
  lotNumber?: {
    material?: string;
    part?: string;
    final?: string;
  };
  assignedMachine?: string; // 가공 직전 배정된 장비 (M3, M4 등)
  status2?: string;
  createdAt?: string;
  updatedAt?: string;
  description?: string;

  // 관계 정보 (간단 summary)
  requestor?: RequestUserSummary;

  // 백엔드 Request.caseInfos 매핑 (단일 케이스 기준)
  caseInfos?: RequestCaseInfos;

  // 배송 요청 정보
  shippingMode?: "normal" | "express";
  requestedShipDate?: string; // ISO string 또는 YYYY-MM-DD

  productionSchedule?: {
    scheduledShipPickup?: string | Date;
    estimatedDelivery?: string | Date;
    assignedMachine?: string;
    queuePosition?: number;
    diameter?: number;
    diameterGroup?: string;
  };

  shippingPriority?: {
    mode?: "normal" | "express";
    level?: "normal" | "warning" | "danger" | string;
    score?: number;
    shipYmd?: string | null;
    deadlineAt?: string | null;
    minutesLeft?: number | null;
    label?: string;
  };

  // 결제/가격 정보 (백엔드 price, paymentStatus 매핑)
  price?: {
    amount?: number;
    currency?: string;
    quotedAt?: string;
  };
  paymentStatus?: "결제전" | "결제완료" | "결제취소" | string;

  // 배송 정보 레퍼런스 (별도 DeliveryInfo 컬렉션)
  deliveryInfoRef?: string | DeliveryInfoSummary;

  shippingPackageId?: string;
}

// RequestBase에서 공통적으로 사용할 ID 추출 헬퍼
export const getRequestId = (request: RequestBase): string => {
  return (
    (request._id as string | undefined) ||
    (request.requestId as string | undefined) ||
    ""
  );
};

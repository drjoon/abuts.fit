export interface RequestUserSummary {
  _id?: string;
  id?: string;
  name?: string;
  email?: string;
  business?: string;
  phone?: string;
  phoneNumber?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
}

export interface DeliveryInfoSummary {
  trackingNumber?: string;
  carrier?: string;
  shippedAt?: string;
  pickedUpAt?: string;
  deliveredAt?: string;
  tracking?: {
    lastStatusCode?: string;
    lastStatusText?: string;
    lastEventAt?: string;
    lastSyncedAt?: string;
  };

  events?: {
    statusCode?: string;
    statusText?: string;
    occurredAt?: string;
    location?: string;
    description?: string;
  }[];
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
}

export interface RequestCaseInfos {
  clinicName?: string;
  patientName?: string;
  tooth?: string;
  implantManufacturer?: string;
  implantBrand?: string;
  implantFamily?: string;
  implantType?: string;
  maxDiameter?: number;
  connectionDiameter?: number;
  workType?: string;
  anodizingEnabled?: boolean;
  requestorHexRotation?: "보정" | "무보정";
  finalHexRotation?: "보정" | "무보정";
  finishLine?: {
    version?: number;
    sectionCount?: number;
    maxStepDistance?: number;
    points?: number[][];
    pt0?: number[];
    // finishline Z 메타데이터 SSOT
    // - top_z 별칭 없이 max_z/min_z만 사용
    max_z?: number;
    min_z?: number;
    max_z_point?: number[];
    min_z_point?: number[];
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
    packing?: {
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
  rollbackCounts?: {
    request?: number;
    cam?: number;
    machining?: number;
    packing?: number;
    shipping?: number;
    tracking?: number;
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
    packing?: {
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
  cadCompanionFiles?: {
    originalName?: string;
    fileType?: string;
    fileSize?: number;
    filePath?: string;
    s3Key?: string;
    s3Url?: string;
    uploadedAt?: string;
  }[];
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
  manufacturerStage?:
    | "의뢰"
    | "CAM"
    | "가공"
    | "세척.패킹"
    | "포장.발송"
    | "추적관리"
    | "취소"
    | string;
  lotNumber?: {
    material?: string;
    value?: string;
  };
  assignedMachine?: string; // 가공 직전 배정된 장비 (M3, M4 등)
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
    assignedMachine?: string;
    queuePosition?: number;
    diameter?: number;
    diameterGroup?: string;
    actualCamStart?: string | Date;
    actualCamComplete?: string | Date;
    actualMachiningComplete?: string | Date;
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

  timeline?: {
    originalEstimatedShipYmd?: string;
    nextEstimatedShipYmd?: string;
    estimatedShipYmd?: string; // YYYY-MM-DD 형식 (KST 기준, 발송 예정일)
    forceTodayShipment?: boolean;
    actualCompletion?: string | Date;
  };

  deliveryInfoRef?: DeliveryInfoSummary | string;

  // 결제/가격 정보 (백엔드 price, paymentStatus 매핑)
  price?: {
    amount?: number;
    currency?: string;
    quotedAt?: string;
  };
  paymentStatus?: "결제전" | "결제완료" | "결제취소" | string;

  shippingWorkflow?: {
    code?:
      | "none"
      | "printed"
      | "accepted"
      | "picked_up"
      | "completed"
      | "canceled"
      | "error"
      | string;
    label?: string;
    printedAt?: string | null;
    acceptedAt?: string | null;
    pickedUpAt?: string | null;
    completedAt?: string | null;
    erroredAt?: string | null;
    canceledAt?: string | null;
    trackingStatusCode?: string | null;
    trackingStatusText?: string | null;
    updatedAt?: string | null;
    source?: string | null;
  };

  shippingPackageId?: string;
  source?: "normal" | "manufacturer_sample" | string;
  rnd?: {
    doneAt?: string | null;
    unmachinableAt?: string | null;
    unmachinableFromStage?: string | null;
    unmachinableReason?: string | null;
    memo?: string | null;
    // canonical: "보정" | "무보정" | "구성정보"
    // legacy "0"|"30"은 하위호환 입력/표시용으로만 사용
    manufacturerHexRotation?: "보정" | "무보정" | "구성정보" | null;
    manufacturerHexRotationUpdatedAt?: string | null;
    manufacturerHexRotationUpdatedBy?: string | null;
    memoUpdatedAt?: string | null;
    memoUpdatedBy?:
      | string
      | {
          _id?: string;
          name?: string;
        }
      | null;
    memoUpdatedByName?: string | null;
  };
  shippingCreditMeta?: {
    insufficient?: boolean;
    required?: number | null;
    paidBalance?: number | null;
    freeShippingCreditBalance?: number | null;
    reason?: string | null;
  } | null;
}

// RequestBase에서 공통적으로 사용할 ID 추출 헬퍼
export const getRequestId = (request: RequestBase): string => {
  return (
    (request._id as string | undefined) ||
    (request.requestId as string | undefined) ||
    ""
  );
};

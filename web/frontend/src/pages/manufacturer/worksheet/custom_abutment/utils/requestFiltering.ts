import {
  type ManufacturerRequest,
  deriveStageForFilter,
  stageOrder,
} from "./request";

// Check if request is pre-pickup shipping visible
export function isPrePickupShippingVisible(req: ManufacturerRequest): boolean {
  const stage = String(req.manufacturerStage || "").trim();
  const di =
    req.deliveryInfoRef && typeof req.deliveryInfoRef === "object"
      ? (req.deliveryInfoRef as any)
      : null;
  const statusCode = Number(di?.tracking?.lastStatusCode || 0);
  const isCanceled =
    String(di?.tracking?.lastStatusText || "").trim() === "예약취소";
  const hasPickupReservation = Boolean(
    di?.trackingNumber || di?.shippedAt || di?.tracking?.lastStatusText,
  );
  return (
    stage === "추적관리" &&
    hasPickupReservation &&
    !di?.deliveredAt &&
    !isCanceled &&
    (!Number.isFinite(statusCode) || statusCode < 11)
  );
}

// Filter requests by stage and completion status
export function filterRequestsByStage(
  requests: ManufacturerRequest[],
  tabStage: string,
  showCompleted: boolean,
  currentStageOrder: number,
  filterRequests?: (req: ManufacturerRequest) => boolean,
): ManufacturerRequest[] {
  if (showCompleted) {
    if (tabStage === "shipping") {
      return requests.filter((req) => {
        if (isPrePickupShippingVisible(req)) return true;
        if (!filterRequests) return true;
        try {
          return filterRequests(req);
        } catch {
          return false;
        }
      });
    }
    return requests.filter((req) => {
      const stage = deriveStageForFilter(req);
      const order = stageOrder[stage] ?? 0;
      return order >= currentStageOrder;
    });
  }

  if (tabStage === "shipping") {
    return requests.filter((req) => {
      if (isPrePickupShippingVisible(req)) return true;
      try {
        return filterRequests ? filterRequests(req) : true;
      } catch {
        return false;
      }
    });
  }

  const base = filterRequests
    ? requests.filter((req) => {
        try {
          return filterRequests(req);
        } catch {
          return false;
        }
      })
    : requests;

  if (filterRequests) return base;

  return base.filter((req) => {
    const stage = deriveStageForFilter(req);
    const order = stageOrder[stage] ?? 0;
    return order <= currentStageOrder;
  });
}

// Filter and sort requests by search query and priority
export function filterAndSortRequests(
  requests: ManufacturerRequest[],
  searchLower: string,
): ManufacturerRequest[] {
  return requests
    .filter((request) => {
      const caseInfos = request.caseInfos || {};
      const text = (
        (request.referenceIds?.join(",") || "") +
        (request.requestor?.business || "") +
        (request.requestor?.name || "") +
        (caseInfos.clinicName || "") +
        (caseInfos.patientName || "") +
        (request.description || "") +
        (caseInfos.tooth || "") +
        (caseInfos.connectionDiameter || "") +
        (caseInfos.implantManufacturer || "") +
        (caseInfos.implantBrand || "") +
        (caseInfos.implantFamily || "") +
        (caseInfos.implantType || "")
      ).toLowerCase();
      return text.includes(searchLower);
    })
    .sort((a, b) => {
      const aScore = a.shippingPriority?.score ?? 0;
      const bScore = b.shippingPriority?.score ?? 0;
      if (aScore !== bScore) return bScore - aScore;
      return new Date(a.createdAt) < new Date(b.createdAt) ? 1 : -1;
    });
}

// Merge transient realtime progress
export function mergeTransientRealtimeProgress(
  prevRequests: ManufacturerRequest[],
  nextRequests: ManufacturerRequest[],
): ManufacturerRequest[] {
  const prevByKey = new Map<string, ManufacturerRequest>();

  for (const req of prevRequests) {
    const requestId = String(req?.requestId || "").trim();
    const mongoId = String(req?._id || "").trim();
    if (requestId) prevByKey.set(`requestId:${requestId}`, req);
    if (mongoId) prevByKey.set(`mongoId:${mongoId}`, req);
  }

  return nextRequests.map((req) => {
    const requestId = String(req?.requestId || "").trim();
    const mongoId = String(req?._id || "").trim();
    const prev =
      (requestId ? prevByKey.get(`requestId:${requestId}`) : null) ||
      (mongoId ? prevByKey.get(`mongoId:${mongoId}`) : null) ||
      null;

    let restoredProgress = req.realtimeProgress;

    // Restore progress from DB if missing
    if (!restoredProgress && !prev?.realtimeProgress) {
      const stage = String(req.manufacturerStage || "").trim();
      const actualCamStart = req.productionSchedule?.actualCamStart;
      const actualCamComplete = req.productionSchedule?.actualCamComplete;
      const hasNcFile = !!(req.caseInfos as any)?.ncFile?.fileName;

      if (actualCamStart) {
        console.log(
          `[RESTORE_CAM] requestId: ${requestId}, stage: ${stage}, actualCamStart: ${actualCamStart}, actualCamComplete: ${actualCamComplete}, hasNcFile: ${hasNcFile}`,
        );
      }

      const isCamProcessing =
        !!actualCamStart &&
        (!actualCamComplete ||
          new Date(actualCamStart).getTime() >
            new Date(actualCamComplete).getTime());

      if (stage === "의뢰" && isCamProcessing && !hasNcFile) {
        const startedAt = actualCamStart as string;
        restoredProgress = {
          badge: "CAM 생성중",
          tone: "indigo",
          startedAt,
          elapsedSeconds: Math.max(
            0,
            Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000),
          ),
        };
        console.log(
          `[RESTORE_CAM] Restored progress for ${requestId}:`,
          restoredProgress,
        );
      }
    }

    if (!prev?.realtimeProgress && !restoredProgress) {
      return req;
    }

    return {
      ...req,
      realtimeProgress: prev?.realtimeProgress || restoredProgress,
    };
  });
}

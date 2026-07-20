import {
  type ManufacturerRequest,
  deriveStageForFilter,
  stageOrder,
} from "./request";

function getKstTodayYmd(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function resolveTrackingStatusCode(req: ManufacturerRequest): number | null {
  const deliveryInfo =
    req.deliveryInfoRef && typeof req.deliveryInfoRef === "object"
      ? (req.deliveryInfoRef as any)
      : null;
  const candidates = [
    deliveryInfo?.tracking?.lastStatusCode,
    req.deliveryMeta?.pickupStatusCode,
    req.pickupStatusCode,
  ];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

export function hasPickupCompleted(req: ManufacturerRequest): boolean {
  const deliveryInfo =
    req.deliveryInfoRef && typeof req.deliveryInfoRef === "object"
      ? (req.deliveryInfoRef as any)
      : null;
  const statusCode = resolveTrackingStatusCode(req);
  return Boolean(
    deliveryInfo?.pickedUpAt ||
    req.deliveryMeta?.pickedUp ||
    req.deliveryMeta?.wasPickedUp ||
    req.wasPickedUp ||
    (statusCode != null && statusCode >= 11),
  );
}

export function isSameDayPrePickupWorksheetRequest(
  req: ManufacturerRequest,
): boolean {
  const estimatedShipYmd = String(req.timeline?.estimatedShipYmd || "").trim();
  if (!estimatedShipYmd) return false;
  return estimatedShipYmd === getKstTodayYmd() && !hasPickupCompleted(req);
}

// Check if request is pre-pickup shipping visible
export function isPrePickupShippingVisible(req: ManufacturerRequest): boolean {
  const stage = String(req.manufacturerStage || "").trim();
  const di =
    req.deliveryInfoRef && typeof req.deliveryInfoRef === "object"
      ? (req.deliveryInfoRef as any)
      : null;
  const statusCode = resolveTrackingStatusCode(req);
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
    (statusCode == null || statusCode < 11)
  );
}

export function shouldShowRequestInIncludeCompleted(
  req: ManufacturerRequest,
  currentStageOrder: number,
): boolean {
  const stage = deriveStageForFilter(req);
  const order = stageOrder[stage] ?? 0;
  // 현재 단계 이전은 제외
  if (order < currentStageOrder) return false;
  // 추적관리(포장.발송 이후)는 완료포함에서도 제외
  if (order > stageOrder["포장.발송"]) return false;
  return true;
}

// Filter requests by stage and completion status
export function filterRequestsByStage(
  requests: ManufacturerRequest[],
  tabStage: string,
  showCompleted: boolean,
  currentStageOrder: number,
  filterRequests?: (req: ManufacturerRequest) => boolean,
): ManufacturerRequest[] {
  const isDoneRndSample = (req: ManufacturerRequest) =>
    String(req.source || "").trim() === "manufacturer_sample" &&
    Boolean(req.rnd?.doneAt);
  const isUnmachinable = (req: ManufacturerRequest) =>
    Boolean(req.rnd?.unmachinableAt);

  const passExternalFilter = (req: ManufacturerRequest) => {
    if (!filterRequests) return true;
    try {
      return filterRequests(req);
    } catch {
      return false;
    }
  };

  if (tabStage === "rnd") {
    return requests.filter((req) => {
      if (!passExternalFilter(req)) return false;
      if (isUnmachinable(req)) return false;
      return isDoneRndSample(req);
    });
  }

  if (tabStage === "unmachinable") {
    return requests.filter((req) => {
      if (!passExternalFilter(req)) return false;
      return isUnmachinable(req);
    });
  }

  if (showCompleted) {
    if (tabStage === "tracking") {
      return requests.filter((req) => {
        if (!passExternalFilter(req)) return false;
        return deriveStageForFilter(req) === "추적관리";
      });
    }

    return requests.filter((req) => {
      if (!passExternalFilter(req)) return false;
      if (isDoneRndSample(req)) return false;
      if (isUnmachinable(req)) return false;
      if (tabStage === "shipping" && isPrePickupShippingVisible(req))
        return true;
      return shouldShowRequestInIncludeCompleted(req, currentStageOrder);
    });
  }

  return requests.filter((req) => {
    if (!passExternalFilter(req)) return false;
    if (isDoneRndSample(req)) return false;
    if (isUnmachinable(req)) return false;

    const stage = deriveStageForFilter(req);
    if (tabStage === "request") return stage === "의뢰";
    if (tabStage === "cam") return stage === "CAM";
    if (tabStage === "machining") return stage === "가공";
    if (tabStage === "packing") return stage === "세척.패킹";
    if (tabStage === "shipping") {
      return stage === "포장.발송" || isPrePickupShippingVisible(req);
    }
    if (tabStage === "tracking") return stage === "추적관리";

    // fallback
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
      }
    }

    const prevProgress = prev?.realtimeProgress || null;
    if (!prevProgress && !restoredProgress) {
      return req;
    }

    // 서버가 startedAt/elapsedSeconds를 제공하면, 이전 임시값(null startedAt 등)보다 우선한다.
    const preferRestoredOverPrev = Boolean(
      restoredProgress &&
        !prevProgress?.startedAt &&
        (restoredProgress.startedAt ||
          Number.isFinite(Number(restoredProgress.elapsedSeconds))),
    );

    return {
      ...req,
      realtimeProgress: preferRestoredOverPrev
        ? { ...(prevProgress || {}), ...(restoredProgress || {}) }
        : prevProgress || restoredProgress,
    };
  });
}

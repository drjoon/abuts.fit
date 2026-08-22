// change-log:
// - 2026-08-22: 작업용 샘플은 포장.발송·추적관리 탭에 정식 의뢰와 동일 노출(R&D 보관만 제외) 주석 명시.
// - 2026-08-21: 준비 탭 정렬 — remainingMs(Date.now) 비교 제거. 동일 출고일에서 실시간 리렌더마다 카드 순서가 뒤바뀌던 race 수정.
// - 2026-08-18: 준비 탭 의뢰카드 정렬 — 출고일(마감) 긴박한 순(위) → 여유 있는 순(아래).
// - 2026-08-03: 준비 탭 필터 SSOT를 `준비`로 통일해 상단 카운트와 카드 목록 불일치(카운트>0, 카드 0건) 문제를 수정.
// - 2026-08-03: 실시간 CAM 생성중 복원 조건의 request 단계 판정을 `준비` 단일값으로 정리.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/utils/request.ts
// - web/backend/controllers/requests/common.review.controller.js
import {
  type ManufacturerRequest,
  deriveStageForFilter,
  stageOrder,
  isRndSampleRequest,
} from "./request";

function resolveShipYmdForSort(req: ManufacturerRequest): string {
  const fromPriority = String(req.shippingPriority?.shipYmd || "").trim();
  if (fromPriority) return fromPriority;
  return String(req.timeline?.estimatedShipYmd || "").trim();
}

function resolveStableRequestKey(req: ManufacturerRequest): string {
  return (
    String(req.requestId || "").trim() ||
    String((req as { _id?: string })._id || "").trim() ||
    ""
  );
}

function compareRequestsByShipUrgency(
  a: ManufacturerRequest,
  b: ManufacturerRequest,
): number {
  const aShipYmd = resolveShipYmdForSort(a);
  const bShipYmd = resolveShipYmdForSort(b);
  const sameShipYmd = Boolean(aShipYmd && bShipYmd && aShipYmd === bShipYmd);

  // 동일 출고일: minutesLeft 기반 score/remainingMs는 분·ms 단위로 달라져 순서가 흔들린다.
  // 출고일이 다를 때만 score로 긴박도를 비교하고, 동일이면 express → createdAt → id 로 고정.
  if (!sameShipYmd) {
    const aScore = Number(a.shippingPriority?.score);
    const bScore = Number(b.shippingPriority?.score);
    const aHasScore = Number.isFinite(aScore);
    const bHasScore = Number.isFinite(bScore);

    if (aHasScore && bHasScore && aScore !== bScore) {
      return bScore - aScore;
    }
    if (aHasScore !== bHasScore) {
      return aHasScore ? -1 : 1;
    }

    if (aShipYmd !== bShipYmd) {
      if (!aShipYmd) return 1;
      if (!bShipYmd) return -1;
      return aShipYmd < bShipYmd ? -1 : 1;
    }
  } else {
    const aExpress = a.shippingPriority?.mode === "express" ? 1 : 0;
    const bExpress = b.shippingPriority?.mode === "express" ? 1 : 0;
    if (aExpress !== bExpress) return bExpress - aExpress;
  }

  const aTime = new Date(a.createdAt || 0).getTime();
  const bTime = new Date(b.createdAt || 0).getTime();
  if (aTime !== bTime) return aTime - bTime;

  const aKey = resolveStableRequestKey(a);
  const bKey = resolveStableRequestKey(b);
  if (aKey !== bKey) return aKey < bKey ? -1 : 1;
  return 0;
}

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
  const normalizedTabStage =
    String(tabStage || "").trim() === "cam" ? "machining" : tabStage;
  const isDoneRndSample = (req: ManufacturerRequest) =>
    isRndSampleRequest(req);
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

  if (normalizedTabStage === "rnd") {
    return requests.filter((req) => {
      if (!passExternalFilter(req)) return false;
      if (isUnmachinable(req)) return false;
      return isDoneRndSample(req);
    });
  }

  if (normalizedTabStage === "unmachinable") {
    return requests.filter((req) => {
      if (!passExternalFilter(req)) return false;
      return isUnmachinable(req);
    });
  }

  if (showCompleted) {
    if (normalizedTabStage === "tracking") {
      return requests.filter((req) => {
        if (!passExternalFilter(req)) return false;
        return deriveStageForFilter(req) === "추적관리";
      });
    }

    return requests.filter((req) => {
      if (!passExternalFilter(req)) return false;
      // R&D 보관 샘플(doneAt!=null)만 일반 공정 탭에서 제외.
      // 작업용 샘플(헥스 확인용 등, doneAt=null)은 정식 의뢰와 같이 포장.발송·추적관리까지 노출.
      if (isDoneRndSample(req)) return false;
      if (isUnmachinable(req)) return false;
      if (normalizedTabStage === "shipping" && isPrePickupShippingVisible(req))
        return true;
      return shouldShowRequestInIncludeCompleted(req, currentStageOrder);
    });
  }

  return requests.filter((req) => {
    if (!passExternalFilter(req)) return false;
    // 작업용 샘플(doneAt=null)은 의뢰~추적관리 전 탭에 포함. R&D 보관만 제외.
    if (isDoneRndSample(req)) return false;
    if (isUnmachinable(req)) return false;

    const stage = deriveStageForFilter(req);
    if (normalizedTabStage === "request") {
      return stage === "준비";
    }
    if (normalizedTabStage === "machining") return stage === "가공";
    if (normalizedTabStage === "packing") return stage === "세척.패킹";
    if (normalizedTabStage === "shipping") {
      return stage === "포장.발송" || isPrePickupShippingVisible(req);
    }
    if (normalizedTabStage === "tracking") return stage === "추적관리";

    // fallback
    const order = stageOrder[stage] ?? 0;
    return order <= currentStageOrder;
  });
}

// Filter and sort requests by search query and priority
export function filterAndSortRequests(
  requests: ManufacturerRequest[],
  searchLower: string,
  options?: { tabStage?: string },
): ManufacturerRequest[] {
  const tabStage = String(options?.tabStage || "").trim();
  const sortByShipUrgency = tabStage === "request";

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
      if (sortByShipUrgency) {
        const byShip = compareRequestsByShipUrgency(a, b);
        if (byShip !== 0) return byShip;
      }

      const aTime = new Date(a.createdAt || 0).getTime();
      const bTime = new Date(b.createdAt || 0).getTime();
      return bTime - aTime;
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

      if (stage === "준비" && isCamProcessing && !hasNcFile) {
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

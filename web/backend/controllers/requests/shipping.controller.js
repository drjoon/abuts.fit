import Request from "../../models/request.model.js";
import ShippingPackage from "../../models/shippingPackage.model.js";
import DeliveryInfo from "../../models/deliveryInfo.model.js";
import hanjinService from "../../services/hanjin.service.js";
import { handleHanjinTrackingWebhook } from "../webhooks/hanjinWebhook.controller.js";
import { Types } from "mongoose";
import {
  buildRequestorOrgScopeFilter,
  calculateExpressShipYmd,
  normalizeKoreanBusinessDay,
  addKoreanBusinessDays,
  getTodayYmdInKst,
  toKstYmd,
  DEFAULT_DELIVERY_ETA_LEAD_DAYS,
  getDeliveryEtaLeadDays,
  applyStatusMapping,
  bumpRollbackCount,
  normalizeRequestStage,
  normalizeRequestStageLabel,
  REQUEST_STAGE_GROUPS,
  getRequestorOrgId,
  ensureReviewByStageDefaults,
} from "./utils.js";

const __cache = new Map();
const memo = async ({ key, ttlMs, fn }) => {
  const now = Date.now();
  const hit = __cache.get(key);
  if (hit && typeof hit.expiresAt === "number" && hit.expiresAt > now) {
    return hit.value;
  }
  const value = await fn();
  __cache.set(key, { value, expiresAt: now + ttlMs });
  return value;
};

const resolveMailboxList = (mailboxAddresses) =>
  Array.isArray(mailboxAddresses)
    ? mailboxAddresses.map((v) => String(v || "").trim()).filter(Boolean)
    : [];

async function resolveHanjinPayload({ mailboxAddresses, payload }) {
  if (payload && typeof payload === "object") {
    return { payload, usedDbRequests: false };
  }

  const list = resolveMailboxList(mailboxAddresses);
  if (!list.length) {
    const error = new Error("mailboxAddresses가 필요합니다.");
    error.statusCode = 400;
    throw error;
  }

  const requests = await Request.find({
    mailboxAddress: { $in: list },
    manufacturerStage: "포장.발송",
  })
    .populate("requestor", "name organization phoneNumber address")
    .populate("requestorOrganizationId", "name extracted")
    .lean();

  if (!requests.length) {
    const error = new Error("조건에 맞는 의뢰를 찾을 수 없습니다.");
    error.statusCode = 404;
    throw error;
  }

  return {
    payload: buildHanjinDraftPayload(requests, list),
    usedDbRequests: true,
  };
}

const resolveExpressShipLeadDays = () => 1;

const resolveHanjinPath = (envKey, fallbackPath) => {
  const raw = String(process.env[envKey] || "").trim();
  if (raw) return raw;
  return fallbackPath || "";
};

const buildHanjinDraftPayload = (requests, mailboxAddresses) => {
  const normalized = requests.map((r) => {
    const requestor = r.requestor || {};
    const requestorOrg = r.requestorOrganizationId || {};
    const extracted = requestorOrg.extracted || {};
    const addr = requestor.address || {};
    return {
      requestId: r.requestId,
      mongoId: String(r._id || ""),
      mailboxAddress: r.mailboxAddress || "",
      clinicName: r.caseInfos?.clinicName || "",
      patientName: r.caseInfos?.patientName || "",
      tooth: r.caseInfos?.tooth || "",
      receiverName:
        requestor.name || extracted.representativeName || extracted.companyName,
      receiverPhone:
        requestor.phoneNumber || extracted.phoneNumber || requestor.phone || "",
      receiverAddress:
        addr.street || extracted.address || requestor.addressText || "",
      receiverZipCode: addr.zipCode || "",
      shippingMode: r.shippingMode || "normal",
    };
  });

  return {
    mailboxes: mailboxAddresses,
    shipments: normalized,
  };
};

/**
 * 한진 운송장 출력 (메일박스 기준)
 * @route POST /api/requests/shipping/hanjin/print-labels
 */
export async function printHanjinLabels(req, res) {
  try {
    const { mailboxAddresses, payload } = req.body || {};

    const path = resolveHanjinPath("HANJIN_PRINT_WBL_PATH");
    if (!path) {
      return res.status(400).json({
        success: false,
        message: "HANJIN_PRINT_WBL_PATH가 설정되지 않았습니다.",
      });
    }

    let resolved;
    try {
      resolved = await resolveHanjinPayload({ mailboxAddresses, payload });
    } catch (err) {
      if (err.statusCode) {
        return res.status(err.statusCode).json({
          success: false,
          message: err.message,
        });
      }
      throw err;
    }

    const data = await hanjinService.requestPrintApi({
      path,
      method: "POST",
      data: resolved.payload,
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error in printHanjinLabels:", error);
    return res.status(500).json({
      success: false,
      message: "한진 운송장 출력 요청 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 우편함 전체 롤백 (포장.발송 → 세척.패킹)
 * @route POST /api/requests/shipping/mailbox-rollback
 */
export async function rollbackMailboxShipping(req, res) {
  try {
    const { mailboxAddress, requestIds } = req.body || {};

    const mailbox = String(mailboxAddress || "").trim();
    if (!mailbox) {
      return res.status(400).json({
        success: false,
        message: "mailboxAddress가 필요합니다.",
      });
    }

    const ids = Array.isArray(requestIds)
      ? requestIds
          .map((v) => String(v || "").trim())
          .filter((v) => Types.ObjectId.isValid(v))
      : [];

    const filter = {
      mailboxAddress: mailbox,
      manufacturerStage: "포장.발송",
    };

    if (ids.length) {
      filter._id = { $in: ids };
    }

    const requests = await Request.find(filter);
    if (!requests.length) {
      return res.status(404).json({
        success: false,
        message: "조건에 맞는 의뢰를 찾을 수 없습니다.",
      });
    }

    const updatedIds = [];
    for (const r of requests) {
      ensureReviewByStageDefaults(r);
      r.caseInfos.reviewByStage.shipping = {
        ...r.caseInfos.reviewByStage.shipping,
        status: "PENDING",
        updatedAt: new Date(),
        updatedBy: req.user?._id,
        reason: "",
      };
      bumpRollbackCount(r, "shipping");
      applyStatusMapping(r, "세척.패킹");
      r.mailboxAddress = null;
      await r.save();
      updatedIds.push(r.requestId);
    }

    return res.status(200).json({
      success: true,
      message: `${updatedIds.length}건이 롤백되었습니다.`,
      data: { updatedIds },
    });
  } catch (error) {
    console.error("Error in rollbackMailboxShipping:", error);
    return res.status(500).json({
      success: false,
      message: "우편함 롤백 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 한진 택배 수거 접수 (메일박스 기준)
 * @route POST /api/requests/shipping/hanjin/pickup
 */
export async function requestHanjinPickup(req, res) {
  try {
    const { mailboxAddresses, payload } = req.body || {};

    const path = resolveHanjinPath("HANJIN_PICKUP_REQUEST_PATH");
    if (!path) {
      return res.status(400).json({
        success: false,
        message: "HANJIN_PICKUP_REQUEST_PATH가 설정되지 않았습니다.",
      });
    }

    let resolved;
    try {
      resolved = await resolveHanjinPayload({ mailboxAddresses, payload });
    } catch (err) {
      if (err.statusCode) {
        return res.status(err.statusCode).json({
          success: false,
          message: err.message,
        });
      }
      throw err;
    }

    const data = await hanjinService.requestOrderApi({
      path,
      method: "POST",
      data: resolved.payload,
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error in requestHanjinPickup:", error);
    return res.status(500).json({
      success: false,
      message: "한진 택배 수거 접수 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 한진 택배 수거 접수 취소 (메일박스 기준)
 * @route POST /api/requests/shipping/hanjin/pickup-cancel
 */
export async function cancelHanjinPickup(req, res) {
  try {
    const { mailboxAddresses, payload } = req.body || {};

    const path = resolveHanjinPath("HANJIN_PICKUP_CANCEL_PATH");
    if (!path) {
      return res.status(400).json({
        success: false,
        message: "HANJIN_PICKUP_CANCEL_PATH가 설정되지 않았습니다.",
      });
    }

    let resolved;
    try {
      resolved = await resolveHanjinPayload({ mailboxAddresses, payload });
    } catch (err) {
      if (err.statusCode) {
        return res.status(err.statusCode).json({
          success: false,
          message: err.message,
        });
      }
      throw err;
    }

    const data = await hanjinService.requestOrderApi({
      path,
      method: "POST",
      data: resolved.payload,
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error in cancelHanjinPickup:", error);
    return res.status(500).json({
      success: false,
      message: "한진 택배 수거 취소 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function simulateHanjinWebhook(req, res) {
  try {
    const payload = req.body?.payload;
    if (!payload || typeof payload !== "object") {
      return res.status(400).json({
        success: false,
        message: "payload(JSON)가 필요합니다.",
      });
    }

    const injectedSecret = String(
      process.env.HANJIN_WEBHOOK_SECRET || "",
    ).trim();

    const mockReq = {
      ...req,
      body: payload,
      headers: {
        ...req.headers,
        "x-webhook-secret": req.headers["x-webhook-secret"] || injectedSecret,
      },
    };

    return handleHanjinTrackingWebhook(mockReq, res);
  } catch (error) {
    console.error("Error in simulateHanjinWebhook:", error);
    return res.status(500).json({
      success: false,
      message: "한진 배송정보 수신 시뮬레이션 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 배송 방식 변경 (의뢰자용)
 * @route PATCH /api/requests/my/shipping-mode
 */
export async function updateMyShippingMode(req, res) {
  try {
    const requestFilter = await buildRequestorOrgScopeFilter(req);
    const { requestIds, shippingMode } = req.body || {};

    if (!Array.isArray(requestIds) || requestIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "선택된 의뢰가 없습니다.",
      });
    }

    if (!["normal", "express"].includes(shippingMode)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 배송 방식입니다.",
      });
    }

    // Fire & Forget: 즉시 응답 반환, 백그라운드에서 처리
    setImmediate(async () => {
      try {
        const { recalculateProductionSchedule, calculatePriority } =
          await import("./production.utils.js");

        const requests = await Request.find({
          ...requestFilter,
          requestId: { $in: requestIds },
          status: "의뢰", // 의뢰 단계만 변경 가능
        });

        for (const req of requests) {
          const maxDiameter = req.caseInfos?.maxDiameter;
          const requestedAt = req.createdAt || new Date();

          // 생산 스케줄 재계산
          const newSchedule = recalculateProductionSchedule({
            currentStage: req.status,
            newShippingMode: shippingMode,
            maxDiameter,
            requestedAt,
          });

          if (!newSchedule) continue;

          // finalShipping 업데이트 (원본 originalShipping은 보존)
          req.finalShipping = {
            mode: shippingMode,
            updatedAt: new Date(),
          };

          // 레거시 호환
          req.shippingMode = shippingMode;

          // 생산 스케줄 업데이트
          req.productionSchedule = newSchedule;

          // 발송 예정일(YYYY-MM-DD, KST)
          req.timeline = req.timeline || {};
          const pickup = newSchedule?.scheduledShipPickup;
          const pickupYmd = pickup ? toKstYmd(pickup) : null;
          if (pickupYmd) {
            req.timeline.estimatedShipYmd = pickupYmd;
          } else if (shippingMode === "express") {
            const createdYmd = toKstYmd(req.createdAt) || getTodayYmdInKst();
            req.timeline.estimatedShipYmd = await addKoreanBusinessDays({
              startYmd: createdYmd,
              days: 1,
            });
          } else {
            req.timeline.estimatedShipYmd = await addKoreanBusinessDays({
              startYmd: toKstYmd(req.createdAt) || getTodayYmdInKst(),
              days: 1,
            });
          }

          await req.save();
        }

        console.log(`[Fire&Forget] Updated ${requests.length} shipping modes`);
      } catch (err) {
        console.error("[Fire&Forget] Error in shipping mode update:", err);
      }
    });

    // 즉시 응답 (UI 대기 없음)
    return res.status(200).json({
      success: true,
      message: `배송 방식 변경이 처리 중입니다.`,
      data: {
        requestedCount: requestIds.length,
        shippingMode,
      },
    });
  } catch (error) {
    console.error("Error in updateMyShippingMode:", error);
    return res.status(500).json({
      success: false,
      message: "배송 방식 변경 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 내 발송 패키지 요약 (의뢰자용)
 * @route GET /api/requests/my/shipping-packages
 */
export async function getMyShippingPackagesSummary(req, res) {
  try {
    const daysRaw = req.query.days;
    const days =
      typeof daysRaw === "string" && daysRaw.trim()
        ? Number(daysRaw)
        : typeof daysRaw === "number"
          ? daysRaw
          : 30;

    if (!Number.isFinite(days) || days <= 0) {
      return res.status(400).json({
        success: false,
        message: "유효한 기간(days) 값을 입력해주세요.",
      });
    }

    const orgId = getRequestorOrgId(req);
    if (!orgId) {
      return res.status(400).json({
        success: false,
        message: "조직 정보가 필요합니다.",
      });
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const todayYmd = getTodayYmdInKst();

    const packages = await ShippingPackage.find({
      organizationId: orgId,
      createdAt: { $gte: cutoff },
    })
      .select({
        shipDateYmd: 1,
        requestIds: 1,
        shippingFeeSupply: 1,
        createdAt: 1,
      })
      .populate({
        path: "requestIds",
        select: "requestId title caseInfos manufacturerStage createdAt",
      })
      .sort({ createdAt: -1 })
      .lean();

    const todayPackages = packages.filter((p) => p.shipDateYmd === todayYmd);
    const today = {
      shipDateYmd: todayYmd,
      packageCount: todayPackages.length,
      shippingFeeSupplyTotal: todayPackages.reduce(
        (acc, cur) => acc + Number(cur.shippingFeeSupply || 0),
        0,
      ),
    };

    const lastNDays = {
      days,
      packageCount: packages.length,
      shippingFeeSupplyTotal: packages.reduce(
        (acc, cur) => acc + Number(cur.shippingFeeSupply || 0),
        0,
      ),
    };

    const items = packages.map((p) => {
      const requests = Array.isArray(p.requestIds)
        ? p.requestIds.map((req) => ({
            id: String(req?._id || req),
            requestId: req?.requestId || "",
            title: req?.title || "",
            caseInfos: req?.caseInfos || {},
            manufacturerStage: req?.manufacturerStage || "",
            createdAt: req?.createdAt,
          }))
        : [];

      return {
        id: String(p._id),
        shipDateYmd: p.shipDateYmd,
        requestCount: requests.length,
        shippingFeeSupply: Number(p.shippingFeeSupply || 0),
        createdAt: p.createdAt,
        requests,
      };
    });

    return res.status(200).json({
      success: true,
      data: { today, lastNDays, items },
    });
  } catch (error) {
    console.error("Error in getMyShippingPackagesSummary:", error);
    return res.status(500).json({
      success: false,
      message: "발송 패키지 요약 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 발송 예정일 계산 (공용)
 * @route GET /api/requests/shipping-estimate
 */
export async function getShippingEstimate(req, res) {
  try {
    const mode = req.query.mode;
    const maxDiameterRaw = req.query.maxDiameter;
    const maxDiameter =
      typeof maxDiameterRaw === "string" && maxDiameterRaw.trim()
        ? Number(maxDiameterRaw)
        : typeof maxDiameterRaw === "number"
          ? maxDiameterRaw
          : null;

    if (!mode || !["express", "normal"].includes(mode)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 mode 입니다.",
      });
    }

    const todayYmd = getTodayYmdInKst();
    const { calculateInitialProductionSchedule } =
      await import("./production.utils.js");
    const schedule = await calculateInitialProductionSchedule({
      shippingMode: mode,
      maxDiameter,
      requestedAt: new Date(),
    });
    const pickupYmd = schedule?.scheduledShipPickup
      ? toKstYmd(schedule.scheduledShipPickup)
      : null;
    const estimatedShipYmd = pickupYmd
      ? pickupYmd
      : await addKoreanBusinessDays({
          startYmd: todayYmd,
          days: 1,
        });

    return res.status(200).json({
      success: true,
      data: {
        estimatedShipYmd,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "발송 예정일 계산 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 묶음 배송 후보 조회 (의뢰자용)
 * @route GET /api/requests/my/bulk-shipping
 */
export async function getMyBulkShipping(req, res) {
  try {
    const userId = req.user?._id?.toString();

    const requestFilter = await buildRequestorOrgScopeFilter(req);

    const leadDays = await getDeliveryEtaLeadDays();
    const effectiveLeadDays = {
      ...DEFAULT_DELIVERY_ETA_LEAD_DAYS,
      ...(leadDays || {}),
    };

    const resolveNormalLeadDays = (maxDiameter) => {
      const d =
        typeof maxDiameter === "number" && !Number.isNaN(maxDiameter)
          ? maxDiameter
          : maxDiameter != null && String(maxDiameter).trim()
            ? Number(maxDiameter)
            : null;
      if (d == null || Number.isNaN(d)) return effectiveLeadDays.d10;
      if (d <= 6) return effectiveLeadDays.d6;
      if (d <= 8) return effectiveLeadDays.d8;
      if (d <= 10) return effectiveLeadDays.d10;
      return effectiveLeadDays.d12;
    };

    // 배치 최적화: 같은 diameter는 1회만 계산
    const todayYmd = getTodayYmdInKst();
    const diameterCache = new Map();

    const getExpressShipYmd = async (maxDiameter) => {
      const key = String(maxDiameter ?? "-");
      if (!diameterCache.has(key)) {
        const raw = await memo({
          key: `expressShip:${todayYmd}:${key}`,
          ttlMs: 6 * 60 * 60 * 1000,
          fn: () => calculateExpressShipYmd({ maxDiameter, baseYmd: todayYmd }),
        });
        const normalized = await memo({
          key: `krbiz:normalize:${raw}`,
          ttlMs: 6 * 60 * 60 * 1000,
          fn: () => normalizeKoreanBusinessDay({ ymd: raw }),
        });
        diameterCache.set(key, normalized);
      }
      return diameterCache.get(key);
    };

    const resolveEstimatedShipYmd = async (r) => {
      const ci = r.caseInfos || {};
      const maxDiameter = ci.maxDiameter;
      const mode = r.shippingMode || "normal";

      if (mode === "express") {
        const createdYmd = toKstYmd(r.createdAt) || todayYmd;
        const days = resolveExpressShipLeadDays(maxDiameter);
        return memo({
          key: `krbiz:add:${createdYmd}:${days}`,
          ttlMs: 6 * 60 * 60 * 1000,
          fn: () => addKoreanBusinessDays({ startYmd: createdYmd, days }),
        });
      }

      const pickup = r.productionSchedule?.scheduledShipPickup;
      const pickupYmd = pickup ? toKstYmd(pickup) : null;
      if (pickupYmd) return pickupYmd;

      const requestedShipYmd = toKstYmd(r.requestedShipDate);
      if (requestedShipYmd) {
        return memo({
          key: `krbiz:normalize:${requestedShipYmd}`,
          ttlMs: 6 * 60 * 60 * 1000,
          fn: () => normalizeKoreanBusinessDay({ ymd: requestedShipYmd }),
        });
      }

      const createdYmd = toKstYmd(r.createdAt) || todayYmd;
      const baseYmd = createdYmd < todayYmd ? todayYmd : createdYmd;
      const leadDays = resolveNormalLeadDays(maxDiameter);
      return memo({
        key: `krbiz:add:${baseYmd}:${leadDays}`,
        ttlMs: 6 * 60 * 60 * 1000,
        fn: () => addKoreanBusinessDays({ startYmd: baseYmd, days: leadDays }),
      });
    };

    const requests = await Request.find({
      ...requestFilter,
      manufacturerStage: {
        $in: REQUEST_STAGE_GROUPS.bulkCandidateAll,
      },
    })
      .select(
        "requestId title manufacturerStage caseInfos shippingMode requestedShipDate createdAt timeline.estimatedShipYmd requestor productionSchedule",
      )
      .populate("requestor", "name organization")
      .lean();

    const mapItem = async (r) => {
      const ci = r.caseInfos || {};
      const clinic =
        r.requestor?.organization || r.requestor?.name || req.user?.name || "";
      const maxDiameter =
        typeof ci.maxDiameter === "number"
          ? `${ci.maxDiameter}mm`
          : ci.maxDiameter != null
            ? `${Number(ci.maxDiameter)}mm`
            : "";

      const estimatedShipYmd = await resolveEstimatedShipYmd(r);

      const stageKey = normalizeRequestStage(r);
      const stageLabel = normalizeRequestStageLabel(r);

      return {
        id: r.requestId,
        mongoId: r._id,
        title: r.title,
        clinic,
        patient: ci.patientName || "",
        tooth: ci.tooth || "",
        diameter: maxDiameter,
        stage: r.manufacturerStage,
        stageKey,
        stageLabel,
        shippingMode: r.shippingMode || "normal",
        requestedShipDate: r.requestedShipDate,
        estimatedShipYmd,
      };
    };

    const [pre, post, waiting] = await Promise.all([
      Promise.all(
        requests
          .filter((r) => REQUEST_STAGE_GROUPS.pre.includes(r.manufacturerStage))
          .map(mapItem),
      ),
      Promise.all(
        requests
          .filter((r) =>
            REQUEST_STAGE_GROUPS.post.includes(r.manufacturerStage),
          )
          .map(mapItem),
      ),
      Promise.all(
        requests
          .filter((r) =>
            REQUEST_STAGE_GROUPS.waiting.includes(r.manufacturerStage),
          )
          .map(mapItem),
      ),
    ]);

    const responseData = { pre, post, waiting };

    return res.status(200).json({
      success: true,
      data: responseData,
      cached: false,
    });
  } catch (error) {
    console.error("Error in getMyBulkShipping:", error);
    return res.status(500).json({
      success: false,
      message: "묶음 배송 후보 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 발송 처리 (운송장 번호 등록 및 상태 변경)
 * @route POST /api/requests/shipping/register
 */
export async function registerShipment(req, res) {
  try {
    const { requestIds, trackingNumber, carrier = "hanjin" } = req.body || {};

    if (!Array.isArray(requestIds) || requestIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "선택된 의뢰가 없습니다.",
      });
    }

    if (!trackingNumber) {
      return res.status(400).json({
        success: false,
        message: "운송장 번호가 필요합니다.",
      });
    }

    const requests = await Request.find({
      requestId: { $in: requestIds },
      manufacturerStage: "포장.발송",
    });

    if (!requests.length) {
      return res.status(404).json({
        success: false,
        message: "조건에 맞는 의뢰를 찾을 수 없습니다.",
      });
    }

    const updatedIds = [];

    for (const r of requests) {
      const scheduledPickup = r.productionSchedule?.scheduledShipPickup
        ? new Date(r.productionSchedule.scheduledShipPickup)
        : null;
      const now = new Date();
      const actualShipPickup =
        scheduledPickup && !Number.isNaN(scheduledPickup.getTime())
          ? scheduledPickup
          : now;
      // 1. Create or update DeliveryInfo
      let deliveryInfo = null;
      if (r.deliveryInfoRef) {
        deliveryInfo = await DeliveryInfo.findById(r.deliveryInfoRef);
      }

      if (!deliveryInfo) {
        deliveryInfo = await DeliveryInfo.create({
          request: r._id,
          trackingNumber,
          carrier,
          shippedAt: actualShipPickup,
        });
        r.deliveryInfoRef = deliveryInfo._id;
      } else {
        deliveryInfo.trackingNumber = trackingNumber;
        deliveryInfo.carrier = carrier;
        if (!deliveryInfo.shippedAt) {
          deliveryInfo.shippedAt = actualShipPickup;
        }
        await deliveryInfo.save();
      }

      // 2. Update Review Stage
      ensureReviewByStageDefaults(r);
      r.caseInfos.reviewByStage.shipping = {
        ...r.caseInfos.reviewByStage.shipping,
        status: "APPROVED",
        updatedAt: new Date(),
        updatedBy: req.user?._id,
        reason: "",
      };

      // 3. Move to Tracking Stage
      applyStatusMapping(r, "추적관리");

      // 4. Mark actual pickup + clear mailbox address
      r.productionSchedule = r.productionSchedule || {};
      r.productionSchedule.actualShipPickup = actualShipPickup;
      r.mailboxAddress = null;

      await r.save();
      updatedIds.push(r.requestId);
    }

    return res.status(200).json({
      success: true,
      message: `${updatedIds.length}건의 의뢰가 발송 처리되었습니다.`,
      data: {
        updatedIds,
      },
    });
  } catch (error) {
    console.error("Error in registerShipment:", error);
    return res.status(500).json({
      success: false,
      message: "발송 처리 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}
/**
 * 묶음 배송 생성/신청 (의뢰자용)
 * @route POST /api/requests/my/bulk-shipping
 */
export async function createMyBulkShipping(req, res) {
  try {
    const requestFilter = await buildRequestorOrgScopeFilter(req);
    const { requestIds } = req.body || {};

    if (!Array.isArray(requestIds) || requestIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "선택된 의뢰가 없습니다.",
      });
    }

    const requests = await Request.find({
      ...requestFilter,
      requestId: { $in: requestIds },
      manufacturerStage: { $in: REQUEST_STAGE_GROUPS.bulkCreateEligible },
    });

    if (!requests.length) {
      return res.status(404).json({
        success: false,
        message: "조건에 맞는 의뢰를 찾을 수 없습니다.",
      });
    }

    for (const r of requests) {
      applyStatusMapping(r, "발송");
      await r.save();
    }

    return res.status(200).json({
      success: true,
      message: `${requests.length}건의 의뢰가 발송 상태로 변경되었습니다.`,
      data: {
        updatedIds: requests.map((r) => r.requestId),
      },
    });
  } catch (error) {
    console.error("Error in createMyBulkShipping:", error);
    return res.status(500).json({
      success: false,
      message: "묶음 배송 신청 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

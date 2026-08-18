// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/modules/admin/admin.routes.js
// - web/backend/models/systemSettings.model.js
// - web/backend/utils/creditSettingsDefaults.js
// - web/backend/utils/abutsAbutmentService.js
// - web/frontend/src/features/settings/tabs/AdminCreditSettingsTab.tsx
// - web/frontend/src/pages/devops/components/DevopsPlatformFeeTab.tsx
// - web/frontend/src/pages/admin/system/AdminPlatformSettingsPage.tsx
// - web/backend/services/practiceTransferBilling.service.js
// - 2026-08-14: 크레딧 단가 저장 시 기공의뢰 quote-context 캐시 무효화.
import SystemSettings from "../../models/systemSettings.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import { Types } from "mongoose";
import {
  DEFAULT_DELIVERY_ETA_LEAD_DAYS,
  getDeliveryEtaLeadDays,
} from "./admin.shared.controller.js";
import {
  loadCreditSettingsDefaults,
  normalizeLoadedCreditSettings,
} from "../../utils/creditSettingsDefaults.js";
import { normalizeAbutsAbutmentCreditPrices } from "../../utils/abutsAbutmentService.js";
import { invalidatePracticeTransferQuoteCaches } from "../../services/practiceTransferBilling.service.js";
import {
  isDirectPlatformFeeEnabled,
  resolveDirectPlatformFeeRateConfigured,
  resolvePlatformFeeRate,
} from "../../services/creditRevenuePolicy.service.js";
import { normalizeConfiguredRushFeeMultiplier } from "../../utils/practiceTransferRush.js";

const normalizeCreditSettings = (raw = {}) =>
  normalizeLoadedCreditSettings(raw);

const CNC_TIER_PARTY_PREFIXES = [
  "membershipProduction",
  "regularProduction",
  "membershipDesignAndProduction",
  "regularDesignAndProduction",
];
const PARTY_KINDS = ["Manufacturer", "Salesman", "Devops"];

function sanitizeOptionalAmount(value) {
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) return null;
  return n;
}

function sanitizeSharePercent(value) {
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) return null;
  return Math.min(100, Math.round(n * 100) / 100);
}

function appendTierPartyFields(payload, sanitized) {
  for (const prefix of CNC_TIER_PARTY_PREFIXES) {
    for (const kind of PARTY_KINDS) {
      const key = `${prefix}${kind}UnitPrice`;
      const next = sanitizeOptionalAmount(payload[key]);
      if (next != null) sanitized[key] = next;
    }
  }
}

function appendSpecialPartyFields(item, target) {
  const pairs = [
    ["productionManufacturerUnitPrice", item?.productionManufacturerUnitPrice],
    ["productionSalesmanUnitPrice", item?.productionSalesmanUnitPrice],
    ["productionDevopsUnitPrice", item?.productionDevopsUnitPrice],
    [
      "designAndProductionManufacturerUnitPrice",
      item?.designAndProductionManufacturerUnitPrice,
    ],
    [
      "designAndProductionSalesmanUnitPrice",
      item?.designAndProductionSalesmanUnitPrice,
    ],
    [
      "designAndProductionDevopsUnitPrice",
      item?.designAndProductionDevopsUnitPrice,
    ],
  ];
  for (const [key, raw] of pairs) {
    const next = sanitizeOptionalAmount(raw);
    if (next != null) target[key] = next;
  }
}

export async function getSystemSettings(req, res) {
  try {
    const leadDays = await getDeliveryEtaLeadDays();
    const doc = await SystemSettings.findOne({ key: "global" }).lean();
    const creditSettings = normalizeCreditSettings(doc?.creditSettings || {});

    const settings = {
      fileUpload: {
        maxFileSize: 50 * 1024 * 1024,
        allowedTypes: [
          "image/jpeg",
          "image/png",
          "image/gif",
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-powerpoint",
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "text/plain",
          "model/stl",
          "application/octet-stream",
        ],
      },
      security: {
        rateLimit: {
          windowMs: 15 * 60 * 1000,
          max: 100,
        },
        jwtExpiration: "1d",
        refreshTokenExpiration: "7d",
      },
      deliveryEtaLeadDays: leadDays,
      creditSettings,
    };

    res.status(200).json({ success: true, data: { settings } });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "시스템 설정 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function updateSystemSettings(req, res) {
  try {
    const input = req.body && typeof req.body === "object" ? req.body : {};
    const rawLeadDays =
      input.deliveryEtaLeadDays && typeof input.deliveryEtaLeadDays === "object"
        ? input.deliveryEtaLeadDays
        : null;

    const sanitized = rawLeadDays
      ? {
          d6:
            rawLeadDays.d6 == null
              ? undefined
              : Math.max(0, Number(rawLeadDays.d6)),
          d8:
            rawLeadDays.d8 == null
              ? undefined
              : Math.max(0, Number(rawLeadDays.d8)),
          d10:
            rawLeadDays.d10 == null
              ? undefined
              : Math.max(0, Number(rawLeadDays.d10)),
          d12:
            rawLeadDays.d12 == null
              ? undefined
              : Math.max(0, Number(rawLeadDays.d12)),
        }
      : null;

    const nextLeadDays = { ...(sanitized || {}) };
    Object.keys(nextLeadDays).forEach((k) => {
      if (Number.isNaN(nextLeadDays[k]) || nextLeadDays[k] == null) {
        delete nextLeadDays[k];
      }
    });

    const currentLeadDays = await getDeliveryEtaLeadDays();
    const mergedLeadDays = {
      ...currentLeadDays,
      ...nextLeadDays,
    };

    const updatedDoc = await SystemSettings.findOneAndUpdate(
      { key: "global" },
      {
        $setOnInsert: { key: "global" },
        ...(rawLeadDays
          ? { $set: { deliveryEtaLeadDays: mergedLeadDays } }
          : {}),
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();

    const updatedSettings = {
      deliveryEtaLeadDays: {
        ...DEFAULT_DELIVERY_ETA_LEAD_DAYS,
        ...(updatedDoc?.deliveryEtaLeadDays || {}),
      },
    };

    res.status(200).json({
      success: true,
      message: "시스템 설정이 성공적으로 업데이트되었습니다.",
      data: updatedSettings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "시스템 설정 업데이트 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function getSecuritySettings(req, res) {
  try {
    const doc = await SystemSettings.findOneAndUpdate(
      { key: "global" },
      { $setOnInsert: { key: "global" } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();

    res.status(200).json({
      success: true,
      data: {
        securitySettings: doc?.securitySettings || {},
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "보안 설정 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function updateSecuritySettings(req, res) {
  try {
    const payload = req.body && typeof req.body === "object" ? req.body : {};
    const allowedKeys = [
      "twoFactorAuth",
      "loginNotifications",
      "dataEncryption",
      "fileUploadScan",
      "autoLogout",
      "maxLoginAttempts",
      "passwordExpiry",
      "ipWhitelist",
      "apiRateLimit",
      "backupFrequency",
    ];

    const sanitized = {};
    allowedKeys.forEach((k) => {
      if (payload[k] === undefined) return;
      if (
        [
          "autoLogout",
          "maxLoginAttempts",
          "passwordExpiry",
          "apiRateLimit",
        ].includes(k)
      ) {
        const num = Number(payload[k]);
        if (!Number.isNaN(num)) sanitized[k] = num;
      } else if (
        typeof payload[k] === "boolean" ||
        typeof payload[k] === "string"
      ) {
        sanitized[k] = payload[k];
      }
    });

    const doc = await SystemSettings.findOneAndUpdate(
      { key: "global" },
      {
        $setOnInsert: { key: "global" },
        ...(Object.keys(sanitized).length > 0
          ? { $set: { securitySettings: sanitized } }
          : {}),
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();

    res.status(200).json({
      success: true,
      message: "보안 설정이 업데이트되었습니다.",
      data: {
        securitySettings: doc?.securitySettings || {},
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "보안 설정 업데이트 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function getCreditSettings(req, res) {
  try {
    const doc = await SystemSettings.findOneAndUpdate(
      { key: "global" },
      { $setOnInsert: { key: "global" } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();

    const creditSettings = normalizeCreditSettings(doc?.creditSettings || {});
    res.status(200).json({
      success: true,
      data: {
        creditSettings,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "크레딧 설정 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function getPublicCreditSettings(req, res) {
  try {
    const doc = await SystemSettings.findOne({ key: "global" }).lean();

    const creditSettings = normalizeCreditSettings(doc?.creditSettings || {});
    delete creditSettings.specialRequestorPrices;
    res.status(200).json({
      success: true,
      data: {
        creditSettings,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "크레딧 설정 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function updateCreditSettings(req, res) {
  try {
    const payload = req.body && typeof req.body === "object" ? req.body : {};

    const minCreditForRequest = Number(payload.minCreditForRequest);
    const shippingFee = Number(payload.shippingFee);
    const manufacturerRequestUnitPrice = Number(
      payload.manufacturerRequestUnitPrice,
    );
    const devopsRequestUnitPrice = Number(payload.devopsRequestUnitPrice);
    const salesmanRequestUnitPrice = Number(payload.salesmanRequestUnitPrice);
    const manufacturerShippingUnitPrice = Number(
      payload.manufacturerShippingUnitPrice,
    );
    const affiliateVatRate = Number(payload.affiliateVatRate);
    const expressFee = Number(payload.expressFee);
    const practiceRushFeeMultiplier = Number(payload.practiceRushFeeMultiplier);
    const designFee = Number(payload.designFee);
    const abutmentDesignLabFee = Number(payload.abutmentDesignLabFee);
    const membershipProductionPrice = Number(payload.membershipProductionPrice);
    const regularProductionPrice = Number(payload.regularProductionPrice);
    const membershipDesignAndProductionPrice = Number(
      payload.membershipDesignAndProductionPrice,
    );
    const regularDesignAndProductionPrice = Number(
      payload.regularDesignAndProductionPrice,
    );
    const membershipRoundBarProductionPrice = Number(
      payload.membershipRoundBarProductionPrice,
    );
    const regularRoundBarProductionPrice = Number(
      payload.regularRoundBarProductionPrice,
    );
    const membershipRoundBarDesignAndProductionPrice = Number(
      payload.membershipRoundBarDesignAndProductionPrice,
    );
    const regularRoundBarDesignAndProductionPrice = Number(
      payload.regularRoundBarDesignAndProductionPrice,
    );
    const abutmentRetailPrice = Number(payload.abutmentRetailPrice);
    const practiceMembershipMonthlyFee = Number(
      payload.practiceMembershipMonthlyFee,
    );
    const defaultRequestFreeCredit = Number(payload.defaultRequestFreeCredit);
    const manufacturerSharePercent = sanitizeSharePercent(
      payload.manufacturerSharePercent,
    );
    const salesmanSharePercent = sanitizeSharePercent(payload.salesmanSharePercent);
    const devopsSharePercent = sanitizeSharePercent(payload.devopsSharePercent);
    const specialRequestorPrices = Array.isArray(payload.specialRequestorPrices)
      ? payload.specialRequestorPrices
          .map((item) => {
            const requestorAnchorId = String(
              item?.requestorAnchorId || "",
            ).trim();
            const productionPrice = Number(
              item?.productionPrice ?? item?.amount,
            );
            const designAndProductionPrice = Number(
              item?.designAndProductionPrice,
            );
            const roundBarProductionPrice = Number(
              item?.roundBarProductionPrice,
            );
            const roundBarDesignAndProductionPrice = Number(
              item?.roundBarDesignAndProductionPrice,
            );
            const specialManufacturerRequestUnitPrice = Number(
              item?.manufacturerRequestUnitPrice,
            );
            const specialDevopsRequestUnitPrice = Number(
              item?.devopsRequestUnitPrice,
            );
            const specialSalesmanRequestUnitPrice = Number(
              item?.salesmanRequestUnitPrice,
            );
            if (
              !Types.ObjectId.isValid(requestorAnchorId) ||
              !Number.isFinite(productionPrice) ||
              productionPrice < 0
            ) {
              return null;
            }
            const row = {
              requestorAnchorId: new Types.ObjectId(requestorAnchorId),
              amount: productionPrice,
              productionPrice,
              designAndProductionPrice: Number.isFinite(
                designAndProductionPrice,
              )
                ? Math.max(0, designAndProductionPrice)
                : productionPrice,
              roundBarProductionPrice: Number.isFinite(roundBarProductionPrice)
                ? Math.max(0, roundBarProductionPrice)
                : 0,
              roundBarDesignAndProductionPrice: Number.isFinite(
                roundBarDesignAndProductionPrice,
              )
                ? Math.max(0, roundBarDesignAndProductionPrice)
                : 0,
              ...(Number.isFinite(specialManufacturerRequestUnitPrice) &&
              specialManufacturerRequestUnitPrice >= 0
                ? {
                    manufacturerRequestUnitPrice: Math.max(
                      0,
                      specialManufacturerRequestUnitPrice,
                    ),
                  }
                : {}),
              ...(Number.isFinite(specialDevopsRequestUnitPrice) &&
              specialDevopsRequestUnitPrice >= 0
                ? {
                    devopsRequestUnitPrice: Math.max(
                      0,
                      specialDevopsRequestUnitPrice,
                    ),
                  }
                : {}),
              ...(Number.isFinite(specialSalesmanRequestUnitPrice) &&
              specialSalesmanRequestUnitPrice >= 0
                ? {
                    salesmanRequestUnitPrice: Math.max(
                      0,
                      specialSalesmanRequestUnitPrice,
                    ),
                  }
                : {}),
            };
            appendSpecialPartyFields(item, row);
            return row;
          })
          .filter(Boolean)
      : null;

    const sanitized = {};
    if (!Number.isNaN(minCreditForRequest) && minCreditForRequest >= 0) {
      sanitized.minCreditForRequest = minCreditForRequest;
    }
    if (!Number.isNaN(shippingFee) && shippingFee >= 0) {
      sanitized.shippingFee = shippingFee;
    }
    if (
      !Number.isNaN(manufacturerRequestUnitPrice) &&
      manufacturerRequestUnitPrice >= 0
    ) {
      sanitized.manufacturerRequestUnitPrice = manufacturerRequestUnitPrice;
    }
    if (!Number.isNaN(devopsRequestUnitPrice) && devopsRequestUnitPrice >= 0) {
      sanitized.devopsRequestUnitPrice = devopsRequestUnitPrice;
    }
    if (
      !Number.isNaN(salesmanRequestUnitPrice) &&
      salesmanRequestUnitPrice >= 0
    ) {
      sanitized.salesmanRequestUnitPrice = salesmanRequestUnitPrice;
    }
    if (
      !Number.isNaN(manufacturerShippingUnitPrice) &&
      manufacturerShippingUnitPrice >= 0
    ) {
      sanitized.manufacturerShippingUnitPrice = manufacturerShippingUnitPrice;
    }
    if (!Number.isNaN(affiliateVatRate) && affiliateVatRate >= 0) {
      sanitized.affiliateVatRate = Math.min(1, affiliateVatRate);
    }
    if (!Number.isNaN(expressFee) && expressFee >= 0) {
      sanitized.expressFee = expressFee;
    }
    if (
      Number.isFinite(practiceRushFeeMultiplier) &&
      practiceRushFeeMultiplier > 1 &&
      practiceRushFeeMultiplier <= 2
    ) {
      sanitized.practiceRushFeeMultiplier =
        Math.round(practiceRushFeeMultiplier * 100) / 100;
    }
    if (!Number.isNaN(designFee) && designFee >= 0) {
      sanitized.designFee = designFee;
    }
    if (!Number.isNaN(abutmentDesignLabFee) && abutmentDesignLabFee >= 0) {
      sanitized.abutmentDesignLabFee = abutmentDesignLabFee;
    }
    if (
      !Number.isNaN(membershipProductionPrice) &&
      membershipProductionPrice >= 0
    ) {
      sanitized.membershipProductionPrice = membershipProductionPrice;
    }
    if (!Number.isNaN(regularProductionPrice) && regularProductionPrice >= 0) {
      sanitized.regularProductionPrice = regularProductionPrice;
    }
    if (
      !Number.isNaN(membershipDesignAndProductionPrice) &&
      membershipDesignAndProductionPrice >= 0
    ) {
      sanitized.membershipDesignAndProductionPrice =
        membershipDesignAndProductionPrice;
    }
    if (
      !Number.isNaN(regularDesignAndProductionPrice) &&
      regularDesignAndProductionPrice >= 0
    ) {
      sanitized.regularDesignAndProductionPrice =
        regularDesignAndProductionPrice;
    }
    appendTierPartyFields(payload, sanitized);
    if (sanitized.membershipProductionManufacturerUnitPrice != null) {
      sanitized.manufacturerRequestUnitPrice =
        sanitized.membershipProductionManufacturerUnitPrice;
    }
    if (sanitized.membershipProductionDevopsUnitPrice != null) {
      sanitized.devopsRequestUnitPrice =
        sanitized.membershipProductionDevopsUnitPrice;
    }
    if (sanitized.membershipProductionSalesmanUnitPrice != null) {
      sanitized.salesmanRequestUnitPrice =
        sanitized.membershipProductionSalesmanUnitPrice;
    }
    if (
      !Number.isNaN(membershipRoundBarProductionPrice) &&
      membershipRoundBarProductionPrice >= 0
    ) {
      sanitized.membershipRoundBarProductionPrice =
        membershipRoundBarProductionPrice;
    }
    if (
      !Number.isNaN(regularRoundBarProductionPrice) &&
      regularRoundBarProductionPrice >= 0
    ) {
      sanitized.regularRoundBarProductionPrice = regularRoundBarProductionPrice;
    }
    if (
      !Number.isNaN(membershipRoundBarDesignAndProductionPrice) &&
      membershipRoundBarDesignAndProductionPrice >= 0
    ) {
      sanitized.membershipRoundBarDesignAndProductionPrice =
        membershipRoundBarDesignAndProductionPrice;
    }
    if (
      !Number.isNaN(regularRoundBarDesignAndProductionPrice) &&
      regularRoundBarDesignAndProductionPrice >= 0
    ) {
      sanitized.regularRoundBarDesignAndProductionPrice =
        regularRoundBarDesignAndProductionPrice;
    }
    if (!Number.isNaN(abutmentRetailPrice) && abutmentRetailPrice >= 0) {
      sanitized.abutmentRetailPrice = abutmentRetailPrice;
    }
    if (
      !Number.isNaN(practiceMembershipMonthlyFee) &&
      practiceMembershipMonthlyFee >= 0
    ) {
      sanitized.practiceMembershipMonthlyFee = practiceMembershipMonthlyFee;
    }
    if (!Number.isNaN(defaultRequestFreeCredit) && defaultRequestFreeCredit >= 0) {
      sanitized.defaultRequestFreeCredit = defaultRequestFreeCredit;
    }
    if (manufacturerSharePercent != null) {
      sanitized.manufacturerSharePercent = manufacturerSharePercent;
    }
    if (salesmanSharePercent != null) {
      sanitized.salesmanSharePercent = salesmanSharePercent;
    }
    if (devopsSharePercent != null) {
      sanitized.devopsSharePercent = devopsSharePercent;
    }
    // 환영 배송 분리 지급 폐기. 레거시 필드는 항상 0으로 정규화.
    sanitized.defaultShippingFreeCredit = 0;
    if (specialRequestorPrices) {
      const uniquePrices = new Map();
      specialRequestorPrices.forEach((item) => {
        uniquePrices.set(String(item.requestorAnchorId), item);
      });
      sanitized.specialRequestorPrices = Array.from(uniquePrices.values());
    }

    const existing = await SystemSettings.findOne({ key: "global" }).lean();
    const mergedRaw = {
      ...(existing?.creditSettings || {}),
      ...sanitized,
    };
    const abutmentPrices = normalizeAbutsAbutmentCreditPrices(mergedRaw);
    const synced = {
      ...mergedRaw,
      ...abutmentPrices,
      minCreditForRequest: abutmentPrices.membershipProductionPrice,
      designFee: Math.max(
        0,
        abutmentPrices.membershipDesignAndProductionPrice -
          abutmentPrices.membershipProductionPrice,
      ),
    };
    // 응답/공개용 정규화와 저장용을 분리: 저장 시 ObjectId를 유지한다.
    const mergedForSave = {
      ...normalizeCreditSettings(synced),
      specialRequestorPrices: Array.isArray(mergedRaw.specialRequestorPrices)
        ? mergedRaw.specialRequestorPrices
            .map((item) => {
              const id = String(item?.requestorAnchorId || "").trim();
              const productionPrice = Number(
                item?.productionPrice ?? item?.amount,
              );
              const designAndProductionPrice = Number(
                item?.designAndProductionPrice,
              );
              const roundBarProductionPrice = Number(
                item?.roundBarProductionPrice,
              );
              const roundBarDesignAndProductionPrice = Number(
                item?.roundBarDesignAndProductionPrice,
              );
              if (
                !Types.ObjectId.isValid(id) ||
                !Number.isFinite(productionPrice) ||
                productionPrice < 0
              ) {
                return null;
              }
              return {
                requestorAnchorId: new Types.ObjectId(id),
                amount: productionPrice,
                productionPrice,
                designAndProductionPrice: Number.isFinite(
                  designAndProductionPrice,
                )
                  ? Math.max(0, designAndProductionPrice)
                  : productionPrice,
                roundBarProductionPrice: Number.isFinite(
                  roundBarProductionPrice,
                )
                  ? Math.max(0, roundBarProductionPrice)
                  : 0,
                roundBarDesignAndProductionPrice: Number.isFinite(
                  roundBarDesignAndProductionPrice,
                )
                  ? Math.max(0, roundBarDesignAndProductionPrice)
                  : 0,
              };
            })
            .filter(Boolean)
        : [],
    };

    const doc = await SystemSettings.findOneAndUpdate(
      { key: "global" },
      {
        $setOnInsert: { key: "global" },
        $set: { creditSettings: mergedForSave },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();

    const creditSettings = normalizeCreditSettings(doc?.creditSettings || {});
    invalidatePracticeTransferQuoteCaches();
    res.status(200).json({
      success: true,
      message: "크레딧 설정이 업데이트되었습니다.",
      data: {
        creditSettings,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "크레딧 설정 업데이트 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function listCreditPriceRequestors(req, res) {
  try {
    const q = String(req.query?.q || "")
      .trim()
      .toLowerCase();
    const items = await BusinessAnchor.find({
      businessType: "requestor",
      status: { $ne: "merged" },
    })
      .sort({ name: 1, createdAt: 1 })
      .select({
        _id: 1,
        name: 1,
        requestorKind: 1,
        status: 1,
        metadata: 1,
        businessNumberNormalized: 1,
      })
      .lean();

    const mapped = items.map((item) => {
      const name =
        String(item.name || "").trim() ||
        String(item.metadata?.companyName || "").trim() ||
        "이름 없는 의뢰자";
      const representativeName = String(
        item.metadata?.representativeName || "",
      ).trim();
      const businessNumber = String(
        item.businessNumberNormalized || "",
      ).trim();
      const address = [
        String(item.metadata?.address || "").trim(),
        String(item.metadata?.addressDetail || "").trim(),
      ]
        .filter(Boolean)
        .join(" ");
      return {
        id: String(item._id),
        name,
        representativeName,
        businessNumber,
        address,
        requestorKind: item.requestorKind || null,
        status: item.status || null,
      };
    });

    const filtered = q
      ? mapped.filter((item) => {
          const haystack = [
            item.name,
            item.representativeName,
            item.businessNumber,
            item.address,
            item.id,
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(q);
        })
      : mapped;

    res.status(200).json({
      success: true,
      data: {
        items: filtered,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "의뢰자 목록을 조회하지 못했습니다.",
      error: error.message,
    });
  }
}

async function findDevopsPayoutAnchor() {
  return BusinessAnchor.findOne({ businessType: "devops" })
    .select({ payoutRates: 1 })
    .sort({ createdAt: 1 })
    .lean();
}

function normalizePlatformFeeRates(payoutRates = {}, creditSettings = {}) {
  const platformFeeRate = resolvePlatformFeeRate(payoutRates);
  const directPlatformFeeEnabled = isDirectPlatformFeeEnabled(payoutRates);
  const directPlatformFeeRate =
    resolveDirectPlatformFeeRateConfigured(payoutRates);
  const autoMatchMonthlyFee = Math.max(
    0,
    Number(payoutRates?.autoMatchMonthlyFee) || 0,
  );
  return {
    platformFeeRate,
    directPlatformFeeEnabled,
    directPlatformFeeRate,
    autoMatchMonthlyFee,
    practiceRushFeeMultiplier: normalizeConfiguredRushFeeMultiplier(
      creditSettings?.practiceRushFeeMultiplier,
    ),
    partnerFeeRate: platformFeeRate,
    nonPartnerFeeRate: platformFeeRate,
    updatedAt: payoutRates?.updatedAt || null,
  };
}

export async function getPlatformFeeSettings(req, res) {
  try {
    const [devops, creditSettings] = await Promise.all([
      findDevopsPayoutAnchor(),
      loadCreditSettingsDefaults(),
    ]);
    res.status(200).json({
      success: true,
      data: {
        platformFeeSettings: normalizePlatformFeeRates(
          devops?.payoutRates,
          creditSettings,
        ),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "플랫폼 수수료율을 조회하지 못했습니다.",
      error: error.message,
    });
  }
}

export async function updatePlatformFeeSettings(req, res) {
  try {
    const payload = req.body && typeof req.body === "object" ? req.body : {};
    const platformFeeRate = Number(
      payload.platformFeeRate ?? payload.nonPartnerFeeRate,
    );
    if (!Number.isFinite(platformFeeRate) || platformFeeRate < 0 || platformFeeRate > 1) {
      return res.status(400).json({
        success: false,
        message: "매칭 거래 수수료율은 0~100% 범위여야 합니다.",
      });
    }

    let directPlatformFeeRate;
    if (
      payload.directPlatformFeeRate != null ||
      payload.directFeeRate != null
    ) {
      directPlatformFeeRate = Number(
        payload.directPlatformFeeRate ?? payload.directFeeRate,
      );
      if (
        !Number.isFinite(directPlatformFeeRate) ||
        directPlatformFeeRate < 0 ||
        directPlatformFeeRate > 1
      ) {
        return res.status(400).json({
          success: false,
          message: "지정 거래 수수료율은 0~100% 범위여야 합니다.",
        });
      }
    }

    let directPlatformFeeEnabled;
    if (payload.directPlatformFeeEnabled != null) {
      directPlatformFeeEnabled = Boolean(payload.directPlatformFeeEnabled);
    }

    let autoMatchMonthlyFee;
    if (payload.autoMatchMonthlyFee != null) {
      autoMatchMonthlyFee = Number(payload.autoMatchMonthlyFee);
      if (
        !Number.isFinite(autoMatchMonthlyFee) ||
        autoMatchMonthlyFee < 0
      ) {
        return res.status(400).json({
          success: false,
          message: "월 참여 수수료는 0원 이상이어야 합니다.",
        });
      }
      autoMatchMonthlyFee = Math.round(autoMatchMonthlyFee);
    }

    let practiceRushFeeMultiplier;
    if (payload.practiceRushFeeMultiplier != null) {
      practiceRushFeeMultiplier = Number(payload.practiceRushFeeMultiplier);
      if (
        !Number.isFinite(practiceRushFeeMultiplier) ||
        practiceRushFeeMultiplier <= 1 ||
        practiceRushFeeMultiplier > 2
      ) {
        return res.status(400).json({
          success: false,
          message: "신속처리 할증은 1 초과 2 이하여야 합니다.",
        });
      }
      practiceRushFeeMultiplier =
        Math.round(practiceRushFeeMultiplier * 100) / 100;
    }

    const devops = await findDevopsPayoutAnchor();
    if (!devops?._id) {
      return res.status(404).json({
        success: false,
        message: "개발운영사 사업자를 찾을 수 없습니다.",
      });
    }

    const $set = {
      "payoutRates.platformFeeRate": platformFeeRate,
      "payoutRates.partnerFeeRate": platformFeeRate,
      "payoutRates.nonPartnerFeeRate": platformFeeRate,
      "payoutRates.updatedAt": new Date(),
    };
    if (directPlatformFeeRate != null) {
      $set["payoutRates.directPlatformFeeRate"] = directPlatformFeeRate;
    }
    if (directPlatformFeeEnabled != null) {
      $set["payoutRates.directPlatformFeeEnabled"] = directPlatformFeeEnabled;
    }
    if (autoMatchMonthlyFee != null) {
      $set["payoutRates.autoMatchMonthlyFee"] = autoMatchMonthlyFee;
    }

    await BusinessAnchor.updateOne({ _id: devops._id }, { $set });

    if (practiceRushFeeMultiplier != null) {
      await SystemSettings.findOneAndUpdate(
        { key: "global" },
        {
          $set: {
            "creditSettings.practiceRushFeeMultiplier":
              practiceRushFeeMultiplier,
          },
          $setOnInsert: { key: "global" },
        },
        { upsert: true, new: true },
      );
    }

    invalidatePracticeTransferQuoteCaches();

    const [next, creditSettings] = await Promise.all([
      findDevopsPayoutAnchor(),
      loadCreditSettingsDefaults(),
    ]);
    res.status(200).json({
      success: true,
      message: "플랫폼 수수료 설정이 저장되었습니다.",
      data: {
        platformFeeSettings: normalizePlatformFeeRates(
          next?.payoutRates,
          creditSettings,
        ),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "플랫폼 수수료 설정을 저장하지 못했습니다.",
      error: error.message,
    });
  }
}

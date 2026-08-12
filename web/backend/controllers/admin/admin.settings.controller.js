// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/modules/admin/admin.routes.js
// - web/backend/models/systemSettings.model.js
// - web/backend/utils/creditSettingsDefaults.js
// - web/frontend/src/features/settings/tabs/AdminCreditSettingsTab.tsx
// - web/frontend/src/pages/devops/DevopsSettingsPage.tsx
import SystemSettings from "../../models/systemSettings.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import { Types } from "mongoose";
import {
  DEFAULT_DELIVERY_ETA_LEAD_DAYS,
  getDeliveryEtaLeadDays,
} from "./admin.shared.controller.js";
const CREDIT_SETTINGS_DEFAULTS = (() => {
  const pickDefault = (path) =>
    Number(SystemSettings.schema.path(path)?.options?.default ?? 0) || 0;
  return {
    minCreditForRequest: pickDefault("creditSettings.minCreditForRequest"),
    shippingFee: pickDefault("creditSettings.shippingFee"),
    expressFee: pickDefault("creditSettings.expressFee"),
    designFee: pickDefault("creditSettings.designFee"),
    abutmentRetailPrice: pickDefault("creditSettings.abutmentRetailPrice"),
    defaultRequestFreeCredit: pickDefault(
      "creditSettings.defaultRequestFreeCredit",
    ),
    defaultShippingFreeCredit: pickDefault(
      "creditSettings.defaultShippingFreeCredit",
    ),
  };
})();

function normalizeCreditSettings(raw = {}) {
  return {
    minCreditForRequest: Number(
      raw.minCreditForRequest ?? CREDIT_SETTINGS_DEFAULTS.minCreditForRequest,
    ),
    specialRequestorPrices: Array.isArray(raw.specialRequestorPrices)
      ? raw.specialRequestorPrices
          .map((item) => ({
            requestorAnchorId: String(item?.requestorAnchorId || "").trim(),
            amount: Math.max(0, Number(item?.amount) || 0),
          }))
          .filter((item) => item.requestorAnchorId)
      : [],
    shippingFee: Number(raw.shippingFee ?? CREDIT_SETTINGS_DEFAULTS.shippingFee),
    expressFee: Number(raw.expressFee ?? CREDIT_SETTINGS_DEFAULTS.expressFee),
    designFee: Number(raw.designFee ?? CREDIT_SETTINGS_DEFAULTS.designFee),
    abutmentRetailPrice: Number(
      raw.abutmentRetailPrice ?? CREDIT_SETTINGS_DEFAULTS.abutmentRetailPrice,
    ),
    defaultRequestFreeCredit: Number(
      raw.defaultRequestFreeCredit ??
        CREDIT_SETTINGS_DEFAULTS.defaultRequestFreeCredit,
    ),
    defaultShippingFreeCredit: Number(
      raw.defaultShippingFreeCredit ??
        CREDIT_SETTINGS_DEFAULTS.defaultShippingFreeCredit,
    ),
  };
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
    const expressFee = Number(payload.expressFee);
    const designFee = Number(payload.designFee);
    const abutmentRetailPrice = Number(payload.abutmentRetailPrice);
    const defaultRequestFreeCredit = Number(payload.defaultRequestFreeCredit);
    const defaultShippingFreeCredit = Number(payload.defaultShippingFreeCredit);
    const specialRequestorPrices = Array.isArray(payload.specialRequestorPrices)
      ? payload.specialRequestorPrices
          .map((item) => {
            const requestorAnchorId = String(
              item?.requestorAnchorId || "",
            ).trim();
            const amount = Number(item?.amount);
            if (
              !Types.ObjectId.isValid(requestorAnchorId) ||
              !Number.isFinite(amount) ||
              amount < 0
            ) {
              return null;
            }
            return {
              requestorAnchorId: new Types.ObjectId(requestorAnchorId),
              amount,
            };
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
    if (!Number.isNaN(expressFee) && expressFee >= 0) {
      sanitized.expressFee = expressFee;
    }
    if (!Number.isNaN(designFee) && designFee >= 0) {
      sanitized.designFee = designFee;
    }
    if (!Number.isNaN(abutmentRetailPrice) && abutmentRetailPrice >= 0) {
      sanitized.abutmentRetailPrice = abutmentRetailPrice;
    }
    if (!Number.isNaN(defaultRequestFreeCredit) && defaultRequestFreeCredit >= 0) {
      sanitized.defaultRequestFreeCredit = defaultRequestFreeCredit;
    }
    if (
      !Number.isNaN(defaultShippingFreeCredit) &&
      defaultShippingFreeCredit >= 0
    ) {
      sanitized.defaultShippingFreeCredit = defaultShippingFreeCredit;
    }
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
    // 응답/공개용 정규화와 저장용을 분리: 저장 시 ObjectId를 유지한다.
    const mergedForSave = {
      ...normalizeCreditSettings(mergedRaw),
      specialRequestorPrices: Array.isArray(mergedRaw.specialRequestorPrices)
        ? mergedRaw.specialRequestorPrices
            .map((item) => {
              const id = String(item?.requestorAnchorId || "").trim();
              const amount = Number(item?.amount);
              if (!Types.ObjectId.isValid(id) || !Number.isFinite(amount) || amount < 0) {
                return null;
              }
              return {
                requestorAnchorId: new Types.ObjectId(id),
                amount,
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

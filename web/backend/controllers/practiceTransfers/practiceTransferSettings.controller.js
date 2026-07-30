import { Types } from "mongoose";
import BusinessAnchor from "../../models/businessAnchor.model.js";

// related files:
// - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
// - web/backend/models/businessAnchor.model.js
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
const DEFAULT_ARRIVAL_DEFAULT_DAYS = 7;
const DEFAULT_PROSTHESIS_TYPES = [
  "크라운",
  "브리지",
  "커스텀어벗+크라운",
  "커스텀어벗+브리지",
];

const normalizeProsthesisTypes = (items) => {
  const list = Array.isArray(items) ? items : [];
  const dedup = new Map();

  for (const item of list) {
    const trimmed = String(item || "").trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!dedup.has(key)) dedup.set(key, trimmed);
  }

  const out = Array.from(dedup.values());
  return out.length ? out : [...DEFAULT_PROSTHESIS_TYPES];
};

const normalizeArrivalDefaultDays = (value) => {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return DEFAULT_ARRIVAL_DEFAULT_DAYS;
  return Math.min(365, Math.max(0, Math.floor(raw)));
};

const toSettingsResponse = (anchor) => {
  const settings =
    anchor?.practiceTransferSettings &&
    typeof anchor.practiceTransferSettings === "object"
      ? anchor.practiceTransferSettings
      : {};

  const promoNoticeDismissedAt = settings?.promoNoticeDismissedAt
    ? new Date(settings.promoNoticeDismissedAt).toISOString()
    : null;

  return {
    arrivalDefaultDays: normalizeArrivalDefaultDays(settings?.arrivalDefaultDays),
    prosthesisTypes: normalizeProsthesisTypes(settings?.prosthesisTypes),
    promoNoticeDismissedAt,
    updatedAt: settings?.updatedAt || null,
  };
};

export async function getPracticeTransferSettings(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (role !== "practice" && role !== "requestor" && role !== "admin") {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const anchorId = String(req.user?.businessAnchorId || "").trim();
    if (!anchorId || !Types.ObjectId.isValid(anchorId)) {
      return res.status(400).json({
        success: false,
        message: "practice 사업자 정보가 필요합니다.",
      });
    }

    const anchor = await BusinessAnchor.findById(anchorId)
      .select({ practiceTransferSettings: 1 })
      .lean();

    if (!anchor) {
      return res.status(404).json({
        success: false,
        message: "practice 사업자 정보를 찾을 수 없습니다.",
      });
    }

    return res.status(200).json({
      success: true,
      data: toSettingsResponse(anchor),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "practice 전송 설정 조회 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

export async function upsertPracticeTransferSettings(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (role !== "practice" && role !== "requestor" && role !== "admin") {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const anchorId = String(req.user?.businessAnchorId || "").trim();
    if (!anchorId || !Types.ObjectId.isValid(anchorId)) {
      return res.status(400).json({
        success: false,
        message: "practice 사업자 정보가 필요합니다.",
      });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const hasArrivalDefaultDays = Object.prototype.hasOwnProperty.call(body, "arrivalDefaultDays");
    const hasProsthesisTypes = Object.prototype.hasOwnProperty.call(body, "prosthesisTypes");
    const hasPromoNoticeDismissedAt = Object.prototype.hasOwnProperty.call(body, "promoNoticeDismissedAt");

    const setPatch = {
      "practiceTransferSettings.updatedAt": new Date(),
    };

    if (hasArrivalDefaultDays) {
      setPatch["practiceTransferSettings.arrivalDefaultDays"] = normalizeArrivalDefaultDays(body.arrivalDefaultDays);
    }
    if (hasProsthesisTypes) {
      setPatch["practiceTransferSettings.prosthesisTypes"] = normalizeProsthesisTypes(body.prosthesisTypes);
    }
    if (hasPromoNoticeDismissedAt) {
      const raw = body.promoNoticeDismissedAt;
      if (!raw) {
        setPatch["practiceTransferSettings.promoNoticeDismissedAt"] = null;
      } else {
        const parsed = new Date(raw);
        setPatch["practiceTransferSettings.promoNoticeDismissedAt"] =
          Number.isNaN(parsed.getTime()) ? new Date() : parsed;
      }
    }

    const anchor = await BusinessAnchor.findByIdAndUpdate(
      new Types.ObjectId(anchorId),
      {
        $set: setPatch,
      },
      {
        new: true,
        upsert: false,
      },
    )
      .select({ practiceTransferSettings: 1 })
      .lean();

    if (!anchor) {
      return res.status(404).json({
        success: false,
        message: "practice 사업자 정보를 찾을 수 없습니다.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "practice 전송 설정을 저장했습니다.",
      data: toSettingsResponse(anchor),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "practice 전송 설정 저장 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

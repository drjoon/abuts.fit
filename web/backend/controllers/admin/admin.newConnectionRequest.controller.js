// related files:
// - web/backend/services/newConnectionRequestDashboard.service.js
// - web/backend/services/newConnectionImplantGroup.service.js
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx
import { Types } from "mongoose";
import Request from "../../models/request.model.js";
import { invalidateAdminDashboardCaches } from "../../services/requestDashboardCache.service.js";
import {
  extractNewConnectionImplantPair,
  mergeNewConnectionImplantGroups,
  updateGroupCanonical,
  updateGroupWorkflow,
} from "../../services/newConnectionImplantGroup.service.js";

const text = (value) => String(value || "").trim();

const isNewConnectionRequestCase = (caseInfos) => {
  const unsupported = text(caseInfos?.unsupportedConnection?.label);
  if (unsupported) return true;
  return Boolean(caseInfos?.newSystemRequest?.requested);
};

export async function updateAdminNewConnectionGroupWorkflow(req, res) {
  try {
    const groupKey = decodeURIComponent(String(req.params?.groupKey || "")).trim();
    if (!groupKey) {
      return res.status(400).json({
        success: false,
        message: "묶음 키가 필요합니다.",
      });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const flags = {
      read: typeof body.read === "boolean" ? body.read : undefined,
      inDevelopment:
        typeof body.inDevelopment === "boolean" ? body.inDevelopment : undefined,
      developmentComplete:
        typeof body.developmentComplete === "boolean"
          ? body.developmentComplete
          : undefined,
    };

    const updated = await updateGroupWorkflow(
      groupKey,
      req.user?._id || null,
      flags,
    );
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "묶음을 찾을 수 없습니다.",
      });
    }

    invalidateAdminDashboardCaches();
    return res.status(200).json({ success: true, data: updated });
  } catch (e) {
    console.error("[adminNewConnectionRequest] workflow error", e);
    return res.status(500).json({
      success: false,
      message: "처리에 실패했습니다.",
    });
  }
}

export async function updateAdminNewConnectionGroupCanonical(req, res) {
  try {
    const groupKey = decodeURIComponent(String(req.params?.groupKey || "")).trim();
    if (!groupKey) {
      return res.status(400).json({
        success: false,
        message: "묶음 키가 필요합니다.",
      });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const updated = await updateGroupCanonical(groupKey, {
      canonicalManufacturer: body.canonicalManufacturer,
      canonicalBrand: body.canonicalBrand,
      mergeAlias: body.mergeAlias,
    });
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "묶음을 찾을 수 없습니다.",
      });
    }

    invalidateAdminDashboardCaches();
    return res.status(200).json({ success: true, data: updated });
  } catch (e) {
    console.error("[adminNewConnectionRequest] canonical error", e);
    return res.status(500).json({
      success: false,
      message: "저장에 실패했습니다.",
    });
  }
}

export async function mergeAdminNewConnectionGroups(req, res) {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const fromGroupKey = text(body.fromGroupKey);
    const toGroupKey = text(body.toGroupKey);
    const result = await mergeNewConnectionImplantGroups(fromGroupKey, toGroupKey);
    if (!result.ok) {
      return res.status(400).json({
        success: false,
        message: "묶음을 합칠 수 없습니다.",
      });
    }
    invalidateAdminDashboardCaches();
    return res.status(200).json({ success: true, data: result.group });
  } catch (e) {
    console.error("[adminNewConnectionRequest] merge error", e);
    return res.status(500).json({
      success: false,
      message: "합치기에 실패했습니다.",
    });
  }
}

export async function updateAdminNewConnectionRequestImplant(req, res) {
  try {
    const id = String(req.params?.id || "").trim();
    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 의뢰 ID입니다.",
      });
    }

    const doc = await Request.findById(id);
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: "의뢰를 찾을 수 없습니다.",
      });
    }
    if (!isNewConnectionRequestCase(doc.caseInfos)) {
      return res.status(400).json({
        success: false,
        message: "신규 커넥션 요청 대상이 아닙니다.",
      });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const manufacturer = text(body.implantManufacturer);
    const brand = text(body.implantBrand);
    const family = text(body.implantFamily);
    const implantType = text(body.implantType);

    const caseInfos = doc.caseInfos || {};
    const unsupported = text(caseInfos.unsupportedConnection?.label);
    if (unsupported) {
      const label = [manufacturer, brand, family, implantType]
        .filter(Boolean)
        .join(" / ");
      doc.caseInfos.unsupportedConnection = {
        ...caseInfos.unsupportedConnection,
        label,
      };
      doc.caseInfos.implantManufacturer = manufacturer;
      doc.caseInfos.implantBrand = brand;
      doc.caseInfos.implantFamily = family;
      doc.caseInfos.implantType = implantType;
    } else if (caseInfos.newSystemRequest?.requested) {
      doc.caseInfos.newSystemRequest = {
        ...caseInfos.newSystemRequest,
        manufacturer,
        brand,
        family,
      };
    } else {
      doc.caseInfos.implantManufacturer = manufacturer;
      doc.caseInfos.implantBrand = brand;
      doc.caseInfos.implantFamily = family;
      doc.caseInfos.implantType = implantType;
    }

    if (body.mergeAlias?.manufacturer && body.mergeAlias?.brand && body.targetGroupKey) {
      await updateGroupCanonical(text(body.targetGroupKey), {
        mergeAlias: body.mergeAlias,
      });
    }

    doc.markModified("caseInfos");
    await doc.save();

    invalidateAdminDashboardCaches();

    const pair = extractNewConnectionImplantPair(doc.caseInfos);
    return res.status(200).json({
      success: true,
      data: {
        id: String(doc._id),
        implantManufacturer: pair.manufacturer,
        implantBrand: pair.brand,
        implantFamily: pair.family,
        implantType: pair.implantType,
      },
    });
  } catch (e) {
    console.error("[adminNewConnectionRequest] implant update error", e);
    return res.status(500).json({
      success: false,
      message: "저장에 실패했습니다.",
    });
  }
}

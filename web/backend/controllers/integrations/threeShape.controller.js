// related files:
// - web/backend/modules/integrations/threeShape.routes.js
// - web/backend/models/scannerIntegration.model.js
// - web/backend/services/integrations/threeShape/syncLabInbox.js
import { Types } from "mongoose";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import ScannerIntegration from "../../models/scannerIntegration.model.js";
import {
  canReceivePracticeTransfer,
  resolveRequestorProfile,
} from "../../utils/requestorCapabilities.js";
import { encryptScannerCredentials } from "../../utils/scannerIntegrationCrypto.js";
import { validateThreeShapeCredentials } from "../../services/integrations/threeShape/client.js";
import { syncThreeShapeLabInbox } from "../../services/integrations/threeShape/syncLabInbox.js";

function toPublicIntegration(doc) {
  if (!doc) return null;
  return {
    provider: "3shape",
    status: String(doc.status || "disconnected"),
    externalAccountEmail: String(doc.externalAccountEmail || ""),
    externalAccountId: String(doc.externalAccountId || ""),
    scopes: Array.isArray(doc.scopes) ? doc.scopes : [],
    lastSyncAt: doc.lastSyncAt || null,
    lastError: String(doc.lastError || ""),
    connectedAt: doc.connectedAt || null,
    updatedAt: doc.updatedAt || null,
  };
}

async function resolveLabAnchorId(req) {
  const role = String(req.user?.role || "").trim();
  const anchorId = String(req.user?.businessAnchorId || "").trim();
  if (!anchorId || !Types.ObjectId.isValid(anchorId)) {
    return { error: { status: 400, message: "기공소 사업자 정보가 필요합니다." } };
  }

  const anchor = await BusinessAnchor.findById(anchorId)
    .select({
      name: 1,
      businessType: 1,
      requestorKind: 1,
      requestorCapabilities: 1,
      requestorServices: 1,
      status: 1,
    })
    .lean();
  if (!anchor) {
    return { error: { status: 404, message: "사업자를 찾을 수 없습니다." } };
  }

  if (role === "admin" || role === "internalLab") {
    return { labAnchorId: anchorId, lab: anchor };
  }

  const profile = resolveRequestorProfile({
    anchorKind: anchor.requestorKind,
    anchorCaps: anchor.requestorCapabilities,
    anchorServices: anchor.requestorServices,
    userKind: req.user?.requestorKind,
    userCaps: req.user?.requestorCapabilities,
    userServices: req.user?.requestorServices,
    userRole: role,
    businessVerified: anchor.status === "verified",
  });

  if (!canReceivePracticeTransfer(profile)) {
    return {
      error: {
        status: 403,
        message: "기공소(의뢰 수신자)만 3Shape 연동을 사용할 수 있습니다.",
      },
    };
  }

  return { labAnchorId: anchorId, lab: anchor };
}

export async function getThreeShapeIntegration(req, res) {
  try {
    const resolved = await resolveLabAnchorId(req);
    if (resolved.error) {
      return res.status(resolved.error.status).json({
        success: false,
        message: resolved.error.message,
      });
    }

    const doc = await ScannerIntegration.findOne({
      businessAnchorId: resolved.labAnchorId,
      provider: "3shape",
    }).lean();

    return res.status(200).json({
      success: true,
      data: toPublicIntegration(doc) || {
        provider: "3shape",
        status: "disconnected",
        externalAccountEmail: "",
        externalAccountId: "",
        scopes: [],
        lastSyncAt: null,
        lastError: "",
        connectedAt: null,
        updatedAt: null,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "3Shape 연동 상태를 불러오지 못했습니다.",
      error: error?.message,
    });
  }
}

export async function connectThreeShapeIntegration(req, res) {
  try {
    const resolved = await resolveLabAnchorId(req);
    if (resolved.error) {
      return res.status(resolved.error.status).json({
        success: false,
        message: resolved.error.message,
      });
    }

    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || "");
    const accessToken = String(req.body?.accessToken || "").trim();

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "3Shape Communicate 이메일이 필요합니다.",
      });
    }
    if (!password && !accessToken) {
      return res.status(400).json({
        success: false,
        message: "비밀번호 또는 accessToken이 필요합니다.",
      });
    }

    const validation = await validateThreeShapeCredentials({
      email,
      password: password || undefined,
      accessToken: accessToken || undefined,
    });

    const credentialsCipher = encryptScannerCredentials({
      email,
      password: password || undefined,
      accessToken: accessToken || undefined,
      provider: "3shape",
      storedAt: new Date().toISOString(),
    });

    const status = validation.ok
      ? "connected"
      : validation.pending
        ? "pending"
        : "error";

    const doc = await ScannerIntegration.findOneAndUpdate(
      {
        businessAnchorId: resolved.labAnchorId,
        provider: "3shape",
      },
      {
        $set: {
          status,
          externalAccountEmail: validation.externalAccountEmail || email,
          externalAccountId: validation.externalAccountId || "",
          credentialsCipher,
          scopes: validation.scopes || [],
          lastError: validation.ok
            ? ""
            : String(validation.message || "").slice(0, 500),
          connectedAt: validation.ok ? new Date() : null,
          connectedByUserId: req.user?._id || null,
          disconnectedAt: null,
        },
      },
      { upsert: true, new: true },
    );

    return res.status(200).json({
      success: true,
      message: validation.ok
        ? "3Shape 계정이 연결되었습니다."
        : validation.message || "계정이 저장되었습니다. 파트너 API 승인 후 활성화됩니다.",
      data: toPublicIntegration(doc),
    });
  } catch (error) {
    const status = Number(error?.statusCode || 500);
    return res.status(status >= 400 && status < 600 ? status : 500).json({
      success: false,
      message: error?.message || "3Shape 연결에 실패했습니다.",
    });
  }
}

export async function disconnectThreeShapeIntegration(req, res) {
  try {
    const resolved = await resolveLabAnchorId(req);
    if (resolved.error) {
      return res.status(resolved.error.status).json({
        success: false,
        message: resolved.error.message,
      });
    }

    const doc = await ScannerIntegration.findOneAndUpdate(
      {
        businessAnchorId: resolved.labAnchorId,
        provider: "3shape",
      },
      {
        $set: {
          status: "disconnected",
          credentialsCipher: "",
          externalAccountId: "",
          scopes: [],
          lastError: "",
          disconnectedAt: new Date(),
          connectedAt: null,
        },
      },
      { new: true },
    );

    return res.status(200).json({
      success: true,
      message: "3Shape 연동이 해제되었습니다.",
      data: toPublicIntegration(doc) || {
        provider: "3shape",
        status: "disconnected",
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "3Shape 연동 해제에 실패했습니다.",
      error: error?.message,
    });
  }
}

export async function syncThreeShapeIntegration(req, res) {
  try {
    const resolved = await resolveLabAnchorId(req);
    if (resolved.error) {
      return res.status(resolved.error.status).json({
        success: false,
        message: resolved.error.message,
      });
    }

    const result = await syncThreeShapeLabInbox({
      businessAnchorId: resolved.labAnchorId,
      force: false,
    });

    if (!result.ok) {
      const status =
        result.reason === "not_connected" ||
        result.reason === "status_not_connected"
          ? 400
          : 500;
      return res.status(status).json({
        success: false,
        message:
          result.reason === "status_not_connected"
            ? "연결된 3Shape 계정이 없습니다. 먼저 계정을 연결해주세요."
            : result.error || "동기화에 실패했습니다.",
        data: result,
      });
    }

    return res.status(200).json({
      success: true,
      message: `동기화 완료 (신규 ${result.imported}건)`,
      data: result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "3Shape 동기화에 실패했습니다.",
      error: error?.message,
    });
  }
}

export async function listThreeShapeIntegrationsAdmin(req, res) {
  try {
    const docs = await ScannerIntegration.find({ provider: "3shape" })
      .sort({ updatedAt: -1 })
      .limit(500)
      .populate("businessAnchorId", "name")
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        integrations: docs.map((doc) => ({
          ...toPublicIntegration(doc),
          businessAnchorId: String(doc.businessAnchorId?._id || doc.businessAnchorId || ""),
          businessName: String(doc.businessAnchorId?.name || ""),
        })),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "3Shape 연동 목록을 불러오지 못했습니다.",
      error: error?.message,
    });
  }
}

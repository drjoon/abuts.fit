import { Types } from "mongoose";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import User from "../../models/user.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import { emitAppEventToUser } from "../../socket.js";

// related files:
// - web/frontend/src/pages/practice/hooks/usePracticeTransferStep1.ts
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
// - web/backend/models/practiceTransfer.model.js
// - web/backend/models/user.model.js
// - web/backend/models/businessAnchor.model.js
// - web/backend/socket.js
const PRACTICE_TAGS = ["practice_dropzone", "practice_file_transfer"];
const PRACTICE_ALLOWED_MODEL_EXTENSIONS = new Set([".stl", ".ply", ".obj"]);

const getLowerExt = (filename) => {
  const raw = String(filename || "").trim().toLowerCase();
  const idx = raw.lastIndexOf(".");
  if (idx < 0) return "";
  return raw.slice(idx);
};

const isAllowedPracticeModelFile = (filename) =>
  PRACTICE_ALLOWED_MODEL_EXTENSIONS.has(getLowerExt(filename));

const extractTransferIdFromMessage = (message) => {
  const raw = String(message || "").trim();
  const matched = raw.match(/\[\s*전송ID\s*:\s*([^\]]+)\]/i);
  return String(matched?.[1] || "").trim();
};

const extractLabNameFromMessage = (message) => {
  const raw = String(message || "").trim();
  const matched = raw.match(/\[\s*기공소\s*:\s*([^\]]+)\]/i);
  return String(matched?.[1] || "").trim();
};

const extractTransferMemoFromMessage = (message) => {
  const raw = String(message || "").trim();
  if (!raw) return "";
  return raw
    .split(/\r?\n/)
    .map((line) =>
      String(line || "")
        .replace(/\[\s*기공소\s*:[^\]]*\]/gi, "")
        .replace(/\[\s*전송ID\s*:[^\]]*\]/gi, "")
        .trim(),
    )
    .filter(Boolean)
    .join("\n")
    .trim();
};

const toVirtualRequestRows = (transferDoc) => {
  const transferId = String(transferDoc?.transferId || "").trim();
  const targetLabName = String(transferDoc?.targetLabName || "").trim();
  const transferMemo = String(transferDoc?.transferMemo || "").trim();
  const message = `[기공소: ${targetLabName}] ${transferMemo}\n[전송ID: ${transferId}]`;
  const files = Array.isArray(transferDoc?.files) ? transferDoc.files : [];

  const manufacturerStage =
    transferDoc?.status === "canceled"
      ? "취소"
      : transferDoc?.requestorReadAt
        ? "수신완료"
        : "수신전";

  return files.map((item, idx) => ({
    _id: `${String(transferDoc._id)}:${idx + 1}`,
    requestId: `${transferId}-${idx + 1}`,
    manufacturerStage,
    createdAt: transferDoc?.createdAt,
    practiceTransferId: String(transferDoc?._id || ""),
    caseInfos: {
      clinicName: "",
      patientName: String(item?.patientName || "").trim(),
      tooth: String(item?.tooth || "").trim(),
      file: {
        originalName: String(item?.file?.originalName || "").trim(),
        name: String(item?.file?.originalName || "").trim(),
        s3Key: String(item?.file?.s3Key || "").trim(),
        size: Number(item?.file?.size || 0),
        mimetype: String(item?.file?.mimetype || "application/octet-stream").trim(),
      },
      newSystemRequest: {
        tag: String(transferDoc?.tag || "practice_file_transfer").trim(),
        message,
      },
      practiceRouting: {
        targetLabAnchorId: transferDoc?.targetLabAnchorId || null,
        targetLabName,
      },
    },
  }));
};

const buildReceivedScope = (req) => {
  const role = String(req.user?.role || "").trim();
  if (role === "admin") {
    return { role, scope: {} };
  }

  const targetLabAnchorId = String(req.user?.businessAnchorId || "").trim();
  if (!targetLabAnchorId || !Types.ObjectId.isValid(targetLabAnchorId)) {
    return { role, scope: null };
  }

  return {
    role,
    scope: { targetLabAnchorId: new Types.ObjectId(targetLabAnchorId) },
  };
};

const buildTransferIdFilter = (rawTransferId) => {
  const value = String(rawTransferId || "").trim();
  if (!value) return null;
  if (Types.ObjectId.isValid(value)) {
    return {
      $or: [{ transferId: value }, { _id: new Types.ObjectId(value) }],
    };
  }
  return { transferId: value };
};

const resolveRequestorUserIdsByAnchor = async (anchorId) => {
  const raw = String(anchorId || "").trim();
  if (!raw || !Types.ObjectId.isValid(raw)) return [];

  const users = await User.find({
    businessAnchorId: new Types.ObjectId(raw),
    role: "requestor",
    active: true,
  })
    .select({ _id: 1 })
    .lean();

  return users
    .map((u) => String(u?._id || "").trim())
    .filter(Boolean);
};

const emitPracticeTransferEventToRequestorUsers = async ({
  targetLabAnchorId,
  type,
  payload,
}) => {
  try {
    const eventType = String(type || "").trim();
    if (!eventType) return;

    const userIds = await resolveRequestorUserIdsByAnchor(targetLabAnchorId);
    if (!userIds.length) return;

    userIds.forEach((userId) => {
      emitAppEventToUser(userId, eventType, payload);
    });
  } catch {
    // 실시간 이벤트 실패가 본 API 성공/실패를 좌우하지 않도록 무시
  }
};

export async function createPracticeTransfer(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (role !== "practice" && role !== "admin") {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const caseInfos = Array.isArray(req.body?.caseInfos) ? req.body.caseInfos : [];
    if (caseInfos.length === 0) {
      return res.status(400).json({ success: false, message: "caseInfos가 필요합니다." });
    }

    const first = caseInfos[0] || {};
    const nsr = first?.newSystemRequest || {};
    const practiceRouting = first?.practiceRouting || {};
    const message = String(nsr?.message || "").trim();
    const tag = String(nsr?.tag || "practice_file_transfer").trim();

    if (!PRACTICE_TAGS.includes(tag)) {
      return res.status(400).json({
        success: false,
        message: "practice 전송 태그가 아닙니다.",
      });
    }

    const transferId =
      String(req.body?.transferId || "").trim() ||
      extractTransferIdFromMessage(message) ||
      `PTX-${Date.now().toString(36).toUpperCase()}`;

    let targetLabName =
      String(req.body?.targetLabName || "").trim() ||
      String(practiceRouting?.targetLabName || "").trim() ||
      extractLabNameFromMessage(message);

    const rawAnchorId =
      String(req.body?.targetLabAnchorId || "").trim() ||
      String(practiceRouting?.targetLabAnchorId || "").trim();

    const targetLabAnchorId = Types.ObjectId.isValid(rawAnchorId)
      ? new Types.ObjectId(rawAnchorId)
      : null;

    if (!targetLabName && targetLabAnchorId) {
      const anchor = await BusinessAnchor.findById(targetLabAnchorId)
        .select({ name: 1 })
        .lean();
      targetLabName = String(anchor?.name || "").trim();
    }

    const transferMemo =
      String(req.body?.transferMemo || "").trim() || extractTransferMemoFromMessage(message);

    const files = caseInfos
      .map((ci) => {
        const file = ci?.file || {};
        const originalName = String(file?.originalName || file?.name || "").trim();
        const s3Key = String(file?.s3Key || file?.key || "").trim();
        if (!originalName || !s3Key) return null;
        if (!isAllowedPracticeModelFile(originalName)) return null;

        return {
          patientName: String(ci?.patientName || "").trim(),
          tooth: String(ci?.tooth || "").trim(),
          file: {
            originalName,
            mimetype: String(file?.mimetype || "application/octet-stream").trim(),
            size: Number(file?.size || 0),
            s3Key,
          },
        };
      })
      .filter(Boolean);

    if (files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "저장할 STL, PLY, OBJ 파일이 없습니다.",
      });
    }

    const transferDoc = await PracticeTransfer.create({
      transferId,
      practiceUserId: req.user?._id,
      practiceBusinessAnchorId: req.user?.businessAnchorId || null,
      targetLabAnchorId,
      targetLabName,
      transferMemo,
      tag,
      status: "active",
      files,
    });

    const targetLabAnchorIdText = String(targetLabAnchorId || "").trim();
    const unreadCountForRequestor = targetLabAnchorIdText
      ? await PracticeTransfer.countDocuments({
          targetLabAnchorId: new Types.ObjectId(targetLabAnchorIdText),
          status: { $ne: "canceled" },
          requestorReadAt: null,
        })
      : 0;

    const realtimePayload = {
      source: "createPracticeTransfer",
      transferId,
      transferMongoId: String(transferDoc?._id || ""),
      targetLabAnchorId: targetLabAnchorIdText || null,
      practiceUserId: String(req.user?._id || ""),
      status: "active",
      count: files.length,
      unreadCount: unreadCountForRequestor,
      createdAt: transferDoc?.createdAt || new Date(),
    };

    emitAppEventToUser(req.user?._id, "practice:transfer-created", realtimePayload);

    await emitPracticeTransferEventToRequestorUsers({
      targetLabAnchorId,
      type: "practice:transfer-created",
      payload: realtimePayload,
    });

    return res.status(201).json({
      success: true,
      message: "practice 전송이 접수되었습니다.",
      data: {
        _id: String(transferDoc?._id || ""),
        transferId,
        count: files.length,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "practice 전송 생성 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

export async function getMyPracticeTransfers(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (role !== "practice" && role !== "admin") {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const page = Math.max(1, Number(req.query?.page || 1));
    const limit = Math.min(200, Math.max(1, Number(req.query?.limit || 100)));
    const skip = (page - 1) * limit;

    const baseFilter =
      role === "admin"
        ? {}
        : {
            practiceUserId: req.user?._id,
          };

    const docs = await PracticeTransfer.find(baseFilter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const requests = docs.flatMap((doc) => toVirtualRequestRows(doc));

    return res.status(200).json({
      success: true,
      data: {
        requests,
        pagination: {
          page,
          limit,
          count: requests.length,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "practice 전송 내역 조회 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

export async function getReceivedPracticeTransfers(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (role !== "requestor" && role !== "admin") {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const page = Math.max(1, Number(req.query?.page || 1));
    const limit = Math.min(200, Math.max(1, Number(req.query?.limit || 10)));
    const skip = (page - 1) * limit;

    const { scope } = buildReceivedScope(req);
    if (scope === null) {
      return res.status(200).json({
        success: true,
        data: {
          transfers: [],
          unreadCount: 0,
          pagination: {
            page,
            limit,
            count: 0,
            total: 0,
            hasMore: false,
          },
        },
      });
    }

    const [docs, totalCount, unreadCount] = await Promise.all([
      PracticeTransfer.find(scope)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .populate("practiceBusinessAnchorId", "name")
        .populate("practiceUserId", "name")
        .lean(),
      PracticeTransfer.countDocuments(scope),
      PracticeTransfer.countDocuments({
        ...scope,
        status: { $ne: "canceled" },
        requestorReadAt: null,
      }),
    ]);

    const transfers = docs.map((doc) => {
      const practiceBusiness =
        doc?.practiceBusinessAnchorId &&
        typeof doc.practiceBusinessAnchorId === "object"
          ? doc.practiceBusinessAnchorId
          : null;
      const practiceUser =
        doc?.practiceUserId && typeof doc.practiceUserId === "object"
          ? doc.practiceUserId
          : null;
      const files = Array.isArray(doc?.files) ? doc.files : [];

      return {
        _id: String(doc?._id || ""),
        transferId: String(doc?.transferId || "").trim(),
        targetLabName: String(doc?.targetLabName || "").trim(),
        transferMemo: String(doc?.transferMemo || "").trim(),
        status: String(doc?.status || "").trim() || "active",
        createdAt: doc?.createdAt || null,
        updatedAt: doc?.updatedAt || null,
        isRead: Boolean(doc?.requestorReadAt),
        requestorReadAt: doc?.requestorReadAt || null,
        practice: {
          businessName: String(practiceBusiness?.name || "").trim(),
          userName: String(practiceUser?.name || "").trim(),
        },
        fileCount: files.length,
        files: files.map((item, idx) => ({
          id: `${String(doc?._id || "")}::${idx + 1}`,
          patientName: String(item?.patientName || "").trim(),
          tooth: String(item?.tooth || "").trim(),
          originalName: String(item?.file?.originalName || "").trim(),
          mimetype: String(item?.file?.mimetype || "application/octet-stream").trim(),
          size: Number(item?.file?.size || 0),
          s3Key: String(item?.file?.s3Key || "").trim(),
        })),
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        transfers,
        unreadCount,
        pagination: {
          page,
          limit,
          count: transfers.length,
          total: totalCount,
          hasMore: skip + transfers.length < totalCount,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "치과 전송 수신 내역 조회 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

export async function getReceivedPracticeTransferUnreadCount(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (role !== "requestor" && role !== "admin") {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const { scope } = buildReceivedScope(req);
    if (scope === null) {
      return res.status(200).json({
        success: true,
        data: { unreadCount: 0 },
      });
    }

    const unreadCount = await PracticeTransfer.countDocuments({
      ...scope,
      status: { $ne: "canceled" },
      requestorReadAt: null,
    });

    return res.status(200).json({
      success: true,
      data: { unreadCount },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "치과 전송 미확인 건수 조회 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

export async function markReceivedPracticeTransferRead(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (role !== "requestor" && role !== "admin") {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const transferIdFilter = buildTransferIdFilter(req.params?.transferId);
    if (!transferIdFilter) {
      return res.status(400).json({
        success: false,
        message: "transferId가 필요합니다.",
      });
    }

    const { scope } = buildReceivedScope(req);
    if (scope === null) {
      return res.status(404).json({ success: false, message: "전송 내역을 찾을 수 없습니다." });
    }

    const doc = await PracticeTransfer.findOne({
      ...scope,
      ...transferIdFilter,
    });

    if (!doc) {
      return res.status(404).json({ success: false, message: "전송 내역을 찾을 수 없습니다." });
    }

    if (!doc.requestorReadAt) {
      doc.requestorReadAt = new Date();
      doc.requestorReadBy = req.user?._id || null;
      await doc.save();
    }

    const unreadCount = await PracticeTransfer.countDocuments({
      ...scope,
      status: { $ne: "canceled" },
      requestorReadAt: null,
    });

    const realtimePayload = {
      action: "read",
      transferId: String(doc.transferId || "").trim(),
      transferMongoId: String(doc._id || "").trim(),
      targetLabAnchorId: String(doc.targetLabAnchorId || "").trim() || null,
      practiceUserId: String(doc.practiceUserId || "").trim() || null,
      requestorReadAt: doc.requestorReadAt,
      unreadCount,
      status: String(doc.status || "active").trim(),
      updatedAt: doc.updatedAt || new Date(),
    };

    emitAppEventToUser(req.user?._id, "practice:transfer-updated", realtimePayload);
    emitAppEventToUser(doc.practiceUserId, "practice:transfer-updated", realtimePayload);

    await emitPracticeTransferEventToRequestorUsers({
      targetLabAnchorId: doc.targetLabAnchorId,
      type: "practice:transfer-updated",
      payload: realtimePayload,
    });

    return res.status(200).json({
      success: true,
      data: {
        transferId: String(doc.transferId || "").trim(),
        requestorReadAt: doc.requestorReadAt,
        unreadCount,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "치과 전송 확인 처리 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

export async function cancelPracticeTransfersBatch(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (role !== "practice" && role !== "admin") {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const transferIds = Array.isArray(req.body?.transferIds)
      ? req.body.transferIds.map((v) => String(v || "").trim()).filter(Boolean)
      : [];
    const transferMongoIds = Array.isArray(req.body?.transferMongoIds)
      ? req.body.transferMongoIds.map((v) => String(v || "").trim()).filter(Boolean)
      : [];

    if (transferIds.length === 0 && transferMongoIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "transferIds 또는 transferMongoIds가 필요합니다.",
      });
    }

    const filterOr = [];
    if (transferIds.length > 0) {
      filterOr.push({ transferId: { $in: transferIds } });
    }
    const validMongoIds = transferMongoIds.filter((id) => Types.ObjectId.isValid(id));
    if (validMongoIds.length > 0) {
      filterOr.push({ _id: { $in: validMongoIds.map((id) => new Types.ObjectId(id)) } });
    }

    const baseScope =
      role === "admin"
        ? {}
        : {
            practiceUserId: req.user?._id,
          };

    const docs = await PracticeTransfer.find({
      ...baseScope,
      $or: filterOr,
      status: { $ne: "canceled" },
    });

    let successCount = 0;
    const failedIds = [];
    const affectedByAnchor = new Map();

    for (const doc of docs) {
      try {
        doc.status = "canceled";
        doc.canceledAt = new Date();
        doc.canceledBy = req.user?._id || null;
        await doc.save();
        successCount += 1;

        const targetLabAnchorId = String(doc.targetLabAnchorId || "").trim();
        const transferId = String(doc.transferId || "").trim();
        const transferMongoId = String(doc._id || "").trim();

        if (targetLabAnchorId) {
          const prev = affectedByAnchor.get(targetLabAnchorId) || [];
          prev.push({ transferId, transferMongoId });
          affectedByAnchor.set(targetLabAnchorId, prev);
        }

        const realtimePayload = {
          action: "canceled",
          transferId,
          transferMongoId,
          targetLabAnchorId: targetLabAnchorId || null,
          practiceUserId: String(doc.practiceUserId || "").trim() || null,
          unreadCount: null,
          status: "canceled",
          updatedAt: doc.updatedAt || new Date(),
        };

        emitAppEventToUser(doc.practiceUserId, "practice:transfer-updated", realtimePayload);
      } catch {
        failedIds.push(String(doc?.transferId || doc?._id || ""));
      }
    }

    for (const [targetLabAnchorId, affected] of affectedByAnchor.entries()) {
      const unreadCount = await PracticeTransfer.countDocuments({
        targetLabAnchorId: new Types.ObjectId(targetLabAnchorId),
        status: { $ne: "canceled" },
        requestorReadAt: null,
      });

      await emitPracticeTransferEventToRequestorUsers({
        targetLabAnchorId,
        type: "practice:transfer-updated",
        payload: {
          action: "canceled",
          targetLabAnchorId,
          affectedTransfers: affected,
          unreadCount,
          status: "canceled",
          updatedAt: new Date(),
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        successCount,
        failedIds,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "practice 전송 취소 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

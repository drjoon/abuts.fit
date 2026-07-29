import { Types } from "mongoose";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import { emitAppEventToUser } from "../../socket.js";

// related files:
// - web/frontend/src/pages/practice/hooks/usePracticeTransferStep1.ts
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/backend/models/practiceTransfer.model.js
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

  return files.map((item, idx) => ({
    _id: `${String(transferDoc._id)}:${idx + 1}`,
    requestId: `${transferId}-${idx + 1}`,
    manufacturerStage: transferDoc?.status === "canceled" ? "취소" : "의뢰",
    createdAt: transferDoc?.createdAt,
    practiceTransferId: String(transferDoc?._id || ""),
    caseInfos: {
      clinicName: "",
      patientName: String(item?.patientName || "").trim(),
      tooth: String(item?.tooth || "").trim(),
      file: {
        originalName: String(item?.file?.originalName || "").trim(),
        name: String(item?.file?.originalName || "").trim(),
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

    const targetLabName =
      String(req.body?.targetLabName || "").trim() ||
      String(practiceRouting?.targetLabName || "").trim() ||
      extractLabNameFromMessage(message);

    const rawAnchorId =
      String(req.body?.targetLabAnchorId || "").trim() ||
      String(practiceRouting?.targetLabAnchorId || "").trim();

    const targetLabAnchorId = Types.ObjectId.isValid(rawAnchorId)
      ? new Types.ObjectId(rawAnchorId)
      : null;

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

    emitAppEventToUser(req.user?._id, "practice:transfer-created", {
      source: "createPracticeTransfer",
      transferId,
      transferMongoId: String(transferDoc?._id || ""),
      count: files.length,
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

    for (const doc of docs) {
      try {
        doc.status = "canceled";
        doc.canceledAt = new Date();
        doc.canceledBy = req.user?._id || null;
        await doc.save();
        successCount += 1;
      } catch {
        failedIds.push(String(doc?.transferId || doc?._id || ""));
      }
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

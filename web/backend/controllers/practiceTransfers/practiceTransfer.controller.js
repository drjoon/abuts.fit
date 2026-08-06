import { Types } from "mongoose";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import PracticeTransferDraft from "../../models/practiceTransferDraft.model.js";
import File from "../../models/file.model.js";
import User from "../../models/user.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import { emitAppEventToUser } from "../../socket.js";
import {
  getRequestPerfCacheValue,
  setRequestPerfCacheValue,
  deleteRequestPerfCacheValue,
  withRequestPerfInFlight,
} from "../../services/requestDashboardCache.service.js";

// related files:
// - web/frontend/src/pages/practice/hooks/usePracticeTransferStep1.ts
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
// - web/backend/models/practiceTransfer.model.js
// - web/backend/models/practiceTransferDraft.model.js
// - web/backend/models/file.model.js
// - web/backend/models/user.model.js
// - web/backend/models/businessAnchor.model.js
// - web/backend/socket.js
// - web/backend/services/requestDashboardCache.service.js
const PRACTICE_TAGS = ["practice_dropzone", "practice_file_transfer"];
const PRACTICE_ALLOWED_MODEL_EXTENSIONS = new Set([".stl", ".ply", ".obj"]);
const PRACTICE_ALLOWED_IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".bmp",
  ".gif",
]);
const PRACTICE_ALLOWED_EXTENSIONS = new Set([
  ...PRACTICE_ALLOWED_MODEL_EXTENSIONS,
  ...PRACTICE_ALLOWED_IMAGE_EXTENSIONS,
]);

const unreadCountCacheKey = (scope) => {
  if (!scope || typeof scope !== "object") return "practice-unread:admin";
  const labId = scope.targetLabAnchorId
    ? String(scope.targetLabAnchorId)
    : "all";
  return `practice-unread:${labId}`;
};

const invalidateUnreadCountCache = (scope) => {
  deleteRequestPerfCacheValue(unreadCountCacheKey(scope));
};

const getLowerExt = (filename) => {
  const raw = String(filename || "").trim().toLowerCase();
  const idx = raw.lastIndexOf(".");
  if (idx < 0) return "";
  return raw.slice(idx);
};

const isAllowedPracticeFile = (filename) =>
  PRACTICE_ALLOWED_EXTENSIONS.has(getLowerExt(filename));

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
      : transferDoc?.requestorDownloadedAt
        ? "다운로드완료"
        : transferDoc?.requestorReadAt
          ? "수신완료"
          : "발송완료";

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

const toDraftResponse = (doc, ownerMeta = null) => {
  if (!doc) return null;
  const files = Array.isArray(doc.files) ? doc.files : [];
  const practiceUserId = String(doc.practiceUserId || "").trim() || null;
  const staffName = String(
    ownerMeta?.practiceProfile?.staffName ||
      ownerMeta?.name ||
      ownerMeta?.email ||
      "",
  ).trim();

  return {
    _id: String(doc._id || ""),
    practiceUserId,
    practiceUserLabel: staffName || practiceUserId || "",
    targetLabAnchorId: String(doc.targetLabAnchorId || "").trim() || null,
    targetLabName: String(doc.targetLabName || "").trim(),
    transferMemo: String(doc.transferMemo || "").trim(),
    files: files
      .map((row) => ({
        fileId: String(row?.fileId || "").trim(),
        originalName: String(row?.originalName || "").trim(),
        mimetype: String(row?.mimetype || "application/octet-stream").trim(),
        size: Number(row?.size || 0),
        s3Key: String(row?.s3Key || "").trim(),
        location: String(row?.location || "").trim(),
      }))
      .filter((row) => row.fileId && row.originalName && row.s3Key),
    deletedAt: doc.deletedAt || null,
    updatedAt: doc.updatedAt || null,
    createdAt: doc.createdAt || null,
  };
};

/** draft-upserted 실시간 이벤트에 폼 스냅샷을 실어 수신측 GET RTT를 제거한다. */
const toDraftUpsertedRealtimePayload = ({
  source,
  draftPayload,
  practiceUserId,
  editorUserId,
  practiceBusinessAnchorId,
  forceResync = false,
}) => ({
  source: String(source || "").trim(),
  action: "draft-upserted",
  draftId: draftPayload?._id || null,
  practiceUserId: String(practiceUserId || "").trim(),
  editorUserId: String(editorUserId || "").trim() || null,
  practiceUserLabel: draftPayload?.practiceUserLabel || "",
  practiceBusinessAnchorId:
    String(practiceBusinessAnchorId || "").trim() || null,
  targetLabAnchorId: draftPayload?.targetLabAnchorId || null,
  targetLabName: draftPayload?.targetLabName || "",
  transferMemo: String(draftPayload?.transferMemo || ""),
  files: Array.isArray(draftPayload?.files) ? draftPayload.files : [],
  fileCount: Array.isArray(draftPayload?.files) ? draftPayload.files.length : 0,
  updatedAt: draftPayload?.updatedAt || null,
  createdAt: draftPayload?.createdAt || null,
  forceResync: Boolean(forceResync),
});

let draftIndexEnsurePromise = null;
const ensurePracticeTransferDraftIndexes = async () => {
  if (draftIndexEnsurePromise) return draftIndexEnsurePromise;
  draftIndexEnsurePromise = (async () => {
    try {
      // 레거시 전체 unique(practiceUserId_1)가 있으면 soft-delete와 충돌하므로 제거
      await PracticeTransferDraft.collection.dropIndex("practiceUserId_1");
    } catch {
      // ignore (없거나 이름 다름)
    }
    try {
      await PracticeTransferDraft.syncIndexes();
    } catch (error) {
      console.warn("[practice-transfer-draft] syncIndexes failed:", error?.message || error);
    }
  })();
  return draftIndexEnsurePromise;
};

const loadDraftOwnerMetaByIds = async (userIds) => {
  const ids = [
    ...new Set(
      (Array.isArray(userIds) ? userIds : [])
        .map((id) => String(id || "").trim())
        .filter((id) => Types.ObjectId.isValid(id)),
    ),
  ];
  if (ids.length === 0) return new Map();

  const users = await User.find({
    _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
  })
    .select({
      _id: 1,
      name: 1,
      email: 1,
      "practiceProfile.staffName": 1,
    })
    .lean();

  return new Map(users.map((u) => [String(u?._id || "").trim(), u]));
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

const resolvePracticeUserIdsByAnchor = async (anchorId) => {
  const raw = String(anchorId || "").trim();
  if (!raw || !Types.ObjectId.isValid(raw)) return [];

  const users = await User.find({
    businessAnchorId: new Types.ObjectId(raw),
    role: "practice",
    active: true,
  })
    .select({ _id: 1 })
    .lean();

  return users
    .map((u) => String(u?._id || "").trim())
    .filter(Boolean);
};

/**
 * practice 전송 목록/취소/복구/임시저장 권한 범위.
 * 동일 치과(businessAnchor) 구성원은 동료 전송·임시저장을 공유한다.
 * - 문서의 practiceBusinessAnchorId 일치
 * - 또는 동일 치과 practice 멤버가 업로드한 레거시(앵커 미기입) 문서
 * 앵커가 없는 계정은 업로더 본인만 포함한다.
 */
const buildPracticeOwnedScope = async (req) => {
  const role = String(req.user?.role || "").trim();
  if (role === "admin") {
    return {
      role,
      scope: {},
      practiceUserObjectIds: req.user?._id ? [req.user._id] : [],
    };
  }

  const practiceUserId = req.user?._id || null;
  const practiceBusinessAnchorId = String(req.user?.businessAnchorId || "").trim();
  if (
    practiceBusinessAnchorId &&
    Types.ObjectId.isValid(practiceBusinessAnchorId)
  ) {
    const peerUserIds = await resolvePracticeUserIdsByAnchor(
      practiceBusinessAnchorId,
    );
    const practiceUserObjectIds = Array.from(
      new Set(
        [String(practiceUserId || "").trim(), ...peerUserIds].filter(Boolean),
      ),
    )
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    return {
      role,
      scope: {
        $or: [
          {
            practiceBusinessAnchorId: new Types.ObjectId(
              practiceBusinessAnchorId,
            ),
          },
          ...(practiceUserObjectIds.length
            ? [{ practiceUserId: { $in: practiceUserObjectIds } }]
            : [{ practiceUserId }]),
        ],
      },
      practiceUserObjectIds,
    };
  }

  return {
    role,
    scope: { practiceUserId },
    practiceUserObjectIds: practiceUserId ? [practiceUserId] : [],
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

const emitPracticeTransferEventToPracticeUsers = async ({
  practiceBusinessAnchorId,
  type,
  payload,
  extraUserIds = [],
}) => {
  try {
    const eventType = String(type || "").trim();
    if (!eventType) return;

    const userIdSet = new Set([
      ...(await resolvePracticeUserIdsByAnchor(practiceBusinessAnchorId)),
      ...extraUserIds
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    ]);
    if (!userIdSet.size) return;

    userIdSet.forEach((userId) => {
      emitAppEventToUser(userId, eventType, payload);
    });
  } catch {
    // 실시간 이벤트 실패가 본 API 성공/실패를 좌우하지 않도록 무시
  }
};

export async function getMyPracticeTransferDraft(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (role !== "practice" && role !== "admin") {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    await ensurePracticeTransferDraftIndexes();

    const rawDraftId = String(req.query?.draftId || "").trim();
    let doc = null;
    let ownerMeta = req.user;

    if (rawDraftId && Types.ObjectId.isValid(rawDraftId)) {
      // 같은 케이스(불러온 임시저장) 조회: 동일 치과 범위 draft (휴지통 제외)
      const { scope } = await buildPracticeOwnedScope(req);
      doc = await PracticeTransferDraft.findOne({
        _id: new Types.ObjectId(rawDraftId),
        deletedAt: null,
        ...scope,
      }).lean();
      if (doc?.practiceUserId) {
        const ownerMap = await loadDraftOwnerMetaByIds([doc.practiceUserId]);
        ownerMeta =
          ownerMap.get(String(doc.practiceUserId || "").trim()) || req.user;
      }
    } else {
      // 기본: 본인이 만든 활성 draft
      doc = await PracticeTransferDraft.findOne({
        practiceUserId: req.user?._id,
        deletedAt: null,
      }).lean();
    }

    return res.status(200).json({
      success: true,
      data: toDraftResponse(doc, ownerMeta),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "practice 전송 임시저장 조회 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

export async function listPracticeTransferDrafts(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (role !== "practice" && role !== "admin") {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    await ensurePracticeTransferDraftIndexes();

    const trashed =
      String(req.query?.trashed || "").trim() === "1" ||
      String(req.query?.trashed || "").trim().toLowerCase() === "true";

    const { scope } = await buildPracticeOwnedScope(req);
    const docs = await PracticeTransferDraft.find({
      ...scope,
      ...(trashed ? { deletedAt: { $ne: null } } : { deletedAt: null }),
    })
      .sort({ updatedAt: -1, _id: -1 })
      .lean();

    const ownerMap = await loadDraftOwnerMetaByIds(
      docs.map((doc) => doc?.practiceUserId),
    );

    return res.status(200).json({
      success: true,
      data: docs
        .map((doc) =>
          toDraftResponse(
            doc,
            ownerMap.get(String(doc?.practiceUserId || "").trim()) || null,
          ),
        )
        .filter(Boolean),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "practice 전송 임시저장 목록 조회 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

export async function upsertPracticeTransferDraft(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (role !== "practice" && role !== "admin") {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const targetLabName = String(req.body?.targetLabName || "").trim();
    const transferMemo = String(req.body?.transferMemo || "").trim();
    const rawAnchorId = String(req.body?.targetLabAnchorId || "").trim();
    const targetLabAnchorId = Types.ObjectId.isValid(rawAnchorId)
      ? new Types.ObjectId(rawAnchorId)
      : null;

    const incomingFiles = Array.isArray(req.body?.files) ? req.body.files : [];
    // transferMemo는 날짜 메타만으로도 비어있지 않을 수 있어, 실질 내용 여부를 본다.
    const memoText = String(transferMemo || "");
    const hasMeaningfulMemo =
      /\[\s*환자명\s*:\s*[^\]]+\s*\]/.test(memoText) ||
      /\[\s*치아보철\s*:\s*[^\]]+\s*\]/.test(memoText) ||
      Boolean(
        memoText
          .split(/\r?\n/)
          .map((line) => String(line || "").trim())
          .filter((line) => line && !/^\[/.test(line))
          .join("")
          .trim(),
      );
    const hasFormContent =
      hasMeaningfulMemo ||
      Boolean(targetLabName) ||
      Boolean(targetLabAnchorId);

    let normalizedDraftFiles = [];

    if (incomingFiles.length === 0) {
      if (!hasFormContent) {
        return res.status(400).json({
          success: false,
          message: "임시저장할 파일 또는 의뢰서 내용이 없습니다.",
        });
      }
    } else {
      const uniqueFileIds = [
        ...new Set(
          incomingFiles
            .map((row) => String(row?.fileId || row?._id || "").trim())
            .filter((id) => Types.ObjectId.isValid(id)),
        ),
      ];

      if (uniqueFileIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "유효한 임시 파일 ID가 없습니다.",
        });
      }

      const { practiceUserObjectIds } = await buildPracticeOwnedScope(req);
      const ownerIds = (practiceUserObjectIds || [])
        .map((id) => String(id || "").trim())
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id));
      if (req.user?._id && Types.ObjectId.isValid(String(req.user._id))) {
        const selfId = String(req.user._id);
        if (!ownerIds.some((id) => String(id) === selfId)) {
          ownerIds.push(new Types.ObjectId(selfId));
        }
      }

      const ownedFiles = await File.find({
        _id: { $in: uniqueFileIds.map((id) => new Types.ObjectId(id)) },
        ...(ownerIds.length ? { uploadedBy: { $in: ownerIds } } : { uploadedBy: req.user?._id }),
      })
        .select({
          _id: 1,
          originalName: 1,
          mimetype: 1,
          size: 1,
          key: 1,
          location: 1,
        })
        .lean();

      const ownedById = new Map(
        ownedFiles.map((row) => [String(row?._id || "").trim(), row]),
      );

      normalizedDraftFiles = uniqueFileIds
        .map((id) => {
          const row = ownedById.get(id);
          if (!row) return null;
          return {
            fileId: row._id,
            originalName: String(row.originalName || "").trim(),
            mimetype: String(row.mimetype || "application/octet-stream").trim(),
            size: Number(row.size || 0),
            s3Key: String(row.key || "").trim(),
            location: String(row.location || "").trim(),
          };
        })
        .filter((row) => Boolean(row?.originalName) && Boolean(row?.s3Key));

      if (normalizedDraftFiles.length === 0) {
        return res.status(400).json({
          success: false,
          message: "사용 가능한 임시 파일을 찾지 못했습니다.",
        });
      }
    }

    const rawDraftId = String(req.body?.draftId || "").trim();
    let doc = null;

    await ensurePracticeTransferDraftIndexes();

    if (rawDraftId && Types.ObjectId.isValid(rawDraftId)) {
      // 불러온 임시저장(같은 케이스)에 join: 소유자는 유지하고 내용만 갱신
      const { scope } = await buildPracticeOwnedScope(req);
      const existing = await PracticeTransferDraft.findOne({
        _id: new Types.ObjectId(rawDraftId),
        deletedAt: null,
        ...scope,
      })
        .select({ _id: 1, practiceUserId: 1 })
        .lean();

      if (!existing?._id) {
        return res.status(404).json({
          success: false,
          message: "이어서 작성할 임시저장을 찾지 못했습니다.",
        });
      }

      doc = await PracticeTransferDraft.findOneAndUpdate(
        { _id: existing._id, deletedAt: null },
        {
          $set: {
            practiceBusinessAnchorId: req.user?.businessAnchorId || null,
            targetLabAnchorId,
            targetLabName,
            transferMemo,
            files: normalizedDraftFiles,
          },
        },
        { new: true },
      ).lean();
    } else {
      // 새 케이스 / 본인 활성 draft upsert (휴지통 건과 분리)
      doc = await PracticeTransferDraft.findOneAndUpdate(
        { practiceUserId: req.user?._id, deletedAt: null },
        {
          $set: {
            practiceUserId: req.user?._id,
            practiceBusinessAnchorId: req.user?.businessAnchorId || null,
            targetLabAnchorId,
            targetLabName,
            transferMemo,
            files: normalizedDraftFiles,
            deletedAt: null,
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        },
      ).lean();
    }

    const ownerMap = await loadDraftOwnerMetaByIds([doc?.practiceUserId]);
    const ownerMeta =
      ownerMap.get(String(doc?.practiceUserId || "").trim()) || req.user;
    const draftPayload = toDraftResponse(doc, ownerMeta);
    const forceResync = Boolean(req.body?.forceResync);
    await emitPracticeTransferEventToPracticeUsers({
      practiceBusinessAnchorId: req.user?.businessAnchorId,
      type: "practice:transfer-updated",
      payload: toDraftUpsertedRealtimePayload({
        source: "upsertPracticeTransferDraft",
        draftPayload,
        practiceUserId: doc?.practiceUserId || req.user?._id,
        editorUserId: req.user?._id,
        practiceBusinessAnchorId: req.user?.businessAnchorId,
        forceResync,
      }),
      extraUserIds: [req.user?._id],
    });

    return res.status(200).json({
      success: true,
      message: "practice 전송 임시저장을 갱신했습니다.",
      data: {
        ...draftPayload,
        forceResync,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "practice 전송 임시저장 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

export async function clearMyPracticeTransferDraft(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (role !== "practice" && role !== "admin") {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    await ensurePracticeTransferDraftIndexes();

    // 소프트 삭제(휴지통). draftId가 오면 동일 치과 범위의 해당 draft.
    const rawDraftId = String(req.body?.draftId || req.query?.draftId || "").trim();
    const now = new Date();
    let clearedDoc = null;

    if (rawDraftId && Types.ObjectId.isValid(rawDraftId)) {
      const { scope } = await buildPracticeOwnedScope(req);
      clearedDoc = await PracticeTransferDraft.findOneAndUpdate(
        {
          _id: new Types.ObjectId(rawDraftId),
          deletedAt: null,
          ...scope,
        },
        { $set: { deletedAt: now } },
        { new: true },
      )
        .select({ _id: 1, practiceUserId: 1, deletedAt: 1 })
        .lean();
    } else {
      clearedDoc = await PracticeTransferDraft.findOneAndUpdate(
        { practiceUserId: req.user?._id, deletedAt: null },
        { $set: { deletedAt: now } },
        { new: true },
      )
        .select({ _id: 1, practiceUserId: 1, deletedAt: 1 })
        .lean();
    }

    const clearedDraftId = clearedDoc?._id ? String(clearedDoc._id) : null;
    if (clearedDraftId) {
      await emitPracticeTransferEventToPracticeUsers({
        practiceBusinessAnchorId: req.user?.businessAnchorId,
        type: "practice:transfer-updated",
        payload: {
          source: "clearMyPracticeTransferDraft",
          action: "draft-cleared",
          draftId: clearedDraftId,
          practiceUserId: String(
            clearedDoc?.practiceUserId || req.user?._id || "",
          ),
          practiceBusinessAnchorId:
            String(req.user?.businessAnchorId || "").trim() || null,
        },
        extraUserIds: [req.user?._id],
      });
    }

    return res.status(200).json({
      success: true,
      message: "practice 전송 임시저장을 휴지통으로 옮겼습니다.",
      data: clearedDoc ? toDraftResponse(clearedDoc, req.user) : null,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "practice 전송 임시저장 삭제 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

export async function restorePracticeTransferDraft(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (role !== "practice" && role !== "admin") {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    await ensurePracticeTransferDraftIndexes();

    const rawDraftId = String(req.body?.draftId || req.query?.draftId || "").trim();
    if (!rawDraftId || !Types.ObjectId.isValid(rawDraftId)) {
      return res.status(400).json({ success: false, message: "draftId가 필요합니다." });
    }

    const { scope } = await buildPracticeOwnedScope(req);
    const trashed = await PracticeTransferDraft.findOne({
      _id: new Types.ObjectId(rawDraftId),
      deletedAt: { $ne: null },
      ...scope,
    }).lean();

    if (!trashed?._id) {
      return res.status(404).json({
        success: false,
        message: "휴지통에서 임시저장을 찾지 못했습니다.",
      });
    }

    const ownerId = trashed.practiceUserId;
    // 동일 소유자의 활성 draft가 있으면 그 건을 휴지통으로 보내고 복구(사용자당 활성 1건)
    if (ownerId) {
      await PracticeTransferDraft.updateMany(
        {
          practiceUserId: ownerId,
          deletedAt: null,
          _id: { $ne: trashed._id },
        },
        { $set: { deletedAt: new Date() } },
      );
    }

    const restored = await PracticeTransferDraft.findOneAndUpdate(
      { _id: trashed._id },
      { $set: { deletedAt: null } },
      { new: true },
    ).lean();

    const ownerMap = await loadDraftOwnerMetaByIds([restored?.practiceUserId]);
    const ownerMeta =
      ownerMap.get(String(restored?.practiceUserId || "").trim()) || req.user;
    const draftPayload = toDraftResponse(restored, ownerMeta);

    await emitPracticeTransferEventToPracticeUsers({
      practiceBusinessAnchorId: req.user?.businessAnchorId,
      type: "practice:transfer-updated",
      payload: toDraftUpsertedRealtimePayload({
        source: "restorePracticeTransferDraft",
        draftPayload,
        practiceUserId: restored?.practiceUserId || req.user?._id,
        editorUserId: req.user?._id,
        practiceBusinessAnchorId: req.user?.businessAnchorId,
      }),
      extraUserIds: [req.user?._id],
    });

    return res.status(200).json({
      success: true,
      message: "임시저장을 복구했습니다.",
      data: draftPayload,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "practice 전송 임시저장 복구 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

export async function emptyPracticeTransferTrash(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (role !== "practice" && role !== "admin") {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    await ensurePracticeTransferDraftIndexes();

    const { scope: baseScope } = await buildPracticeOwnedScope(req);

    const [trashedDrafts, canceledTransfers] = await Promise.all([
      PracticeTransferDraft.find({
        ...baseScope,
        deletedAt: { $ne: null },
      })
        .select({ _id: 1, practiceUserId: 1 })
        .lean(),
      PracticeTransfer.find({
        $and: [baseScope, { status: "canceled" }],
      })
        .select({
          _id: 1,
          transferId: 1,
          practiceUserId: 1,
          practiceBusinessAnchorId: 1,
          targetLabAnchorId: 1,
        })
        .lean(),
    ]);

    const draftIds = trashedDrafts
      .map((doc) => String(doc?._id || "").trim())
      .filter(Boolean);
    const transferMongoIds = canceledTransfers
      .map((doc) => String(doc?._id || "").trim())
      .filter(Boolean);

    if (draftIds.length > 0) {
      await PracticeTransferDraft.deleteMany({
        _id: {
          $in: draftIds
            .filter((id) => Types.ObjectId.isValid(id))
            .map((id) => new Types.ObjectId(id)),
        },
      });
    }

    if (transferMongoIds.length > 0) {
      await PracticeTransfer.deleteMany({
        _id: {
          $in: transferMongoIds
            .filter((id) => Types.ObjectId.isValid(id))
            .map((id) => new Types.ObjectId(id)),
        },
      });
    }

    const affectedByAnchor = new Map();
    for (const doc of canceledTransfers) {
      const targetLabAnchorId = String(doc?.targetLabAnchorId || "").trim();
      const transferId = String(doc?.transferId || "").trim();
      const transferMongoId = String(doc?._id || "").trim();
      if (!targetLabAnchorId) continue;
      const prev = affectedByAnchor.get(targetLabAnchorId) || [];
      prev.push({ transferId, transferMongoId });
      affectedByAnchor.set(targetLabAnchorId, prev);
    }

    for (const [targetLabAnchorId, affected] of affectedByAnchor.entries()) {
      const scope = {
        targetLabAnchorId: new Types.ObjectId(targetLabAnchorId),
      };
      invalidateUnreadCountCache(scope);
      const unreadCount = await PracticeTransfer.countDocuments({
        ...scope,
        status: { $ne: "canceled" },
        requestorReadAt: null,
      });
      setRequestPerfCacheValue(
        unreadCountCacheKey(scope),
        { unreadCount },
        10 * 1000,
      );

      await emitPracticeTransferEventToRequestorUsers({
        targetLabAnchorId,
        type: "practice:transfer-updated",
        payload: {
          action: "purged",
          targetLabAnchorId,
          affectedTransfers: affected,
          unreadCount,
          status: "deleted",
          updatedAt: new Date(),
        },
      });
    }

    await emitPracticeTransferEventToPracticeUsers({
      practiceBusinessAnchorId: req.user?.businessAnchorId,
      type: "practice:transfer-updated",
      payload: {
        source: "emptyPracticeTransferTrash",
        action: "trash-emptied",
        draftIds,
        transferMongoIds,
        draftDeletedCount: draftIds.length,
        transferDeletedCount: transferMongoIds.length,
        practiceBusinessAnchorId:
          String(req.user?.businessAnchorId || "").trim() || null,
        updatedAt: new Date(),
      },
      extraUserIds: [req.user?._id],
    });

    return res.status(200).json({
      success: true,
      message: "휴지통을 비웠습니다.",
      data: {
        draftDeletedCount: draftIds.length,
        transferDeletedCount: transferMongoIds.length,
        draftIds,
        transferMongoIds,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "휴지통 비우기 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

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
        if (!isAllowedPracticeFile(originalName)) return null;

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
        message: "저장할 3D 모델 또는 그림 파일이 없습니다.",
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

    // 전송 성공 시 해당 임시저장은 완전 삭제(휴지통 아님). 최근 전송 내역만 남긴다.
    const rawDraftId = String(req.body?.draftId || "").trim();
    let clearedDraftId = null;
    try {
      let clearedDoc = null;
      if (rawDraftId && Types.ObjectId.isValid(rawDraftId)) {
        const { scope } = await buildPracticeOwnedScope(req);
        clearedDoc = await PracticeTransferDraft.findOneAndDelete({
          _id: new Types.ObjectId(rawDraftId),
          ...scope,
        })
          .select({ _id: 1, practiceUserId: 1 })
          .lean();
      } else if (req.user?._id) {
        clearedDoc = await PracticeTransferDraft.findOneAndDelete({
          practiceUserId: req.user._id,
          deletedAt: null,
        })
          .select({ _id: 1, practiceUserId: 1 })
          .lean();
      }
      clearedDraftId = clearedDoc?._id ? String(clearedDoc._id) : null;
    } catch {
      // 전송 자체는 성공 유지. draft 정리는 프론트에서 재시도할 수 있음.
    }

    const targetLabAnchorIdText = String(targetLabAnchorId || "").trim();
    if (targetLabAnchorIdText) {
      invalidateUnreadCountCache({
        targetLabAnchorId: new Types.ObjectId(targetLabAnchorIdText),
      });
    }
    const unreadCountForRequestor = targetLabAnchorIdText
      ? await PracticeTransfer.countDocuments({
          targetLabAnchorId: new Types.ObjectId(targetLabAnchorIdText),
          status: { $ne: "canceled" },
          requestorReadAt: null,
        })
      : 0;
    if (targetLabAnchorIdText) {
      setRequestPerfCacheValue(
        unreadCountCacheKey({
          targetLabAnchorId: new Types.ObjectId(targetLabAnchorIdText),
        }),
        { unreadCount: unreadCountForRequestor },
        10 * 1000,
      );
    }

    const realtimePayload = {
      source: "createPracticeTransfer",
      transferId,
      transferMongoId: String(transferDoc?._id || ""),
      targetLabAnchorId: targetLabAnchorIdText || null,
      practiceUserId: String(req.user?._id || ""),
      clearedDraftId,
      status: "active",
      count: files.length,
      unreadCount: unreadCountForRequestor,
      createdAt: transferDoc?.createdAt || new Date(),
    };

    await emitPracticeTransferEventToPracticeUsers({
      practiceBusinessAnchorId: req.user?.businessAnchorId,
      type: "practice:transfer-created",
      payload: realtimePayload,
      extraUserIds: [req.user?._id],
    });

    if (clearedDraftId) {
      await emitPracticeTransferEventToPracticeUsers({
        practiceBusinessAnchorId: req.user?.businessAnchorId,
        type: "practice:transfer-updated",
        payload: {
          source: "createPracticeTransfer",
          action: "draft-cleared",
          draftId: clearedDraftId,
          practiceUserId: String(req.user?._id || ""),
          practiceBusinessAnchorId:
            String(req.user?.businessAnchorId || "").trim() || null,
        },
        extraUserIds: [req.user?._id],
      });
    }

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
        clearedDraftId,
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

    const { scope: baseFilter } = await buildPracticeOwnedScope(req);

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
        isDownloaded: Boolean(doc?.requestorDownloadedAt),
        requestorDownloadedAt: doc?.requestorDownloadedAt || null,
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

    const cacheKey = unreadCountCacheKey(scope);
    const cached = getRequestPerfCacheValue(cacheKey);
    if (cached && typeof cached.unreadCount === "number") {
      return res.status(200).json({
        success: true,
        data: { unreadCount: cached.unreadCount },
      });
    }

    const unreadCount = await withRequestPerfInFlight(cacheKey, async () => {
      const count = await PracticeTransfer.countDocuments({
        ...scope,
        status: { $ne: "canceled" },
        requestorReadAt: null,
      });
      setRequestPerfCacheValue(cacheKey, { unreadCount: count }, 10 * 1000);
      return count;
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
      invalidateUnreadCountCache(scope);
    }

    const unreadCount = await PracticeTransfer.countDocuments({
      ...scope,
      status: { $ne: "canceled" },
      requestorReadAt: null,
    });
    setRequestPerfCacheValue(unreadCountCacheKey(scope), { unreadCount }, 10 * 1000);

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

    await emitPracticeTransferEventToPracticeUsers({
      practiceBusinessAnchorId: doc.practiceBusinessAnchorId,
      type: "practice:transfer-updated",
      payload: realtimePayload,
      extraUserIds: [doc.practiceUserId],
    });

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
        requestorDownloadedAt: doc.requestorDownloadedAt || null,
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

export async function markReceivedPracticeTransferDownloaded(req, res) {
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

    const now = new Date();
    let didChangeRead = false;
    if (!doc.requestorReadAt) {
      doc.requestorReadAt = now;
      doc.requestorReadBy = req.user?._id || null;
      didChangeRead = true;
    }
    if (!doc.requestorDownloadedAt) {
      doc.requestorDownloadedAt = now;
      doc.requestorDownloadedBy = req.user?._id || null;
      await doc.save();
    } else if (didChangeRead) {
      await doc.save();
    }

    if (didChangeRead) {
      invalidateUnreadCountCache(scope);
    }

    const unreadCount = await PracticeTransfer.countDocuments({
      ...scope,
      status: { $ne: "canceled" },
      requestorReadAt: null,
    });
    setRequestPerfCacheValue(unreadCountCacheKey(scope), { unreadCount }, 10 * 1000);

    const realtimePayload = {
      action: "downloaded",
      transferId: String(doc.transferId || "").trim(),
      transferMongoId: String(doc._id || "").trim(),
      targetLabAnchorId: String(doc.targetLabAnchorId || "").trim() || null,
      practiceUserId: String(doc.practiceUserId || "").trim() || null,
      requestorReadAt: doc.requestorReadAt,
      requestorDownloadedAt: doc.requestorDownloadedAt,
      unreadCount,
      status: String(doc.status || "active").trim(),
      updatedAt: doc.updatedAt || new Date(),
    };

    emitAppEventToUser(req.user?._id, "practice:transfer-updated", realtimePayload);

    await emitPracticeTransferEventToPracticeUsers({
      practiceBusinessAnchorId: doc.practiceBusinessAnchorId,
      type: "practice:transfer-updated",
      payload: realtimePayload,
      extraUserIds: [doc.practiceUserId],
    });

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
        requestorDownloadedAt: doc.requestorDownloadedAt,
        unreadCount,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "치과 전송 다운로드 완료 처리 중 오류가 발생했습니다.",
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

    // 모든 식별자가 무효하면 빈 $or 쿼리를 만들지 말고 요청 자체를 거절한다.
    if (filterOr.length === 0) {
      return res.status(400).json({
        success: false,
        message: "유효한 transferIds 또는 transferMongoIds가 필요합니다.",
      });
    }

    const { scope: baseScope } = await buildPracticeOwnedScope(req);

    const docs = await PracticeTransfer.find({
      $and: [baseScope, { $or: filterOr }, { status: { $ne: "canceled" } }],
    });

    let successCount = 0;
    const failedIds = [];
    const affectedByAnchor = new Map();

    // 요청했지만 scope/status 조건에서 찾지 못한 ID는 실패 목록에 반환한다.
    const foundTransferIdSet = new Set(
      docs.map((doc) => String(doc?.transferId || "").trim()).filter(Boolean),
    );
    const foundTransferMongoIdSet = new Set(
      docs.map((doc) => String(doc?._id || "").trim()).filter(Boolean),
    );
    for (const transferId of transferIds) {
      if (!foundTransferIdSet.has(transferId)) {
        failedIds.push(transferId);
      }
    }
    for (const transferMongoId of transferMongoIds) {
      if (!Types.ObjectId.isValid(transferMongoId)) {
        failedIds.push(transferMongoId);
        continue;
      }
      if (!foundTransferMongoIdSet.has(transferMongoId)) {
        failedIds.push(transferMongoId);
      }
    }

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

        await emitPracticeTransferEventToPracticeUsers({
          practiceBusinessAnchorId: doc.practiceBusinessAnchorId,
          type: "practice:transfer-updated",
          payload: realtimePayload,
          extraUserIds: [doc.practiceUserId],
        });
      } catch {
        failedIds.push(String(doc?.transferId || doc?._id || ""));
      }
    }

    for (const [targetLabAnchorId, affected] of affectedByAnchor.entries()) {
      const scope = {
        targetLabAnchorId: new Types.ObjectId(targetLabAnchorId),
      };
      invalidateUnreadCountCache(scope);
      const unreadCount = await PracticeTransfer.countDocuments({
        ...scope,
        status: { $ne: "canceled" },
        requestorReadAt: null,
      });
      setRequestPerfCacheValue(
        unreadCountCacheKey(scope),
        { unreadCount },
        10 * 1000,
      );

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
        failedIds: Array.from(new Set(failedIds.filter(Boolean))),
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

export async function restorePracticeTransfersBatch(req, res) {
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

    if (filterOr.length === 0) {
      return res.status(400).json({
        success: false,
        message: "유효한 transferIds 또는 transferMongoIds가 필요합니다.",
      });
    }

    const { scope: baseScope } = await buildPracticeOwnedScope(req);

    const docs = await PracticeTransfer.find({
      $and: [baseScope, { $or: filterOr }, { status: "canceled" }],
    });

    let successCount = 0;
    const failedIds = [];
    const affectedByAnchor = new Map();

    const foundTransferIdSet = new Set(
      docs.map((doc) => String(doc?.transferId || "").trim()).filter(Boolean),
    );
    const foundTransferMongoIdSet = new Set(
      docs.map((doc) => String(doc?._id || "").trim()).filter(Boolean),
    );
    for (const transferId of transferIds) {
      if (!foundTransferIdSet.has(transferId)) {
        failedIds.push(transferId);
      }
    }
    for (const transferMongoId of transferMongoIds) {
      if (!Types.ObjectId.isValid(transferMongoId)) {
        failedIds.push(transferMongoId);
        continue;
      }
      if (!foundTransferMongoIdSet.has(transferMongoId)) {
        failedIds.push(transferMongoId);
      }
    }

    for (const doc of docs) {
      try {
        doc.status = "active";
        doc.canceledAt = null;
        doc.canceledBy = null;
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
          action: "restored",
          transferId,
          transferMongoId,
          targetLabAnchorId: targetLabAnchorId || null,
          practiceUserId: String(doc.practiceUserId || "").trim() || null,
          unreadCount: null,
          status: "active",
          updatedAt: doc.updatedAt || new Date(),
        };

        await emitPracticeTransferEventToPracticeUsers({
          practiceBusinessAnchorId: doc.practiceBusinessAnchorId,
          type: "practice:transfer-updated",
          payload: realtimePayload,
          extraUserIds: [doc.practiceUserId],
        });
      } catch {
        failedIds.push(String(doc?.transferId || doc?._id || ""));
      }
    }

    for (const [targetLabAnchorId, affected] of affectedByAnchor.entries()) {
      const scope = {
        targetLabAnchorId: new Types.ObjectId(targetLabAnchorId),
      };
      invalidateUnreadCountCache(scope);
      const unreadCount = await PracticeTransfer.countDocuments({
        ...scope,
        status: { $ne: "canceled" },
        requestorReadAt: null,
      });
      setRequestPerfCacheValue(
        unreadCountCacheKey(scope),
        { unreadCount },
        10 * 1000,
      );

      await emitPracticeTransferEventToRequestorUsers({
        targetLabAnchorId,
        type: "practice:transfer-updated",
        payload: {
          action: "restored",
          targetLabAnchorId,
          affectedTransfers: affected,
          unreadCount,
          status: "active",
          updatedAt: new Date(),
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        successCount,
        failedIds: Array.from(new Set(failedIds.filter(Boolean))),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "practice 전송 복구 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

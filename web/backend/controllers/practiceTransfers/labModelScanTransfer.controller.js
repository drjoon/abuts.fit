// related files:
// - web/backend/models/practiceTransfer.model.js
// - web/backend/models/businessAnchor.model.js
// - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
// - docs/intent/lab-oral-scan-opens-practice-transfer.md
// - 2026-11-28: 치과명은 선택. 모델스캔 파일(DCM·PLY·STL·OBJ·ExoCAD·3Shape)이 없으면 등록하지 않음. 리메이크 체크.
// - 2026-11-28: 기공소 「모델스캔으로 의뢰하기」— PTX 생성·치과명 이력.
import { Types } from "mongoose";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import {
  resolvePracticeTransferArrivalPolicy,
  upsertMemoArrivalYmd,
  upsertMemoOrderYmd,
} from "../../utils/practiceTransferRush.js";
import {
  syncArrivalDatesWithMemoYmd,
  syncOrderDatesWithMemoYmd,
} from "../../utils/practiceTransferArrivalDates.js";
import {
  stampPracticeTransferFileBatch,
  dedupePracticeTransferFilesByNameSize,
} from "../../services/practiceTransferProduction.service.js";
import { resolveStoredScanRole } from "../../utils/oralScanRole.js";
import { toKstYmd } from "../requests/utils.js";

export const LAB_MODEL_SCAN_SOURCE = "lab_model_scan";
const LAB_CLIENT_LABEL_MAX = 40;
const LAB_MODEL_SCAN_REGISTRATION_EXTENSIONS = new Set([
  ".stl",
  ".ply",
  ".obj",
  ".dcm",
  ".3ox",
  ".3oxz",
  ".dentalproject",
]);

const PRACTICE_ALLOWED_EXTENSIONS = new Set([
  ".stl",
  ".ply",
  ".obj",
  ".dcm",
  ".3ox",
  ".3oxz",
  ".dentalproject",
  ".zip",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".heic",
  ".pdf",
]);

const getLowerExt = (filename) => {
  const raw = String(filename || "").trim().toLowerCase();
  const idx = raw.lastIndexOf(".");
  if (idx < 0) return "";
  return raw.slice(idx);
};

const mapFilesFromBody = (filesRaw) =>
  (Array.isArray(filesRaw) ? filesRaw : [])
    .map((row) => {
      const file = row?.file || row || {};
      const originalName = String(
        file?.originalName || file?.name || row?.originalName || "",
      ).trim();
      const s3Key = String(file?.s3Key || file?.key || row?.s3Key || "").trim();
      if (!originalName || !s3Key) return null;
      if (!PRACTICE_ALLOWED_EXTENSIONS.has(getLowerExt(originalName))) {
        return null;
      }
      const storedRole = resolveStoredScanRole({
        originalName,
        scanRole: row?.scanRole,
        scanRoleSetBy: row?.scanRoleSetBy,
      });
      return {
        patientName: String(row?.patientName || "").trim(),
        tooth: String(row?.tooth || "").trim(),
        ...(storedRole.scanRole
          ? {
              scanRole: storedRole.scanRole,
              scanRoleSetBy: storedRole.scanRoleSetBy,
            }
          : {}),
        file: {
          originalName,
          mimetype: String(
            file?.mimetype || row?.mimetype || "application/octet-stream",
          ).trim(),
          size: Number(file?.size || row?.size || 0),
          s3Key,
        },
      };
    })
    .filter(Boolean);

const touchLabClientLabel = async (labAnchorId, clinicLabel) => {
  const label = String(clinicLabel || "").trim();
  if (!labAnchorId || !label) return;
  const anchor = await BusinessAnchor.findById(labAnchorId)
    .select({ labClientLabels: 1 })
    .lean();
  if (!anchor) return;
  const prev = Array.isArray(anchor.labClientLabels)
    ? anchor.labClientLabels.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  const next = [label, ...prev.filter((x) => x !== label)].slice(
    0,
    LAB_CLIENT_LABEL_MAX,
  );
  await BusinessAnchor.updateOne(
    { _id: labAnchorId },
    { $set: { labClientLabels: next } },
  );
};

/**
 * POST /api/practice/transfers/lab-model-scan
 * 기공소가 모델스캔으로 기공의뢰를 만든다. 치과 BA 없음·기공비 hold 없음.
 */
export async function createLabModelScanTransfer(req, res) {
  try {
    const labAnchorId = req.user?.businessAnchorId || null;
    if (!labAnchorId || !Types.ObjectId.isValid(String(labAnchorId))) {
      return res.status(400).json({
        success: false,
        message: "기공소 사업자 정보가 필요합니다.",
      });
    }

    const clinicLabel = String(
      req.body?.clinicLabel || req.body?.clinicName || "",
    ).trim();

    const patientName = String(req.body?.patientName || "").trim();
    if (!patientName) {
      return res.status(400).json({
        success: false,
        message: "환자명을 입력해 주세요.",
      });
    }

    const toothWorks = Array.isArray(req.body?.toothWorks)
      ? req.body.toothWorks
      : [];
    if (toothWorks.length === 0) {
      return res.status(400).json({
        success: false,
        message: "보철·치식을 선택해 주세요.",
      });
    }

    let files = dedupePracticeTransferFilesByNameSize(
      stampPracticeTransferFileBatch(mapFilesFromBody(req.body?.files)),
    );
    files = files.map((row) => ({
      ...row,
      patientName: row.patientName || patientName,
    }));
    const hasModelScanFile = files.some((row) =>
      LAB_MODEL_SCAN_REGISTRATION_EXTENSIONS.has(
        getLowerExt(row?.file?.originalName),
      ),
    );
    if (!hasModelScanFile) {
      return res.status(400).json({
        success: false,
        message: "모델스캔 파일을 첨부해 주세요.",
      });
    }
    const isRemake = req.body?.isRemake === true;

    const labAnchor = await BusinessAnchor.findById(labAnchorId)
      .select({ name: 1 })
      .lean();
    const targetLabName = String(labAnchor?.name || "").trim() || "기공소";

    const todayYmd = toKstYmd(new Date()) || "";
    const arrivalYmdRaw = String(req.body?.arrivalYmd || "").trim();
    const orderYmdRaw = String(req.body?.orderYmd || "").trim() || todayYmd;
    let memoSeed = String(req.body?.transferMemo || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(orderYmdRaw)) {
      memoSeed = upsertMemoOrderYmd(memoSeed, orderYmdRaw);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(arrivalYmdRaw)) {
      memoSeed = upsertMemoArrivalYmd(memoSeed, arrivalYmdRaw);
    }

    const arrivalPolicy = await resolvePracticeTransferArrivalPolicy({
      transferMemo: memoSeed,
      rushProcessing: Boolean(req.body?.rushProcessing),
    });
    if (!arrivalPolicy.ok) {
      return res.status(arrivalPolicy.statusCode || 400).json({
        success: false,
        message: arrivalPolicy.message,
        reason: arrivalPolicy.reason,
      });
    }

    const transferMemoResolved = arrivalPolicy.transferMemo;
    const createArrivalDates = syncArrivalDatesWithMemoYmd({
      previousArrivalDates: [],
      previousMemo: "",
      nextMemo: transferMemoResolved,
    });
    const createOrderDates = syncOrderDatesWithMemoYmd({
      previousOrderDates: [],
      previousMemo: "",
      nextMemo: transferMemoResolved,
    });

    const transferId =
      String(req.body?.transferId || "").trim() ||
      `PTX-${Date.now().toString(36).toUpperCase()}`;

    const crownRaw = String(req.body?.crownFabrication || "").trim();
    const crownFabrication =
      crownRaw === "scan" || crownRaw === "impression" ? crownRaw : null;

    const transferDoc = await PracticeTransfer.create({
      transferId,
      practiceUserId: req.user._id,
      practiceBusinessAnchorId: null,
      targetLabAnchorId: labAnchorId,
      targetLabName,
      assigneeLabAnchorId: null,
      assigneeLabName: "",
      assigneeKind: null,
      matchingMode: "direct",
      intakeSource: LAB_MODEL_SCAN_SOURCE,
      clinicLabel,
      transferMemo: transferMemoResolved,
      arrivalDates: createArrivalDates,
      orderDates: createOrderDates,
      tag: "practice_file_transfer",
      status: "active",
      files,
      toothWorks,
      crownFabrication,
      billing: {
        total: 0,
        labFeeTotal: 0,
        abutmentRetailTotal: 0,
        abutmentQty: 0,
        skipPracticeHold: true,
        ...(isRemake ? { isRemake: true } : {}),
      },
      ...(isRemake
        ? {
            remake: {
              requestedAt: new Date(),
              requestedBy: req.user?._id || null,
              initiatedByLab: true,
            },
          }
        : {}),
      production: {
        skipDesignConfirm: true,
        skipJig: true,
        rushProcessing: Boolean(req.body?.rushProcessing),
        anodizingEnabled: req.body?.anodizingEnabled !== false,
        shippingMode: null,
        confirmedAt: null,
        confirmedBy: null,
        relatedRequestIds: [],
        designFiles: [],
        designReadyAt: null,
        labDesignConfirmedAt: null,
        practiceDesignConfirmedAt: null,
        abutmentProductionStartedAt: null,
      },
    });

    void touchLabClientLabel(labAnchorId, clinicLabel).catch((err) => {
      console.warn(
        "[labModelScan] touchLabClientLabel",
        err?.message || err,
      );
    });

    return res.status(201).json({
      success: true,
      data: {
        _id: String(transferDoc._id),
        transferId: transferDoc.transferId,
        clinicLabel,
        intakeSource: LAB_MODEL_SCAN_SOURCE,
        targetLabAnchorId: String(labAnchorId),
        createdAt: transferDoc.createdAt,
      },
    });
  } catch (error) {
    console.error("[labModelScan] create", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "모델스캔 의뢰 생성에 실패했습니다.",
    });
  }
}

/**
 * GET /api/practice/transfers/lab-client-labels
 */
export async function listLabClientLabels(req, res) {
  try {
    const labAnchorId = req.user?.businessAnchorId || null;
    if (!labAnchorId || !Types.ObjectId.isValid(String(labAnchorId))) {
      return res.status(200).json({ success: true, data: { labels: [] } });
    }
    const q = String(req.query?.q || "").trim().toLowerCase();
    const anchor = await BusinessAnchor.findById(labAnchorId)
      .select({ labClientLabels: 1 })
      .lean();
    let labels = Array.isArray(anchor?.labClientLabels)
      ? anchor.labClientLabels.map((x) => String(x || "").trim()).filter(Boolean)
      : [];
    if (q) {
      labels = labels.filter((label) => label.toLowerCase().includes(q));
    }
    return res.status(200).json({
      success: true,
      data: { labels: labels.slice(0, LAB_CLIENT_LABEL_MAX) },
    });
  } catch (error) {
    console.error("[labModelScan] listLabClientLabels", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "치과명 이력을 불러오지 못했습니다.",
    });
  }
}

// related files:
// - web/backend/services/integrations/threeShape/syncLabInbox.js
// - web/backend/models/practiceTransfer.model.js
// - web/backend/utils/s3.utils.js
import { Types } from "mongoose";
import BusinessAnchor from "../../../models/businessAnchor.model.js";
import PracticeTransfer from "../../../models/practiceTransfer.model.js";
import User from "../../../models/user.model.js";
import { uploadFileToS3 } from "../../../utils/s3.utils.js";

function sanitizeFileName(name) {
  const raw = String(name || "scan.stl").trim() || "scan.stl";
  return raw.replace(/[^\w.\-()+\s가-힣]/g, "_").slice(0, 180);
}

async function resolvePracticeByExternalEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) {
    return { practiceUserId: null, practiceBusinessAnchorId: null };
  }

  const user = await User.findOne({ email: normalized })
    .select({ _id: 1, businessAnchorId: 1, role: 1 })
    .lean();
  if (user?._id) {
    return {
      practiceUserId: user._id,
      practiceBusinessAnchorId: user.businessAnchorId || null,
    };
  }

  const anchor = await BusinessAnchor.findOne({
    "metadata.email": normalized,
  })
    .select({ _id: 1 })
    .lean();

  return {
    practiceUserId: null,
    practiceBusinessAnchorId: anchor?._id || null,
  };
}

/**
 * Create or return existing PracticeTransfer for a 3Shape inbox case.
 *
 * @param {object} args
 * @param {string|import("mongoose").Types.ObjectId} args.labAnchorId
 * @param {string} args.labName
 * @param {string} args.externalCaseId
 * @param {{ name?: string, email?: string, communicateId?: string }} [args.externalPractice]
 * @param {string} [args.transferMemo]
 * @param {Array<{ fileName: string, contentType?: string, buffer: Buffer, patientName?: string, tooth?: string }>} args.assets
 */
export async function createPracticeTransferFromExternalIngest({
  labAnchorId,
  labName,
  externalCaseId,
  externalPractice,
  transferMemo,
  assets,
} = {}) {
  const caseId = String(externalCaseId || "").trim();
  if (!caseId) {
    const err = new Error("externalCaseId가 필요합니다.");
    err.statusCode = 400;
    throw err;
  }
  if (!labAnchorId || !Types.ObjectId.isValid(String(labAnchorId))) {
    const err = new Error("labAnchorId가 필요합니다.");
    err.statusCode = 400;
    throw err;
  }

  const existing = await PracticeTransfer.findOne({
    source: "3shape",
    externalCaseId: caseId,
  })
    .select({ _id: 1, transferId: 1 })
    .lean();
  if (existing) {
    return { created: false, transfer: existing, duplicate: true };
  }

  const practiceEmail = String(externalPractice?.email || "")
    .trim()
    .toLowerCase();
  const practiceName = String(externalPractice?.name || "").trim();
  const communicateId = String(externalPractice?.communicateId || "").trim();

  const mapped = await resolvePracticeByExternalEmail(practiceEmail);

  const fileRows = [];
  const assetList = Array.isArray(assets) ? assets : [];
  for (const asset of assetList) {
    const buffer = asset?.buffer;
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) continue;
    const originalName = sanitizeFileName(asset.fileName || "scan.stl");
    const key = `practice-transfers/3shape/${String(labAnchorId)}/${caseId}/${Date.now()}-${originalName}`;
    await uploadFileToS3(
      buffer,
      key,
      String(asset.contentType || "application/octet-stream"),
    );
    fileRows.push({
      patientName: String(asset.patientName || "").trim(),
      tooth: String(asset.tooth || "").trim(),
      file: {
        originalName,
        mimetype: String(asset.contentType || "application/octet-stream"),
        size: buffer.length,
        s3Key: key,
      },
    });
  }

  if (fileRows.length === 0) {
    const err = new Error("업로드할 스캔 파일이 없습니다.");
    err.statusCode = 400;
    throw err;
  }

  const transferId = `PTX-3S-${caseId}`.slice(0, 64);
  const memo =
    String(transferMemo || "").trim() ||
    (practiceName
      ? `3Shape Communicate · ${practiceName}`
      : "3Shape Communicate 수신");

  try {
    const doc = await PracticeTransfer.create({
      transferId,
      source: "3shape",
      externalCaseId: caseId,
      externalPractice: {
        name: practiceName,
        email: practiceEmail,
        communicateId,
      },
      designSoftware: "3Shape",
      practiceUserId: mapped.practiceUserId || null,
      practiceBusinessAnchorId: mapped.practiceBusinessAnchorId || null,
      targetLabAnchorId: new Types.ObjectId(String(labAnchorId)),
      targetLabName: String(labName || "").trim(),
      matchingMode: "direct",
      transferMemo: memo,
      tag: "practice_file_transfer",
      status: "active",
      files: fileRows,
      toothWorks: [],
      billing: {
        labFeeTotal: 0,
        total: 0,
        relationshipKind: "none",
      },
    });

    return { created: true, transfer: doc, duplicate: false };
  } catch (error) {
    // Race: unique (source, externalCaseId)
    if (error?.code === 11000) {
      const again = await PracticeTransfer.findOne({
        source: "3shape",
        externalCaseId: caseId,
      })
        .select({ _id: 1, transferId: 1 })
        .lean();
      if (again) {
        return { created: false, transfer: again, duplicate: true };
      }
    }
    throw error;
  }
}

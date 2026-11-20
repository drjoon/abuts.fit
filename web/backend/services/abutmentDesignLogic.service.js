// 확정·수작업 의뢰의 치종 편집을 모으고, 반복 패턴은 관리자 승인 뒤에만 생성 보정이 된다.
// related files:
// - web/backend/services/abutmentDesignLogic.core.js
// - web/backend/models/abutmentDesignLogic.model.js
// - web/backend/controllers/ai/abutmentDesignLogic.controller.js
// - web/backend/controllers/admin/admin.abutmentDesignLogic.controller.js
import { Types } from "mongoose";
import BusinessAnchor from "../models/businessAnchor.model.js";
import PracticeTransfer from "../models/practiceTransfer.model.js";
import {
  AbutmentDesignEdit,
  AbutmentDesignLogicProposal,
  AbutmentDesignLogicRule,
} from "../models/abutmentDesignLogic.model.js";
import {
  buildLogicProposals,
  clampRuleDelta,
  sanitizeGenerationDelta,
  toothKindOf,
} from "./abutmentDesignLogic.core.js";

const OPEN_DISPOSITIONS = [null, "pending"];

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function viewProposal(row) {
  return {
    id: String(row._id),
    toothKind: row.toothKind,
    axis: row.axis,
    delta: row.delta,
    changeLabel: String(row.changeLabel || ""),
    summary: String(row.summary || ""),
    detail: String(row.detail || ""),
    applyText: String(row.applyText || ""),
    beforeText: String(row.beforeText || ""),
    afterText: String(row.afterText || ""),
    samples: (row.samples || []).map((sample) => ({
      transferId: String(sample.transferId || ""),
      patientName: String(sample.patientName || ""),
      practiceName: String(sample.practiceName || ""),
      toothNumber: String(sample.toothNumber || ""),
      changeText: String(sample.changeText || ""),
    })),
  };
}

export async function listActiveGenerationRules() {
  const rows = await AbutmentDesignLogicRule.find().select({ toothKind: 1, axis: 1, delta: 1 }).lean();
  return rows
    .filter((row) => Number.isFinite(Number(row.delta)) && row.delta !== 0)
    .map((row) => ({
      toothKind: row.toothKind,
      axis: row.axis,
      delta: row.delta,
    }));
}

export async function listPendingLogicProposals() {
  const rows = await AbutmentDesignLogicProposal.find({ status: "pending" })
    .sort({ createdAt: 1 })
    .limit(20)
    .lean();
  const items = rows.map(viewProposal);
  return { count: items.length, items };
}

async function refreshLogicProposals() {
  const rows = await AbutmentDesignEdit.find({ disposition: { $in: OPEN_DISPOSITIONS } })
    .sort({ updatedAt: -1 })
    .limit(500)
    .lean();
  const drafts = buildLogicProposals(rows);
  const draftKeys = new Set(drafts.map((draft) => `${draft.toothKind}:${draft.axis}`));
  for (const draft of drafts) {
    const fields = {
      toothKind: draft.toothKind,
      axis: draft.axis,
      delta: draft.delta,
      changeLabel: draft.changeLabel,
      summary: draft.summary,
      detail: draft.detail,
      applyText: draft.applyText,
      beforeText: draft.beforeText,
      afterText: draft.afterText,
      samples: draft.samples,
      observationIds: draft.observationIds
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id)),
      status: "pending",
    };
    let doc = await AbutmentDesignLogicProposal.findOne({
      toothKind: draft.toothKind,
      axis: draft.axis,
      status: "pending",
    });
    if (!doc) {
      try {
        doc = await AbutmentDesignLogicProposal.create(fields);
      } catch (error) {
        if (error?.code !== 11000) throw error;
        doc = await AbutmentDesignLogicProposal.findOne({
          toothKind: draft.toothKind,
          axis: draft.axis,
          status: "pending",
        });
      }
    }
    if (!doc) continue;
    doc.set(fields);
    await doc.save();
    const ids = fields.observationIds;
    if (ids.length > 0) {
      await AbutmentDesignEdit.updateMany(
        { _id: { $in: ids }, disposition: { $in: OPEN_DISPOSITIONS } },
        { $set: { disposition: "pending", proposalId: doc._id } },
      );
    }
    await AbutmentDesignEdit.updateMany(
      { proposalId: doc._id, disposition: "pending", _id: { $nin: ids } },
      { $set: { disposition: null, proposalId: null } },
    );
  }
  const pending = await AbutmentDesignLogicProposal.find({ status: "pending" })
    .select({ toothKind: 1, axis: 1 })
    .lean();
  for (const row of pending) {
    if (draftKeys.has(`${row.toothKind}:${row.axis}`)) continue;
    await AbutmentDesignEdit.updateMany(
      { proposalId: row._id, disposition: "pending" },
      { $set: { disposition: null, proposalId: null } },
    );
    await AbutmentDesignLogicProposal.deleteOne({ _id: row._id, status: "pending" });
  }
}

export async function recordGenerationEdits(input) {
  const transferId = clean(input?.transferId, 80);
  const anchorRaw = clean(input?.practiceBusinessAnchorId, 40);
  const anchorId = Types.ObjectId.isValid(anchorRaw) ? anchorRaw : null;
  if (!transferId || !anchorId) return { recorded: 0 };
  const action = input?.action === "manual" ? "manual" : "confirm";
  const patientName = clean(input?.patientName, 40);
  const userRaw = clean(input?.userId, 40);
  const userId = Types.ObjectId.isValid(userRaw) ? userRaw : null;
  let practiceName = clean(input?.practiceName, 80);
  if (!practiceName) {
    const anchor = await BusinessAnchor.findById(anchorId).select({ name: 1 }).lean();
    practiceName = clean(anchor?.name, 80);
  }
  const teeth = Array.isArray(input?.teeth) ? input.teeth.slice(0, 16) : [];
  let changed = 0;
  for (const tooth of teeth) {
    const toothNumber = clean(tooth?.toothNumber, 8);
    const toothKind = toothKindOf(toothNumber);
    if (!toothKind) continue;
    const deltas = Array.isArray(tooth?.deltas) ? tooth.deltas.slice(0, 8) : [];
    const seen = new Set();
    for (const raw of deltas) {
      const sanitized = sanitizeGenerationDelta(raw?.axis, raw?.before, raw?.after);
      if (!sanitized || seen.has(sanitized.axis)) continue;
      seen.add(sanitized.axis);
      const existing = await AbutmentDesignEdit.findOne({
        transferId,
        toothNumber,
        axis: sanitized.axis,
      })
        .select({ disposition: 1 })
        .lean();
      if (existing?.disposition === "approved" || existing?.disposition === "dismissed") {
        seen.add(sanitized.axis);
        continue;
      }
      await AbutmentDesignEdit.updateOne(
        { transferId, toothNumber, axis: sanitized.axis },
        {
          $set: {
            toothKind,
            before: sanitized.before,
            after: sanitized.after,
            delta: sanitized.delta,
            action,
            patientName,
            practiceName,
            practiceBusinessAnchorId: anchorId,
            userId,
            disposition: null,
            proposalId: null,
          },
        },
        { upsert: true },
      );
      changed += 1;
    }
    const removed = await AbutmentDesignEdit.deleteMany({
      transferId,
      toothNumber,
      disposition: { $in: OPEN_DISPOSITIONS },
      axis: { $nin: [...seen] },
    });
    changed += removed.deletedCount || 0;
  }
  if (changed > 0) {
    void refreshLogicProposals().catch((err) =>
      console.warn("[abutment-design-logic] proposal refresh failed", err?.message || err),
    );
  }
  return { recorded: changed };
}

async function decideProposal(proposalId, status, userId) {
  if (!Types.ObjectId.isValid(String(proposalId || ""))) return listPendingLogicProposals();
  const proposal = await AbutmentDesignLogicProposal.findOne({ _id: proposalId, status: "pending" });
  if (!proposal) return listPendingLogicProposals();
  const now = new Date();
  if (status === "approved") {
    const current = await AbutmentDesignLogicRule.findOne({
      toothKind: proposal.toothKind,
      axis: proposal.axis,
    })
      .select({ delta: 1 })
      .lean();
    const delta = clampRuleDelta(proposal.axis, current?.delta, proposal.delta);
    await AbutmentDesignLogicRule.updateOne(
      { toothKind: proposal.toothKind, axis: proposal.axis },
      { $set: { delta, proposalId: proposal._id } },
      { upsert: true },
    );
  }
  proposal.status = status;
  proposal.decidedAt = now;
  proposal.decidedBy = Types.ObjectId.isValid(String(userId || "")) ? userId : null;
  await proposal.save();
  await AbutmentDesignEdit.updateMany(
    { proposalId: proposal._id, disposition: "pending" },
    { $set: { disposition: status } },
  );
  return listPendingLogicProposals();
}

export function approveLogicProposal(proposalId, userId) {
  return decideProposal(proposalId, "approved", userId);
}

export function dismissLogicProposal(proposalId, userId) {
  return decideProposal(proposalId, "dismissed", userId);
}

function mapStoredFiles(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const file = row?.file && typeof row.file === "object" ? row.file : {};
      const fileName = String(file.originalName || "").trim();
      const s3Key = String(file.s3Key || "").trim();
      if (!fileName || !s3Key) return null;
      return {
        fileName,
        s3Key,
        size: Number(file.size || 0),
        scanRole: String(row?.scanRole || "").trim() || null,
        uploadedAt: row?.uploadedAt || null,
      };
    })
    .filter(Boolean);
}

export async function loadGenerationLogicPreview(transferId, patientName) {
  const id = clean(transferId, 80);
  if (!id) return null;
  const transfer = await PracticeTransfer.findOne({ transferId: id })
    .select({
      transferId: 1,
      toothWorks: 1,
      files: 1,
      "production.labWorkScanFiles": 1,
    })
    .lean();
  if (!transfer) return null;
  return {
    transferId: String(transfer.transferId || id),
    patientName: clean(patientName, 40),
    toothWorks: Array.isArray(transfer.toothWorks) ? transfer.toothWorks : [],
    files: mapStoredFiles(transfer.files),
    workScanFiles: mapStoredFiles(transfer.production?.labWorkScanFiles),
  };
}

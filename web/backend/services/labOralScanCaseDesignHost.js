// related files:
// - web/backend/models/labOralScanCase.model.js
// - web/backend/controllers/ai/customAbutmentDesignChat.controller.js
// - web/backend/services/labOralScanCaseDesign.service.js
// AI 디자인 API가 PracticeTransfer 또는 LabOralScanCase를 같은 transferId 입력으로 resolve.
import { Types } from "mongoose";
import PracticeTransfer from "../models/practiceTransfer.model.js";
import LabOralScanCase from "../models/labOralScanCase.model.js";

export const DESIGN_HOST_PTX = "ptx";
export const DESIGN_HOST_LAB_ORAL_SCAN = "labOralScan";

/**
 * @returns {Promise<null | {
 *   kind: "ptx" | "labOralScan",
 *   publicId: string,
 *   transferDoc?: object,
 *   labCase?: object,
 * }>}
 */
export async function resolveDesignHost(rawId, { lean = true } = {}) {
  const id = String(rawId || "").trim();
  if (!id) return null;

  if (Types.ObjectId.isValid(id) && String(new Types.ObjectId(id)) === id) {
    const byMongo = lean
      ? await PracticeTransfer.findById(id).lean()
      : await PracticeTransfer.findById(id);
    if (byMongo) {
      return {
        kind: DESIGN_HOST_PTX,
        publicId: String(byMongo.transferId || id),
        transferDoc: byMongo,
      };
    }
  }

  const transfer = lean
    ? await PracticeTransfer.findOne({ transferId: id }).lean()
    : await PracticeTransfer.findOne({ transferId: id });
  if (transfer) {
    return {
      kind: DESIGN_HOST_PTX,
      publicId: String(transfer.transferId || id),
      transferDoc: transfer,
    };
  }

  const labCase = lean
    ? await LabOralScanCase.findOne({ caseId: id }).lean()
    : await LabOralScanCase.findOne({ caseId: id });
  if (labCase) {
    return {
      kind: DESIGN_HOST_LAB_ORAL_SCAN,
      publicId: String(labCase.caseId || id),
      labCase,
    };
  }

  return null;
}

/** 스냅샷·권한용 최소 select */
export async function resolveDesignHostLean(rawId, select) {
  const id = String(rawId || "").trim();
  if (!id) return null;

  if (Types.ObjectId.isValid(id) && String(new Types.ObjectId(id)) === id) {
    let q = PracticeTransfer.findById(id);
    if (select) q = q.select(select);
    const byMongo = await q.lean();
    if (byMongo) {
      return {
        kind: DESIGN_HOST_PTX,
        publicId: String(byMongo.transferId || id),
        transferDoc: byMongo,
      };
    }
  }

  let tq = PracticeTransfer.findOne({ transferId: id });
  if (select) tq = tq.select(select);
  const transfer = await tq.lean();
  if (transfer) {
    return {
      kind: DESIGN_HOST_PTX,
      publicId: String(transfer.transferId || id),
      transferDoc: transfer,
    };
  }

  const labSelect = {
    caseId: 1,
    labBusinessAnchorId: 1,
    clinicName: 1,
    patientName: 1,
    toothWorks: 1,
    caseInfos: 1,
    files: 1,
    status: 1,
    production: 1,
    createdByUserId: 1,
  };
  const labCase = await LabOralScanCase.findOne({ caseId: id }).select(labSelect).lean();
  if (labCase) {
    return {
      kind: DESIGN_HOST_LAB_ORAL_SCAN,
      publicId: String(labCase.caseId || id),
      labCase,
    };
  }
  return null;
}

/**
 * lab oral scan case 접근. 소유 기공소 또는 admin/internalLab.
 * @returns {{ ok: boolean, canSave: boolean, canEditShared: boolean, anchorId: string|null, publicId: string }}
 */
export function resolveLabOralScanAccess(req, labCase) {
  const own = String(req.user?.businessAnchorId || "").trim();
  const labId = String(labCase?.labBusinessAnchorId || "").trim();
  const privileged = req.user?.role === "admin" || req.user?.role === "internalLab";
  const publicId = String(labCase?.caseId || "").trim();
  if (!labId) {
    return { ok: false, canSave: false, canEditShared: false, anchorId: null, publicId };
  }
  if (privileged || own === labId) {
    return {
      ok: true,
      canSave: true,
      canEditShared: true,
      anchorId: labId,
      publicId,
    };
  }
  return { ok: false, canSave: false, canEditShared: false, anchorId: null, publicId };
}

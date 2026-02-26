import { Types } from "mongoose";
import Request from "../../models/request.model.js";
import RequestorOrganization from "../../models/requestorOrganization.model.js";
import {
  getRequestorOrgId,
  buildRequestorOrgScopeFilter,
  normalizeRequestStage,
  getRequestStageOrder,
} from "./utils.js";

export async function checkDuplicateCaseInfo(req, res) {
  try {
    const clinicName = String(req.query?.clinicName || "").trim();
    const patientName = String(req.query?.patientName || "").trim();
    const tooth = String(req.query?.tooth || "").trim();

    if (!clinicName || !patientName || !tooth) {
      return res.status(400).json({
        success: false,
        message: "clinicName, patientName, tooth는 필수입니다.",
      });
    }

    const requestFilter = await buildRequestorOrgScopeFilter(req);

    const query = {
      $and: [
        requestFilter,
        { manufacturerStage: { $ne: "취소" } },
        {
          "caseInfos.clinicName": clinicName,
          "caseInfos.patientName": patientName,
          "caseInfos.tooth": tooth,
        },
      ],
    };

    const candidates = await Request.find(query)
      .select({
        _id: 1,
        requestId: 1,
        manufacturerStage: 1,
        price: 1,
        createdAt: 1,
        "caseInfos.clinicName": 1,
        "caseInfos.patientName": 1,
        "caseInfos.tooth": 1,
      })
      .sort({ createdAt: -1 })
      .lean();

    const existing =
      Array.isArray(candidates) && candidates.length > 0 ? candidates[0] : null;

    if (!existing) {
      return res.status(200).json({
        success: true,
        data: {
          exists: false,
          stageOrder: -1,
          existingRequest: null,
        },
      });
    }

    const stage = normalizeRequestStage(existing);
    const stageOrderMap = {
      request: 0,
      cam: 1,
      production: 2,
      shipping: 3,
      tracking: 4,
    };
    const stageOrder = stageOrderMap[stage] ?? 0;

    return res.status(200).json({
      success: true,
      data: {
        exists: true,
        stageOrder,
        existingRequest: {
          _id: String(existing._id),
          requestId: String(existing.requestId || ""),
          manufacturerStage: String(existing.manufacturerStage || ""),
          price: existing.price ? { amount: existing.price.amount } : null,
          createdAt: existing.createdAt || null,
          caseInfos: {
            clinicName: String(existing?.caseInfos?.clinicName || ""),
            patientName: String(existing?.caseInfos?.patientName || ""),
            tooth: String(existing?.caseInfos?.tooth || ""),
          },
        },
      },
    });
  } catch (error) {
    console.error("Error in checkDuplicateCaseInfo:", error);
    return res.status(500).json({
      success: false,
      message: "중복 의뢰 여부 확인 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export async function hasDuplicateCase(req, res) {
  try {
    const { fileName } = req.query;

    let requestFilter = {};
    if (req?.user?.role === "requestor") {
      const orgId = getRequestorOrgId(req);
      if (orgId && Types.ObjectId.isValid(orgId)) {
        const org = await RequestorOrganization.findById(orgId)
          .select({ owner: 1, owners: 1, members: 1 })
          .lean();

        const memberIdsRaw = [
          String(org?.owner || ""),
          ...(Array.isArray(org?.owners)
            ? org.owners.map((id) => String(id))
            : []),
          ...(Array.isArray(org?.members)
            ? org.members.map((id) => String(id))
            : []),
        ]
          .filter((id) => Types.ObjectId.isValid(id))
          .map((id) => new Types.ObjectId(id));

        requestFilter = {
          $or: [
            { requestorOrganizationId: new Types.ObjectId(orgId) },
            { requestor: { $in: memberIdsRaw } },
          ],
        };
      } else {
        requestFilter = { requestor: req.user._id };
      }
    }

    if (!fileName) {
      return res.status(400).json({
        success: false,
        message: "fileName은 필수입니다.",
      });
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);

    const normalizeFileName = (v) => {
      if (!v) return "";
      const s = String(v);
      let candidate = s;
      try {
        const hasHangul = /[가-힣]/.test(s);
        const bytes = new Uint8Array(
          Array.from(s).map((ch) => ch.charCodeAt(0) & 0xff),
        );
        const decoded = new TextDecoder("utf-8").decode(bytes);
        const decodedHasHangul = /[가-힣]/.test(decoded);
        candidate = !hasHangul && decodedHasHangul ? decoded : s;
      } catch {
        candidate = s;
      }

      const base = String(candidate)
        .replace(/\\/g, "/")
        .split("/")
        .filter(Boolean)
        .slice(-1)[0];

      return base
        .normalize("NFC")
        .replace(/\.[^/.]+$/, "")
        .trim()
        .toLowerCase();
    };

    const normalizedFileName = normalizeFileName(fileName);

    const allRequests = await Request.find({
      ...requestFilter,
      manufacturerStage: { $ne: "취소" },
      createdAt: { $gte: cutoff },
    })
      .select({
        _id: 1,
        requestId: 1,
        manufacturerStage: 1,
        caseInfos: 1,
        price: 1,
        createdAt: 1,
      })
      .lean();

    const computeStageOrder = (doc) => {
      return getRequestStageOrder(doc);
    };

    let existing = null;
    let existingStageOrder = -1;
    let existingCreatedAt = null;

    for (const r of allRequests) {
      const caseInfosList = Array.isArray(r?.caseInfos)
        ? r.caseInfos
        : r?.caseInfos
          ? [r.caseInfos]
          : [];

      const matched = caseInfosList.some((ci) => {
        const storedName = ci?.file?.filePath || ci?.file?.originalName;
        const normalizedStoredName = normalizeFileName(storedName);
        if (!normalizedStoredName) return false;
        return normalizedStoredName === normalizedFileName;
      });

      if (!matched) continue;

      const so = computeStageOrder(r);
      const ca = r?.createdAt ? new Date(r.createdAt) : null;
      const shouldReplace =
        existing == null ||
        so > existingStageOrder ||
        (so === existingStageOrder &&
          ca &&
          (!existingCreatedAt || ca.getTime() > existingCreatedAt.getTime()));

      if (shouldReplace) {
        existing = r;
        existingStageOrder = so;
        existingCreatedAt = ca;
      }
    }

    if (!existing) {
      return res.status(200).json({
        success: true,
        data: {
          exists: false,
          hasDuplicate: false,
          stageOrder: -1,
          status: null,
          manufacturerStage: null,
          existingRequest: null,
        },
      });
    }

    const stageOrder = existing ? computeStageOrder(existing) : -1;

    return res.status(200).json({
      success: true,
      data: {
        exists: Boolean(existing),
        hasDuplicate: Boolean(existing),
        stageOrder,
        manufacturerStage: existing?.manufacturerStage,
        existingRequest: existing
          ? {
              _id: existing._id,
              requestId: existing.requestId,
              manufacturerStage: existing.manufacturerStage,
              caseInfos: existing.caseInfos,
              price: existing.price ? { amount: existing.price.amount } : null,
              createdAt: existing.createdAt,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Error in hasDuplicateCase:", error);
    return res.status(500).json({
      success: false,
      message: "중복 의뢰 여부 확인 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

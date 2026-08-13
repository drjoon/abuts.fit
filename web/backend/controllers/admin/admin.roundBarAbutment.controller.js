// related files:
// - web/backend/models/roundBarAbutmentRequest.model.js
// - web/backend/modules/admin/admin.routes.js
// - web/backend/controllers/practiceTransfers/roundBarAbutmentRequest.controller.js
// - web/frontend/src/pages/admin/system/AdminRoundBarAbutmentTab.tsx
// change-log:
// - 2026-08-14: 관리자가 타입(헥스 사이즈)을 수정하면 치과 프리셋에도 반영.
// - 2026-08-14: 도입 시 치과 프리셋 adopted 동기화 강화 + practice:round-bar-request-updated 이벤트.
import { Types } from "mongoose";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import BusinessRegistrationInquiry from "../../models/businessRegistrationInquiry.model.js";
import RoundBarAbutmentRequest from "../../models/roundBarAbutmentRequest.model.js";
import User from "../../models/user.model.js";
import { emitAppEventToRoles, emitAppEventToUser } from "../../socket.js";
import {
  ROUND_BAR_HEX_TYPE,
  buildRoundBarSpecKey,
  normalizeAdoptedKind,
  normalizeRoundBarSpec,
} from "../../utils/roundBarAbutment.js";
import {
  toRoundBarRequestResponse,
  upsertFavoriteOnAnchor,
} from "../practiceTransfers/roundBarAbutmentRequest.controller.js";

const notifyPracticeRoundBarUpdate = async (doc) => {
  const payload = {
    practiceAnchorId: doc.practiceAnchorId ? String(doc.practiceAnchorId) : "",
    requestId: String(doc._id || ""),
    favoriteId: String(doc.favoriteId || "").trim(),
    adopted: Boolean(doc.adopted),
    adoptedKind: normalizeAdoptedKind(doc.adoptedKind),
    manufacturer: String(doc.manufacturer || "").trim(),
    brand: String(doc.brand || "").trim(),
    family: String(doc.family || "").trim(),
    type: String(doc.type || "").trim() || ROUND_BAR_HEX_TYPE,
  };
  const userIds = new Set();
  if (doc.requestedBy) userIds.add(String(doc.requestedBy));
  if (doc.practiceAnchorId) {
    const users = await User.find({ businessAnchorId: doc.practiceAnchorId })
      .select({ _id: 1 })
      .lean();
    users.forEach((user) => userIds.add(String(user._id)));
  }
  for (const userId of userIds) {
    emitAppEventToUser(userId, "practice:round-bar-request-updated", payload);
  }
};

const setInquiryStatus = async ({ inquiryId, nextStatus, userId, adminNote }) => {
  if (!inquiryId || !Types.ObjectId.isValid(String(inquiryId))) return;
  const prev = await BusinessRegistrationInquiry.findById(inquiryId).select("status");
  if (!prev) return;
  const prevStatus = String(prev.status || "open").trim() || "open";
  if (prevStatus === nextStatus && adminNote == null) return;

  const update = {
    status: nextStatus,
    resolvedAt: nextStatus === "resolved" ? new Date() : null,
    resolvedBy: nextStatus === "resolved" ? userId || null : null,
  };
  if (adminNote != null) update.adminNote = String(adminNote || "").trim();

  const inquiry = await BusinessRegistrationInquiry.findByIdAndUpdate(
    inquiryId,
    { $set: update },
    { new: true },
  );
  if (!inquiry) return;

  if (prevStatus !== nextStatus) {
    const delta =
      prevStatus === "open" && nextStatus === "resolved"
        ? -1
        : prevStatus === "resolved" && nextStatus === "open"
          ? 1
          : 0;
    if (delta !== 0) {
      emitAppEventToRoles(["admin"], "comm:badge-update", {
        key: "inquiry",
        delta,
      });
    }
  }
  emitAppEventToRoles(["admin"], "support:inquiry-updated", {
    inquiry: {
      action: "updated",
      inquiryId: String(inquiry._id),
      status: String(inquiry.status || nextStatus),
      type: String(inquiry.type || ""),
      subject: String(inquiry.subject || ""),
      createdAt: inquiry.createdAt || null,
      updatedAt: inquiry.updatedAt || null,
      userId: inquiry.user ? String(inquiry.user) : null,
      businessAnchorId: inquiry.businessAnchorId
        ? String(inquiry.businessAnchorId)
        : null,
      businessType: inquiry.businessType ? String(inquiry.businessType) : null,
    },
    previousStatus: prevStatus,
    nextStatus,
  });
};

export async function adminListRoundBarAbutmentRequests(req, res) {
  try {
    const status = String(req.query?.status || "").trim();
    const q = String(req.query?.q || "").trim();
    const limit = Math.min(200, Number(req.query?.limit || 80) || 80);
    const filter = {};
    if (status === "adopted") filter.adopted = true;
    if (status === "pending") filter.adopted = false;
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [
        { practiceName: rx },
        { manufacturer: rx },
        { brand: rx },
        { family: rx },
        { type: rx },
      ];
    }

    const rows = await RoundBarAbutmentRequest.find(filter)
      .sort({ adopted: 1, createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({
      success: true,
      data: rows.map((row) => toRoundBarRequestResponse(row)),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "환봉방식 커스텀어벗 요청 목록 조회 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

export async function adminUpdateRoundBarAbutmentRequest(req, res) {
  try {
    const id = String(req.params?.id || "").trim();
    if (!id || !Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "요청 ID가 올바르지 않습니다." });
    }

    const doc = await RoundBarAbutmentRequest.findById(id);
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: "환봉방식 커스텀어벗 요청을 찾을 수 없습니다.",
      });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const hasSpec =
      Object.prototype.hasOwnProperty.call(body, "manufacturer") ||
      Object.prototype.hasOwnProperty.call(body, "brand") ||
      Object.prototype.hasOwnProperty.call(body, "family") ||
      Object.prototype.hasOwnProperty.call(body, "type");
    const hasAdopted = Object.prototype.hasOwnProperty.call(body, "adopted");
    const hasAdoptedKind = Object.prototype.hasOwnProperty.call(body, "adoptedKind");

    if (hasSpec) {
      const spec = normalizeRoundBarSpec(
        {
          manufacturer:
            body.manufacturer != null ? body.manufacturer : doc.manufacturer,
          brand: body.brand != null ? body.brand : doc.brand,
          family: body.family != null ? body.family : doc.family,
          type: body.type != null ? body.type : doc.type,
        },
        { allowType: true },
      );
      if (!spec.manufacturer || !spec.brand || !spec.family) {
        return res.status(400).json({
          success: false,
          message: "제조사, 브랜드, 패밀리를 모두 입력해주세요.",
        });
      }
      doc.manufacturer = spec.manufacturer;
      doc.brand = spec.brand;
      doc.family = spec.family;
      doc.type = spec.type;
      doc.specKey = buildRoundBarSpecKey(spec);
    }

    if (hasAdoptedKind) {
      doc.adoptedKind = normalizeAdoptedKind(body.adoptedKind);
    }

    let adoptChanged = false;
    if (hasAdopted) {
      const nextAdopted = body.adopted === true || body.adopted === "true";
      if (nextAdopted !== Boolean(doc.adopted)) {
        if (nextAdopted && !normalizeAdoptedKind(doc.adoptedKind)) {
          return res.status(400).json({
            success: false,
            message: "도입 전에 CNC어벗 또는 환봉어벗을 선택해주세요.",
          });
        }
        adoptChanged = true;
        doc.adopted = nextAdopted;
        if (nextAdopted) {
          doc.adoptedAt = new Date();
          doc.adoptedBy = req.user?._id || null;
          doc.revertedAt = null;
          doc.revertedBy = null;
        } else {
          doc.revertedAt = new Date();
          doc.revertedBy = req.user?._id || null;
          doc.adoptedAt = null;
          doc.adoptedBy = null;
        }
      }
    }

    await doc.save();

    const anchor = await BusinessAnchor.findById(doc.practiceAnchorId)
      .select({
        name: 1,
        practiceTransferSettings: 1,
      })
      .lean();
    if (anchor) {
      const favorite = await upsertFavoriteOnAnchor({
        anchor,
        favoriteId: doc.favoriteId,
        spec: {
          manufacturer: doc.manufacturer,
          brand: doc.brand,
          family: doc.family,
          type: String(doc.type || "").trim() || ROUND_BAR_HEX_TYPE,
        },
        roundBarRequestId: String(doc._id),
        adopted: Boolean(doc.adopted),
        adoptedKind: doc.adoptedKind,
      });
      if (favorite?.id && favorite.id !== doc.favoriteId) {
        doc.favoriteId = favorite.id;
        await doc.save();
      }
    }

    if (adoptChanged) {
      await setInquiryStatus({
        inquiryId: doc.inquiryId,
        nextStatus: doc.adopted ? "resolved" : "open",
        userId: req.user?._id,
        adminNote: doc.adopted
          ? `어벗 추가 요청 도입(${normalizeAdoptedKind(doc.adoptedKind) === "round_bar" ? "환봉어벗" : "CNC어벗"})`
          : "어벗 추가 요청 도입 해제",
      });
    }

    await notifyPracticeRoundBarUpdate(doc);

    return res.json({
      success: true,
      data: toRoundBarRequestResponse(doc),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "환봉방식 커스텀어벗 요청 저장 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

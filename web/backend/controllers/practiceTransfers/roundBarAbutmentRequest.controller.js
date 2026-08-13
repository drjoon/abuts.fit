// related files:
// - web/backend/models/roundBarAbutmentRequest.model.js
// - web/backend/utils/roundBarAbutment.js
// - web/backend/modules/practiceTransfers/practiceTransfer.routes.js
// - web/frontend/src/shared/practice/roundBarAbutment.ts
// - web/frontend/src/shared/components/practice/PracticeToothImplantFields.tsx
import { Types } from "mongoose";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import BusinessRegistrationInquiry from "../../models/businessRegistrationInquiry.model.js";
import RoundBarAbutmentRequest from "../../models/roundBarAbutmentRequest.model.js";
import { emitAppEventToRoles } from "../../socket.js";
import {
  ROUND_BAR_HEX_TYPE,
  ROUND_BAR_INQUIRY_TYPE,
  buildRoundBarSpecKey,
  normalizeRoundBarSpec,
} from "../../utils/roundBarAbutment.js";

const MAX_IMPLANT_FAVORITES = 40;

const buildUserSnapshot = (user) => ({
  name: String(user?.name || ""),
  email: String(user?.email || ""),
  role: String(user?.role || ""),
  business: String(user?.business || ""),
});

const buildInquiryRealtimePayload = (inquiry, action) => {
  if (!inquiry) return null;
  return {
    action: String(action || "").trim() || null,
    inquiryId: String(inquiry._id || "").trim() || null,
    status: String(inquiry.status || "").trim() || "open",
    type: String(inquiry.type || "").trim() || "general",
    subject: String(inquiry.subject || "").trim() || null,
    createdAt: inquiry.createdAt || null,
    updatedAt: inquiry.updatedAt || null,
    userId: inquiry.user ? String(inquiry.user).trim() : null,
    businessAnchorId: inquiry.businessAnchorId
      ? String(inquiry.businessAnchorId).trim()
      : null,
    businessType: inquiry.businessType ? String(inquiry.businessType).trim() : null,
  };
};

const normalizeFavoriteRow = (raw) => {
  const row = raw && typeof raw === "object" ? raw : {};
  const manufacturer = String(row.manufacturer || "").trim();
  const brand = String(row.brand || "").trim();
  const family = String(row.family || "").trim();
  const type = String(row.type || "").trim();
  if (!manufacturer && !brand && !family && !type) return null;
  const roundBarRequestId = String(row.roundBarRequestId || "").trim();
  return {
    id: String(row.id || "").trim(),
    manufacturer,
    brand,
    family,
    type,
    roundBar: Boolean(row.roundBar) || Boolean(roundBarRequestId),
    adopted: Boolean(row.adopted),
    roundBarRequestId,
  };
};

const listFavorites = (anchor) => {
  const raw = anchor?.practiceTransferSettings?.implantFavorites;
  const list = Array.isArray(raw) ? raw : [];
  return list.map(normalizeFavoriteRow).filter(Boolean);
};

const upsertFavoriteOnAnchor = async ({
  anchor,
  favoriteId,
  spec,
  roundBarRequestId,
  adopted,
}) => {
  const nextId =
    String(favoriteId || "").trim() ||
    `imp-rb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const nextRow = {
    id: nextId,
    manufacturer: spec.manufacturer,
    brand: spec.brand,
    family: spec.family,
    type: spec.type || ROUND_BAR_HEX_TYPE,
    roundBar: true,
    adopted: Boolean(adopted),
    roundBarRequestId: String(roundBarRequestId || "").trim(),
  };
  const current = listFavorites(anchor);
  const byId = current.findIndex((row) => row.id === nextId);
  const byRequest = current.findIndex(
    (row) =>
      nextRow.roundBarRequestId &&
      row.roundBarRequestId === nextRow.roundBarRequestId,
  );
  const idx = byId >= 0 ? byId : byRequest;
  const nextList = [...current];
  if (idx >= 0) {
    nextList[idx] = { ...nextList[idx], ...nextRow, id: nextList[idx].id || nextId };
    nextRow.id = nextList[idx].id;
  } else {
    nextList.unshift(nextRow);
  }
  const trimmed = nextList.slice(0, MAX_IMPLANT_FAVORITES);
  await BusinessAnchor.updateOne(
    { _id: anchor._id },
    {
      $set: {
        "practiceTransferSettings.implantFavorites": trimmed,
        "practiceTransferSettings.updatedAt": new Date(),
      },
    },
  );
  return nextRow;
};

const toResponse = (doc) => {
  if (!doc) return null;
  const row = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    id: String(row._id || ""),
    practiceAnchorId: row.practiceAnchorId ? String(row.practiceAnchorId) : "",
    practiceName: String(row.practiceName || "").trim(),
    requestedBy: row.requestedBy ? String(row.requestedBy) : "",
    favoriteId: String(row.favoriteId || "").trim(),
    inquiryId: row.inquiryId ? String(row.inquiryId) : "",
    manufacturer: String(row.manufacturer || "").trim(),
    brand: String(row.brand || "").trim(),
    family: String(row.family || "").trim(),
    type: String(row.type || ROUND_BAR_HEX_TYPE).trim() || ROUND_BAR_HEX_TYPE,
    adopted: Boolean(row.adopted),
    adoptedAt: row.adoptedAt || null,
    revertedAt: row.revertedAt || null,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
  };
};

export async function createRoundBarAbutmentRequest(req, res) {
  try {
    const role = String(req.user?.role || "").trim();
    if (role !== "practice" && role !== "requestor" && role !== "admin") {
      return res.status(403).json({ success: false, message: "권한이 없습니다." });
    }

    const anchorId = String(req.user?.businessAnchorId || "").trim();
    if (!anchorId || !Types.ObjectId.isValid(anchorId)) {
      return res.status(400).json({
        success: false,
        message: "치과 사업자 정보가 필요합니다.",
      });
    }

    const spec = normalizeRoundBarSpec(req.body || {});
    if (!spec.manufacturer || !spec.brand || !spec.family) {
      return res.status(400).json({
        success: false,
        message: "제조사, 브랜드, 패밀리를 모두 입력해주세요.",
      });
    }

    const favoriteIdInput = String(req.body?.favoriteId || "").trim();
    const specKey = buildRoundBarSpecKey(spec);
    const anchor = await BusinessAnchor.findById(anchorId).select({
      name: 1,
      practiceTransferSettings: 1,
    });
    if (!anchor) {
      return res.status(404).json({
        success: false,
        message: "치과 사업자 정보를 찾을 수 없습니다.",
      });
    }

    const practiceName =
      String(anchor.name || "").trim() ||
      String(req.user?.business || req.user?.name || "").trim();

    let requestDoc = await RoundBarAbutmentRequest.findOne({
      practiceAnchorId: anchor._id,
      specKey,
    }).sort({ createdAt: -1 });

    if (!requestDoc && favoriteIdInput) {
      requestDoc = await RoundBarAbutmentRequest.findOne({
        practiceAnchorId: anchor._id,
        favoriteId: favoriteIdInput,
      }).sort({ createdAt: -1 });
    }

    if (requestDoc) {
      requestDoc.manufacturer = spec.manufacturer;
      requestDoc.brand = spec.brand;
      requestDoc.family = spec.family;
      requestDoc.type = ROUND_BAR_HEX_TYPE;
      requestDoc.specKey = specKey;
      requestDoc.practiceName = practiceName;
      if (favoriteIdInput) requestDoc.favoriteId = favoriteIdInput;
      await requestDoc.save();

      const favorite = await upsertFavoriteOnAnchor({
        anchor,
        favoriteId: requestDoc.favoriteId || favoriteIdInput,
        spec,
        roundBarRequestId: String(requestDoc._id),
        adopted: Boolean(requestDoc.adopted),
      });
      if (favorite.id && favorite.id !== requestDoc.favoriteId) {
        requestDoc.favoriteId = favorite.id;
        await requestDoc.save();
      }

      return res.status(200).json({
        success: true,
        data: {
          request: toResponse(requestDoc),
          favorite,
        },
      });
    }

    const inquiryMessage = [
      "제조사 추가 요청 (환봉방식 커스텀어벗)",
      "",
      `치과: ${practiceName || "-"}`,
      `제조사: ${spec.manufacturer}`,
      `브랜드: ${spec.brand}`,
      `패밀리: ${spec.family}`,
      `타입: ${ROUND_BAR_HEX_TYPE}`,
    ].join("\n");

    const inquiry = await BusinessRegistrationInquiry.create({
      user: req.user._id,
      businessAnchorId: anchor._id,
      businessType: req.user?.role || "practice",
      userSnapshot: buildUserSnapshot(req.user),
      type: ROUND_BAR_INQUIRY_TYPE,
      subject: `[제조사 추가 요청] ${spec.manufacturer} / ${spec.brand} / ${spec.family}`,
      message: inquiryMessage,
      payload: {
        kind: "round_bar_abutment",
        manufacturer: spec.manufacturer,
        brand: spec.brand,
        family: spec.family,
        type: ROUND_BAR_HEX_TYPE,
      },
    });

    emitAppEventToRoles(["admin"], "comm:badge-update", {
      key: "inquiry",
      delta: 1,
    });
    emitAppEventToRoles(["admin"], "support:inquiry-created", {
      inquiry: buildInquiryRealtimePayload(inquiry, "created"),
      unreadCountDelta: 1,
    });

    requestDoc = await RoundBarAbutmentRequest.create({
      practiceAnchorId: anchor._id,
      practiceName,
      requestedBy: req.user._id,
      favoriteId: favoriteIdInput,
      inquiryId: inquiry._id,
      manufacturer: spec.manufacturer,
      brand: spec.brand,
      family: spec.family,
      type: ROUND_BAR_HEX_TYPE,
      specKey,
      adopted: false,
    });

    const favorite = await upsertFavoriteOnAnchor({
      anchor,
      favoriteId: favoriteIdInput,
      spec,
      roundBarRequestId: String(requestDoc._id),
      adopted: false,
    });
    if (favorite.id && favorite.id !== requestDoc.favoriteId) {
      requestDoc.favoriteId = favorite.id;
      await requestDoc.save();
    }

    inquiry.payload = {
      ...(inquiry.payload && typeof inquiry.payload === "object" ? inquiry.payload : {}),
      requestId: String(requestDoc._id),
      favoriteId: favorite.id,
    };
    await inquiry.save();

    return res.status(201).json({
      success: true,
      data: {
        request: toResponse(requestDoc),
        favorite,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "제조사 추가 요청 중 오류가 발생했습니다.",
      error: error?.message,
    });
  }
}

export { toResponse as toRoundBarRequestResponse, upsertFavoriteOnAnchor };

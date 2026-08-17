// related files:
// - web/backend/models/request.model.js
// - web/backend/services/practiceTransferProduction.service.js
// - web/backend/controllers/requests/shipping.Hanjin.helpers.js
// - web/backend/controllers/requests/mailbox.utils.js
// - web/backend/controllers/requests/common.review.controller.js
// change-log:
// - 2026-08-17: 포장.발송 진입 시 live practice BA로 shippingReceiver 스냅샷(주소 변경 반영).
// - 2026-08-17: PTX 직납 수취인 스냅샷 빌드·판별·우편함 org 키 헬퍼.
import BusinessAnchor from "../models/businessAnchor.model.js";
import User from "../models/user.model.js";
import PracticeTransfer from "../models/practiceTransfer.model.js";

/**
 * @param {object|null|undefined} practiceAnchor
 * @param {object|null|undefined} practiceUser
 * @returns {{
 *   name: string,
 *   phone: string,
 *   contactName: string,
 *   address: string,
 *   addressDetail: string,
 *   zipCode: string,
 *   sourceAnchorId: import("mongoose").Types.ObjectId|null,
 * }|null}
 */
export function buildShippingReceiverFromPractice({
  practiceAnchor = null,
  practiceUser = null,
} = {}) {
  if (!practiceAnchor || typeof practiceAnchor !== "object") return null;

  const meta =
    practiceAnchor.metadata && typeof practiceAnchor.metadata === "object"
      ? practiceAnchor.metadata
      : {};
  const profile =
    practiceUser?.practiceProfile &&
    typeof practiceUser.practiceProfile === "object"
      ? practiceUser.practiceProfile
      : {};

  const name =
    String(practiceAnchor.name || "").trim() ||
    String(meta.companyName || "").trim() ||
    String(profile.clinicName || "").trim();
  const phone =
    String(meta.phoneNumber || "").trim() ||
    String(profile.clinicPhone || "").trim() ||
    String(profile.phone || "").trim();
  const contactName =
    String(profile.staffName || "").trim() ||
    String(meta.representativeName || "").trim() ||
    String(profile.directorName || "").trim();
  const address =
    String(meta.address || "").trim() ||
    String(profile.address || "").trim();
  const addressDetail =
    String(meta.addressDetail || "").trim() ||
    String(profile.addressDetail || "").trim();
  const zipCode =
    String(meta.zipCode || "").trim() ||
    String(profile.zipCode || "").trim();

  const sourceAnchorId = practiceAnchor._id || null;
  if (!name && !phone && !address && !sourceAnchorId) return null;

  return {
    name: name || "치과",
    phone,
    contactName,
    address,
    addressDetail,
    zipCode,
    sourceAnchorId,
  };
}

export function getShippingReceiver(requestLike) {
  const raw = requestLike?.shippingReceiver;
  if (!raw || typeof raw !== "object") return null;
  const name = String(raw.name || "").trim();
  const phone = String(raw.phone || "").trim();
  const contactName = String(raw.contactName || "").trim();
  const address = String(raw.address || "").trim();
  const addressDetail = String(raw.addressDetail || "").trim();
  const zipCode = String(raw.zipCode || "").trim();
  const sourceAnchorId = raw.sourceAnchorId || null;
  if (
    !name &&
    !phone &&
    !contactName &&
    !address &&
    !addressDetail &&
    !zipCode &&
    !sourceAnchorId
  ) {
    return null;
  }
  return {
    name,
    phone,
    contactName,
    address,
    addressDetail,
    zipCode,
    sourceAnchorId,
  };
}

/** PTX 직납(치과 수취) 여부 */
export function isPracticeDirectShipping(requestLike) {
  if (getShippingReceiver(requestLike)) return true;
  const pb =
    requestLike?.partnerBilling &&
    typeof requestLike.partnerBilling === "object"
      ? requestLike.partnerBilling
      : {};
  if (pb.relatedPracticeTransferId) return true;
  if (pb.practiceBusinessAnchorId) return true;
  return false;
}

/**
 * 우편함 합류/점유 키.
 * PTX 직납 → practice BA, 그 외 → lab businessAnchorId.
 */
export function resolveShippingMailboxOrgId(requestLike) {
  const receiver = getShippingReceiver(requestLike);
  const fromReceiver = receiver?.sourceAnchorId
    ? String(receiver.sourceAnchorId._id || receiver.sourceAnchorId).trim()
    : "";
  if (fromReceiver) return fromReceiver;

  const pb =
    requestLike?.partnerBilling &&
    typeof requestLike.partnerBilling === "object"
      ? requestLike.partnerBilling
      : {};
  const practiceId = String(
    pb.practiceBusinessAnchorId?._id || pb.practiceBusinessAnchorId || "",
  ).trim();
  if (practiceId) return practiceId;

  const direct = String(
    requestLike?.businessAnchorId?._id || requestLike?.businessAnchorId || "",
  ).trim();
  if (direct) return direct;

  const fromRequestor = String(
    requestLike?.requestor?.businessAnchorId?._id ||
      requestLike?.requestor?.businessAnchorId ||
      "",
  ).trim();
  return fromRequestor || "";
}

/**
 * 세척.패킹 진입(우편함 배정) 시 PTX 직납 수취인을 live practice BA(+ profile)로 덮어쓴다.
 * 합류 지문(이름/전화/주소)과 운송장 수취인이 같은 스냅샷을 쓰게 한다.
 *
 * @returns {Promise<object|null>} 적용된 shippingReceiver 또는 null
 */
export async function applyPracticeShippingReceiverSnapshotToRequest(
  requestDoc,
  { session = null } = {},
) {
  if (!requestDoc || typeof requestDoc !== "object") return null;
  if (!isPracticeDirectShipping(requestDoc)) return null;

  const pb =
    requestDoc.partnerBilling && typeof requestDoc.partnerBilling === "object"
      ? requestDoc.partnerBilling
      : {};

  let practiceId = String(
    pb.practiceBusinessAnchorId?._id || pb.practiceBusinessAnchorId || "",
  ).trim();

  if (!practiceId && pb.relatedPracticeTransferId) {
    let transferQuery = PracticeTransfer.findById(
      pb.relatedPracticeTransferId,
    ).select({ practiceBusinessAnchorId: 1 });
    if (session) transferQuery = transferQuery.session(session);
    const transfer = await transferQuery.lean();
    practiceId = String(transfer?.practiceBusinessAnchorId || "").trim();
    if (practiceId) {
      if (
        !requestDoc.partnerBilling ||
        typeof requestDoc.partnerBilling !== "object"
      ) {
        requestDoc.partnerBilling = {};
      }
      requestDoc.partnerBilling.practiceBusinessAnchorId = practiceId;
      if (typeof requestDoc.markModified === "function") {
        requestDoc.markModified("partnerBilling");
      }
    }
  }

  if (!practiceId) return null;

  let anchorQuery = BusinessAnchor.findById(practiceId).select({
    name: 1,
    metadata: 1,
  });
  if (session) anchorQuery = anchorQuery.session(session);
  const practiceAnchor = await anchorQuery.lean();

  let userQuery = User.findOne({ businessAnchorId: practiceId })
    .select({ practiceProfile: 1 })
    .sort({ updatedAt: -1 });
  if (session) userQuery = userQuery.session(session);
  const practiceUser = await userQuery.lean();

  const shippingReceiver = buildShippingReceiverFromPractice({
    practiceAnchor,
    practiceUser,
  });
  if (!shippingReceiver) return null;

  if (
    (!shippingReceiver.name || shippingReceiver.name === "치과") &&
    String(requestDoc?.caseInfos?.clinicName || "").trim()
  ) {
    shippingReceiver.name = String(requestDoc.caseInfos.clinicName).trim();
  }

  requestDoc.shippingReceiver = {
    name: shippingReceiver.name,
    phone: shippingReceiver.phone,
    contactName: shippingReceiver.contactName,
    address: shippingReceiver.address,
    addressDetail: shippingReceiver.addressDetail,
    zipCode: shippingReceiver.zipCode,
    sourceAnchorId: shippingReceiver.sourceAnchorId,
  };
  if (typeof requestDoc.markModified === "function") {
    requestDoc.markModified("shippingReceiver");
  }
  return requestDoc.shippingReceiver;
}

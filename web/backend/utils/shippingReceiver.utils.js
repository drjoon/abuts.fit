// related files:
// - web/backend/models/request.model.js
// - web/backend/services/practiceTransferProduction.service.js
// - web/backend/controllers/requests/shipping.Hanjin.helpers.js
// - web/backend/controllers/requests/mailbox.utils.js
// - web/backend/controllers/requests/common.review.controller.js
// change-log:
// - 2026-08-21: PTX CA는 기공소 수취(우편함·한진). 치과 직납 스냅샷/합류 키 사용 안 함.
// - 2026-08-17: 포장.발송 진입 시 live practice BA로 shippingReceiver 스냅샷(주소 변경 반영).
// - 2026-08-17: PTX 직납 수취인 스냅샷 빌드·판별·우편함 org 키 헬퍼.
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
  // PTX CA는 기공소 수취 — 레거시 치과 스냅샷이 있어도 무시.
  const pb =
    requestLike?.partnerBilling &&
    typeof requestLike.partnerBilling === "object"
      ? requestLike.partnerBilling
      : {};
  if (pb.relatedPracticeTransferId || pb.practiceBusinessAnchorId) {
    return null;
  }
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

/** @deprecated PTX CA는 기공소 수취. 레거시 스냅샷이 남아 있을 때만 true. */
export function isPracticeDirectShipping(requestLike) {
  // PTX(구강스캔 CA)는 주문 기공소로 배송 — 직납 판별하지 않음.
  const pb =
    requestLike?.partnerBilling &&
    typeof requestLike.partnerBilling === "object"
      ? requestLike.partnerBilling
      : {};
  if (pb.relatedPracticeTransferId || pb.practiceBusinessAnchorId) {
    return false;
  }
  return Boolean(getShippingReceiver(requestLike));
}

/**
 * 우편함 합류/점유 키.
 * PTX·일반 모두 requestor lab businessAnchorId (치과 직납 키 사용 안 함).
 */
export function resolveShippingMailboxOrgId(requestLike) {
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
 * PTX는 기공소 수취. 레거시 치과 shippingReceiver 스냅샷이 있으면 지운다.
 * @returns {Promise<object|null>}
 */
export async function applyPracticeShippingReceiverSnapshotToRequest(
  requestDoc,
  _opts = {},
) {
  if (!requestDoc || typeof requestDoc !== "object") return null;
  const pb =
    requestDoc.partnerBilling && typeof requestDoc.partnerBilling === "object"
      ? requestDoc.partnerBilling
      : {};
  if (!pb.relatedPracticeTransferId && !pb.practiceBusinessAnchorId) {
    return null;
  }
  if (requestDoc.shippingReceiver) {
    requestDoc.shippingReceiver = undefined;
    if (typeof requestDoc.markModified === "function") {
      requestDoc.markModified("shippingReceiver");
    }
  }
  return null;
}

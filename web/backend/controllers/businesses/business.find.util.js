// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
import BusinessAnchor from "../../models/businessAnchor.model.js";

/**
 * 같은 법인 하위조직(parent ↔ child, 같은 parent의 형제)은 사업자번호를 나눠 가진다.
 * 예: admin 어벗츠 주식회사 ← internalLab 기공사업부.
 * 그 밖은 다른 사업자다.
 */
export function isSameCorporationBusinessAnchor(self, other) {
  if (!self || !other) return false;
  const selfId = String(self._id || "");
  const otherId = String(other._id || "");
  if (selfId && otherId && selfId === otherId) return true;
  const selfParent = self.parentBusinessAnchorId
    ? String(self.parentBusinessAnchorId)
    : "";
  const otherParent = other.parentBusinessAnchorId
    ? String(other.parentBusinessAnchorId)
    : "";
  if (selfId && otherParent === selfId) return true;
  if (otherId && selfParent === otherId) return true;
  if (selfParent && otherParent && selfParent === otherParent) return true;
  return false;
}

export async function findConflictingBusinessAnchor({
  businessNumberNormalized,
  selfAnchorId,
}) {
  const normalized = String(businessNumberNormalized || "")
    .replace(/\D/g, "")
    .trim();
  if (!normalized) return null;

  const others = await BusinessAnchor.find({
    businessNumberNormalized: normalized,
    ...(selfAnchorId ? { _id: { $ne: selfAnchorId } } : {}),
  })
    .select({
      _id: 1,
      parentBusinessAnchorId: 1,
      businessType: 1,
      name: 1,
      primaryContactUserId: 1,
      owners: 1,
      members: 1,
    })
    .lean();
  if (!others.length) return null;

  const self = selfAnchorId
    ? await BusinessAnchor.findById(selfAnchorId)
        .select({ _id: 1, parentBusinessAnchorId: 1 })
        .lean()
    : null;

  return (
    others.find((other) => !isSameCorporationBusinessAnchor(self, other)) ||
    null
  );
}

export async function findBusinessByAnchors({
  businessType,
  businessId,
  businessNumber,
  userId,
  businessName,
}) {
  if (businessId) {
    const byId = await BusinessAnchor.findOne({
      _id: businessId,
      businessType,
    });
    if (byId) return byId;
  }

  if (userId) {
    const byMembership = await BusinessAnchor.findOne({
      businessType,
      $or: [
        { primaryContactUserId: userId },
        { owners: userId },
        { members: userId },
        { "joinRequests.user": userId },
      ],
    }).sort({ updatedAt: -1, createdAt: -1 });
    if (byMembership) return byMembership;
  }

  const safeBusinessName = String(businessName || "").trim();
  if (safeBusinessName) {
    const matches = await BusinessAnchor.find({
      businessType,
      name: safeBusinessName,
      $or: [
        { primaryContactUserId: userId },
        { owners: userId },
        { members: userId },
      ],
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(1);
    if (Array.isArray(matches) && matches[0]) return matches[0];
  }

  const normalizedBusinessNumber = String(businessNumber || "")
    .replace(/\D/g, "")
    .trim();
  if (normalizedBusinessNumber) {
    const byBusinessNumber = await BusinessAnchor.findOne({
      businessType,
      businessNumberNormalized: normalizedBusinessNumber,
    });
    if (byBusinessNumber) return byBusinessNumber;
  }

  return null;
}

import BusinessAnchor from "../models/businessAnchor.model.js";
import { emitAppEventToUser } from "../socket.js";

export async function emitCreditBalanceUpdatedToBusiness({
  businessAnchorId,
  businessId,
  balanceDelta,
  reason,
  refId,
}) {
  const anchorId = String(businessAnchorId || "").trim();
  const id = String(businessId || "").trim();
  if (!anchorId && !id) return;

  const delta = Number(balanceDelta || 0);
  if (!Number.isFinite(delta) || delta === 0) return;

  const business = anchorId
    ? await BusinessAnchor.findById(anchorId)
        .select({ primaryContactUserId: 1, owners: 1, members: 1 })
        .lean()
        .catch(() => null)
    : await BusinessAnchor.findById(id)
        .select({ primaryContactUserId: 1, owners: 1, members: 1 })
        .lean()
        .catch(() => null);
  if (!business) return;

  const resolvedBusinessAnchorId = String(business._id || "").trim();
  if (!resolvedBusinessAnchorId) return;

  const targetUserIds = Array.from(
    new Set(
      [
        business.primaryContactUserId,
        ...(Array.isArray(business.owners) ? business.owners : []),
        ...(Array.isArray(business.members) ? business.members : []),
      ]
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    ),
  );

  for (const userId of targetUserIds) {
    emitAppEventToUser(userId, "credit:balance-updated", {
      businessAnchorId: resolvedBusinessAnchorId,
      balanceDelta: delta,
      reason: String(reason || "").trim() || null,
      refId: refId ? String(refId) : null,
    });
  }
}

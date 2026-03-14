import Business from "../models/business.model.js";
import { emitAppEventToUser } from "../socket.js";

export async function emitCreditBalanceUpdatedToBusiness({
  businessId,
  balanceDelta,
  reason,
  refId,
}) {
  const id = String(businessId || "").trim();
  if (!id) return;

  const delta = Number(balanceDelta || 0);
  if (!Number.isFinite(delta) || delta === 0) return;

  const business = await Business.findById(id)
    .select({ owner: 1, owners: 1, members: 1 })
    .lean()
    .catch(() => null);
  if (!business) return;

  const targetUserIds = Array.from(
    new Set(
      [
        business.owner,
        ...(Array.isArray(business.owners) ? business.owners : []),
        ...(Array.isArray(business.members) ? business.members : []),
      ]
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    ),
  );

  for (const userId of targetUserIds) {
    emitAppEventToUser(userId, "credit:balance-updated", {
      businessId: id,
      balanceDelta: delta,
      reason: String(reason || "").trim() || null,
      refId: refId ? String(refId) : null,
    });
  }
}

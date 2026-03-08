import RequestorOrganization from "../models/requestorOrganization.model.js";
import { emitAppEventToUser } from "../socket.js";

export async function emitCreditBalanceUpdatedToOrganization({
  organizationId,
  balanceDelta,
  reason,
  refId,
}) {
  const orgId = String(organizationId || "").trim();
  if (!orgId) return;

  const delta = Number(balanceDelta || 0);
  if (!Number.isFinite(delta) || delta === 0) return;

  const org = await RequestorOrganization.findById(orgId)
    .select({ owner: 1, owners: 1, members: 1 })
    .lean()
    .catch(() => null);
  if (!org) return;

  const targetUserIds = Array.from(
    new Set(
      [
        org.owner,
        ...(Array.isArray(org.owners) ? org.owners : []),
        ...(Array.isArray(org.members) ? org.members : []),
      ]
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    ),
  );

  for (const userId of targetUserIds) {
    emitAppEventToUser(userId, "credit:balance-updated", {
      organizationId: orgId,
      balanceDelta: delta,
      reason: String(reason || "").trim() || null,
      refId: refId ? String(refId) : null,
    });
  }
}

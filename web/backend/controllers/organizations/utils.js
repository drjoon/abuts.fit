import RequestorOrganization from "../../models/requestorOrganization.model.js";

export async function resolveOwnedOrg(req) {
  const orgId = req.user?.organizationId;
  if (!orgId) return null;
  const meId = req.user?._id;
  const org = await RequestorOrganization.findOne({
    _id: orgId,
    $or: [{ owner: meId }, { owners: meId }],
  });
  return org;
}

export async function resolvePrimaryOwnedOrg(req) {
  const orgId = req.user?.organizationId;
  if (!orgId) return null;
  const org = await RequestorOrganization.findOne({
    _id: orgId,
    owner: req.user._id,
  });
  return org;
}

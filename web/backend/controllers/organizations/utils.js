import RequestorOrganization from "../../models/requestorOrganization.model.js";
import { buildOrganizationTypeFilter } from "./organizationRole.util.js";

export async function resolveOwnedOrg(req, organizationType) {
  const businessId = req.user?.businessId;
  if (!businessId) return null;
  const meId = req.user?._id;
  const orgTypeFilter = buildOrganizationTypeFilter(organizationType);
  const org = await RequestorOrganization.findOne({
    _id: businessId,
    ...orgTypeFilter,
    $or: [{ owner: meId }, { owners: meId }],
  });
  return org;
}

export async function resolvePrimaryOwnedOrg(req, organizationType) {
  const businessId = req.user?.businessId;
  if (!businessId) return null;
  const orgTypeFilter = buildOrganizationTypeFilter(organizationType);
  const org = await RequestorOrganization.findOne({
    _id: businessId,
    ...orgTypeFilter,
    owner: req.user._id,
  });
  return org;
}

import Business from "../../models/business.model.js";
import { buildBusinessTypeFilter } from "./businessRole.util.js";

export async function resolveOwnedBusiness(req, businessType) {
  const businessId = req.user?.businessId;
  if (!businessId) return null;
  const meId = req.user?._id;
  const typeFilter = buildBusinessTypeFilter(businessType);
  const business = await Business.findOne({
    _id: businessId,
    ...typeFilter,
    $or: [{ owner: meId }, { owners: meId }],
  });
  return business;
}

export async function resolvePrimaryOwnedBusiness(req, businessType) {
  const businessId = req.user?.businessId;
  if (!businessId) return null;
  const typeFilter = buildBusinessTypeFilter(businessType);
  const business = await Business.findOne({
    _id: businessId,
    ...typeFilter,
    owner: req.user._id,
  });
  return business;
}

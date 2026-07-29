// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
import * as businessController from "./business.controller.js";
import * as memberController from "./business.member.controller.js";
import * as ownerController from "./business.owner.controller.js";

export const {
  getMyBusiness,
  searchBusinesses,
  getBusinessPublicById,
  updateMyBusiness,
  clearMyBusinessLicense,
  checkBusinessNumberDuplicate,
  lookupPostalCode,
  updateBusinessShippingAddress,
  getMyRequestSettings,
  updateMyRequestSettings,
} = businessController;

export const {
  requestJoinBusiness,
  cancelJoinRequest,
  leaveBusiness,
  getMyJoinRequests,
} = memberController;

export const {
  getPendingJoinRequestsForOwner,
  getRepresentatives,
  addOwner,
  removeOwner,
  getMyStaffMembers,
  removeMember,
  approveJoinRequest,
  rejectJoinRequest,
} = ownerController;

export default {
  getMyBusiness,
  searchBusinesses,
  getBusinessPublicById,
  updateMyBusiness,
  clearMyBusinessLicense,
  checkBusinessNumberDuplicate,
  lookupPostalCode,
  updateBusinessShippingAddress,
  getMyRequestSettings,
  updateMyRequestSettings,
  requestJoinBusiness,
  cancelJoinRequest,
  leaveBusiness,
  getMyJoinRequests,
  getPendingJoinRequestsForOwner,
  getRepresentatives,
  addOwner,
  removeOwner,
  getMyStaffMembers,
  removeMember,
  approveJoinRequest,
  rejectJoinRequest,
};

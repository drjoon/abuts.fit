import * as businessController from "./business.controller.js";
import * as memberController from "./business.member.controller.js";
import * as ownerController from "./business.owner.controller.js";

export const {
  getMyBusiness,
  searchBusinesses,
  updateMyBusiness,
  clearMyBusinessLicense,
  checkBusinessNumberDuplicate,
  lookupPostalCode,
  updateBusinessShippingAddress,
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
  updateMyBusiness,
  clearMyBusinessLicense,
  checkBusinessNumberDuplicate,
  lookupPostalCode,
  updateBusinessShippingAddress,
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

import * as orgController from "./org.controller.js";
import * as memberController from "./member.controller.js";
import * as ownerController from "./owner.controller.js";

// Re-export individual functions for named imports
export const {
  getMyOrganization,
  searchOrganizations,
  updateMyOrganization,
  clearMyBusinessLicense,
} = orgController;

export const {
  requestJoinOrganization,
  cancelJoinRequest,
  leaveOrganization,
  getMyJoinRequests,
} = memberController;

export const {
  getPendingJoinRequestsForOwner,
  getRepresentatives,
  addOwner,
  removeOwner,
  getMyStaffMembers,
  removeStaffMember,
  approveJoinRequest,
  rejectJoinRequest,
} = ownerController;

// Export default object for default imports
export default {
  ...orgController,
  ...memberController,
  ...ownerController,
};

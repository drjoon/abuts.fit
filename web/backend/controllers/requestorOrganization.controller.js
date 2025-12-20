import * as orgController from "./requestorOrganization/org.controller.js";
import * as memberController from "./requestorOrganization/member.controller.js";
import * as ownerController from "./requestorOrganization/owner.controller.js";

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
  addCoOwner,
  removeCoOwner,
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

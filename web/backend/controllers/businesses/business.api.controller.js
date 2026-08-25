// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
import * as businessController from "./business.controller.js";
import * as memberController from "./business.member.controller.js";
import * as ownerController from "./business.owner.controller.js";
import * as departmentController from "./business.department.controller.js";

export const {
  getMyBusiness,
  searchBusinesses,
  getBusinessPublicById,
  updateMyBusiness,
  getMyAutoMatchParticipation,
  setMyAutoMatchParticipation,
  clearMyBusinessLicense,
  checkBusinessNumberDuplicate,
  lookupPostalCode,
  updateBusinessShippingAddress,
  getMyRequestSettings,
  updateMyRequestSettings,
  exitMyDemoMode,
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

export const {
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  assignStaffDepartment,
} = departmentController;

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
  exitMyDemoMode,
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
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  assignStaffDepartment,
};

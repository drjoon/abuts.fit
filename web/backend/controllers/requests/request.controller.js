import * as creationController from "./creation.controller.js";
import * as commonController from "./common.controller.js";
import * as dashboardController from "./dashboard.controller.js";
import * as shippingController from "./shipping.controller.js";

// Re-export individual functions for named imports
export const {
  createRequest,
  cloneRequestToDraft,
  createRequestsFromDraft,
  checkDuplicateCaseInfo,
} = creationController;

export const {
  getAllRequests,
  getMyRequests,
  getRequestById,
  updateRequest,
  updateRequestStatus,
  deleteRequest,
  updateReviewStatusByStage,
  getOriginalFileUrl,
  getCamFileUrl,
  getStlFileUrl,
  getStageFileUrl,
  saveStageFile,
  deleteStageFile,
  getNcFileUrl,
  getRequestSummaryByRequestId,
  ensureNcFileOnBridgeStoreByRequestId,
  saveNcFileAndMoveToMachining,
  deleteNcFileAndRollbackCam,
} = commonController;

export const {
  getAssignedDashboardSummary,
  getMyDashboardSummary,
  getDashboardRiskSummary,
  getMyPricingReferralStats,
  getMyReferralDirectMembers,
} = dashboardController;

export const {
  updateMyShippingMode,
  getShippingEstimate,
  getMyBulkShipping,
  createMyBulkShipping,
  getMyShippingPackagesSummary,
  registerShipment,
  rollbackMailboxShipping,
  printHanjinLabels,
  requestHanjinPickup,
  cancelHanjinPickup,
  simulateHanjinWebhook,
} = shippingController;

// Export default object for default imports
export default {
  ...creationController,
  ...commonController,
  ...dashboardController,
  ...shippingController,
};

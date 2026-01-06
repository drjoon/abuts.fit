import * as creationController from "./request/creation.controller.js";
import * as commonController from "./request/common.controller.js";
import * as dashboardController from "./request/dashboard.controller.js";
import * as shippingController from "./request/shipping.controller.js";

// Re-export individual functions for named imports
export const {
  createRequest,
  cloneRequestToDraft,
  createRequestsFromDraft,
  hasDuplicateCase,
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
  getStageFileUrl,
  saveStageFile,
  deleteStageFile,
  getNcFileUrl,
  saveNcFileAndMoveToMachining,
  deleteNcFileAndRollbackCam,
} = commonController;

export const {
  getDiameterStats,
  getMyDashboardSummary,
  getDashboardRiskSummary,
  getMyPricingReferralStats,
} = dashboardController;

export const {
  updateMyShippingMode,
  getShippingEstimate,
  getMyBulkShipping,
  createMyBulkShipping,
} = shippingController;

// Export default object for default imports
export default {
  ...creationController,
  ...commonController,
  ...dashboardController,
  ...shippingController,
};

import * as creationController from "./creation.controller.js";
import * as commonController from "./common.controller.js";
import * as dashboardController from "./dashboard.controller.js";
import * as shippingController from "./shipping.controller.js";
import * as shippingHanjinController from "./shipping.Hanjin.controller.js";
import * as shippingRequestorController from "./shipping.Requestor.controller.js";
import * as packingPrintController from "./packingPrint.controller.js";

// Re-export individual functions for named imports
export const {
  createRequest,
  createRequestsBulk,
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
} = shippingRequestorController;

export const { rollbackMailboxShipping, syncHanjinTracking } =
  shippingController;

export const {
  printHanjinLabels,
  validateHanjinCustomerCheck,
  requestHanjinPickup,
  cancelHanjinPickup,
  getWblPrintSettings,
  getWblPrinters,
  requestHanjinPickupAndPrint,
} = shippingHanjinController;

export const {
  getPackPrinters,
  printPackPackingLabel,
  printPackZpl,
  getPackPrintSettings,
} = packingPrintController;

// Export default object for default imports
export default {
  ...creationController,
  ...commonController,
  ...dashboardController,
  ...shippingRequestorController,
  ...shippingController,
  ...shippingHanjinController,
  ...packingPrintController,
};

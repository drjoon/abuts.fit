// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/modules/requests/request.routes.js
// - web/backend/controllers/requests/common.review.controller.js
// - web/backend/controllers/requests/common.requests.controller.js
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
  updateRndDoneStatus,
  updateRndUnmachinableStatus,
  updateRndHexRotation,
  updateRequestAnodizingOverride,
  updateRequestWideSplitOverride,
  continueRndUnmachinableByRequestor,
  confirmRndUnmachinableByRequestor,
  confirmAllRndUnmachinableByRequestor,
  updateRndMemo,
  updateRequestStatus,
  updateRequestStatusBatch,
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
  getRndUnmachinableReasonOptions,
  saveRndUnmachinableReasonOptions,
  getManualPickupReasonOptions,
  saveManualPickupReasonOptions,
  getPackingScrewLotSettings,
  savePackingScrewLotSettings,
  assignPackingScrewLotToRequest,
  ensureNcFileOnBridgeStoreByRequestId,
  saveNcFileAndMoveToMachining,
  deleteNcFileAndRollbackCam,
  cloneAsSample,
  cloneFromSampleToRequest,
  cloneRequestsForRecall,
} = commonController;

export const {
  getAssignedDashboardSummary,
  getMyDashboardCardsSummary,
  getMyDashboardSummary,
  getDashboardRiskSummary,
  getMyPricingReferralStats,
  getMyReferralDirectMembers,
  getUnmachinableOverview,
} = dashboardController;

export const {
  updateMyShippingMode,
  getShippingEstimate,
  getMyBulkShipping,
  createMyBulkShipping,
  getMyShippingPackagesSummary,
  registerShipment,
} = shippingRequestorController;

export const {
  rollbackMailboxShipping,
  setMailboxForceTodayShipment,
  getShippingMailboxSummary,
  getShippingMailboxRequests,
  updateShippingReceiverAddress,
} = shippingController;
export const { resetMailboxShippingWorkingState } = shippingController;

export const {
  printHanjinLabels,
  validateHanjinCustomerCheck,
  requestHanjinPickup,
  cancelHanjinPickup,
  getWblPrintSettings,
  getWblPrinters,
  requestHanjinPickupAndPrint,
  wblPrintPng,
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

// related files:
// - web/backend/controllers/salesTeam/salesTeam.controller.js
// - web/backend/controllers/salesTeam/customerRequirement.controller.js
// - web/backend/app.js
import { Router } from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import {
  getSalesHome,
  listAccounts,
  getAccount,
  createAccount,
  updateAccount,
  deleteAccount,
  listVisits,
  createVisit,
  updateVisit,
  deleteVisit,
  listDailyReports,
  getDailyReport,
  upsertDailyReport,
  getSalesStats,
  getReferralInfo,
  optimizeRoute,
  searchPlatformBusinesses,
  suggestPlaces,
} from "../../controllers/salesTeam/salesTeam.controller.js";
import {
  listCustomerRequirements,
  getCustomerRequirement,
  createCustomerRequirement,
  updateCustomerRequirement,
  upsertWorkUpdate,
  deleteCustomerRequirement,
} from "../../controllers/salesTeam/customerRequirement.controller.js";
import {
  salesTeamListInquiries,
  salesTeamResolveInquiry,
} from "../../controllers/support/support.controller.js";

const router = Router();

router.use(authenticate);

const salesOpsRoles = ["salesTeam", "admin"];
const requirementRoles = ["salesTeam", "admin", "internalLab", "devops"];

router.get("/home", authorize(salesOpsRoles), getSalesHome);
router.get("/stats", authorize(salesOpsRoles), getSalesStats);
router.get("/referral", authorize(salesOpsRoles), getReferralInfo);
router.post("/route/optimize", authorize(salesOpsRoles), optimizeRoute);
router.get("/places/suggest", authorize(salesOpsRoles), suggestPlaces);
router.get(
  "/platform-businesses",
  authorize(salesOpsRoles),
  searchPlatformBusinesses,
);

router.get("/accounts", authorize(salesOpsRoles), listAccounts);
router.get("/accounts/:id", authorize(salesOpsRoles), getAccount);
router.post("/accounts", authorize(salesOpsRoles), createAccount);
router.patch("/accounts/:id", authorize(salesOpsRoles), updateAccount);
router.delete("/accounts/:id", authorize(salesOpsRoles), deleteAccount);

router.get("/visits", authorize(salesOpsRoles), listVisits);
router.post("/visits", authorize(salesOpsRoles), createVisit);
router.patch("/visits/:id", authorize(salesOpsRoles), updateVisit);
router.delete("/visits/:id", authorize(salesOpsRoles), deleteVisit);

router.get("/daily-reports", authorize(salesOpsRoles), listDailyReports);
router.get("/daily-reports/:ymd", authorize(salesOpsRoles), getDailyReport);
router.put("/daily-reports", authorize(salesOpsRoles), upsertDailyReport);

router.get("/inquiries", authorize(salesOpsRoles), salesTeamListInquiries);
router.patch(
  "/inquiries/:id",
  authorize(salesOpsRoles),
  salesTeamResolveInquiry,
);

router.get(
  "/requirements",
  authorize(requirementRoles),
  listCustomerRequirements,
);
router.get(
  "/requirements/:id",
  authorize(requirementRoles),
  getCustomerRequirement,
);
router.post(
  "/requirements",
  authorize(salesOpsRoles),
  createCustomerRequirement,
);
router.patch(
  "/requirements/:id",
  authorize(salesOpsRoles),
  updateCustomerRequirement,
);
router.put(
  "/requirements/:id/work",
  authorize(requirementRoles),
  upsertWorkUpdate,
);
router.delete(
  "/requirements/:id",
  authorize(salesOpsRoles),
  deleteCustomerRequirement,
);

export default router;

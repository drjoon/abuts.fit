import { Router } from "express";
const router = Router();
import adminController from "../controllers/admin.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";
import {
  adminListBankTransactions,
  adminListChargeOrders,
  adminManualMatch,
  adminUpsertBankTransaction,
} from "../controllers/adminCreditBPlan.controller.js";
import {
  adminListBonusGrants,
  adminOverrideWelcomeBonus,
} from "../controllers/adminBonusGrant.controller.js";
import {
  adminListMails,
  adminGetMail,
  adminSendMail,
  adminGetMailUploadUrl,
  adminGetMailDownloadUrl,
} from "../controllers/mail.controller.js";
import {
  adminListTaxInvoiceDrafts,
  adminGetTaxInvoiceDraft,
  adminUpdateTaxInvoiceDraft,
  adminApproveTaxInvoiceDraft,
  adminRejectTaxInvoiceDraft,
  adminCancelTaxInvoiceDraft,
} from "../controllers/adminTaxInvoice.controller.js";
import { adminOverrideOrganizationVerification } from "../controllers/admin.controller.js";
import {
  adminSendSms,
  adminListSms,
} from "../controllers/adminSms.controller.js";

// 모든 라우트에 인증 및 관리자 권한 확인 미들웨어 적용
router.use(authenticate);
router.use(authorize(["admin"]));

// 사용자 관리
router.get("/users", adminController.getAllUsers);
router.get("/users/:id", adminController.getUserById);
router.put("/users/:id", adminController.updateUser);
router.delete("/users/:id", adminController.deleteUser);
router.patch("/users/:id/toggle-active", adminController.toggleUserActive);
router.patch("/users/:id/change-role", adminController.changeUserRole);

// 의뢰 관리
router.get("/requests", adminController.getAllRequests);
router.get("/requests/:id", adminController.getRequestById);
router.patch("/requests/:id/status", adminController.updateRequestStatus);
router.patch("/requests/:id/assign", adminController.assignManufacturer);

// 대시보드 통계
router.get("/dashboard", adminController.getDashboardStats);
router.get("/credits/b-plan/charge-orders", adminListChargeOrders);
router.get("/credits/b-plan/bank-transactions", adminListBankTransactions);
router.post(
  "/credits/b-plan/bank-transactions/upsert",
  adminUpsertBankTransaction
);
router.post("/credits/b-plan/match", adminManualMatch);

// 가격/리퍼럴 정책 통계
router.get("/pricing-stats", adminController.getPricingStats);
router.get("/pricing-stats/users", adminController.getPricingStatsByUser);

// 시스템 로그
router.get("/logs", adminController.getSystemLogs);

// 활동 로그
router.get("/activity-logs", adminController.getActivityLogs);

// 시스템 설정
router.get("/settings", adminController.getSystemSettings);
router.put("/settings", adminController.updateSystemSettings);

// 메일 관리
router.get("/mails", adminListMails);
router.get("/mails/:id", adminGetMail);
router.post("/mails/send", adminSendMail);
router.post("/mails/upload-url", adminGetMailUploadUrl);
router.post("/mails/download-url", adminGetMailDownloadUrl);

// 보너스 지급 내역 / 예외 지급
router.get("/bonus-grants", adminListBonusGrants);
router.post("/bonus-grants/welcome-bonus/override", adminOverrideWelcomeBonus);

// 세금계산서(드래프트) 관리
router.get("/tax-invoices/drafts", adminListTaxInvoiceDrafts);
router.get("/tax-invoices/drafts/:id", adminGetTaxInvoiceDraft);
router.patch("/tax-invoices/drafts/:id", adminUpdateTaxInvoiceDraft);
router.post("/tax-invoices/drafts/:id/approve", adminApproveTaxInvoiceDraft);
router.post("/tax-invoices/drafts/:id/reject", adminRejectTaxInvoiceDraft);
router.post("/tax-invoices/drafts/:id/cancel", adminCancelTaxInvoiceDraft);

// 사업자 검증 수동 처리
router.post(
  "/organizations/:id/verification/override",
  adminOverrideOrganizationVerification
);

// 문자(SMS) 발송/이력
router.post("/sms/send", adminSendSms);
router.get("/sms/history", adminListSms);

export default router;

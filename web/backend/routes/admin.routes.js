import { Router } from "express";
const router = Router();
import adminController from "../controllers/admin.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";
import {
  adminListBankTransactions,
  adminListChargeOrders,
  adminManualMatch,
  adminUpsertBankTransaction,
  adminRequestBankTransactions,
  adminGetBankTransactions,
  adminVerifyChargeOrder,
  adminLockChargeOrder,
  adminUnlockChargeOrder,
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
  adminMarkAsRead,
  adminMarkAsUnread,
  adminMoveToSpam,
  adminTrashMail,
  adminRestoreToSent,
  adminEmptyTrash,
  adminEmptySpam,
  adminEmptySent,
} from "../controllers/mail.controller.js";
import {
  adminListTaxInvoiceDrafts,
  adminGetTaxInvoiceDraft,
  adminUpdateTaxInvoiceDraft,
  adminApproveTaxInvoiceDraft,
  adminRejectTaxInvoiceDraft,
  adminCancelTaxInvoiceDraft,
  adminIssueTaxInvoice,
  adminGetTaxInvoiceStatus,
  adminCancelIssuedTaxInvoice,
} from "../controllers/adminTaxInvoice.controller.js";
import { adminOverrideOrganizationVerification } from "../controllers/admin.controller.js";
import {
  adminSendSms,
  adminListSms,
  adminSendKakaoOrSms,
  adminListKakaoTemplates,
} from "../controllers/adminSms.controller.js";
import {
  adminGetCreditStats,
  adminGetOrganizationCredits,
  adminGetOrganizationCreditDetail,
} from "../controllers/adminCredit.controller.js";
import {
  adminGetQueueStats,
  adminListQueueTasks,
  adminGetQueueTask,
  adminRetryQueueTask,
  adminCancelQueueTask,
} from "../controllers/adminPopbillQueue.controller.js";

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

// 크레딧 관리
router.get("/credits/stats", adminGetCreditStats);
router.get("/credits/organizations", adminGetOrganizationCredits);
router.get("/credits/organizations/:id", adminGetOrganizationCreditDetail);
router.get("/credits/b-plan/charge-orders", adminListChargeOrders);
router.get("/credits/b-plan/bank-transactions", adminListBankTransactions);
router.post(
  "/credits/b-plan/bank-transactions/upsert",
  adminUpsertBankTransaction
);
router.post("/credits/b-plan/match", adminManualMatch);
router.post(
  "/credits/b-plan/bank-transactions/request",
  adminRequestBankTransactions
);
router.get(
  "/credits/b-plan/bank-transactions/search",
  adminGetBankTransactions
);
router.post("/credits/b-plan/charge-orders/verify", adminVerifyChargeOrder);
router.post("/credits/b-plan/charge-orders/lock", adminLockChargeOrder);
router.post("/credits/b-plan/charge-orders/unlock", adminUnlockChargeOrder);

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
router.post("/mails/:id/read", adminMarkAsRead);
router.post("/mails/:id/unread", adminMarkAsUnread);
router.post("/mails/:id/spam", adminMoveToSpam);
router.post("/mails/:id/trash", adminTrashMail);
router.post("/mails/:id/restore-to-sent", adminRestoreToSent);
router.post("/mails/trash/empty", adminEmptyTrash);
router.post("/mails/spam/empty", adminEmptySpam);
router.post("/mails/sent/empty", adminEmptySent);

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
router.post("/tax-invoices/drafts/:id/issue", adminIssueTaxInvoice);
router.get("/tax-invoices/status", adminGetTaxInvoiceStatus);
router.post("/tax-invoices/cancel", adminCancelIssuedTaxInvoice);

// 사업자 검증 수동 처리
router.post(
  "/organizations/:id/verification/override",
  adminOverrideOrganizationVerification
);

// 문자(SMS) 발송/이력
router.post("/sms/send", adminSendSms);
router.get("/sms/history", adminListSms);

// 카카오톡 알림톡 + SMS (팝빌)
router.post("/messages/send", adminSendKakaoOrSms);
router.get("/kakao/templates", adminListKakaoTemplates);

// 팝빌 큐 모니터링
router.get("/popbill-queue/stats", adminGetQueueStats);
router.get("/popbill-queue/tasks", adminListQueueTasks);
router.get("/popbill-queue/tasks/:id", adminGetQueueTask);
router.post("/popbill-queue/tasks/:id/retry", adminRetryQueueTask);
router.post("/popbill-queue/tasks/:id/cancel", adminCancelQueueTask);

export default router;

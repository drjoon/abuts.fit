import { Router } from "express";
const router = Router();
import adminController, {
  triggerReferralSnapshotRecalc,
  getReferralSnapshotStatus,
} from "../../controllers/admin/admin.controller.js";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import {
  adminListBankTransactions,
  adminListChargeOrders,
  adminManualMatch,
  adminUpsertBankTransaction,
  adminGetBankTransactions,
  adminVerifyChargeOrder,
  adminLockChargeOrder,
  adminUnlockChargeOrder,
  adminApproveChargeOrder,
  adminRejectChargeOrder,
} from "../../controllers/admin/adminCreditBPlan.controller.js";
import {
  adminListBonusGrants,
  adminOverrideWelcomeBonus,
} from "../../controllers/admin/adminBonusGrant.controller.js";
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
} from "../../controllers/notifications/mail.controller.js";
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
} from "../../controllers/admin/adminTaxInvoice.controller.js";
import { adminOverrideOrganizationVerification } from "../../controllers/admin/admin.controller.js";
import {
  adminSendSms,
  adminListSms,
  adminSendKakaoOrSms,
  adminListKakaoTemplates,
} from "../../controllers/admin/adminSms.controller.js";
import {
  adminGetCreditStats,
  adminGetOrganizationLedger,
  adminGetOrganizationCredits,
  adminGetOrganizationCreditDetail,
  adminGetSalesmanCreditsOverview,
  adminGetSalesmanCredits,
  adminGetSalesmanLedger,
  adminCreateSalesmanPayout,
} from "../../controllers/admin/adminCredit.controller.js";
import {
  adminListBusinessRegistrationInquiries,
  adminGetBusinessRegistrationInquiry,
  adminResolveBusinessRegistrationInquiry,
} from "../../controllers/support/support.controller.js";
// 모든 라우트에 인증 및 관리자 권한 확인 미들웨어 적용
router.use(authenticate);
router.use(authorize(["admin"]));

// 사용자 관리
router.get("/users", adminController.getAllUsers);
router.post("/users", adminController.createUser);
router.get("/users/:id", adminController.getUserById);
router.put("/users/:id", adminController.updateUser);
router.delete("/users/:id", adminController.deleteUser);
router.patch("/users/:id/toggle-active", adminController.toggleUserActive);
router.patch("/users/:id/change-role", adminController.changeUserRole);
router.post("/users/:id/approve", adminController.approveUser);
router.post("/users/:id/reject", adminController.rejectUser);

// 의뢰 관리
router.get("/requests", adminController.getAllRequests);
router.get("/requests/:id", adminController.getRequestById);
router.patch("/requests/:id/status", adminController.updateRequestStatus);
router.patch("/requests/:id/assign", adminController.assignManufacturer);

// 대시보드 통계
router.get("/dashboard", adminController.getDashboardStats);

// 사업자등록 문의
router.get(
  "/business-registration-inquiries",
  adminListBusinessRegistrationInquiries,
);
router.get(
  "/business-registration-inquiries/:id",
  adminGetBusinessRegistrationInquiry,
);
router.patch(
  "/business-registration-inquiries/:id",
  adminResolveBusinessRegistrationInquiry,
);

// 크레딧 관리
router.get("/credits/stats", adminGetCreditStats);
router.get("/credits/organizations", adminGetOrganizationCredits);
router.get("/credits/organizations/:id", adminGetOrganizationCreditDetail);
router.get("/credits/organizations/:id/ledger", adminGetOrganizationLedger);
router.get("/credits/salesmen/overview", adminGetSalesmanCreditsOverview);
router.get("/credits/salesmen", adminGetSalesmanCredits);
router.get("/credits/salesmen/:id/ledger", adminGetSalesmanLedger);
router.post("/credits/salesmen/:id/payout", adminCreateSalesmanPayout);
router.get("/credits/b-plan/charge-orders", adminListChargeOrders);
router.get("/credits/b-plan/bank-transactions", adminListBankTransactions);
router.post(
  "/credits/b-plan/bank-transactions/upsert",
  authorize(["admin"], { adminRoles: ["owner"] }),
  adminUpsertBankTransaction,
);
router.post(
  "/credits/b-plan/match",
  authorize(["admin"], { adminRoles: ["owner"] }),
  adminManualMatch,
);
router.get(
  "/credits/b-plan/bank-transactions/search",
  adminGetBankTransactions,
);
router.post(
  "/credits/b-plan/charge-orders/verify",
  authorize(["admin"], { adminRoles: ["owner"] }),
  adminVerifyChargeOrder,
);
router.post(
  "/credits/b-plan/charge-orders/lock",
  authorize(["admin"], { adminRoles: ["owner"] }),
  adminLockChargeOrder,
);
router.post(
  "/credits/b-plan/charge-orders/unlock",
  authorize(["admin"], { adminRoles: ["owner"] }),
  adminUnlockChargeOrder,
);
router.post(
  "/credits/b-plan/charge-orders/:id/approve",
  authorize(["admin"], { adminRoles: ["owner"] }),
  adminApproveChargeOrder,
);
router.post(
  "/credits/b-plan/charge-orders/:id/reject",
  authorize(["admin"], { adminRoles: ["owner"] }),
  adminRejectChargeOrder,
);

// 가격/리퍼럴 정책 통계
router.get("/pricing-stats", adminController.getPricingStats);
router.get("/pricing-stats/users", adminController.getPricingStatsByUser);

// 리퍼럴 그룹
router.get("/referral-groups", adminController.getReferralGroups);
router.get("/referral-groups/:leaderId", adminController.getReferralGroupTree);

// 리퍼럴 스냅샷
router.get("/referral-snapshot/status", getReferralSnapshotStatus);
router.post(
  "/referral-snapshot/recalc",
  authorize(["admin"], { adminRoles: ["owner"] }),
  triggerReferralSnapshotRecalc,
);

// 시스템 로그
router.get("/logs", adminController.getSystemLogs);

// 활동 로그
router.get(
  "/activity-logs",
  authorize(["admin"]),
  adminController.getActivityLogs,
);

// 시스템 설정
router.get(
  "/settings",
  authorize(["admin"]),
  adminController.getSystemSettings,
);
router.put(
  "/settings",
  authorize(["admin"]),
  adminController.updateSystemSettings,
);

// 보안 설정
router.get(
  "/security-settings",
  authorize(["admin"]),
  adminController.getSecuritySettings,
);
router.put(
  "/security-settings",
  authorize(["admin"]),
  adminController.updateSecuritySettings,
);

// 보안 통계
router.get(
  "/security-stats",
  authorize(["admin"]),
  adminController.getSecurityStats,
);

// 보안 로그
router.get(
  "/security-logs",
  authorize(["admin"]),
  adminController.getSecurityLogs,
);

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
router.post(
  "/bonus-grants/welcome-bonus/override",
  authorize(["admin"], { adminRoles: ["owner"] }),
  adminOverrideWelcomeBonus,
);

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
  adminOverrideOrganizationVerification,
);

// 문자(SMS) 발송/이력
router.post("/sms/send", adminSendSms);
router.get("/sms/history", adminListSms);

// 카카오톡 알림톡 + SMS (팝빌)
router.post("/messages/send", adminSendKakaoOrSms);
router.get("/kakao/templates", adminListKakaoTemplates);

export default router;

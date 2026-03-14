import { Router } from "express";
const router = Router();

import {
  triggerReferralSnapshotRecalc,
  getReferralSnapshotStatus,
  getReferralGroups,
  getReferralGroupTree,
  getPricingStats,
  getPricingStatsByUser,
  getSecurityStats,
} from "../../controllers/admin/admin.controller.js";
import {
  getAllUsers,
  createUser,
  getUserById,
  updateUser,
  deleteUser,
  toggleUserActive,
  changeUserRole,
  approveUser,
  rejectUser,
} from "../../controllers/admin/admin.users.controller.js";
import {
  getAllRequests,
  getRequestById,
  updateRequestStatus,
  assignManufacturer,
} from "../../controllers/admin/admin.requests.controller.js";
import { getDashboardStats } from "../../controllers/admin/admin.dashboard.controller.js";
import {
  getSystemLogs,
  getActivityLogs,
  getSecurityLogs,
} from "../../controllers/admin/admin.logs.controller.js";
import {
  getSystemSettings,
  updateSystemSettings,
  getSecuritySettings,
  updateSecuritySettings,
  getCreditSettings,
  updateCreditSettings,
} from "../../controllers/admin/admin.settings.controller.js";
import { getAllFiles } from "../../controllers/admin/admin.files.controller.js";
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
  adminCancelBonusGrant,
  adminListBonusGrants,
  adminOverrideWelcomeBonus,
  adminGrantFreeShippingCredit,
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
import { adminOverrideOrganizationVerification } from "../../controllers/admin/admin.organization.controller.js";
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
router.get("/users", getAllUsers);
router.post("/users", createUser);
router.get("/users/:id", getUserById);
router.put("/users/:id", updateUser);
router.delete("/users/:id", deleteUser);
router.patch("/users/:id/toggle-active", toggleUserActive);
router.patch("/users/:id/change-role", changeUserRole);
router.post("/users/:id/approve", approveUser);
router.post("/users/:id/reject", rejectUser);

// 의뢰 관리
router.get("/requests", getAllRequests);
router.get("/requests/:id", getRequestById);
router.patch("/requests/:id/status", updateRequestStatus);
router.patch("/requests/:id/assign", assignManufacturer);

// 대시보드 통계
router.get("/dashboard", getDashboardStats);

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
router.get("/pricing-stats", getPricingStats);
router.get("/pricing-stats/users", getPricingStatsByUser);

// 리퍼럴 그룹
router.get("/referral-groups", getReferralGroups);
router.get("/referral-groups/:leaderId", getReferralGroupTree);

// 리퍼럴 스냅샷
router.get("/referral-snapshot/status", getReferralSnapshotStatus);
router.post(
  "/referral-snapshot/recalc",
  authorize(["admin"], { adminRoles: ["owner"] }),
  triggerReferralSnapshotRecalc,
);

// 시스템 로그
router.get("/logs", getSystemLogs);

// 활동 로그
router.get("/activity-logs", authorize(["admin"]), getActivityLogs);

// 시스템 설정
router.get("/settings", authorize(["admin"]), getSystemSettings);
router.put("/settings", authorize(["admin"]), updateSystemSettings);

// 크레딧 설정
router.get("/settings/credits", authorize(["admin"]), getCreditSettings);
router.patch("/settings/credits", authorize(["admin"]), updateCreditSettings);

// 보안 설정
router.get("/security-settings", authorize(["admin"]), getSecuritySettings);
router.put("/security-settings", authorize(["admin"]), updateSecuritySettings);

// 보안 통계
router.get("/security-stats", authorize(["admin"]), getSecurityStats);

// 보안 로그
router.get("/security-logs", authorize(["admin"]), getSecurityLogs);

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
router.post(
  "/bonus-grants/free-shipping-credit/grant",
  authorize(["admin"], { adminRoles: ["owner"] }),
  adminGrantFreeShippingCredit,
);
router.post(
  "/bonus-grants/:id/cancel",
  authorize(["admin"], { adminRoles: ["owner"] }),
  adminCancelBonusGrant,
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

// 마이그레이션: Machine manufacturer -> manufacturerBusinessId
router.post(
  "/migrations/machine-manufacturer",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const Machine = (await import("../../models/machine.model.js")).default;
      const User = (await import("../../models/user.model.js")).default;

      // 기존 manufacturer 필드가 있는 모든 Machine 문서 조회
      const machines = await Machine.find({
        manufacturer: { $exists: true, $ne: null },
      });
      console.log(
        `[Migration] Found ${machines.length} machines with manufacturer field`,
      );

      let updated = 0;
      let errors = 0;

      for (const machine of machines) {
        try {
          const manufacturerId = machine.manufacturer;

          // User에서 business 정보 조회
          const user = await User.findById(manufacturerId)
            .select("business")
            .lean();

          if (user && user.business) {
            // manufacturerBusinessId 설정 및 manufacturer 필드 제거
            await Machine.findByIdAndUpdate(machine._id, {
              $set: { manufacturerBusinessId: user.business },
              $unset: { manufacturer: "" },
            });
            updated++;
            console.log(
              `[Migration] ✓ Updated machine ${machine.uid}: ${manufacturerId} -> ${user.business}`,
            );
          } else {
            console.warn(
              `[Migration] ⚠ User ${manufacturerId} not found or has no business for machine ${machine.uid}`,
            );
            errors++;
          }
        } catch (e) {
          console.error(
            `[Migration] ✗ Error migrating machine ${machine.uid}:`,
            e.message,
          );
          errors++;
        }
      }

      res.json({
        success: true,
        message: `Migration complete: ${updated} updated, ${errors} errors`,
        data: { updated, errors, total: machines.length },
      });
    } catch (error) {
      console.error("Migration failed:", error);
      res.status(500).json({
        success: false,
        message: "Migration failed",
        error: error.message,
      });
    }
  },
);

export default router;

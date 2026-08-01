// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
export type AdminCreditLedgerType =
  | "CHARGE_PAID"
  | "CHARGE_FREE_REQUEST"
  | "CHARGE_FREE_SHIPPING"
  | "SPEND_PAID"
  | "SPEND_FREE_REQUEST"
  | "SPEND_FREE_SHIPPING"
  | "REFUND" // legacy 조회 호환 (앱 안정화 후 삭제 예정)
  | "ADJUST";

export type AdminLedgerItem = {
  _id: string;
  type: AdminCreditLedgerType;
  amount: number;
  spentPaidAmount?: number | null;
  spentFreeAmount?: number | null;
  refType?: string;
  refId?: string | null;
  refRequestId?: string;
  uniqueKey: string;
  createdAt: string;
};

export type AdminLedgerResponse = {
  success: boolean;
  data: {
    items: AdminLedgerItem[];
    total: number;
    page: number;
    pageSize: number;
  };
  message?: string;
};

export type CreditStats = {
  totalOrgs: number;
  totalChargeOrders: number;
  totalBankTransactions: number;
  pendingChargeOrders: number;
  matchedChargeOrders: number;
  newBankTransactions: number;
  matchedBankTransactions: number;
  totalCharged: number;
  totalSpent: number;
  totalFree?: number;
  totalFreeRequest?: number;
  totalFreeShipping?: number;
  totalChargedFreeAmount?: number;
  totalSpentPaidAmount?: number;
  totalSpentFreeAmount?: number;
  totalSpentFreeRequestAmount?: number;
  totalSpentFreeShippingAmount?: number;
  totalPaidCredit?: number;
  totalFreeRequestCredit?: number;
  totalFreeShippingCredit?: number;
};

export type SalesmanCreditRow = {
  salesmanId: string;
  name: string;
  email: string;
  role?: string;
  referralCode?: string;
  active: boolean;
  referredSalesmanCount?: number;
  wallet: {
    earnedAmount: number;
    paidOutAmount: number;
    adjustedAmount: number;
    balanceAmount: number;
    earnedAmountPeriod: number;
    paidOutAmountPeriod: number;
    adjustedAmountPeriod: number;
    balanceAmountPeriod: number;
  };
  performance30d: {
    referredOrgCount: number;
    revenueAmount: number;
    bonusAmount?: number;
    orderCount: number;
    commissionAmount: number;
  };
};

export type SalesmanCreditsOverview = {
  ymd: string;
  periodKey: string;
  rangeStartUtc: string;
  rangeEndUtc: string;
  salesmenCount: number;
  referral: {
    paidRevenueAmount: number;
    bonusRevenueAmount: number;
    orderCount: number;
  };
  commission: {
    totalAmount: number;
    amount: number;
  };
  walletPeriod: {
    earnedAmount: number;
    paidOutAmount: number;
    adjustedAmount: number;
    balanceAmount: number;
  };
  computedAt?: string | null;
};

export type BusinessCredit = {
  _id: string;
  businessAnchorId?: string | null;
  businessType?: string;
  name: string;
  companyName: string;
  businessNumber: string;
  representativeName?: string;
  address?: string;
  addressDetail?: string;
  zipCode?: string;
  phoneNumber?: string;
  businessEmail?: string;
  businessItem?: string;
  businessCategory?: string;
  startDate?: string;
  ownerName?: string;
  ownerEmail?: string;
  ownerRole?: string;
  isFreeCreditEligible?: boolean;
  balance: number;
  paidBalance: number;
  freeBalance?: number;
  paidCredit?: number;
  freeRequestCredit?: number;
  freeShippingCredit?: number;
  spentAmount?: number;
  chargedPaidAmount?: number;
  chargedFreeAmount?: number;
  chargedFreeRequestAmount?: number;
  chargedFreeShippingAmount?: number;
  spentPaidAmount?: number;
  spentFreeAmount?: number;
  spentFreeRequestAmount?: number;
  spentFreeShippingAmount?: number;
};

export type ChargeOrder = {
  _id: string;
  status: string;
  depositCode: string;
  supplyAmount: number;
  vatAmount: number;
  amountTotal: number;
  expiresAt?: string;
  matchedAt?: string;
  createdAt?: string;
  businessAnchorId?: string;
  adminApprovalStatus?: "PENDING" | "APPROVED" | "REJECTED";
  adminApprovalNote?: string;
  adminApprovalAt?: string;
  adminApprovalBy?: { name?: string; email?: string };
};

export type BankTransaction = {
  _id: string;
  externalId: string;
  tranAmt: number;
  printedContent: string;
  occurredAt: string;
  status: string;
  depositCode?: string;
  chargeOrderId?: string;
  matchedAt?: string;
};

export type FreeCreditAmount = 30000 | 50000 | 300000 | 500000;

export type FreeCreditGrantHistoryRow = {
  _id: string;
  businessNumber: string;
  amount: number;
  source?: string;
  overrideReason?: string;
  isOverride?: boolean;
  createdAt?: string;
  canceledAt?: string | null;
  cancelReason?: string;
  hasSpent?: boolean;
};


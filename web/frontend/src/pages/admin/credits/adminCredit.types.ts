export type AdminCreditLedgerType =
  | "CHARGE"
  | "BONUS"
  | "SPEND"
  | "REFUND"
  | "ADJUST";

export type AdminLedgerItem = {
  _id: string;
  type: AdminCreditLedgerType;
  amount: number;
  spentPaidAmount?: number | null;
  spentBonusAmount?: number | null;
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
  totalBonus: number;
  totalSpentPaidAmount?: number;
  totalSpentBonusAmount?: number;
  totalPaidBalance?: number;
  totalBonusBalance?: number;
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
    level1OrgCount?: number;
    revenueAmount: number;
    directRevenueAmount?: number;
    level1RevenueAmount?: number;
    bonusAmount?: number;
    directBonusAmount?: number;
    level1BonusAmount?: number;
    orderCount: number;
    commissionAmount: number;
    myCommissionAmount?: number;
    level1CommissionAmount?: number;
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
    directAmount: number;
    indirectAmount: number;
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
  ownerName?: string;
  ownerEmail?: string;
  balance: number;
  paidBalance: number;
  bonusBalance: number;
  spentAmount?: number;
  chargedPaidAmount?: number;
  chargedBonusAmount?: number;
  spentPaidAmount?: number;
  spentBonusAmount?: number;
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

export type FreeCreditAmount = 30000 | 50000;

export type BonusGrantHistoryRow = {
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

import mongoose from "mongoose";

const adminSalesmanCreditsOverviewSnapshotSchema = new mongoose.Schema(
  {
    ymd: {
      type: String,
      required: true,
      index: true,
    },
    periodKey: {
      type: String,
      required: true,
      index: true,
    },
    rangeStartUtc: {
      type: Date,
      required: true,
    },
    rangeEndUtc: {
      type: Date,
      required: true,
    },
    salesmenCount: {
      type: Number,
      default: 0,
    },
    referral: {
      paidRevenueAmount: {
        type: Number,
        default: 0,
      },
      bonusRevenueAmount: {
        type: Number,
        default: 0,
      },
      orderCount: {
        type: Number,
        default: 0,
      },
    },
    commission: {
      totalAmount: {
        type: Number,
        default: 0,
      },
      directAmount: {
        type: Number,
        default: 0,
      },
      indirectAmount: {
        type: Number,
        default: 0,
      },
    },
    walletPeriod: {
      earnedAmount: {
        type: Number,
        default: 0,
      },
      paidOutAmount: {
        type: Number,
        default: 0,
      },
      adjustedAmount: {
        type: Number,
        default: 0,
      },
      balanceAmount: {
        type: Number,
        default: 0,
      },
    },
    computedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

adminSalesmanCreditsOverviewSnapshotSchema.index(
  { ymd: 1, periodKey: 1 },
  { unique: true },
);

const AdminSalesmanCreditsOverviewSnapshot = mongoose.model(
  "AdminSalesmanCreditsOverviewSnapshot",
  adminSalesmanCreditsOverviewSnapshotSchema,
);

export default AdminSalesmanCreditsOverviewSnapshot;

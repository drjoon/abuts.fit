import mongoose from "mongoose";

const TaxInvoiceDraftSchema = new mongoose.Schema(
  {
    chargeOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChargeOrder",
      required: true,
      unique: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RequestorOrganization",
      required: true,
    },
    status: {
      type: String,
      enum: [
        "PENDING_APPROVAL",
        "APPROVED",
        "REJECTED",
        "SENT",
        "FAILED",
        "CANCELLED",
      ],
      default: "PENDING_APPROVAL",
    },
    supplyAmount: { type: Number, required: true },
    vatAmount: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    buyer: {
      bizNo: String,
      corpName: String,
      ceoName: String,
      addr: String,
      bizType: String,
      bizClass: String,
      contactName: String,
      contactEmail: String,
      contactTel: String,
    },
    hometaxTrxId: { type: String, default: null },
    failReason: { type: String, default: null },
    approvedAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

TaxInvoiceDraftSchema.index({ status: 1, updatedAt: -1 });

const TaxInvoiceDraft = mongoose.model(
  "TaxInvoiceDraft",
  TaxInvoiceDraftSchema,
  "TaxInvoiceDraft"
);

export default TaxInvoiceDraft;

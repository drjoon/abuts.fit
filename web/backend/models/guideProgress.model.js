import mongoose from "mongoose";

const guideStepSchema = new mongoose.Schema(
  {
    stepId: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["pending", "done"],
      default: "pending",
      required: true,
    },
    doneAt: { type: Date, default: null },
  },
  { _id: false }
);

const guideProgressSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tourId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    steps: {
      type: [guideStepSchema],
      default: [],
    },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

guideProgressSchema.index({ user: 1, tourId: 1 }, { unique: true });

guideProgressSchema.statics.getDefaultSteps = (tourIdRaw) => {
  const tourId = String(tourIdRaw || "").trim();

  if (tourId === "requestor-onboarding") {
    return [
      "requestor.account.profileImage",
      "requestor.phone.number",
      "requestor.phone.code",
      "requestor.business.licenseUpload",
      "requestor.business.companyName",
      "requestor.business.representativeName",
      "requestor.business.phoneNumber",
      "requestor.business.businessNumber",
      "requestor.business.businessType",
      "requestor.business.businessItem",
      "requestor.business.email",
      "requestor.business.address",
    ].map((stepId) => ({ stepId, status: "pending", doneAt: null }));
  }

  if (tourId === "requestor-new-request") {
    return [
      "requestor.new_request.upload",
      "requestor.new_request.details",
      "requestor.new_request.shipping",
    ].map((stepId) => ({ stepId, status: "pending", doneAt: null }));
  }

  return [];
};

guideProgressSchema.statics.ensureForUser = async function ensureForUser(
  userId,
  tourId
) {
  const normalizedTourId = String(tourId || "").trim();

  let doc = await this.findOne({ user: userId, tourId: normalizedTourId });
  if (doc) return doc;

  doc = await this.create({
    user: userId,
    tourId: normalizedTourId,
    steps: this.getDefaultSteps(normalizedTourId),
    finishedAt: null,
  });

  return doc;
};

const GuideProgress = mongoose.model("GuideProgress", guideProgressSchema);

export default GuideProgress;

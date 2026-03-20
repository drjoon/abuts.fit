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
  { _id: false },
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
  { timestamps: true },
);

guideProgressSchema.index({ user: 1, tourId: 1 }, { unique: true });

guideProgressSchema.statics.getDefaultSteps = (tourIdRaw) => {
  const tourId = String(tourIdRaw || "").trim();

  if (tourId === "shared-onboarding-wizard") {
    return [
      "wizard.profile",
      "wizard.phone",
      "wizard.role",
      "wizard.business",
    ].map((stepId) => ({ stepId, status: "pending", doneAt: null }));
  }

  return [];
};

guideProgressSchema.statics.ensureForUser = async function ensureForUser(
  userId,
  tourId,
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

import mongoose from "mongoose";

const signupVerificationSchema = new mongoose.Schema(
  {
    purpose: {
      type: String,
      enum: ["signup"],
      default: "signup",
      required: true,
      index: true,
    },
    channel: {
      type: String,
      enum: ["email", "phone"],
      required: true,
      index: true,
    },
    target: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    phoneE164: {
      type: String,
      default: "",
      trim: true,
    },
    codeHash: {
      type: String,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    dailySendDate: {
      type: String,
      default: "",
    },
    dailySendCount: {
      type: Number,
      default: 0,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    consumedAt: {
      type: Date,
      default: null,
    },
    consumedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

signupVerificationSchema.index(
  { purpose: 1, channel: 1, target: 1 },
  { unique: true }
);

const SignupVerification = mongoose.model(
  "SignupVerification",
  signupVerificationSchema
);

export default SignupVerification;

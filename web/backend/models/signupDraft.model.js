// related files:
// - web/backend/rules.md
// - web/backend/controllers/auth/signupDraft.controller.js
// - web/backend/modules/auth/auth.routes.js
import mongoose from "mongoose";

const signupDraftSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    path: {
      type: String,
      default: "/signup",
      trim: true,
    },
    wizardStep: {
      type: Number,
      enum: [1, 2, 3, 4],
      default: 1,
    },
    signupRole: {
      type: String,
      default: "requestor",
      trim: true,
    },
    enteredReferralCode: {
      type: String,
      default: "",
      trim: true,
    },
    selectedMethod: {
      type: String,
      default: "",
      trim: true,
    },
    emailVerificationSent: {
      type: Boolean,
      default: false,
    },
    lastEmailVerificationSentAt: {
      type: Date,
      default: null,
    },
    name: {
      type: String,
      default: "",
      trim: true,
    },
    email: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
      index: true,
    },
    // 가입 완료 전 임시 보관. expiresAt TTL로 자동 삭제.
    password: {
      type: String,
      default: "",
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

signupDraftSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const SignupDraft = mongoose.model("SignupDraft", signupDraftSchema);

export default SignupDraft;

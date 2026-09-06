// related files:
// - web/backend/controllers/salesTeam/customerRequirement.controller.js
// - web/backend/modules/salesTeam/salesTeam.routes.js
import mongoose from "mongoose";

export const CUSTOMER_REQUIREMENT_TARGET_ROLES = [
  "admin",
  "internalLab",
  "devops",
  "salesTeam",
];

const workUpdateSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: CUSTOMER_REQUIREMENT_TARGET_ROLES,
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    userName: { type: String, default: "", trim: true },
    status: {
      type: String,
      enum: ["todo", "inProgress", "done"],
      default: "todo",
    },
    note: { type: String, default: "", trim: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const customerRequirementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, default: "", trim: true },
    customerName: { type: String, default: "", trim: true },
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SalesAccount",
      default: null,
      index: true,
    },
    /** 복수 대상: admin | internalLab | devops | salesTeam */
    targetRoles: {
      type: [
        {
          type: String,
          enum: CUSTOMER_REQUIREMENT_TARGET_ROLES,
        },
      ],
      default: [],
      validate: {
        validator(v) {
          return Array.isArray(v) && v.length > 0;
        },
        message: "대상 역할을 하나 이상 선택하세요.",
      },
    },
    status: {
      type: String,
      enum: ["open", "inProgress", "done", "canceled"],
      default: "open",
      index: true,
    },
    createdByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    createdByName: { type: String, default: "", trim: true },
    workUpdates: { type: [workUpdateSchema], default: [] },
  },
  { timestamps: true },
);

customerRequirementSchema.index({ targetRoles: 1, status: 1, updatedAt: -1 });
customerRequirementSchema.index({ createdByUserId: 1, createdAt: -1 });

const CustomerRequirement = mongoose.model(
  "CustomerRequirement",
  customerRequirementSchema,
);

export default CustomerRequirement;

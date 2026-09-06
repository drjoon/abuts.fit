// related files:
// - web/backend/controllers/remoteSupport/remoteSupport.controller.js
// - web/backend/modules/remoteSupport/remoteSupport.routes.js
import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: { type: String, required: true, trim: true, maxlength: 2000 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const requesterSnapshotSchema = new mongoose.Schema(
  {
    name: { type: String, default: "", trim: true },
    role: { type: String, default: "", trim: true },
    requestorKind: {
      type: String,
      enum: ["practice", "lab"],
      default: null,
    },
    businessAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
    },
    businessName: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const remoteSupportSessionSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: [
        "pending",
        "accepted",
        "active",
        "ended",
        "cancelled",
        "declined",
      ],
      default: "pending",
      index: true,
    },
    initiatedBy: {
      type: String,
      enum: ["staff", "admin"],
      required: true,
    },
    requesterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    requesterSnapshot: {
      type: requesterSnapshotSchema,
      default: () => ({}),
    },
    requestedAt: { type: Date, default: Date.now, index: true },
    acceptedAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    durationMs: { type: Number, default: null },
    notes: { type: String, default: "", trim: true, maxlength: 8000 },
    ideaTags: {
      type: [{ type: String, trim: true, maxlength: 64 }],
      default: [],
    },
    messages: { type: [messageSchema], default: [] },
    endedBy: {
      type: String,
      enum: ["requester", "admin", "system", null],
      default: null,
    },
  },
  { timestamps: true },
);

remoteSupportSessionSchema.index({ status: 1, requestedAt: -1 });
remoteSupportSessionSchema.index({ adminId: 1, endedAt: -1 });
remoteSupportSessionSchema.index({ requesterId: 1, endedAt: -1 });

const RemoteSupportSession = mongoose.model(
  "RemoteSupportSession",
  remoteSupportSessionSchema,
);

export default RemoteSupportSession;

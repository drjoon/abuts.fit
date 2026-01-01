import mongoose from "mongoose";

const MailAttachmentSchema = new mongoose.Schema(
  {
    filename: { type: String },
    contentType: { type: String },
    size: { type: Number },
    s3Key: { type: String },
  },
  { _id: false }
);

const MailSchema = new mongoose.Schema(
  {
    folder: {
      type: String,
      enum: ["inbox", "sent", "trash", "spam"],
      default: "inbox",
      index: true,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    direction: {
      type: String,
      enum: ["inbound", "outbound"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "sent", "failed", "received"],
      default: "pending",
    },
    from: { type: String },
    to: [{ type: String }],
    cc: [{ type: String }],
    bcc: [{ type: String }],
    subject: { type: String },
    bodyText: { type: String },
    bodyHtml: { type: String },
    attachments: [MailAttachmentSchema],
    s3RawKey: { type: String }, // 원본 EML S3 경로
    messageId: { type: String },
    error: { type: String },
    receivedAt: { type: Date },
    sentAt: { type: Date },
    trashedAt: { type: Date },
    readAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

MailSchema.index({ direction: 1, createdAt: -1 });
MailSchema.index({ from: 1, createdAt: -1 });
MailSchema.index({ to: 1, createdAt: -1 });
MailSchema.index({ folder: 1, createdAt: -1 });
MailSchema.index({ subject: "text" });

const Mail = mongoose.model("Mail", MailSchema);

export default Mail;

import mongoose from "mongoose";

const MailboxSchema = new mongoose.Schema(
  {
    address: { type: String, required: true },
    name: { type: String },
  },
  { _id: false },
);

const AttachmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    contentType: { type: String, required: true },
    contentLength: { type: Number, required: true },
    contentID: { type: String },
    downloadToken: { type: String, required: true },
  },
  { _id: false },
);

const InboundEmailSchema = new mongoose.Schema(
  {
    // Brevo webhook payload fields
    uuid: { type: String, required: true, unique: true },
    messageId: { type: String, required: true },
    inReplyTo: { type: String },
    from: { type: MailboxSchema, required: true },
    to: [{ type: MailboxSchema, required: true }],
    recipients: [{ type: String }],
    cc: [{ type: MailboxSchema }],
    replyTo: { type: MailboxSchema },
    sentAtDate: { type: String, required: true },
    subject: { type: String },
    rawHtmlBody: { type: String },
    rawTextBody: { type: String },
    extractedMarkdownMessage: { type: String },
    extractedMarkdownSignature: { type: String },
    spamScore: { type: Number },
    attachments: [AttachmentSchema],
    headers: { type: mongoose.Schema.Types.Mixed },

    // 관리 필드
    isRead: { type: Boolean, default: false },
    isStarred: { type: Boolean, default: false },
    folder: {
      type: String,
      enum: ["inbox", "spam", "trash"],
      default: "inbox",
    },
    tags: [{ type: String }],
    
    // 처리 상태
    processedAt: { type: Date },
    processingError: { type: String },
  },
  {
    timestamps: true,
  },
);

// 인덱스
InboundEmailSchema.index({ uuid: 1 });
InboundEmailSchema.index({ messageId: 1 });
InboundEmailSchema.index({ "from.address": 1 });
InboundEmailSchema.index({ folder: 1, createdAt: -1 });
InboundEmailSchema.index({ isRead: 1, folder: 1 });
InboundEmailSchema.index({ sentAtDate: -1 });

const InboundEmail = mongoose.model("InboundEmail", InboundEmailSchema);

export default InboundEmail;

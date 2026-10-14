// related files:
// - web/backend/services/mailSenderNotSpam.service.js
// - web/backend/controllers/notifications/mail.controller.js
import mongoose from "mongoose";

const MailSenderNotSpamSchema = new mongoose.Schema(
  {
    address: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    lastMarkedAt: { type: Date, default: Date.now },
    sourceMailId: { type: mongoose.Schema.Types.ObjectId, ref: "Mail" },
  },
  { timestamps: true },
);

const MailSenderNotSpam = mongoose.model(
  "MailSenderNotSpam",
  MailSenderNotSpamSchema,
);

export default MailSenderNotSpam;

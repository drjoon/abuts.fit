// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
import mongoose from "mongoose";

const fileSchema = new mongoose.Schema(
  {
    originalName: {
      type: String,
      required: true,
    },
    encoding: String,
    mimetype: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
    },
    bucket: String,
    key: String,
    location: String,
    etag: String,
    contentType: String,
    metadata: {
      type: Map,
      of: String,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    relatedRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Request",
    },
    fileType: {
      type: String,
      enum: ["image", "document", "3d_model", "other"],
      required: true,
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    tags: [String],
  },
  {
    timestamps: true,
  }
);

// S3 키 조회(다운로드 권한·temp 업로드 정리)
fileSchema.index({ key: 1 });

const File = mongoose.model("File", fileSchema);

export default File;

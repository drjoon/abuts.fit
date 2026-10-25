// related files:
// - web/backend/services/eventVisitLog.service.js
// - web/backend/models/marketingEventVisit.model.js
import mongoose from "mongoose";

/** S3에 올린 방문 원본(ndjson.gz) 포인터. 본문은 버킷에만 있다. */
const marketingEventVisitChunkSchema = new mongoose.Schema(
  {
    s3Key: { type: String, required: true, trim: true, unique: true },
    bytes: { type: Number, default: 0 },
    lineCount: { type: Number, default: 0 },
    kstDate: { type: String, required: true, trim: true, index: true },
    slugs: { type: [String], default: [] },
    flushedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

const MarketingEventVisitChunk =
  mongoose.models.MarketingEventVisitChunk ||
  mongoose.model("MarketingEventVisitChunk", marketingEventVisitChunkSchema);

export default MarketingEventVisitChunk;

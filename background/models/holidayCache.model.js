import mongoose from "mongoose";

const holidayCacheSchema = new mongoose.Schema(
  {
    countryCode: { type: String, required: true },
    year: { type: Number, required: true },
    dates: { type: [String], default: [] },
    fetchedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

holidayCacheSchema.index({ countryCode: 1, year: 1 }, { unique: true });
holidayCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const HolidayCache = mongoose.model("HolidayCache", holidayCacheSchema);

export default HolidayCache;

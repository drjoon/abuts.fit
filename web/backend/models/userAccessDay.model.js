// related files:
// - web/backend/services/userAccess.service.js
// - web/backend/services/platformGrowthStats.service.js
// - web/backend/controllers/auth/auth.controller.js
// - web/backend/middlewares/auth.middleware.js
import mongoose from "mongoose";

const userAccessDaySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    /** KST civil day YYYY-MM-DD */
    ymd: {
      type: String,
      required: true,
      index: true,
    },
    role: {
      type: String,
      default: "",
    },
    firstAt: {
      type: Date,
      default: Date.now,
    },
    lastAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

userAccessDaySchema.index({ userId: 1, ymd: 1 }, { unique: true });

const UserAccessDay = mongoose.model("UserAccessDay", userAccessDaySchema);

export default UserAccessDay;

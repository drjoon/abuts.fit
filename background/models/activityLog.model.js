import { Schema, model } from "mongoose";

const activityLogSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        "USER_REGISTERED",
        "USER_LOGGED_IN",
        "USER_LOGGED_OUT",
        "LOGIN_SUCCESS",
        "LOGIN_FAILED_USER_NOT_FOUND",
        "LOGIN_FAILED_BAD_PASSWORD",
        "LOGIN_FAILED_INACTIVE_USER",
        "LOGIN_FAILED_ERROR",
        "AUTH_FAILURE",
        "CHANGE_PASSWORD_SUCCESS",
        "RESET_PASSWORD_SUCCESS",
        "FORGOT_PASSWORD_REQUEST",
        "PROFILE_UPDATED",
        "REQUEST_CREATED",
        "REQUEST_UPDATED",
        "REQUEST_DELETED",
        "FILE_UPLOADED",
        "FILE_DOWNLOADED",
        "FILE_DELETED",
        "COMMENT_ADDED",
        "테스트 액션",
        "CHARGE_APPROVED",
        "CHARGE_REJECTED",
      ],
    },
    details: {
      type: Schema.Types.Mixed,
      default: null,
    },
    ipAddress: {
      type: String,
    },
    severity: {
      type: String,
      enum: ["critical", "high", "medium", "low", "info"],
      default: "info",
    },
    status: {
      type: String,
      enum: ["blocked", "allowed", "failed", "success", "info"],
      default: "info",
    },
  },
  { timestamps: true }
);

const ActivityLog = model("ActivityLog", activityLogSchema);

export default ActivityLog;

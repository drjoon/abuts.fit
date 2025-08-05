import { Schema, model } from 'mongoose';

const activityLogSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        'USER_REGISTERED',
        'USER_LOGGED_IN',
        'USER_LOGGED_OUT',
        'PROFILE_UPDATED',
        'REQUEST_CREATED',
        'REQUEST_UPDATED',
        'REQUEST_DELETED',
        'FILE_UPLOADED',
        'FILE_DOWNLOADED',
        'FILE_DELETED',
        'COMMENT_ADDED',
        '테스트 액션'
      ],
    },
    details: {
      type: Schema.Types.Mixed,
      default: null,
    },
    ipAddress: {
      type: String,
    },
  },
  { timestamps: true }
);

const ActivityLog = model('ActivityLog', activityLogSchema);

export default ActivityLog;

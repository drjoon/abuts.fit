// related files:
// - web/backend/controllers/practiceTransfers/practiceTransferShare.controller.js
// - web/backend/utils/practiceTransferCaseView.js
// - web/frontend/src/shared/share/PracticeTransferShareDialog.tsx
// - 2026-09-28: 기공의뢰 공유 링크. 공개 범위(누구나·지정 계정·관계자)·유효 기간·차단은 소유자가 정한다.
import mongoose from "mongoose";

export const CASE_SHARE_VISIBILITIES = ["public", "accounts", "participants"];

const practiceTransferShareLinkSchema = new mongoose.Schema(
  {
    /** URL에 들어가는 비밀값. 추측 불가능한 난수(base64url 32바이트). */
    token: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    transferMongoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PracticeTransfer",
      required: true,
      index: true,
    },
    transferId: { type: String, default: "", trim: true },
    /** 소유자. 범위·기간·차단·삭제는 소유자(또는 관리자)만 바꾼다. */
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    createdByAnchorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAnchor",
      default: null,
    },
    /** practice=치과, lab=기공소(원청·협력·하청), admin */
    createdBySide: {
      type: String,
      enum: ["practice", "lab", "admin"],
      required: true,
    },
    /**
     * public=로그인 없이 누구나
     * accounts=allowedUserIds 계정만(로그인 필요)
     * participants=의뢰 관계자(치과·원청·협력·하청)만(로그인 필요)
     */
    visibility: {
      type: String,
      enum: CASE_SHARE_VISIBILITIES,
      default: "public",
    },
    allowedUserIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
    expiresAt: { type: Date, required: true },
    /** 소유자가 막은 시각. 해제하면 null로 돌아가 다시 열린다. */
    blockedAt: { type: Date, default: null },
    viewCount: { type: Number, default: 0 },
    lastViewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

practiceTransferShareLinkSchema.index({ transferMongoId: 1, createdAt: -1 });
// 만료 30일 뒤 문서 정리(만료 판정은 expiresAt으로 즉시 한다).
practiceTransferShareLinkSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60 },
);

export default mongoose.model(
  "PracticeTransferShareLink",
  practiceTransferShareLinkSchema,
);

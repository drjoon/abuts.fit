/**
 * ParseLog 모델
 * 파일명 파싱 결과 vs 사용자 최종 입력값 로그 (ESM 스타일)
 */

import mongoose from "mongoose";

const parseLogSchema = new mongoose.Schema(
  {
    /** 원본 파일명 */
    filename: {
      type: String,
      required: true,
      index: true,
    },

    /** 파싱 결과 */
    parsed: {
      clinicName: String,
      patientName: String,
      tooth: String,
    },

    /** 사용자가 최종 입력한 값 */
    userInput: {
      clinicName: String,
      patientName: String,
      tooth: String,
    },

    /** 파싱 결과와 사용자 입력이 일치하는지 여부 */
    isCorrect: {
      type: Boolean,
      required: true,
      index: true,
    },

    /** 일치하지 않는 필드 목록 */
    mismatchedFields: {
      type: [String], // ["clinicName", "patientName", "tooth"]
      default: [],
    },

    /** 매칭된 룰 ID (추적용) */
    matchedRuleId: String,

    /** 사용자 ID */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    /** 기공소 ID (선택사항, 나중에 기공소별 룰 분리용) */
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Clinic",
    },

    /** Draft ID (추적용) */
    draftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DraftRequest",
    },

    /** 생성 시각 */
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// 복합 인덱스 (조회 성능 최적화)
parseLogSchema.index({ userId: 1, createdAt: -1 });
parseLogSchema.index({ isCorrect: 1, createdAt: -1 });
parseLogSchema.index({ mismatchedFields: 1 });

const ParseLog = mongoose.model("ParseLog", parseLogSchema);
export default ParseLog;

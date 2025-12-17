/**
 * FilenameRule 모델
 * 파일명 파싱 룰 테이블 (ESM 스타일)
 */

import mongoose from "mongoose";

const filenameRuleSchema = new mongoose.Schema(
  {
    /** 룰 ID (고유값) */
    ruleId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    /** 룰 설명 */
    description: String,

    /** 이 룰이 적용되는 파일명 패턴 (정규식 문자열) */
    pattern: {
      type: String,
      required: true,
    },

    /** 추출 규칙 */
    extraction: {
      clinic: {
        type: {
          type: String,
          enum: ["regex", "token_range", "token_indices"],
        },
        value: mongoose.Schema.Types.Mixed, // string | number[]
        postprocess: {
          type: String,
          enum: ["strip_leading_digits", "normalize_spaces"],
        },
      },
      patient: {
        type: {
          type: String,
          enum: ["regex", "token_index"],
        },
        value: mongoose.Schema.Types.Mixed, // string | number
        postprocess: {
          type: String,
          enum: ["strip_leading_digits", "normalize_spaces"],
        },
      },
      tooth: {
        type: {
          type: String,
          enum: ["regex"],
        },
        value: String,
      },
    },

    /** 신뢰도 (0~1) */
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.7,
    },

    /** 룰의 출처 */
    source: {
      type: String,
      enum: ["manual", "ai_suggestion", "user_feedback"],
      default: "manual",
    },

    /** 이 룰을 제안한 AI 모델 (선택사항) */
    aiModel: String,

    /** AI 제안 시 신뢰도 점수 */
    aiConfidenceScore: Number,

    /** 룰 활성화 여부 */
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    /** 이 룰로 파싱한 파일 수 (통계용) */
    usageCount: {
      type: Number,
      default: 0,
    },

    /** 이 룰로 파싱한 파일 중 정확한 수 */
    correctCount: {
      type: Number,
      default: 0,
    },

    /** 룰의 정확도 (%) */
    accuracy: {
      type: Number,
      default: 0,
    },

    /** 마지막 업데이트 시각 */
    updatedAt: {
      type: Date,
      default: Date.now,
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

// 복합 인덱스
filenameRuleSchema.index({ isActive: 1, confidence: -1 });
filenameRuleSchema.index({ source: 1, createdAt: -1 });

const FilenameRule = mongoose.model("FilenameRule", filenameRuleSchema);
export default FilenameRule;

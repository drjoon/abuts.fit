/**
 * 초기 파일명 파싱 룰 데이터 마이그레이션 스크립트
 *
 * 사용법:
 * node scripts/seedFilenameRules.js
 */

import { connect } from "mongoose";
import { config } from "dotenv";
import FilenameRule from "../models/filenameRule.model.js";

config();

const mongoUri =
  process.env.NODE_ENV === "test"
    ? process.env.MONGODB_URI_TEST || "mongodb://localhost:27017/abutsFitTest"
    : process.env.MONGODB_URI || "mongodb://localhost:27017/abutsFit";

const DEFAULT_RULES = [
  {
    ruleId: "default_flexible",
    description: "기본 유연한 패턴: 날짜/치과/환자/치아 순서 제각각",
    pattern: ".*",
    extraction: {
      clinic: {
        type: "token_range",
        value: "0-end",
        postprocess: "normalize_spaces",
      },
      patient: {
        type: "token_index",
        value: -1,
        postprocess: "strip_leading_digits",
      },
      tooth: {
        type: "regex",
        value: "([1-4][1-8])|([1-4][1-8])-([1-4][1-8])",
      },
    },
    confidence: 0.7,
    source: "manual",
    isActive: true,
  },

  {
    ruleId: "pattern_date_patient_tooth",
    description: "날짜_환자_치아_번호 패턴 (예: 20251119김혜영_32_1)",
    pattern: "^\\d{8}[가-힣]+_\\d+_\\d+",
    extraction: {
      patient: {
        type: "regex",
        value: "^\\d{8}([가-힣]+)",
        postprocess: "strip_leading_digits",
      },
      tooth: {
        type: "regex",
        value: "_([1-4][1-8])_",
      },
    },
    confidence: 0.95,
    source: "manual",
    isActive: true,
  },
];

async function seedRules() {
  try {
    await connect(mongoUri);
    console.log("MongoDB 연결 성공");

    // 기존 룰 삭제 (선택사항: 주석 처리하면 기존 데이터 유지)
    // await FilenameRule.deleteMany({});
    // console.log("기존 룰 삭제 완료");

    // 초기 룰 저장
    const result = await FilenameRule.insertMany(DEFAULT_RULES, {
      ordered: false,
    });

    console.log(`✅ ${result.length}개의 초기 룰이 저장되었습니다.`);
    console.log("저장된 룰:");
    result.forEach((rule) => {
      console.log(`  - ${rule.ruleId}: ${rule.description}`);
    });

    process.exit(0);
  } catch (error) {
    if (error.code === 11000) {
      // 중복 키 에러 (이미 존재하는 룰)
      console.log("⚠️  일부 룰이 이미 존재합니다. 스킵합니다.");
      process.exit(0);
    }

    console.error("❌ 룰 저장 중 오류:", error.message);
    process.exit(1);
  }
}

seedRules();

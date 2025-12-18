/**
 * 초기 파일명 파싱 룰 데이터 마이그레이션 스크립트
 *
 * 사용법:
 * node scripts/seedFilenameRules.js
 */

import { connect } from "mongoose";
import "../bootstrap/env.js";
import FilenameRule from "../models/filenameRule.model.js";

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
        // 단일 치아번호(32) 또는 브리지(32-42, 32=42, 32x42 등)를 허용
        value: "([1-4][1-8])|([1-4][1-8][\u002D_=xX][1-4][1-8])", // - 또는 = 또는 x/X
      },
    },
    confidence: 0.7,
    source: "manual",
    isActive: true,
  },

  {
    ruleId: "pattern_date_patient_tooth",
    description: "날짜_환자_치아_번호 패턴 (예: 20251119김혜영_32_1)",
    // 구분자는 _, -, =, 공백 등 다양하게 올 수 있다고 가정
    pattern: "^\\d{8}[가-힣]+[ _\\-=]\\d+[ _\\-=]\\d+",
    extraction: {
      patient: {
        type: "regex",
        value: "^\\d{8}([가-힣]+)",
        postprocess: "strip_leading_digits",
      },
      tooth: {
        type: "regex",
        // 앞뒤에 다양한 구분자가 올 수 있으므로, 구분자 또는 문자열 경계를 포함한 패턴
        // 단일 치아번호 또는 브리지(32-42, 32=42, 32x42 등)
        value:
          "(?:^|[ _\\-=])([1-4][1-8](?:[\u002D_=xX][1-4][1-8])?)(?:[ _\\-=]|$)",
      },
    },
    confidence: 0.95,
    source: "manual",
    isActive: true,
  },

  {
    ruleId: "pattern_clinic_patient_tooth",
    description: "치과_환자_치아_번호 패턴 (예: 향기로운치과_김하늘_15)",
    // 구분자는 _, -, =, 공백 등 다양하게 올 수 있다고 가정
    pattern: "^[가-힣]+[ _\\-=][가-힣]+[ _\\-=]\\d+",
    extraction: {
      clinic: {
        type: "regex",
        value: "^([가-힣]+)[ _\\-=]",
      },
      patient: {
        type: "regex",
        value: "[ _\\-=]([가-힣]+)[ _\\-=]",
      },
      tooth: {
        type: "regex",
        // 확장자 앞 또는 문자열 끝에 오는 단일 치아번호 또는 브리지(32-42, 32=42, 32x42)
        value: "[ _\\-=]([1-4][1-8](?:[\u002D_=xX][1-4][1-8])?)(?:\\D|$)",
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

    // ruleId 기준 upsert로 기존 룰을 업데이트/추가
    const ops = DEFAULT_RULES.map((rule) => ({
      updateOne: {
        filter: { ruleId: rule.ruleId },
        update: rule,
        upsert: true,
      },
    }));

    const result = await FilenameRule.bulkWrite(ops, { ordered: false });

    console.log("✅ 초기 룰 upsert 완료:");
    console.log(
      `  matched: ${result.matchedCount}, modified: ${
        result.modifiedCount
      }, upserted: ${Object.keys(result.upsertedIds || {}).length}`
    );

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

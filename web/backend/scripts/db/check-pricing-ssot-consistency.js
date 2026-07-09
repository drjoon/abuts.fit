/**
 * 관리자용 SSOT 일치성 점검 스크립트
 *
 * 목적:
 * - 가격 정책 집계(rolling snapshot)의 selfBusinessOrders30d가
 *   Request 원본 집계(최근 30일 + 배송/추적 단계)와 일치하는지 검증한다.
 *
 * 기본 동작:
 * - 점검 결과를 PricingSsotHealthSnapshot에 upsert(write) 한다.
 *
 * 사용 예시:
 * - ENV_FILE=local.env node scripts/db/check-pricing-ssot-consistency.js
 * - ENV_FILE=local.env node scripts/db/check-pricing-ssot-consistency.js --strict
 * - ENV_FILE=local.env node scripts/db/check-pricing-ssot-consistency.js --strict --no-write
 */
import "../../bootstrap/env.js";
import mongoose from "mongoose";
import { runPricingSsotConsistencyCheck } from "../../services/pricingSsotHealth.service.js";

const hasFlag = (name) => process.argv.includes(name);

const main = async () => {
  const strict = hasFlag("--strict");
  const noWrite = hasFlag("--no-write");

  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGODB_URI/MONGO_URI not found.");
  }

  await mongoose.connect(uri);
  try {
    const result = await runPricingSsotConsistencyCheck({
      write: !noWrite,
    });

    console.log(
      JSON.stringify(
        {
          ...result,
          strict,
          write: !noWrite,
        },
        null,
        2,
      ),
    );

    if (strict && Number(result?.mismatchCount || 0) > 0) {
      process.exitCode = 2;
    }
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

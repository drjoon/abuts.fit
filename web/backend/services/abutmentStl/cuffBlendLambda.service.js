// related files:
// - web/backend/services/abutmentStl/cuffBlendLambda.handler.js
// - web/backend/services/abutmentStl/cuffBlend.service.js (runCuffBlendInWorker)
// - web/backend/scripts/abutment-stl-js/deploy-stl-cuff-lambda.sh
//
// 커프 보정을 람다에서 돌린다. ABUTMENT_STL_CUFF_LAMBDA가 없으면(로컬·테스트) 호출하지 않는다.
// 입력·출력은 S3 temp/stl-cuff/{id}/ 로 주고받고, 결과 JSON이 올라올 때까지 폴링한다.
import crypto from "crypto";
import AWS from "aws-sdk";
import {
  deleteFileFromS3,
  getObjectBufferFromS3,
  headObjectSizeInS3,
  putObjectToS3,
} from "../../utils/s3.utils.js";

const POLL_MS = 500;
const POLL_SLACK_MS = 10 * 1000;

export function cuffBlendLambdaName() {
  return String(process.env.ABUTMENT_STL_CUFF_LAMBDA || "").trim();
}

let lambdaClient = null;
function getLambdaClient() {
  if (!lambdaClient) {
    lambdaClient = new AWS.Lambda({ region: process.env.AWS_REGION || "ap-northeast-2" });
  }
  return lambdaClient;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class CuffLambdaTimeoutError extends Error {}

async function pollResult({ outKey, resultKey, errKey }, waitMs) {
  const started = Date.now();
  while (Date.now() - started < waitMs) {
    const [errSize, resultSize] = await Promise.all([headObjectSizeInS3(errKey), headObjectSizeInS3(resultKey)]);
    if (errSize > 0) {
      const body = await getObjectBufferFromS3(errKey);
      return { ok: false, status: "failed", reason: body.toString("utf8").trim() || "cuff_error" };
    }
    if (resultSize > 0) {
      const parsed = JSON.parse((await getObjectBufferFromS3(resultKey)).toString("utf8"));
      const { hasOutput, ...result } = parsed;
      if (hasOutput) result.buffer = await getObjectBufferFromS3(outKey);
      return result;
    }
    await sleep(POLL_MS);
  }
  throw new CuffLambdaTimeoutError(`커프 보정 람다 시간 초과(${waitMs}ms)`);
}

/** 람다 호출·S3 업로드가 실패하면 throw한다(호출 측이 로컬 워커로 돌린다). */
export async function runCuffBlendOnLambda(buffer, mode, options, { timeoutMs }) {
  const id = crypto.randomBytes(16).toString("hex");
  const base = `temp/stl-cuff/${id}`;
  const keys = {
    inKey: `${base}/in.stl`,
    outKey: `${base}/out.stl`,
    resultKey: `${base}/result.json`,
    errKey: `${base}/error.txt`,
  };
  const bucket = process.env.AWS_S3_BUCKET_NAME || "abuts-fit";
  await putObjectToS3(keys.inKey, buffer, { contentType: "application/octet-stream" });
  try {
    await getLambdaClient()
      .invoke({
        FunctionName: cuffBlendLambdaName(),
        InvocationType: "Event",
        Payload: JSON.stringify({ bucket, ...keys, mode, options: options || {} }),
      })
      .promise();
    return await pollResult(keys, timeoutMs + POLL_SLACK_MS);
  } finally {
    void Promise.all(Object.values(keys).map((key) => deleteFileFromS3(key).catch(() => null)));
  }
}

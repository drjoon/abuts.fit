// related files:
// - web/backend/services/abutmentStl/filledLambda.handler.js
// - web/backend/services/abutmentStl/jsPrimary.service.js
// - web/backend/services/abutmentStl/runPipelineInWorker.js
//
// Filled STL JS 계산은 람다에서 한다. 함수 이름이 없으면(로컬·테스트) 워커로 같은 코드를 돌린다.
// 대기는 제한 시간 + 10초. 결과 JSON이 없으면 시간 초과로 보고 준비 카드에 남긴다.
import crypto from "crypto";
import AWS from "aws-sdk";
import {
  deleteFileFromS3,
  getObjectBufferFromS3,
  headObjectSizeInS3,
  putObjectToS3,
} from "../../utils/s3.utils.js";
import {
  FILLED_STL_JS_LIMIT_MS,
  filledStlJsLimitSec,
  runAbutmentStlPipelineInWorker,
} from "./runPipelineInWorker.js";

const POLL_MS = 1000;
const POLL_SLACK_MS = 10 * 1000;

export function filledStlLambdaName() {
  return String(process.env.ABUTMENT_STL_FILLED_LAMBDA || "").trim();
}

let lambdaClient = null;
function getLambdaClient() {
  if (!lambdaClient) {
    lambdaClient = new AWS.Lambda({ region: process.env.AWS_REGION || "ap-northeast-2" });
  }
  return lambdaClient;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function timeoutError() {
  const error = new Error(`JS 실행이 ${filledStlJsLimitSec()}초를 넘겼습니다.`);
  error.reason = "js_timeout";
  return error;
}

let warnedLocalWorker = false;

async function pollFilledResult(outKey, resultKey, errKey) {
  const started = Date.now();
  const waitMs = FILLED_STL_JS_LIMIT_MS + POLL_SLACK_MS;
  while (Date.now() - started < waitMs) {
    if (errKey) {
      const errSize = await headObjectSizeInS3(errKey);
      if (errSize > 0) {
        const body = await getObjectBufferFromS3(errKey);
        const message = body.toString("utf8").trim() || "js_error";
        const error = new Error(message);
        error.reason = "js_error";
        throw error;
      }
    }
    const resultSize = await headObjectSizeInS3(resultKey);
    if (resultSize > 0) {
      const [resultBody, outputBuffer] = await Promise.all([
        getObjectBufferFromS3(resultKey),
        getObjectBufferFromS3(outKey),
      ]);
      const parsed = JSON.parse(resultBody.toString("utf8"));
      if (!outputBuffer?.length) {
        const error = new Error("JS 출력 STL이 비어 있습니다.");
        error.reason = "empty_output";
        throw error;
      }
      return { ...parsed, outputBuffer };
    }
    await sleep(POLL_MS);
  }
  throw timeoutError();
}

async function runOnLambda(buffer, options) {
  const name = filledStlLambdaName();
  const id = crypto.randomBytes(16).toString("hex");
  const inKey = `temp/stl-filled/${id}/in.stl`;
  const outKey = `temp/stl-filled/${id}/out.stl`;
  const resultKey = `temp/stl-filled/${id}/result.json`;
  const errKey = `temp/stl-filled/${id}/error.txt`;
  const bucket = process.env.AWS_S3_BUCKET_NAME || "abuts-fit";
  await deleteFileFromS3(errKey).catch(() => null);
  await putObjectToS3(inKey, buffer, { contentType: "application/octet-stream" });
  await getLambdaClient()
    .invoke({
      FunctionName: name,
      InvocationType: "Event",
      Payload: JSON.stringify({
        bucket,
        inKey,
        outKey,
        resultKey,
        errKey,
        targetDiameter: options?.targetDiameter ?? null,
        implantProfile: options?.implantProfile || {},
        ...(options?.connection ? { connection: options.connection } : {}),
        ...(Array.isArray(options?.finishLinePoints) ? { finishLinePoints: options.finishLinePoints } : {}),
        ...(options?.designAlreadyCorrected ? { designAlreadyCorrected: true } : {}),
      }),
    })
    .promise();
  try {
    return await pollFilledResult(outKey, resultKey, errKey);
  } finally {
    void Promise.all(
      [inKey, outKey, resultKey, errKey].map((key) => deleteFileFromS3(key).catch(() => null)),
    );
  }
}

/** Filled STL JS. 람다 이름이 있으면 람다, 없으면 로컬 워커. */
export async function runFilledStlOffRequest(buffer, options = {}) {
  if (filledStlLambdaName()) return runOnLambda(buffer, options);
  if (!warnedLocalWorker) {
    warnedLocalWorker = true;
    console.warn("[stl-filled] ABUTMENT_STL_FILLED_LAMBDA가 없어 EBS 워커로 Filled STL을 만듭니다.");
  }
  return runAbutmentStlPipelineInWorker(buffer, {
    ...options,
    queueTimeoutMs: FILLED_STL_JS_LIMIT_MS,
  });
}

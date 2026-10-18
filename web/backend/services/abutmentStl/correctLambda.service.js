// related files:
// - web/backend/services/abutmentStl/correctLambda.handler.js
// - web/backend/services/abutmentStl/preflight.service.js
// - web/backend/services/abutmentStl/runPipelineInWorker.js
//
// 완전한 보정 STL은 람다에서 만든다. 함수 이름이 없으면(로컬·테스트) 워커로 같은 코드를 돌린다.
import crypto from "crypto";
import AWS from "aws-sdk";
import {
  deleteFileFromS3,
  getObjectBufferFromS3,
  headObjectSizeInS3,
  putObjectToS3,
} from "../../utils/s3.utils.js";
import { runAbutmentStlPipelineInWorker } from "./runPipelineInWorker.js";

const POLL_MS = 1000;
const WAIT_MS = 150 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function correctedStlLambdaName() {
  return String(process.env.ABUTMENT_STL_CORRECT_LAMBDA || "").trim();
}

let lambdaClient = null;
function getLambdaClient() {
  if (!lambdaClient) {
    lambdaClient = new AWS.Lambda({ region: process.env.AWS_REGION || "ap-northeast-2" });
  }
  return lambdaClient;
}

async function buildOnWorker(buffer, inputs) {
  const js = await runAbutmentStlPipelineInWorker(buffer, {
    targetDiameter: inputs?.targetDiameter ?? null,
    implantProfile: inputs?.implantProfile || {},
    correctDesign: true,
  });
  if (!js?.outputBuffer?.length) {
    const error = new Error("보정 STL을 만들지 못했습니다.");
    error.reason = "correction_failed";
    throw error;
  }
  return js.outputBuffer;
}

async function pollCorrectedObject(outKey, errKey) {
  const started = Date.now();
  while (Date.now() - started < WAIT_MS) {
    const size = await headObjectSizeInS3(outKey);
    if (size > 0) return getObjectBufferFromS3(outKey);
    if (errKey) {
      const errSize = await headObjectSizeInS3(errKey);
      if (errSize > 0) {
        const body = await getObjectBufferFromS3(errKey);
        const reason = body.toString("utf8").trim() || "correction_failed";
        const error = new Error(reason);
        error.reason = reason === "no_tight_corners" ? "no_tight_corners" : "correction_failed";
        throw error;
      }
    }
    await sleep(POLL_MS);
  }
  const error = new Error("보정 STL 람다 대기 시간이 초과되었습니다.");
  error.reason = "correction_failed";
  throw error;
}

async function buildOnLambda(buffer, inputs) {
  const name = correctedStlLambdaName();
  const id = crypto.randomBytes(16).toString("hex");
  const inKey = `temp/stl-correct/${id}/in.stl`;
  const outKey = `temp/stl-correct/${id}/out.stl`;
  const errKey = `temp/stl-correct/${id}/error.txt`;
  const bucket = process.env.AWS_S3_BUCKET_NAME || "abuts-fit";
  await putObjectToS3(inKey, buffer, { contentType: "application/octet-stream" });
  await getLambdaClient()
    .invoke({
      FunctionName: name,
      InvocationType: "Event",
      Payload: JSON.stringify({
        bucket,
        inKey,
        outKey,
        errKey,
        targetDiameter: inputs?.targetDiameter ?? null,
        implantProfile: inputs?.implantProfile || {},
      }),
    })
    .promise();
  try {
    return await pollCorrectedObject(outKey, errKey);
  } finally {
    void deleteFileFromS3(inKey).catch(() => null);
    void deleteFileFromS3(outKey).catch(() => null);
    void deleteFileFromS3(errKey).catch(() => null);
  }
}

/** 완전한 보정 STL. 람다 이름이 있으면 람다, 없으면 로컬 워커. */
export async function buildCorrectedDesignOffRequest(buffer, inputs) {
  if (correctedStlLambdaName()) return buildOnLambda(buffer, inputs);
  console.warn("[stl-correct] ABUTMENT_STL_CORRECT_LAMBDA가 없어 EBS 워커로 보정 STL을 만듭니다.");
  return buildOnWorker(buffer, inputs);
}

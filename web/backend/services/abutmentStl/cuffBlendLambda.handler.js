// related files:
// - web/backend/services/abutmentStl/cuffBlend.service.js (runCuffBlendInWorker → 람다 호출)
// - web/backend/services/abutmentStl/cuffBlendJob.js
// - web/backend/scripts/abutment-stl-js/deploy-stl-cuff-lambda.sh
//
// 커프 보정(+포스트 다듬기·커넥션 원뿔 다듬기) 람다 엔트리. 메모리 2048MB, 타임아웃 60초, arm64.
// 이벤트: { bucket, inKey, outKey, resultKey, errKey, mode, options }
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { runCuffBlendJob } from "./cuffBlendJob.js";

const s3 = new S3Client({ region: process.env.AWS_REGION || "ap-northeast-2" });

function assertTempKey(key) {
  if (!/^temp\/stl-cuff\/[a-f0-9]{32}\/.+/.test(String(key || ""))) {
    throw new Error("temp/stl-cuff 키만 쓸 수 있습니다.");
  }
}

async function readObject(bucket, key) {
  const resp = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (typeof resp.Body?.transformToByteArray === "function") {
    return Buffer.from(await resp.Body.transformToByteArray());
  }
  const chunks = [];
  for await (const chunk of resp.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function writeObject(bucket, key, body, contentType) {
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
}

export async function handler(event) {
  const bucket = String(event?.bucket || "");
  const inKey = String(event?.inKey || "");
  const outKey = String(event?.outKey || "");
  const resultKey = String(event?.resultKey || "");
  const errKey = String(event?.errKey || "");
  if (!bucket || !inKey || !outKey || !resultKey) {
    throw new Error("bucket, inKey, outKey, resultKey가 필요합니다.");
  }
  assertTempKey(inKey);
  assertTempKey(outKey);
  assertTempKey(resultKey);
  if (errKey) assertTempKey(errKey);
  try {
    const input = await readObject(bucket, inKey);
    const result = runCuffBlendJob(input, event?.mode || "auto", event?.options || {});
    const { buffer, ...rest } = result;
    if (buffer?.length) await writeObject(bucket, outKey, buffer, "application/octet-stream");
    // 결과 JSON은 출력 STL을 쓴 뒤에 올린다. 웹은 결과 JSON이 보이면 출력을 읽는다.
    await writeObject(bucket, resultKey, Buffer.from(JSON.stringify({ ...rest, hasOutput: !!buffer?.length })), "application/json");
    return { ok: true, status: rest.status, bytes: buffer?.length || 0 };
  } catch (error) {
    const message = String(error?.message || error || "cuff_error").slice(0, 300);
    if (errKey) await writeObject(bucket, errKey, Buffer.from(message), "text/plain").catch(() => null);
    throw error;
  }
}

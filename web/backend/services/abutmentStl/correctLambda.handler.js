// related files:
// - web/backend/services/abutmentStl/correctLambda.service.js
// - web/backend/services/abutmentStl/pipeline.js
//
// 보정 STL 람다 엔트리. 메모리 2048MB(vCPU 1), 타임아웃 120초, 아키텍처 arm64.
// 이벤트: { bucket, inKey, outKey, errKey, targetDiameter, implantProfile }
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { runAbutmentStlPipeline } from "./pipeline.js";

const s3 = new S3Client({ region: process.env.AWS_REGION || "ap-northeast-2" });

async function readObject(bucket, key) {
  const resp = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (typeof resp.Body?.transformToByteArray === "function") {
    return Buffer.from(await resp.Body.transformToByteArray());
  }
  const chunks = [];
  for await (const chunk of resp.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function writeObject(bucket, key, body) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "application/octet-stream",
    }),
  );
}

export async function handler(event) {
  const bucket = String(event?.bucket || "");
  const inKey = String(event?.inKey || "");
  const outKey = String(event?.outKey || "");
  const errKey = String(event?.errKey || "");
  if (!bucket || !inKey || !outKey) {
    throw new Error("bucket, inKey, outKey가 필요합니다.");
  }
  try {
    const input = await readObject(bucket, inKey);
    const js = await runAbutmentStlPipeline(input, {
      targetDiameter: event?.targetDiameter ?? null,
      implantProfile: event?.implantProfile || {},
      ...(event?.connection ? { connection: event.connection } : {}),
      correctDesign: true,
    });
    if (!js.outputBuffer?.length) {
      if (errKey) await writeObject(bucket, errKey, Buffer.from("no_tight_corners"));
      return { ok: false, reason: "no_tight_corners" };
    }
    await writeObject(bucket, outKey, js.outputBuffer);
    return { ok: true, bytes: js.outputBuffer.length };
  } catch (error) {
    const message = String(error?.message || error || "correction_failed");
    if (errKey) {
      await writeObject(bucket, errKey, Buffer.from(message)).catch(() => null);
    }
    throw error;
  }
}

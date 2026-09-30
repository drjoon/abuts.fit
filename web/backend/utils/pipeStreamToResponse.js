import { pipeline } from "stream";

const isClientAbort = (err) =>
  err?.code === "ERR_STREAM_PREMATURE_CLOSE" || err?.code === "ECONNRESET" || err?.code === "EPIPE";

/**
 * S3 등 소스 스트림을 응답으로 보낸다.
 * 소스 오류는 응답을 끊고(헤더 전송 전이어도 상태 코드를 바꿀 수 없다), 클라이언트가 먼저 끊으면 소스를 destroy해 소켓을 반납한다.
 */
export const pipeStreamToResponse = (body, res, { label = "stream", key = "" } = {}) =>
  new Promise((resolve) => {
    pipeline(body, res, (err) => {
      if (err && !isClientAbort(err)) {
        console.error(`[${label}] pipe failed`, { key, error: err?.message || String(err) });
      }
      resolve();
    });
  });

export default pipeStreamToResponse;

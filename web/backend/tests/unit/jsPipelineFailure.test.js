// related files:
// - web/backend/services/abutmentStl/runPipelineInWorker.js
import { describe, expect, it } from "@jest/globals";
import {
  MeshWorkerQueueTimeoutError,
  MeshWorkerTimeoutError,
} from "../../services/abutmentStl/workerSlots.js";
import { describeJsPipelineFailure } from "../../services/abutmentStl/runPipelineInWorker.js";

describe("describeJsPipelineFailure", () => {
  it("시간 초과는 초 단위 문구로 바꾼다", () => {
    const described = describeJsPipelineFailure(new MeshWorkerTimeoutError("abutment STL JS pipeline", 60000));
    expect(described.reason).toBe("js_timeout");
    expect(described.detail).toBe("JS 실행이 60초를 넘겼습니다.");
  });

  it("대기 초과도 카드 문구로 바꾼다", () => {
    const described = describeJsPipelineFailure(new MeshWorkerQueueTimeoutError("abutment STL JS pipeline", 60000));
    expect(described.reason).toBe("js_queue_timeout");
    expect(described.detail).toBe("JS 실행 대기가 60초를 넘겼습니다.");
  });

  it("그 외 오류는 메시지를 그대로 남긴다", () => {
    const error = new Error("피니시라인 불량(spike)");
    error.reason = "finishline_spike";
    expect(describeJsPipelineFailure(error)).toEqual({
      reason: "finishline_spike",
      detail: "피니시라인 불량(spike)",
    });
  });
});

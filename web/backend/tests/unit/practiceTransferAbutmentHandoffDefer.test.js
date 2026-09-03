// related files:
// - web/backend/services/practiceTransferProduction.service.js
// change-log:
// - 2026-09-03: CA Request는 STL handoff 직전 생성 — accept는 related 비움.

import {
  ensureAbutmentRequestsForHandoff,
  ensureAbutmentRequestsOnAccept,
  hasCustomAbutmentToothWorks,
  normalizeResultFiles,
} from "../../services/practiceTransferProduction.service.js";

describe("practiceTransfer abutment handoff deferral helpers", () => {
  test("ensureAbutmentRequestsOnAccept aliases ensureAbutmentRequestsForHandoff", () => {
    expect(ensureAbutmentRequestsOnAccept).toBe(ensureAbutmentRequestsForHandoff);
  });

  test("handoff gates: CA toothWorks + oral scan files with s3Key", () => {
    expect(hasCustomAbutmentToothWorks([])).toBe(false);
    expect(
      hasCustomAbutmentToothWorks([
        {
          customAbutment: true,
          toothNumber: "16",
          prosthesisType: "커스텀어벗",
        },
      ]),
    ).toBe(true);

    // 스캔 없음 → transfer handoff 거절 조건
    expect(normalizeResultFiles([])).toEqual([]);
    expect(
      normalizeResultFiles([{ file: { originalName: "no-key.ply" } }]),
    ).toHaveLength(0);

    // 스캔 있음 → handoff에서 ensure 허용
    expect(
      normalizeResultFiles([
        {
          patientName: "환자3",
          tooth: "16",
          file: {
            originalName: "scan.ply",
            s3Key: "s3/scan.ply",
            mimetype: "application/octet-stream",
            size: 10,
          },
        },
      ]),
    ).toHaveLength(1);
  });
});

// related files:
// - web/backend/services/practiceTransferProduction.service.js
// change-log:
// - 2026-09-03: handoff 게이트 — CA toothWorks만 필수. 구강스캔(files)은 선택.
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

  test("handoff gates: CA toothWorks required; oral scan files optional", () => {
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

    // 스캔 없음·s3Key 없음 → 정규화 결과 비어도 handoff는 허용(어벗 STL만)
    expect(normalizeResultFiles([])).toEqual([]);
    expect(
      normalizeResultFiles([{ file: { originalName: "no-key.ply" } }]),
    ).toHaveLength(0);

    // 스캔 있으면 designSourceFiles로 보존(선택)
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

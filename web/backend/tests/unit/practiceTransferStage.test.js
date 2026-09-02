// related files:
// - web/backend/utils/practiceTransferStage.js
import {
  canEditPracticeTransferContent,
  resolvePracticeTransferManufacturerStage,
} from "../../utils/practiceTransferStage.js";

describe("practiceTransferStage pending-accept edit", () => {
  test("지정 기공소 미열람(발송완료)은 수정 가능", () => {
    const doc = {
      status: "active",
      matchingMode: "direct",
      targetLabAnchorId: "64a000000000000000000002",
    };
    expect(resolvePracticeTransferManufacturerStage(doc)).toBe("발송완료");
    expect(canEditPracticeTransferContent(doc)).toBe(true);
  });

  test("지정 기공소 열람(수신완료)은 수정 가능", () => {
    const doc = {
      status: "active",
      matchingMode: "direct",
      targetLabAnchorId: "64a000000000000000000002",
      requestorReadAt: new Date("2026-08-18T01:00:00.000Z"),
    };
    expect(resolvePracticeTransferManufacturerStage(doc)).toBe("수신완료");
    expect(canEditPracticeTransferContent(doc)).toBe(true);
  });

  test("자동매칭 공개 풀은 수정 가능", () => {
    const doc = {
      status: "active",
      matchingMode: "auto",
      targetLabAnchorId: null,
      autoMatch: { eligibleLabAnchorIds: ["64a000000000000000000002"] },
    };
    expect(resolvePracticeTransferManufacturerStage(doc)).toBe("자동매칭");
    expect(canEditPracticeTransferContent(doc)).toBe(true);
  });

  test("의뢰수락 이후는 수정 불가", () => {
    const doc = {
      status: "active",
      matchingMode: "direct",
      targetLabAnchorId: "64a000000000000000000002",
      requestorDownloadedAt: new Date("2026-08-18T02:00:00.000Z"),
    };
    expect(resolvePracticeTransferManufacturerStage(doc)).toBe("의뢰수락");
    expect(canEditPracticeTransferContent(doc)).toBe(false);
  });

  test("휴지통·작업취소는 수정 불가", () => {
    expect(
      canEditPracticeTransferContent({
        status: "deleted",
        matchingMode: "direct",
      }),
    ).toBe(false);
    expect(
      canEditPracticeTransferContent({
        status: "canceled", // 레거시 휴지통
        matchingMode: "direct",
      }),
    ).toBe(false);
    expect(
      canEditPracticeTransferContent({
        status: "active",
        matchingMode: "direct",
        targetLabAnchorId: "64a000000000000000000002",
        workCanceledAt: new Date("2026-08-18T03:00:00.000Z"),
      }),
    ).toBe(false);
  });

  test("보철 완료+skipDesignConfirm 자동확정은 작업완료(디자인)", () => {
    const doc = {
      status: "active",
      matchingMode: "direct",
      targetLabAnchorId: "64a000000000000000000002",
      requestorDownloadedAt: new Date("2026-08-18T02:00:00.000Z"),
      autoMatch: { completedAt: new Date("2026-08-29T01:00:00.000Z") },
      production: {
        skipDesignConfirm: true,
        confirmedAt: new Date("2026-08-29T01:00:00.000Z"),
      },
    };
    expect(resolvePracticeTransferManufacturerStage(doc)).toBe("작업완료");
  });

  test("보철 완료 후 치과 수동 생산진행(skip OFF)은 생산진행(출고)", () => {
    const doc = {
      status: "active",
      matchingMode: "direct",
      targetLabAnchorId: "64a000000000000000000002",
      requestorDownloadedAt: new Date("2026-08-18T02:00:00.000Z"),
      autoMatch: { completedAt: new Date("2026-08-29T01:00:00.000Z") },
      production: {
        skipDesignConfirm: false,
        confirmedAt: new Date("2026-08-29T02:00:00.000Z"),
      },
    };
    expect(resolvePracticeTransferManufacturerStage(doc)).toBe("생산진행");
  });

  test("보철 완료·미확정은 작업완료", () => {
    const doc = {
      status: "active",
      matchingMode: "direct",
      targetLabAnchorId: "64a000000000000000000002",
      requestorDownloadedAt: new Date("2026-08-18T02:00:00.000Z"),
      autoMatch: { completedAt: new Date("2026-08-29T01:00:00.000Z") },
      production: { skipDesignConfirm: false },
    };
    expect(resolvePracticeTransferManufacturerStage(doc)).toBe("작업완료");
  });

  test("어벗 designFiles만 있어도 수락 후 작업완료(디자인)", () => {
    const doc = {
      status: "active",
      matchingMode: "direct",
      targetLabAnchorId: "64a000000000000000000002",
      requestorDownloadedAt: new Date("2026-08-18T02:00:00.000Z"),
      production: {
        skipDesignConfirm: true,
        designFiles: [{ s3Key: "a.stl", originalName: "a.stl" }],
      },
    };
    expect(resolvePracticeTransferManufacturerStage(doc)).toBe("작업완료");
  });

  test("연동 CA 포장.발송·택배면 생산진행(출고)", () => {
    const doc = {
      status: "active",
      matchingMode: "direct",
      targetLabAnchorId: "64a000000000000000000002",
      requestorDownloadedAt: new Date("2026-08-18T02:00:00.000Z"),
      autoMatch: { completedAt: new Date("2026-08-29T01:00:00.000Z") },
      production: {
        skipDesignConfirm: true,
        confirmedAt: new Date("2026-08-29T01:00:00.000Z"),
        designFiles: [{ s3Key: "a.stl" }],
      },
      resultFiles: [{ tooth: "46", file: { s3Key: "c.stl" } }],
    };
    expect(
      resolvePracticeTransferManufacturerStage(doc, {
        abutmentDeliveryInfo: {
          shippedAt: new Date("2026-08-28T06:15:34.295Z"),
          manufacturerStages: ["추적관리"],
          tracking: { lastStatusText: "상품출발" },
        },
      }),
    ).toBe("생산진행");
  });

  test("arrivalDeadlineExpiredAt on direct transfer is 기한만료", () => {
    const doc = {
      status: "active",
      matchingMode: "direct",
      targetLabAnchorId: "64a000000000000000000002",
      requestorDownloadedAt: new Date("2026-08-18T02:00:00.000Z"),
      arrivalDeadlineExpiredAt: new Date("2026-09-03T01:00:00.000Z"),
      toothWorks: [{ toothNumber: "13", customAbutment: true }],
      production: { designFiles: [] },
    };
    expect(resolvePracticeTransferManufacturerStage(doc)).toBe("기한만료");
  });
});

import {
  buildWorksheetReadyQueueGuard,
  isWorksheetReadyQueueRequest,
} from "../../services/worksheetReadyQueue.guard.js";

describe("worksheetReadyQueue.guard — PTX design missing sibling", () => {
  test("isWorksheetReadyQueueRequest hides PTX without designCompletedAt", () => {
    expect(
      isWorksheetReadyQueueRequest({
        caseInfos: { productMode: "custom_abutment" },
        partnerBilling: { relatedPracticeTransferId: "abc" },
        designCompletedAt: null,
      }),
    ).toBe(false);
  });

  test("isWorksheetReadyQueueRequest shows PTX sibling with missing-visible flag", () => {
    expect(
      isWorksheetReadyQueueRequest({
        caseInfos: { productMode: "custom_abutment" },
        partnerBilling: {
          relatedPracticeTransferId: "abc",
          ptxDesignUploadMissingVisible: true,
        },
        designCompletedAt: null,
      }),
    ).toBe(true);
  });

  test("buildWorksheetReadyQueueGuard OR includes ptxDesignUploadMissingVisible", () => {
    const guard = buildWorksheetReadyQueueGuard();
    const ptxOr = guard.$and.find(
      (clause) =>
        Array.isArray(clause?.$or) &&
        clause.$or.some((row) =>
          Object.prototype.hasOwnProperty.call(
            row,
            "partnerBilling.ptxDesignUploadMissingVisible",
          ),
        ),
    );
    expect(ptxOr).toBeTruthy();
    expect(ptxOr.$or).toEqual(
      expect.arrayContaining([
        { "partnerBilling.ptxDesignUploadMissingVisible": true },
        { designCompletedAt: { $type: "date" } },
      ]),
    );
  });
});

/**
 * @jest-environment node
 */
import {
  collectToothNumbersFromToothWorks,
  parseToothNumbersQuery,
  resolvePracticeTransferPatientName,
  toothNumbersOverlap,
  toSimilarCaseMatchApi,
} from "../../utils/practiceTransferSimilarCase.js";

describe("practiceTransferSimilarCase", () => {
  test("patient from files then memo", () => {
    expect(
      resolvePracticeTransferPatientName({
        files: [{ patientName: " 김환자 " }],
        transferMemo: "[환자명: 다른]",
      }),
    ).toBe("김환자");
    expect(
      resolvePracticeTransferPatientName({
        files: [],
        transferMemo: "[환자명: 홍길동]",
      }),
    ).toBe("홍길동");
  });

  test("tooth overlap and parse", () => {
    expect(parseToothNumbersQuery("16,17 21")).toEqual(["16", "17", "21"]);
    expect(
      collectToothNumbersFromToothWorks([
        { toothNumber: "16", bridgeLinkedTeeth: ["17"] },
      ]),
    ).toEqual(["16", "17"]);
    expect(toothNumbersOverlap(["16"], ["17", "16"])).toBe(true);
    expect(toothNumbersOverlap(["16"], ["17"])).toBe(false);
  });

  test("toSimilarCaseMatchApi", () => {
    const api = toSimilarCaseMatchApi({
      _id: "abc",
      transferId: "PTX-1",
      files: [{ patientName: "김환자" }],
      toothWorks: [{ toothNumber: "16" }],
      targetLabName: "테스트기공소",
      createdAt: new Date("2026-09-01T00:00:00+09:00"),
      orderDates: ["2026-09-01"],
    });
    expect(api.patientName).toBe("김환자");
    expect(api.toothNumbers).toEqual(["16"]);
    expect(api.transferId).toBe("PTX-1");
  });
});

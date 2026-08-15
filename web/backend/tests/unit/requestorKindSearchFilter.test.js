// related files:
// - web/backend/utils/requestorCapabilities.js
// - web/backend/utils/practiceTransferAutoMatch.js
import {
  matchesRequestedRequestorKind,
  requestorKindCapableAnchorFilter,
} from "../../utils/requestorCapabilities.js";
import { verifiedLabCapableAnchorFilter } from "../../utils/practiceTransferAutoMatch.js";

describe("requestorKindCapableAnchorFilter", () => {
  test("lab 검색은 kind=lab 또는 kind 미기입+caps.lab", () => {
    expect(requestorKindCapableAnchorFilter("lab")).toEqual({
      $or: [
        { requestorKind: "lab" },
        {
          $and: [
            {
              $or: [
                { requestorKind: { $exists: false } },
                { requestorKind: null },
                { requestorKind: "" },
              ],
            },
            { "requestorCapabilities.lab": true },
          ],
        },
      ],
    });
  });

  test("잘못된 kind는 필터 없음", () => {
    expect(requestorKindCapableAnchorFilter("clinic")).toBeNull();
    expect(requestorKindCapableAnchorFilter("")).toBeNull();
  });
});

describe("matchesRequestedRequestorKind", () => {
  test("향기로운치과처럼 kind=practice 앵커는 기공소 검색에서 제외", () => {
    expect(
      matchesRequestedRequestorKind(
        {
          name: "향기로운치과",
          requestorKind: "practice",
          requestorCapabilities: { practice: true, lab: false },
        },
        "lab",
      ),
    ).toBe(false);
  });

  test("kind=lab 기공소는 포함", () => {
    expect(
      matchesRequestedRequestorKind(
        {
          name: "향기로운기공소",
          requestorKind: "lab",
          requestorCapabilities: { practice: false, lab: true },
        },
        "lab",
      ),
    ).toBe(true);
  });

  test("kind 미백필 + caps.lab 만 있으면 기공소로 포함", () => {
    expect(
      matchesRequestedRequestorKind(
        { requestorCapabilities: { lab: true } },
        "lab",
      ),
    ).toBe(true);
  });

  test("kind 미백필 + caps.practice 만 있으면 기공소 검색에서 제외", () => {
    expect(
      matchesRequestedRequestorKind(
        { requestorCapabilities: { practice: true } },
        "lab",
      ),
    ).toBe(false);
  });

  test("kind 미지정 검색은 모두 통과", () => {
    expect(
      matchesRequestedRequestorKind(
        { requestorKind: "practice" },
        null,
      ),
    ).toBe(true);
  });
});

describe("verifiedLabCapableAnchorFilter", () => {
  test("검증 기공소 필터에 requestor lab + internalLab 절을 포함", () => {
    const filter = verifiedLabCapableAnchorFilter();
    expect(filter.status).toBe("verified");
    expect(filter.$or).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          businessType: "requestor",
          $or: requestorKindCapableAnchorFilter("lab").$or,
        }),
        { businessType: "internalLab" },
      ]),
    );
  });
});

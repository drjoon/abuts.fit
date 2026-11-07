// related files:
// - web/backend/services/practiceTransferProduction.service.js
// change-log:
// - 2026-11-07: 다치아 handoff 생성 락 헬퍼(관련 id 파싱·락 유효) 단위 검증.

import { Types } from "mongoose";
import {
  ABUTMENT_ENSURE_LOCK_STALE_MS,
  isAbutmentRequestEnsureLockHeld,
  pickAbutmentRequestIdForTooth,
  readRelatedRequestIdsFromProduction,
} from "../../services/practiceTransferProduction.service.js";

describe("abutment request ensure lock helpers", () => {
  test("readRelatedRequestIdsFromProduction filters invalid ids", () => {
    const a = new Types.ObjectId();
    const b = new Types.ObjectId();
    expect(
      readRelatedRequestIdsFromProduction({
        relatedRequestIds: [a, "nope", b, null],
      }),
    ).toEqual([String(a), String(b)]);
    expect(readRelatedRequestIdsFromProduction({})).toEqual([]);
    expect(readRelatedRequestIdsFromProduction(null)).toEqual([]);
  });

  test("pickAbutmentRequestIdForTooth does not fall back when tooth mismatches", () => {
    const docs = [
      { _id: "a", caseInfos: { tooth: "22" }, designCompletedAt: null },
      { _id: "b", caseInfos: { tooth: "23" }, designCompletedAt: null },
    ];
    expect(pickAbutmentRequestIdForTooth(docs, "23")).toBe("b");
    expect(pickAbutmentRequestIdForTooth(docs, "22")).toBe("a");
    expect(pickAbutmentRequestIdForTooth(docs, "11")).toBeNull();
    expect(pickAbutmentRequestIdForTooth(docs, "")).toBe("a");
  });

  test("isAbutmentRequestEnsureLockHeld respects stale window", () => {
    const now = Date.parse("2026-11-05T05:28:51.000Z");
    expect(isAbutmentRequestEnsureLockHeld(null, now)).toBe(false);
    expect(
      isAbutmentRequestEnsureLockHeld(
        new Date(now - ABUTMENT_ENSURE_LOCK_STALE_MS - 1),
        now,
      ),
    ).toBe(false);
    expect(
      isAbutmentRequestEnsureLockHeld(new Date(now - 1_000), now),
    ).toBe(true);
  });
});

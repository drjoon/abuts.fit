// related files:
// - web/backend/controllers/admin/happyCallReasons.js
import { collectHappyCallReasonCodes } from "../../controllers/admin/happyCallReasons.js";

const dayMs = 24 * 60 * 60 * 1000;

const buildWindows = (now = new Date("2026-08-07T12:00:00+09:00")) => ({
  now,
  sevenDaysAgo: new Date(now.getTime() - 7 * dayMs),
  fourteenDaysAgo: new Date(now.getTime() - 14 * dayMs),
  twentyOneDaysAgo: new Date(now.getTime() - 21 * dayMs),
  thirtyDaysAgo: new Date(now.getTime() - 30 * dayMs),
  sixtyDaysAgo: new Date(now.getTime() - 60 * dayMs),
  weekStartUtc: new Date("2026-08-03T15:00:00.000Z"),
  weekEndUtc: new Date("2026-08-10T15:00:00.000Z"),
});

describe("collectHappyCallReasonCodes onboarding windows", () => {
  const w = buildWindows();

  test("가입 22일·주문 0건 → 14일 사유만", () => {
    const codes = collectHappyCallReasonCodes({
      ...w,
      anchorCreatedAt: new Date(w.now.getTime() - 22 * dayMs),
      totalRequestsByAnchor: 0,
      completedCount: 0,
      recent30Total: 0,
    });
    expect(codes).toEqual(["new_signup_no_first_request_14d"]);
  });

  test("가입 45일·완료 0·최근주문 0 → 1개월 사유만", () => {
    const codes = collectHappyCallReasonCodes({
      ...w,
      anchorCreatedAt: new Date(w.now.getTime() - 45 * dayMs),
      totalRequestsByAnchor: 0,
      completedCount: 0,
      recent30Total: 0,
    });
    expect(codes).toEqual(["no_completion_30d_from_join"]);
  });

  test("가입 69일 이상 미주문은 온보딩 사유에서 제외", () => {
    const codes = collectHappyCallReasonCodes({
      ...w,
      anchorCreatedAt: new Date(w.now.getTime() - 69 * dayMs),
      totalRequestsByAnchor: 0,
      completedCount: 0,
      recent30Total: 0,
    });
    expect(codes).toEqual([]);
  });

  test("가입 129일 미주문도 온보딩 사유에서 제외", () => {
    const codes = collectHappyCallReasonCodes({
      ...w,
      anchorCreatedAt: new Date(w.now.getTime() - 129 * dayMs),
      totalRequestsByAnchor: 0,
      completedCount: 0,
      recent30Total: 0,
    });
    expect(codes).toEqual([]);
  });

  test("1개월 구간이어도 최근 30일 주문이 있으면 제외", () => {
    const codes = collectHappyCallReasonCodes({
      ...w,
      anchorCreatedAt: new Date(w.now.getTime() - 45 * dayMs),
      totalRequestsByAnchor: 2,
      completedCount: 0,
      recent30Total: 2,
    });
    expect(codes).not.toContain("no_completion_30d_from_join");
    expect(codes).not.toContain("new_signup_no_first_request_14d");
  });
});

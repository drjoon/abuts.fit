// related files:
// - web/backend/utils/dashboardNotice.js
import {
  isNoticeWindowOpen,
  resolveNoticeAudiencesForUser,
} from "../../utils/dashboardNotice.js";

describe("dashboard notice audience", () => {
  test("치과·기공소·딜러·영업팀·기공본부를 나눈다", () => {
    expect(
      resolveNoticeAudiencesForUser({ role: "requestor", requestorKind: "practice" }),
    ).toEqual(["practice"]);
    expect(
      resolveNoticeAudiencesForUser({ role: "requestor", requestorKind: "lab" }),
    ).toEqual(["lab"]);
    expect(resolveNoticeAudiencesForUser({ role: "salesman" })).toEqual(["dealer"]);
    expect(resolveNoticeAudiencesForUser({ role: "salesTeam" })).toEqual([
      "salesTeam",
    ]);
    expect(resolveNoticeAudiencesForUser({ role: "internalLab" })).toEqual([
      "labHq",
    ]);
    expect(resolveNoticeAudiencesForUser({ role: "labTeam" })).toEqual(["labHq"]);
    expect(resolveNoticeAudiencesForUser({ role: "admin" })).toEqual([]);
  });

  test("게시 중이고 기간 안인 공지만 열린다", () => {
    const now = new Date("2026-09-30T12:00:00+09:00");
    expect(
      isNoticeWindowOpen(
        { published: true, endsAt: "2026-10-09T23:59:59.999+09:00" },
        now,
      ),
    ).toBe(true);
    expect(
      isNoticeWindowOpen(
        { published: true, endsAt: "2026-10-09T23:59:59.999+09:00" },
        new Date("2026-10-10T00:00:00+09:00"),
      ),
    ).toBe(false);
    expect(isNoticeWindowOpen({ published: false }, now)).toBe(false);
  });
});

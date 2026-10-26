// related files:
// - web/backend/services/adminNewMembers.core.js
import { describe, expect, it } from "@jest/globals";
import {
  NEW_MEMBER_WINDOW_MS,
  buildNewMemberFilter,
  newMemberSince,
  toNewMemberRow,
} from "../../services/adminNewMembers.core.js";

describe("admin new members", () => {
  it("shows a signup for 7 days from createdAt", () => {
    const now = new Date("2026-10-26T11:00:00+09:00");
    const since = newMemberSince(now);
    expect(now.getTime() - since.getTime()).toBe(NEW_MEMBER_WINDOW_MS);
    expect(since.toISOString()).toBe("2026-10-19T02:00:00.000Z");
  });

  it("keeps public signups and drops staff accounts", () => {
    const now = new Date("2026-10-26T11:00:00+09:00");
    const filter = buildNewMemberFilter(now);
    expect(filter.role).toEqual({ $in: ["requestor", "salesman"] });
    expect(filter.subRole).toEqual({ $ne: "staff" });
    expect(filter.deletedAt).toBeNull();
    expect(filter.replacedByUserId).toBeNull();
    expect(filter.createdAt.$gte.toISOString()).toBe(newMemberSince(now).toISOString());
  });

  it("uses clinic name and phone when the account fields are empty", () => {
    const row = toNewMemberRow({
      _id: "abc",
      name: "김치과",
      email: "a@b.com",
      role: "requestor",
      requestorKind: "practice",
      business: "",
      phoneNumber: "",
      practiceProfile: { clinicName: "스마일치과", phone: "01012345678" },
      onboardingWizardCompleted: false,
      active: true,
      createdAt: new Date("2026-10-25T01:00:00.000Z"),
    });
    expect(row.businessName).toBe("스마일치과");
    expect(row.phone).toBe("01012345678");
    expect(row.onboardingWizardCompleted).toBe(false);
  });
});

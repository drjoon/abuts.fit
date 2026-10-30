import mongoose from "mongoose";
import User from "../../models/user.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import {
  finalizeStaffBulkDrafts,
  loginIdBaseFromName,
  mergeStaffDraftsByDepartmentOccurrence,
  parseStaffBulkText,
} from "../../services/staffBulkRegister.core.js";
import {
  createOwnerStaffAccounts,
  resetOwnedStaffPassword,
} from "../../services/staffBulkRegister.service.js";

const PASSWORD = "abcdef";

describe("staff bulk register parsing", () => {
  test("이름은 한글 아이디가 되고, 이미 있으면 번호를 붙인다", () => {
    const parsed = parseStaffBulkText("김영희\n김영희\n홍길동");
    expect(parsed.fatal).toBe("");
    const planned = finalizeStaffBulkDrafts(parsed.drafts, {
      takenLoginIds: new Set(["김영희"]),
      takenEmails: new Set(),
    });
    expect(planned.failed).toEqual([]);
    expect(planned.ready.map((row) => row.login)).toEqual([
      "김영희1",
      "김영희2",
      "홍길동",
    ]);
    expect(loginIdBaseFromName("김영희")).toBe("김영희");
  });

  test("빈 목록에서 같은 이름은 1부터 붙인다", () => {
    const parsed = parseStaffBulkText("김영희\n김영희");
    const planned = finalizeStaffBulkDrafts(parsed.drafts, {
      takenLoginIds: new Set(),
      takenEmails: new Set(),
    });
    expect(planned.ready.map((row) => row.login)).toEqual(["김영희", "김영희1"]);
  });

  test("영문 아이디와 이메일은 거절한다", () => {
    const comma = parseStaffBulkText("이순신, Lee@Example.com");
    const planned = finalizeStaffBulkDrafts(comma.drafts, {
      takenLoginIds: new Set(),
      takenEmails: new Set(),
    });
    expect(planned.ready).toEqual([]);
    expect(planned.failed[0].message).toMatch(/한 줄/);
    const latin = parseStaffBulkText("hong");
    const latinPlanned = finalizeStaffBulkDrafts(latin.drafts, {
      takenLoginIds: new Set(),
      takenEmails: new Set(),
    });
    expect(latinPlanned.ready).toEqual([]);
    expect(latinPlanned.failed[0].message).toMatch(/한글/);
    expect(parseStaffBulkText("  \n# 메모").fatal).toMatch(/이름/);
  });

  test("같은 순번의 같은 이름은 여러 부서로 합친다", () => {
    const merged = mergeStaffDraftsByDepartmentOccurrence([
      { lineNo: 1, name: "이준호", departmentId: "m1", departmentName: "경영팀" },
      { lineNo: 1, name: "이준호", departmentId: "c1", departmentName: "진료팀" },
      { lineNo: 2, name: "김영희", departmentId: "c1", departmentName: "진료팀" },
    ]);
    expect(
      merged.map((row) => [row.name, row.departmentNames.join(" · ")]),
    ).toEqual([
      ["이준호", "경영팀 · 진료팀"],
      ["김영희", "진료팀"],
    ]);
  });
});

describe("staff bulk register persistence", () => {
  test("대표 사업자에 직원을 넣고 짧은 아이디로 비밀번호가 맞는다", async () => {
    const owner = await User.create({
      name: "대표",
      email: "owner-bulk@example.com",
      password: PASSWORD,
      role: "requestor",
      requestorKind: "practice",
      subRole: "owner",
      active: true,
      approvedAt: new Date(),
    });
    const anchor = await BusinessAnchor.create({
      name: "테스트치과",
      businessNumberNormalized: "1234567890",
      businessType: "requestor",
      requestorKind: "practice",
      primaryContactUserId: owner._id,
      owners: [owner._id],
      members: [],
    });

    const result = await createOwnerStaffAccounts({
      anchor,
      owner: owner.toObject(),
      password: PASSWORD,
      text: "김영희\n김영희",
      departmentId: null,
    });

    expect(result.status).toBe(201);
    expect(result.created.map((row) => row.login)).toEqual([
      "김영희",
      "김영희1",
    ]);

    const saved = await BusinessAnchor.findById(anchor._id).lean();
    expect(saved.members).toHaveLength(2);

    const staff = await User.findOne({ loginId: "김영희" }).select(
      "+password",
    );
    expect(staff.subRole).toBe("staff");
    expect(staff.mustChangePassword).toBe(true);
    expect(staff.onboardingWizardCompleted).toBe(true);
    expect(String(staff.businessAnchorId)).toBe(String(anchor._id));
    expect(staff.requestorKind).toBe("practice");
    expect(await staff.comparePassword(PASSWORD)).toBe(true);

    const namedStaff = await User.findOne({ loginId: "김영희1" });
    expect(namedStaff.email).toMatch(/@staff\.abuts\.fit$/);
    expect(namedStaff.email).not.toMatch(/김영희/);
    expect(staff.guideTour?.completed).toBe(true);

    const reset = await resetOwnedStaffPassword({
      anchor: await BusinessAnchor.findById(anchor._id),
      userId: staff._id,
      password: "qwerty",
    });
    expect(reset.status).toBe(200);

    const ownerReset = await resetOwnedStaffPassword({
      anchor: await BusinessAnchor.findById(anchor._id),
      userId: owner._id,
      password: "Changed1!ok",
    });
    expect(ownerReset.status).toBe(404);
  });

  test("부서마다 다른 소속으로 등록하고 같은 이름은 번호를 붙인다", async () => {
    const owner = await User.create({
      name: "대표",
      email: "owner-bulk-dept@example.com",
      password: PASSWORD,
      role: "requestor",
      requestorKind: "practice",
      subRole: "owner",
      active: true,
      approvedAt: new Date(),
    });
    const anchor = await BusinessAnchor.create({
      name: "테스트치과",
      businessNumberNormalized: "1234567891",
      businessType: "requestor",
      requestorKind: "practice",
      primaryContactUserId: owner._id,
      owners: [owner._id],
      members: [],
    });
    const marketing = new mongoose.Types.ObjectId();
    const platform = new mongoose.Types.ObjectId();

    const result = await createOwnerStaffAccounts({
      anchor,
      owner: owner.toObject(),
      password: PASSWORD,
      groups: [
        { departmentId: marketing, departmentName: "마케팅영업부", text: "\n" },
        { departmentId: marketing, departmentName: "마케팅영업부", text: "이준호" },
        {
          departmentId: platform,
          departmentName: "플랫폼관리부",
          text: "이준호\n김영희",
        },
      ],
    });

    expect(result.status).toBe(201);
    expect(
      result.created.map((row) => [row.login, row.departmentName]),
    ).toEqual([
      ["이준호", "마케팅영업부 · 플랫폼관리부"],
      ["김영희", "플랫폼관리부"],
    ]);

    const first = await User.findOne({ loginId: "이준호" });
    expect(first.internalDepartmentIds.map(String)).toEqual([
      String(marketing),
      String(platform),
    ]);
    const onlyClinical = await User.findOne({ loginId: "김영희" });
    expect(String(onlyClinical.internalDepartmentId)).toBe(String(platform));
  });
});

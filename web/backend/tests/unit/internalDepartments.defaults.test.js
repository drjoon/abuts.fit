import {
  actorCanManageStaffDirectory,
  collectMemberDepartmentIds,
  departmentGrantsSettlement,
  getDefaultDepartmentNames,
  getDefaultDepartmentSpecs,
  memberCanAccessSettlement,
} from "../../utils/internalDepartments.util.js";

describe("getDefaultDepartmentNames", () => {
  test("조직마다 경영팀과 실무팀", () => {
    expect(getDefaultDepartmentNames({ businessType: "manufacturer" })).toEqual([
      "경영팀",
      "생산팀",
    ]);
    expect(getDefaultDepartmentNames({ businessType: "salesman" })).toEqual([
      "경영팀",
      "영업팀",
    ]);
    expect(getDefaultDepartmentNames({ businessType: "devops" })).toEqual([
      "경영팀",
      "개발팀",
    ]);
    expect(getDefaultDepartmentNames({ businessType: "internalLab" })).toEqual([
      "경영팀",
      "기공팀",
    ]);
    expect(getDefaultDepartmentNames({ businessType: "salesTeam" })).toEqual([
      "경영팀",
      "영업팀",
    ]);
  });

  test("치과·기공소 기본은 경영팀과 진료/기공팀", () => {
    expect(getDefaultDepartmentNames({ businessType: "practice" })).toEqual([
      "경영팀",
      "진료팀",
    ]);
    expect(
      getDefaultDepartmentNames({
        businessType: "requestor",
        requestorKind: "lab",
      }),
    ).toEqual(["경영팀", "기공팀"]);
    expect(
      getDefaultDepartmentNames({
        businessType: "requestor",
        requestorKind: "practice",
      }),
    ).toEqual(["경영팀", "진료팀"]);
    expect(getDefaultDepartmentNames({ businessType: "admin" })).toEqual([
      "플랫폼관리부",
      "마케팅영업부",
      "기공사업부",
    ]);
  });
});

describe("getDefaultDepartmentSpecs", () => {
  test("치과는 경영·진료, 딜러는 경영·영업", () => {
    expect(getDefaultDepartmentSpecs({ businessType: "practice" })).toEqual([
      { name: "경영팀", key: "management" },
      { name: "진료팀", key: "clinical" },
    ]);
    expect(
      getDefaultDepartmentSpecs({
        businessType: "requestor",
        requestorKind: "lab",
      }),
    ).toEqual([
      { name: "경영팀", key: "management" },
      { name: "기공팀", key: "lab" },
    ]);
    expect(getDefaultDepartmentSpecs({ businessType: "salesman" })).toEqual([
      { name: "경영팀", key: "management" },
      { name: "영업팀", key: "sales" },
    ]);
    expect(getDefaultDepartmentSpecs({ businessType: "manufacturer" })).toEqual([
      { name: "경영팀", key: "management" },
      { name: "생산팀", key: "production" },
    ]);
    expect(getDefaultDepartmentSpecs({ businessType: "devops" })).toEqual([
      { name: "경영팀", key: "management" },
      { name: "개발팀", key: "development" },
    ]);
  });
});

describe("collectMemberDepartmentIds", () => {
  test("배열과 단일 값을 합친다", () => {
    expect(
      collectMemberDepartmentIds({
        internalDepartmentId: "a",
        internalDepartmentIds: ["b", "a"],
      }),
    ).toEqual(["b", "a"]);
  });
});

describe("memberCanAccessSettlement", () => {
  const practiceAnchor = {
    businessType: "practice",
    internalDepartments: [
      { _id: "m1", name: "경영팀", key: "management" },
      { _id: "c1", name: "진료팀", key: "clinical" },
    ],
  };

  test("경영팀이면 정산을 본다", () => {
    expect(
      memberCanAccessSettlement(
        { internalDepartmentIds: ["m1", "c1"] },
        practiceAnchor,
      ),
    ).toBe(true);
    expect(
      memberCanAccessSettlement(
        { internalDepartmentId: "m1" },
        practiceAnchor,
      ),
    ).toBe(true);
  });

  test("진료팀만이면 정산을 못 본다", () => {
    expect(
      memberCanAccessSettlement(
        { internalDepartmentIds: ["c1"] },
        practiceAnchor,
      ),
    ).toBe(false);
  });

  test("제조사도 경영팀이 아니면 정산을 못 본다", () => {
    const manufacturerAnchor = {
      businessType: "manufacturer",
      internalDepartments: [
        { _id: "m1", name: "경영팀", key: "management" },
        { _id: "p1", name: "생산팀", key: "production" },
      ],
    };
    expect(
      memberCanAccessSettlement(
        { internalDepartmentIds: ["p1"] },
        manufacturerAnchor,
      ),
    ).toBe(false);
    expect(
      memberCanAccessSettlement(
        { internalDepartmentIds: ["m1"] },
        manufacturerAnchor,
      ),
    ).toBe(true);
  });

  test("관리자는 제한하지 않는다", () => {
    expect(
      memberCanAccessSettlement(
        { internalDepartmentIds: [] },
        { businessType: "admin" },
      ),
    ).toBe(true);
  });

  test("경영팀 이름은 key가 없어도 정산을 연다", () => {
    expect(
      departmentGrantsSettlement({ name: "경영팀", key: "" }),
    ).toBe(true);
  });
});

describe("actorCanManageStaffDirectory", () => {
  const manufacturerAnchor = {
    businessType: "manufacturer",
    internalDepartments: [
      { _id: "m1", name: "경영팀", key: "management" },
      { _id: "p1", name: "생산팀", key: "production" },
    ],
  };

  test("경영팀만 부서와 직원을 관리한다", () => {
    expect(
      actorCanManageStaffDirectory(
        { internalDepartmentIds: ["m1"] },
        manufacturerAnchor,
      ),
    ).toBe(true);
    expect(
      actorCanManageStaffDirectory(
        { internalDepartmentIds: ["p1"] },
        manufacturerAnchor,
      ),
    ).toBe(false);
  });

  test("관리자는 제한하지 않는다", () => {
    expect(
      actorCanManageStaffDirectory({ role: "admin" }, manufacturerAnchor),
    ).toBe(true);
  });
});

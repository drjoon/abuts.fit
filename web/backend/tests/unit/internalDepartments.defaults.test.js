import { getDefaultDepartmentNames } from "../../utils/internalDepartments.util.js";

describe("getDefaultDepartmentNames", () => {
  test("역할 이름 부서 하나", () => {
    expect(getDefaultDepartmentNames({ businessType: "manufacturer" })).toEqual([
      "제조사",
    ]);
    expect(getDefaultDepartmentNames({ businessType: "salesman" })).toEqual([
      "딜러",
    ]);
    expect(getDefaultDepartmentNames({ businessType: "devops" })).toEqual([
      "개발운영사",
    ]);
    expect(getDefaultDepartmentNames({ businessType: "internalLab" })).toEqual([
      "어벗츠기공소",
    ]);
  });

  test("치과·기공소·어벗츠는 기존 기본 부서", () => {
    expect(getDefaultDepartmentNames({ businessType: "practice" })).toEqual([
      "치과",
    ]);
    expect(
      getDefaultDepartmentNames({
        businessType: "requestor",
        requestorKind: "lab",
      }),
    ).toEqual(["기공소"]);
    expect(
      getDefaultDepartmentNames({
        businessType: "requestor",
        requestorKind: "practice",
      }),
    ).toEqual(["치과"]);
    expect(getDefaultDepartmentNames({ businessType: "admin" })).toEqual([
      "플랫폼관리부",
      "마케팅영업부",
      "기공사업부",
    ]);
  });
});

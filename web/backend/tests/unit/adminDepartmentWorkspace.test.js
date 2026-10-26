import {
  projectAdminDepartmentWorkspace,
  workspaceRoleForDepartmentName,
} from "../../utils/adminDepartmentWorkspace.js";

describe("adminDepartmentWorkspace", () => {
  const adminUser = {
    _id: "user-1",
    role: "admin",
    subRole: "staff",
    business: "어벗츠 주식회사",
    businessAnchorId: "admin-anchor",
    internalDepartmentId: "dept-1",
  };

  test("부서 이름 → 화면 역할", () => {
    expect(workspaceRoleForDepartmentName("마케팅영업부")).toBe("salesTeam");
    expect(workspaceRoleForDepartmentName("기공사업부")).toBe("internalLab");
    expect(workspaceRoleForDepartmentName("플랫폼관리부")).toBe("admin");
    expect(workspaceRoleForDepartmentName("경영본부")).toBe("admin");
    expect(workspaceRoleForDepartmentName("  기공사업부  ")).toBe("internalLab");
    expect(workspaceRoleForDepartmentName("없는부서")).toBe("admin");
    expect(workspaceRoleForDepartmentName("")).toBe("admin");
  });

  test("마케팅영업부는 영업팀 화면. 소속 앵커는 유지", () => {
    const next = projectAdminDepartmentWorkspace(adminUser, {
      departmentName: "마케팅영업부",
    });
    expect(next.role).toBe("salesTeam");
    expect(next.accountRole).toBe("admin");
    expect(next.businessAnchorId).toBe("admin-anchor");
    expect(next.business).toBe("어벗츠 주식회사");
    expect(adminUser.role).toBe("admin");
  });

  test("기공사업부는 어벗츠기공사업부 앵커로 화면만 전환", () => {
    const next = projectAdminDepartmentWorkspace(adminUser, {
      departmentName: "기공사업부",
      internalLabAnchor: { _id: "lab-anchor", name: "어벗츠기공사업부" },
    });
    expect(next.role).toBe("internalLab");
    expect(next.accountRole).toBe("admin");
    expect(next.accountBusinessAnchorId).toBe("admin-anchor");
    expect(next.businessAnchorId).toBe("lab-anchor");
    expect(next.business).toBe("어벗츠기공사업부");
    expect(adminUser.businessAnchorId).toBe("admin-anchor");
  });

  test("기공사업부 앵커가 없으면 관리자 화면을 유지", () => {
    const next = projectAdminDepartmentWorkspace(adminUser, {
      departmentName: "기공사업부",
      internalLabAnchor: null,
    });
    expect(next).toBe(adminUser);
    expect(next.role).toBe("admin");
  });

  test("플랫폼관리부·경영본부와 관리자 외 역할은 그대로", () => {
    expect(
      projectAdminDepartmentWorkspace(adminUser, {
        departmentName: "경영본부",
      }),
    ).toBe(adminUser);
    expect(
      projectAdminDepartmentWorkspace(adminUser, {
        departmentName: "플랫폼관리부",
      }),
    ).toBe(adminUser);
    const labUser = { ...adminUser, role: "internalLab" };
    expect(
      projectAdminDepartmentWorkspace(labUser, {
        departmentName: "마케팅영업부",
      }),
    ).toBe(labUser);
  });
});

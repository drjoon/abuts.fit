import {
  applyLabTechnicianFields,
  canViewerAssignLabTechnician,
  labTechnicianAssignFields,
  labTechnicianClearFields,
  resolveLabTechnician,
  toLabTechnicianApi,
} from "../../utils/practiceTransferLabTechnician.js";

const LAB = "64a0000000000000000000aa";
const PARTNER = "64a0000000000000000000bb";
const CLICKER = "64b000000000000000000001";
const OTHER = "64b000000000000000000002";

describe("practice transfer lab technician", () => {
  test("작업시작 전·취소 건은 담당이 없다", () => {
    expect(resolveLabTechnician({ requestorDownloadedBy: CLICKER })).toBeNull();
    expect(
      resolveLabTechnician({
        requestorDownloadedAt: new Date(),
        requestorDownloadedBy: CLICKER,
        workCanceledAt: new Date(),
        labTechnicianName: "김기사",
      }),
    ).toBeNull();
    expect(toLabTechnicianApi({})).toEqual({ labTechnician: null });
  });

  test("명시 지정이 없으면 작업시작 계정이다", () => {
    const doc = {
      requestorDownloadedAt: new Date(),
      requestorDownloadedBy: CLICKER,
      labTechnicianName: "김기사",
    };
    expect(resolveLabTechnician(doc)).toEqual({
      userId: CLICKER,
      name: "김기사",
    });
  });

  test("바꾼 담당이 작업시작 계정보다 우선한다", () => {
    const doc = {
      requestorDownloadedAt: new Date(),
      requestorDownloadedBy: CLICKER,
      labTechnicianUserId: OTHER,
      labTechnicianName: "이기사",
    };
    expect(toLabTechnicianApi(doc)).toEqual({
      labTechnician: { userId: OTHER, name: "이기사" },
    });
  });

  test("지정·해제 필드를 문서에 반영한다", () => {
    const doc = {};
    const now = new Date("2026-10-24T05:00:00.000Z");
    applyLabTechnicianFields(
      doc,
      labTechnicianAssignFields({ _id: CLICKER, name: " 김기사 " }, now),
    );
    expect(doc).toMatchObject({
      labTechnicianUserId: CLICKER,
      labTechnicianName: "김기사",
      labTechnicianSetAt: now,
    });
    applyLabTechnicianFields(doc, labTechnicianClearFields());
    expect(doc).toMatchObject({
      labTechnicianUserId: null,
      labTechnicianName: "",
      labTechnicianSetAt: null,
    });
  });

  test("수행 기공소만 담당을 바꾼다", () => {
    const direct = {
      requestorDownloadedAt: new Date(),
      requestorDownloadedBy: CLICKER,
      targetLabAnchorId: LAB,
    };
    expect(canViewerAssignLabTechnician(direct, LAB)).toBe(true);
    expect(canViewerAssignLabTechnician(direct, PARTNER)).toBe(false);

    const subcontract = {
      requestorDownloadedAt: new Date(),
      requestorDownloadedBy: CLICKER,
      targetLabAnchorId: LAB,
      targetLabName: "어벗츠기공소",
      assigneeLabAnchorId: PARTNER,
      assigneeKind: "subcontract",
    };
    expect(canViewerAssignLabTechnician(subcontract, PARTNER)).toBe(true);
    expect(canViewerAssignLabTechnician(subcontract, LAB)).toBe(false);

    const cooperation = {
      requestorDownloadedAt: new Date(),
      requestorDownloadedBy: CLICKER,
      targetLabAnchorId: LAB,
      targetLabName: "어벗츠기공소",
      assigneeLabAnchorId: PARTNER,
      assigneeKind: "cooperation",
    };
    expect(canViewerAssignLabTechnician(cooperation, PARTNER)).toBe(true);
    expect(canViewerAssignLabTechnician(cooperation, LAB)).toBe(false);
  });
});

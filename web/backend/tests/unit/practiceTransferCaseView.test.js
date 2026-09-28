// related files:
// - web/backend/utils/practiceTransferCaseView.js
import {
  buildPracticeTransferCaseView,
  caseFileKeyForS3Key,
  listPracticeTransferCaseFiles,
  maskPatientName,
  resolveCaseShareAccess,
  resolvePracticeTransferCaseViewerSide,
} from "../../utils/practiceTransferCaseView.js";

const practiceAnchorId = "64a000000000000000000001";
const primeAnchorId = "64a000000000000000000002";
const assigneeAnchorId = "64a000000000000000000003";
const otherAnchorId = "64a000000000000000000009";
const senderId = "64b000000000000000000001";
const staffId = "64b000000000000000000002";

const fileEntry = (name, s3Key, extra = {}) => ({
  patientName: "홍길동",
  file: { originalName: name, s3Key, size: 10 },
  ...extra,
});

const transferDoc = {
  _id: "64c000000000000000000001",
  transferId: "PTX-1",
  practiceUserId: senderId,
  practiceBusinessAnchorId: practiceAnchorId,
  targetLabAnchorId: primeAnchorId,
  targetLabName: "어벗츠기공소",
  assigneeLabAnchorId: assigneeAnchorId,
  assigneeLabName: "협력기공소",
  assigneeKind: "cooperation",
  toothWorks: [{ toothNumber: "46", prosthesisType: "크라운" }],
  files: [
    fileEntry("upper.ply", "k/upper", { scanRole: "upper" }),
    fileEntry("lower.ply", "k/lower"),
    fileEntry("memo.pdf", "k/pdf"),
  ],
  resultFiles: [fileEntry("crown46.stl", "k/crown")],
  production: {
    designFiles: [fileEntry("abut46.stl", "k/abut")],
    labWorkScanFiles: [],
  },
};

describe("practiceTransferCaseView", () => {
  test("디자인이 먼저, 스캔 다음. 모델·텍스처 외 파일은 뺀다", () => {
    const rows = listPracticeTransferCaseFiles(transferDoc);
    expect(rows.map((r) => r.fileName)).toEqual([
      "crown46.stl",
      "abut46.stl",
      "upper.ply",
      "lower.ply",
    ]);
    expect(rows[0]).toMatchObject({ group: "design", kind: "prosthesis" });
    expect(rows[2]).toMatchObject({ group: "scan", scanRole: "upper" });
    expect(rows[0].fileKey).toBe(caseFileKeyForS3Key("k/crown"));
  });

  test("외부 공개 뷰는 s3Key·참여 기공소를 싣지 않고 환자명을 가린다", () => {
    const view = buildPracticeTransferCaseView(transferDoc, { mode: "public" });
    expect(view.patientName).toBe("홍*동");
    expect(view.participants).toBeUndefined();
    expect(view.files.every((f) => !("s3Key" in f))).toBe(true);
    expect(view.teeth).toEqual([{ tooth: "46", prosthesisType: "크라운" }]);
  });

  test("내부 뷰는 원청·협력 이름을 싣는다", () => {
    const view = buildPracticeTransferCaseView(transferDoc, {
      mode: "internal",
      practiceName: "치과A",
    });
    expect(view.participants).toEqual({
      practiceName: "치과A",
      primeLabName: "어벗츠기공소",
      assigneeLabName: "협력기공소",
      assigneeKind: "cooperation",
    });
    expect(view.files[0].s3Key).toBe("k/crown");
  });

  test("maskPatientName", () => {
    expect(maskPatientName("")).toBe("");
    expect(maskPatientName("김")).toBe("*");
    expect(maskPatientName("김철")).toBe("김*");
    expect(maskPatientName("남궁민수")).toBe("남**수");
  });

  describe("resolveCaseShareAccess", () => {
    const ownerId = "64b000000000000000000010";
    const friendId = "64b000000000000000000011";
    const future = new Date(Date.now() + 60_000);
    const link = (extra = {}) => ({
      createdBy: ownerId,
      visibility: "public",
      allowedUserIds: [],
      expiresAt: future,
      blockedAt: null,
      ...extra,
    });
    const outsider = { _id: friendId, role: "requestor", businessAnchorId: otherAnchorId };
    const primeLab = { _id: staffId, role: "requestor", businessAnchorId: primeAnchorId };
    const check = (l, user = null, doc = transferDoc) =>
      resolveCaseShareAccess({ link: l, transferDoc: doc, user });

    test("누구나: 비로그인도 보고, 환자명은 가린다", async () => {
      await expect(check(link())).resolves.toMatchObject({ ok: true, maskPatient: true });
    });

    test("관계자가 열면 환자명을 가리지 않는다", async () => {
      await expect(check(link(), primeLab)).resolves.toMatchObject({
        ok: true,
        maskPatient: false,
      });
    });

    test("차단·만료·의뢰 삭제는 누구도 못 본다", async () => {
      await expect(check(link({ blockedAt: new Date() }))).resolves.toMatchObject({
        status: 410,
        reason: "blocked",
      });
      await expect(
        check(link({ expiresAt: new Date(Date.now() - 1) }), primeLab),
      ).resolves.toMatchObject({ status: 410, reason: "expired" });
      await expect(
        check(link(), primeLab, { ...transferDoc, status: "deleted" }),
      ).resolves.toMatchObject({ status: 410, reason: "removed" });
    });

    test("지정 계정: 비로그인은 로그인 요청, 목록 밖 계정은 거절", async () => {
      const l = link({ visibility: "accounts", allowedUserIds: [friendId] });
      await expect(check(l)).resolves.toMatchObject({ status: 401, reason: "login_required" });
      await expect(check(l, outsider)).resolves.toMatchObject({ ok: true });
      await expect(check(l, primeLab)).resolves.toMatchObject({
        status: 403,
        reason: "not_allowed",
      });
      await expect(
        check(l, { _id: ownerId, role: "requestor", businessAnchorId: otherAnchorId }),
      ).resolves.toMatchObject({ ok: true });
    });

    test("관계자만: 의뢰 참여 기공소는 보고, 무관한 계정은 거절", async () => {
      const l = link({ visibility: "participants" });
      await expect(check(l)).resolves.toMatchObject({ status: 401 });
      await expect(check(l, primeLab)).resolves.toMatchObject({ ok: true });
      await expect(check(l, outsider)).resolves.toMatchObject({ status: 403 });
    });
  });

  test("원청·수행 기공소·치과 동료는 보고, 무관한 기공소는 못 본다", async () => {
    const lab = (anchor) => ({
      _id: staffId,
      role: "requestor",
      businessAnchorId: anchor,
    });
    await expect(
      resolvePracticeTransferCaseViewerSide(lab(primeAnchorId), transferDoc),
    ).resolves.toBe("lab");
    await expect(
      resolvePracticeTransferCaseViewerSide(lab(assigneeAnchorId), transferDoc),
    ).resolves.toBe("lab");
    await expect(
      resolvePracticeTransferCaseViewerSide(
        { _id: staffId, role: "requestor", businessAnchorId: practiceAnchorId },
        transferDoc,
      ),
    ).resolves.toBe("practice");
    await expect(
      resolvePracticeTransferCaseViewerSide(lab(otherAnchorId), transferDoc),
    ).resolves.toBe(null);
    await expect(
      resolvePracticeTransferCaseViewerSide({ _id: staffId, role: "admin" }, transferDoc),
    ).resolves.toBe("admin");
  });
});

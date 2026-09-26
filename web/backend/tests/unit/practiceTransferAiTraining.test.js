import {
  buildAiTrainingRecord,
  isLabAiTrainingConsentAllowed,
  resolveUnacceptedAiTrainingConsent,
  shouldIncludeInAiTraining,
} from "../../utils/practiceTransferAiTraining.js";

const scan = (role, name, key) => ({
  scanRole: role,
  scanRoleSetBy: role ? "filename" : "",
  file: { originalName: name, s3Key: key },
});

const crown = (extra = {}) => ({
  tooth: "26",
  prosthesisType: "크라운",
  marginArch: "upper",
  marginPoints: Array.from({ length: 8 }, (_, i) => ({
    x: i,
    y: 0,
    z: 0,
  })),
  file: { originalName: "26_crown.stl", s3Key: "result/26" },
  ...extra,
});

describe("buildAiTrainingRecord", () => {
  test("작업완료와 상악·하악·바이트·보철이 있으면 ready", () => {
    const record = buildAiTrainingRecord(
      {
        autoMatch: { completedAt: new Date("2026-09-26T00:00:00.000Z") },
        scanAlignment: { status: "native" },
        files: [
          scan("upper", "upper.stl", "scan/upper"),
          scan("lower", "lower.stl", "scan/lower"),
          scan("bite", "bite.stl", "scan/bite"),
        ],
        resultFiles: [crown()],
      },
      new Date("2026-09-26T01:00:00.000Z"),
    );

    expect(record.status).toBe("ready");
    expect(record.missing).toEqual([]);
    expect(record.pairs).toEqual([
      expect.objectContaining({
        tooth: "26",
        prosthesisType: "크라운",
        s3Key: "result/26",
        upperS3Key: "scan/upper",
        lowerS3Key: "scan/lower",
        biteS3Key: "scan/bite",
        marginPointCount: 8,
      }),
    ]);
  });

  test("파일명만 있는 스캔도 학습 쌍에 넣는다", () => {
    const record = buildAiTrainingRecord({
      autoMatch: { completedAt: new Date() },
      scanAlignment: { status: "aligned" },
      files: [
        {
          file: {
            originalName: "patient_UpperJaw.stl",
            s3Key: "scan/u",
          },
        },
        {
          file: {
            originalName: "patient_LowerJaw.stl",
            s3Key: "scan/l",
          },
        },
        {
          file: {
            originalName: "patient_BiteScan.stl",
            s3Key: "scan/b",
          },
        },
      ],
      resultFiles: [crown({ marginPoints: [] })],
    });

    expect(record.status).toBe("ready");
    expect(record.missing).toEqual(["margin:26"]);
    expect(record.pairs[0].upperS3Key).toBe("scan/u");
    expect(record.pairs[0].biteS3Key).toBe("scan/b");
  });

  test("작업완료 전이면 pending", () => {
    const record = buildAiTrainingRecord({
      files: [scan("upper", "upper.stl", "scan/upper")],
      resultFiles: [],
    });
    expect(record.status).toBe("pending");
    expect(record.missing).toContain("work");
  });

  test("바이트나 디자인 대상 보철이 없으면 incomplete", () => {
    const record = buildAiTrainingRecord({
      autoMatch: { completedAt: new Date() },
      files: [
        scan("upper", "upper.stl", "scan/upper"),
        scan("lower", "lower.stl", "scan/lower"),
      ],
      resultFiles: [
        crown({
          prosthesisType: "덴처",
          tooth: "11",
        }),
      ],
    });
    expect(record.status).toBe("incomplete");
    expect(record.missing).toEqual(
      expect.arrayContaining(["bite", "prosthesis", "alignment"]),
    );
  });
});

describe("isLabAiTrainingConsentAllowed", () => {
  test("없으면 허용이고, false만 거부한다", () => {
    expect(isLabAiTrainingConsentAllowed(undefined)).toBe(true);
    expect(isLabAiTrainingConsentAllowed({})).toBe(true);
    expect(isLabAiTrainingConsentAllowed({ allowed: true })).toBe(true);
    expect(isLabAiTrainingConsentAllowed({ allowed: false })).toBe(true);
    expect(
      isLabAiTrainingConsentAllowed({
        allowed: false,
        updatedAt: new Date(),
      }),
    ).toBe(false);
  });
});

describe("resolveUnacceptedAiTrainingConsent", () => {
  test("작업시작 전에는 현재 동의를 쓰고, 이후에는 스냅샷을 쓴다", () => {
    const declined = { allowed: false, confirmedAt: new Date() };
    expect(
      resolveUnacceptedAiTrainingConsent(
        { billing: { aiTrainingConsent: false } },
        { aiTrainingConsent: { allowed: true, confirmedAt: new Date() } },
      ),
    ).toBe(true);
    expect(
      resolveUnacceptedAiTrainingConsent(
        {
          requestorDownloadedAt: new Date(),
          billing: { aiTrainingConsent: false },
        },
        { aiTrainingConsent: { allowed: true, confirmedAt: new Date() } },
      ),
    ).toBe(false);
    expect(
      resolveUnacceptedAiTrainingConsent(
        { billing: { aiTrainingConsent: false } },
        { aiTrainingConsent: declined },
      ),
    ).toBe(false);
  });
});

describe("shouldIncludeInAiTraining", () => {
  test("어벗츠기공본부는 동의 스냅샷이 없어도 포함한다", () => {
    expect(
      shouldIncludeInAiTraining(
        { billing: {} },
        { businessType: "internalLab" },
      ),
    ).toBe(true);
    expect(
      shouldIncludeInAiTraining({ billing: { internalPerformer: true } }, null),
    ).toBe(true);
  });

  test("동의한 협력·하청만 포함하고, 끄면 넣지 않는다", () => {
    expect(
      shouldIncludeInAiTraining(
        { billing: { aiTrainingConsent: true } },
        { businessType: "requestor" },
      ),
    ).toBe(true);
    expect(
      shouldIncludeInAiTraining(
        { billing: { aiTrainingConsent: false } },
        { businessType: "requestor" },
      ),
    ).toBe(false);
    expect(
      shouldIncludeInAiTraining({ billing: {} }, { businessType: "requestor" }),
    ).toBe(false);
  });
});

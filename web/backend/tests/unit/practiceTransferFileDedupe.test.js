import {
  dedupePracticeTransferFilesByNameSize,
  mergePracticeTransferFilesByS3Key,
} from "../../services/practiceTransferProduction.service.js";

const row = (name, key, size = 10) => ({
  patientName: "노해인",
  scanRole: name.includes("Upper") ? "upper" : name.includes("Lower") ? "lower" : "bite",
  scanRoleSetBy: "filename",
  file: { originalName: name, s3Key: key, size, mimetype: "application/dicom" },
});

describe("dedupePracticeTransferFilesByNameSize", () => {
  test("같은 파일명·용량은 먼저 온 1건만 남긴다", () => {
    const files = dedupePracticeTransferFilesByNameSize([
      row("노해인 UpperJawScan.dcm", "a", 100),
      row("노해인 LowerJawScan.dcm", "b", 80),
      row("노해인 BiteScan.dcm", "c", 40),
      row("노해인 BiteScan2.dcm", "d", 30),
      row("노해인 UpperJawScan.dcm", "a2", 100),
      row("노해인 LowerJawScan.dcm", "b2", 80),
      row("노해인 BiteScan.dcm", "c2", 40),
      row("노해인 BiteScan2.dcm", "d2", 30),
    ]);
    expect(files.map((item) => item.file.s3Key)).toEqual(["a", "b", "c", "d"]);
  });

  test("이름 같고 용량이 다르면 둘 다 남긴다", () => {
    const files = dedupePracticeTransferFilesByNameSize([
      row("scan.dcm", "a", 10),
      row("scan.dcm", "b", 11),
    ]);
    expect(files).toHaveLength(2);
  });

  test("merge도 s3Key가 달라도 같은 파일은 접는다", () => {
    const merged = mergePracticeTransferFilesByS3Key(
      [row("노해인 UpperJawScan.dcm", "a", 100)],
      [row("노해인 UpperJawScan.dcm", "b", 100)],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].file.s3Key).toBe("a");
  });
});

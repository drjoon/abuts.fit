// related files:
// - web/backend/utils/workFilePaint.js
import {
  currentWorkFilePaint,
  sanitizeWorkFilePaintShapes,
  sanitizeWorkFilePaintView,
  toWorkFilePaintApi,
  workFilePaintFileKeys,
} from "../../utils/workFilePaint.js";

const model = (name, s3Key) => ({
  file: { originalName: name, s3Key },
});

const transfer = (extra = {}) => ({
  files: [model("upper.dcm", "k/request-u")],
  resultFiles: [model("crown.stl", "k/crown")],
  production: {
    labWorkScanFiles: [model("상악-작업.dcm", "k/work-u"), model("하악-작업.dcm", "k/work-l")],
    designFiles: [model("abut.stl", "k/abut")],
    ...extra.production,
  },
  ...extra,
});

describe("workFilePaint", () => {
  test("3D 파일 키만 모은다", () => {
    const doc = transfer();
    doc.files.push({ file: { originalName: "photo.jpg", s3Key: "k/photo" } });
    expect(workFilePaintFileKeys(doc)).toEqual([
      "k/abut",
      "k/crown",
      "k/request-u",
      "k/work-l",
      "k/work-u",
    ]);
  });

  test("지금 파일 키와 같을 때만 표시를 돌려준다", () => {
    const shapes = [
      {
        kind: "dot",
        color: "#e11d48",
        width: 4,
        at: { x: 0.2, y: 0.3 },
        pose: {
          origin: { x: 1, y: 2, z: 3 },
          normal: { x: 0, y: 0, z: 1 },
          axisU: { x: 1, y: 0, z: 0 },
          axisV: { x: 0, y: 1, z: 0 },
        },
      },
    ];
    const keys = workFilePaintFileKeys(transfer());
    const painted = transfer({
      production: { workFilePaint: { fileKeys: keys, shapes } },
    });
    expect(currentWorkFilePaint(painted)?.shapes).toHaveLength(1);
    expect(toWorkFilePaintApi(painted).shapes).toHaveLength(1);

    const replaced = transfer({
      production: {
        labWorkScanFiles: [model("상악-작업.dcm", "k/work-u-new")],
        workFilePaint: { fileKeys: keys, shapes },
      },
    });
    expect(currentWorkFilePaint(replaced)).toBeNull();
    expect(toWorkFilePaintApi(replaced).shapes).toEqual([]);
  });

  test("알 수 없는 도형·색은 버린다", () => {
    expect(
      sanitizeWorkFilePaintShapes([
        { kind: "star", color: "#e11d48", width: 4, at: { x: 0, y: 0 } },
        { kind: "dot", color: "red", width: 4, at: { x: 0, y: 0 } },
        { kind: "dot", color: "#2563eb", width: 4, at: { x: 0.1, y: 0.2 } },
      ]),
    ).toEqual([
      { kind: "dot", color: "#2563eb", width: 4, at: { x: 0.1, y: 0.2 }, au: 0, av: 0 },
    ]);
  });

  test("카메라 자세를 검증한다", () => {
    expect(
      sanitizeWorkFilePaintView({
        position: [0, 0, 10],
        target: [0, 0, 0],
        up: [0, 1, 0],
      }),
    ).toEqual({
      position: [0, 0, 10],
      target: [0, 0, 0],
      up: [0, 1, 0],
    });
    expect(
      sanitizeWorkFilePaintView({
        position: [0, 0, 0],
        target: [0, 0, 0],
        up: [0, 1, 0],
      }),
    ).toBeNull();
    const keys = workFilePaintFileKeys(transfer());
    const painted = transfer({
      production: {
        workFilePaint: {
          fileKeys: keys,
          shapes: [],
          view: { position: [1, 2, 3], target: [0, 0, 0], up: [0, 1, 0] },
        },
      },
    });
    expect(toWorkFilePaintApi(painted).view).toEqual({
      position: [1, 2, 3],
      target: [0, 0, 0],
      up: [0, 1, 0],
    });
  });
});

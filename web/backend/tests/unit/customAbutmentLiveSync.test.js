import { sanitizeLiveMesh } from "../../services/customAbutmentLiveSync.js";

function part(byte = 1) {
  return {
    origin: [1.25, -2.5, 0.125],
    scale: 0.00045,
    count: 1,
    bytes: Buffer.from([byte, 0, 2, 0, 3, 0]),
  };
}

describe("custom abutment live mesh", () => {
  test("quantized mesh bytes stay on the relay payload", () => {
    const mesh = sanitizeLiveMesh({
      tooth: "25",
      complete: true,
      picker: true,
      variantId: "buccal_top_open",
      items: [
        {
          id: "buccal_top_open",
          label: "협측 상단",
          params: { postHeightOffsetMm: 0.2, bad: "x" },
          metrics: { postHeightMm: 5.31 },
          abutment: part(4),
          crown: part(5),
          margin: part(6),
        },
        {
          id: "space_fill",
          label: "기본",
          params: {},
          metrics: {},
          abutment: part(7),
          crown: part(8),
          margin: part(9),
        },
        { id: "nope", label: "버림", abutment: part(), crown: part(), margin: part() },
      ],
    });
    expect(mesh.tooth).toBe("25");
    expect(mesh.complete).toBe(false);
    expect(mesh.picker).toBe(true);
    expect(mesh.variantId).toBe("buccal_top_open");
    expect(mesh.items.map((row) => row.id)).toEqual(["buccal_top_open", "space_fill"]);
    expect(mesh.items[0].abutment.bytes[0]).toBe(4);
    expect(mesh.items[0].abutment.scale).toBe(0.00045);
    expect(mesh.items[0].params).toEqual({ postHeightOffsetMm: 0.2 });
    expect(mesh.candidates.map((row) => row.id)).toEqual(["buccal_top_open", "space_fill"]);
  });

  test("a mesh without the three parts is dropped", () => {
    expect(
      sanitizeLiveMesh({
        tooth: "25",
        items: [{ id: "space_fill", abutment: part() }],
      }),
    ).toBeNull();
  });
});

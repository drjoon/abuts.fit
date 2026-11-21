import {
  getCanonicalImplantSpecKey,
  listImplantBrandRows,
} from "../../utils/implantCanonical.js";
import { chooseProducerAnchorId } from "../../services/producerAssignment.service.js";

describe("첨1 브랜드·패밀리", () => {
  test("관리자 목록에 오스템 TS3 Mini와 Regular가 있다", () => {
    const rows = listImplantBrandRows();
    expect(rows.map((row) => row.brandKey)).toEqual(
      expect.arrayContaining(["OSSTEM_TS3_Regular", "OSSTEM_TS3_Mini"]),
    );
    expect(
      rows.find((row) => row.brandKey === "OSSTEM_TS3_Mini")?.label,
    ).toContain("Mini");
    expect(getCanonicalImplantSpecKey("오스템", "TS", "Mini")).toBe(
      "OSSTEM_TS3_Mini",
    );
  });
});

describe("chooseProducerAnchorId", () => {
  const running = (approved = true) => ({
    operatingStatus: "running",
    approved,
  });

  test("가동 중인 기본 제조사를 고른다", () => {
    const byId = new Map([
      ["default", running()],
      ["alternate", running()],
      ["platform", running()],
    ]);
    expect(
      chooseProducerAnchorId({
        defaultAnchorId: "default",
        alternateAnchorId: "alternate",
        platformAnchorId: "platform",
        byId,
      }),
    ).toBe("default");
  });

  test("기본 제조사가 중단이면 대체를 고른다", () => {
    const byId = new Map([
      ["default", { operatingStatus: "paused", approved: true }],
      ["alternate", running()],
      ["platform", running()],
    ]);
    expect(
      chooseProducerAnchorId({
        defaultAnchorId: "default",
        alternateAnchorId: "alternate",
        platformAnchorId: "platform",
        byId,
      }),
    ).toBe("alternate");
  });

  test("기본과 대체가 없으면 플랫폼 제조사로 간다", () => {
    const byId = new Map([["platform", running()]]);
    expect(
      chooseProducerAnchorId({
        defaultAnchorId: null,
        alternateAnchorId: null,
        platformAnchorId: "platform",
        byId,
      }),
    ).toBe("platform");
  });

  test("승인 전 제조사는 건너뛴다", () => {
    const byId = new Map([
      ["default", running(false)],
      ["platform", running()],
    ]);
    expect(
      chooseProducerAnchorId({
        defaultAnchorId: "default",
        alternateAnchorId: null,
        platformAnchorId: "platform",
        byId,
      }),
    ).toBe("platform");
  });
});

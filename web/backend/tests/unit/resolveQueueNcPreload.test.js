import { resolveQueueNcPreload } from "../../utils/queueNcPreload.js";

describe("resolveQueueNcPreload", () => {
  it("heals GENERATING when NC s3Key exists", () => {
    const healIds = [];
    const out = resolveQueueNcPreload(
      {
        _id: "abc",
        caseInfos: { ncFile: { s3Key: "requests/x/3-nc/x.nc" } },
        productionSchedule: {
          ncPreload: { status: "GENERATING", machineId: "M4", error: "old" },
        },
      },
      healIds,
    );
    expect(out.status).toBe("NONE");
    expect(out.error).toBeNull();
    expect(healIds).toEqual(["abc"]);
  });

  it("keeps GENERATING when NC is missing", () => {
    const healIds = [];
    const out = resolveQueueNcPreload(
      {
        _id: "abc",
        caseInfos: { ncFile: null },
        productionSchedule: {
          ncPreload: { status: "GENERATING", machineId: "M4" },
        },
      },
      healIds,
    );
    expect(out.status).toBe("GENERATING");
    expect(healIds).toEqual([]);
  });

  it("returns null when ncPreload is absent", () => {
    expect(resolveQueueNcPreload({ caseInfos: {} }, [])).toBeNull();
  });
});

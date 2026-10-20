import { pickTaperCluster } from "../../services/abutmentStl/cuffSpecSuggest.service.js";

describe("pickTaperCluster", () => {
  it("takes the majority cluster median and counts outliers", () => {
    const r = pickTaperCluster([0.72, 0.73, 0.74, 0.74, 0.74, 0.82, 1.02]);
    expect(r).toEqual({ status: "ready", taperHeightMm: 0.74, clusterCount: 5, outlierCount: 2 });
  });

  it("reports mixed when no cluster holds a majority", () => {
    expect(pickTaperCluster([0.2, 0.4, 0.6, 0.8, 1.0]).status).toBe("mixed");
  });

  it("needs at least 3 samples in the cluster", () => {
    expect(pickTaperCluster([0.2, 0.21, 0.5]).status).toBe("mixed");
  });
});

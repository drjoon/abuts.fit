import { describe, expect, it } from "@jest/globals";
import {
  DESIGN_ROUTE_DIRECT,
  DESIGN_ROUTE_LAB,
  DESIGN_ROUTE_PLATFORM,
  acceptFilledCallback,
  acceptNcCallback,
  currentDesignRoute,
  designRouteBlockMessage,
  filledStlS3Key,
  ncMatchesCurrentDesign,
  oralSourcesOnly,
} from "../../services/abutmentDesignRoute.js";

describe("abutment design route", () => {
  it("keeps a waiting lab case open until a design file exists", () => {
    expect(
      currentDesignRoute({
        partnerBilling: { relatedPracticeTransferId: "t1", labDesignedAbutment: true },
      }),
    ).toBe("");
  });

  it("blocks platform confirm after a lab file, and lab handoff after requester confirm", () => {
    const lab = {
      designCompletedAt: new Date(),
      caseInfos: { file: { s3Key: "labs/tooth.stl" } },
      partnerBilling: { relatedPracticeTransferId: "t1" },
    };
    expect(currentDesignRoute(lab)).toBe(DESIGN_ROUTE_LAB);
    expect(designRouteBlockMessage(lab, DESIGN_ROUTE_PLATFORM)).toMatch(/기공소/);
    expect(designRouteBlockMessage(lab, DESIGN_ROUTE_LAB)).toBe("");

    const platform = {
      caseInfos: { designRoute: DESIGN_ROUTE_PLATFORM, file: { s3Key: "requests/r/1-stl/platform/a.stl" } },
    };
    expect(designRouteBlockMessage(platform, DESIGN_ROUTE_LAB)).toMatch(/의뢰자/);
  });

  it("does not keep a platform preview in the oral-scan list", () => {
    const kept = oralSourcesOnly(
      [
        { s3Key: "practice-transfers/t/scans/a.stl" },
        { s3Key: "practice-transfers/t/custom-abutment-preview/38-abutment.stl" },
        { s3Key: "requests/r/1-stl/platform/abc.stl" },
        { s3Key: "labs/old-abutment.stl" },
      ],
      ["labs/old-abutment.stl"],
    );
    expect(kept.map((row) => row.s3Key)).toEqual(["practice-transfers/t/scans/a.stl"]);
  });

  it("puts each design generation in its own filled key", () => {
    expect(filledStlS3Key("R1", "a.filled.stl", "")).toBe("requests/R1/2-filled/a.filled.stl");
    expect(filledStlS3Key("R1", "a.filled.stl", "gen2")).toBe(
      "requests/R1/2-filled/gen2/a.filled.stl",
    );
  });

  it("rejects a filled or NC callback from the previous design", () => {
    const request = {
      caseInfos: {
        designGeneration: "gen2",
        stlFile: { s3Key: "requests/R1/2-filled/gen2/a.filled.stl", designGeneration: "gen2" },
        ncFile: { s3Key: "old.nc", designGeneration: "gen1", filledS3Key: "requests/R1/2-filled/gen1/a.filled.stl" },
      },
      productionSchedule: { ncBind: { generation: "gen1", filledS3Key: "requests/R1/2-filled/gen1/a.filled.stl" } },
    };
    expect(acceptFilledCallback(request, "gen1")).toBe(false);
    expect(acceptFilledCallback(request, "")).toBe(false);
    expect(acceptFilledCallback(request, "gen2")).toBe(true);
    expect(acceptNcCallback(request)).toBe(false);
    expect(ncMatchesCurrentDesign(request.caseInfos)).toBe(false);

    request.productionSchedule.ncBind = {
      generation: "gen2",
      filledS3Key: "requests/R1/2-filled/gen2/a.filled.stl",
    };
    expect(acceptNcCallback(request)).toBe(true);
  });

  it("leaves a request-page order on the direct route", () => {
    expect(
      designRouteBlockMessage(
        { caseInfos: { designRoute: DESIGN_ROUTE_DIRECT, file: { s3Key: "orders/a.stl" } } },
        DESIGN_ROUTE_PLATFORM,
      ),
    ).toMatch(/의뢰하기/);
  });
});

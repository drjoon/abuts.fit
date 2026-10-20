import { unsupportedConnectionHistoryNote } from "../../services/unsupportedConnectionRnd.service.js";

describe("unsupported connection R&D note", () => {
  test("history note names the implant spec", () => {
    expect(
      unsupportedConnectionHistoryNote({
        implantManufacturer: "OSSTEM",
        implantBrand: "TS3",
        implantFamily: "Mini",
        implantType: "Hex",
      }),
    ).toBe("제공하지 않는 커넥션: OSSTEM / TS3 / Mini / Hex");
  });
});

import { normalizeInboundMailAddress } from "../../services/mailSenderNotSpam.service.js";

describe("normalizeInboundMailAddress", () => {
  it("lowercases plain addresses", () => {
    expect(normalizeInboundMailAddress("User@Example.COM")).toBe(
      "user@example.com",
    );
  });

  it("extracts address from display name form", () => {
    expect(
      normalizeInboundMailAddress("국세청 <hometaxadmin@hometax.go.kr>"),
    ).toBe("hometaxadmin@hometax.go.kr");
  });

  it("returns empty for invalid input", () => {
    expect(normalizeInboundMailAddress("")).toBe("");
    expect(normalizeInboundMailAddress("not-an-email")).toBe("");
  });
});

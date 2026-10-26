import { describe, expect, test } from "@jest/globals";
import { isSameCorporationBusinessAnchor } from "../../controllers/businesses/business.find.util.js";

describe("isSameCorporationBusinessAnchor", () => {
  const admin = { _id: "admin", parentBusinessAnchorId: null };
  const labDivision = {
    _id: "lab",
    parentBusinessAnchorId: "admin",
  };
  const sibling = {
    _id: "sibling",
    parentBusinessAnchorId: "admin",
  };
  const outsider = { _id: "outsider", parentBusinessAnchorId: null };

  test("parent and child share one corporation", () => {
    expect(isSameCorporationBusinessAnchor(admin, labDivision)).toBe(true);
    expect(isSameCorporationBusinessAnchor(labDivision, admin)).toBe(true);
  });

  test("siblings under the same parent share one corporation", () => {
    expect(isSameCorporationBusinessAnchor(labDivision, sibling)).toBe(true);
  });

  test("a new signup is not the same corporation as an existing business", () => {
    expect(isSameCorporationBusinessAnchor(null, admin)).toBe(false);
    expect(isSameCorporationBusinessAnchor(outsider, admin)).toBe(false);
    expect(isSameCorporationBusinessAnchor(outsider, labDivision)).toBe(false);
  });
});

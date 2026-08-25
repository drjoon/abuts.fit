// related files:
// - web/backend/controllers/businesses/business.utils.js
// - web/backend/controllers/businesses/business.controller.js
// - web/backend/utils/internalDepartments.util.js

/** 치과(practice) UI/API businessType ↔ DB BusinessAnchor.businessType 정규화 */
export function isCompatibleOrgBusinessType(requestedType, anchor) {
  if (!anchor) return false;
  const requested = String(requestedType || "").trim();
  const anchorType = String(anchor.businessType || "").trim();
  const kind = String(anchor.requestorKind || "").trim();

  if (!requested || !anchorType) return false;
  if (requested === anchorType) return true;

  if (requested === "practice") {
    return (
      anchorType === "practice" ||
      (anchorType === "requestor" && kind !== "lab")
    );
  }

  if (requested === "requestor") {
    return anchorType === "requestor" || anchorType === "practice";
  }

  return false;
}

export function buildOrgBusinessTypeQuery(requestedType) {
  const requested = String(requestedType || "").trim();
  if (requested === "practice") {
    return {
      $or: [
        { businessType: "practice" },
        {
          businessType: "requestor",
          $or: [
            { requestorKind: "practice" },
            { requestorKind: { $in: [null, ""] } },
            { requestorKind: { $exists: false } },
          ],
        },
      ],
    };
  }
  if (requested === "requestor") {
    return {
      businessType: { $in: ["requestor", "practice"] },
    };
  }
  return { businessType: requested };
}

export function resolveOrgKindForDefaults(anchor) {
  const anchorType = String(anchor?.businessType || "").trim();
  const kind = String(anchor?.requestorKind || "").trim();
  if (anchorType === "practice") return "practice";
  if (kind === "lab") return "lab";
  if (kind === "practice") return "practice";
  if (anchorType === "requestor") return "practice";
  return "";
}

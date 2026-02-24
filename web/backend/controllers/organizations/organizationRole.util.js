export const ORGANIZATION_ALLOWED_ROLES = [
  "requestor",
  "salesman",
  "manufacturer",
];

export const ORGANIZATION_ALLOWED_ROLE_SET = new Set(
  ORGANIZATION_ALLOWED_ROLES,
);

const ADMIN_FALLBACK_ORG_TYPE = "requestor";

export const resolveOrganizationType = (user, preferredType) => {
  if (!user) return null;
  if (ORGANIZATION_ALLOWED_ROLE_SET.has(user.role)) {
    return user.role;
  }
  if (user.role === "admin") {
    if (preferredType && ORGANIZATION_ALLOWED_ROLE_SET.has(preferredType)) {
      return preferredType;
    }
    return ADMIN_FALLBACK_ORG_TYPE;
  }
  return null;
};

const pickPreferredTypeFromRequest = (req) => {
  const candidates = [
    req?.query?.organizationType,
    req?.body?.organizationType,
    req?.params?.organizationType,
  ];
  for (const raw of candidates) {
    if (typeof raw !== "string") continue;
    const value = raw.trim();
    if (value && ORGANIZATION_ALLOWED_ROLE_SET.has(value)) {
      return value;
    }
  }
  return null;
};

export const assertOrganizationRole = (req, res) => {
  const preferredType = pickPreferredTypeFromRequest(req);
  const organizationType = resolveOrganizationType(req.user, preferredType);
  if (!organizationType) {
    res.status(403).json({
      success: false,
      message: "이 작업을 수행할 권한이 없습니다.",
    });
    return null;
  }
  return { organizationType, isAdminActing: req.user?.role === "admin" };
};

export const buildOrganizationTypeFilter = (organizationType) => {
  if (!organizationType) return {};
  if (organizationType === "requestor") {
    return {
      $or: [
        { organizationType: "requestor" },
        { organizationType: { $exists: false } },
        { organizationType: "" },
        { organizationType: null },
      ],
    };
  }
  return { organizationType };
};

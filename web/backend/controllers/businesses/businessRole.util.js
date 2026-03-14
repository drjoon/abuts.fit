export const BUSINESS_ALLOWED_ROLES = [
  "requestor",
  "salesman",
  "manufacturer",
  "devops",
];

export const BUSINESS_ALLOWED_ROLE_SET = new Set(BUSINESS_ALLOWED_ROLES);

const ADMIN_FALLBACK_BUSINESS_TYPE = "requestor";

export const resolveBusinessType = (user, preferredType) => {
  if (!user) return null;
  if (BUSINESS_ALLOWED_ROLE_SET.has(user.role)) {
    return user.role;
  }
  if (user.role === "admin") {
    if (preferredType && BUSINESS_ALLOWED_ROLE_SET.has(preferredType)) {
      return preferredType;
    }
    return ADMIN_FALLBACK_BUSINESS_TYPE;
  }
  return null;
};

const pickPreferredTypeFromRequest = (req) => {
  const candidates = [
    req?.query?.businessType,
    req?.body?.businessType,
    req?.params?.businessType,
  ];
  for (const raw of candidates) {
    if (typeof raw !== "string") continue;
    const value = raw.trim();
    if (value && BUSINESS_ALLOWED_ROLE_SET.has(value)) {
      return value;
    }
  }
  return null;
};

export const assertBusinessRole = (req, res) => {
  const preferredType = pickPreferredTypeFromRequest(req);
  const businessType = resolveBusinessType(req.user, preferredType);
  if (!businessType) {
    res.status(403).json({
      success: false,
      message: "이 작업을 수행할 권한이 없습니다.",
    });
    return null;
  }
  return { businessType, isAdminActing: req.user?.role === "admin" };
};

export const buildBusinessTypeFilter = (businessType) => {
  if (!businessType) return {};
  if (businessType === "requestor") {
    return {
      $or: [
        { businessType: "requestor" },
        {
          $or: [
            { businessType: { $exists: false } },
            { businessType: "" },
            { businessType: null },
          ],
        },
      ],
    };
  }
  return { businessType };
};

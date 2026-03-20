import { request } from "@/shared/api/apiClient";

const businessMeCache = new Map<
  string,
  {
    data: any;
    expiresAt: number;
  }
>();
const businessMeInFlight = new Map<string, Promise<any | null>>();

const buildBusinessMeCacheKey = ({
  token,
  businessType,
}: {
  token?: string;
  businessType: string;
}) => {
  return `${String(token || "")}:${String(businessType || "").trim()}`;
};

export const invalidateBusinessMeCache = ({
  token,
  businessType,
}: {
  token?: string;
  businessType: string;
}) => {
  businessMeCache.delete(buildBusinessMeCacheKey({ token, businessType }));
};

export const loadBusinessMeCached = async ({
  token,
  businessType,
  force,
}: {
  token?: string;
  businessType: string;
  force?: boolean;
}) => {
  if (!token) return null;

  const cacheKey = buildBusinessMeCacheKey({ token, businessType });
  if (!force) {
    const cached = businessMeCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const existing = businessMeInFlight.get(cacheKey);
    if (existing) {
      return existing;
    }
  } else {
    businessMeCache.delete(cacheKey);
  }

  const promise = request<any>({
    path: `/api/businesses/me?businessType=${encodeURIComponent(businessType)}`,
    method: "GET",
    token,
  })
    .then((res) => {
      if (!res.ok) return null;
      const body: any = res.data || {};
      const data = body.data || body;
      businessMeCache.set(cacheKey, {
        data,
        expiresAt: Date.now() + 30 * 1000,
      });
      return data;
    })
    .finally(() => {
      businessMeInFlight.delete(cacheKey);
    });

  businessMeInFlight.set(cacheKey, promise);
  return promise;
};

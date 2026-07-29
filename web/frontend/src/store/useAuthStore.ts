// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { create } from "zustand";
import { request } from "@/shared/api/apiClient";

const AUTH_TOKEN_KEY = "abuts_auth_token";
const AUTH_REFRESH_TOKEN_KEY = "abuts_auth_refresh_token";
const AUTH_USER_KEY = "abuts_auth_user";

export type UserRole =
  | "requestor"
  | "manufacturer"
  | "admin"
  | "salesman"
  | "devops"
  | "practice";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  subRole?: string | null;
  avatar?: string;
  profileImage?: string;
  companyName?: string;
  referralCode?: string;
  approvedAt?: string | null;
  businessAnchorId?: string | null;
  businessVerified?: boolean;
  onboardingWizardCompleted?: boolean;
  practiceProfile?: {
    clinicName?: string;
    staffName?: string;
    phone?: string;
    address?: string;
    addressDetail?: string;
    zipCode?: string;
    updatedAt?: string | null;
  } | null;
  salesmanPayoutAccount?: {
    bankName: string;
    accountNumber: string;
    holderName: string;
    updatedAt?: string | null;
  };
}

const normalizeApiUser = (u: unknown): User | null => {
  if (!u || typeof u !== "object" || Array.isArray(u)) return null;
  const row = u as Record<string, unknown>;
  const id = String(row._id || row.id || "");
  if (!id) return null;
  const pa =
    row.salesmanPayoutAccount && typeof row.salesmanPayoutAccount === "object"
      ? (row.salesmanPayoutAccount as Record<string, unknown>)
      : {};
  return {
    id,
    name: String(row.name || ""),
    email: String(row.email || ""),
    role: row.role as UserRole,
    subRole: row.subRole ? String(row.subRole) : null,
    profileImage:
      typeof row.profileImage === "string" ? row.profileImage : undefined,
    companyName: String(row.business || row.companyName || ""),
    referralCode: String(row.referralCode || ""),
    approvedAt: row.approvedAt ? String(row.approvedAt) : null,
    businessAnchorId: row.businessAnchorId ? String(row.businessAnchorId) : null,
    businessVerified: Boolean(row.businessVerified),
    onboardingWizardCompleted: Boolean(row.onboardingWizardCompleted),
    practiceProfile:
      row.practiceProfile && typeof row.practiceProfile === "object"
        ? {
            clinicName: String(
              (row.practiceProfile as Record<string, unknown>)?.clinicName || "",
            ),
            staffName: String(
              (row.practiceProfile as Record<string, unknown>)?.staffName || "",
            ),
            phone: String(
              (row.practiceProfile as Record<string, unknown>)?.phone || "",
            ),
            address: String(
              (row.practiceProfile as Record<string, unknown>)?.address || "",
            ),
            addressDetail: String(
              (row.practiceProfile as Record<string, unknown>)?.addressDetail || "",
            ),
            zipCode: String(
              (row.practiceProfile as Record<string, unknown>)?.zipCode || "",
            ),
            updatedAt: (row.practiceProfile as Record<string, unknown>)?.updatedAt
              ? String((row.practiceProfile as Record<string, unknown>).updatedAt)
              : null,
          }
        : null,
    salesmanPayoutAccount:
      row.role === "salesman" || row.role === "devops"
        ? {
            bankName: String(pa?.bankName || ""),
            accountNumber: String(pa?.accountNumber || ""),
            holderName: String(pa?.holderName || ""),
            updatedAt: pa?.updatedAt ? String(pa.updatedAt) : null,
          }
        : undefined,
  };
};

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  token: string | null;
  refreshToken: string | null;
  login: (
    email: string,
    password: string,
  ) => Promise<{ success: boolean; message?: string }>;
  practiceLogin: (
    clinicName: string,
    password: string,
  ) => Promise<{ success: boolean; message?: string }>;
  loginWithToken: (
    token: string,
    refreshToken?: string | null,
  ) => Promise<boolean>;
  setUser: (user: User | null) => void;
  logout: () => void;
}

const loadStoredAuth = () => {
  try {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    const refreshToken = localStorage.getItem(AUTH_REFRESH_TOKEN_KEY);
    const userRaw = localStorage.getItem(AUTH_USER_KEY);
    const user = userRaw ? (JSON.parse(userRaw) as User) : null;
    return {
      token: token || null,
      refreshToken: refreshToken || null,
      user,
    };
  } catch {
    return { token: null, refreshToken: null, user: null };
  }
};

export const useAuthStore = create<AuthState>((set, get) => {
  const stored = loadStoredAuth();

  return {
    user: stored.user,
    isAuthenticated: Boolean(stored.token && stored.user),
    token: stored.token,
    refreshToken: stored.refreshToken,
    login: async (email: string, password: string) => {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        });

        const json = (await res.json().catch(() => null)) as
          | { success?: boolean; message?: string; data?: unknown }
          | null;
        if (!res.ok || !json?.success) {
          const message = String(
            json?.message || "로그인에 실패했습니다. 다시 시도해주세요.",
          );
          return { success: false, message };
        }

        const data =
          json?.data && typeof json.data === "object"
            ? (json.data as Record<string, unknown>)
            : {};
        const token = String(data.token || "");
        const refreshToken = data.refreshToken ? String(data.refreshToken) : null;
        const normalizedUser = normalizeApiUser(data.user);
        if (!token || !normalizedUser) {
          return {
            success: false,
            message: "로그인 처리에 필요한 정보가 누락되었습니다.",
          };
        }

        try {
          localStorage.setItem(AUTH_TOKEN_KEY, token);
          if (refreshToken)
            localStorage.setItem(AUTH_REFRESH_TOKEN_KEY, refreshToken);
          localStorage.setItem(AUTH_USER_KEY, JSON.stringify(normalizedUser));
        } catch {
          return {
            success: false,
            message:
              "로그인 정보를 저장하지 못했습니다. 브라우저 설정을 확인해주세요.",
          };
        }

        set({
          user: normalizedUser,
          isAuthenticated: true,
          token,
          refreshToken,
        });

        return { success: true };
      } catch {
        return {
          success: false,
          message: "로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
        };
      }
    },
    // related files:
    // - web/frontend/src/features/auth/LoginPage.tsx
    // - web/backend/controllers/auth/auth.controller.js
    practiceLogin: async (clinicName: string, password: string) => {
      try {
        const res = await fetch("/api/auth/practice/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ clinicName, password }),
        });

        const json = (await res.json().catch(() => null)) as
          | { success?: boolean; message?: string; data?: unknown }
          | null;
        if (!res.ok || !json?.success) {
          const message = String(
            json?.message || "로그인에 실패했습니다. 다시 시도해주세요.",
          );
          return { success: false, message };
        }

        const data =
          json?.data && typeof json.data === "object"
            ? (json.data as Record<string, unknown>)
            : {};
        const token = String(data.token || "");
        const refreshToken = data.refreshToken ? String(data.refreshToken) : null;
        const normalizedUser = normalizeApiUser(data.user);
        if (!token || !normalizedUser) {
          return {
            success: false,
            message: "로그인 처리에 필요한 정보가 누락되었습니다.",
          };
        }

        try {
          localStorage.setItem(AUTH_TOKEN_KEY, token);
          if (refreshToken)
            localStorage.setItem(AUTH_REFRESH_TOKEN_KEY, refreshToken);
          localStorage.setItem(AUTH_USER_KEY, JSON.stringify(normalizedUser));
        } catch {
          return {
            success: false,
            message:
              "로그인 정보를 저장하지 못했습니다. 브라우저 설정을 확인해주세요.",
          };
        }

        set({
          user: normalizedUser,
          isAuthenticated: true,
          token,
          refreshToken,
        });

        return { success: true };
      } catch {
        return {
          success: false,
          message: "로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
        };
      }
    },
    loginWithToken: async (token: string, refreshToken?: string | null) => {
      try {
        const res = await request<unknown>({
          path: "/api/auth/me",
          method: "GET",
          token,
        });
        const json = (res.data || null) as
          | { success?: boolean; data?: unknown }
          | null;
        if (!res.ok || !json?.success || !json?.data) return false;

        const u = json.data as Record<string, unknown>;
        if (!u || typeof u !== "object" || Array.isArray(u)) return false;
        if (!u._id && !u.id) return false;
        const normalizedUser: User = {
          id: String(u._id || u.id || ""),
          name: String(u.name || ""),
          email: String(u.email || ""),
          role: u.role as UserRole,
          subRole: u.subRole ? String(u.subRole) : null,
          profileImage:
            typeof u.profileImage === "string" ? u.profileImage : undefined,
          companyName: String(u.business || u.companyName || ""),
          referralCode: String(u.referralCode || ""),
          approvedAt: u.approvedAt ? String(u.approvedAt) : null,
          businessAnchorId: u.businessAnchorId
            ? String(u.businessAnchorId)
            : null,
          businessVerified: Boolean(u.businessVerified),
          onboardingWizardCompleted: Boolean(u.onboardingWizardCompleted),
          practiceProfile:
            u.practiceProfile &&
            typeof u.practiceProfile === "object" &&
            !Array.isArray(u.practiceProfile)
              ? {
                  clinicName: String(
                    (u.practiceProfile as Record<string, unknown>)?.clinicName || "",
                  ),
                  staffName: String(
                    (u.practiceProfile as Record<string, unknown>)?.staffName || "",
                  ),
                  phone: String(
                    (u.practiceProfile as Record<string, unknown>)?.phone || "",
                  ),
                  address: String(
                    (u.practiceProfile as Record<string, unknown>)?.address || "",
                  ),
                  addressDetail: String(
                    (u.practiceProfile as Record<string, unknown>)?.addressDetail || "",
                  ),
                  zipCode: String(
                    (u.practiceProfile as Record<string, unknown>)?.zipCode || "",
                  ),
                  updatedAt: (u.practiceProfile as Record<string, unknown>)?.updatedAt
                    ? String((u.practiceProfile as Record<string, unknown>).updatedAt)
                    : null,
                }
              : null,
        };

        try {
          localStorage.setItem(AUTH_TOKEN_KEY, token);
          if (refreshToken)
            localStorage.setItem(AUTH_REFRESH_TOKEN_KEY, refreshToken);
          localStorage.setItem(AUTH_USER_KEY, JSON.stringify(normalizedUser));
        } catch {
          // ignore
        }

        set({
          user: normalizedUser,
          isAuthenticated: true,
          token,
          refreshToken: refreshToken || null,
        });
        return true;
      } catch {
        return false;
      }
    },
    setUser: (user: User | null) => {
      try {
        if (user) {
          localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
        } else {
          localStorage.removeItem(AUTH_USER_KEY);
        }
      } catch {
        // ignore
      }
      set((state) => ({
        user,
        isAuthenticated: Boolean(state.token && user),
      }));
    },
    logout: () => {
      try {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        localStorage.removeItem(AUTH_REFRESH_TOKEN_KEY);
        localStorage.removeItem(AUTH_USER_KEY);
      } catch {
        // ignore
      }
      set({
        user: null,
        isAuthenticated: false,
        token: null,
        refreshToken: null,
      });
    },
  };
});

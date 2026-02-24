import { create } from "zustand";
import { request } from "@/shared/api/apiClient";

const AUTH_TOKEN_KEY = "abuts_auth_token";
const AUTH_REFRESH_TOKEN_KEY = "abuts_auth_refresh_token";
const AUTH_USER_KEY = "abuts_auth_user";

export type UserRole = "requestor" | "manufacturer" | "admin" | "salesman";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  companyName?: string;
  referralCode?: string;
  approvedAt?: string | null;
  organizationId?: string | null;
  onboardingWizardCompleted?: boolean;
  salesmanPayoutAccount?: {
    bankName: string;
    accountNumber: string;
    holderName: string;
    updatedAt?: string | null;
  };
}

const normalizeApiUser = (u: any): User | null => {
  if (!u || typeof u !== "object" || Array.isArray(u)) return null;
  const id = String(u._id || u.id || "");
  if (!id) return null;
  const pa = u.salesmanPayoutAccount || {};
  return {
    id,
    name: String(u.name || ""),
    email: String(u.email || ""),
    role: u.role as UserRole,
    companyName: String(u.organization || u.companyName || ""),
    referralCode: String(u.referralCode || ""),
    approvedAt: u.approvedAt ? String(u.approvedAt) : null,
    organizationId: u.organizationId ? String(u.organizationId) : null,
    onboardingWizardCompleted: Boolean(u.onboardingWizardCompleted),
    salesmanPayoutAccount:
      u.role === "salesman"
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
  login: (email: string, password: string) => Promise<boolean>;
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

        const json: any = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          console.error("[login] API error:", json?.message || "Unknown error");
          return false;
        }

        const data = json?.data || {};
        const token = String(data?.token || "");
        const refreshToken = data?.refreshToken
          ? String(data.refreshToken)
          : null;
        const normalizedUser = normalizeApiUser(data?.user);
        if (!token || !normalizedUser) {
          console.error("[login] Missing token or user:", {
            token: !!token,
            user: !!normalizedUser,
          });
          return false;
        }

        try {
          localStorage.setItem(AUTH_TOKEN_KEY, token);
          if (refreshToken)
            localStorage.setItem(AUTH_REFRESH_TOKEN_KEY, refreshToken);
          localStorage.setItem(AUTH_USER_KEY, JSON.stringify(normalizedUser));
          console.log("[login] Tokens saved to localStorage");
        } catch (err) {
          console.error("[login] localStorage save failed:", err);
          return false;
        }

        set({
          user: normalizedUser,
          isAuthenticated: true,
          token,
          refreshToken,
        });

        return true;
      } catch (err) {
        console.error("[login] Unexpected error:", err);
        return false;
      }
    },
    loginWithToken: async (token: string, refreshToken?: string | null) => {
      try {
        const res = await request<any>({
          path: "/api/auth/me",
          method: "GET",
          token,
        });
        const json: any = res.data;
        if (!res.ok || !json?.success || !json?.data) return false;

        const u = json.data;
        if (!u || typeof u !== "object" || Array.isArray(u)) return false;
        if (!u._id && !u.id) return false;
        const normalizedUser: User = {
          id: String(u._id || u.id || ""),
          name: String(u.name || ""),
          email: String(u.email || ""),
          role: u.role as UserRole,
          companyName: String(u.organization || u.companyName || ""),
          referralCode: String(u.referralCode || ""),
          approvedAt: u.approvedAt ? String(u.approvedAt) : null,
          organizationId: u.organizationId ? String(u.organizationId) : null,
          onboardingWizardCompleted: Boolean(u.onboardingWizardCompleted),
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

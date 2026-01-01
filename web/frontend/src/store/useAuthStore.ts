import { create } from "zustand";
import { request } from "@/lib/apiClient";

const AUTH_TOKEN_KEY = "abuts_auth_token";
const AUTH_REFRESH_TOKEN_KEY = "abuts_auth_refresh_token";
const AUTH_USER_KEY = "abuts_auth_user";

export type UserRole = "requestor" | "manufacturer" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  companyName?: string;
  referralCode?: string;
  mockUserId?: string;
  approvedAt?: string | null;
  organizationId?: string | null;
}

const normalizeApiUser = (u: any): User | null => {
  if (!u || typeof u !== "object" || Array.isArray(u)) return null;
  const id = String(u._id || u.id || "");
  if (!id) return null;
  return {
    id,
    name: String(u.name || ""),
    email: String(u.email || ""),
    role: u.role as UserRole,
    companyName: String(u.organization || u.companyName || ""),
    referralCode: String(u.referralCode || ""),
    approvedAt: u.approvedAt ? String(u.approvedAt) : null,
    organizationId: u.organizationId ? String(u.organizationId) : null,
  };
};

export const mockUsers: User[] = [
  {
    id: "1",
    name: "의뢰인 1",
    email: "requestor.principal@demo.abuts.fit",
    role: "requestor",
    companyName: "서울치과기공소",
    referralCode: "mock_requestor_principal",
    mockUserId: "000000000000000000000001",
  },
  {
    id: "2",
    name: "의뢰인 2",
    email: "requestor.vice_principal@demo.abuts.fit",
    role: "requestor",
    companyName: "서울치과기공소",
    referralCode: "mock_requestor_vice_principal",
    mockUserId: "000000000000000000000002",
  },
  {
    id: "3",
    name: "의뢰인 3",
    email: "requestor.staff@demo.abuts.fit",
    role: "requestor",
    companyName: "",
    referralCode: "mock_requestor_staff",
    mockUserId: "000000000000000000000003",
  },
  {
    id: "4",
    name: "제조사 1",
    email: "manufacturer.master@demo.abuts.fit",
    role: "manufacturer",
    companyName: "애크로덴트",
    referralCode: "mock_manufacturer_master",
    mockUserId: "000000000000000000000004",
  },
  {
    id: "5",
    name: "제조사 2",
    email: "manufacturer.manager@demo.abuts.fit",
    role: "manufacturer",
    companyName: "애크로덴트",
    referralCode: "mock_manufacturer_manager",
    mockUserId: "000000000000000000000005",
  },
  {
    id: "6",
    name: "제조사 3",
    email: "manufacturer.staff@demo.abuts.fit",
    role: "manufacturer",
    companyName: "애크로덴트",
    referralCode: "mock_manufacturer_staff",
    mockUserId: "000000000000000000000006",
  },
  {
    id: "7",
    name: "관리자 1",
    email: "admin.master@demo.abuts.fit",
    role: "admin",
    companyName: "Abuts.fit",
    referralCode: "mock_admin_master",
    mockUserId: "000000000000000000000007",
  },
  {
    id: "8",
    name: "관리자 2",
    email: "admin.manager@demo.abuts.fit",
    role: "admin",
    companyName: "Abuts.fit",
    referralCode: "mock_admin_manager",
    mockUserId: "000000000000000000000008",
  },
  {
    id: "9",
    name: "관리자 3",
    email: "admin.staff@demo.abuts.fit",
    role: "admin",
    companyName: "Abuts.fit",
    referralCode: "mock_admin_staff",
    mockUserId: "000000000000000000000009",
  },
];

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  token: string | null;
  refreshToken: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  loginWithToken: (
    token: string,
    refreshToken?: string | null
  ) => Promise<boolean>;
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
      const foundUser = mockUsers.find((u) => u.email === email);
      if (foundUser && password === "a64468ff-514b") {
        const mockUser: User = {
          ...foundUser,
          approvedAt: foundUser.approvedAt || new Date().toISOString(),
        };
        const mockToken = "MOCK_DEV_TOKEN";
        try {
          sessionStorage.setItem("abuts_mock_role", mockUser.role);
          sessionStorage.setItem("abuts_mock_email", mockUser.email);
          sessionStorage.setItem("abuts_mock_name", mockUser.name);
          sessionStorage.setItem(
            "abuts_mock_organization",
            mockUser.companyName || ""
          );
          sessionStorage.setItem("abuts_mock_phone", "");
          sessionStorage.setItem(
            "abuts_mock_user_id",
            mockUser.mockUserId || ""
          );
        } catch {
          // ignore
        }
        try {
          localStorage.setItem(AUTH_TOKEN_KEY, mockToken);
          localStorage.setItem(AUTH_USER_KEY, JSON.stringify(mockUser));
        } catch {
          // ignore localStorage errors
        }
        set({
          user: mockUser,
          isAuthenticated: true,
          token: mockToken,
          refreshToken: null,
        });
        return true;
      }

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

        // localStorage에 먼저 저장
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

        // 그 후 Zustand state 업데이트
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
    logout: () => {
      try {
        sessionStorage.removeItem("abuts_mock_role");
        sessionStorage.removeItem("abuts_mock_email");
        sessionStorage.removeItem("abuts_mock_name");
        sessionStorage.removeItem("abuts_mock_organization");
        sessionStorage.removeItem("abuts_mock_phone");
        sessionStorage.removeItem("abuts_mock_user_id");
        localStorage.removeItem("abuts_mock_role");
        localStorage.removeItem("abuts_mock_email");
        localStorage.removeItem("abuts_mock_name");
        localStorage.removeItem("abuts_mock_organization");
        localStorage.removeItem("abuts_mock_phone");
        localStorage.removeItem("abuts_mock_user_id");

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

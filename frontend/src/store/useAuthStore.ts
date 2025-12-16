import { create } from "zustand";

const AUTH_TOKEN_KEY = "abuts_auth_token";
const AUTH_REFRESH_TOKEN_KEY = "abuts_auth_refresh_token";
const AUTH_USER_KEY = "abuts_auth_user";

export type UserRole = "requestor" | "manufacturer" | "admin";
export type UserPosition =
  | "principal"
  | "vice_principal"
  | "staff"
  | "master"
  | "manager";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  position: UserPosition;
  avatar?: string;
  companyName?: string;
  referralCode?: string;
  mockUserId?: string;
}

export const mockUsers: User[] = [
  {
    id: "1",
    name: "의뢰인 주대표",
    email: "requestor.principal@demo.abuts.fit",
    role: "requestor",
    position: "principal",
    companyName: "서울치과기공소",
    referralCode: "mock_requestor_principal",
    mockUserId: "000000000000000000000001",
  },
  {
    id: "2",
    name: "의뢰인 공동대표",
    email: "requestor.vice_principal@demo.abuts.fit",
    role: "requestor",
    position: "vice_principal",
    companyName: "서울치과기공소",
    referralCode: "mock_requestor_vice_principal",
    mockUserId: "000000000000000000000002",
  },
  {
    id: "3",
    name: "의뢰인 직원",
    email: "requestor.staff@demo.abuts.fit",
    role: "requestor",
    position: "staff",
    companyName: "",
    referralCode: "mock_requestor_staff",
    mockUserId: "000000000000000000000003",
  },
  {
    id: "4",
    name: "제조사 대표",
    email: "manufacturer.master@demo.abuts.fit",
    role: "manufacturer",
    position: "master",
    companyName: "애크로덴트",
    referralCode: "mock_manufacturer_master",
    mockUserId: "000000000000000000000004",
  },
  {
    id: "5",
    name: "제조사 매니저",
    email: "manufacturer.manager@demo.abuts.fit",
    role: "manufacturer",
    position: "manager",
    companyName: "애크로덴트",
    referralCode: "mock_manufacturer_manager",
    mockUserId: "000000000000000000000005",
  },
  {
    id: "6",
    name: "제조사 직원",
    email: "manufacturer.staff@demo.abuts.fit",
    role: "manufacturer",
    position: "staff",
    companyName: "애크로덴트",
    referralCode: "mock_manufacturer_staff",
    mockUserId: "000000000000000000000006",
  },
  {
    id: "7",
    name: "관리자 대표",
    email: "admin.master@demo.abuts.fit",
    role: "admin",
    position: "master",
    companyName: "Abuts.fit",
    referralCode: "mock_admin_master",
    mockUserId: "000000000000000000000007",
  },
  {
    id: "8",
    name: "관리자 매니저",
    email: "admin.manager@demo.abuts.fit",
    role: "admin",
    position: "manager",
    companyName: "Abuts.fit",
    referralCode: "mock_admin_manager",
    mockUserId: "000000000000000000000008",
  },
  {
    id: "9",
    name: "관리자 직원",
    email: "admin.staff@demo.abuts.fit",
    role: "admin",
    position: "staff",
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
        const mockToken = "MOCK_DEV_TOKEN";
        try {
          sessionStorage.setItem("abuts_mock_role", foundUser.role);
          sessionStorage.setItem("abuts_mock_position", foundUser.position);
          sessionStorage.setItem("abuts_mock_email", foundUser.email);
          sessionStorage.setItem("abuts_mock_name", foundUser.name);
          sessionStorage.setItem(
            "abuts_mock_organization",
            foundUser.companyName || ""
          );
          sessionStorage.setItem("abuts_mock_phone", "");
          sessionStorage.setItem(
            "abuts_mock_user_id",
            foundUser.mockUserId || ""
          );
        } catch {
          // ignore
        }
        set({
          user: foundUser,
          isAuthenticated: true,
          token: mockToken,
          refreshToken: null,
        });
        return true;
      }
      return false;
    },
    loginWithToken: async (token: string, refreshToken?: string | null) => {
      try {
        const res = await fetch("/api/auth/me", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const json: any = await res.json().catch(() => null);
        if (!res.ok || !json?.success || !json?.data) return false;

        const u = json.data;
        const normalizedUser: User = {
          id: String(u._id || u.id || ""),
          name: String(u.name || ""),
          email: String(u.email || ""),
          role: u.role as UserRole,
          position: (u.position || "staff") as UserPosition,
          companyName: String(u.organization || u.companyName || ""),
          referralCode: String(u.referralCode || ""),
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
        sessionStorage.removeItem("abuts_mock_position");
        sessionStorage.removeItem("abuts_mock_email");
        sessionStorage.removeItem("abuts_mock_name");
        sessionStorage.removeItem("abuts_mock_organization");
        sessionStorage.removeItem("abuts_mock_phone");
        sessionStorage.removeItem("abuts_mock_user_id");
        localStorage.removeItem("abuts_mock_role");
        localStorage.removeItem("abuts_mock_position");
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

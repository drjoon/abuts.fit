import { create } from "zustand";

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
    name: "김철수",
    email: "kim@dental-lab.co.kr",
    role: "requestor",
    position: "principal",
    companyName: "서울치과기공소",
    referralCode: "mock_requestor",
    mockUserId: "000000000000000000000001",
  },
  {
    id: "4",
    name: "이직원",
    email: "staff@dental-lab.co.kr",
    role: "requestor",
    position: "staff",
    companyName: "",
    referralCode: "mock_requestor_staff",
    mockUserId: "000000000000000000000004",
  },
  {
    id: "2",
    name: "박영희",
    email: "park@abutment-maker.co.kr",
    role: "manufacturer",
    position: "master",
    companyName: "프리미엄 어벗먼트",
    referralCode: "mock_manufacturer",
    mockUserId: "000000000000000000000002",
  },
  {
    id: "3",
    name: "어벗츠.핏",
    email: "admin@abuts.fit",
    role: "admin",
    position: "master",
    companyName: "Abuts.fit",
    referralCode: "mock_admin",
    mockUserId: "000000000000000000000003",
  },
];

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  token: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  token: null,
  login: async (email: string, password: string) => {
    const foundUser = mockUsers.find((u) => u.email === email);
    if (foundUser && password === "a64468ff-514b") {
      const mockToken = "MOCK_DEV_TOKEN";
      try {
        localStorage.setItem("abuts_mock_role", foundUser.role);
        localStorage.setItem("abuts_mock_position", foundUser.position);
        localStorage.setItem("abuts_mock_email", foundUser.email);
        localStorage.setItem("abuts_mock_name", foundUser.name);
        localStorage.setItem(
          "abuts_mock_organization",
          foundUser.companyName || ""
        );
        localStorage.setItem("abuts_mock_phone", "");
        localStorage.setItem("abuts_mock_user_id", foundUser.mockUserId || "");
      } catch {
        // ignore
      }
      set({ user: foundUser, isAuthenticated: true, token: mockToken });
      return true;
    }
    return false;
  },
  logout: () => {
    try {
      localStorage.removeItem("abuts_mock_role");
      localStorage.removeItem("abuts_mock_position");
      localStorage.removeItem("abuts_mock_email");
      localStorage.removeItem("abuts_mock_name");
      localStorage.removeItem("abuts_mock_organization");
      localStorage.removeItem("abuts_mock_phone");
      localStorage.removeItem("abuts_mock_user_id");
    } catch {
      // ignore
    }
    set({ user: null, isAuthenticated: false, token: null });
  },
}));

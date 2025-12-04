import { create } from "zustand";

export type UserRole = "requestor" | "manufacturer" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  companyName?: string;
}

export const mockUsers: User[] = [
  {
    id: "1",
    name: "김철수",
    email: "kim@dental-lab.co.kr",
    role: "requestor",
    companyName: "서울치과기공소",
  },
  {
    id: "2",
    name: "박영희",
    email: "park@abutment-maker.co.kr",
    role: "manufacturer",
    companyName: "프리미엄 어벗먼트",
  },
  {
    id: "3",
    name: "어벗츠.핏",
    email: "admin@abuts.fit",
    role: "admin",
    companyName: "Abuts.fit",
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
      set({ user: foundUser, isAuthenticated: true, token: mockToken });
      return true;
    }
    return false;
  },
  logout: () => set({ user: null, isAuthenticated: false, token: null }),
}));

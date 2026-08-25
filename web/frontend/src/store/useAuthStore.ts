// related files:
// - web/frontend/rules.md
// - web/frontend/src/shared/types/role.ts
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/features/layout/AccountSwitcher.tsx
// - web/frontend/src/features/layout/WorkspaceModeSwitch.tsx
// - web/frontend/src/shared/practice/labReceiveCalendarDateKey.ts
// - web/backend/utils/labReceiveCalendarDateKey.util.js
// - web/frontend/src/shared/practice/labReceiveCalendarHiddenWeekdays.ts
// - web/backend/utils/labReceiveCalendarHiddenWeekdays.util.js
// - web/backend/models/user.model.js
// - web/backend/modules/auth/auth.routes.js
// - web/backend/controllers/users/user.controller.js
// - 2026-08-22: 계정 preferences.labReceiveCalendarHiddenWeekdays (캘린더 숨길 요일, 기본 일·토)
// - 2026-08-20: 계정 preferences.labReceiveCalendarDateKey (기공의뢰 캘린더, 기본 도착일)
// - 2026-08-15: 계정(개인) preferences.workspaceMode 로그인·전환에 반영 (기본 express)
// - 2026-08-15: 탭 간 localStorage 인증 SSOT — stale 탭이 다른 계정 세션을 덮어쓰지 않게 가드
import { create } from "zustand";
import { request } from "@/shared/api/apiClient";
import type { AppUserRole } from "@/shared/types/role";
import {
  normalizeRequestorCapabilities,
  normalizeRequestorKind,
  normalizeRequestorServices,
  type RequestorCapabilities,
  type RequestorKind,
  type RequestorServices,
} from "@/shared/business/requestorCapabilities";
import {
  normalizeWorkspaceMode,
  type WorkspaceMode,
} from "@/shared/workspace/workspaceMode";
import {
  normalizeLabReceiveCalendarDateKey,
  type LabReceiveCalendarDateKey,
} from "@/shared/practice/labReceiveCalendarDateKey";
import { normalizeLabReceiveCalendarHiddenWeekdays } from "@/shared/practice/labReceiveCalendarHiddenWeekdays";

const AUTH_TOKEN_KEY = "abuts_auth_token";
const AUTH_REFRESH_TOKEN_KEY = "abuts_auth_refresh_token";
const AUTH_USER_KEY = "abuts_auth_user";

export type UserRole = AppUserRole;

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
  createdAt?: string | null;
  mockUserId?: string | null;
  businessAnchorId?: string | null;
  internalDepartmentId?: string | null;
  businessVerified?: boolean;
  onboardingWizardCompleted?: boolean;
  signupChannel?: string | null;
  requestorKind?: RequestorKind | null;
  requestorServices?: RequestorServices | null;
  /** @deprecated requestorKind / requestorServices 사용 */
  requestorCapabilities?: RequestorCapabilities | null;
  practiceProfile?: {
    clinicName?: string;
    directorName?: string;
    staffName?: string;
    phone?: string;
    clinicPhone?: string;
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
  /** 계정별 최근 대시보드 경로 (pathname+search) */
  lastDashboardPath?: string | null;
  /** 계정(개인) 단위 UI 모드. 기본 엑스퍼트 */
  workspaceMode?: WorkspaceMode;
  /** 기공의뢰·기공의뢰수신 캘린더 날짜 뱃지. 기본 치과도착일 */
  labReceiveCalendarDateKey?: LabReceiveCalendarDateKey;
  /** 기공의뢰·기공의뢰수신 캘린더 숨길 요일(0=일…6=토). 기본 일·토 */
  labReceiveCalendarHiddenWeekdays?: number[];
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
  const rawCaps =
    row.requestorCapabilities && typeof row.requestorCapabilities === "object"
      ? (row.requestorCapabilities as Partial<RequestorCapabilities>)
      : null;
  const rawServices =
    row.requestorServices && typeof row.requestorServices === "object"
      ? (row.requestorServices as Partial<RequestorServices>)
      : null;
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
    createdAt: row.createdAt ? String(row.createdAt) : null,
    mockUserId: row.mockUserId ? String(row.mockUserId) : null,
    businessAnchorId: row.businessAnchorId ? String(row.businessAnchorId) : null,
    internalDepartmentId: row.internalDepartmentId
      ? String(row.internalDepartmentId)
      : null,
    businessVerified: Boolean(row.businessVerified),
    onboardingWizardCompleted: Boolean(row.onboardingWizardCompleted),
    signupChannel: row.signupChannel ? String(row.signupChannel) : null,
    requestorKind: normalizeRequestorKind(
      typeof row.requestorKind === "string" ? row.requestorKind : null,
    ),
    requestorServices: rawServices
      ? normalizeRequestorServices(rawServices)
      : null,
    requestorCapabilities: rawCaps
      ? normalizeRequestorCapabilities(rawCaps)
      : null,
    practiceProfile:
      row.practiceProfile && typeof row.practiceProfile === "object"
        ? {
            clinicName: String(
              (row.practiceProfile as Record<string, unknown>)?.clinicName || "",
            ),
            directorName: String(
              (row.practiceProfile as Record<string, unknown>)?.directorName ||
                "",
            ),
            staffName: String(
              (row.practiceProfile as Record<string, unknown>)?.staffName || "",
            ),
            phone: String(
              (row.practiceProfile as Record<string, unknown>)?.phone || "",
            ),
            clinicPhone: String(
              (row.practiceProfile as Record<string, unknown>)?.clinicPhone || "",
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
    lastDashboardPath: (() => {
      const prefs =
        row.preferences && typeof row.preferences === "object"
          ? (row.preferences as Record<string, unknown>)
          : null;
      const raw = prefs?.lastDashboardPath;
      return typeof raw === "string" && raw.trim() ? String(raw).trim() : null;
    })(),
    workspaceMode: (() => {
      const prefs =
        row.preferences && typeof row.preferences === "object"
          ? (row.preferences as Record<string, unknown>)
          : null;
      return normalizeWorkspaceMode(
        prefs?.workspaceMode ?? row.workspaceMode,
      );
    })(),
    labReceiveCalendarDateKey: (() => {
      const prefs =
        row.preferences && typeof row.preferences === "object"
          ? (row.preferences as Record<string, unknown>)
          : null;
      return normalizeLabReceiveCalendarDateKey(
        prefs?.labReceiveCalendarDateKey ?? row.labReceiveCalendarDateKey,
      );
    })(),
    labReceiveCalendarHiddenWeekdays: (() => {
      const prefs =
        row.preferences && typeof row.preferences === "object"
          ? (row.preferences as Record<string, unknown>)
          : null;
      return normalizeLabReceiveCalendarHiddenWeekdays(
        prefs?.labReceiveCalendarHiddenWeekdays ??
          row.labReceiveCalendarHiddenWeekdays,
      );
    })(),
  };
};

/** /api/auth/me 재검증 결과. 백엔드 재시작·네트워크 장애는 unavailable로 세션을 유지한다. */
export type LoginWithTokenResult =
  | { status: "ok" }
  | { status: "unauthorized" }
  | { status: "unavailable" };

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
  switchAccount: (
    userId: string,
    password: string,
  ) => Promise<{ success: boolean; message?: string; user?: User | null }>;
  loginWithToken: (
    token: string,
    refreshToken?: string | null,
  ) => Promise<LoginWithTokenResult>;
  setUser: (user: User | null) => void;
  setLastDashboardPath: (path: string | null) => void;
  setWorkspaceMode: (mode: WorkspaceMode) => void;
  setLabReceiveCalendarDateKey: (dateKey: LabReceiveCalendarDateKey) => void;
  setLabReceiveCalendarHiddenWeekdays: (hiddenWeekdays: number[]) => void;
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

/** localStorage 토큰이 메모리와 다르면 다른 탭이 세션을 가져간 것. */
const readLocalStorageToken = (): string | null => {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) || null;
  } catch {
    return null;
  }
};

const isMemoryAuthStale = (memoryToken: string | null): boolean => {
  const lsToken = readLocalStorageToken();
  if (!lsToken || !memoryToken) return false;
  return lsToken !== memoryToken;
};

const persistAuthCredentials = (args: {
  token: string;
  refreshToken?: string | null;
  user: User;
}) => {
  localStorage.setItem(AUTH_TOKEN_KEY, args.token);
  if (args.refreshToken) {
    localStorage.setItem(AUTH_REFRESH_TOKEN_KEY, args.refreshToken);
  }
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(args.user));
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
          persistAuthCredentials({
            token,
            refreshToken,
            user: normalizedUser,
          });
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
          persistAuthCredentials({
            token,
            refreshToken,
            user: normalizedUser,
          });
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
    // - web/frontend/src/features/layout/AccountSwitcher.tsx
    // - web/backend/controllers/auth/auth.controller.js
    // - web/backend/modules/auth/auth.routes.js
    switchAccount: async (userId: string, password: string) => {
      try {
        const currentToken = get().token;
        const res = await fetch("/api/auth/switch-account", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(currentToken
              ? { Authorization: `Bearer ${currentToken}` }
              : {}),
          },
          body: JSON.stringify({ userId, password }),
        });

        const json = (await res.json().catch(() => null)) as
          | { success?: boolean; message?: string; data?: unknown }
          | null;
        if (!res.ok || !json?.success) {
          const message = String(
            json?.message || "계정 전환에 실패했습니다. 다시 시도해주세요.",
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
            message: "계정 전환 처리에 필요한 정보가 누락되었습니다.",
          };
        }

        try {
          persistAuthCredentials({
            token,
            refreshToken,
            user: normalizedUser,
          });
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

        return { success: true, user: normalizedUser };
      } catch {
        return {
          success: false,
          message:
            "계정 전환 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
        };
      }
    },
    loginWithToken: async (token: string, refreshToken?: string | null) => {
      try {
        // 다른 탭이 이미 다른 계정으로 localStorage를 갱신했으면 덮어쓰지 않고 그 세션을 따른다.
        const lsToken = readLocalStorageToken();
        let effectiveToken = token;
        let effectiveRefresh = refreshToken;
        if (lsToken && lsToken !== token) {
          effectiveToken = lsToken;
          try {
            effectiveRefresh =
              localStorage.getItem(AUTH_REFRESH_TOKEN_KEY) || refreshToken;
          } catch {
            effectiveRefresh = refreshToken;
          }
        }

        const res = await request<unknown>({
          path: "/api/auth/me",
          method: "GET",
          token: effectiveToken,
          skipCache: true,
        });
        const json = (res.data || null) as
          | { success?: boolean; data?: unknown }
          | null;

        // 토큰 무효·만료만 세션 제거. 백엔드 다운/5xx/파싱 실패는 유지.
        if (res.status === 401 || res.status === 403) {
          return { status: "unauthorized" };
        }
        if (!res.ok || !json?.success || !json?.data) {
          return { status: "unavailable" };
        }

        const u = json.data as Record<string, unknown>;
        if (!u || typeof u !== "object" || Array.isArray(u)) {
          return { status: "unavailable" };
        }
        const normalizedUser = normalizeApiUser(u);
        if (!normalizedUser) return { status: "unavailable" };

        // /me 응답 전에 다른 탭이 세션을 바꿨으면 localStorage를 따른다.
        const latestLs = readLocalStorageToken();
        if (latestLs && latestLs !== effectiveToken) {
          const stored = loadStoredAuth();
          set({
            user: stored.user,
            token: stored.token,
            refreshToken: stored.refreshToken,
            isAuthenticated: Boolean(stored.token && stored.user),
          });
          return stored.token && stored.user
            ? { status: "ok" }
            : { status: "unavailable" };
        }

        try {
          persistAuthCredentials({
            token: effectiveToken,
            refreshToken: effectiveRefresh,
            user: normalizedUser,
          });
        } catch {
          // ignore
        }

        set({
          user: normalizedUser,
          isAuthenticated: true,
          token: effectiveToken,
          refreshToken: effectiveRefresh || get().refreshToken,
        });
        return { status: "ok" };
      } catch {
        return { status: "unavailable" };
      }
    },
    setUser: (user: User | null) => {
      if (isMemoryAuthStale(get().token)) return;
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
    setLastDashboardPath: (path: string | null) => {
      if (isMemoryAuthStale(get().token)) return;
      const current = get().user;
      if (!current) return;
      const next = { ...current, lastDashboardPath: path };
      try {
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      set({ user: next });
    },
    setWorkspaceMode: (mode: WorkspaceMode) => {
      if (isMemoryAuthStale(get().token)) return;
      const current = get().user;
      if (!current) return;
      const next = {
        ...current,
        workspaceMode: normalizeWorkspaceMode(mode),
      };
      try {
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      set({ user: next });
    },
    setLabReceiveCalendarDateKey: (dateKey: LabReceiveCalendarDateKey) => {
      if (isMemoryAuthStale(get().token)) return;
      const current = get().user;
      if (!current) return;
      const next = {
        ...current,
        labReceiveCalendarDateKey: normalizeLabReceiveCalendarDateKey(dateKey),
      };
      try {
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      set({ user: next });
    },
    setLabReceiveCalendarHiddenWeekdays: (hiddenWeekdays: number[]) => {
      if (isMemoryAuthStale(get().token)) return;
      const current = get().user;
      if (!current) return;
      const next = {
        ...current,
        labReceiveCalendarHiddenWeekdays:
          normalizeLabReceiveCalendarHiddenWeekdays(hiddenWeekdays),
      };
      try {
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      set({ user: next });
    },
    logout: () => {
      // 다른 탭 세션이 localStorage에 있으면 지우지 않는다 (stale 탭 로그아웃로 활성 세션 로그아웃 방지).
      if (!isMemoryAuthStale(get().token)) {
        try {
          localStorage.removeItem(AUTH_TOKEN_KEY);
          localStorage.removeItem(AUTH_REFRESH_TOKEN_KEY);
          localStorage.removeItem(AUTH_USER_KEY);
        } catch {
          // ignore
        }
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

/** 다른 탭의 로그인/로그아웃을 이 탭 메모리에 반영한다. */
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (
      event.key !== AUTH_TOKEN_KEY &&
      event.key !== AUTH_REFRESH_TOKEN_KEY &&
      event.key !== AUTH_USER_KEY &&
      event.key !== null
    ) {
      return;
    }
    const next = loadStoredAuth();
    const current = useAuthStore.getState();
    if (
      current.token === next.token &&
      current.refreshToken === next.refreshToken &&
      current.user?.id === next.user?.id &&
      current.user?.role === next.user?.role &&
      current.isAuthenticated === Boolean(next.token && next.user)
    ) {
      return;
    }
    useAuthStore.setState({
      user: next.user,
      token: next.token,
      refreshToken: next.refreshToken,
      isAuthenticated: Boolean(next.token && next.user),
    });
  });
}
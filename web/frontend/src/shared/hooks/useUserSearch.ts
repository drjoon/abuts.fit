import { useState, useCallback } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";

export interface SearchUser {
  _id: string;
  name: string;
  email: string;
  role: "requestor" | "manufacturer" | "admin";
  organization?: string;
}

export const useUserSearch = () => {
  const { token } = useAuthStore();
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [loading, setLoading] = useState(false);

  const searchUsers = useCallback(
    async (query: string, role?: string) => {
      if (!token || !query || query.trim().length < 2) {
        setUsers([]);
        return;
      }

      setLoading(true);

      try {
        const roleParam = role ? `&role=${role}` : "";
        const res = await apiFetch<{ success: boolean; data: SearchUser[] }>({
          path: `/api/chats/search-users?query=${encodeURIComponent(
            query
          )}${roleParam}`,
          method: "GET",
          token,
        });

        if (res.ok && res.data?.success) {
          setUsers(res.data.data || []);
        } else {
          setUsers([]);
        }
      } catch {
        setUsers([]);
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  return {
    users,
    loading,
    searchUsers,
    clearUsers: () => setUsers([]),
  };
};

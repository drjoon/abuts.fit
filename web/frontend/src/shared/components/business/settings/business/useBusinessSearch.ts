import { useEffect, useState, useCallback } from "react";
import { request } from "@/shared/api/apiClient";

interface BusinessSearchResult {
  _id: string;
  name: string;
  representativeName?: string;
  businessNumber?: string;
  address?: string;
}

interface UseBusinessSearchProps {
  token?: string;
  organizationType: string;
  membership: "none" | "owner" | "member" | "pending";
}

export const useBusinessSearch = (props: UseBusinessSearchProps) => {
  const [businessSearch, setBusinessSearch] = useState("");
  const [businessSearchResults, setBusinessSearchResults] = useState<
    BusinessSearchResult[]
  >([]);
  const [selectedBusiness, setSelectedBusiness] =
    useState<BusinessSearchResult | null>(null);
  const [businessOpen, setBusinessOpen] = useState(false);

  useEffect(() => {
    const q = businessSearch.trim();
    if (!props.token) return;
    if (props.membership !== "none") return;
    if (!q) {
      setBusinessSearchResults([]);
      setSelectedBusiness(null);
      return;
    }

    const t = setTimeout(async () => {
      try {
        const res = await request<any>({
          path: `/api/businesses/search?q=${encodeURIComponent(
            q,
          )}&organizationType=${encodeURIComponent(props.organizationType)}`,
          method: "GET",
          token: props.token,
        });

        if (!res.ok) {
          setBusinessSearchResults([]);
          return;
        }

        const body: any = res.data || {};
        const data = body.data || body;
        setBusinessSearchResults(Array.isArray(data) ? data : []);
      } catch {
        setBusinessSearchResults([]);
      }
    }, 250);

    return () => clearTimeout(t);
  }, [props.membership, businessSearch, props.organizationType, props.token]);

  const resetSearch = useCallback(() => {
    setBusinessSearch("");
    setBusinessSearchResults([]);
    setSelectedBusiness(null);
  }, []);

  return {
    businessSearch,
    setBusinessSearch,
    businessSearchResults,
    setBusinessSearchResults,
    selectedBusiness,
    setSelectedBusiness,
    businessOpen,
    setBusinessOpen,
    resetSearch,
  };
};

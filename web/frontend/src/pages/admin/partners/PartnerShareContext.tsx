// change-log:
// - 2026-08-17: 관리자 파트너 탭 공유 상태(비율·미리보기 재원·계정별 배분).
// related files:
// - web/frontend/src/pages/admin/partners/partnerShare.ts
// - web/frontend/src/pages/admin/partners/AdminPartnersPage.tsx
// - web/frontend/src/pages/admin/partners/RevenueShareTab.tsx
// - web/frontend/src/pages/admin/partners/SectorShareTab.tsx
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  clampAmount,
  clampPercent,
  defaultPartnerShareState,
  type PartnerAccount,
  type PartnerShareState,
  type SectorKey,
} from "./partnerShare";

type PartnerShareContextValue = {
  state: PartnerShareState;
  setRate: (key: SectorKey, next: number) => void;
  setPreviewPool: (next: number) => void;
  addMember: (key: SectorKey, member: PartnerAccount) => void;
  updateMember: (
    key: SectorKey,
    userId: string,
    patch: Partial<Pick<PartnerAccount, "sharePercent" | "monthlyMinimum">>,
  ) => void;
  removeMember: (key: SectorKey, userId: string) => void;
};

const PartnerShareContext = createContext<PartnerShareContextValue | null>(
  null,
);

export function PartnerShareProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PartnerShareState>(defaultPartnerShareState);

  const setRate = useCallback((key: SectorKey, next: number) => {
    setState((prev) => ({
      ...prev,
      rates: { ...prev.rates, [key]: clampPercent(next) },
    }));
  }, []);

  const setPreviewPool = useCallback((next: number) => {
    setState((prev) => ({ ...prev, previewPool: clampAmount(next) }));
  }, []);

  const addMember = useCallback((key: SectorKey, member: PartnerAccount) => {
    setState((prev) => {
      if (prev.members[key].some((item) => item.userId === member.userId)) {
        return prev;
      }
      return {
        ...prev,
        members: {
          ...prev.members,
          [key]: [...prev.members[key], member],
        },
      };
    });
  }, []);

  const updateMember = useCallback(
    (
      key: SectorKey,
      userId: string,
      patch: Partial<Pick<PartnerAccount, "sharePercent" | "monthlyMinimum">>,
    ) => {
      setState((prev) => ({
        ...prev,
        members: {
          ...prev.members,
          [key]: prev.members[key].map((item) => {
            if (item.userId !== userId) return item;
            return {
              ...item,
              sharePercent:
                patch.sharePercent == null
                  ? item.sharePercent
                  : clampPercent(patch.sharePercent),
              monthlyMinimum:
                patch.monthlyMinimum == null
                  ? item.monthlyMinimum
                  : clampAmount(patch.monthlyMinimum),
            };
          }),
        },
      }));
    },
    [],
  );

  const removeMember = useCallback((key: SectorKey, userId: string) => {
    setState((prev) => ({
      ...prev,
      members: {
        ...prev.members,
        [key]: prev.members[key].filter((item) => item.userId !== userId),
      },
    }));
  }, []);

  const value = useMemo(
    () => ({
      state,
      setRate,
      setPreviewPool,
      addMember,
      updateMember,
      removeMember,
    }),
    [state, setRate, setPreviewPool, addMember, updateMember, removeMember],
  );

  return (
    <PartnerShareContext.Provider value={value}>
      {children}
    </PartnerShareContext.Provider>
  );
}

export function usePartnerShare() {
  const ctx = useContext(PartnerShareContext);
  if (!ctx) {
    throw new Error("usePartnerShare must be used within PartnerShareProvider");
  }
  return ctx;
}

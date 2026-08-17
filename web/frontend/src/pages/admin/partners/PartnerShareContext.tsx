// change-log:
// - 2026-08-17: 사업영역(기공·어벗·플랫폼) 부서/팀원 공유 상태.
// related files:
// - web/frontend/src/pages/admin/partners/partnerShare.ts
// - web/frontend/src/pages/admin/partners/AdminPartnersPage.tsx
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
  createDepartment,
  defaultBusinessAreaState,
  type AreaKey,
  type BusinessAreaState,
  type Department,
  type SpecialPartyShare,
  type TeamMember,
} from "./partnerShare";

type AreaSlice = BusinessAreaState[AreaKey];

type PartnerShareContextValue = {
  state: BusinessAreaState;
  setPreviewPool: (area: "lab" | "platform", next: number) => void;
  setAbutmentPreviewSellPrice: (next: number) => void;
  setAbutmentHasSalesman: (next: boolean) => void;
  addDepartment: (area: AreaKey, department: Department) => void;
  updateDepartment: (
    area: AreaKey,
    departmentId: string,
    patch: Partial<Omit<Department, "id" | "members">>,
  ) => void;
  removeDepartment: (area: AreaKey, departmentId: string) => void;
  addMember: (area: AreaKey, departmentId: string, member: TeamMember) => void;
  updateMember: (
    area: AreaKey,
    departmentId: string,
    userId: string,
    patch: Partial<Pick<TeamMember, "sharePercent">>,
  ) => void;
  removeMember: (area: AreaKey, departmentId: string, userId: string) => void;
  addSpecialShare: (item: SpecialPartyShare) => void;
  updateSpecialShare: (
    id: string,
    patch: Partial<
      Pick<SpecialPartyShare, "manufacturer" | "devops" | "salesman" | "abuts">
    >,
  ) => void;
  removeSpecialShare: (id: string) => void;
};

const PartnerShareContext = createContext<PartnerShareContextValue | null>(null);

function patchArea<K extends AreaKey>(
  prev: BusinessAreaState,
  area: K,
  next: AreaSlice,
): BusinessAreaState {
  return { ...prev, [area]: next };
}

export function PartnerShareProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BusinessAreaState>(defaultBusinessAreaState);

  const setPreviewPool = useCallback((area: "lab" | "platform", next: number) => {
    setState((prev) =>
      patchArea(prev, area, { ...prev[area], previewPool: clampAmount(next) }),
    );
  }, []);

  const setAbutmentPreviewSellPrice = useCallback((next: number) => {
    setState((prev) => ({
      ...prev,
      abutment: { ...prev.abutment, previewSellPrice: clampAmount(next) },
    }));
  }, []);

  const setAbutmentHasSalesman = useCallback((next: boolean) => {
    setState((prev) => ({
      ...prev,
      abutment: { ...prev.abutment, hasSalesman: next },
    }));
  }, []);

  const addDepartment = useCallback((area: AreaKey, department: Department) => {
    setState((prev) => {
      const current = prev[area];
      if (current.departments.some((item) => item.id === department.id)) {
        return prev;
      }
      if (
        department.businessAnchorId &&
        current.departments.some(
          (item) => item.businessAnchorId === department.businessAnchorId,
        )
      ) {
        return prev;
      }
      return patchArea(prev, area, {
        ...current,
        departments: [...current.departments, createDepartment(department)],
      });
    });
  }, []);

  const updateDepartment = useCallback(
    (
      area: AreaKey,
      departmentId: string,
      patch: Partial<Omit<Department, "id" | "members">>,
    ) => {
      setState((prev) => {
        const current = prev[area];
        return patchArea(prev, area, {
          ...current,
          departments: current.departments.map((item) => {
            if (item.id !== departmentId) return item;
            return {
              ...item,
              ...patch,
              name: patch.name == null ? item.name : String(patch.name),
              sharePercent:
                patch.sharePercent == null
                  ? item.sharePercent
                  : clampPercent(patch.sharePercent),
              perCaseAmount:
                patch.perCaseAmount == null
                  ? item.perCaseAmount
                  : clampAmount(patch.perCaseAmount),
            };
          }),
        });
      });
    },
    [],
  );

  const removeDepartment = useCallback((area: AreaKey, departmentId: string) => {
    setState((prev) => {
      const current = prev[area];
      return patchArea(prev, area, {
        ...current,
        departments: current.departments.filter((item) => item.id !== departmentId),
      });
    });
  }, []);

  const addMember = useCallback(
    (area: AreaKey, departmentId: string, member: TeamMember) => {
      setState((prev) => {
        const current = prev[area];
        return patchArea(prev, area, {
          ...current,
          departments: current.departments.map((dept) => {
            if (dept.id !== departmentId) return dept;
            if (dept.members.some((item) => item.userId === member.userId)) {
              return dept;
            }
            return { ...dept, members: [...dept.members, member] };
          }),
        });
      });
    },
    [],
  );

  const updateMember = useCallback(
    (
      area: AreaKey,
      departmentId: string,
      userId: string,
      patch: Partial<Pick<TeamMember, "sharePercent">>,
    ) => {
      setState((prev) => {
        const current = prev[area];
        return patchArea(prev, area, {
          ...current,
          departments: current.departments.map((dept) => {
            if (dept.id !== departmentId) return dept;
            return {
              ...dept,
              members: dept.members.map((item) =>
                item.userId === userId
                  ? {
                      ...item,
                      sharePercent:
                        patch.sharePercent == null
                          ? item.sharePercent
                          : clampPercent(patch.sharePercent),
                    }
                  : item,
              ),
            };
          }),
        });
      });
    },
    [],
  );

  const removeMember = useCallback(
    (area: AreaKey, departmentId: string, userId: string) => {
      setState((prev) => {
        const current = prev[area];
        return patchArea(prev, area, {
          ...current,
          departments: current.departments.map((dept) =>
            dept.id === departmentId
              ? {
                  ...dept,
                  members: dept.members.filter((item) => item.userId !== userId),
                }
              : dept,
          ),
        });
      });
    },
    [],
  );

  const addSpecialShare = useCallback((item: SpecialPartyShare) => {
    setState((prev) => {
      if (
        prev.abutment.specialShares.some(
          (row) => row.requestorAnchorId === item.requestorAnchorId,
        )
      ) {
        return prev;
      }
      return {
        ...prev,
        abutment: {
          ...prev.abutment,
          specialShares: [...prev.abutment.specialShares, item],
        },
      };
    });
  }, []);

  const updateSpecialShare = useCallback(
    (
      id: string,
      patch: Partial<
        Pick<SpecialPartyShare, "manufacturer" | "devops" | "salesman" | "abuts">
      >,
    ) => {
      setState((prev) => ({
        ...prev,
        abutment: {
          ...prev.abutment,
          specialShares: prev.abutment.specialShares.map((row) =>
            row.id === id
              ? {
                  ...row,
                  manufacturer:
                    patch.manufacturer == null
                      ? row.manufacturer
                      : clampAmount(patch.manufacturer),
                  devops:
                    patch.devops == null ? row.devops : clampAmount(patch.devops),
                  salesman:
                    patch.salesman == null
                      ? row.salesman
                      : clampAmount(patch.salesman),
                  abuts: patch.abuts == null ? row.abuts : clampAmount(patch.abuts),
                }
              : row,
          ),
        },
      }));
    },
    [],
  );

  const removeSpecialShare = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      abutment: {
        ...prev.abutment,
        specialShares: prev.abutment.specialShares.filter((row) => row.id !== id),
      },
    }));
  }, []);

  const value = useMemo(
    () => ({
      state,
      setPreviewPool,
      setAbutmentPreviewSellPrice,
      setAbutmentHasSalesman,
      addDepartment,
      updateDepartment,
      removeDepartment,
      addMember,
      updateMember,
      removeMember,
      addSpecialShare,
      updateSpecialShare,
      removeSpecialShare,
    }),
    [
      state,
      setPreviewPool,
      setAbutmentPreviewSellPrice,
      setAbutmentHasSalesman,
      addDepartment,
      updateDepartment,
      removeDepartment,
      addMember,
      updateMember,
      removeMember,
      addSpecialShare,
      updateSpecialShare,
      removeSpecialShare,
    ],
  );

  return (
    <PartnerShareContext.Provider value={value}>
      {children}
    </PartnerShareContext.Provider>
  );
}

export function useBusinessAreaShare() {
  const ctx = useContext(PartnerShareContext);
  if (!ctx) {
    throw new Error("useBusinessAreaShare must be used within PartnerShareProvider");
  }
  return ctx;
}

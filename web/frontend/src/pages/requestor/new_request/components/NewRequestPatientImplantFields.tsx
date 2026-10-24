// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
// - web/backend/controllers/requests/creation.from-draft.controller.js
// change-log:
// - 2026-10-24: 3D 확인 모달 — 환자·카탈로그 칸에 라벨, 입력 높이, 2열 배치.
// - 2026-10-21: 카탈로그에 없는 제조사·브랜드·패밀리·타입은 프리셋 목록에 넣지 않는다.
// - 2026-10-21: implantFieldsLockedPassive — 잠금 시 Select disabled 대신 pointer-events-none.
// - 2026-10-21: renderImplantSelectSection — 카탈로그 Select를 부모 통합 섹션으로 감쌀 때.
// - 2026-10-21: implantFieldsLocked — 신규 임플란트 직접 입력 중에는 프리셋 Select를 잠근다.
// - 2026-09-10: Manufacturer 등 SelectValue children 제거 — 미선택 시 placeholder 빈칸 방지.
// - 2026-09-04: 카탈로그 불일치 시 brand 폴백 금지 — 에러 콜백(의뢰 차단)·관리자 alert용.
// - 2026-09-04: 카탈로그 불일치 시 brand를 제조사 첫 항목으로 덮어쓰지 않음(TS3→US 회귀).
//   제조사/브랜드 대소문자·TS↔TS3 별칭 매칭. Select value를 카탈로그 토큰으로 정렬.
import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import LabeledAutocompleteField from "@/shared/ui/forms/LabeledAutocompleteField";
import { cn } from "@/shared/ui/cn";
import type { CaseInfos, Connection } from "../hooks/newRequestTypes";

type Option = { id: string; label: string };

function FieldCaption({ children }: { children: string }) {
  return (
    <span className="px-0.5 text-xs font-medium text-slate-500">{children}</span>
  );
}

const fieldKey = (value: string) => String(value || "").trim().toLowerCase();
const brandToken = (value: string) =>
  fieldKey(value).replace(/[^a-z0-9]/g, "");

const sameManufacturer = (a: string, b: string) => {
  const left = fieldKey(a);
  const right = fieldKey(b);
  return Boolean(left) && left === right;
};

const sameBrand = (a: string, b: string) => {
  const left = fieldKey(a);
  const right = fieldKey(b);
  if (left && left === right) return true;
  const leftTok = brandToken(a);
  const rightTok = brandToken(b);
  if (!leftTok || !rightTok) return false;
  if (leftTok === rightTok) return true;
  // Osstem: TS ↔ TS3 (PRC 토큰 vs 카탈로그 버전 표기)
  if (leftTok.startsWith("ts") && rightTok.startsWith("ts")) return true;
  return false;
};

const sameFamily = (a: string, b: string) => {
  const left = fieldKey(a);
  const right = fieldKey(b);
  return Boolean(left) && left === right;
};

const resolveSelectValue = (current: string, options: string[]) => {
  const raw = String(current || "").trim();
  if (!raw) return undefined;
  const exact = options.find((option) => option === raw);
  if (exact) return exact;
  return options.find((option) => sameManufacturer(option, raw));
};

const resolveBrandSelectValue = (current: string, options: string[]) => {
  const raw = String(current || "").trim();
  if (!raw) return undefined;
  const exact = options.find((option) => option === raw);
  if (exact) return exact;
  return options.find((option) => sameBrand(option, raw));
};

type Props = {
  caseInfos?: CaseInfos;
  setCaseInfos: (updates: Partial<CaseInfos>) => void;
  showImplantSelect: boolean;
  readOnly?: boolean;
  implantSelectSource?: "hook" | "caseInfos";
  connections: Connection[];
  familyOptions: string[];
  typeOptions: string[];
  implantManufacturer: string;
  setImplantManufacturer: (v: string) => void;
  implantBrand: string;
  setImplantBrand: (v: string) => void;
  implantFamily: string;
  setImplantFamily: (v: string) => void;
  implantType: string;
  setImplantType: (v: string) => void;
  syncSelectedConnection: (
    manufacturer: string,
    brand: string,
    family: string,
    type: string,
  ) => void;
  clinicNameOptions: Option[];
  patientNameOptions: Option[];
  teethOptions: Option[];
  addClinicPreset: (label: string) => void;
  clearAllClinicPresets: () => void;
  addPatientPreset: (label: string) => void;
  clearAllPatientPresets: () => void;
  addTeethPreset: (label: string) => void;
  clearAllTeethPresets: () => void;
  handleAddOrSelectClinic: (label: string) => void;
  /**
   * brand가 있는데 CNC/핸드오프 카탈로그에 없을 때(폴백 금지).
   * null이면 해소. 호출측에서 확인 차단·관리자 alert.
   */
  onImplantCatalogIssue?: (
    issue: {
      manufacturer: string;
      brand: string;
      family: string;
      type: string;
      reason: "brand_not_in_catalog";
    } | null,
  ) => void;
  /** 신규 임플란트 직접 입력 중이면 프리셋 Select를 잠근다. */
  implantFieldsLocked?: boolean;
  /** 잠금 시 disabled 대신 pointer-events-none — 통합 섹션에서 비활성 pane 클릭 전환용 */
  implantFieldsLockedPassive?: boolean;
  /** 카탈로그 Select 4칸을 부모 통합 섹션으로 감쌀 때 */
  renderImplantSelectSection?: (catalogSelects: ReactNode) => ReactNode;
};

export function NewRequestPatientImplantFields({
  caseInfos: rawCaseInfos,
  setCaseInfos: setCaseInfosRaw,
  showImplantSelect,
  readOnly,
  implantSelectSource = "hook",
  connections,
  familyOptions,
  typeOptions,
  implantManufacturer,
  setImplantManufacturer,
  implantBrand,
  setImplantBrand,
  implantFamily,
  setImplantFamily,
  implantType,
  setImplantType,
  syncSelectedConnection,
  clinicNameOptions,
  patientNameOptions,
  teethOptions,
  addClinicPreset,
  clearAllClinicPresets,
  addPatientPreset,
  clearAllPatientPresets,
  addTeethPreset,
  clearAllTeethPresets,
  handleAddOrSelectClinic,
  onImplantCatalogIssue,
  implantFieldsLocked = false,
  implantFieldsLockedPassive = false,
  renderImplantSelectSection,
}: Props) {
  const caseInfos = rawCaseInfos;
  const setCaseInfos = useCallback(
    (updates: Partial<CaseInfos>) => {
      setCaseInfosRaw(updates);
    },
    [setCaseInfosRaw],
  );
  const hasClinicName = Boolean((caseInfos?.clinicName || "").trim());
  const implantPassiveLocked = Boolean(
    implantFieldsLockedPassive && implantFieldsLocked,
  );
  const implantDisabled = Boolean(
    readOnly ||
      !hasClinicName ||
      (implantFieldsLocked && !implantFieldsLockedPassive),
  );

  const currentManufacturer =
    implantSelectSource === "caseInfos"
      ? caseInfos?.implantManufacturer || ""
      : implantManufacturer;
  const currentBrand =
    implantSelectSource === "caseInfos"
      ? caseInfos?.implantBrand || ""
      : implantBrand;
  const currentFamily =
    implantSelectSource === "caseInfos"
      ? caseInfos?.implantFamily || ""
      : implantFamily;
  const currentType =
    implantSelectSource === "caseInfos"
      ? caseInfos?.implantType || ""
      : implantType;

  const connectionOptions = useMemo(() => {
    return connections
      .filter(
        (c) =>
          typeof c.manufacturer === "string" &&
          typeof c.brand === "string" &&
          c.manufacturer.trim() &&
          c.brand.trim(),
      )
      .sort((a, b) => {
        const manufacturerCompare = a.manufacturer.localeCompare(
          b.manufacturer,
          "ko",
        );
        if (manufacturerCompare !== 0) return manufacturerCompare;
        return a.brand!.localeCompare(b.brand!, "ko");
      });
  }, [connections]);

  const currentTypeOptions = useMemo(() => {
    const fromProp = Array.isArray(typeOptions) ? typeOptions : [];
    const fromCatalog = connectionOptions
      .filter(
        (c) =>
          sameManufacturer(c.manufacturer, currentManufacturer) &&
          sameBrand(String(c.brand || ""), currentBrand) &&
          sameFamily(String(c.family || ""), currentFamily),
      )
      .map((c) => String(c.type || "").trim())
      .filter(Boolean);
    return [...new Set([...fromCatalog, ...fromProp])];
  }, [
    typeOptions,
    connectionOptions,
    currentManufacturer,
    currentBrand,
    currentFamily,
  ]);

  const manufacturerOptions = useMemo(() => {
    return [...new Set(connectionOptions.map((c) => c.manufacturer))];
  }, [connectionOptions]);

  const brandOptions = useMemo(() => {
    return [
      ...new Set(
        connectionOptions
          .filter((c) => sameManufacturer(c.manufacturer, currentManufacturer))
          .map((c) => c.brand)
          .filter((brand): brand is string => Boolean(brand)),
      ),
    ];
  }, [connectionOptions, currentManufacturer]);

  const currentFamilyOptions = useMemo(() => {
    const base = connectionOptions
      .filter(
        (c) =>
          sameManufacturer(c.manufacturer, currentManufacturer) &&
          sameBrand(String(c.brand || ""), currentBrand),
      )
      .map((c) => c.family)
      .filter((family): family is string => Boolean(family));
    return [...new Set(base.length ? base : familyOptions)];
  }, [connectionOptions, currentManufacturer, currentBrand, familyOptions]);

  const manufacturerLabelMap = useMemo(() => {
    return new Map(
      manufacturerOptions.map((manufacturer) => {
        const sample = connectionOptions.find((c) =>
          sameManufacturer(c.manufacturer, manufacturer),
        );
        return [manufacturer, sample?.displayManufacturer || manufacturer];
      }),
    );
  }, [connectionOptions, manufacturerOptions]);

  const brandLabelMap = useMemo(() => {
    return new Map(
      brandOptions.map((brand) => {
        const sample = connectionOptions.find(
          (c) =>
            sameManufacturer(c.manufacturer, currentManufacturer) &&
            sameBrand(String(c.brand || ""), brand),
        );
        return [brand, sample?.displayBrand || brand];
      }),
    );
  }, [connectionOptions, currentManufacturer, brandOptions]);

  const familyLabelMap = useMemo(() => {
    return new Map(
      currentFamilyOptions.map((family) => {
        const sample = connectionOptions.find(
          (c) =>
            sameManufacturer(c.manufacturer, currentManufacturer) &&
            sameBrand(String(c.brand || ""), currentBrand) &&
            sameFamily(String(c.family || ""), family),
        );
        return [family, sample?.displayFamily || family];
      }),
    );
  }, [
    connectionOptions,
    currentFamilyOptions,
    currentManufacturer,
    currentBrand,
  ]);

  const typeLabelMap = useMemo(() => {
    return new Map(
      currentTypeOptions.map((type) => {
        const sample = connectionOptions.find(
          (c) =>
            sameManufacturer(c.manufacturer, currentManufacturer) &&
            sameBrand(String(c.brand || ""), currentBrand) &&
            sameFamily(String(c.family || ""), currentFamily) &&
            fieldKey(String(c.type || "")) === fieldKey(type),
        );
        const base = sample?.displayType || type;
        const screw = String((sample as any)?.screwType || "").trim();
        const connRaw = Number(
          (sample as any)?.connectionDiameter ?? (sample as any)?.diameter,
        );
        const conn = Number.isFinite(connRaw) ? `Ø${connRaw.toFixed(2)}` : "";
        const extra = [screw ? `스크류 ${screw}` : "", conn]
          .filter(Boolean)
          .join(" / ");
        return [type, extra ? `${base} / ${extra}` : base];
      }),
    );
  }, [
    connectionOptions,
    currentFamily,
    currentManufacturer,
    currentBrand,
    currentTypeOptions,
  ]);

  const pickFirst = (arr: string[]) => arr[0] || "";
  const pickPreferredFamily = (families: string[]) => {
    const regular = families.find(
      (f) => String(f).trim().toLowerCase() === "regular",
    );
    return regular || pickFirst(families);
  };

  const getBrands = (manufacturer: string): string[] => {
    const rows = connectionOptions.filter((c) =>
      sameManufacturer(c.manufacturer, manufacturer),
    );
    const cncFirst = [
      ...rows.filter((c) => !c.roundBar && !c.isPublic),
      ...rows.filter((c) => c.roundBar || c.isPublic),
    ];
    return [
      ...new Set(
        cncFirst
          .map((c) => (typeof c.brand === "string" ? c.brand.trim() : ""))
          .filter(Boolean),
      ),
    ];
  };

  const getFamilies = (manufacturer: string, brand: string): string[] => [
    ...new Set(
      connectionOptions
        .filter(
          (c) =>
            sameManufacturer(c.manufacturer, manufacturer) &&
            sameBrand(String(c.brand || ""), brand),
        )
        .map((c) => (typeof c.family === "string" ? c.family.trim() : ""))
        .filter(Boolean),
    ),
  ];

  const getTypes = (
    manufacturer: string,
    brand: string,
    family: string,
  ): string[] => [
    ...new Set(
      connectionOptions
        .filter(
          (c) =>
            sameManufacturer(c.manufacturer, manufacturer) &&
            sameBrand(String(c.brand || ""), brand) &&
            sameFamily(String(c.family || ""), family),
        )
        .map((c) => (typeof c.type === "string" ? c.type.trim() : ""))
        .filter(Boolean),
    ),
  ];

  // Validator: 한글 1~4글자
  const isValidKoreanName = (name?: string) => {
    if (!name) return false;
    return /^[가-힣]{1,4}$/.test(name.trim());
  };

  // UI에 표시할 환자명: 타이핑 중에는 원본 값을 그대로 표시
  // 업로드/파일명에서 자동 채워진 비검증 이름은 onBlur 시 addPatientPreset에서 필터링됨
  const displayedPatientName = caseInfos?.patientName || "";

  useEffect(() => {
    if (
      caseInfos?.implantInputMode === "custom" ||
      caseInfos?.newSystemRequest?.requested === true
    ) {
      onImplantCatalogIssue?.(null);
      return;
    }
    const nsr = caseInfos?.newSystemRequest;
    if (
      String(nsr?.manufacturer || "").trim() ||
      String(nsr?.brand || "").trim() ||
      String(nsr?.family || "").trim()
    ) {
      onImplantCatalogIssue?.(null);
      return;
    }

    const manufacturer = String(caseInfos?.implantManufacturer || "").trim();
    if (!manufacturer) {
      onImplantCatalogIssue?.(null);
      return;
    }

    const manufacturerConnections = connectionOptions.filter((c) =>
      sameManufacturer(c.manufacturer, manufacturer),
    );

    const brandFromCase = String(caseInfos?.implantBrand || "").trim();
    const familyFromCase = String(caseInfos?.implantFamily || "").trim();
    const typeFromCase = String(caseInfos?.implantType || "").trim();

    // brand가 비어 있으면 폴백으로 채우지 않는다 — 확인 단계에서 필수값 검증.
    if (!brandFromCase) {
      onImplantCatalogIssue?.(null);
      setImplantManufacturer(manufacturer);
      setImplantBrand("");
      setImplantFamily(familyFromCase);
      setImplantType(typeFromCase);
      return;
    }

    if (!manufacturerConnections.length) {
      onImplantCatalogIssue?.({
        manufacturer,
        brand: brandFromCase,
        family: familyFromCase,
        type: typeFromCase,
        reason: "brand_not_in_catalog",
      });
      setImplantManufacturer(manufacturer);
      setImplantBrand(brandFromCase);
      setImplantFamily(familyFromCase);
      setImplantType(typeFromCase);
      return;
    }

    const matchedBrandRow = manufacturerConnections.find((c) =>
      sameBrand(String(c.brand || ""), brandFromCase),
    );

    // 카탈로그에 없으면 다른 brand로 폴백하지 않고 에러(의뢰 차단).
    if (!matchedBrandRow) {
      onImplantCatalogIssue?.({
        manufacturer,
        brand: brandFromCase,
        family: familyFromCase,
        type: typeFromCase,
        reason: "brand_not_in_catalog",
      });
      setImplantManufacturer(manufacturer);
      setImplantBrand(brandFromCase);
      setImplantFamily(familyFromCase);
      setImplantType(typeFromCase);
      return;
    }

    onImplantCatalogIssue?.(null);

    let finalManufacturer = manufacturer;
    let finalBrand = brandFromCase;
    let shouldWriteCase = false;

    const catalogManufacturer = String(matchedBrandRow.manufacturer || "").trim();
    const catalogBrand = String(matchedBrandRow.brand || "").trim();
    // 동일 스펙 별칭만 카탈로그 토큰으로 정렬(TS→TS3). 다른 타입으로 바꾸지 않음.
    if (catalogManufacturer && catalogManufacturer !== manufacturer) {
      finalManufacturer = catalogManufacturer;
      shouldWriteCase = true;
    }
    if (catalogBrand && catalogBrand !== brandFromCase) {
      finalBrand = catalogBrand;
      shouldWriteCase = true;
    }

    if (shouldWriteCase) {
      setCaseInfos({
        ...(finalManufacturer !== manufacturer
          ? { implantManufacturer: finalManufacturer }
          : {}),
        implantBrand: finalBrand,
      });
    }

    setImplantManufacturer(finalManufacturer);
    setImplantBrand(finalBrand);
    setImplantFamily(familyFromCase);
    setImplantType(typeFromCase);
  }, [
    caseInfos?.implantInputMode,
    caseInfos?.newSystemRequest,
    caseInfos?.implantManufacturer,
    caseInfos?.implantBrand,
    caseInfos?.implantFamily,
    caseInfos?.implantType,
    connectionOptions,
    implantSelectSource,
    onImplantCatalogIssue,
    setCaseInfos,
    setImplantManufacturer,
    setImplantFamily,
    setImplantBrand,
    setImplantType,
  ]);

  const implantCatalogSelectGrid = showImplantSelect ? (
        <div
          className={cn(
            "grid grid-cols-1 gap-3 sm:grid-cols-2",
            implantPassiveLocked && "pointer-events-none",
          )}
        >
              <div className="flex min-w-0 flex-col gap-1.5">
                <FieldCaption>제조사</FieldCaption>
                <Select
                  value={resolveSelectValue(
                    currentManufacturer,
                    manufacturerOptions,
                  )}
                  onValueChange={(value) => {
                    if (implantDisabled) return;

                    // 제조사 변경 시: 시스템/규격1/규격2를 해당 제조사의 첫 유효 조합으로 연쇄 초기화
                    const nextManufacturer = value;
                    const nextBrand = pickFirst(getBrands(nextManufacturer));
                    const nextFamily = pickPreferredFamily(
                      getFamilies(nextManufacturer, nextBrand),
                    );
                    const nextType = pickFirst(
                      getTypes(nextManufacturer, nextBrand, nextFamily),
                    );

                    if (implantSelectSource === "caseInfos") {
                      setCaseInfos({
                        implantManufacturer: nextManufacturer,
                        implantBrand: nextBrand,
                        implantFamily: nextFamily,
                        implantType: nextType,
                      });
                      syncSelectedConnection(
                        nextManufacturer,
                        nextBrand,
                        nextFamily,
                        nextType,
                      );
                      return;
                    }

                    setImplantManufacturer(nextManufacturer);
                    setImplantBrand(nextBrand);
                    setImplantFamily(nextFamily);
                    setImplantType(nextType);
                    syncSelectedConnection(
                      nextManufacturer,
                      nextBrand,
                      nextFamily,
                      nextType,
                    );
                    setCaseInfos({
                      implantManufacturer: nextManufacturer,
                      implantBrand: nextBrand,
                      implantFamily: nextFamily,
                      implantType: nextType,
                    });
                  }}
                >
                  <SelectTrigger disabled={implantDisabled}>
                    {/* SelectItem 라벨로 표시. children 넣으면 미선택 시 placeholder가 빈칸이 됨 */}
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {manufacturerOptions.map((m) => (
                      <SelectItem key={m} value={m}>
                        {manufacturerLabelMap.get(m) || m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex min-w-0 flex-col gap-1.5">
                <FieldCaption>브랜드</FieldCaption>
                <Select
                  value={resolveBrandSelectValue(currentBrand, brandOptions)}
                  onValueChange={(value) => {
                    if (implantDisabled) return;

                    // 시스템 변경 시: 규격1/규격2를 해당 시스템의 첫 유효 조합으로 연쇄 초기화
                    const nextBrand = value;
                    const manufacturerForBrand =
                      resolveSelectValue(
                        currentManufacturer,
                        manufacturerOptions,
                      ) || currentManufacturer;
                    const nextFamily = pickPreferredFamily(
                      getFamilies(manufacturerForBrand, nextBrand),
                    );
                    const nextType = pickFirst(
                      getTypes(manufacturerForBrand, nextBrand, nextFamily),
                    );

                    if (implantSelectSource === "caseInfos") {
                      setCaseInfos({
                        implantBrand: nextBrand,
                        implantFamily: nextFamily,
                        implantType: nextType,
                      });
                      syncSelectedConnection(
                        manufacturerForBrand,
                        nextBrand,
                        nextFamily,
                        nextType,
                      );
                      return;
                    }

                    setImplantBrand(nextBrand);
                    setImplantFamily(nextFamily);
                    setImplantType(nextType);
                    syncSelectedConnection(
                      manufacturerForBrand,
                      nextBrand,
                      nextFamily,
                      nextType,
                    );
                    setCaseInfos({
                      implantBrand: nextBrand,
                      implantFamily: nextFamily,
                      implantType: nextType,
                    });
                  }}
                  disabled={implantDisabled || !currentManufacturer}
                >
                  <SelectTrigger
                    disabled={implantDisabled || !currentManufacturer}
                  >
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {brandOptions.map((s) => (
                      <SelectItem key={s} value={s}>
                        {brandLabelMap.get(s) || s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex min-w-0 flex-col gap-1.5">
                <FieldCaption>패밀리</FieldCaption>
                <Select
                  value={resolveSelectValue(currentFamily, currentFamilyOptions)}
                  onValueChange={(value) => {
                    if (implantDisabled) return;

                    // 규격1 변경 시: 규격2를 해당 규격1의 첫 유효 값으로 연쇄 초기화
                    const nextFamily = value;
                    const manufacturerForFamily =
                      resolveSelectValue(
                        currentManufacturer,
                        manufacturerOptions,
                      ) || currentManufacturer;
                    const brandForFamily =
                      resolveBrandSelectValue(currentBrand, brandOptions) ||
                      currentBrand;
                    const nextType = pickFirst(
                      getTypes(
                        manufacturerForFamily,
                        brandForFamily,
                        nextFamily,
                      ),
                    );

                    if (implantSelectSource === "caseInfos") {
                      setCaseInfos({
                        implantFamily: nextFamily,
                        implantType: nextType,
                      });
                      syncSelectedConnection(
                        manufacturerForFamily,
                        brandForFamily,
                        nextFamily,
                        nextType,
                      );
                      return;
                    }

                    setImplantFamily(nextFamily);
                    setImplantType(nextType);
                    syncSelectedConnection(
                      manufacturerForFamily,
                      brandForFamily,
                      nextFamily,
                      nextType,
                    );
                    setCaseInfos({
                      implantFamily: nextFamily,
                      implantType: nextType,
                    });
                  }}
                  disabled={implantDisabled || !currentBrand}
                >
                  <SelectTrigger disabled={implantDisabled || !currentBrand}>
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {currentFamilyOptions.map((family) => (
                      <SelectItem key={family} value={family}>
                        {familyLabelMap.get(family) || family}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex min-w-0 flex-col gap-1.5">
                <FieldCaption>타입</FieldCaption>
                <Select
                  value={resolveSelectValue(currentType, currentTypeOptions)}
                  onValueChange={(value) => {
                    if (implantDisabled) return;
                    const manufacturerForType =
                      resolveSelectValue(
                        currentManufacturer,
                        manufacturerOptions,
                      ) || currentManufacturer;
                    const brandForType =
                      resolveBrandSelectValue(currentBrand, brandOptions) ||
                      currentBrand;
                    const familyForType =
                      resolveSelectValue(
                        currentFamily,
                        currentFamilyOptions,
                      ) || currentFamily;
                    if (implantSelectSource === "caseInfos") {
                      setCaseInfos({ implantType: value });
                      syncSelectedConnection(
                        manufacturerForType,
                        brandForType,
                        familyForType,
                        value,
                      );
                      return;
                    }
                    setImplantType(value);
                    syncSelectedConnection(
                      manufacturerForType,
                      brandForType,
                      familyForType,
                      value,
                    );
                    setCaseInfos({ implantType: value });
                  }}
                  disabled={implantDisabled || !currentFamily}
                >
                  <SelectTrigger disabled={implantDisabled || !currentFamily}>
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {currentTypeOptions.map((t) => (
                      <SelectItem key={t} value={t}>
                        {typeLabelMap.get(t) || t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
  ) : null;

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-xl border border-slate-200 bg-white p-3">
        <h3 className="mb-2 text-sm font-semibold text-slate-900">환자</h3>
        <div className="grid grid-cols-2 gap-3 text-foreground">
        <div className="col-span-2 flex min-w-0 flex-col gap-1.5">
          <FieldCaption>치과</FieldCaption>
          <LabeledAutocompleteField
            value={caseInfos?.clinicName || ""}
            onChange={(value) => {
              if (readOnly) return;
              setCaseInfos({
                clinicName: value,
              });
            }}
            options={clinicNameOptions}
            placeholder="치과명"
              onOptionSelect={(label) => {
                if (readOnly) return;
                handleAddOrSelectClinic(label);
                addClinicPreset(label);
              }}
              onClear={() => {
                if (readOnly) return;
                setCaseInfos({
                  clinicName: "",
                });
              }}
              onDelete={() => {
                if (readOnly) return;
                clearAllClinicPresets();
                setCaseInfos({
                  clinicName: "",
                });
              }}
              onBlur={() => {
                if (readOnly) return;
                if (caseInfos?.clinicName) {
                  handleAddOrSelectClinic(caseInfos.clinicName);
                  addClinicPreset(caseInfos.clinicName);
                }
              }}
              inputClassName="h-10 w-full pr-10 text-sm"
              disabled={readOnly}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <FieldCaption>환자</FieldCaption>
            <LabeledAutocompleteField
              // 표시용 값은 검증된 한글 1~4글자만 보여주고, 그렇지 않으면 빈 문자열로 남김
              value={displayedPatientName}
              onChange={(value) => {
                if (readOnly) return;
                // 사용자가 직접 입력한 경우는 그대로 caseInfos에 반영
                setCaseInfos({
                  patientName: value,
                });
              }}
              options={patientNameOptions}
              placeholder="환자명"
              onOptionSelect={(label) => {
                if (readOnly) return;
                setCaseInfos({
                  patientName: label,
                });
                addPatientPreset(label);
              }}
              onClear={() => {
                if (readOnly) return;
                setCaseInfos({
                  patientName: "",
                });
              }}
              onDelete={() => {
                if (readOnly) return;
                clearAllPatientPresets();
                setCaseInfos({
                  patientName: "",
                });
              }}
              onBlur={() => {
                if (readOnly) return;
                // 업로드로 채워진(또는 props로 들어온) 비검증 환자명은 추가하지 않도록 displayedPatientName 기준으로 검사
                if (displayedPatientName) {
                  addPatientPreset(displayedPatientName);
                }
              }}
              inputClassName="h-10 w-full pr-10 text-sm"
              disabled={readOnly}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <FieldCaption>치아</FieldCaption>
            <LabeledAutocompleteField
              value={caseInfos?.tooth || ""}
              onChange={(value) => {
                if (readOnly) return;
                setCaseInfos({
                  tooth: value,
                });
              }}
              options={teethOptions}
              placeholder="직접 입력"
              onOptionSelect={(label) => {
                if (readOnly) return;
                setCaseInfos({
                  tooth: label,
                });
                addTeethPreset(label);
              }}
              onClear={() => {
                if (readOnly) return;
                setCaseInfos({
                  tooth: "",
                });
              }}
              onDelete={() => {
                if (readOnly) return;
                clearAllTeethPresets();
                setCaseInfos({
                  tooth: "",
                });
              }}
              onBlur={() => {
                if (readOnly) return;
                if (caseInfos?.tooth) {
                  addTeethPreset(caseInfos.tooth);
                }
              }}
              inputClassName="h-10 w-full pr-10 text-sm"
              disabled={readOnly}
            />
          </div>
        </div>
      </section>

      {implantCatalogSelectGrid ? (
        <section className="space-y-2">
          <h3 className="px-0.5 text-sm font-semibold text-slate-900">임플란트</h3>
          {renderImplantSelectSection
            ? renderImplantSelectSection(implantCatalogSelectGrid)
            : (
              <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                {implantCatalogSelectGrid}
              </div>
            )}
        </section>
      ) : null}

    </div>
  );
}

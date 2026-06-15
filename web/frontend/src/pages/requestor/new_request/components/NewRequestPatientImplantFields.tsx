import { useCallback, useEffect, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import LabeledAutocompleteField from "@/shared/ui/forms/LabeledAutocompleteField";
import type { CaseInfos, Connection } from "../hooks/newRequestTypes";

type Option = { id: string; label: string };

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
}: Props) {
  const caseInfos = rawCaseInfos;
  const setCaseInfos = useCallback(
    (updates: Partial<CaseInfos>) => {
      setCaseInfosRaw(updates);
    },
    [setCaseInfosRaw],
  );
  const hasClinicName = Boolean((caseInfos?.clinicName || "").trim());
  const implantDisabled = Boolean(readOnly || !hasClinicName);

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

  const currentTypeOptions = useMemo(() => typeOptions || [], [typeOptions]);

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

  const manufacturerOptions = useMemo(() => {
    return [...new Set(connectionOptions.map((c) => c.manufacturer))];
  }, [connectionOptions]);

  const brandOptions = useMemo(() => {
    return [
      ...new Set(
        connectionOptions
          .filter((c) => c.manufacturer === currentManufacturer)
          .map((c) => c.brand),
      ),
    ];
  }, [connectionOptions, currentManufacturer]);

  const currentFamilyOptions = useMemo(() => {
    const base = connectionOptions
      .filter(
        (c) =>
          c.manufacturer === currentManufacturer && c.brand === currentBrand,
      )
      .map((c) => c.family);
    return [...new Set(base.length ? base : familyOptions)];
  }, [connectionOptions, currentManufacturer, currentBrand, familyOptions]);

  const manufacturerLabelMap = useMemo(() => {
    return new Map(
      manufacturerOptions.map((manufacturer) => {
        const sample = connectionOptions.find(
          (c) => c.manufacturer === manufacturer,
        );
        return [manufacturer, sample?.displayManufacturer || manufacturer];
      }),
    );
  }, [connectionOptions, manufacturerOptions]);

  const brandLabelMap = useMemo(() => {
    return new Map(
      brandOptions.map((brand) => {
        const sample = connectionOptions.find(
          (c) => c.manufacturer === currentManufacturer && c.brand === brand,
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
            c.manufacturer === currentManufacturer &&
            c.brand === currentBrand &&
            c.family === family,
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
            c.manufacturer === currentManufacturer &&
            c.brand === currentBrand &&
            c.family === currentFamily &&
            c.type === type,
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

  const getBrands = (manufacturer: string): string[] => [
    ...new Set(
      connectionOptions
        .filter((c) => c.manufacturer === manufacturer)
        .map((c) => (typeof c.brand === "string" ? c.brand.trim() : ""))
        .filter(Boolean),
    ),
  ];

  const getFamilies = (manufacturer: string, brand: string): string[] => [
    ...new Set(
      connectionOptions
        .filter((c) => c.manufacturer === manufacturer && c.brand === brand)
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
            c.manufacturer === manufacturer &&
            c.brand === brand &&
            c.family === family,
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
    const manufacturer = caseInfos?.implantManufacturer;
    if (!manufacturer) return;

    const manufacturerConnections = connectionOptions.filter(
      (c) => c.manufacturer === manufacturer,
    );
    if (!manufacturerConnections.length) return;

    const brandFromCase = caseInfos?.implantBrand || "";
    const familyFromCase = caseInfos?.implantFamily || "";
    const typeFromCase = caseInfos?.implantType || "";

    const isValidBrand = manufacturerConnections.some(
      (c) => c.brand === brandFromCase,
    );

    // Brand가 유효하면 현재 값 사용, 아니면 fallback
    let finalBrand = brandFromCase;
    let finalFamily = familyFromCase;
    let finalType = typeFromCase;

    if (!isValidBrand) {
      finalBrand = manufacturerConnections[0].brand || "";
      if (!finalBrand) return;
      finalFamily = manufacturerConnections[0].family;
      finalType = manufacturerConnections[0].type || "Hex";

      setCaseInfos({
        implantBrand: finalBrand,
        implantFamily: finalFamily,
        implantType: finalType,
      });
    }

    // UI 업데이트를 위해 hook 상태 항상 업데이트
    setImplantManufacturer(manufacturer);
    setImplantBrand(finalBrand);
    setImplantFamily(finalFamily);
    setImplantType(finalType);
  }, [
    caseInfos?.implantManufacturer,
    caseInfos?.implantBrand,
    caseInfos?.implantFamily,
    caseInfos?.implantType,
    connectionOptions,
    implantSelectSource,
    setCaseInfos,
    setImplantManufacturer,
    setImplantFamily,
    setImplantBrand,
    setImplantType,
  ]);

  return (
    <>
      <div className="">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-foreground ">
          <div className="min-w-0">
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
              inputClassName="h-8 text-xs w-full pr-10"
              disabled={readOnly}
            />
          </div>

          <div className="min-w-0">
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
              inputClassName="h-8 text-xs w-full pr-10"
              disabled={readOnly}
            />
          </div>

          <div className="min-w-0">
            <LabeledAutocompleteField
              value={caseInfos?.tooth || ""}
              onChange={(value) => {
                if (readOnly) return;
                setCaseInfos({
                  tooth: value,
                });
              }}
              options={teethOptions}
              placeholder="치아번호"
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
              inputClassName="h-8 text-xs w-full pr-10"
              disabled={readOnly}
            />
          </div>
        </div>
      </div>

      {showImplantSelect && (
        <div className="space-y-4">
          <div className="space-y-1">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-[10px] md:text-[11px]">
              <div className="min-w-0 space-y-1">
                <Select
                  value={currentManufacturer}
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
                    <SelectValue placeholder="Manufacturer">
                      {currentManufacturer
                        ? manufacturerLabelMap.get(currentManufacturer) ||
                          currentManufacturer
                        : undefined}
                    </SelectValue>
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

              <div className="min-w-0 space-y-1">
                <Select
                  value={currentBrand}
                  onValueChange={(value) => {
                    if (implantDisabled) return;

                    // 시스템 변경 시: 규격1/규격2를 해당 시스템의 첫 유효 조합으로 연쇄 초기화
                    const nextBrand = value;
                    const nextFamily = pickPreferredFamily(
                      getFamilies(currentManufacturer, nextBrand),
                    );
                    const nextType = pickFirst(
                      getTypes(currentManufacturer, nextBrand, nextFamily),
                    );

                    if (implantSelectSource === "caseInfos") {
                      setCaseInfos({
                        implantBrand: nextBrand,
                        implantFamily: nextFamily,
                        implantType: nextType,
                      });
                      syncSelectedConnection(
                        currentManufacturer,
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
                      currentManufacturer,
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
                    <SelectValue placeholder="Brand">
                      {currentBrand
                        ? brandLabelMap.get(currentBrand) || currentBrand
                        : undefined}
                    </SelectValue>
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

              <div className="min-w-0 space-y-1">
                <Select
                  value={currentFamily}
                  onValueChange={(value) => {
                    if (implantDisabled) return;

                    // 규격1 변경 시: 규격2를 해당 규격1의 첫 유효 값으로 연쇄 초기화
                    const nextFamily = value;
                    const nextType = pickFirst(
                      getTypes(currentManufacturer, currentBrand, nextFamily),
                    );

                    if (implantSelectSource === "caseInfos") {
                      setCaseInfos({
                        implantFamily: nextFamily,
                        implantType: nextType,
                      });
                      syncSelectedConnection(
                        currentManufacturer,
                        currentBrand,
                        nextFamily,
                        nextType,
                      );
                      return;
                    }

                    setImplantFamily(nextFamily);
                    setImplantType(nextType);
                    syncSelectedConnection(
                      currentManufacturer,
                      currentBrand,
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
                    <SelectValue placeholder="Family">
                      {currentFamily
                        ? familyLabelMap.get(currentFamily) || currentFamily
                        : undefined}
                    </SelectValue>
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

              <div className="min-w-0 space-y-1">
                <Select
                  value={currentType}
                  onValueChange={(value) => {
                    if (implantDisabled) return;
                    if (implantSelectSource === "caseInfos") {
                      setCaseInfos({ implantType: value });
                      syncSelectedConnection(
                        currentManufacturer,
                        currentBrand,
                        currentFamily,
                        value,
                      );
                      return;
                    }
                    setImplantType(value);
                    syncSelectedConnection(
                      currentManufacturer,
                      currentBrand,
                      currentFamily,
                      value,
                    );
                    setCaseInfos({ implantType: value });
                  }}
                  disabled={implantDisabled || !currentFamily}
                >
                  <SelectTrigger disabled={implantDisabled || !currentFamily}>
                    <SelectValue placeholder="Type">
                      {currentType
                        ? typeLabelMap.get(currentType) || currentType
                        : undefined}
                    </SelectValue>
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
          </div>
        </div>
      )}
    </>
  );
}

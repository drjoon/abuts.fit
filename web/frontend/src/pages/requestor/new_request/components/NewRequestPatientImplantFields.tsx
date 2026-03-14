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
        return [type, sample?.displayType || type];
      }),
    );
  }, [
    connectionOptions,
    currentFamily,
    currentManufacturer,
    currentBrand,
    currentTypeOptions,
  ]);

  useEffect(() => {
    const manufacturer = caseInfos?.implantManufacturer;
    if (!manufacturer) return;

    const manufacturerConnections = connectionOptions.filter(
      (c) => c.manufacturer === manufacturer,
    );
    if (!manufacturerConnections.length) return;

    const brandFromCase = caseInfos?.implantBrand || "";
    const isValidBrand = manufacturerConnections.some(
      (c) => c.brand === brandFromCase,
    );
    if (isValidBrand) return;

    const fallbackBrand = manufacturerConnections[0].brand || "";
    if (!fallbackBrand) return;

    const fallbackFamily = manufacturerConnections[0].family;
    const fallbackType = manufacturerConnections[0].type || "Hex";
    setCaseInfos({
      implantBrand: fallbackBrand,
      implantFamily: fallbackFamily,
      implantType: fallbackType,
    });
    if (implantSelectSource !== "caseInfos") {
      setImplantBrand(fallbackBrand);
      setImplantFamily(fallbackFamily);
      setImplantType(fallbackType);
    }
  }, [
    caseInfos?.implantManufacturer,
    caseInfos?.implantBrand,
    connectionOptions,
    implantSelectSource,
    setCaseInfos,
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
              value={caseInfos?.patientName || ""}
              onChange={(value) => {
                if (readOnly) return;
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
                if (caseInfos?.patientName) {
                  addPatientPreset(caseInfos.patientName);
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
                    // Manufacturer 선택 시 Brand만 초기화, Family/Type은 유지
                    const firstForManufacturer = connectionOptions.find(
                      (c) => c.manufacturer === value,
                    );
                    const nextBrand = firstForManufacturer?.brand || "";
                    if (implantSelectSource === "caseInfos") {
                      setCaseInfos({
                        implantManufacturer: value,
                        implantBrand: nextBrand,
                      });
                      syncSelectedConnection(
                        value,
                        nextBrand,
                        currentFamily,
                        currentType,
                      );
                      return;
                    }
                    setImplantManufacturer(value);
                    setImplantBrand(nextBrand);
                    syncSelectedConnection(
                      value,
                      nextBrand,
                      currentFamily,
                      currentType,
                    );
                    setCaseInfos({
                      implantManufacturer: value,
                      implantBrand: nextBrand,
                    });
                  }}
                >
                  <SelectTrigger disabled={implantDisabled}>
                    <SelectValue placeholder="Manufacturer" />
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
                    // Brand 선택 시 Family/Type은 유지
                    if (implantSelectSource === "caseInfos") {
                      setCaseInfos({
                        implantBrand: value,
                      });
                      syncSelectedConnection(
                        currentManufacturer,
                        value,
                        currentFamily,
                        currentType,
                      );
                      return;
                    }
                    setImplantBrand(value);
                    syncSelectedConnection(
                      currentManufacturer,
                      value,
                      currentFamily,
                      currentType,
                    );
                    setCaseInfos({
                      implantBrand: value,
                    });
                  }}
                  disabled={implantDisabled || !currentManufacturer}
                >
                  <SelectTrigger
                    disabled={implantDisabled || !currentManufacturer}
                  >
                    <SelectValue placeholder="Brand" />
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
                    // Family 선택 시 Type은 유지
                    if (implantSelectSource === "caseInfos") {
                      setCaseInfos({
                        implantFamily: value,
                      });
                      syncSelectedConnection(
                        currentManufacturer,
                        currentBrand,
                        value,
                        currentType,
                      );
                      return;
                    }
                    setImplantFamily(value);
                    syncSelectedConnection(
                      currentManufacturer,
                      currentBrand,
                      value,
                      currentType,
                    );
                    setCaseInfos({
                      implantFamily: value,
                    });
                  }}
                  disabled={implantDisabled || !currentBrand}
                >
                  <SelectTrigger disabled={implantDisabled || !currentBrand}>
                    <SelectValue placeholder="Family" />
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
                    <SelectValue placeholder="Type" />
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

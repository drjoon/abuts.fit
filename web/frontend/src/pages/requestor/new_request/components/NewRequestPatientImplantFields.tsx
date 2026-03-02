import { useMemo } from "react";
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
  typeOptions: string[];
  implantManufacturer: string;
  setImplantManufacturer: (v: string) => void;
  implantSystem: string;
  setImplantSystem: (v: string) => void;
  implantType: string;
  setImplantType: (v: string) => void;
  syncSelectedConnection: (
    manufacturer: string,
    system: string,
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
  typeOptions,
  implantManufacturer,
  setImplantManufacturer,
  implantSystem,
  setImplantSystem,
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
  const enforcedImplantType = "Hex" as const;
  const caseInfos =
    rawCaseInfos && rawCaseInfos.implantType !== enforcedImplantType
      ? { ...rawCaseInfos, implantType: enforcedImplantType }
      : rawCaseInfos;
  const setCaseInfos = (updates: Partial<CaseInfos>) => {
    setCaseInfosRaw({
      ...updates,
      implantType: enforcedImplantType,
    });
  };
  const hasClinicName = Boolean((caseInfos?.clinicName || "").trim());
  const implantDisabled = Boolean(readOnly || !hasClinicName);

  const currentManufacturer =
    implantSelectSource === "caseInfos"
      ? caseInfos?.implantManufacturer || ""
      : implantManufacturer;
  const currentSystem =
    implantSelectSource === "caseInfos"
      ? caseInfos?.implantSystem || ""
      : implantSystem;
  const currentType = enforcedImplantType;

  const currentTypeOptions = useMemo(() => {
    return [enforcedImplantType];
  }, [enforcedImplantType]);

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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px] md:text-[11px]">
              <div className="min-w-0 space-y-1">
                <Select value={currentType} disabled>
                  <SelectTrigger disabled={implantDisabled || !currentSystem}>
                    <SelectValue placeholder="유형" />
                  </SelectTrigger>
                  <SelectContent>
                    {(() => {
                      const base = currentTypeOptions || [];
                      const list =
                        currentType && !base.includes(currentType)
                          ? [currentType, ...base]
                          : base;
                      return list.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ));
                    })()}
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-0 space-y-1">
                <Select
                  value={currentManufacturer}
                  onValueChange={(value) => {
                    if (implantDisabled) return;
                    const firstForManufacturer = connections.find(
                      (c) =>
                        c.manufacturer === value &&
                        c.type === enforcedImplantType,
                    );
                    const nextSystem =
                      typeof firstForManufacturer?.system === "string"
                        ? firstForManufacturer.system
                        : "";
                    const firstForType = connections.find(
                      (c) =>
                        c.manufacturer === value &&
                        c.system === nextSystem &&
                        c.type === enforcedImplantType,
                    );
                    const nextType =
                      typeof firstForType?.type === "string"
                        ? firstForType.type
                        : enforcedImplantType;
                    if (implantSelectSource === "caseInfos") {
                      setCaseInfos({
                        implantManufacturer: value,
                        implantSystem: nextSystem,
                        implantType: nextType,
                      });
                      syncSelectedConnection(value, nextSystem, nextType);
                      return;
                    }

                    setImplantManufacturer(value);
                    setImplantSystem(nextSystem);
                    setImplantType(enforcedImplantType);
                    syncSelectedConnection(value, nextSystem, nextType);
                    setCaseInfos({
                      implantManufacturer: value,
                      implantSystem: nextSystem,
                      implantType: nextType,
                    });
                  }}
                >
                  <SelectTrigger disabled={implantDisabled}>
                    <SelectValue placeholder="임플란트제조사" />
                  </SelectTrigger>
                  <SelectContent>
                    {(() => {
                      const base = [
                        ...new Set(connections.map((c) => c.manufacturer)),
                      ];
                      const list =
                        currentManufacturer &&
                        !base.includes(currentManufacturer)
                          ? [currentManufacturer, ...base]
                          : base;
                      return list.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ));
                    })()}
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-0 space-y-1">
                <Select
                  value={currentSystem}
                  onValueChange={(value) => {
                    if (implantDisabled) return;
                    const firstForType = connections.find(
                      (c) =>
                        c.manufacturer === currentManufacturer &&
                        c.system === value &&
                        c.type === enforcedImplantType,
                    );
                    const nextType =
                      typeof firstForType?.type === "string"
                        ? firstForType.type
                        : enforcedImplantType;
                    if (implantSelectSource === "caseInfos") {
                      setCaseInfos({
                        implantSystem: value,
                        implantType: nextType,
                      });
                      syncSelectedConnection(
                        currentManufacturer,
                        value,
                        nextType,
                      );
                      return;
                    }

                    setImplantSystem(value);
                    setImplantType(enforcedImplantType);
                    syncSelectedConnection(
                      implantManufacturer,
                      value,
                      nextType,
                    );
                    setCaseInfos({
                      implantSystem: value,
                      implantType: nextType,
                    });
                  }}
                  disabled={implantDisabled || !currentManufacturer}
                >
                  <SelectTrigger
                    disabled={implantDisabled || !currentManufacturer}
                  >
                    <SelectValue placeholder="시스템" />
                  </SelectTrigger>
                  <SelectContent>
                    {(() => {
                      const base = [
                        ...new Set(
                          connections
                            .filter(
                              (c) => c.manufacturer === currentManufacturer,
                            )
                            .map((c) => c.system),
                        ),
                      ];
                      const list =
                        currentSystem && !base.includes(currentSystem)
                          ? [currentSystem, ...base]
                          : base;
                      return list.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ));
                    })()}
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

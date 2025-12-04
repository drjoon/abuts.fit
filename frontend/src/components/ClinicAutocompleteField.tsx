import React from "react";
import LabeledAutocompleteField from "@/components/LabeledAutocompleteField";
import type { AutocompleteOption } from "@/components/AutocompleteInput";

export interface ClinicPresetLike {
  id: string;
  name: string;
}

interface ClinicAutocompleteFieldProps {
  value: string;
  onChange: (value: string) => void;
  presets: ClinicPresetLike[];
  selectedId: string | null;
  onSelectClinic: (id: string | null) => void;
  onAddOrSelectClinic: (name: string) => void;
  onDeleteClinic: (id: string) => void;
}

export const ClinicAutocompleteField: React.FC<
  ClinicAutocompleteFieldProps
> = ({
  value,
  onChange,
  presets,
  selectedId,
  onSelectClinic,
  onAddOrSelectClinic,
  onDeleteClinic,
}) => {
  const options: AutocompleteOption[] = presets.map((c) => ({
    id: c.id,
    label: c.name,
  }));

  return (
    <LabeledAutocompleteField
      value={value}
      onChange={(next) => {
        onChange(next);
        const trimmed = next.trim();
        if (!trimmed) {
          onSelectClinic(null);
          return;
        }
        const lower = trimmed.toLowerCase();
        const match = presets.find((c) => c.name.toLowerCase() === lower);
        if (match) {
          onSelectClinic(match.id);
        }
      }}
      options={options}
      placeholder="치과명"
      onOptionSelect={(label) => {
        onChange(label);
        onAddOrSelectClinic(label);
      }}
      onClear={() => {
        onChange("");
        onSelectClinic(null);
      }}
      onDelete={
        selectedId
          ? () => {
              onDeleteClinic(selectedId);
              onChange("");
            }
          : undefined
      }
      inputClassName="h-8 text-xs w-full pr-10"
    />
  );
};

export default ClinicAutocompleteField;

// related files:
// - web/frontend/src/shared/components/practice/PracticeToothChoiceChips.tsx
// - web/frontend/src/shared/components/practice/PracticeToothCompanySpecFields.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/practice/transferMemo.ts
// change-log:
// - 2026-09-14: dimmed 사이드는 칩 하이라이트 끄고, 활성 패널 테두리 강조(XOR 선택 구분).
// - 2026-09-14: ChoiceChip 공통 모듈(PracticeToothChoiceChips) 사용.
// - 2026-09-14: 직접입력과 직경/높이 선택 하이라이트 분리(카탈로그·BA는 원래 별도).
// - 2026-09-14: fill=flex 가로 채움. 직경/높이 단일 항목은 재클릭 해제 불가.
// - 2026-09-14: 직경·높이 편집 모드(비우기 옆 편집·X·추가·라벨변경·드래그). BA 카탈로그.
// - 2026-09-14: variant=healing — 심플 힐링(종류 없음·직경 6/7/9·높이 S/M/L/XL).
// - 2026-08-25: disabled — 커스텀어벗 보철 형태에서는 심플어벗 선택 불가(스캔바디만).
// - 2026-08-25: 심플어벗 섹션 — 종류(심플어벗/심플밀링)·직경(6–10)·높이(S/M/L). 스캔바디와 XOR.
import { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import {
  addSimpleSpecOption,
  emptyToothWorkAbutment,
  isSimpleAbutmentKind,
  isSimpleHealingKind,
  normalizeSimpleAbutmentOptionCatalog,
  normalizeSimpleHealingOptionCatalog,
  removeSimpleSpecOption,
  renameSimpleSpecOption,
  reorderSimpleSpecOptions,
  SIMPLE_ABUTMENT_DIAMETERS,
  SIMPLE_ABUTMENT_HEIGHTS,
  SIMPLE_ABUTMENT_KINDS,
  SIMPLE_HEALING_DIAMETERS,
  SIMPLE_HEALING_HEIGHTS,
  SIMPLE_HEALING_KIND,
  SIMPLE_HEALING_LABEL,
  type SimpleAbutmentKind,
  type SimpleSpecOptionCatalog,
} from "@/shared/practice/transferMemo";
import {
  PracticeToothChipAddButton,
  PracticeToothChipInlineEditor,
  PracticeToothChipPanel,
  PracticeToothChipSectionHeader,
  PracticeToothChoiceChip,
  usePracticeToothChipEdit,
} from "@/shared/components/practice/PracticeToothChoiceChips";

export type ToothSimpleAbutmentValues = {
  abutmentManufacturer: string;
  abutmentDiameter: string;
  abutmentHeight: string;
};

type Props = {
  value: ToothSimpleAbutmentValues;
  onChange: (next: ToothSimpleAbutmentValues) => void;
  /** abutment=심플어벗(종류+직경+높이), healing=심플 힐링(직경+높이) */
  variant?: "abutment" | "healing";
  heading?: string;
  className?: string;
  dimmed?: boolean;
  disabled?: boolean;
  disabledHint?: string;
  /** BA 저장 직경·높이 카탈로그. 없으면 기본값 */
  optionCatalog?: SimpleSpecOptionCatalog | null;
  onOptionCatalogChange?: (next: SimpleSpecOptionCatalog) => void | Promise<void>;
  allowPresetEdit?: boolean;
};

type EditKind = "diameter" | "height";

export const PracticeToothSimpleAbutmentFields = ({
  value,
  onChange,
  variant = "abutment",
  heading,
  className,
  dimmed = false,
  disabled = false,
  disabledHint,
  optionCatalog,
  onOptionCatalogChange,
  allowPresetEdit = true,
}: Props) => {
  const isHealing = variant === "healing";
  const resolvedHeading =
    heading || (isHealing ? SIMPLE_HEALING_LABEL : "심플어벗");
  const kind = String(value.abutmentManufacturer || "").trim();
  const diameter = String(value.abutmentDiameter || "").trim();
  const height = String(value.abutmentHeight || "").trim();

  const catalog = useMemo(
    () =>
      isHealing
        ? normalizeSimpleHealingOptionCatalog(optionCatalog)
        : normalizeSimpleAbutmentOptionCatalog(optionCatalog),
    [isHealing, optionCatalog],
  );
  const diameterFallback = isHealing
    ? SIMPLE_HEALING_DIAMETERS
    : SIMPLE_ABUTMENT_DIAMETERS;
  const heightFallback = isHealing
    ? SIMPLE_HEALING_HEIGHTS
    : SIMPLE_ABUTMENT_HEIGHTS;

  const [optionsBusy, setOptionsBusy] = useState(false);
  const canManage = allowPresetEdit && Boolean(onOptionCatalogChange);
  const edit = usePracticeToothChipEdit<EditKind>({ canManage, disabled });

  const activeKind = isHealing
    ? isSimpleHealingKind(kind)
      ? SIMPLE_HEALING_KIND
      : ""
    : isSimpleAbutmentKind(kind)
      ? kind
      : "";
  /** 활성 사이드만 칩 하이라이트 — dimmed(초안)는 값은 유지하되 선택 표시 안 함 */
  const selectionOwnsValues = Boolean(activeKind) && !dimmed && !disabled;
  const activeDiameter =
    selectionOwnsValues && catalog.diameters.includes(diameter) ? diameter : "";
  const activeHeight =
    selectionOwnsValues && catalog.heights.includes(height) ? height : "";
  /** 헤더 비우기·패널 강조용 — dimmed여도 초안이 있으면 표시 */
  const hasDraftOrSelection = Boolean(
    (isHealing ? isSimpleHealingKind(kind) : isSimpleAbutmentKind(kind)) ||
      catalog.diameters.includes(diameter) ||
      catalog.heights.includes(height),
  );

  const persistCatalog = async (next: SimpleSpecOptionCatalog) => {
    if (!onOptionCatalogChange) return;
    setOptionsBusy(true);
    try {
      void Promise.resolve(onOptionCatalogChange(next)).catch(() => {});
    } finally {
      setOptionsBusy(false);
    }
  };

  const selectKind = (next: SimpleAbutmentKind) => {
    if (disabled) return;
    if (activeKind === next) {
      if (dimmed) {
        activateSide();
        return;
      }
      onChange(emptyToothWorkAbutment());
      return;
    }
    onChange({
      abutmentManufacturer: next,
      abutmentDiameter: activeDiameter || diameter,
      abutmentHeight: activeHeight || height,
    });
  };

  const activateSide = () => {
    if (disabled) return;
    if (isHealing) {
      onChange({
        abutmentManufacturer: SIMPLE_HEALING_KIND,
        abutmentDiameter:
          activeDiameter ||
          diameter ||
          (catalog.diameters.length === 1 ? catalog.diameters[0] : ""),
        abutmentHeight:
          activeHeight ||
          height ||
          (catalog.heights.length === 1 ? catalog.heights[0] : ""),
      });
      return;
    }
    const manufacturer =
      activeKind ||
      (isSimpleAbutmentKind(kind) ? kind : "") ||
      SIMPLE_ABUTMENT_KINDS[0];
    onChange({
      abutmentManufacturer: manufacturer,
      abutmentDiameter:
        activeDiameter ||
        diameter ||
        (catalog.diameters.length === 1 ? catalog.diameters[0] : ""),
      abutmentHeight:
        activeHeight ||
        height ||
        (catalog.heights.length === 1 ? catalog.heights[0] : ""),
    });
  };

  const selectDiameter = (next: string) => {
    if (disabled) return;
    const manufacturer = isHealing
      ? SIMPLE_HEALING_KIND
      : activeKind || SIMPLE_ABUTMENT_KINDS[0];
    if (activeDiameter === next) {
      if (dimmed) {
        activateSide();
        return;
      }
      if (catalog.diameters.length <= 1) return;
      onChange({
        abutmentManufacturer: manufacturer,
        abutmentDiameter: "",
        abutmentHeight: activeHeight,
      });
      return;
    }
    onChange({
      abutmentManufacturer: manufacturer,
      abutmentDiameter: next,
      abutmentHeight:
        catalog.heights.length === 1 && !activeHeight
          ? catalog.heights[0]
          : activeHeight || height,
    });
  };

  const selectHeight = (next: string) => {
    if (disabled) return;
    const manufacturer = isHealing
      ? SIMPLE_HEALING_KIND
      : activeKind || SIMPLE_ABUTMENT_KINDS[0];
    if (activeHeight === next) {
      if (dimmed) {
        activateSide();
        return;
      }
      if (catalog.heights.length <= 1) return;
      onChange({
        abutmentManufacturer: manufacturer,
        abutmentDiameter: activeDiameter,
        abutmentHeight: "",
      });
      return;
    }
    onChange({
      abutmentManufacturer: manufacturer,
      abutmentDiameter:
        catalog.diameters.length === 1 && !activeDiameter
          ? catalog.diameters[0]
          : activeDiameter || diameter,
      abutmentHeight: next,
    });
  };

  const confirmAdd = async () => {
    const text = String(edit.addDraft || "").trim();
    if (!text || !edit.addRow) return;
    edit.cancelRename();
    if (edit.addRow === "diameter") {
      const diameters = addSimpleSpecOption(
        catalog.diameters,
        text,
        diameterFallback,
      );
      await persistCatalog({ diameters, heights: catalog.heights });
      onChange({
        abutmentManufacturer: isHealing
          ? SIMPLE_HEALING_KIND
          : activeKind || SIMPLE_ABUTMENT_KINDS[0],
        abutmentDiameter: text,
        abutmentHeight: activeHeight,
      });
    } else {
      const heights = addSimpleSpecOption(
        catalog.heights,
        text,
        heightFallback,
      );
      await persistCatalog({ diameters: catalog.diameters, heights });
      onChange({
        abutmentManufacturer: isHealing
          ? SIMPLE_HEALING_KIND
          : activeKind || SIMPLE_ABUTMENT_KINDS[0],
        abutmentDiameter: activeDiameter,
        abutmentHeight: text,
      });
    }
    edit.cancelAdd();
  };

  const confirmRename = async () => {
    if (!edit.renameTarget) return;
    const nextLabel = String(edit.renameDraft || "").trim();
    if (!nextLabel) return;
    const { kind: rowKind, from } = edit.renameTarget;
    if (nextLabel === from) {
      edit.cancelRename();
      return;
    }
    if (rowKind === "diameter") {
      const diameters = renameSimpleSpecOption(
        catalog.diameters,
        from,
        nextLabel,
        diameterFallback,
      );
      await persistCatalog({ diameters, heights: catalog.heights });
      onChange({
        abutmentManufacturer: isHealing
          ? SIMPLE_HEALING_KIND
          : activeKind || SIMPLE_ABUTMENT_KINDS[0],
        abutmentDiameter:
          diameter.toLowerCase() === from.toLowerCase() ? nextLabel : diameter,
        abutmentHeight: activeHeight,
      });
    } else {
      const heights = renameSimpleSpecOption(
        catalog.heights,
        from,
        nextLabel,
        heightFallback,
      );
      await persistCatalog({ diameters: catalog.diameters, heights });
      onChange({
        abutmentManufacturer: isHealing
          ? SIMPLE_HEALING_KIND
          : activeKind || SIMPLE_ABUTMENT_KINDS[0],
        abutmentDiameter: activeDiameter,
        abutmentHeight:
          height.toLowerCase() === from.toLowerCase() ? nextLabel : height,
      });
    }
    edit.cancelRename();
  };

  const deleteDiameter = async (option: string) => {
    const diameters = removeSimpleSpecOption(
      catalog.diameters,
      option,
      diameterFallback,
    );
    await persistCatalog({ diameters, heights: catalog.heights });
    if (diameter.toLowerCase() === option.toLowerCase()) {
      onChange({
        abutmentManufacturer: isHealing
          ? SIMPLE_HEALING_KIND
          : activeKind || "",
        abutmentDiameter: "",
        abutmentHeight: activeHeight,
      });
    }
  };

  const deleteHeight = async (option: string) => {
    const heights = removeSimpleSpecOption(
      catalog.heights,
      option,
      heightFallback,
    );
    await persistCatalog({ diameters: catalog.diameters, heights });
    if (height.toLowerCase() === option.toLowerCase()) {
      onChange({
        abutmentManufacturer: isHealing
          ? SIMPLE_HEALING_KIND
          : activeKind || "",
        abutmentDiameter: activeDiameter,
        abutmentHeight: "",
      });
    }
  };

  const reorderForKind = (
    rowKind: EditKind,
    fromIndex: number,
    toIndex: number,
  ) => {
    if (rowKind === "diameter") {
      void persistCatalog({
        diameters: reorderSimpleSpecOptions(
          catalog.diameters,
          fromIndex,
          toIndex,
          diameterFallback,
        ),
        heights: catalog.heights,
      });
    } else {
      void persistCatalog({
        diameters: catalog.diameters,
        heights: reorderSimpleSpecOptions(
          catalog.heights,
          fromIndex,
          toIndex,
          heightFallback,
        ),
      });
    }
  };

  const renderOptionRow = (
    rowKind: EditKind,
    options: string[],
    activeValue: string,
    onSelect: (next: string) => void,
    onDelete: (option: string) => void,
  ) => (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        {options.map((option, index) =>
          edit.isRenaming(rowKind, option) ? (
            <PracticeToothChipInlineEditor
              key={`rename-${rowKind}-${option}`}
              value={edit.renameDraft}
              placeholder="라벨 변경"
              busy={optionsBusy}
              size="narrow"
              grow
              onChange={edit.setRenameDraft}
              onCancel={edit.cancelRename}
              onConfirm={() => void confirmRename()}
            />
          ) : (
            <PracticeToothChoiceChip
              key={option}
              accent="abut"
              label={option}
              active={activeValue === option}
              disabled={disabled}
              fill
              onClick={() =>
                edit.runChipClick(() => {
                  if (edit.showPresetActions) {
                    edit.startRename(rowKind, option);
                    return;
                  }
                  onSelect(option);
                })
              }
              onDelete={
                edit.showPresetActions
                  ? () => void onDelete(option)
                  : undefined
              }
              {...edit.chipDragProps(rowKind, index, (from, to) =>
                reorderForKind(rowKind, from, to),
              )}
            />
          ),
        )}
      </div>
      {edit.showPresetActions ? (
        edit.addRow === rowKind ? (
          <PracticeToothChipInlineEditor
            value={edit.addDraft}
            placeholder={rowKind === "diameter" ? "직경" : "높이"}
            busy={optionsBusy}
            size="narrow"
            onChange={edit.setAddDraft}
            onCancel={edit.cancelAdd}
            onConfirm={() => void confirmAdd()}
          />
        ) : (
          <PracticeToothChipAddButton
            accent="abut"
            disabled={optionsBusy || disabled}
            onClick={() => edit.beginAdd(rowKind)}
          />
        )
      ) : null}
    </div>
  );

  return (
    <PracticeToothChipPanel
      accent="abut"
      className={className}
      dimmed={dimmed}
      selected={!dimmed && !disabled && hasDraftOrSelection}
      disabled={disabled}
      disabledHint={disabledHint}
      onActivate={activateSide}
    >
      <PracticeToothChipSectionHeader
        accent="abut"
        heading={resolvedHeading}
        canClear={hasDraftOrSelection}
        clearDisabled={disabled}
        onClear={() => onChange(emptyToothWorkAbutment())}
        canEdit={canManage}
        editMode={edit.presetEditMode}
        editDisabled={disabled}
        onToggleEdit={edit.toggleEditMode}
        stopPropagation
      />

      {disabled && disabledHint ? (
        <p className="text-[11px] leading-snug text-slate-500">{disabledHint}</p>
      ) : null}

      {!isHealing ? (
        <div className="space-y-1.5">
          <Label className="text-sm text-slate-600">종류</Label>
          <div className="flex gap-1.5">
            {SIMPLE_ABUTMENT_KINDS.map((option) => (
              <PracticeToothChoiceChip
                key={option}
                accent="abut"
                label={option}
                active={selectionOwnsValues && activeKind === option}
                disabled={disabled}
                fill
                onClick={() => selectKind(option)}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label className="text-sm text-slate-600">직경</Label>
        {renderOptionRow(
          "diameter",
          catalog.diameters,
          activeDiameter,
          selectDiameter,
          deleteDiameter,
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm text-slate-600">높이</Label>
        {renderOptionRow(
          "height",
          catalog.heights,
          activeHeight,
          selectHeight,
          deleteHeight,
        )}
      </div>
    </PracticeToothChipPanel>
  );
};

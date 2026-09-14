// related files:
// - web/frontend/src/shared/components/practice/PracticeToothChoiceChips.tsx
// - web/frontend/src/shared/components/practice/PracticeToothSimpleAbutmentFields.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/practice/transferMemo.ts
// change-log:
// - 2026-09-14: dimmed 사이드는 칩 하이라이트 끄고, 활성 패널 테두리 강조(XOR 선택 구분).
// - 2026-09-14: ChoiceChip 공통 모듈(PracticeToothChoiceChips) 사용.
// - 2026-09-14: 심플어벗과 직경/높이 선택 하이라이트 분리(필드 공유·카탈로그는 별도).
// - 2026-09-14: fill=flex로 가로 균등 채움 수정. 회사 칩도 fill. 단일 항목은 재클릭 해제 불가(비우기만).
// - 2026-09-14: 추가/이름변경 입력폭 제한. 직경·높이 칩은 심플힐링처럼 가로 균등 채움.
// - 2026-09-14: 편집 모드 칩 클릭 → 라벨 인라인 변경.
// - 2026-09-14: 비우기 옆 「편집」— 편집 모드에서만 칩 X·추가·드래그.
// - 2026-09-14: 회사·직경·높이 칩 드래그 순서 변경.
// - 2026-09-14: 단일 항목 강제선택 제거 — 스캔바디|심플힐링 XOR. 클릭으로만 선택·재클릭 해제.
// - 2026-09-14: 칩 X 삭제·회사/직경/높이 행별 추가.
// - 2026-09-14: 회사·직경·높이 칩 UI(심플어벗과 동일 행 높이). 회사별 직경/높이 프리셋 병합 저장.
import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import {
  emptyToothWorkAbutment,
  isSimpleAbutmentKind,
  isSimpleHealingKind,
  listCompanySpecOptions,
  mergeCompanySpecFavorite,
  removeCompanySpecCompany,
  removeCompanySpecDiameter,
  removeCompanySpecHeight,
  renameCompanySpecCompany,
  renameCompanySpecDiameter,
  renameCompanySpecHeight,
  reorderCompanySpecCompanies,
  reorderCompanySpecDiameters,
  reorderCompanySpecHeights,
  type PracticeAbutmentFavorite,
} from "@/shared/practice/transferMemo";
import {
  PracticeToothChipAddButton,
  PracticeToothChipInlineEditor,
  PracticeToothChipPanel,
  PracticeToothChipSectionHeader,
  PracticeToothChoiceChip,
  usePracticeToothChipEdit,
} from "@/shared/components/practice/PracticeToothChoiceChips";

export type ToothCompanySpecValues = {
  abutmentManufacturer: string;
  abutmentDiameter: string;
  abutmentHeight: string;
};

type Props = {
  value: ToothCompanySpecValues;
  onChange: (next: ToothCompanySpecValues) => void;
  favorites: PracticeAbutmentFavorite[];
  onFavoritesChange?: (next: PracticeAbutmentFavorite[]) => void | Promise<void>;
  heading?: string;
  companyLabel?: string;
  className?: string;
  dimmed?: boolean;
  disabled?: boolean;
  disabledHint?: string;
  allowPresetEdit?: boolean;
};

type DragKind = "company" | "diameter" | "height";

export const PracticeToothCompanySpecFields = ({
  value,
  onChange,
  favorites,
  onFavoritesChange,
  heading = "직접 입력",
  companyLabel = "회사",
  className,
  dimmed = false,
  disabled = false,
  disabledHint,
  allowPresetEdit = true,
}: Props) => {
  const [favoritesBusy, setFavoritesBusy] = useState(false);
  const canManage = allowPresetEdit && Boolean(onFavoritesChange);
  const edit = usePracticeToothChipEdit<DragKind>({ canManage, disabled });

  const companyRaw = String(value.abutmentManufacturer || "").trim();
  const diameter = String(value.abutmentDiameter || "").trim();
  const height = String(value.abutmentHeight || "").trim();
  /** 심플어벗/힐링 manufacturer는 직접입력 회사로 취급하지 않음 */
  const company =
    companyRaw &&
    !isSimpleAbutmentKind(companyRaw) &&
    !isSimpleHealingKind(companyRaw)
      ? companyRaw
      : "";
  /** 선택 모드: 칩만. 편집 모드: X·추가·드래그 */
  const showPresetActions = edit.showPresetActions;
  /** 활성 사이드만 칩 하이라이트 — dimmed 초안은 값 유지·선택 표시 안 함 */
  const selectionOwnsValues = Boolean(company) && !dimmed && !disabled;
  const selectedDiameter = selectionOwnsValues ? diameter : "";
  const selectedHeight = selectionOwnsValues ? height : "";
  const selectedCompany = selectionOwnsValues ? company : "";
  const hasDraftOrSelection = Boolean(company || diameter || height);

  const options = useMemo(
    () => listCompanySpecOptions(favorites, company),
    [favorites, company],
  );

  const persistFavorites = async (next: PracticeAbutmentFavorite[]) => {
    if (!onFavoritesChange) return;
    setFavoritesBusy(true);
    try {
      void Promise.resolve(onFavoritesChange(next)).catch(() => {});
    } finally {
      setFavoritesBusy(false);
    }
  };

  const confirmRename = async () => {
    if (!edit.renameTarget) return;
    const nextLabel = String(edit.renameDraft || "").trim();
    if (!nextLabel) return;
    const { kind, from } = edit.renameTarget;
    if (nextLabel === from) {
      edit.cancelRename();
      return;
    }

    if (kind === "company") {
      const merged = renameCompanySpecCompany(favorites, from, nextLabel);
      await persistFavorites(merged);
      if (company.toLowerCase() === from.toLowerCase()) {
        onChange({
          abutmentManufacturer: nextLabel,
          abutmentDiameter: diameter,
          abutmentHeight: height,
        });
      }
      edit.cancelRename();
      return;
    }

    if (!company) return;

    if (kind === "diameter") {
      const merged = renameCompanySpecDiameter(
        favorites,
        company,
        from,
        nextLabel,
      );
      await persistFavorites(merged);
      onChange({
        abutmentManufacturer: company,
        abutmentDiameter:
          diameter.toLowerCase() === from.toLowerCase() ? nextLabel : diameter,
        abutmentHeight: height,
      });
      edit.cancelRename();
      return;
    }

    if (kind === "height") {
      const merged = renameCompanySpecHeight(
        favorites,
        company,
        from,
        nextLabel,
      );
      await persistFavorites(merged);
      onChange({
        abutmentManufacturer: company,
        abutmentDiameter: diameter,
        abutmentHeight:
          height.toLowerCase() === from.toLowerCase() ? nextLabel : height,
      });
      edit.cancelRename();
    }
  };

  const reorderForKind = (kind: DragKind, fromIndex: number, toIndex: number) => {
    if (kind === "company") {
      void persistFavorites(
        reorderCompanySpecCompanies(favorites, fromIndex, toIndex),
      );
    } else if (kind === "diameter" && company) {
      void persistFavorites(
        reorderCompanySpecDiameters(favorites, company, fromIndex, toIndex),
      );
    } else if (kind === "height" && company) {
      void persistFavorites(
        reorderCompanySpecHeights(favorites, company, fromIndex, toIndex),
      );
    }
  };

  /** 비활성(dimmed) 카드 클릭·재클릭 시 이 사이드로 전환 */
  const activateSide = () => {
    if (disabled) return;
    if (company) {
      onChange({
        abutmentManufacturer: company,
        abutmentDiameter:
          diameter ||
          (options.diameters.length === 1 ? options.diameters[0] : ""),
        abutmentHeight:
          height || (options.heights.length === 1 ? options.heights[0] : ""),
      });
      return;
    }
    if (options.companies.length === 1) {
      const sole = options.companies[0];
      if (!sole) return;
      const nextOpts = listCompanySpecOptions(favorites, sole);
      onChange({
        abutmentManufacturer: sole,
        abutmentDiameter:
          nextOpts.diameters.length === 1 ? nextOpts.diameters[0] : "",
        abutmentHeight: nextOpts.heights.length === 1 ? nextOpts.heights[0] : "",
      });
    }
  };

  const selectCompany = (nextCompany: string) => {
    if (disabled) return;
    if (company === nextCompany) {
      if (dimmed) {
        activateSide();
        return;
      }
      // 재클릭 해제 — 단, 회사가 1개뿐이면 고정(비우기로만 해제)
      if (options.companies.length <= 1) return;
      onChange(emptyToothWorkAbutment());
      return;
    }
    const nextOpts = listCompanySpecOptions(favorites, nextCompany);
    onChange({
      abutmentManufacturer: nextCompany,
      abutmentDiameter:
        nextOpts.diameters.length === 1
          ? nextOpts.diameters[0]
          : nextOpts.diameters.includes(diameter)
            ? diameter
            : "",
      abutmentHeight:
        nextOpts.heights.length === 1
          ? nextOpts.heights[0]
          : nextOpts.heights.includes(height)
            ? height
            : "",
    });
  };

  const selectDiameter = (next: string) => {
    if (disabled || !company) {
      if (dimmed && !disabled) activateSide();
      return;
    }
    if (diameter === next) {
      if (dimmed) {
        activateSide();
        return;
      }
      if (options.diameters.length <= 1) return;
      onChange({
        abutmentManufacturer: company,
        abutmentDiameter: "",
        abutmentHeight: height,
      });
      return;
    }
    const nextHeight =
      options.heights.length === 1 && !height ? options.heights[0] : height;
    onChange({
      abutmentManufacturer: company,
      abutmentDiameter: next,
      abutmentHeight: nextHeight,
    });
  };

  const selectHeight = (next: string) => {
    if (disabled || !company) {
      if (dimmed && !disabled) activateSide();
      return;
    }
    if (height === next) {
      if (dimmed) {
        activateSide();
        return;
      }
      if (options.heights.length <= 1) return;
      onChange({
        abutmentManufacturer: company,
        abutmentDiameter: diameter,
        abutmentHeight: "",
      });
      return;
    }
    const nextDiameter =
      options.diameters.length === 1 && !diameter ? options.diameters[0] : diameter;
    onChange({
      abutmentManufacturer: company,
      abutmentDiameter: nextDiameter,
      abutmentHeight: next,
    });
  };

  // 회사 1개뿐이면 미선택 시 자동 선택(+ 단일 직경/높이 채움). XOR 해제는 「비우기」.
  // 심플어벗/힐링이 선택된 동안에는 덮어쓰지 않음.
  useEffect(() => {
    if (disabled || dimmed || showPresetActions) return;
    if (
      isSimpleAbutmentKind(companyRaw) ||
      isSimpleHealingKind(companyRaw)
    ) {
      return;
    }
    if (options.companies.length !== 1) return;
    const sole = options.companies[0];
    if (!sole) return;
    if (company) return;
    const nextOpts = listCompanySpecOptions(favorites, sole);
    onChange({
      abutmentManufacturer: sole,
      abutmentDiameter:
        nextOpts.diameters.length === 1 ? nextOpts.diameters[0] : "",
      abutmentHeight: nextOpts.heights.length === 1 ? nextOpts.heights[0] : "",
    });
  }, [
    company,
    companyRaw,
    dimmed,
    disabled,
    favorites,
    onChange,
    options.companies,
    showPresetActions,
  ]);

  const confirmAdd = async () => {
    const text = String(edit.addDraft || "").trim();
    if (!text || !edit.addRow) return;
    edit.cancelRename();

    if (edit.addRow === "company") {
      const merged = mergeCompanySpecFavorite(favorites, {
        manufacturer: text,
      });
      await persistFavorites(merged);
      const nextOpts = listCompanySpecOptions(merged, text);
      onChange({
        abutmentManufacturer: text,
        abutmentDiameter:
          nextOpts.diameters.length === 1 ? nextOpts.diameters[0] : "",
        abutmentHeight: nextOpts.heights.length === 1 ? nextOpts.heights[0] : "",
      });
      edit.cancelAdd();
      return;
    }

    if (!company) return;

    if (edit.addRow === "diameter") {
      const merged = mergeCompanySpecFavorite(favorites, {
        manufacturer: company,
        diameter: text,
        height: height || undefined,
      });
      await persistFavorites(merged);
      onChange({
        abutmentManufacturer: company,
        abutmentDiameter: text,
        abutmentHeight: height,
      });
      edit.cancelAdd();
      return;
    }

    if (edit.addRow === "height") {
      const merged = mergeCompanySpecFavorite(favorites, {
        manufacturer: company,
        diameter: diameter || undefined,
        height: text,
      });
      await persistFavorites(merged);
      onChange({
        abutmentManufacturer: company,
        abutmentDiameter: diameter,
        abutmentHeight: text,
      });
      edit.cancelAdd();
    }
  };

  const deleteCompany = async (name: string) => {
    const next = removeCompanySpecCompany(favorites, name);
    await persistFavorites(next);
    if (company.toLowerCase() === name.toLowerCase()) {
      onChange(emptyToothWorkAbutment());
    }
  };

  const deleteDiameter = async (option: string) => {
    if (!company) return;
    const next = removeCompanySpecDiameter(favorites, company, option);
    await persistFavorites(next);
    const opts = listCompanySpecOptions(next, company);
    onChange({
      abutmentManufacturer: company,
      abutmentDiameter:
        diameter.toLowerCase() === option.toLowerCase()
          ? ""
          : opts.diameters.includes(diameter)
            ? diameter
            : "",
      abutmentHeight: opts.heights.includes(height) ? height : "",
    });
  };

  const deleteHeight = async (option: string) => {
    if (!company) return;
    const next = removeCompanySpecHeight(favorites, company, option);
    await persistFavorites(next);
    const opts = listCompanySpecOptions(next, company);
    onChange({
      abutmentManufacturer: company,
      abutmentDiameter: opts.diameters.includes(diameter) ? diameter : "",
      abutmentHeight:
        height.toLowerCase() === option.toLowerCase()
          ? ""
          : opts.heights.includes(height)
            ? height
            : "",
    });
  };

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
        heading={heading}
        canClear={hasDraftOrSelection}
        clearDisabled={disabled}
        onClear={() => onChange(emptyToothWorkAbutment())}
        canEdit={canManage}
        editMode={edit.presetEditMode}
        onToggleEdit={edit.toggleEditMode}
        stopPropagation
      />

      {disabled && disabledHint ? (
        <p className="text-[11px] leading-snug text-slate-500">{disabledHint}</p>
      ) : null}

      <div className="space-y-1.5">
        <Label className="text-sm text-slate-600">{companyLabel}</Label>
        <div className="space-y-1.5">
          <div className="flex gap-1.5">
            {options.companies.map((name, index) =>
              edit.isRenaming("company", name) ? (
                <PracticeToothChipInlineEditor
                  key={`rename-company-${name}`}
                  value={edit.renameDraft}
                  placeholder="라벨 변경"
                  busy={favoritesBusy}
                  size="wide"
                  grow
                  onChange={edit.setRenameDraft}
                  onCancel={edit.cancelRename}
                  onConfirm={() => void confirmRename()}
                />
              ) : (
                <PracticeToothChoiceChip
                  key={name}
                  label={name}
                  active={selectedCompany === name}
                  disabled={disabled}
                  fill
                  onClick={() =>
                    edit.runChipClick(() => {
                      if (showPresetActions) {
                        edit.startRename("company", name);
                        return;
                      }
                      selectCompany(name);
                    })
                  }
                  onDelete={
                    showPresetActions
                      ? () => void deleteCompany(name)
                      : undefined
                  }
                  {...edit.chipDragProps("company", index, (from, to) =>
                    reorderForKind("company", from, to),
                  )}
                />
              ),
            )}
          </div>
          {showPresetActions ? (
            edit.addRow === "company" ? (
              <PracticeToothChipInlineEditor
                value={edit.addDraft}
                placeholder={companyLabel}
                busy={favoritesBusy}
                size="wide"
                onChange={edit.setAddDraft}
                onCancel={edit.cancelAdd}
                onConfirm={() => void confirmAdd()}
              />
            ) : (
              <PracticeToothChipAddButton
                disabled={favoritesBusy || disabled}
                onClick={() => edit.beginAdd("company")}
              />
            )
          ) : options.companies.length === 0 ? (
            <p className="text-xs text-slate-400">
              {canManage ? "편집에서 회사를 추가하세요" : "저장된 회사가 없습니다"}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm text-slate-600">직경</Label>
        {!company ? (
          <p className="text-xs text-slate-400">회사를 먼저 선택하세요</p>
        ) : (
          <div className="space-y-1.5">
            <div className="flex gap-1.5">
              {options.diameters.map((option, index) =>
                edit.isRenaming("diameter", option) ? (
                  <PracticeToothChipInlineEditor
                    key={`rename-diameter-${option}`}
                    value={edit.renameDraft}
                    placeholder="라벨 변경"
                    busy={favoritesBusy}
                    size="narrow"
                    grow
                    onChange={edit.setRenameDraft}
                    onCancel={edit.cancelRename}
                    onConfirm={() => void confirmRename()}
                  />
                ) : (
                  <PracticeToothChoiceChip
                    key={option}
                    label={option}
                    active={selectedDiameter === option}
                    disabled={disabled}
                    fill
                    onClick={() =>
                      edit.runChipClick(() => {
                        if (showPresetActions) {
                          edit.startRename("diameter", option);
                          return;
                        }
                        selectDiameter(option);
                      })
                    }
                    onDelete={
                      showPresetActions
                        ? () => void deleteDiameter(option)
                        : undefined
                    }
                    {...edit.chipDragProps("diameter", index, (from, to) =>
                      reorderForKind("diameter", from, to),
                    )}
                  />
                ),
              )}
            </div>
            {showPresetActions ? (
              edit.addRow === "diameter" ? (
                <PracticeToothChipInlineEditor
                  value={edit.addDraft}
                  placeholder="직경"
                  busy={favoritesBusy}
                  size="narrow"
                  onChange={edit.setAddDraft}
                  onCancel={edit.cancelAdd}
                  onConfirm={() => void confirmAdd()}
                />
              ) : (
                <PracticeToothChipAddButton
                  disabled={favoritesBusy || disabled}
                  onClick={() => edit.beginAdd("diameter")}
                />
              )
            ) : !canManage && options.diameters.length === 0 ? (
              <p className="text-xs text-slate-400">직경 프리셋이 없습니다</p>
            ) : null}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm text-slate-600">높이</Label>
        {!company ? (
          <p className="text-xs text-slate-400">회사를 먼저 선택하세요</p>
        ) : (
          <div className="space-y-1.5">
            <div className="flex gap-1.5">
              {options.heights.map((option, index) =>
                edit.isRenaming("height", option) ? (
                  <PracticeToothChipInlineEditor
                    key={`rename-height-${option}`}
                    value={edit.renameDraft}
                    placeholder="라벨 변경"
                    busy={favoritesBusy}
                    size="narrow"
                    grow
                    onChange={edit.setRenameDraft}
                    onCancel={edit.cancelRename}
                    onConfirm={() => void confirmRename()}
                  />
                ) : (
                  <PracticeToothChoiceChip
                    key={option}
                    label={option}
                    active={selectedHeight === option}
                    disabled={disabled}
                    fill
                    onClick={() =>
                      edit.runChipClick(() => {
                        if (showPresetActions) {
                          edit.startRename("height", option);
                          return;
                        }
                        selectHeight(option);
                      })
                    }
                    onDelete={
                      showPresetActions
                        ? () => void deleteHeight(option)
                        : undefined
                    }
                    {...edit.chipDragProps("height", index, (from, to) =>
                      reorderForKind("height", from, to),
                    )}
                  />
                ),
              )}
            </div>
            {showPresetActions ? (
              edit.addRow === "height" ? (
                <PracticeToothChipInlineEditor
                  value={edit.addDraft}
                  placeholder="높이"
                  busy={favoritesBusy}
                  size="narrow"
                  onChange={edit.setAddDraft}
                  onCancel={edit.cancelAdd}
                  onConfirm={() => void confirmAdd()}
                />
              ) : (
                <PracticeToothChipAddButton
                  disabled={favoritesBusy || disabled}
                  onClick={() => edit.beginAdd("height")}
                />
              )
            ) : !canManage && options.heights.length === 0 ? (
              <p className="text-xs text-slate-400">높이 프리셋이 없습니다</p>
            ) : null}
          </div>
        )}
      </div>
    </PracticeToothChipPanel>
  );
};

// change-log:
// - 2026-08-09: 묶음 해제/파일 분리 시 productMode 복원 + 출고일 재계산은 NewRequestPage에서.
// - 2026-08-09: 커스텀어벗 디자인 STL(<3MB) 업로드 시 productMode=생산 고정.
// - 2026-08-09: 자동묶음에 파일 크기 전달. 단일 구강스캔(>=3MB)도 디자인+생산 표시.
// - 2026-08-09: 새로고침 시 files 복원 전 그룹 정리로 묶음이 풀리던 문제 수정.
// - 2026-08-09: 디자인+생산 환자 단위 파일 묶음 상태/자동묶기/수동묶기.
// related files:
// - web/frontend/src/pages/requestor/new_request/utils/patientGroups.ts
// - web/frontend/src/pages/requestor/new_request/utils/localDraftStorage.ts
// - web/frontend/src/pages/requestor/new_request/components/NewRequestAttachmentsPanel.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CaseInfos } from "./newRequestTypes";
import {
  getLocalDraft,
  savePatientGroups,
} from "../utils/localDraftStorage";
import {
  buildAttachmentListItems,
  buildFileKeyToGroupIdMap,
  createPatientGroupId,
  findGroupByFileKey,
  getPrimaryFileKey,
  isLikelyCustomAbutDesignSize,
  isLikelyOralScanSize,
  mergeFileKeysIntoGroup,
  planAutoGroupsForNewFiles,
  planBatchGroupIfAmbiguous,
  removeFileKeysFromGroups,
  resolveFileSizeBytes,
  type PatientFileGroup,
} from "../utils/patientGroups";

type Params = {
  files: File[];
  toFileKey: (file: File) => string;
  caseInfosMap?: Record<string, CaseInfos>;
  updateCaseInfos: (fileKey: string, updates: Partial<CaseInfos>) => void;
};

function buildSizeByFileKey(
  files: File[],
  toFileKey: (file: File) => string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const file of files) {
    out[toFileKey(file)] = file.size;
  }
  return out;
}

export function usePatientFileGroups({
  files,
  toFileKey,
  caseInfosMap,
  updateCaseInfos,
}: Params) {
  const [patientGroups, setPatientGroups] = useState<PatientFileGroup[]>(() => {
    const draft = getLocalDraft();
    return Array.isArray(draft?.patientGroups) ? draft.patientGroups : [];
  });

  const persistGroups = useCallback((next: PatientFileGroup[]) => {
    setPatientGroups(next);
    savePatientGroups(next);
  }, []);

  // 삭제된 파일 키가 그룹에 남지 않도록 정리.
  // files가 비어 있는 동안(새로고침 후 IndexedDB 복원 전)에는 실행하지 않는다.
  // 그렇지 않으면 복원 전에 그룹이 비워져 localStorage까지 덮어쓴다.
  useEffect(() => {
    if (files.length === 0) return;

    const alive = new Set(files.map((file) => toFileKey(file)));
    setPatientGroups((prev) => {
      if (!prev.length) return prev;
      const next = prev
        .map((group) => ({
          ...group,
          fileKeys: group.fileKeys.filter((key) => alive.has(key)),
        }))
        .filter((group) => group.fileKeys.length >= 2);
      const changed =
        next.length !== prev.length ||
        next.some((g, i) => g.fileKeys.join("|") !== prev[i]?.fileKeys.join("|"));
      if (changed) {
        savePatientGroups(next);
        return next;
      }
      return prev;
    });
  }, [files, toFileKey]);

  const fileKeyToGroupId = useMemo(
    () => buildFileKeyToGroupIdMap(patientGroups),
    [patientGroups],
  );

  const listItems = useMemo(
    () => buildAttachmentListItems(files, toFileKey, patientGroups),
    [files, toFileKey, patientGroups],
  );

  const syncGroupCaseInfos = useCallback(
    (group: PatientFileGroup, updates: Partial<CaseInfos>) => {
      for (const key of group.fileKeys) {
        updateCaseInfos(key, updates);
      }
    },
    [updateCaseInfos],
  );

  const markGroupAsDesignProduction = useCallback(
    (group: PatientFileGroup, patientNameHint?: string) => {
      const primary = getPrimaryFileKey(group);
      const primaryInfo = primary ? caseInfosMap?.[primary] : undefined;
      const clinicName = String(primaryInfo?.clinicName || "").trim() || undefined;
      const patientName =
        String(patientNameHint || primaryInfo?.patientName || "").trim() ||
        undefined;

      syncGroupCaseInfos(group, {
        productMode: "design_custom_abutment",
        workType: "abutment",
        ...(clinicName ? { clinicName } : {}),
        ...(patientName ? { patientName } : {}),
      });
    },
    [caseInfosMap, syncGroupCaseInfos],
  );

  /**
   * 묶음에서 빠져나온 파일의 productMode 복원.
   * 묶을 때 전원 design_custom_abutment로 올리므로, 분리 시 크기 휴리스틱으로 되돌린다.
   * 구강스캔(>=3MB) → 디자인+생산, 그 외(어벗 STL 등) → 생산.
   * (출고 모드·ETA 재계산은 NewRequestPage.refreshShipScheduleAfterLeaveGroup)
   */
  const restoreProductModeAfterLeaveGroup = useCallback(
    (fileKey: string) => {
      const file = files.find((f) => toFileKey(f) === fileKey);
      const size =
        typeof file?.size === "number"
          ? file.size
          : resolveFileSizeBytes(fileKey);
      if (isLikelyOralScanSize(size)) {
        updateCaseInfos(fileKey, {
          productMode: "design_custom_abutment",
          workType: "abutment",
          requestedShipDate: undefined,
        });
        return;
      }
      updateCaseInfos(fileKey, {
        productMode: "custom_abutment",
        workType: "abutment",
        requestedShipDate: undefined,
      });
    },
    [files, toFileKey, updateCaseInfos],
  );

  const autoGroupNewFiles = useCallback(
    (newFiles: File[]) => {
      if (!newFiles.length) return;

      const newFileKeys = newFiles.map((file) => toFileKey(file));
      const sizeByFileKey = buildSizeByFileKey(newFiles, toFileKey);
      const patientNameByFileKey: Record<string, string | undefined> = {};
      for (const key of newFileKeys) {
        patientNameByFileKey[key] = caseInfosMap?.[key]?.patientName;
      }
      // caseInfosMap이 아직 반영되기 전일 수 있어, 호출 측에서 파싱값을 넘기지 않으면
      // 기존 map + 빈 값으로 동작한다. 페이지에서 파싱 직후 호출하도록 한다.

      const mergedPatientNames = {
        ...Object.fromEntries(
          patientGroups.flatMap((g) =>
            g.fileKeys.map((k) => [k, caseInfosMap?.[k]?.patientName]),
          ),
        ),
        ...Object.fromEntries(
          Object.keys(caseInfosMap || {}).map((k) => [
            k,
            caseInfosMap?.[k]?.patientName,
          ]),
        ),
        ...patientNameByFileKey,
      };

      const { groupsToCreate, groupsToUpdate } = planAutoGroupsForNewFiles({
        newFileKeys,
        patientNameByFileKey: mergedPatientNames,
        existingGroups: patientGroups,
        sizeByFileKey,
      });

      let next = patientGroups.map((group) => {
        const updated = groupsToUpdate.find((g) => g.id === group.id);
        return updated || group;
      });
      if (groupsToCreate.length) {
        next = [...next, ...groupsToCreate];
      }

      const alreadyGrouped = new Set(next.flatMap((g) => g.fileKeys));
      const batchGroup = planBatchGroupIfAmbiguous({
        newFileKeys,
        patientNameByFileKey: mergedPatientNames,
        alreadyGroupedKeys: alreadyGrouped,
        sizeByFileKey,
      });
      if (batchGroup) {
        next = [...next, batchGroup];
      }

      const changed =
        next.length !== patientGroups.length ||
        next.some(
          (g, i) =>
            g.id !== patientGroups[i]?.id ||
            g.fileKeys.join("|") !== patientGroups[i]?.fileKeys.join("|"),
        );

      if (changed) {
        persistGroups(next);
        for (const group of [
          ...groupsToCreate,
          ...groupsToUpdate,
          ...(batchGroup ? [batchGroup] : []),
        ]) {
          const latest = next.find((g) => g.id === group.id) || group;
          const patientHint =
            latest.fileKeys
              .map((k) =>
                String(
                  patientNameByFileKey[k] || caseInfosMap?.[k]?.patientName || "",
                ).trim(),
              )
              .find(Boolean) || undefined;
          markGroupAsDesignProduction(latest, patientHint);
        }
      }

      // 크기별 productMode: 구강스캔→디자인+생산, 어벗디자인 STL→생산
      for (const file of newFiles) {
        const key = toFileKey(file);
        if (next.some((g) => g.fileKeys.includes(key))) continue;
        if (isLikelyOralScanSize(file.size)) {
          updateCaseInfos(key, {
            productMode: "design_custom_abutment",
            workType: "abutment",
          });
        } else if (isLikelyCustomAbutDesignSize(file.size)) {
          updateCaseInfos(key, {
            productMode: "custom_abutment",
            workType: "abutment",
          });
        }
      }
    },
    [
      caseInfosMap,
      markGroupAsDesignProduction,
      patientGroups,
      persistGroups,
      toFileKey,
      updateCaseInfos,
    ],
  );

  /** 파싱된 환자명 맵을 받아 자동 묶기 (업로드 직후용) */
  const autoGroupWithParsedNames = useCallback(
    (
      newFiles: File[],
      parsedPatientByFileKey: Record<string, string | undefined>,
      parsedClinicByFileKey?: Record<string, string | undefined>,
    ) => {
      if (!newFiles.length) return 0;

      const newFileKeys = newFiles.map((file) => toFileKey(file));
      const sizeByFileKey = buildSizeByFileKey(newFiles, toFileKey);
      const patientNameByFileKey: Record<string, string | undefined> = {
        ...Object.fromEntries(
          Object.keys(caseInfosMap || {}).map((k) => [
            k,
            caseInfosMap?.[k]?.patientName,
          ]),
        ),
        ...parsedPatientByFileKey,
      };

      let touchedCount = 0;
      let nextSnapshot: PatientFileGroup[] = [];
      let touchedSnapshot: PatientFileGroup[] = [];

      setPatientGroups((prev) => {
        const { groupsToCreate, groupsToUpdate } = planAutoGroupsForNewFiles({
          newFileKeys,
          patientNameByFileKey,
          existingGroups: prev,
          sizeByFileKey,
        });

        let next = prev.map((group) => {
          const updated = groupsToUpdate.find((g) => g.id === group.id);
          return updated || group;
        });
        if (groupsToCreate.length) {
          next = [...next, ...groupsToCreate];
        }

        const alreadyGrouped = new Set(next.flatMap((g) => g.fileKeys));
        const batchGroup = planBatchGroupIfAmbiguous({
          newFileKeys,
          patientNameByFileKey,
          alreadyGroupedKeys: alreadyGrouped,
          sizeByFileKey,
        });
        if (batchGroup) {
          next = [...next, batchGroup];
        }

        const touched = [
          ...groupsToCreate,
          ...groupsToUpdate,
          ...(batchGroup ? [batchGroup] : []),
        ];
        touchedCount = touched.length;
        touchedSnapshot = touched;
        nextSnapshot = next;
        if (!touched.length) return prev;

        savePatientGroups(next);
        return next;
      });

      if (touchedCount > 0) {
        for (const group of touchedSnapshot) {
          const latest = nextSnapshot.find((g) => g.id === group.id) || group;
          const patientHint =
            latest.fileKeys
              .map((k) =>
                String(
                  parsedPatientByFileKey[k] || patientNameByFileKey[k] || "",
                ).trim(),
              )
              .find(Boolean) || undefined;
          const clinicHint =
            latest.fileKeys
              .map((k) =>
                String(
                  parsedClinicByFileKey?.[k] ||
                    caseInfosMap?.[k]?.clinicName ||
                    "",
                ).trim(),
              )
              .find(Boolean) || undefined;

          for (const key of latest.fileKeys) {
            updateCaseInfos(key, {
              productMode: "design_custom_abutment",
              workType: "abutment",
              ...(clinicHint ? { clinicName: clinicHint } : {}),
              ...(patientHint ? { patientName: patientHint } : {}),
            });
          }
        }
      }

      // 크기별 productMode: 구강스캔→디자인+생산, 어벗디자인 STL→생산
      // (이미 환자 케이스에 묶인 키는 건너뛴다 — AI 재파싱에도 유지)
      const groupedKeys = new Set(nextSnapshot.flatMap((g) => g.fileKeys));
      for (const file of newFiles) {
        const key = toFileKey(file);
        if (groupedKeys.has(key)) continue;
        const patientHint =
          String(
            parsedPatientByFileKey[key] || patientNameByFileKey[key] || "",
          ).trim() || undefined;
        const clinicHint =
          String(
            parsedClinicByFileKey?.[key] ||
              caseInfosMap?.[key]?.clinicName ||
              "",
          ).trim() || undefined;
        const nameHints = {
          ...(clinicHint ? { clinicName: clinicHint } : {}),
          ...(patientHint ? { patientName: patientHint } : {}),
        };
        if (isLikelyOralScanSize(file.size)) {
          updateCaseInfos(key, {
            productMode: "design_custom_abutment",
            workType: "abutment",
            ...nameHints,
          });
        } else if (isLikelyCustomAbutDesignSize(file.size)) {
          updateCaseInfos(key, {
            productMode: "custom_abutment",
            workType: "abutment",
            ...nameHints,
          });
        }
      }

      return touchedCount;
    },
    [caseInfosMap, toFileKey, updateCaseInfos],
  );

  const groupSelectedFiles = useCallback(
    (fileKeys: string[]) => {
      const unique = Array.from(new Set(fileKeys.filter(Boolean)));
      if (unique.length < 2) return null;

      // 기존 그룹에서 해당 키 제거 후 새 그룹 생성
      let next = removeFileKeysFromGroups(patientGroups, unique);
      const group: PatientFileGroup = {
        id: createPatientGroupId(),
        fileKeys: unique,
      };
      next = [...next, group];
      persistGroups(next);

      // 새 묶음에 안 들어간 채 기존 묶음에서만 빠져나온 키(해체된 나머지) productMode 복원
      const stillGrouped = new Set(next.flatMap((g) => g.fileKeys));
      for (const prev of patientGroups) {
        for (const key of prev.fileKeys) {
          if (!stillGrouped.has(key)) {
            restoreProductModeAfterLeaveGroup(key);
          }
        }
      }

      markGroupAsDesignProduction(group);
      return group;
    },
    [
      markGroupAsDesignProduction,
      patientGroups,
      persistGroups,
      restoreProductModeAfterLeaveGroup,
    ],
  );

  const ungroup = useCallback(
    (groupId: string) => {
      const group = patientGroups.find((g) => g.id === groupId);
      persistGroups(patientGroups.filter((g) => g.id !== groupId));
      if (!group) return;
      for (const key of group.fileKeys) {
        restoreProductModeAfterLeaveGroup(key);
      }
    },
    [patientGroups, persistGroups, restoreProductModeAfterLeaveGroup],
  );

  const addFilesToGroup = useCallback(
    (groupId: string, fileKeys: string[]) => {
      const unique = Array.from(new Set(fileKeys.filter(Boolean)));
      if (!unique.length) return;
      let next = removeFileKeysFromGroups(patientGroups, unique);
      next = mergeFileKeysIntoGroup(next, groupId, unique);
      persistGroups(next);

      const stillGrouped = new Set(next.flatMap((g) => g.fileKeys));
      for (const prev of patientGroups) {
        for (const key of prev.fileKeys) {
          if (!stillGrouped.has(key)) {
            restoreProductModeAfterLeaveGroup(key);
          }
        }
      }

      const group = next.find((g) => g.id === groupId);
      if (group) markGroupAsDesignProduction(group);
    },
    [
      markGroupAsDesignProduction,
      patientGroups,
      persistGroups,
      restoreProductModeAfterLeaveGroup,
    ],
  );

  const removeFileFromGroups = useCallback(
    (fileKey: string) => {
      const next = removeFileKeysFromGroups(patientGroups, [fileKey]);
      persistGroups(next);

      // 분리된 키 + 그룹이 2개 미만이 되어 해체된 나머지 키도 productMode 복원
      const stillGrouped = new Set(next.flatMap((g) => g.fileKeys));
      const leftKeys = new Set<string>([fileKey]);
      for (const group of patientGroups) {
        for (const key of group.fileKeys) {
          if (!stillGrouped.has(key)) leftKeys.add(key);
        }
      }
      for (const key of leftKeys) {
        restoreProductModeAfterLeaveGroup(key);
      }
    },
    [patientGroups, persistGroups, restoreProductModeAfterLeaveGroup],
  );

  const clearGroups = useCallback(() => {
    persistGroups([]);
  }, [persistGroups]);

  const getGroupForFileKey = useCallback(
    (fileKey: string) => findGroupByFileKey(patientGroups, fileKey),
    [patientGroups],
  );

  const updateGroupCaseInfos = useCallback(
    (groupId: string, updates: Partial<CaseInfos>) => {
      const group = patientGroups.find((g) => g.id === groupId);
      if (!group) return;
      syncGroupCaseInfos(group, updates);
    },
    [patientGroups, syncGroupCaseInfos],
  );

  return {
    patientGroups,
    listItems,
    fileKeyToGroupId,
    autoGroupNewFiles,
    autoGroupWithParsedNames,
    groupSelectedFiles,
    ungroup,
    addFilesToGroup,
    removeFileFromGroups,
    clearGroups,
    getGroupForFileKey,
    updateGroupCaseInfos,
    getPrimaryFileKey,
  };
}

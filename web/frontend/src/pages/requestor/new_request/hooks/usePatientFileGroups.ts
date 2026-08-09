// change-log:
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
  mergeFileKeysIntoGroup,
  planAutoGroupsForNewFiles,
  planBatchGroupIfAmbiguous,
  removeFileKeysFromGroups,
  type PatientFileGroup,
} from "../utils/patientGroups";

type Params = {
  files: File[];
  toFileKey: (file: File) => string;
  caseInfosMap?: Record<string, CaseInfos>;
  updateCaseInfos: (fileKey: string, updates: Partial<CaseInfos>) => void;
};

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

  const autoGroupNewFiles = useCallback(
    (newFiles: File[]) => {
      if (!newFiles.length) return;

      const newFileKeys = newFiles.map((file) => toFileKey(file));
      const patientNameByFileKey: Record<string, string | undefined> = {};
      for (const key of newFileKeys) {
        patientNameByFileKey[key] = caseInfosMap?.[key]?.patientName;
      }
      // caseInfosMap이 아직 반영되기 전일 수 있어, 호출 측에서 파싱값을 넘기지 않으면
      // 기존 map + 빈 값으로 동작한다. 페이지에서 파싱 직후 호출하도록 한다.

      const { groupsToCreate, groupsToUpdate } = planAutoGroupsForNewFiles({
        newFileKeys,
        patientNameByFileKey: {
          ...Object.fromEntries(
            patientGroups.flatMap((g) =>
              g.fileKeys.map((k) => [k, caseInfosMap?.[k]?.patientName]),
            ),
          ),
          ...patientNameByFileKey,
        },
        existingGroups: patientGroups,
      });

      let next = patientGroups.map((group) => {
        const updated = groupsToUpdate.find((g) => g.id === group.id);
        return updated || group;
      });
      if (groupsToCreate.length) {
        next = [...next, ...groupsToCreate];
      }

      const alreadyGrouped = new Set(
        next.flatMap((g) => g.fileKeys),
      );
      const batchGroup = planBatchGroupIfAmbiguous({
        newFileKeys,
        patientNameByFileKey: {
          ...Object.fromEntries(
            Object.keys(caseInfosMap || {}).map((k) => [
              k,
              caseInfosMap?.[k]?.patientName,
            ]),
          ),
          ...patientNameByFileKey,
        },
        alreadyGroupedKeys: alreadyGrouped,
      });
      if (batchGroup) {
        next = [...next, batchGroup];
      }

      if (next === patientGroups) return;
      const changed =
        next.length !== patientGroups.length ||
        next.some(
          (g, i) =>
            g.id !== patientGroups[i]?.id ||
            g.fileKeys.join("|") !== patientGroups[i]?.fileKeys.join("|"),
        );
      if (!changed) return;

      persistGroups(next);

      for (const group of [...groupsToCreate, ...groupsToUpdate, ...(batchGroup ? [batchGroup] : [])]) {
        const latest = next.find((g) => g.id === group.id) || group;
        const patientHint =
          latest.fileKeys
            .map((k) => String(patientNameByFileKey[k] || caseInfosMap?.[k]?.patientName || "").trim())
            .find(Boolean) || undefined;
        markGroupAsDesignProduction(latest, patientHint);
      }
    },
    [
      caseInfosMap,
      markGroupAsDesignProduction,
      patientGroups,
      persistGroups,
      toFileKey,
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
      let nextSnapshot: PatientFileGroup[] | null = null;
      let touchedSnapshot: PatientFileGroup[] = [];

      setPatientGroups((prev) => {
        const { groupsToCreate, groupsToUpdate } = planAutoGroupsForNewFiles({
          newFileKeys,
          patientNameByFileKey,
          existingGroups: prev,
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
        if (!touched.length) return prev;

        touchedSnapshot = touched;
        nextSnapshot = next;
        savePatientGroups(next);
        return next;
      });

      if (touchedCount > 0 && nextSnapshot) {
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
      markGroupAsDesignProduction(group);
      return group;
    },
    [markGroupAsDesignProduction, patientGroups, persistGroups],
  );

  const ungroup = useCallback(
    (groupId: string) => {
      persistGroups(patientGroups.filter((g) => g.id !== groupId));
    },
    [patientGroups, persistGroups],
  );

  const addFilesToGroup = useCallback(
    (groupId: string, fileKeys: string[]) => {
      const unique = Array.from(new Set(fileKeys.filter(Boolean)));
      if (!unique.length) return;
      let next = removeFileKeysFromGroups(patientGroups, unique);
      next = mergeFileKeysIntoGroup(next, groupId, unique);
      persistGroups(next);
      const group = next.find((g) => g.id === groupId);
      if (group) markGroupAsDesignProduction(group);
    },
    [markGroupAsDesignProduction, patientGroups, persistGroups],
  );

  const removeFileFromGroups = useCallback(
    (fileKey: string) => {
      persistGroups(removeFileKeysFromGroups(patientGroups, [fileKey]));
    },
    [patientGroups, persistGroups],
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

// 「폴더 열기」 저장 흐름: 작업 폴더 고르기·연결 프로그램 설치·저장 완료 토스트.
// 기공소 수신과 치과 발신이 같이 쓴다.
// related files:
// - web/frontend/src/shared/files/useS3FileDownload.ts
// - web/frontend/src/shared/components/LabWorkFolderDialog.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
import { useCallback, useRef, useState } from "react";

import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/shared/hooks/use-toast";
import {
  LabWorkFolderDialog,
  type LabWorkFolderDialogReason,
} from "@/shared/components/LabWorkFolderDialog";
import { LabHelperInstallDialog } from "@/shared/components/LabHelperInstallDialog";
import { supportsLabHelper } from "@/shared/files/labHelperClient";
import type {
  LabWorkFolderMode,
  LabWorkFolderPick,
  LabWorkFolderResolver,
  LabWorkFolderSaveResult,
} from "@/shared/files/useS3FileDownload";

export function useLabWorkFolderSave(opts?: {
  /** 케이스 폴더 이름 안내의 상대방 자리(기공소=치과명, 치과=기공소명) */
  counterpartLabel?: string;
}) {
  const { toast } = useToast();
  const [folderDialog, setFolderDialog] = useState<{
    open: boolean;
    reason: LabWorkFolderDialogReason;
    mode: LabWorkFolderMode;
  }>({ open: false, reason: "missing", mode: "browser" });
  const folderResolveRef = useRef<
    null | ((pick: LabWorkFolderPick | null) => void)
  >(null);
  const [helperInstallOpen, setHelperInstallOpen] = useState(false);
  const helperInstallResolveRef = useRef<null | ((connected: boolean) => void)>(null);
  const lastModeRef = useRef<LabWorkFolderMode>("browser");

  const requestWorkFolder = useCallback<LabWorkFolderResolver>(
    ({ reason, mode }) =>
      new Promise<LabWorkFolderPick | null>((resolve) => {
        folderResolveRef.current?.(null);
        folderResolveRef.current = resolve;
        setFolderDialog({ open: true, reason, mode });
      }),
    [],
  );

  const settleWorkFolder = useCallback(
    (pick: LabWorkFolderPick | null) => {
      const resolve = folderResolveRef.current;
      folderResolveRef.current = null;
      setFolderDialog((prev) => ({ ...prev, open: false }));
      if (resolve) {
        resolve(pick);
      } else if (pick) {
        toast({
          title: "작업 폴더를 바꿨습니다",
          description: pick.kind === "helper" ? pick.path : pick.handle.name,
        });
      }
    },
    [toast],
  );

  const openChangeWorkFolder = useCallback(() => {
    folderResolveRef.current = null;
    setFolderDialog({ open: true, reason: "change", mode: lastModeRef.current });
  }, []);

  const requestHelperInstall = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        helperInstallResolveRef.current?.(false);
        helperInstallResolveRef.current = resolve;
        setHelperInstallOpen(true);
      }),
    [],
  );

  const settleHelperInstall = useCallback((connected: boolean) => {
    const resolve = helperInstallResolveRef.current;
    helperInstallResolveRef.current = null;
    setHelperInstallOpen(false);
    resolve?.(connected);
  }, []);

  const toastSaved = useCallback(
    ({ mode, folder, count, revealed }: LabWorkFolderSaveResult) => {
      if (mode !== "zip") {
        lastModeRef.current = mode === "helper" ? "helper" : "browser";
      }
      const installAction = supportsLabHelper() ? (
        <ToastAction altText="폴더 자동 열기" onClick={() => void requestHelperInstall()}>
          폴더 자동 열기
        </ToastAction>
      ) : undefined;
      if (mode === "zip") {
        toast({
          title: `${count}개 파일을 zip으로 받았습니다`,
          description: (
            <>
              {folder}
              <br />
              작업 폴더에 풀면 케이스 폴더가 생깁니다.
              <br />
              「폴더 자동 열기」를 설치하면 풀지 않고 바로 저장합니다.
            </>
          ),
          action: installAction,
        });
        return;
      }
      const title =
        count === 0
          ? revealed
            ? "이미 받은 케이스입니다. 폴더를 열었습니다"
            : "이미 받은 케이스입니다"
          : revealed
            ? `작업 폴더에 ${count}개 저장하고 폴더를 열었습니다`
            : `작업 폴더에 ${count}개 저장했습니다`;
      toast({
        title,
        description: folder,
        action: mode === "folder" && installAction ? (
          installAction
        ) : (
          <ToastAction altText="작업 폴더 변경" onClick={openChangeWorkFolder}>
            폴더 변경
          </ToastAction>
        ),
      });
    },
    [openChangeWorkFolder, requestHelperInstall, toast],
  );

  const dialogs = (
    <>
      <LabWorkFolderDialog
        open={folderDialog.open}
        reason={folderDialog.reason}
        mode={folderDialog.mode}
        counterpartLabel={opts?.counterpartLabel}
        onSubmit={(pick) => settleWorkFolder(pick)}
        onCancel={() => settleWorkFolder(null)}
      />
      <LabHelperInstallDialog open={helperInstallOpen} onResolved={settleHelperInstall} />
    </>
  );

  return { requestWorkFolder, requestHelperInstall, toastSaved, dialogs };
}

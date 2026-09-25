// 치과가 의뢰 파일을 올리기 전에 스캔 역할을 확인한다.
// 파일명으로 제안하고, 치과가 상악·하악·바이트·그 외를 확정한다.
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ORAL_SCAN_ROLE_OPTIONS,
  classifyOralScanFileName,
  oralScanRoleLabel,
  type LabOralScanRole,
} from "@/shared/practice/labProsthesisAiDesign";

export type OralScanRoleConfirmFile = {
  key: string;
  fileName: string;
};

type OralScanRoleConfirmDialogProps = {
  open: boolean;
  files: OralScanRoleConfirmFile[];
  onConfirm: (roles: Record<string, LabOralScanRole>) => void;
  onCancel: () => void;
};

export function OralScanRoleConfirmDialog({
  open,
  files,
  onConfirm,
  onCancel,
}: OralScanRoleConfirmDialogProps) {
  const [roles, setRoles] = useState<Record<string, LabOralScanRole>>({});

  const signature = files.map((file) => `${file.key}:${file.fileName}`).join("|");
  const initializedSignature = useRef("");

  useEffect(() => {
    if (!open) {
      initializedSignature.current = "";
      return;
    }
    if (initializedSignature.current === signature) return;
    initializedSignature.current = signature;
    const next: Record<string, LabOralScanRole> = {};
    for (const file of files) {
      next[file.key] = classifyOralScanFileName(file.fileName);
    }
    setRoles(next);
  }, [files, open, signature]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent
        className="z-[385] gap-0 overflow-hidden p-0 sm:max-w-md"
        overlayClassName="z-[380]"
      >
        <DialogHeader className="space-y-1 border-b bg-slate-50 px-5 py-4 text-left">
          <DialogTitle className="text-base">스캔 역할 확인</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed text-muted-foreground">
            파일명으로 상악·하악·바이트를 제안했습니다.
            <br />
            확인한 값이 의뢰 파일에 남습니다.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-[min(50vh,22rem)] space-y-2 overflow-y-auto px-5 py-4">
          {files.map((file) => (
            <li key={file.key} className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-xs text-foreground" title={file.fileName}>
                {file.fileName}
              </span>
              <select
                className="h-8 shrink-0 rounded-md border bg-white px-2 text-xs"
                aria-label={`${file.fileName} 스캔 역할`}
                value={roles[file.key] || "other"}
                onChange={(event) => {
                  const role = event.target.value as LabOralScanRole;
                  setRoles((prev) => ({ ...prev, [file.key]: role }));
                }}
              >
                {ORAL_SCAN_ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {oralScanRoleLabel(role)}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
        <DialogFooter className="border-t px-5 py-3">
          <Button type="button" variant="outline" onClick={onCancel}>
            취소
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm(roles)}
            disabled={files.some((file) => !roles[file.key])}
          >
            이 역할로 진행
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

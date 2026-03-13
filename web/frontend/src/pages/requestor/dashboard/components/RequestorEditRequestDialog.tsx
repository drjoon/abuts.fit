import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { formatDateWithDay } from "@/utils/dateFormat";

export type EditingRequestState = {
  id: string;
  requestId?: string;
  createdAt?: string;
  estimatedShipYmd?: string;
  title?: string;
  description?: string;
  clinicName?: string;
  patientName?: string;
  teethText?: string;
  implantManufacturer?: string;
  implantBrand?: string;
  implantFamily?: string;
  implantType?: string;
} | null;

type RequestorEditRequestDialogProps = {
  editingRequest: EditingRequestState;
  editingDescription: string;
  editingClinicName: string;
  editingPatientName: string;
  editingTeethText: string;
  editingImplantManufacturer: string;
  editingImplantBrand: string;
  editingImplantFamily: string;
  editingImplantType: string;
  onChangeDescription: (value: string) => void;
  onChangeClinicName: (value: string) => void;
  onChangePatientName: (value: string) => void;
  onChangeTeethText: (value: string) => void;
  onChangeImplantManufacturer: (value: string) => void;
  onChangeImplantBrand: (value: string) => void;
  onChangeImplantFamily: (value: string) => void;
  onChangeImplantType: (value: string) => void;
  onClose: () => void;
  onSave: () => void | Promise<void>;
};

export const RequestorEditRequestDialog = ({
  editingRequest,
  editingDescription,
  editingClinicName,
  editingPatientName,
  editingTeethText,
  editingImplantManufacturer,
  editingImplantBrand,
  editingImplantFamily,
  editingImplantType,
  onChangeDescription,
  onChangeClinicName,
  onChangePatientName,
  onChangeTeethText,
  onChangeImplantManufacturer,
  onChangeImplantBrand,
  onChangeImplantFamily,
  onChangeImplantType,
  onClose,
  onSave,
}: RequestorEditRequestDialogProps) => {
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedKeyRef = useRef<string>("");
  const onSaveRef = useRef<(() => void | Promise<void>) | null>(null);

  onSaveRef.current = onSave;

  const computeKey = useCallback(() => {
    return JSON.stringify({
      id: editingRequest?.id || "",
      clinicName: editingClinicName,
      patientName: editingPatientName,
      teethText: editingTeethText,
      implantManufacturer: editingImplantManufacturer,
      implantBrand: editingImplantBrand,
      implantFamily: editingImplantFamily,
      implantType: editingImplantType,
      description: editingDescription,
    });
  }, [
    editingClinicName,
    editingDescription,
    editingImplantManufacturer,
    editingImplantFamily,
    editingImplantType,
    editingPatientName,
    editingRequest?.id,
    editingTeethText,
    editingImplantBrand,
  ]);

  useEffect(() => {
    if (!editingRequest?.id) return;
    lastSavedKeyRef.current = computeKey();
  }, [computeKey, editingRequest?.id]);

  const scheduleSave = useCallback(() => {
    if (!editingRequest?.id) return;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      const fn = onSaveRef.current;
      if (fn) {
        void fn();
        lastSavedKeyRef.current = computeKey();
      }
    }, 300);
  }, [computeKey, editingRequest?.id]);

  const maybeSave = useCallback(() => {
    if (!editingRequest?.id) return;
    const nextKey = computeKey();
    if (nextKey !== lastSavedKeyRef.current) {
      scheduleSave();
    }
  }, [computeKey, editingRequest?.id, scheduleSave]);

  return (
    <Dialog
      open={!!editingRequest}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>의뢰 정보 수정</DialogTitle>
        </DialogHeader>
        <div className="mt-2 text-md text-muted-foreground">
          <div className="mb-4 p-3 bg-muted rounded-md space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="font-medium">의뢰번호:</span>
              <span>{editingRequest?.requestId || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">의뢰일:</span>
              <span>{formatDateWithDay(editingRequest?.createdAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">발송 예정일:</span>
              <span>{formatDateWithDay(editingRequest?.estimatedShipYmd)}</span>
            </div>
          </div>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-md font-medium text-muted-foreground">
                  치과 이름
                </label>
                <input
                  type="text"
                  value={editingClinicName}
                  onChange={(e) => onChangeClinicName(e.target.value)}
                  onBlur={maybeSave}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1"
                  placeholder="예: OO치과"
                />
              </div>
              <div className="space-y-1">
                <label className="text-md font-medium text-muted-foreground">
                  환자 이름
                </label>
                <input
                  type="text"
                  value={editingPatientName}
                  onChange={(e) => onChangePatientName(e.target.value)}
                  onBlur={maybeSave}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1"
                  placeholder="예: 홍길동"
                />
              </div>
              <div className="space-y-1">
                <label className="text-md font-medium text-muted-foreground">
                  치아번호
                </label>
                <input
                  type="text"
                  value={editingTeethText}
                  onChange={(e) => onChangeTeethText(e.target.value)}
                  onBlur={maybeSave}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1"
                  placeholder="예: 21, 22"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <label className="text-md font-medium text-muted-foreground">
                  Manufacturer
                </label>
                <input
                  type="text"
                  value={editingImplantManufacturer}
                  onChange={(e) => onChangeImplantManufacturer(e.target.value)}
                  onBlur={maybeSave}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1"
                  placeholder="예: OSSTEM"
                />
              </div>
              <div className="space-y-1">
                <label className="text-md font-medium text-muted-foreground">
                  Brand
                </label>
                <input
                  type="text"
                  value={editingImplantBrand}
                  onChange={(e) => onChangeImplantBrand(e.target.value)}
                  onBlur={maybeSave}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1"
                  placeholder="예: SQ"
                />
              </div>
              <div className="space-y-1">
                <label className="text-md font-medium text-muted-foreground">
                  Family
                </label>
                <input
                  type="text"
                  value={editingImplantFamily}
                  onChange={(e) => onChangeImplantFamily(e.target.value)}
                  onBlur={maybeSave}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1"
                  placeholder="예: Regular"
                />
              </div>
              <div className="space-y-1">
                <label className="text-md font-medium text-muted-foreground">
                  Type
                </label>
                <input
                  type="text"
                  value={editingImplantType}
                  onChange={(e) => onChangeImplantType(e.target.value)}
                  onBlur={maybeSave}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1"
                  placeholder="예: Hex"
                />
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              닫기
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

import { useCallback, useEffect, useMemo, useState } from "react";
import { StlPreviewViewer } from "@/features/requests/components/StlPreviewViewer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CircleHelp } from "lucide-react";
import type { CaseInfos, Connection } from "../hooks/newRequestTypes";
import { NewRequestPatientImplantFields } from "./NewRequestPatientImplantFields";

type ToastFn = (props: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: string;
  duration?: number;
}) => void;

type Option = { id: string; label: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detailIndex: number | null;
  selectedPreviewIndex: number | null;
  files: File[];
  detailFile: File | null;
  detailCaseInfos?: CaseInfos;
  setDetailCaseInfos: (updates: Partial<CaseInfos>) => void;
  handleDiameterComputed: (
    filename: string,
    maxDiameter: number,
    connectionDiameter: number,
    totalLength: number,
    taperAngle: number,
    tiltAxisVector?: { x: number; y: number; z: number } | null,
    frontPoint?: { x: number; y: number; z: number } | null,
  ) => void;
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
  highlightUnverifiedArrows: boolean;
  handleRemoveFile: (index: number) => void;
  onVerifyAndNext: (index: number) => Promise<void>;
  onSkip: () => void;
  toast: ToastFn;
};

export function NewRequestDetailDialog({
  open,
  onOpenChange,
  detailIndex,
  selectedPreviewIndex,
  files,
  detailFile,
  detailCaseInfos,
  setDetailCaseInfos,
  handleDiameterComputed,
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
  highlightUnverifiedArrows,
  handleRemoveFile,
  onVerifyAndNext,
  onSkip,
  toast,
}: Props) {
  const [showNewSystemForm, setShowNewSystemForm] = useState(false);
  const [newSystemManufacturer, setNewSystemManufacturer] = useState("");
  const [newSystemBrand, setNewSystemBrand] = useState("");
  const [newSystemFamily, setNewSystemFamily] = useState("");
  const [confirmNewSystemOpen, setConfirmNewSystemOpen] = useState(false);
  const [pendingNewSystem, setPendingNewSystem] = useState<{
    manufacturer: string;
    brand: string;
    family: string;
  } | null>(null);

  const newSystemInfoCopy = useMemo(
    () =>
      "개발을 위해 랩 아날로그와 기성 어벗먼트 샘플을 보내주세요. 무료 크레딧을 충전해드립니다.",
    [],
  );

  const resetNewSystemForm = useCallback(() => {
    setShowNewSystemForm(false);
    setNewSystemManufacturer("");
    setNewSystemBrand("");
    setNewSystemFamily("");
    setDetailCaseInfos({ newSystemRequest: undefined });
  }, [setDetailCaseInfos]);

  const handleNewSystemRequestClick = useCallback(() => {
    const manufacturer = newSystemManufacturer.trim();
    const brand = newSystemBrand.trim();
    const family = newSystemFamily.trim();

    if (!manufacturer || !brand || !family) {
      toast({
        title: "신규 임플란트 입력 필요",
        description: "Manufacturer, Brand, Family를 모두 입력해주세요.",
        variant: "destructive",
        duration: 4000,
      });
      return;
    }

    setPendingNewSystem({ manufacturer, brand, family });
    setConfirmNewSystemOpen(true);
  }, [newSystemBrand, newSystemFamily, newSystemManufacturer, toast]);

  const persistedNewSystemRequest = detailCaseInfos?.newSystemRequest;

  useEffect(() => {
    if (persistedNewSystemRequest?.requested) {
      setShowNewSystemForm(true);
      setNewSystemManufacturer(persistedNewSystemRequest.manufacturer || "");
      setNewSystemBrand(persistedNewSystemRequest.brand || "");
      setNewSystemFamily(persistedNewSystemRequest.family || "");
    }
  }, [persistedNewSystemRequest]);

  const showImplantSelect = true;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-[1180px] lg:w-[980px] max-w-[calc(100vw-1rem)] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">STL 확인 및 정보 입력</DialogTitle>
            <DialogDescription className="sr-only">
              STL 모델을 확인하고 환자/임플란트 정보를 입력한 뒤 다음 케이스로 이동합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-[52%_48%] gap-4 items-stretch sm:pr-2">
            <div className="app-glass-card app-glass-card--lg h-full flex flex-col">
              <div className="app-glass-card-content flex-1">
                {detailFile ? (
                  <StlPreviewViewer
                    file={detailFile}
                    showOverlay={false}
                    className="min-h-[240px] h-full"
                    onDiameterComputed={handleDiameterComputed}
                  />
                ) : (
                  <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                    STL Preview
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3 h-full">
              <div className="app-glass-card app-glass-card--lg h-full flex flex-col">
                <div className="app-glass-card-content space-y-3 text-sm flex-1 flex flex-col">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    임플란트/환자 정보
                  </div>

                  <NewRequestPatientImplantFields
                    caseInfos={detailCaseInfos}
                    setCaseInfos={setDetailCaseInfos}
                    showImplantSelect={showImplantSelect}
                    readOnly={!detailFile}
                    implantSelectSource="caseInfos"
                    connections={connections}
                    familyOptions={familyOptions}
                    typeOptions={typeOptions}
                    implantManufacturer={implantManufacturer}
                    setImplantManufacturer={setImplantManufacturer}
                    implantBrand={implantBrand}
                    setImplantBrand={setImplantBrand}
                    implantFamily={implantFamily}
                    setImplantFamily={setImplantFamily}
                    implantType={implantType}
                    setImplantType={setImplantType}
                    syncSelectedConnection={syncSelectedConnection}
                    clinicNameOptions={clinicNameOptions}
                    patientNameOptions={patientNameOptions}
                    teethOptions={teethOptions}
                    addClinicPreset={addClinicPreset}
                    clearAllClinicPresets={clearAllClinicPresets}
                    addPatientPreset={addPatientPreset}
                    clearAllPatientPresets={clearAllPatientPresets}
                    addTeethPreset={addTeethPreset}
                    clearAllTeethPresets={clearAllTeethPresets}
                    handleAddOrSelectClinic={handleAddOrSelectClinic}
                  />

                  <div className="flex flex-row items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <div className="text-sm font-semibold text-slate-600">유지홈</div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex items-center justify-center text-slate-400 hover:text-blue-600 transition-colors"
                            aria-label="유지홈 옵션 가이드"
                          >
                            <CircleHelp className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent
                          side="bottom"
                          align="center"
                          alignOffset={-220}
                          collisionPadding={20}
                          className="w-[700px] max-w-[calc(100vw-3rem)] p-4"
                        >
                          <div className="mb-2 text-xs font-semibold text-slate-600">유지홈 옵션 예시</div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="rounded-md border border-slate-200 bg-white p-2.5">
                              <img
                                src="/images/new-request/retention-groove-none.jpeg"
                                alt="유지홈 없음"
                                className="h-52 w-full rounded-md border border-slate-200 bg-slate-50 p-1 object-cover object-top"
                              />
                              <span className="mt-1.5 block text-center text-xs font-medium text-slate-600">없음</span>
                            </div>
                            <div className="rounded-md border border-slate-200 bg-white p-2.5">
                              <img
                                src="/images/new-request/retention-groove-exist.jpeg"
                                alt="유지홈 있음"
                                className="h-52 w-full rounded-md border border-slate-200 bg-slate-50 p-1 object-cover object-top"
                              />
                              <span className="mt-1.5 block text-center text-xs font-medium text-slate-600">있음</span>
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    <RadioGroup
                      value={detailCaseInfos?.retentionGroove === "deep" ? "deep" : "none"}
                      onValueChange={(value) =>
                        setDetailCaseInfos({ retentionGroove: value as "none" | "deep" })
                      }
                      className="flex items-center gap-10"
                      disabled={!detailFile}
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="none" id="rg-none" className="border-slate-300 text-blue-600" />
                        <Label htmlFor="rg-none" className="text-sm text-slate-700 cursor-pointer">
                          없음
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="deep" id="rg-deep" className="border-slate-300 text-blue-600" />
                        <Label htmlFor="rg-deep" className="text-sm text-slate-700 cursor-pointer">
                          있음
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div className="flex flex-col gap-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-700">찾으시는 임플란트가 없나요?</span>
                      {!showNewSystemForm ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="bg-white text-blue-700 border-blue-200 hover:bg-blue-50"
                          onClick={() => setShowNewSystemForm(true)}
                        >
                          신규 임플란트 요청
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button type="button" size="sm" onClick={handleNewSystemRequestClick}>
                            요청
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={resetNewSystemForm}>
                            취소
                          </Button>
                        </div>
                      )}
                    </div>

                    {showNewSystemForm && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <Input
                          placeholder="Manufacturer"
                          value={newSystemManufacturer}
                          onChange={(e) => setNewSystemManufacturer(e.target.value)}
                        />
                        <Input
                          placeholder="Brand"
                          value={newSystemBrand}
                          onChange={(e) => setNewSystemBrand(e.target.value)}
                        />
                        <Input
                          placeholder="Family"
                          value={newSystemFamily}
                          onChange={(e) => setNewSystemFamily(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-4">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => {
                        if (detailIndex !== null) {
                          handleRemoveFile(detailIndex);
                        }
                        onOpenChange(false);
                      }}
                    >
                      삭제
                    </Button>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                      취소
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      className={highlightUnverifiedArrows ? "animate-bounce bg-primary text-white" : undefined}
                      onClick={() => {
                        if (detailIndex !== null) {
                          void onVerifyAndNext(detailIndex);
                        }
                      }}
                    >
                      확인 & 다음
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-slate-500"
                      onClick={onSkip}
                      disabled={!files.length}
                    >
                      건너뛰기
                    </Button>
                  </div>
                </DialogFooter>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmNewSystemOpen}
        onOpenChange={(next) => {
          if (!next) {
            setConfirmNewSystemOpen(false);
            setPendingNewSystem(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>신규 임플란트 의뢰로 접수할까요?</AlertDialogTitle>
            <AlertDialogDescription>{newSystemInfoCopy}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setConfirmNewSystemOpen(false);
                setPendingNewSystem(null);
              }}
            >
              취소
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!pendingNewSystem) return;
                const { manufacturer, brand, family } = pendingNewSystem;
                const message = "랩 아날로그 샘플 한 개를 요청드립니다";

                setDetailCaseInfos({
                  implantManufacturer: manufacturer,
                  implantBrand: brand,
                  implantFamily: family,
                  newSystemRequest: {
                    requested: true,
                    manufacturer,
                    brand,
                    family,
                    message,
                    free: true,
                    tag: "신규 임플란트 의뢰",
                  },
                });

                toast({
                  title: "신규 임플란트로 접수",
                  description: "무상 처리 및 랩 아날로그 샘플 요청으로 전달됩니다.",
                  duration: 3500,
                });

                setShowNewSystemForm(false);
                setConfirmNewSystemOpen(false);
                setPendingNewSystem(null);

                const nextIndex = detailIndex ?? selectedPreviewIndex;
                if (nextIndex !== null && nextIndex >= 0) {
                  await onVerifyAndNext(nextIndex);
                }
              }}
            >
              확인
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

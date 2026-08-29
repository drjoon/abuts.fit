// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/backend/controllers/requests/common.review.controller.js
export type QueueItem = {
  requestMongoId?: string | null;
  requestId?: string;
  status?: string;
  queuePosition?: number;
  machiningQty?: number;
  rollbackCount?: number;
  estimatedShipYmd?: string | null;
  scheduledShipPickup?: string | Date;
  diameter?: number;
  diameterGroup?: string;
  caseInfos?: Record<string, any> | null;
  rnd?: {
    manufacturerHexRotation?: string | null;
  } | null;
  shippingMode?: string | null;
  finalShipping?: { mode?: string | null } | null;
  originalShipping?: { mode?: string | null } | null;
  productionSchedule?: Record<string, any> | null;
  paused?: boolean;
  machiningRecord?: {
    status?: string;
    startedAt?: string | Date;
    completedAt?: string | Date;
    durationSeconds?: number;
    elapsedSeconds?: number;
  } | null;
  ncFile?: {
    fileName?: string;
    filePath?: string;
    s3Key?: string;
    s3Bucket?: string;
  } | null;
  ncPreload?: {
    status?: "NONE" | "UPLOADING" | "READY" | "FAILED" | string;
    machineId?: string;
    updatedAt?: string | Date;
    error?: string;
  } | null;
  clinicName?: string;
  patientName?: string;
  tooth?: string;
  businessName?: string;
  lotNumber?: {
    material?: string;
    value?: string;
  } | null;
  source?: string | null;
  requestCategory?: "order" | "rnd_sample" | "copied_sample" | string | null;
  totalLength?: number | null;
  fastMachiningRebalance?: {
    at?: string | Date;
    fromMachineId?: string;
    toMachineId?: string;
    fromDiameter?: number | null;
    toDiameter?: number | null;
    reason?: string;
  } | null;
};

export type QueueMap = Record<string, QueueItem[]>;

export type MachineStatus = {
  uid: string;
  status?: string;
  currentProgram?: string;
  nextProgram?: string;
};

export type LastCompletedMachining = {
  machineId: string;
  jobId: string | null;
  requestId: string | null;
  requestMongoId?: string | null;
  displayLabel: string | null;
  requestCategory?: "order" | "rnd_sample" | "copied_sample" | string | null;
  caseInfos?: Record<string, any> | null;
  shippingMode?: string | null;
  finalShipping?: { mode?: string | null } | null;
  originalShipping?: { mode?: string | null } | null;
  source?: string | null;
  clinicName?: string;
  patientName?: string;
  tooth?: string;
  businessName?: string;
  rollbackCount?: number;
  estimatedShipYmd?: string | null;
  lotNumber?: {
    value?: string;
  } | null;
  completedAt: string;
  durationSeconds: number;
};

export type NowPlayingHint = {
  machineId: string;
  jobId: string | null;
  requestId: string | null;
  bridgePath: string | null;
  startedAt: string;
};

export type MachineActionLevel =
  | "ok"
  | "warn"
  | "alarm"
  | "unknown"
  | "disabled";

export type MachineQueueCardProps = {
  machineId: string;
  machineName?: string;
  machine?: any;
  queue: QueueItem[];
  onOpenRequestLog?: (requestId: string) => void;
  onUploadFiles?: (files: FileList | File[]) => void;
  autoEnabled: boolean;
  machiningActive?: boolean;
  onToggleAuto: (next: boolean) => void;
  onToggleRequestAssign?: (next: boolean) => void;
  machineStatus?: MachineStatus | null;
  statusRefreshing?: boolean;
  onOpenReservation: () => void;
  onOpenProgramCode?: (prog: any, machineId: string) => void;
  machiningElapsedSeconds?: number | null;
  lastCompleted?: LastCompletedMachining | null;
  nowPlayingHint?: NowPlayingHint | null;
  onOpenCompleted?: (machineId: string, machineName?: string) => void;
  onOpenMaterial?: () => void;
  onOpenMachineInfo?: () => void;
  onOpenQueueManager?: () => void;
  onOpenTemperature?: () => void;
  onOpenToolStatus?: () => void;
  onOpenSettings?: () => void;
  tempHealth?: MachineActionLevel;
  toolHealth?: MachineActionLevel;
  tempTooltip?: string;
  toolTooltip?: string;
  isActive?: boolean;
  onSelect?: () => void;
  // Now Playing/Next Up 에서 직접 준비 단계로 되돌리기(생산 큐에서 제거) 콜백
  onRollbackNowPlaying?: (requestId: string, machineId: string) => void;
  onRollbackNextUp?: (requestId: string, machineId: string) => void;
  onRollbackCompleted?: (requestId: string, machineId: string) => void;
  onApproveFromRollback?: (requestId: string) => void;
  /** Next Up 의뢰를 다른 장비로 드래그 이동 */
  onMoveNextUpToMachine?: (params: {
    requestMongoId: string;
    requestId?: string;
    fromMachineId: string;
    toMachineId: string;
  }) => void | Promise<void>;
  /** Next Up CAM 생성 중단 */
  onCancelCamGeneration?: (requestId: string) => void | Promise<void>;
  cancellingCamRequestIds?: ReadonlySet<string> | string[];
  materialNeedsReplacement?: boolean;
  materialAlertTooltip?: string;
};

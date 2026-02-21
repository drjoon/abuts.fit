export type QueueItem = {
  requestId?: string;
  status?: string;
  queuePosition?: number;
  machiningQty?: number;
  estimatedShipYmd?: string | null;
  scheduledShipPickup?: string | Date;
  diameter?: number;
  diameterGroup?: string;
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
  lotNumber?: {
    part?: string;
    material?: string;
    final?: string;
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
  displayLabel: string | null;
  clinicName?: string;
  patientName?: string;
  tooth?: string;
  lotNumber?: {
    part?: string;
    final?: string;
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

export type MachineQueueCardProps = {
  machineId: string;
  machineName?: string;
  machine?: any;
  queue: QueueItem[];
  onOpenRequestLog?: (requestId: string) => void;
  autoEnabled: boolean;
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
  isActive?: boolean;
  onSelect?: () => void;
  // Now Playing/Next Up 에서 직접 CAM 단계로 되돌리기(생산 큐에서 제거) 콜백
  onRollbackNowPlaying?: (requestId: string, machineId: string) => void;
  onRollbackNextUp?: (requestId: string, machineId: string) => void;
};

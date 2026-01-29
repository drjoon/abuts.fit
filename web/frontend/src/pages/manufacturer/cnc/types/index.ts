export interface Machine {
  uid: string; // 장비 식별자(Hi-Link UID와 통합)
  name: string; // 표시용 장비 이름
  serial?: string;
  ip?: string;
  port?: number;
  status: string;
  lastUpdated?: string;
  lastCommand?: string;
  lastError?: string | null;
  allowJobStart?: boolean;
  allowProgramDelete?: boolean;
  allowAutoMachining?: boolean;

  maxModelDiameterGroups?: ("6" | "8" | "10" | "10+")[];

  // cnc-machines 연동(소재/스케줄)
  currentMaterial?: {
    materialType?: string;
    heatNo?: string;
    diameter: number;
    diameterGroup: "6" | "8" | "10" | "10+";
    remainingLength?: number;
    setAt?: string;
  };
  scheduledMaterialChange?: {
    targetTime?: string;
    newDiameter?: number;
    newDiameterGroup?: "6" | "8" | "10" | "10+";
    notes?: string;
  };
  dummySettings?: {
    enabled?: boolean;
    programName?: string;
    schedules?: { time: string; enabled?: boolean }[];
    excludeHolidays?: boolean;
  };
}

export interface MachineForm {
  uid: string; // 장비 식별자(Hi-Link UID와 통합)
  name: string; // 표시용 장비 이름
  ip: string;
  allowJobStart: boolean;
  allowProgramDelete: boolean;
  allowAutoMachining: boolean;
}

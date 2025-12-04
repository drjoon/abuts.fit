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
}

export interface MachineForm {
  uid: string; // 장비 식별자(Hi-Link UID와 통합)
  name: string; // 표시용 장비 이름
  ip: string;
  allowJobStart: boolean;
  allowProgramDelete: boolean;
}

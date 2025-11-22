export interface Machine {
  name: string; // 표시용 장비 이름
  hiLinkUid: string; // Hi-Link 내부 UID
  serial?: string;
  ip?: string;
  port?: number;
  status: string;
  lastUpdated?: string;
  lastCommand?: string;
  lastError?: string | null;
}

export interface MachineForm {
  name: string; // 표시용 장비 이름
  hiLinkUid: string; // Hi-Link 내부 UID
  ip: string;
}

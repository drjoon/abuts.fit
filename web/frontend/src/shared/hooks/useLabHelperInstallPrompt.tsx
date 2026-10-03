/**
 * 연결 프로그램 설치·업데이트 모달 (설정·채팅 입력).
 * related files:
 * - web/frontend/src/shared/files/labHelperClient.ts
 * - web/frontend/src/shared/components/LabHelperInstallDialog.tsx
 * - web/frontend/src/shared/components/LabHelperUpdateDialog.tsx
 * - web/frontend/src/shared/components/practice/LabReceiveAlarmSettingsButton.tsx
 * - web/frontend/src/shared/components/PracticeTransferDetailChatDialog.tsx
 * change-log:
 * - 2026-10-04: JSX 훅이라 .tsx (Vite SWC).
 * - 2026-10-04: 헤더 설정·채팅 입력에서 미설치/구버전 안내.
 */
import { useCallback, useRef, useState, type ReactNode } from "react";
import { LabHelperInstallDialog } from "@/shared/components/LabHelperInstallDialog";
import { LabHelperUpdateDialog } from "@/shared/components/LabHelperUpdateDialog";
import {
  resolveLabHelperPresence,
  supportsLabHelper,
  type LabHelperPresence,
} from "@/shared/files/labHelperClient";

const CHAT_DISMISSED_KEY = "abuts.labHelperChatInstallDismissed";

function readChatDismissed(): boolean {
  try {
    return sessionStorage.getItem(CHAT_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeChatDismissed(dismissed: boolean) {
  try {
    if (dismissed) sessionStorage.setItem(CHAT_DISMISSED_KEY, "1");
    else sessionStorage.removeItem(CHAT_DISMISSED_KEY);
  } catch {
    // ignore
  }
}

export function useLabHelperInstallPrompt() {
  const [installOpen, setInstallOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const busyRef = useRef(false);
  const chatAskedRef = useRef(false);

  const openForPresence = useCallback((presence: LabHelperPresence) => {
    if (presence === "outdated") {
      setUpdateOpen(true);
      return true;
    }
    if (presence === "missing") {
      setInstallOpen(true);
      return true;
    }
    return false;
  }, []);

  /** 설정 팝오버 — 미설치·구버전이면 해당 모달. 정상이면 false. */
  const promptFromSettings = useCallback(async (): Promise<LabHelperPresence> => {
    if (!supportsLabHelper()) return "unsupported";
    if (busyRef.current) return "unsupported";
    busyRef.current = true;
    try {
      const presence = await resolveLabHelperPresence({ wake: true });
      openForPresence(presence);
      return presence;
    } finally {
      busyRef.current = false;
    }
  }, [openForPresence]);

  /** 채팅 입력 포커스 — 세션당 한 번. 닫으면 같은 탭에서는 다시 안 묻는다. */
  const promptFromChatInput = useCallback(async () => {
    if (!supportsLabHelper()) return;
    if (chatAskedRef.current || readChatDismissed()) return;
    if (busyRef.current || installOpen || updateOpen) return;
    busyRef.current = true;
    try {
      const presence = await resolveLabHelperPresence({ wake: true });
      if (presence !== "missing" && presence !== "outdated") return;
      chatAskedRef.current = true;
      openForPresence(presence);
    } finally {
      busyRef.current = false;
    }
  }, [installOpen, openForPresence, updateOpen]);

  const settleInstall = useCallback((connected: boolean) => {
    setInstallOpen(false);
    if (connected) writeChatDismissed(false);
    else writeChatDismissed(true);
  }, []);

  const settleUpdate = useCallback((updated: boolean) => {
    setUpdateOpen(false);
    if (updated) writeChatDismissed(false);
    else writeChatDismissed(true);
  }, []);

  const dialogs: ReactNode = (
    <>
      <LabHelperInstallDialog open={installOpen} onResolved={settleInstall} />
      <LabHelperUpdateDialog open={updateOpen} onResolved={settleUpdate} />
    </>
  );

  return {
    promptFromSettings,
    promptFromChatInput,
    dialogs,
    installOpen,
    updateOpen,
  };
}

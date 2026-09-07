// related files:
// - web/frontend/src/shared/chat/chatSoundPrefs.ts
// - web/frontend/src/shared/chat/chatSoundViewing.ts
// change-log:
// - 2026-09-07: 채팅 알림음 — 전체 토글 아이콘 + 방별 토글.
// - 2026-09-07: 채팅방 알림음 — 클릭 토글(방별). 전체 on/off는 알림 설정.
// - 2026-09-07: 채팅 알림음 UI — 이 채팅/전체 끄기·켜기.

import { useEffect, useState, type ReactNode } from "react";
import { BellOff, BellRing, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/shared/ui/cn";
import {
  CHAT_SOUND_PREFS_CHANGED_EVENT,
  getChatSoundPrefs,
  setChatSoundEnabled,
  setChatSoundTargetMuted,
  type ChatSoundPrefs,
} from "@/shared/chat/chatSoundPrefs";
import { setChatSoundViewingTarget } from "@/shared/chat/chatSoundViewing";

export function useChatSoundPrefsState(): ChatSoundPrefs {
  const [prefs, setPrefs] = useState<ChatSoundPrefs>(() => getChatSoundPrefs());

  useEffect(() => {
    const sync = () => setPrefs(getChatSoundPrefs());
    window.addEventListener(CHAT_SOUND_PREFS_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHAT_SOUND_PREFS_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return prefs;
}

/** 열람 중인 채팅 대상을 알림음 스킵 목록에 등록 */
export function useRegisterChatSoundViewing(
  targetId: string | null | undefined,
  active: boolean,
) {
  useEffect(() => {
    const id = String(targetId || "").trim();
    if (!id || !active) return;
    setChatSoundViewingTarget(id, true);
    return () => setChatSoundViewingTarget(id, false);
  }, [targetId, active]);
}

type SoundIconButtonProps = {
  className?: string;
  size?: "sm" | "default";
  label: string;
  mutedLook: boolean;
  onClick: () => void;
  children: ReactNode;
};

function SoundIconButton({
  className,
  size = "sm",
  label,
  mutedLook,
  onClick,
  children,
}: SoundIconButtonProps) {
  const btnClass =
    size === "sm" ? "h-8 w-8 p-0 shrink-0" : "h-9 w-9 p-0 shrink-0";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn(
            btnClass,
            mutedLook && "text-muted-foreground",
            className,
          )}
          aria-label={label}
          title={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

type ChatSoundGlobalToggleProps = {
  className?: string;
  size?: "sm" | "default";
};

/** 모든 채팅 알림음 on/off */
export function ChatSoundGlobalToggle({
  className,
  size = "sm",
}: ChatSoundGlobalToggleProps) {
  const prefs = useChatSoundPrefsState();
  const enabled = prefs.enabled;
  const Icon = enabled ? Volume2 : VolumeX;
  const label = enabled ? "모든 채팅 알림 끄기" : "모든 채팅 알림 켜기";

  return (
    <SoundIconButton
      className={className}
      size={size}
      label={label}
      mutedLook={!enabled}
      onClick={() => setChatSoundEnabled(!enabled)}
    >
      <Icon className="h-4 w-4" />
    </SoundIconButton>
  );
}

type ChatSoundMenuProps = {
  /** roomId 또는 remote-support:{sessionId}. 없으면 렌더하지 않음 */
  targetId?: string | null;
  className?: string;
  size?: "sm" | "default";
};

/**
 * 채팅방 알림음 on/off. 클릭 시 해당 방만 토글.
 */
export function ChatSoundMenu({
  targetId = null,
  className,
  size = "sm",
}: ChatSoundMenuProps) {
  const prefs = useChatSoundPrefsState();
  const id = String(targetId || "").trim();
  if (!id) return null;

  const targetMuted = prefs.mutedTargets.includes(id);
  const globallyOff = !prefs.enabled;
  const Icon = targetMuted ? BellOff : BellRing;

  const label = globallyOff
    ? targetMuted
      ? "이 채팅 알림 켜기 (전체 알림음은 꺼져 있음)"
      : "이 채팅 알림 끄기 (전체 알림음은 꺼져 있음)"
    : targetMuted
      ? "이 채팅 알림 켜기"
      : "이 채팅 알림 끄기";

  return (
    <SoundIconButton
      className={className}
      size={size}
      label={label}
      mutedLook={globallyOff || targetMuted}
      onClick={() => setChatSoundTargetMuted(id, !targetMuted)}
    >
      <Icon className="h-4 w-4" />
    </SoundIconButton>
  );
}

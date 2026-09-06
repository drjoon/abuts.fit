// related files:
// - web/frontend/src/features/remoteSupport/replayRemoteInput.ts
// - web/frontend/src/shared/realtime/socket.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { getSocket } from "@/shared/realtime/socket";
import {
  replayRemoteInput,
  type RemoteControlEvent,
} from "@/features/remoteSupport/replayRemoteInput";

type PeerRole = "staff" | "admin";

type UseRemoteSupportPeerArgs = {
  sessionId: string | null;
  role: PeerRole | null;
  iceServers: RTCIceServer[];
  enabled: boolean;
  onRemoteStream?: (stream: MediaStream | null) => void;
  onConnectionState?: (state: string) => void;
};

type SignalPayload = {
  sessionId: string;
  fromUserId: string;
  signal:
    | { type: "offer"; sdp: RTCSessionDescriptionInit }
    | { type: "answer"; sdp: RTCSessionDescriptionInit }
    | { type: "ice"; candidate: RTCIceCandidateInit };
};

export function useRemoteSupportPeer({
  sessionId,
  role,
  iceServers,
  enabled,
  onRemoteStream,
  onConnectionState,
}: UseRemoteSupportPeerArgs) {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const makingOfferRef = useRef(false);
  const [connectionState, setConnectionState] = useState("new");
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanup = useCallback(() => {
    try {
      dcRef.current?.close();
    } catch {
      // ignore
    }
    dcRef.current = null;
    try {
      pcRef.current?.close();
    } catch {
      // ignore
    }
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setSharing(false);
    setConnectionState("closed");
    onRemoteStream?.(null);
  }, [onRemoteStream]);

  const emitSignal = useCallback(
    (signal: SignalPayload["signal"]) => {
      if (!sessionId) return;
      const socket = getSocket();
      socket?.emit("remote-support:signal", { sessionId, signal });
    },
    [sessionId],
  );

  const wireDataChannel = useCallback(
    (dc: RTCDataChannel) => {
      dcRef.current = dc;
      dc.binaryType = "arraybuffer";
      dc.onopen = () => {
        // ready
      };
      dc.onmessage = (ev) => {
        if (role !== "staff") return;
        try {
          const data =
            typeof ev.data === "string"
              ? (JSON.parse(ev.data) as RemoteControlEvent)
              : null;
          if (data) replayRemoteInput(data);
        } catch {
          // ignore malformed
        }
      };
    },
    [role],
  );

  const ensurePc = useCallback(() => {
    if (pcRef.current) return pcRef.current;
    const pc = new RTCPeerConnection({
      iceServers:
        iceServers.length > 0
          ? iceServers
          : [{ urls: "stun:stun.l.google.com:19302" }],
    });
    pcRef.current = pc;

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        emitSignal({ type: "ice", candidate: ev.candidate.toJSON() });
      }
    };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      setConnectionState(st);
      onConnectionState?.(st);
    };
    pc.ontrack = (ev) => {
      const stream = ev.streams[0] || new MediaStream([ev.track]);
      onRemoteStream?.(stream);
    };
    pc.ondatachannel = (ev) => {
      wireDataChannel(ev.channel);
    };

    return pc;
  }, [emitSignal, iceServers, onConnectionState, onRemoteStream, wireDataChannel]);

  const startStaffShare = useCallback(async () => {
    if (!sessionId || role !== "staff") return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 15 },
        audio: false,
      });
      localStreamRef.current = stream;
      setSharing(true);

      const pc = ensurePc();
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        setSharing(false);
      });

      const dc = pc.createDataChannel("control", { ordered: true });
      wireDataChannel(dc);

      makingOfferRef.current = true;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      emitSignal({ type: "offer", sdp: pc.localDescription! });
      makingOfferRef.current = false;
    } catch (err) {
      makingOfferRef.current = false;
      const msg =
        err instanceof Error ? err.message : "화면 공유를 시작할 수 없습니다.";
      setError(msg);
      cleanup();
      throw err;
    }
  }, [cleanup, emitSignal, ensurePc, role, sessionId, wireDataChannel]);

  const sendControl = useCallback((evt: RemoteControlEvent) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open") return false;
    try {
      dc.send(JSON.stringify(evt));
      return true;
    } catch {
      return false;
    }
  }, []);

  // Join/leave signaling room + handle signals
  useEffect(() => {
    if (!enabled || !sessionId || !role) return;

    const socket = getSocket();
    if (!socket) return;

    socket.emit("remote-support:join", { sessionId });
    ensurePc();

    const onSignal = async (payload: unknown) => {
      const data = payload as SignalPayload;
      if (!data || data.sessionId !== sessionId) return;
      if (!data.signal) return;
      const pc = ensurePc();

      try {
        if (data.signal.type === "offer" && role === "admin") {
          await pc.setRemoteDescription(data.signal.sdp);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          emitSignal({ type: "answer", sdp: pc.localDescription! });
        } else if (data.signal.type === "answer" && role === "staff") {
          if (pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription(data.signal.sdp);
          }
        } else if (data.signal.type === "ice") {
          try {
            await pc.addIceCandidate(data.signal.candidate);
          } catch {
            // ignore race
          }
        }
      } catch (err) {
        console.warn("[remote-support] signal handling failed:", err);
      }
    };

    socket.on("remote-support:signal", onSignal);

    return () => {
      socket.off("remote-support:signal", onSignal);
      socket.emit("remote-support:leave", { sessionId });
      cleanup();
    };
  }, [cleanup, emitSignal, enabled, ensurePc, role, sessionId]);

  return {
    connectionState,
    sharing,
    error,
    startStaffShare,
    sendControl,
    cleanup,
  };
}

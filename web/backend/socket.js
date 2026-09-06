// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/utils/creditRealtime.js
// - web/frontend/src/pages/admin/credits/hooks/useAdminCreditPage.ts
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "./models/user.model.js";
import ChatRoom from "./models/chatRoom.model.js";
import Chat from "./models/chat.model.js";
import RemoteSupportSession from "./models/remoteSupport/remoteSupportSession.model.js";

let io;

export function initializeSocket(server) {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Socket.io 인증 미들웨어
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error("인증 토큰이 필요합니다."));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const decodedId = decoded?.userId || decoded?.id;
      if (!decodedId) {
        return next(new Error("사용자를 찾을 수 없습니다."));
      }
      const user = await User.findById(decodedId).select("-password");

      if (!user) {
        return next(new Error("사용자를 찾을 수 없습니다."));
      }

      socket.userId = user._id.toString();
      socket.userRole = user.role;
      socket.userName = user.name;
      next();
    } catch (error) {
      next(new Error("인증에 실패했습니다."));
    }
  });

  io.on("connection", (socket) => {
    console.log(`사용자 연결: ${socket.userName} (${socket.userId})`);

    // 사용자별 룸에 조인
    socket.join(`user:${socket.userId}`);

    // role별 룸에 조인 (실시간 이벤트 role fan-out SSOT)
    const normalizedRole = String(socket.userRole || "").trim();
    if (normalizedRole) {
      socket.join(`role:${normalizedRole}`);
    }

    // 채팅방 조인
    socket.on("join-room", async (roomId) => {
      try {
        const room = await ChatRoom.findById(roomId);
        if (!room) {
          socket.emit("error", { message: "채팅방을 찾을 수 없습니다." });
          return;
        }

        const isParticipant = room.participants.some(
          (p) => p.toString() === socket.userId,
        );

        if (!isParticipant && socket.userRole !== "admin") {
          socket.emit("error", { message: "채팅방 접근 권한이 없습니다." });
          return;
        }

        socket.join(`room:${roomId}`);
        console.log(
          `${socket.userName}이(가) 채팅방 ${roomId}에 입장했습니다.`,
        );

        // 입장 알림
        socket.to(`room:${roomId}`).emit("user-joined", {
          userId: socket.userId,
          userName: socket.userName,
          timestamp: new Date(),
        });
      } catch (error) {
        socket.emit("error", {
          message: "채팅방 입장 중 오류가 발생했습니다.",
        });
      }
    });

    // 채팅방 나가기
    socket.on("leave-room", (roomId) => {
      socket.leave(`room:${roomId}`);
      socket.to(`room:${roomId}`).emit("user-left", {
        userId: socket.userId,
        userName: socket.userName,
        timestamp: new Date(),
      });
    });

    // 메시지 전송 (Direct Chat)
    socket.on("send-message", async (data) => {
      try {
        const { roomId, content, attachments, replyTo } = data;

        const room = await ChatRoom.findById(roomId);
        if (!room) {
          socket.emit("error", { message: "채팅방을 찾을 수 없습니다." });
          return;
        }

        const isParticipant = room.participants.some(
          (p) => p.toString() === socket.userId,
        );

        if (!isParticipant) {
          socket.emit("error", { message: "메시지 전송 권한이 없습니다." });
          return;
        }

        const newMessage = new Chat({
          roomId,
          sender: socket.userId,
          content,
          attachments: attachments || [],
          replyTo: replyTo || null,
          readBy: [{ userId: socket.userId, readAt: new Date() }],
        });

        await newMessage.save();

        const populatedMessage = await Chat.findById(newMessage._id)
          .populate("sender", "name email role")
          .populate({
            path: "replyTo",
            select: "_id content sender isDeleted",
            populate: { path: "sender", select: "name role" },
          })
          .lean();

        // 채팅방의 모든 참여자에게 전송
        emitToRoom(`room:${roomId}`, "new-message", populatedMessage);

        // 참여자들에게 알림 전송 (본인 제외)
        room.participants.forEach((participantId) => {
          if (participantId.toString() !== socket.userId) {
            emitToUser(participantId, "notification", {
              type: "new-message",
              roomId,
              message: populatedMessage,
              timestamp: new Date(),
            });
          }
        });

        // 참여 중인 admin 소켓에 채팅 배지 업데이트 이벤트 전송
        if (socket.userRole !== "admin") {
          for (const s of io.sockets.sockets.values()) {
            if (
              s.userRole === "admin" &&
              s.userId !== socket.userId &&
              room.participants.some((p) => p.toString() === s.userId)
            ) {
              emitAppEventToUser(s.userId, "comm:badge-update", {
                key: "chat",
                delta: 1,
              });
              break;
            }
          }
        }
      } catch (error) {
        socket.emit("error", {
          message: "메시지 전송 중 오류가 발생했습니다.",
        });
      }
    });

    // 타이핑 중 표시
    socket.on("typing", (data) => {
      const { roomId, isTyping } = data;
      socket.to(`room:${roomId}`).emit("user-typing", {
        userId: socket.userId,
        userName: socket.userName,
        isTyping,
      });
    });

    // 메시지 읽음 처리
    socket.on("mark-as-read", async (data) => {
      try {
        const { roomId, messageIds } = data;

        await Chat.updateMany(
          {
            _id: { $in: messageIds },
            roomId,
            "readBy.userId": { $ne: socket.userId },
          },
          {
            $addToSet: {
              readBy: {
                userId: socket.userId,
                readAt: new Date(),
              },
            },
          },
        );

        emitToRoom(`room:${roomId}`, "messages-read", {
          userId: socket.userId,
          messageIds,
          readAt: new Date(),
        });
      } catch (error) {
        console.error("읽음 처리 오류:", error);
      }
    });



    // CNC 가공 완료 폴링 시작
    socket.on("subscribe-cnc-machining", (data) => {
      const { machineId, jobId } = data;
      if (machineId && jobId) {
        socket.join(`cnc:${machineId}:${jobId}`);
        console.log(
          `사용자 ${socket.userName}이(가) CNC 가공 ${machineId}/${jobId} 구독`,
        );
      }
    });

    // CNC 가공 완료 폴링 구독 해제
    socket.on("unsubscribe-cnc-machining", (data) => {
      const { machineId, jobId } = data;
      if (machineId && jobId) {
        socket.leave(`cnc:${machineId}:${jobId}`);
      }
    });

    // ── Remote support (WebRTC signaling + presence) ──
    const canJoinRemoteSupport = (session) => {
      if (!session) return false;
      if (socket.userRole === "admin") return true;
      const uid = String(socket.userId);
      return (
        String(session.requesterId) === uid ||
        (session.adminId && String(session.adminId) === uid)
      );
    };

    socket.on("remote-support:join", async (data) => {
      try {
        const sessionId = String(data?.sessionId || "").trim();
        if (!sessionId) {
          socket.emit("error", { message: "sessionId가 필요합니다." });
          return;
        }
        const session = await RemoteSupportSession.findById(sessionId)
          .select("requesterId adminId status")
          .lean();
        if (!session) {
          socket.emit("error", {
            message: "원격 지원 세션을 찾을 수 없습니다.",
          });
          return;
        }
        if (!canJoinRemoteSupport(session)) {
          socket.emit("error", {
            message: "원격 지원 방 접근 권한이 없습니다.",
          });
          return;
        }
        if (["ended", "cancelled", "declined"].includes(session.status)) {
          socket.emit("error", { message: "종료된 세션입니다." });
          return;
        }
        const roomKey = `remote-support:${sessionId}`;
        socket.join(roomKey);
        socket.to(roomKey).emit("remote-support:presence", {
          sessionId,
          userId: socket.userId,
          userName: socket.userName,
          action: "joined",
          timestamp: new Date(),
        });
      } catch (error) {
        console.error("[remote-support] join:", error);
        socket.emit("error", {
          message: "원격 지원 방 입장 중 오류가 발생했습니다.",
        });
      }
    });

    socket.on("remote-support:leave", (data) => {
      const sessionId = String(data?.sessionId || "").trim();
      if (!sessionId) return;
      const roomKey = `remote-support:${sessionId}`;
      socket.leave(roomKey);
      socket.to(roomKey).emit("remote-support:presence", {
        sessionId,
        userId: socket.userId,
        userName: socket.userName,
        action: "left",
        timestamp: new Date(),
      });
    });

    socket.on("remote-support:signal", async (data) => {
      try {
        const sessionId = String(data?.sessionId || "").trim();
        if (!sessionId || data?.signal == null) return;
        const session = await RemoteSupportSession.findById(sessionId)
          .select("requesterId adminId status")
          .lean();
        if (!session || !canJoinRemoteSupport(session)) return;
        if (["ended", "cancelled", "declined"].includes(session.status)) return;
        const roomKey = `remote-support:${sessionId}`;
        socket.to(roomKey).emit("remote-support:signal", {
          sessionId,
          fromUserId: socket.userId,
          signal: data.signal,
        });
      } catch (error) {
        console.error("[remote-support] signal:", error);
      }
    });

    socket.on("remote-support:chat", async (data) => {
      try {
        const sessionId = String(data?.sessionId || "").trim();
        const content = String(data?.content || "").trim();
        if (!sessionId || !content) return;
        const session = await RemoteSupportSession.findById(sessionId);
        if (!session || !canJoinRemoteSupport(session)) return;
        if (!["pending", "accepted", "active"].includes(session.status)) return;

        const msg = {
          senderId: socket.userId,
          content: content.slice(0, 2000),
          createdAt: new Date(),
        };
        session.messages.push(msg);
        await session.save();
        const saved = session.messages[session.messages.length - 1];
        const payload = {
          _id: saved._id,
          sessionId,
          senderId: {
            _id: socket.userId,
            name: socket.userName,
            role: socket.userRole,
          },
          content: saved.content,
          createdAt: saved.createdAt,
        };
        const roomKey = `remote-support:${sessionId}`;
        io.to(roomKey).emit("remote-support:chat", payload);
      } catch (error) {
        console.error("[remote-support] chat:", error);
      }
    });

    // 연결 해제
    socket.on("disconnect", () => {
      console.log(`사용자 연결 해제: ${socket.userName} (${socket.userId})`);
    });
  });

  return io;
}

export function getIO() {
  if (!io) {
    throw new Error("Socket.io가 초기화되지 않았습니다.");
  }
  return io;
}

// 특정 사용자에게 알림 전송
export function sendNotificationToUser(userId, notification) {
  if (io) {
    io.to(`user:${userId}`).emit("notification", notification);
  }
}

// 채팅방의 모든 사용자에게 메시지 전송
export function sendMessageToRoom(roomId, event, data) {
  if (io) {
    io.to(`room:${roomId}`).emit(event, data);
  }
}

export function sendNotificationToRoles(roles, notification) {
  if (!io) return;
  const roleSet = new Set(
    (Array.isArray(roles) ? roles : [roles])
      .map((r) => String(r || "").trim())
      .filter(Boolean),
  );
  if (roleSet.size === 0) return;

  roleSet.forEach((role) => {
    io.to(`role:${role}`).emit("notification", notification);
  });
}

export function emitToUser(userId, event, payload) {
  if (!io) return;
  const uid = String(userId || "").trim();
  const evt = String(event || "").trim();
  if (!uid || !evt) return;
  io.to(`user:${uid}`).emit(evt, payload);
}

export function emitToRoles(roles, event, payload) {
  if (!io) return;
  const evt = String(event || "").trim();
  if (!evt) return;

  const roleSet = new Set(
    (Array.isArray(roles) ? roles : [roles])
      .map((r) => String(r || "").trim())
      .filter(Boolean),
  );
  if (roleSet.size === 0) return;

  roleSet.forEach((role) => {
    io.to(`role:${role}`).emit(evt, payload);
  });
}

export function emitGlobal(event, payload) {
  if (!io) return;
  const evt = String(event || "").trim();
  if (!evt) return;
  io.emit(evt, payload);
}

export function emitToRoom(roomKey, event, payload) {
  if (!io) return;
  const room = String(roomKey || "").trim();
  const evt = String(event || "").trim();
  if (!room || !evt) return;
  io.to(room).emit(evt, payload);
}

export function emitAppEventToUser(userId, type, data) {
  const evtType = String(type || "").trim();
  if (!evtType) return;
  emitToUser(userId, "app-event", {
    type: evtType,
    data: data ?? null,
    timestamp: new Date(),
  });
}

export function emitAppEventToRoles(roles, type, data) {
  const evtType = String(type || "").trim();
  if (!evtType) return;
  emitToRoles(roles, "app-event", {
    type: evtType,
    data: data ?? null,
    timestamp: new Date(),
  });
}

export function emitAppEventGlobal(type, data) {
  const evtType = String(type || "").trim();
  if (!evtType) return;
  emitGlobal("app-event", {
    type: evtType,
    data: data ?? null,
    timestamp: new Date(),
  });
}

export function emitAppEventToRoom(roomKey, type, data) {
  const evtType = String(type || "").trim();
  if (!evtType) return;
  emitToRoom(roomKey, "app-event", {
    type: evtType,
    data: data ?? null,
    timestamp: new Date(),
  });
}

export default {
  initializeSocket,
  getIO,
  sendNotificationToUser,
  sendNotificationToRoles,
  sendMessageToRoom,
  emitToUser,
  emitToRoles,
  emitGlobal,
  emitToRoom,
  emitAppEventToUser,
  emitAppEventToRoles,
  emitAppEventGlobal,
  emitAppEventToRoom,
};

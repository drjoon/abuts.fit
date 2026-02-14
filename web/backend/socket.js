import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "./models/user.model.js";
import ChatRoom from "./models/chatRoom.model.js";
import Chat from "./models/chat.model.js";

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
          .populate("replyTo")
          .lean();

        // 채팅방의 모든 참여자에게 전송
        io.to(`room:${roomId}`).emit("new-message", populatedMessage);

        // 참여자들에게 알림 전송 (본인 제외)
        room.participants.forEach((participantId) => {
          if (participantId.toString() !== socket.userId) {
            io.to(`user:${participantId}`).emit("notification", {
              type: "new-message",
              roomId,
              message: populatedMessage,
              timestamp: new Date(),
            });
          }
        });
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

        socket.to(`room:${roomId}`).emit("messages-read", {
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

export default {
  initializeSocket,
  getIO,
  sendNotificationToUser,
  sendMessageToRoom,
};

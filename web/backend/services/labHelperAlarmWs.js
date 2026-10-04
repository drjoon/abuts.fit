// related files:
// - web/backend/server.js
// - web/backend/services/labHelperAlarm.service.js
// - bg/lab-cad-helper/win/Notify.cs
// - bg/lab-cad-helper/mac/AbutsLabHelper.swift
// change-log:
// - 2026-10-04: 헬퍼 PC 알람 전용 WebSocket (/api/lab-helper/alarms/ws).

import { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import {
  canUseLabHelperAlarm,
  subscribeLabHelperAlarmSocket,
  unsubscribeLabHelperAlarmSocket,
} from "./labHelperAlarm.service.js";

const WS_PATH = "/api/lab-helper/alarms/ws";
const AUTH_TIMEOUT_MS = 10_000;

const extractBearer = (req) => {
  const header = String(req?.headers?.authorization || "").trim();
  if (header.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }
  try {
    const host = req?.headers?.host || "localhost";
    const url = new URL(req.url || "/", `http://${host}`);
    return String(url.searchParams.get("token") || "").trim();
  } catch {
    return "";
  }
};

const authenticateHelper = async (token) => {
  const raw = String(token || "").trim();
  if (!raw) return null;
  let decoded;
  try {
    decoded = jwt.verify(raw, process.env.JWT_SECRET);
  } catch {
    return null;
  }
  const decodedId = decoded?.userId || decoded?.id;
  if (!decodedId) return null;
  const user = await User.findById(decodedId).select("-password").lean();
  if (!user || !canUseLabHelperAlarm(user)) return null;
  return {
    userId: String(user._id),
    userName: String(user.name || "").trim(),
  };
};

const safeJsonParse = (raw) => {
  try {
    return JSON.parse(String(raw || ""));
  } catch {
    return null;
  }
};

/**
 * HTTP 서버에 헬퍼 알람 WS를 붙인다. Socket.IO `/socket.io`와 경로가 겹치지 않는다.
 * @param {import('http').Server} server
 */
export function attachLabHelperAlarmWs(server) {
  if (!server) return;

  const wss = new WebSocketServer({
    noServer: true,
    clientTracking: false,
    perMessageDeflate: false,
  });

  server.on("upgrade", (req, socket, head) => {
    let pathname = "";
    try {
      const host = req.headers?.host || "localhost";
      pathname = new URL(req.url || "/", `http://${host}`).pathname;
    } catch {
      return;
    }
    if (pathname !== WS_PATH) return;

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws, req) => {
    let userId = "";
    let authed = false;
    let closed = false;

    const cleanup = () => {
      if (closed) return;
      closed = true;
      if (userId) unsubscribeLabHelperAlarmSocket(userId, ws);
    };

    const failAuth = () => {
      try {
        ws.close(4401, "unauthorized");
      } catch {
        /* ignore */
      }
      cleanup();
    };

    const completeAuth = async (token) => {
      const auth = await authenticateHelper(token);
      if (!auth) {
        failAuth();
        return;
      }
      userId = auth.userId;
      authed = true;
      subscribeLabHelperAlarmSocket(userId, ws);
      try {
        ws.send(JSON.stringify({ type: "ready", ok: true }));
      } catch {
        /* ignore */
      }
    };

    const authTimer = setTimeout(() => {
      if (!authed) failAuth();
    }, AUTH_TIMEOUT_MS);

    const headerToken = extractBearer(req);
    if (headerToken) {
      void completeAuth(headerToken).finally(() => clearTimeout(authTimer));
    }

    ws.on("message", (data) => {
      const text =
        typeof data === "string"
          ? data
          : Buffer.isBuffer(data)
            ? data.toString("utf8")
            : String(data || "");
      const msg = safeJsonParse(text);
      if (!msg || typeof msg !== "object") return;

      if (!authed) {
        if (String(msg.type || "") === "auth") {
          clearTimeout(authTimer);
          void completeAuth(msg.token);
        }
        return;
      }

      if (String(msg.type || "") === "ping") {
        try {
          ws.send(JSON.stringify({ type: "pong", ok: true }));
        } catch {
          /* ignore */
        }
      }
    });

    ws.on("close", () => {
      clearTimeout(authTimer);
      cleanup();
    });
    ws.on("error", () => {
      clearTimeout(authTimer);
      cleanup();
    });
  });
}

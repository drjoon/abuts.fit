// related files:
// - web/backend/models/remoteSupport/remoteSupportSession.model.js
// - web/backend/modules/remoteSupport/remoteSupport.routes.js
// - web/backend/socket.js
import mongoose from "mongoose";
import RemoteSupportSession from "../../models/remoteSupport/remoteSupportSession.model.js";
import User from "../../models/user.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import {
  emitAppEventToRoles,
  emitAppEventToUser,
  emitAppEventToRoom,
} from "../../socket.js";

const STAFF_ROLES = new Set([
  "practice",
  "requestor",
  "internalLab",
  "labTeam",
]);

const PENDING_TTL_MS = 15 * 60 * 1000;

function isStaffRole(role) {
  return STAFF_ROLES.has(String(role || "").trim());
}

function oid(id) {
  try {
    return new mongoose.Types.ObjectId(String(id));
  } catch {
    return null;
  }
}

function sessionRoom(sessionId) {
  return `remote-support:${sessionId}`;
}

async function buildRequesterSnapshot(user) {
  let businessName = "";
  const baId = user?.businessAnchorId || null;
  if (baId) {
    const ba = await BusinessAnchor.findById(baId).select("name").lean();
    businessName = ba?.name || "";
  }
  return {
    name: user?.name || "",
    role: user?.role || "",
    requestorKind: user?.requestorKind || null,
    businessAnchorId: baId,
    businessName,
  };
}

function serializeSession(doc) {
  if (!doc) return null;
  const o = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return o;
}

async function expireStalePending(session) {
  if (!session || session.status !== "pending") return session;
  const age = Date.now() - new Date(session.requestedAt).getTime();
  if (age < PENDING_TTL_MS) return session;
  session.status = "cancelled";
  session.endedAt = new Date();
  session.endedBy = "system";
  await session.save();
  return session;
}

function canAccessSession(session, user) {
  if (!session || !user) return false;
  if (user.role === "admin") return true;
  const uid = String(user._id || user.id);
  return (
    String(session.requesterId) === uid ||
    (session.adminId && String(session.adminId) === uid)
  );
}

function isParticipant(session, user) {
  if (!session || !user) return false;
  const uid = String(user._id || user.id);
  return (
    String(session.requesterId) === uid ||
    (session.adminId && String(session.adminId) === uid)
  );
}

/** GET /ice-config */
export async function getIceConfig(req, res) {
  try {
    let iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
    const raw = process.env.WEBRTC_ICE_SERVERS;
    if (raw && String(raw).trim()) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          iceServers = parsed;
        }
      } catch (err) {
        console.warn(
          "[remote-support] WEBRTC_ICE_SERVERS parse failed:",
          err?.message || err,
        );
      }
    }
    return res.status(200).json({ success: true, data: { iceServers } });
  } catch (error) {
    console.error("[remote-support] getIceConfig:", error);
    return res.status(500).json({
      success: false,
      message: "ICE 설정을 불러오지 못했습니다.",
    });
  }
}

/** POST /sessions — staff request */
export async function createSession(req, res) {
  try {
    const user = req.user;
    if (!isStaffRole(user.role)) {
      return res.status(403).json({
        success: false,
        message: "원격 지원을 요청할 수 없는 역할입니다.",
      });
    }

    const existing = await RemoteSupportSession.findOne({
      requesterId: user._id,
      status: { $in: ["pending", "accepted", "active"] },
    });
    if (existing) {
      await expireStalePending(existing);
      if (["pending", "accepted", "active"].includes(existing.status)) {
        return res.status(409).json({
          success: false,
          message: "이미 진행 중인 원격 지원 세션이 있습니다.",
          data: serializeSession(existing),
        });
      }
    }

    const snapshot = await buildRequesterSnapshot(user);
    const session = await RemoteSupportSession.create({
      status: "pending",
      initiatedBy: "staff",
      requesterId: user._id,
      adminId: null,
      requesterSnapshot: snapshot,
      requestedAt: new Date(),
    });

    const payload = serializeSession(session);
    res.status(201).json({ success: true, data: payload });

    void Promise.resolve()
      .then(() => {
        emitAppEventToRoles(["admin"], "remote-support:requested", {
          sessionId: String(session._id),
          session: payload,
        });
      })
      .catch((err) =>
        console.warn("[remote-support] notify admins failed:", err?.message),
      );

    return undefined;
  } catch (error) {
    console.error("[remote-support] createSession:", error);
    return res.status(500).json({
      success: false,
      message: "원격 지원 요청에 실패했습니다.",
    });
  }
}

/** POST /sessions/invite — admin invites staff */
export async function inviteSession(req, res) {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "관리자만 원격 지원을 초대할 수 있습니다.",
      });
    }

    const targetId = oid(req.body?.userId);
    if (!targetId) {
      return res.status(400).json({
        success: false,
        message: "초대할 사용자를 지정해 주세요.",
      });
    }

    const target = await User.findById(targetId).select(
      "name role requestorKind businessAnchorId",
    );
    if (!target) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }
    if (!isStaffRole(target.role)) {
      return res.status(400).json({
        success: false,
        message: "해당 사용자 역할에는 원격 지원을 초대할 수 없습니다.",
      });
    }

    const existing = await RemoteSupportSession.findOne({
      requesterId: target._id,
      status: { $in: ["pending", "accepted", "active"] },
    });
    if (existing) {
      await expireStalePending(existing);
      if (["pending", "accepted", "active"].includes(existing.status)) {
        return res.status(409).json({
          success: false,
          message: "해당 사용자에게 이미 진행 중인 세션이 있습니다.",
          data: serializeSession(existing),
        });
      }
    }

    const snapshot = await buildRequesterSnapshot(target);
    const session = await RemoteSupportSession.create({
      status: "pending",
      initiatedBy: "admin",
      requesterId: target._id,
      adminId: req.user._id,
      requesterSnapshot: snapshot,
      requestedAt: new Date(),
    });

    const payload = serializeSession(session);
    res.status(201).json({ success: true, data: payload });

    void Promise.resolve()
      .then(() => {
        emitAppEventToUser(String(target._id), "remote-support:invited", {
          sessionId: String(session._id),
          session: payload,
        });
        emitAppEventToRoles(["admin"], "remote-support:updated", {
          sessionId: String(session._id),
          session: payload,
        });
      })
      .catch((err) =>
        console.warn("[remote-support] invite notify failed:", err?.message),
      );

    return undefined;
  } catch (error) {
    console.error("[remote-support] inviteSession:", error);
    return res.status(500).json({
      success: false,
      message: "원격 지원 초대에 실패했습니다.",
    });
  }
}

/** POST /sessions/:id/accept */
export async function acceptSession(req, res) {
  try {
    const session = await RemoteSupportSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: "세션을 찾을 수 없습니다.",
      });
    }
    await expireStalePending(session);
    if (session.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "수락할 수 있는 상태가 아닙니다.",
        data: serializeSession(session),
      });
    }

    const uid = String(req.user._id);
    if (session.initiatedBy === "staff") {
      if (req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          message: "관리자만 직원 요청을 수락할 수 있습니다.",
        });
      }
      session.adminId = req.user._id;
    } else {
      if (String(session.requesterId) !== uid) {
        return res.status(403).json({
          success: false,
          message: "초대받은 사용자만 수락할 수 있습니다.",
        });
      }
    }

    session.status = "accepted";
    session.acceptedAt = new Date();
    await session.save();

    const payload = serializeSession(session);
    res.status(200).json({ success: true, data: payload });

    void Promise.resolve()
      .then(() => {
        emitAppEventToUser(String(session.requesterId), "remote-support:accepted", {
          sessionId: String(session._id),
          session: payload,
        });
        if (session.adminId) {
          emitAppEventToUser(String(session.adminId), "remote-support:accepted", {
            sessionId: String(session._id),
            session: payload,
          });
        }
        emitAppEventToRoles(["admin"], "remote-support:updated", {
          sessionId: String(session._id),
          session: payload,
        });
      })
      .catch((err) =>
        console.warn("[remote-support] accept notify failed:", err?.message),
      );

    return undefined;
  } catch (error) {
    console.error("[remote-support] acceptSession:", error);
    return res.status(500).json({
      success: false,
      message: "세션 수락에 실패했습니다.",
    });
  }
}

/** POST /sessions/:id/decline */
export async function declineSession(req, res) {
  try {
    const session = await RemoteSupportSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: "세션을 찾을 수 없습니다.",
      });
    }
    if (session.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "거절할 수 있는 상태가 아닙니다.",
      });
    }

    const uid = String(req.user._id);
    const isAdminDecline =
      session.initiatedBy === "staff" && req.user.role === "admin";
    const isStaffDecline =
      session.initiatedBy === "admin" && String(session.requesterId) === uid;
    if (!isAdminDecline && !isStaffDecline) {
      return res.status(403).json({
        success: false,
        message: "거절 권한이 없습니다.",
      });
    }

    session.status = "declined";
    session.endedAt = new Date();
    session.endedBy = isAdminDecline ? "admin" : "requester";
    if (isAdminDecline && !session.adminId) {
      session.adminId = req.user._id;
    }
    await session.save();

    const payload = serializeSession(session);
    res.status(200).json({ success: true, data: payload });

    void Promise.resolve()
      .then(() => {
        emitAppEventToUser(String(session.requesterId), "remote-support:declined", {
          sessionId: String(session._id),
          session: payload,
        });
        if (session.adminId) {
          emitAppEventToUser(String(session.adminId), "remote-support:declined", {
            sessionId: String(session._id),
            session: payload,
          });
        }
        emitAppEventToRoles(["admin"], "remote-support:updated", {
          sessionId: String(session._id),
          session: payload,
        });
      })
      .catch((err) =>
        console.warn("[remote-support] decline notify failed:", err?.message),
      );

    return undefined;
  } catch (error) {
    console.error("[remote-support] declineSession:", error);
    return res.status(500).json({
      success: false,
      message: "세션 거절에 실패했습니다.",
    });
  }
}

/** POST /sessions/:id/start */
export async function startSession(req, res) {
  try {
    const session = await RemoteSupportSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: "세션을 찾을 수 없습니다.",
      });
    }
    if (!isParticipant(session, req.user)) {
      return res.status(403).json({
        success: false,
        message: "세션 참여자만 시작할 수 있습니다.",
      });
    }
    if (!["accepted", "active"].includes(session.status)) {
      return res.status(400).json({
        success: false,
        message: "시작할 수 있는 상태가 아닙니다.",
      });
    }
    if (session.status === "accepted") {
      session.status = "active";
      session.startedAt = new Date();
      await session.save();
    }

    const payload = serializeSession(session);
    res.status(200).json({ success: true, data: payload });

    void Promise.resolve()
      .then(() => {
        emitAppEventToRoom(sessionRoom(session._id), "remote-support:started", {
          sessionId: String(session._id),
          session: payload,
        });
        emitAppEventToUser(String(session.requesterId), "remote-support:started", {
          sessionId: String(session._id),
          session: payload,
        });
        if (session.adminId) {
          emitAppEventToUser(String(session.adminId), "remote-support:started", {
            sessionId: String(session._id),
            session: payload,
          });
        }
      })
      .catch((err) =>
        console.warn("[remote-support] start notify failed:", err?.message),
      );

    return undefined;
  } catch (error) {
    console.error("[remote-support] startSession:", error);
    return res.status(500).json({
      success: false,
      message: "세션 시작에 실패했습니다.",
    });
  }
}

/** POST /sessions/:id/end */
export async function endSession(req, res) {
  try {
    const session = await RemoteSupportSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: "세션을 찾을 수 없습니다.",
      });
    }
    if (!canAccessSession(session, req.user)) {
      return res.status(403).json({
        success: false,
        message: "세션 종료 권한이 없습니다.",
      });
    }
    if (["ended", "cancelled", "declined"].includes(session.status)) {
      return res.status(200).json({ success: true, data: serializeSession(session) });
    }

    const uid = String(req.user._id);
    const isAdmin = req.user.role === "admin";
    const notes =
      typeof req.body?.notes === "string" ? req.body.notes.trim() : undefined;
    const ideaTags = Array.isArray(req.body?.ideaTags)
      ? req.body.ideaTags
          .map((t) => String(t || "").trim())
          .filter(Boolean)
          .slice(0, 20)
      : undefined;

    if (isAdmin && notes !== undefined) session.notes = notes;
    if (isAdmin && ideaTags !== undefined) session.ideaTags = ideaTags;

    const now = new Date();
    if (session.status === "pending") {
      session.status = "cancelled";
    } else {
      session.status = "ended";
    }
    session.endedAt = now;
    session.endedBy =
      String(session.requesterId) === uid && !isAdmin
        ? "requester"
        : isAdmin
          ? "admin"
          : "requester";
    if (session.startedAt) {
      session.durationMs = Math.max(
        0,
        now.getTime() - new Date(session.startedAt).getTime(),
      );
    } else {
      session.durationMs = 0;
    }
    if (isAdmin && !session.adminId) {
      session.adminId = req.user._id;
    }
    await session.save();

    const payload = serializeSession(session);
    res.status(200).json({ success: true, data: payload });

    void Promise.resolve()
      .then(() => {
        emitAppEventToRoom(sessionRoom(session._id), "remote-support:ended", {
          sessionId: String(session._id),
          session: payload,
        });
        emitAppEventToUser(String(session.requesterId), "remote-support:ended", {
          sessionId: String(session._id),
          session: payload,
        });
        if (session.adminId) {
          emitAppEventToUser(String(session.adminId), "remote-support:ended", {
            sessionId: String(session._id),
            session: payload,
          });
        }
        emitAppEventToRoles(["admin"], "remote-support:updated", {
          sessionId: String(session._id),
          session: payload,
        });
      })
      .catch((err) =>
        console.warn("[remote-support] end notify failed:", err?.message),
      );

    return undefined;
  } catch (error) {
    console.error("[remote-support] endSession:", error);
    return res.status(500).json({
      success: false,
      message: "세션 종료에 실패했습니다.",
    });
  }
}

/** PATCH /sessions/:id — update notes/ideaTags after end */
export async function updateSessionNotes(req, res) {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "관리자만 기록을 수정할 수 있습니다.",
      });
    }
    const session = await RemoteSupportSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: "세션을 찾을 수 없습니다.",
      });
    }
    if (typeof req.body?.notes === "string") {
      session.notes = req.body.notes.trim();
    }
    if (Array.isArray(req.body?.ideaTags)) {
      session.ideaTags = req.body.ideaTags
        .map((t) => String(t || "").trim())
        .filter(Boolean)
        .slice(0, 20);
    }
    await session.save();
    return res.status(200).json({ success: true, data: serializeSession(session) });
  } catch (error) {
    console.error("[remote-support] updateSessionNotes:", error);
    return res.status(500).json({
      success: false,
      message: "기록 수정에 실패했습니다.",
    });
  }
}

/** GET /sessions — admin list */
export async function listSessions(req, res) {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "관리자만 목록을 조회할 수 있습니다.",
      });
    }

    const status = String(req.query.status || "").trim();
    const q = String(req.query.q || "").trim();
    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    const filter = {};
    if (status === "queue") {
      filter.status = { $in: ["pending", "accepted", "active"] };
    } else if (status === "history") {
      filter.status = { $in: ["ended", "cancelled", "declined"] };
    } else if (status) {
      filter.status = status;
    }
    if (from && !Number.isNaN(from.getTime())) {
      filter.requestedAt = { ...(filter.requestedAt || {}), $gte: from };
    }
    if (to && !Number.isNaN(to.getTime())) {
      filter.requestedAt = { ...(filter.requestedAt || {}), $lte: to };
    }
    if (q) {
      filter.$or = [
        { "requesterSnapshot.name": { $regex: q, $options: "i" } },
        { "requesterSnapshot.businessName": { $regex: q, $options: "i" } },
        { notes: { $regex: q, $options: "i" } },
        { ideaTags: { $regex: q, $options: "i" } },
      ];
    }

    // Expire stale pending in queue view (best-effort, capped)
    if (status === "queue" || !status) {
      const staleBefore = new Date(Date.now() - PENDING_TTL_MS);
      await RemoteSupportSession.updateMany(
        { status: "pending", requestedAt: { $lt: staleBefore } },
        {
          $set: {
            status: "cancelled",
            endedAt: new Date(),
            endedBy: "system",
          },
        },
      );
    }

    const sessions = await RemoteSupportSession.find(filter)
      .sort({ requestedAt: -1 })
      .limit(limit)
      .populate("requesterId", "name email role requestorKind")
      .populate("adminId", "name email role")
      .lean();

    return res.status(200).json({ success: true, data: sessions });
  } catch (error) {
    console.error("[remote-support] listSessions:", error);
    return res.status(500).json({
      success: false,
      message: "세션 목록 조회에 실패했습니다.",
    });
  }
}

/** GET /sessions/mine */
export async function listMySessions(req, res) {
  try {
    const uid = req.user._id;
    const sessions = await RemoteSupportSession.find({
      $or: [{ requesterId: uid }, { adminId: uid }],
      status: { $in: ["pending", "accepted", "active"] },
    })
      .sort({ requestedAt: -1 })
      .limit(10)
      .populate("requesterId", "name email role requestorKind")
      .populate("adminId", "name email role")
      .lean();

    for (const s of sessions) {
      if (s.status === "pending") {
        const age = Date.now() - new Date(s.requestedAt).getTime();
        if (age >= PENDING_TTL_MS) {
          await RemoteSupportSession.updateOne(
            { _id: s._id, status: "pending" },
            {
              $set: {
                status: "cancelled",
                endedAt: new Date(),
                endedBy: "system",
              },
            },
          );
          s.status = "cancelled";
        }
      }
    }

    return res.status(200).json({
      success: true,
      data: sessions.filter((s) =>
        ["pending", "accepted", "active"].includes(s.status),
      ),
    });
  } catch (error) {
    console.error("[remote-support] listMySessions:", error);
    return res.status(500).json({
      success: false,
      message: "내 세션 조회에 실패했습니다.",
    });
  }
}

/** GET /sessions/:id */
export async function getSession(req, res) {
  try {
    const session = await RemoteSupportSession.findById(req.params.id)
      .populate("requesterId", "name email role requestorKind")
      .populate("adminId", "name email role")
      .populate("messages.senderId", "name role");
    if (!session) {
      return res.status(404).json({
        success: false,
        message: "세션을 찾을 수 없습니다.",
      });
    }
    await expireStalePending(session);
    if (!canAccessSession(session, req.user)) {
      return res.status(403).json({
        success: false,
        message: "세션 조회 권한이 없습니다.",
      });
    }
    return res.status(200).json({ success: true, data: serializeSession(session) });
  } catch (error) {
    console.error("[remote-support] getSession:", error);
    return res.status(500).json({
      success: false,
      message: "세션 조회에 실패했습니다.",
    });
  }
}

/** POST /sessions/:id/messages */
export async function postMessage(req, res) {
  try {
    const content = String(req.body?.content || "").trim();
    if (!content) {
      return res.status(400).json({
        success: false,
        message: "메시지 내용이 필요합니다.",
      });
    }
    const session = await RemoteSupportSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: "세션을 찾을 수 없습니다.",
      });
    }
    if (!isParticipant(session, req.user)) {
      return res.status(403).json({
        success: false,
        message: "메시지 전송 권한이 없습니다.",
      });
    }
    if (!["pending", "accepted", "active"].includes(session.status)) {
      return res.status(400).json({
        success: false,
        message: "종료된 세션에는 메시지를 보낼 수 없습니다.",
      });
    }

    const msg = {
      senderId: req.user._id,
      content: content.slice(0, 2000),
      createdAt: new Date(),
    };
    session.messages.push(msg);
    await session.save();

    const saved = session.messages[session.messages.length - 1];
    const payload = {
      _id: saved._id,
      senderId: {
        _id: req.user._id,
        name: req.user.name,
        role: req.user.role,
      },
      content: saved.content,
      createdAt: saved.createdAt,
      sessionId: String(session._id),
    };

    res.status(201).json({ success: true, data: payload });

    void Promise.resolve()
      .then(() => {
        emitAppEventToRoom(sessionRoom(session._id), "remote-support:chat", payload);
        emitAppEventToUser(String(session.requesterId), "remote-support:chat", payload);
        if (session.adminId) {
          emitAppEventToUser(String(session.adminId), "remote-support:chat", payload);
        }
      })
      .catch((err) =>
        console.warn("[remote-support] chat notify failed:", err?.message),
      );

    return undefined;
  } catch (error) {
    console.error("[remote-support] postMessage:", error);
    return res.status(500).json({
      success: false,
      message: "메시지 전송에 실패했습니다.",
    });
  }
}

/** GET /stats */
export async function getStats(req, res) {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "관리자만 통계를 조회할 수 있습니다.",
      });
    }

    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;
    const match = { status: "ended" };
    if (from && !Number.isNaN(from.getTime())) {
      match.endedAt = { ...(match.endedAt || {}), $gte: from };
    }
    if (to && !Number.isNaN(to.getTime())) {
      match.endedAt = { ...(match.endedAt || {}), $lte: to };
    }

    const [byAdmin, ideaTags, totals] = await Promise.all([
      RemoteSupportSession.aggregate([
        { $match: { ...match, adminId: { $ne: null } } },
        {
          $group: {
            _id: "$adminId",
            count: { $sum: 1 },
            totalDurationMs: { $sum: { $ifNull: ["$durationMs", 0] } },
            avgDurationMs: { $avg: { $ifNull: ["$durationMs", 0] } },
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "admin",
          },
        },
        { $unwind: { path: "$admin", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            adminId: "$_id",
            count: 1,
            totalDurationMs: 1,
            avgDurationMs: 1,
            adminName: "$admin.name",
          },
        },
        { $sort: { count: -1 } },
      ]),
      RemoteSupportSession.aggregate([
        { $match: match },
        { $unwind: "$ideaTags" },
        { $group: { _id: "$ideaTags", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 30 },
        { $project: { tag: "$_id", count: 1, _id: 0 } },
      ]),
      RemoteSupportSession.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalDurationMs: { $sum: { $ifNull: ["$durationMs", 0] } },
            avgDurationMs: { $avg: { $ifNull: ["$durationMs", 0] } },
          },
        },
      ]),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        totals: totals[0] || {
          count: 0,
          totalDurationMs: 0,
          avgDurationMs: 0,
        },
        byAdmin,
        ideaTags,
      },
    });
  } catch (error) {
    console.error("[remote-support] getStats:", error);
    return res.status(500).json({
      success: false,
      message: "통계 조회에 실패했습니다.",
    });
  }
}

/** GET /users/search — admin search staff for invite */
export async function searchStaffUsers(req, res) {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "관리자만 검색할 수 있습니다.",
      });
    }
    const q = String(req.query.q || "").trim();
    if (q.length < 1) {
      return res.status(200).json({ success: true, data: [] });
    }
    const users = await User.find({
      role: { $in: [...STAFF_ROLES] },
      $or: [
        { name: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
      ],
    })
      .select("name email role requestorKind businessAnchorId")
      .limit(20)
      .lean();

    return res.status(200).json({ success: true, data: users });
  } catch (error) {
    console.error("[remote-support] searchStaffUsers:", error);
    return res.status(500).json({
      success: false,
      message: "사용자 검색에 실패했습니다.",
    });
  }
}

export { canAccessSession, sessionRoom, STAFF_ROLES, isStaffRole };

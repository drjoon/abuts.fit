import Notification from "../models/notification.model.js";
import User from "../models/user.model.js";
import { sendNotificationToUser } from "../socket.js";
import { sendNotificationViaQueue } from "../utils/notificationQueue.js";

/**
 * 알림 생성 및 전송
 */
export async function createNotification(notificationData) {
  try {
    const { recipient, type, title, message, data } = notificationData;

    const notification = new Notification({
      recipient,
      type,
      title,
      message,
      data: data || {},
    });

    await notification.save();

    // 실시간 알림 전송
    sendNotificationToUser(recipient.toString(), {
      _id: notification._id,
      type,
      title,
      message,
      data: notification.data,
      createdAt: notification.createdAt,
    });

    // 사용자 알림 설정 확인
    const user = await User.findById(recipient).select("preferences");
    if (user?.preferences?.notifications?.email && !notification.isEmailSent) {
      // 이메일 전송 로직 (추후 구현)
      // await sendEmailNotification(user.email, notification);
      notification.isEmailSent = true;
      await notification.save();
    }

    if (user?.preferences?.notifications?.sms && !notification.isSMSSent) {
      const phone = String(user?.phone || "").replace(/[^0-9+]/g, "");
      if (phone.length >= 10) {
        try {
          await sendNotificationViaQueue({
            type: "SMS",
            to: phone,
            content: notification.message || notification.title || "",
            subject: "",
            priority: 5,
          });
          notification.isSMSSent = true;
          await notification.save();
        } catch (err) {
          console.error("[notification] SMS enqueue failed:", err?.message);
        }
      }
    }

    return notification;
  } catch (error) {
    console.error("알림 생성 오류:", error);
    throw error;
  }
}

/**
 * 내 알림 목록 조회
 * @route GET /api/notifications
 */
export async function getMyNotifications(req, res) {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const unreadOnly = req.query.unreadOnly === "true";

    const filter = { recipient: userId };
    if (unreadOnly) {
      filter.isRead = false;
    }

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Notification.countDocuments(filter);
    const unreadCount = await Notification.countDocuments({
      recipient: userId,
      isRead: false,
    });

    res.status(200).json({
      success: true,
      data: {
        notifications,
        unreadCount,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "알림 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 알림 읽음 처리
 * @route PATCH /api/notifications/:id/read
 */
export async function markNotificationAsRead(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const notification = await Notification.findOneAndUpdate(
      { _id: id, recipient: userId },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "알림을 찾을 수 없습니다.",
      });
    }

    res.status(200).json({
      success: true,
      data: notification,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "알림 읽음 처리 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 모든 알림 읽음 처리
 * @route PATCH /api/notifications/read-all
 */
export async function markAllNotificationsAsRead(req, res) {
  try {
    const userId = req.user._id;

    await Notification.updateMany(
      { recipient: userId, isRead: false },
      { isRead: true }
    );

    res.status(200).json({
      success: true,
      message: "모든 알림을 읽음 처리했습니다.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "알림 읽음 처리 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 알림 삭제
 * @route DELETE /api/notifications/:id
 */
export async function deleteNotification(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const notification = await Notification.findOneAndDelete({
      _id: id,
      recipient: userId,
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "알림을 찾을 수 없습니다.",
      });
    }

    res.status(200).json({
      success: true,
      message: "알림이 삭제되었습니다.",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "알림 삭제 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 오래된 알림 정리 (30일 이상)
 */
export async function cleanupOldNotifications() {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await Notification.deleteMany({
      createdAt: { $lt: thirtyDaysAgo },
      isRead: true,
    });

    console.log(`${result.deletedCount}개의 오래된 알림을 정리했습니다.`);
  } catch (error) {
    console.error("알림 정리 오류:", error);
  }
}

export default {
  createNotification,
  getMyNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  cleanupOldNotifications,
};

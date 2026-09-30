// related files:
// - web/backend/services/opsMonthlyReport.core.js
// - web/backend/controllers/admin/opsMonthlyReport.controller.js
import ActivityLog from "../models/activityLog.model.js";
import AdminAuditLog from "../models/adminAuditLog.model.js";
import AdminSmsLog from "../models/adminSmsLog.model.js";
import File from "../models/file.model.js";
import Mail from "../models/mail.model.js";
import PracticeTransfer from "../models/practiceTransfer.model.js";
import RequestBackupRun from "../models/requestBackupRun.model.js";
import User from "../models/user.model.js";
import UserAccessDay from "../models/userAccessDay.model.js";
import {
  assembleOpsMonthlyReport,
  currentKstMonth,
  kstMonthBounds,
} from "./opsMonthlyReport.core.js";

function countByKey(rows) {
  const map = {};
  for (const row of rows || []) {
    const key = String(row?._id || "");
    if (!key) continue;
    map[key] = Number(row.count || 0);
  }
  return map;
}

/**
 * 해당 월(KST) 플랫폼 기록으로 운영·유지보수 증빙을 만든다.
 * month가 비어 있으면 오늘이 속한 달.
 * @returns {Promise<object|null>}
 */
export async function buildOpsMonthlyReport({ month, now = new Date() } = {}) {
  const ym = String(month || "").trim() || currentKstMonth(now);
  const bounds = kstMonthBounds(ym);
  if (!bounds) return null;

  const range = { $gte: bounds.start, $lt: bounds.endExclusive };
  const ymdRange = { $gte: bounds.startYmd, $lte: bounds.endYmd };

  const [
    accessFacet,
    transfersCreated,
    workStarted,
    workCanceled,
    transferDays,
    newUsers,
    filesUploaded,
    backupGroups,
    lastBackup,
    activityRows,
    adminActionTotal,
    topAdminActions,
    mailSent,
    smsSent,
  ] = await Promise.all([
    UserAccessDay.aggregate([
      { $match: { ymd: ymdRange } },
      {
        $facet: {
          byDay: [{ $group: { _id: "$ymd", count: { $sum: 1 } } }],
          byRole: [
            {
              $group: {
                _id: { role: "$role", userId: "$userId" },
                userDays: { $sum: 1 },
              },
            },
            {
              $group: {
                _id: "$_id.role",
                users: { $sum: 1 },
                userDays: { $sum: "$userDays" },
              },
            },
            { $sort: { users: -1 } },
          ],
          userDays: [{ $count: "n" }],
          distinctUsers: [
            { $group: { _id: "$userId" } },
            { $count: "n" },
          ],
        },
      },
    ]),
    PracticeTransfer.countDocuments({ createdAt: range }),
    PracticeTransfer.countDocuments({ requestorDownloadedAt: range }),
    PracticeTransfer.countDocuments({ workCanceledAt: range }),
    PracticeTransfer.aggregate([
      { $match: { createdAt: range } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt",
              timezone: "Asia/Seoul",
            },
          },
          count: { $sum: 1 },
        },
      },
    ]),
    User.countDocuments({ createdAt: range }),
    File.countDocuments({ createdAt: range }),
    RequestBackupRun.aggregate([
      { $match: { createdAt: range } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    RequestBackupRun.findOne({ status: "completed", createdAt: range })
      .sort({ finishedAt: -1, createdAt: -1 })
      .select("finishedAt")
      .lean(),
    ActivityLog.aggregate([
      { $match: { createdAt: range } },
      {
        $group: {
          _id: "$action",
          count: { $sum: 1 },
          highOrCritical: {
            $sum: {
              $cond: [{ $in: ["$severity", ["high", "critical"]] }, 1, 0],
            },
          },
          blocked: {
            $sum: { $cond: [{ $eq: ["$status", "blocked"] }, 1, 0] },
          },
        },
      },
    ]),
    AdminAuditLog.countDocuments({ createdAt: range }),
    AdminAuditLog.aggregate([
      { $match: { createdAt: range } },
      { $group: { _id: "$action", count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 8 },
    ]),
    Mail.countDocuments({
      createdAt: range,
      direction: "outbound",
      status: "sent",
    }),
    AdminSmsLog.countDocuments({ createdAt: range, status: "SENT" }),
  ]);

  const facet = accessFacet?.[0] || {};
  const totals = {
    userDays: Number(facet.userDays?.[0]?.n || 0),
    users: Number(facet.distinctUsers?.[0]?.n || 0),
  };
  const backupMap = countByKey(backupGroups);

  return assembleOpsMonthlyReport({
    bounds,
    now,
    stats: {
      distinctUsers: Number(totals.users || 0),
      accessUserDays: Number(totals.userDays || 0),
      usersByRole: (facet.byRole || []).map((row) => ({
        role: String(row._id || ""),
        users: Number(row.users || 0),
        userDays: Number(row.userDays || 0),
      })),
      accessByYmd: countByKey(facet.byDay),
      transferByYmd: countByKey(transferDays),
      newUsers,
      transfersCreated,
      workStarted,
      workCanceled,
      filesUploaded,
      backupCompleted: Number(backupMap.completed || 0),
      backupFailed: Number(backupMap.failed || 0),
      backupSkipped: Number(backupMap.skipped || 0),
      lastBackupCompletedAt: lastBackup?.finishedAt
        ? new Date(lastBackup.finishedAt).toISOString()
        : null,
      activityRows,
      adminActions: adminActionTotal,
      topAdminActions: (topAdminActions || []).map((row) => ({
        action: String(row._id || ""),
        count: Number(row.count || 0),
      })),
      mailSent,
      smsSent,
    },
  });
}

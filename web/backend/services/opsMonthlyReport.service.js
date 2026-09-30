// related files:
// - web/backend/services/opsMonthlyReport.core.js
// - web/backend/controllers/admin/opsMonthlyReport.controller.js
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  estimateDevEffort,
  kstMonthBounds,
  parseGitLogRecords,
} from "./opsMonthlyReport.core.js";

const GITHUB_REPO = "drjoon/abuts.fit";
const COMMIT_CACHE_MS = 10 * 60 * 1000;
const commitCache = new Map();

function resolveGitRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

function inMonth(at, bounds) {
  const time = new Date(at).getTime();
  return time >= bounds.start.getTime() && time < bounds.endExclusive.getTime();
}

function loadCommitsFromGit(bounds) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = resolveGitRoot(here) || resolveGitRoot(process.cwd());
  if (!root) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      [
        "log",
        `--since=${bounds.start.toISOString()}`,
        `--until=${bounds.endExclusive.toISOString()}`,
        "--pretty=format:%aN%x1f%aE%x1f%aI%x1f%s%x1e",
      ],
      { cwd: root, maxBuffer: 20 * 1024 * 1024, timeout: 20_000 },
      (error, stdout) => {
        if (error) reject(error);
        else resolve(parseGitLogRecords(stdout).filter((row) => inMonth(row.at, bounds)));
      },
    );
  });
}

async function loadCommitsFromGitHub(bounds) {
  const commits = [];
  for (let page = 1; page <= 30; page += 1) {
    const url = new URL(`https://api.github.com/repos/${GITHUB_REPO}/commits`);
    url.searchParams.set("since", bounds.start.toISOString());
    url.searchParams.set("until", bounds.endExclusive.toISOString());
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));
    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "abuts-ops-report",
      },
    });
    if (!res.ok) throw new Error(`github ${res.status}`);
    const body = await res.json();
    if (!Array.isArray(body) || body.length === 0) break;
    for (const row of body) {
      const author = row?.commit?.author || {};
      commits.push({
        name: author.name || row?.author?.login || "",
        email: author.email || "",
        at: author.date,
        subject: String(row?.commit?.message || "").split("\n")[0],
      });
    }
    if (body.length < 100) break;
  }
  return commits.filter((row) => inMonth(row.at, bounds));
}

export async function loadMonthDevEffort(bounds) {
  const cached = commitCache.get(bounds.month);
  if (cached && Date.now() - cached.at < COMMIT_CACHE_MS) return cached.value;

  let commits = null;
  let source = "";
  try {
    commits = await loadCommitsFromGit(bounds);
    if (commits) source = "git";
  } catch (error) {
    console.error("[ops-monthly-report] git", error?.message || error);
  }
  if (!commits) {
    try {
      commits = await loadCommitsFromGitHub(bounds);
      source = "github";
    } catch (error) {
      console.error("[ops-monthly-report] github", error?.message || error);
    }
  }

  const value = commits
    ? { available: true, source, ...estimateDevEffort(commits) }
    : {
        available: false,
        source: "",
        ...estimateDevEffort([]),
      };
  if (value.available) commitCache.set(bounds.month, { at: Date.now(), value });
  return value;
}

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
    development,
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
    loadMonthDevEffort(bounds),
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
      development,
    },
  });
}

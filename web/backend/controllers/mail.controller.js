import Mail from "../models/mail.model.js";
import { sendEmailWithAttachments } from "../utils/email.util.js";
import {
  getSignedUrl,
  getUploadSignedUrl,
  deleteFileFromS3,
} from "../utils/s3.utils.js";

const PAGE_SIZE = 20;

export async function adminListMails(req, res) {
  try {
    const {
      direction,
      folder,
      q,
      from,
      to,
      cursorCreatedAt,
      cursorId,
      limit,
      startDate,
      endDate,
    } = req.query;

    const query = {};
    if (folder) query.folder = folder;
    if (direction) query.direction = direction;
    if (from) query.from = from;
    if (to) query.to = to;
    if (q) query.$text = { $search: q };
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    if (cursorCreatedAt && cursorId) {
      query.$or = [
        { createdAt: { $lt: new Date(cursorCreatedAt) } },
        {
          createdAt: new Date(cursorCreatedAt),
          _id: { $lt: cursorId },
        },
      ];
    }

    const size = Math.min(Number(limit) || PAGE_SIZE, 100);
    console.log("[adminListMails] query:", JSON.stringify(query));
    const items = await Mail.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(size + 1)
      .lean();
    console.log("[adminListMails] found:", items.length, "items");

    const hasMore = items.length > size;
    const data = hasMore ? items.slice(0, size) : items;
    const nextCursor = hasMore
      ? {
          cursorCreatedAt: data[data.length - 1].createdAt,
          cursorId: data[data.length - 1]._id,
        }
      : null;

    return res.status(200).json({ success: true, data, nextCursor });
  } catch (error) {
    console.error("[adminListMails] failed", error);
    return res
      .status(500)
      .json({ success: false, message: "메일 목록 조회 실패" });
  }
}

export async function adminMarkAsRead(req, res) {
  try {
    const { id } = req.params;
    const mail = await Mail.findById(id);
    if (!mail) {
      return res.status(404).json({ success: false, message: "not found" });
    }
    mail.isRead = true;
    mail.readAt = new Date();
    await mail.save();
    return res.status(200).json({ success: true, data: mail });
  } catch (error) {
    console.error("[adminMarkAsRead] failed", error);
    return res.status(500).json({ success: false, message: "읽음 처리 실패" });
  }
}

export async function adminMarkAsUnread(req, res) {
  try {
    const { id } = req.params;
    const mail = await Mail.findById(id);
    if (!mail) {
      return res.status(404).json({ success: false, message: "not found" });
    }
    mail.isRead = false;
    mail.readAt = null;
    // 스팸/휴지통 등에서 안읽음 처리 시 기본 수신함으로 복귀
    if (mail.folder !== "inbox") {
      mail.folder = "inbox";
      mail.trashedAt = null;
    }
    await mail.save();
    return res.status(200).json({ success: true, data: mail });
  } catch (error) {
    console.error("[adminMarkAsUnread] failed", error);
    return res
      .status(500)
      .json({ success: false, message: "안읽음 처리 실패" });
  }
}

export async function adminMoveToSpam(req, res) {
  try {
    const { id } = req.params;
    const mail = await Mail.findById(id);
    if (!mail) {
      return res.status(404).json({ success: false, message: "not found" });
    }
    mail.folder = "spam";
    await mail.save();
    return res.status(200).json({ success: true, data: mail });
  } catch (error) {
    console.error("[adminMoveToSpam] failed", error);
    return res.status(500).json({ success: false, message: "스팸 이동 실패" });
  }
}

export async function adminTrashMail(req, res) {
  try {
    const { id } = req.params;
    const mail = await Mail.findById(id);
    if (!mail) {
      return res.status(404).json({ success: false, message: "not found" });
    }
    mail.folder = "trash";
    mail.trashedAt = new Date();
    await mail.save();
    return res.status(200).json({ success: true, data: mail });
  } catch (error) {
    console.error("[adminTrashMail] failed", error);
    return res.status(500).json({ success: false, message: "삭제 실패" });
  }
}

export async function adminRestoreToSent(req, res) {
  try {
    const { id } = req.params;
    const mail = await Mail.findById(id);
    if (!mail) {
      return res.status(404).json({ success: false, message: "not found" });
    }
    if (mail.direction !== "outbound") {
      return res
        .status(400)
        .json({ success: false, message: "발신 메일만 복원할 수 있습니다." });
    }
    mail.folder = "sent";
    mail.trashedAt = null;
    await mail.save();
    return res.status(200).json({ success: true, data: mail });
  } catch (error) {
    console.error("[adminRestoreToSent] failed", error);
    return res.status(500).json({ success: false, message: "복원 실패" });
  }
}

export async function adminEmptyTrash(req, res) {
  try {
    const { permanently } = req.body || {};
    const trashes = await Mail.find({ folder: "trash" });
    let deletedCount = 0;

    for (const mail of trashes) {
      if (permanently) {
        // S3 원본 및 첨부 삭제
        if (mail.s3RawKey) {
          await deleteFileFromS3(mail.s3RawKey);
        }
        if (mail.attachments?.length) {
          for (const att of mail.attachments) {
            if (att.s3Key) await deleteFileFromS3(att.s3Key);
          }
        }
        await Mail.deleteOne({ _id: mail._id });
        deletedCount += 1;
      } else {
        mail.folder = "trash";
        await mail.save();
      }
    }

    return res.status(200).json({
      success: true,
      data: { deletedCount, permanently: !!permanently },
    });
  } catch (error) {
    console.error("[adminEmptyTrash] failed", error);
    return res
      .status(500)
      .json({ success: false, message: "휴지통 비우기 실패" });
  }
}

async function emptyFolder(folder, permanently = true) {
  const mails = await Mail.find({ folder });
  let deletedCount = 0;

  for (const mail of mails) {
    if (permanently) {
      if (mail.s3RawKey) {
        await deleteFileFromS3(mail.s3RawKey);
      }
      if (mail.attachments?.length) {
        for (const att of mail.attachments) {
          if (att.s3Key) await deleteFileFromS3(att.s3Key);
        }
      }
      await Mail.deleteOne({ _id: mail._id });
      deletedCount += 1;
    } else {
      await mail.save();
    }
  }

  return { deletedCount, permanently: !!permanently };
}

export async function adminEmptySpam(req, res) {
  try {
    const { permanently } = req.body || {};
    const result = await emptyFolder("spam", permanently);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error("[adminEmptySpam] failed", error);
    return res
      .status(500)
      .json({ success: false, message: "스팸함 비우기 실패" });
  }
}

export async function adminEmptySent(req, res) {
  try {
    const { permanently } = req.body || {};
    const result = await emptyFolder("sent", permanently);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error("[adminEmptySent] failed", error);
    return res
      .status(500)
      .json({ success: false, message: "발신함 비우기 실패" });
  }
}

export async function adminGetMail(req, res) {
  try {
    const { id } = req.params;
    const mail = await Mail.findById(id).lean();
    if (!mail) {
      return res.status(404).json({ success: false, message: "not found" });
    }
    return res.status(200).json({ success: true, data: mail });
  } catch (error) {
    console.error("[adminGetMail] failed", error);
    return res.status(500).json({ success: false, message: "조회 실패" });
  }
}

export async function adminSendMail(req, res) {
  try {
    const {
      to = [],
      cc = [],
      bcc = [],
      subject = "",
      bodyHtml = "",
      bodyText = "",
      attachments = [],
    } = req.body || {};

    const normalizedTo = Array.isArray(to) ? to : [to];
    const normalizedCc = Array.isArray(cc) ? cc : [cc];
    const normalizedBcc = Array.isArray(bcc) ? bcc : [bcc];

    const mailDoc = await Mail.create({
      folder: "sent",
      direction: "outbound",
      status: "pending",
      from: process.env.SES_FROM_EMAIL || process.env.SES_FROM || "",
      to: normalizedTo,
      cc: normalizedCc,
      bcc: normalizedBcc,
      subject,
      bodyHtml,
      bodyText,
      attachments,
      sentAt: new Date(),
    });

    try {
      await sendEmailWithAttachments({
        to: normalizedTo,
        cc: normalizedCc,
        bcc: normalizedBcc,
        subject,
        html: bodyHtml,
        text: bodyText,
        attachments,
      });
      mailDoc.status = "sent";
      await mailDoc.save();
    } catch (error) {
      mailDoc.status = "failed";
      mailDoc.error = error?.message || String(error);
      await mailDoc.save();
      console.error("[adminSendMail] send failed", error);
      return res
        .status(500)
        .json({ success: false, message: "메일 발송 실패" });
    }

    return res.status(200).json({ success: true, data: mailDoc });
  } catch (error) {
    console.error("[adminSendMail] failed", error);
    return res.status(500).json({ success: false, message: "메일 발송 실패" });
  }
}

export async function adminGetMailUploadUrl(req, res) {
  try {
    const { filename, contentType } = req.body || {};
    if (!filename) {
      return res
        .status(400)
        .json({ success: false, message: "filename is required" });
    }
    const key = `emails/attachments/${Date.now()}-${filename}`;
    const url = await getUploadSignedUrl(
      key,
      contentType || "application/octet-stream"
    );
    return res.status(200).json({ success: true, data: { url, key } });
  } catch (error) {
    console.error("[adminGetMailUploadUrl] failed", error);
    return res.status(500).json({ success: false, message: "URL 발급 실패" });
  }
}

export async function adminGetMailDownloadUrl(req, res) {
  try {
    const { s3Key, expires } = req.body || {};
    if (!s3Key) {
      return res
        .status(400)
        .json({ success: false, message: "s3Key is required" });
    }

    const url = await getSignedUrl(String(s3Key), Number(expires) || 3600);
    return res.status(200).json({ success: true, data: { url } });
  } catch (error) {
    console.error("[adminGetMailDownloadUrl] failed", error);
    return res.status(500).json({ success: false, message: "URL 발급 실패" });
  }
}

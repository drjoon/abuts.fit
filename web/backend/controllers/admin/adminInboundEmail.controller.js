import Mail from "../../models/mail.model.js";
import axios from "axios";

/**
 * Brevo 인바운드 이메일 webhook 핸들러
 * POST /api/admin/inbound-email/webhook
 */
export async function handleInboundEmailWebhook(req, res) {
  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid webhook payload: items array is required",
      });
    }

    const savedEmails = [];
    const errors = [];

    for (const item of items) {
      try {
        // MessageId 중복 체크
        const existing = await Mail.findOne({ messageId: item.MessageId });
        if (existing) {
          console.log(
            `[InboundEmail] Duplicate messageId skipped: ${item.MessageId}`,
          );
          continue;
        }

        // 이메일 저장 (기존 Mail 모델 사용)
        const email = new Mail({
          direction: "inbound",
          status: "received",
          messageId: item.MessageId,
          from: item.From.Address,
          to: item.To.map((t) => t.Address),
          cc: item.Cc ? item.Cc.map((c) => c.Address) : [],
          subject: item.Subject,
          bodyText: item.ExtractedMarkdownMessage || item.RawTextBody,
          bodyHtml: item.RawHtmlBody,
          folder: item.SpamScore > 5 ? "spam" : "inbox",
          isRead: false,
          receivedAt: new Date(item.SentAtDate),
          // Brevo 전용 메타데이터는 s3RawKey에 JSON으로 저장
          s3RawKey: JSON.stringify({
            uuid: item.Uuid,
            inReplyTo: item.InReplyTo,
            spamScore: item.SpamScore,
            extractedMarkdownSignature: item.ExtractedMarkdownSignature,
            headers: item.Headers,
            brevoAttachments: item.Attachments || [],
          }),
        });

        await email.save();
        savedEmails.push(email._id);

        console.log(
          `[InboundEmail] Saved email from ${item.From.Address}: ${item.Subject}`,
        );
      } catch (error) {
        console.error(
          `[InboundEmail] Error saving email ${item.MessageId}:`,
          error.message,
        );
        errors.push({
          messageId: item.MessageId,
          error: error.message,
        });
      }
    }

    res.json({
      success: true,
      message: `Processed ${items.length} emails`,
      data: {
        saved: savedEmails.length,
        errors: errors.length,
        savedIds: savedEmails,
        errors,
      },
    });
  } catch (error) {
    console.error("[InboundEmail] Webhook handler error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process inbound email webhook",
      error: error.message,
    });
  }
}

/**
 * 수신 메일 목록 조회
 * GET /api/admin/inbound-email
 */
export async function adminListInboundEmails(req, res) {
  try {
    const {
      folder = "inbox",
      isRead,
      page = 1,
      limit = 50,
      search,
    } = req.query;

    const query = {
      direction: "inbound",
      folder,
    };

    if (isRead !== undefined) {
      query.isRead = isRead === "true";
    }

    if (search) {
      query.$or = [
        { from: { $regex: search, $options: "i" } },
        { subject: { $regex: search, $options: "i" } },
        { bodyText: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [emails, total] = await Promise.all([
      Mail.find(query)
        .sort({ receivedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select(
          "messageId from to subject receivedAt isRead attachments createdAt s3RawKey",
        )
        .lean(),
      Mail.countDocuments(query),
    ]);

    // s3RawKey에서 Brevo 메타데이터 파싱
    const emailsWithMeta = emails.map((email) => {
      let brevoMeta = {};
      try {
        if (email.s3RawKey) {
          brevoMeta = JSON.parse(email.s3RawKey);
        }
      } catch (e) {
        // JSON 파싱 실패 시 무시
      }
      return {
        ...email,
        spamScore: brevoMeta.spamScore,
        brevoAttachments: brevoMeta.brevoAttachments || [],
      };
    });

    res.json({
      success: true,
      data: {
        emails: emailsWithMeta,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error("[InboundEmail] List error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to list inbound emails",
      error: error.message,
    });
  }
}

/**
 * 수신 메일 상세 조회
 * GET /api/admin/inbound-email/:id
 */
export async function adminGetInboundEmail(req, res) {
  try {
    const { id } = req.params;

    const email = await Mail.findById(id).lean();

    if (!email) {
      return res.status(404).json({
        success: false,
        message: "Email not found",
      });
    }

    // Brevo 메타데이터 파싱
    let brevoMeta = {};
    try {
      if (email.s3RawKey) {
        brevoMeta = JSON.parse(email.s3RawKey);
      }
    } catch (e) {
      // JSON 파싱 실패 시 무시
    }

    res.json({
      success: true,
      data: {
        ...email,
        ...brevoMeta,
      },
    });
  } catch (error) {
    console.error("[InboundEmail] Get error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get inbound email",
      error: error.message,
    });
  }
}

/**
 * 읽음 표시
 * PATCH /api/admin/inbound-email/:id/read
 */
export async function adminMarkInboundEmailAsRead(req, res) {
  try {
    const { id } = req.params;

    const email = await Mail.findByIdAndUpdate(
      id,
      { isRead: true, readAt: new Date() },
      { new: true },
    );

    if (!email) {
      return res.status(404).json({
        success: false,
        message: "Email not found",
      });
    }

    res.json({
      success: true,
      data: email,
    });
  } catch (error) {
    console.error("[InboundEmail] Mark as read error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to mark email as read",
      error: error.message,
    });
  }
}

/**
 * 읽지 않음 표시
 * PATCH /api/admin/inbound-email/:id/unread
 */
export async function adminMarkInboundEmailAsUnread(req, res) {
  try {
    const { id } = req.params;

    const email = await Mail.findByIdAndUpdate(
      id,
      { isRead: false, $unset: { readAt: "" } },
      { new: true },
    );

    if (!email) {
      return res.status(404).json({
        success: false,
        message: "Email not found",
      });
    }

    res.json({
      success: true,
      data: email,
    });
  } catch (error) {
    console.error("[InboundEmail] Mark as unread error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to mark email as unread",
      error: error.message,
    });
  }
}

/**
 * 스팸으로 이동
 * PATCH /api/admin/inbound-email/:id/spam
 */
export async function adminMoveInboundEmailToSpam(req, res) {
  try {
    const { id } = req.params;

    const email = await Mail.findByIdAndUpdate(
      id,
      { folder: "spam" },
      { new: true },
    );

    if (!email) {
      return res.status(404).json({
        success: false,
        message: "Email not found",
      });
    }

    res.json({
      success: true,
      data: email,
    });
  } catch (error) {
    console.error("[InboundEmail] Move to spam error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to move email to spam",
      error: error.message,
    });
  }
}

/**
 * 휴지통으로 이동
 * PATCH /api/admin/inbound-email/:id/trash
 */
export async function adminMoveInboundEmailToTrash(req, res) {
  try {
    const { id } = req.params;

    const email = await Mail.findByIdAndUpdate(
      id,
      { folder: "trash", trashedAt: new Date() },
      { new: true },
    );

    if (!email) {
      return res.status(404).json({
        success: false,
        message: "Email not found",
      });
    }

    res.json({
      success: true,
      data: email,
    });
  } catch (error) {
    console.error("[InboundEmail] Move to trash error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to move email to trash",
      error: error.message,
    });
  }
}

/**
 * 받은편지함으로 복원
 * PATCH /api/admin/inbound-email/:id/restore
 */
export async function adminRestoreInboundEmail(req, res) {
  try {
    const { id } = req.params;

    const email = await Mail.findByIdAndUpdate(
      id,
      { folder: "inbox", $unset: { trashedAt: "" } },
      { new: true },
    );

    if (!email) {
      return res.status(404).json({
        success: false,
        message: "Email not found",
      });
    }

    res.json({
      success: true,
      data: email,
    });
  } catch (error) {
    console.error("[InboundEmail] Restore error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to restore email",
      error: error.message,
    });
  }
}

/**
 * 메일 삭제
 * DELETE /api/admin/inbound-email/:id
 */
export async function adminDeleteInboundEmail(req, res) {
  try {
    const { id } = req.params;

    const email = await Mail.findByIdAndDelete(id);

    if (!email) {
      return res.status(404).json({
        success: false,
        message: "Email not found",
      });
    }

    res.json({
      success: true,
      message: "Email deleted successfully",
    });
  } catch (error) {
    console.error("[InboundEmail] Delete error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete email",
      error: error.message,
    });
  }
}

/**
 * 첨부파일 다운로드 URL 생성
 * GET /api/admin/inbound-email/:id/attachments/:downloadToken
 */
export async function adminGetInboundEmailAttachment(req, res) {
  try {
    const { id, downloadToken } = req.params;

    const email = await Mail.findById(id).lean();

    if (!email) {
      return res.status(404).json({
        success: false,
        message: "Email not found",
      });
    }

    // Brevo 메타데이터에서 첨부파일 정보 추출
    let brevoMeta = {};
    try {
      if (email.s3RawKey) {
        brevoMeta = JSON.parse(email.s3RawKey);
      }
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: "Invalid email metadata",
      });
    }

    const attachment = (brevoMeta.brevoAttachments || []).find(
      (a) => a.DownloadToken === downloadToken,
    );

    if (!attachment) {
      return res.status(404).json({
        success: false,
        message: "Attachment not found",
      });
    }

    // Brevo API를 통해 첨부파일 다운로드
    const BREVO_API_KEY = process.env.BREVO_API_KEY;
    if (!BREVO_API_KEY) {
      console.error("❌ BREVO_API_KEY 환경변수가 설정되지 않았습니다.");
      return res.status(500).json({
        success: false,
        message: "Brevo API key not configured",
      });
    }

    const brevoResponse = await axios.get(
      `https://api.brevo.com/v3/inbound/attachments/${downloadToken}`,
      {
        headers: {
          "api-key": BREVO_API_KEY,
        },
        responseType: "arraybuffer",
      },
    );

    res.set({
      "Content-Type": attachment.ContentType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(attachment.Name)}"`,
      "Content-Length": attachment.ContentLength,
    });

    res.send(brevoResponse.data);
  } catch (error) {
    console.error("[InboundEmail] Download attachment error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to download attachment",
      error: error.message,
    });
  }
}

/**
 * 폴더별 미읽음 개수 조회
 * GET /api/admin/inbound-email/stats/unread
 */
export async function adminGetInboundEmailStats(req, res) {
  try {
    const baseQuery = { direction: "inbound" };

    const [inbox, spam, trash] = await Promise.all([
      Mail.countDocuments({ ...baseQuery, folder: "inbox", isRead: false }),
      Mail.countDocuments({ ...baseQuery, folder: "spam", isRead: false }),
      Mail.countDocuments({ ...baseQuery, folder: "trash", isRead: false }),
    ]);

    res.json({
      success: true,
      data: {
        inbox,
        spam,
        trash,
        total: inbox + spam + trash,
      },
    });
  } catch (error) {
    console.error("[InboundEmail] Stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get email stats",
      error: error.message,
    });
  }
}

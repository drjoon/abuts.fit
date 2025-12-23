import Mail from "../models/mail.model.js";

export async function receiveInboundMail(req, res) {
  try {
    const {
      from,
      to = [],
      cc = [],
      bcc = [],
      subject,
      bodyText,
      bodyHtml,
      attachments = [],
      s3RawKey,
      receivedAt,
      messageId,
      secret,
    } = req.body || {};

    const expectedSecret = process.env.MAIL_WEBHOOK_SECRET;
    if (expectedSecret && secret !== expectedSecret) {
      return res.status(401).json({ success: false, message: "unauthorized" });
    }

    const mail = await Mail.create({
      direction: "inbound",
      status: "received",
      from,
      to,
      cc,
      bcc,
      subject,
      bodyText,
      bodyHtml,
      attachments,
      s3RawKey,
      messageId,
      receivedAt: receivedAt ? new Date(receivedAt) : new Date(),
    });

    return res.status(200).json({ success: true, data: mail });
  } catch (error) {
    console.error("[receiveInboundMail] failed", error);
    return res
      .status(500)
      .json({ success: false, message: "failed to record mail" });
  }
}

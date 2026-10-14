// related files:
// - web/frontend/src/pages/admin/support/mail/AdminMailDetailPanel.tsx
import { useMemo } from "react";
import type { MailItem } from "@/features/admin/mail/mailApi";

const HTML_TAG_RE = /<\/?(?:br|p|div|table|tr|td|th|html|body|span|a|img|ul|ol|li|h[1-6])\b/i;

function buildMailSrcDoc(html: string): string {
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><base target="_blank"><style>
body{margin:0;padding:0.25rem 0;font:14px/1.55 ui-sans-serif,system-ui,sans-serif;color:#111;word-break:break-word;}
img{max-width:100%;height:auto;}
table{max-width:100%;border-collapse:collapse;}
a{color:#2563eb;}
</style></head><body>${html}</body></html>`;
}

function resolveMailBodyHtml(mail: MailItem): string | null {
  const html = mail.bodyHtml?.trim();
  if (html) return html;
  const text = mail.bodyText?.trim();
  if (text && HTML_TAG_RE.test(text)) return text;
  return null;
}

function resolveMailBodyPlain(mail: MailItem): string | null {
  const text = mail.bodyText?.trim();
  if (text) return text;
  return null;
}

type Props = {
  mail: MailItem;
};

export const MailMessageBody = ({ mail }: Props) => {
  const html = useMemo(() => resolveMailBodyHtml(mail), [mail]);
  const plain = useMemo(() => (html ? null : resolveMailBodyPlain(mail)), [mail, html]);
  const srcDoc = useMemo(() => (html ? buildMailSrcDoc(html) : null), [html]);

  if (srcDoc) {
    return (
      <iframe
        title="메일 본문"
        sandbox=""
        srcDoc={srcDoc}
        className="w-full min-h-[280px] border-0 bg-transparent"
      />
    );
  }

  if (plain) {
    return (
      <div className="prose prose-sm max-w-none whitespace-pre-wrap pr-3 text-sm">
        {plain}
      </div>
    );
  }

  return (
    <div className="text-sm text-muted-foreground pr-3">(본문 없음)</div>
  );
};

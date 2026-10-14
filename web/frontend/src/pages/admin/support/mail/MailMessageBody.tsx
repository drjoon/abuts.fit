// related files:
// - web/frontend/src/pages/admin/support/mail/AdminMailDetailPanel.tsx
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MailItem } from "@/features/admin/mail/mailApi";
import { cn } from "@/shared/ui/cn";

const HTML_TAG_RE = /<\/?(?:br|p|div|table|tr|td|th|html|body|span|a|img|ul|ol|li|h[1-6])\b/i;

function buildMailSrcDoc(html: string): string {
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>
html,body{margin:0;padding:0.25rem 0;overflow-x:hidden;max-width:100%;}
body{font:14px/1.55 ui-sans-serif,system-ui,sans-serif;color:#111;word-break:break-word;}
*,*::before,*::after{box-sizing:border-box;max-width:100%;}
img{max-width:100%!important;height:auto!important;}
table{width:100%!important;max-width:100%!important;border-collapse:collapse;table-layout:fixed;}
td,th{word-break:break-word;}
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

function readIframeContentHeight(iframe: HTMLIFrameElement): number {
  try {
    const doc = iframe.contentDocument;
    if (!doc) return 0;
    return Math.max(
      doc.documentElement?.scrollHeight ?? 0,
      doc.body?.scrollHeight ?? 0,
    );
  } catch {
    return 0;
  }
}

function MailHtmlFrame({
  srcDoc,
  fillHeight,
}: {
  srcDoc: string;
  fillHeight: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [heightPx, setHeightPx] = useState(fillHeight ? 480 : 280);

  const measure = useCallback(() => {
    const iframe = iframeRef.current;
    const root = rootRef.current;
    if (!iframe) return;

    const contentH = readIframeContentHeight(iframe);
    let viewportH = 0;
    if (fillHeight && root) {
      const viewport = root.closest(
        "[data-radix-scroll-area-viewport]",
      ) as HTMLElement | null;
      viewportH = viewport?.clientHeight ?? 0;
    }

    const next = fillHeight
      ? Math.max(viewportH, contentH, 320)
      : Math.max(contentH, 280);
    setHeightPx(next);
  }, [fillHeight]);

  useLayoutEffect(() => {
    measure();
  }, [measure, srcDoc]);

  useLayoutEffect(() => {
    if (!fillHeight || !rootRef.current) return;
    const viewport = rootRef.current.closest(
      "[data-radix-scroll-area-viewport]",
    ) as HTMLElement | null;
    if (!viewport) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(viewport);
    return () => ro.disconnect();
  }, [fillHeight, measure, srcDoc]);

  return (
    <div ref={rootRef} className="w-full min-w-0">
      <iframe
        ref={iframeRef}
        title="메일 본문"
        sandbox=""
        srcDoc={srcDoc}
        onLoad={measure}
        className="block w-full max-w-full border-0 bg-transparent"
        style={{ height: heightPx }}
      />
    </div>
  );
}

type Props = {
  mail: MailItem;
  /** 본문 영역이 카드 높이를 채울 때 iframe 최소 높이 = 스크롤 뷰포트 */
  fillHeight?: boolean;
};

export const MailMessageBody = ({ mail, fillHeight = false }: Props) => {
  const html = useMemo(() => resolveMailBodyHtml(mail), [mail]);
  const plain = useMemo(() => (html ? null : resolveMailBodyPlain(mail)), [mail, html]);
  const srcDoc = useMemo(() => (html ? buildMailSrcDoc(html) : null), [html]);

  if (srcDoc) {
    return <MailHtmlFrame srcDoc={srcDoc} fillHeight={fillHeight} />;
  }

  if (plain) {
    return (
      <div
        className={cn(
          "prose prose-sm max-w-none whitespace-pre-wrap pr-3 text-sm",
          fillHeight && "min-h-full",
        )}
      >
        {plain}
      </div>
    );
  }

  return (
    <div className="text-sm text-muted-foreground pr-3">(본문 없음)</div>
  );
};

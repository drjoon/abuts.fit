// related files:
// - web/frontend/src/pages/admin/support/mail/AdminMailComposePanel.tsx
import { useCallback, useLayoutEffect, useRef } from "react";
import { cn } from "@/shared/ui/cn";
import { htmlToPlainText, sanitizeMailHtml } from "./mailHtml.util";

type Props = {
  value: string;
  onChange: (html: string) => void;
  className?: string;
  placeholder?: string;
};

export const MailComposeHtmlEditor = ({
  value,
  onChange,
  className,
  placeholder = "본문을 입력하거나 HTML·표가 포함된 내용을 붙여 넣으세요.",
}: Props) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastValueRef = useRef(value);

  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (value !== lastValueRef.current) {
      el.innerHTML = value || "";
      lastValueRef.current = value;
    }
  }, [value]);

  const syncFromDom = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const html = el.innerHTML;
    lastValueRef.current = html;
    onChange(html);
  }, [onChange]);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      const clip = e.clipboardData;
      const html = clip.getData("text/html");
      const text = clip.getData("text/plain");
      const toInsert = html
        ? sanitizeMailHtml(html)
        : text.replace(/\n/g, "<br>");

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) {
        const el = editorRef.current;
        if (el) {
          el.insertAdjacentHTML("beforeend", toInsert);
          syncFromDom();
        }
        return;
      }

      sel.deleteFromDocument();
      const range = sel.getRangeAt(0);
      range.collapse(false);
      const fragment = range.createContextualFragment(toInsert);
      range.insertNode(fragment);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      syncFromDom();
    },
    [syncFromDom],
  );

  const isEmpty = !htmlToPlainText(value);

  return (
    <div className="relative">
      {isEmpty ? (
        <div
          aria-hidden
          className="pointer-events-none absolute left-3 top-2.5 text-sm text-muted-foreground"
        >
          {placeholder}
        </div>
      ) : null}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline
        aria-label="메일 본문"
        onInput={syncFromDom}
        onPaste={handlePaste}
        className={cn(
          "min-h-[16rem] w-full max-w-full overflow-x-auto rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "[&_table]:my-2 [&_table]:w-full [&_table]:max-w-full [&_table]:border-collapse [&_table]:table-fixed",
          "[&_td]:border [&_td]:border-border [&_td]:p-1.5 [&_td]:align-top [&_td]:break-words",
          "[&_th]:border [&_th]:border-border [&_th]:bg-muted/50 [&_th]:p-1.5 [&_th]:text-left [&_th]:break-words",
          "[&_img]:max-w-full [&_img]:h-auto",
          "[&_a]:text-primary [&_a]:underline",
          className,
        )}
      />
    </div>
  );
};

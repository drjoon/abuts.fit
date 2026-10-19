export function escapeHtmlText(text: string): string {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const BLOCKED_TAGS = new Set([
  "script",
  "iframe",
  "object",
  "embed",
  "meta",
  "link",
  "base",
]);

export function sanitizeMailHtml(html: string): string {
  const raw = String(html || "").trim();
  if (!raw) return "";
  try {
    const doc = new DOMParser().parseFromString(raw, "text/html");
    doc.querySelectorAll("*").forEach((el) => {
      const tag = el.tagName.toLowerCase();
      if (BLOCKED_TAGS.has(tag)) {
        el.remove();
        return;
      }
      [...el.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        if (name.startsWith("on") || name === "srcdoc") {
          el.removeAttribute(attr.name);
        }
      });
    });
    return doc.body.innerHTML;
  } catch {
    return raw;
  }
}

export function htmlToPlainText(html: string): string {
  const sanitized = sanitizeMailHtml(html);
  if (!sanitized) return "";
  try {
    const withBreaks = sanitized
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/tr>/gi, "\n")
      .replace(/<\/h[1-6]>/gi, "\n");
    const doc = new DOMParser().parseFromString(withBreaks, "text/html");
    return (doc.body.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } catch {
    return sanitized.replace(/<[^>]+>/g, " ").trim();
  }
}

export function hasHtmlLineStructure(html: string): boolean {
  return /<(br|p|div|li|tr|h[1-6]|table)\b/i.test(html);
}

/** 클립보드 HTML이 줄바꿈을 잃었을 때 plain 텍스트 줄바꿈을 살린다. */
export function resolvePasteHtml(html: string, plain: string): string {
  const trimmedPlain = String(plain || "");
  const trimmedHtml = String(html || "").trim();
  const plainLineCount = trimmedPlain.split(/\r?\n/).length;

  if (!trimmedHtml) {
    return plainTextToMailHtml(trimmedPlain);
  }

  const sanitized = sanitizeMailHtml(trimmedHtml);
  if (!sanitized) {
    return plainTextToMailHtml(trimmedPlain);
  }

  if (plainLineCount > 1 && !hasHtmlLineStructure(sanitized)) {
    return plainTextToMailHtml(trimmedPlain);
  }

  if (plainLineCount > 1) {
    const htmlBreakHints =
      (sanitized.match(/<br\s*\/?>/gi) || []).length +
      (sanitized.match(/<\/p>/gi) || []).length +
      (sanitized.match(/<\/div>/gi) || []).length;
    if (htmlBreakHints < plainLineCount - 1) {
      return plainTextToMailHtml(trimmedPlain);
    }
  }

  return sanitized;
}

export function plainTextToMailHtml(plain: string): string {
  const lines = String(plain || "").split(/\r?\n/);
  return lines
    .map((line) => {
      const escaped = escapeHtmlText(line);
      return `<p>${escaped || "<br>"}</p>`;
    })
    .join("");
}

export function resolveInitialComposeHtml(draft?: {
  bodyHtml?: string;
  body?: string;
}): string {
  const html = draft?.bodyHtml?.trim();
  if (html) return sanitizeMailHtml(html);
  const plain = draft?.body?.trim();
  if (plain) return plainTextToMailHtml(plain);
  return "";
}

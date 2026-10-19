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
    const doc = new DOMParser().parseFromString(sanitized, "text/html");
    return (doc.body.textContent || "").replace(/\u00a0/g, " ").trim();
  } catch {
    return sanitized.replace(/<[^>]+>/g, " ").trim();
  }
}

export function plainTextToMailHtml(plain: string): string {
  const lines = String(plain || "").split("\n");
  return lines
    .map((line) => {
      const escaped = line
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return escaped || "<br>";
    })
    .join("<br>");
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

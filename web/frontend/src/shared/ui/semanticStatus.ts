// change-log:
// - 2026-08-11: Semantic color SSOT — Primary / Attention / Danger / Neutral (+ Service elsewhere).
// related files:
// - web/frontend/src/index.css
// - web/frontend/tailwind.config.ts
// - web/frontend/src/shared/shipping/shippingMode.ts
// - web/frontend/src/shared/ui/gigongAbutAccent.ts
// - web/frontend/rules.md

/** Soft outline badge surfaces (border + tint bg + strong text). */
export const SEMANTIC_BADGE = {
  primarySoft:
    "bg-primary-soft text-primary-strong border border-primary-muted",
  primary:
    "bg-primary-muted/60 text-primary-strong border border-primary/40",
  primaryStrong:
    "bg-primary text-primary-foreground border border-primary",
  attentionSoft:
    "bg-accent-soft text-accent-strong border border-accent-muted",
  attention:
    "bg-accent-muted/70 text-accent-strong border border-accent/50",
  attentionStrong:
    "bg-accent text-accent-foreground border border-accent",
  dangerSoft:
    "bg-destructive-soft text-destructive border border-destructive-muted",
  danger:
    "bg-destructive text-destructive-foreground border border-destructive",
  neutral:
    "bg-secondary text-secondary-foreground border border-border",
  neutralOutline: "bg-transparent text-foreground border border-border",
} as const;

/** Card / row tint + ring for attention callouts (e.g. incomplete machining). */
export const SEMANTIC_CALLOUT = {
  attention:
    "border-accent-muted ring-2 ring-accent-muted/80 bg-accent-soft/60",
  attentionBorder:
    "border border-accent-muted bg-accent-soft/50",
  attentionSolid:
    "bg-accent text-accent-foreground hover:bg-accent-strong",
  primaryBorder: "border border-primary-muted bg-primary-soft",
  primaryText: "text-primary-strong",
  dangerSolid:
    "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  neutralDisabled: "bg-secondary text-muted-foreground",
  successText: "text-primary-strong",
} as const;

export type StageBadgeStyle = {
  variant: "outline" | "default" | "secondary" | "destructive";
  extra?: string;
};

/**
 * Manufacturer stage → badge style.
 * Active process steps share Primary (brightness only); passive → Neutral; cancel → Danger.
 */
export const STAGE_BADGE_STYLES: Record<string, StageBadgeStyle> = {
  의뢰: { variant: "outline" },
  준비: { variant: "outline" },
  CAM: { variant: "default" },
  가공: { variant: "default" },
  생산: { variant: "default" },
  "세척.패킹": {
    variant: "default",
    extra: SEMANTIC_BADGE.primarySoft,
  },
  "포장.발송": {
    variant: "default",
    extra: SEMANTIC_BADGE.primary,
  },
  추적관리: { variant: "secondary" },
  취소: { variant: "destructive" },
};

export function getStageBadgeStyle(label: string): StageBadgeStyle {
  return STAGE_BADGE_STYLES[label] || { variant: "outline" };
}

/** Product mode badges — both Primary; design+production is softer. */
export const PRODUCT_MODE_BADGE_CLASS = {
  design_custom_abutment: SEMANTIC_BADGE.primarySoft,
  custom_abutment: SEMANTIC_BADGE.primary,
} as const;

export function getProductModeBadgeClassName(mode: string): string {
  if (mode === "design_custom_abutment") {
    return PRODUCT_MODE_BADGE_CLASS.design_custom_abutment;
  }
  if (mode === "custom_abutment") {
    return PRODUCT_MODE_BADGE_CLASS.custom_abutment;
  }
  return SEMANTIC_BADGE.neutral;
}

/** Review approve/reject/pending. */
export function getReviewBadgeClassName(status?: string): string {
  const s = String(status || "").trim();
  const base = "text-[11px] px-2 py-0.5";
  if (s === "APPROVED") {
    return `${base} ${SEMANTIC_BADGE.primarySoft}`;
  }
  if (s === "REJECTED") {
    return `${base} ${SEMANTIC_BADGE.dangerSoft}`;
  }
  return `${base} ${SEMANTIC_BADGE.neutral}`;
}

/** Deadline urgency: ok → primary; warn mid → attention soft; near → attention; overdue → danger. */
export function getDeadlineSemanticClasses(hoursRemaining: number): {
  border: string;
  badge: string;
} {
  if (hoursRemaining > 48) {
    return {
      border: "border-primary border-2",
      badge: SEMANTIC_BADGE.primarySoft,
    };
  }
  if (hoursRemaining > 24) {
    return {
      border: "border-accent-muted border-2",
      badge: SEMANTIC_BADGE.attentionSoft,
    };
  }
  if (hoursRemaining > 0) {
    return {
      border: "border-accent border-2",
      badge: SEMANTIC_BADGE.attention,
    };
  }
  return {
    border: "border-destructive border-2",
    badge: SEMANTIC_BADGE.dangerSoft,
  };
}

/** CNC / machine status dots. */
export function getMachineStatusDotClass(
  level: "ok" | "warn" | "alarm" | "idle" | "unknown",
): string {
  switch (level) {
    case "alarm":
      return "bg-destructive";
    case "warn":
      return "bg-accent";
    case "ok":
      return "bg-primary";
    case "idle":
      return "bg-muted-foreground/50";
    default:
      return "bg-muted-foreground/30";
  }
}

/**
 * Chat / admin role badges — fold into 4 axes (no green/purple).
 * requestor→primary, manufacturer→attention, salesman→primary soft, admin→neutral, guest→neutral.
 */
export function getRoleBadgeClassName(role: string): string {
  switch (String(role || "").toLowerCase()) {
    case "requestor":
    case "clinic":
    case "practice":
    case "lab":
      return SEMANTIC_BADGE.primarySoft;
    case "manufacturer":
      return SEMANTIC_BADGE.attentionSoft;
    case "salesman":
    case "devops":
      return SEMANTIC_BADGE.primary;
    case "admin":
      return SEMANTIC_BADGE.neutral;
    default:
      return SEMANTIC_BADGE.neutral;
  }
}

export function getOnlineDotClass(isOnline: boolean): string {
  return isOnline ? "bg-primary" : "bg-muted-foreground/40";
}

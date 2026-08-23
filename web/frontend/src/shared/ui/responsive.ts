/**
 * Shared responsive Tailwind class fragments (mobile-first SSOT).
 * Prefer these over one-off fixed pixel widths in pages and dialogs.
 */
export const RESPONSIVE = {
  /** Standard dialog — full width on phone, capped on sm+ */
  dialogContent:
    "w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] sm:w-full sm:max-w-lg",
  dialogContentMd:
    "w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] sm:w-full sm:max-w-xl",
  dialogContentWide:
    "w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] sm:w-full sm:max-w-2xl lg:max-w-4xl",
  dialogContentFull:
    "w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] sm:w-[96vw] sm:max-w-[96vw]",

  /** Fixed-width modal replacements */
  modalMd: "w-[min(560px,calc(100vw-2rem))] max-w-[calc(100vw-2rem)]",
  modalLg: "w-[min(640px,calc(100vw-2rem))] max-w-[calc(100vw-2rem)]",

  /** Page split layouts — stack until xl when left pane needs ~34rem */
  pageSplitWideLeft:
    "grid grid-cols-1 xl:grid-cols-[minmax(34rem,1.2fr)_minmax(0,1fr)] gap-3",
  pageSplitBalanced:
    "grid grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-3",

  /** Scrollable data table shell */
  tableShell: "w-full min-w-0 overflow-x-auto",
  tableMinWide: "w-full min-w-[560px]",
  tableMinExtraWide: "w-full min-w-[920px]",
  /** Auth / onboarding card horizontal padding */
  authCardPadding: "px-4 sm:px-6 md:px-8",
  authPageMain:
    "relative z-10 mx-auto flex min-h-screen w-full flex-col justify-center gap-8 px-4 py-10 sm:gap-12 sm:px-6 sm:py-16",
  authFormWidth: "mx-auto w-full max-w-md sm:max-w-lg lg:mx-0 lg:max-w-none",
} as const;
